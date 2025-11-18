# Wormlike Chain Example

GPU-accelerated simulation of polymer chains using a wormlike chain model with interactive forces.

## Features

### Polymer Chain Simulation
- **Multiple chains**: 5 independent polymer chains with 20 nodes each
- **Spring forces**: Nodes connected by spring bonds maintain chain structure
- **Damping**: Realistic energy dissipation prevents instability
- **Graph coloring**: Parallel-safe updates using alternating pass IDs

### Interactive Manipulation
- **Mouse/touch**: Click and drag to apply repulsive forces to chains
- **Toroidal topology**: Chains wrap around edges seamlessly

### Physics Model
- **Wormlike chain**: Simplified polymer model with discrete beads and springs
- **Spring constant**: Configurable stiffness between connected nodes
- **Rest length**: Natural distance between bonded nodes
- **Collision-free**: Graph coloring ensures safe parallel updates

## Implementation Details

### Node Structure

Each node in the chain contains:
```wgsl
struct Node {
    id: u32,               // Unique node identifier
    pass_id: u32,          // Graph coloring for parallel updates
    position: vec2<f32>,   // Current 2D position
    orientation: vec2<f32>, // Tangent vector (unit direction)
    tail: u32,             // ID of previous node in chain (or self.id if none)
    head: u32,             // ID of next node in chain (or self.id if none)
}
```

**Note**: Disconnected nodes are identified by `tail == id && head == id`. This convention avoids needing a special sentinel value.

### Graph Coloring for Parallel Safety

**Problem**: Updating connected nodes in parallel can cause race conditions where one node reads stale data from its neighbor.

**Solution**: Graph coloring assigns alternating `pass_id` values (0, 1, 0, 1...) along each chain. The simulation runs multiple passes per frame:
- **Pass 0**: Update all nodes with `pass_id == 0`
- **Pass 1**: Update all nodes with `pass_id == 1`

This ensures nodes read converged data from their neighbors since neighboring nodes are never updated in the same pass.

### Line Constraint Update

The simulation uses a **constraint projection method** to maintain distances between consecutive nodes, similar to the SHAKE algorithm in molecular dynamics.

#### Mathematical Formulation

For node $i$ at position $\mathbf{x}_i$ with orientation (tangent) $\mathbf{t}_i$, connected to:
- Tail node: position $\mathbf{x}_{i-1}$, orientation $\mathbf{t}_{i-1}$
- Head node: position $\mathbf{x}_{i+1}$, orientation $\mathbf{t}_{i+1}$

The **constraint** is that consecutive nodes should be separated by distance $\ell$ (controlled by `line_distance`).

#### Displacement Calculation

The displacement needed to satisfy the constraint with the tail neighbor:

$$\Delta\mathbf{x}_{\text{tail}} = \mathbf{x}_{i-1} - \mathbf{x}_i + \ell \cdot \frac{\mathbf{t}_i + \mathbf{t}_{i-1}}{2}$$

The displacement needed to satisfy the constraint with the head neighbor:

$$\Delta\mathbf{x}_{\text{head}} = \mathbf{x}_{i+1} - \mathbf{x}_i - \ell \cdot \frac{\mathbf{t}_i + \mathbf{t}_{i+1}}{2}$$

**Key insight**: The offset $\pm \ell \cdot \frac{\mathbf{t}_i + \mathbf{t}_{j}}{2}$ accounts for the fact that the ideal connection point is along the average orientation of the two nodes, not just the displacement vector.

#### Position Update

The net displacement combines both constraints:

$$\Delta\mathbf{x}_{\text{net}} = \Delta\mathbf{x}_{\text{head}} + \Delta\mathbf{x}_{\text{tail}}$$

The position is updated using a **damped projection** (factor of 0.5 for stability):

$$\mathbf{x}_i^{\text{new}} = \mathbf{x}_i + 0.5 \cdot \Delta\mathbf{x}_{\text{net}}$$

#### Boundary Conditions

- **Internal nodes**: Both displacements contribute
- **Head endpoint**: Only $\Delta\mathbf{x}_{\text{tail}}$ contributes (no head neighbor)
- **Tail endpoint**: Only $\Delta\mathbf{x}_{\text{head}}$ contributes (no tail neighbor)
- **Disconnected nodes**: No update (identified by `is_disconnected()`)

#### Implementation

```wgsl
fn line_constraint_update(idx: u32, nodes: ptr<storage, array<Node>, read_write>) {
  let node = nodes[idx];

  if (node.pass_id != canvas.pass_id || is_disconnected(node) || idx >= arrayLength(nodes)) {
    return;
  }

  let tail = nodes[node.tail];
  let head = nodes[node.head];

  let tail_displacement = tail.position - node.position
    + controls.line_distance * (node.orientation + tail.orientation) / 2;
  let head_displacement = head.position - node.position
    - controls.line_distance * (node.orientation + head.orientation) / 2;

  let net_displacement = f32(has_head(node)) * head_displacement
    + f32(has_tail(node)) * tail_displacement;
  let position = node.position + 0.5 * net_displacement;

  nodes[idx].position = position;
}
```

### Curvature Update

The **bending stiffness** is enforced through torques that resist angular deviation from an equilibrium angle.

#### Mathematical Formulation

For node $i$ with orientation $\mathbf{t}_i$, the relative angles to neighbors are:

$$\theta_{\text{tail}} = \angle(\mathbf{t}_{i-1}, \mathbf{t}_i) - \theta_{\text{eq}}$$
$$\theta_{\text{head}} = \angle(\mathbf{t}_i, \mathbf{t}_{i+1}) - \theta_{\text{eq}}$$

where $\theta_{\text{eq}}$ is the equilibrium angle (spatially varying via `parameters_texture`).

#### Torque and Orientation Update

The net torque is:

$$\tau_{\text{net}} = \theta_{\text{head}} - \theta_{\text{tail}}$$

The orientation is updated by rotation:

$$\mathbf{t}_i^{\text{new}} = \mathcal{R}(k \cdot \tau_{\text{net}}) \mathbf{t}_i$$

where $k$ is the bending stiffness parameter and $\mathcal{R}(\alpha)$ is a 2D rotation by angle $\alpha$:

$$\mathcal{R}(\alpha) = \begin{pmatrix} \cos\alpha & -\sin\alpha \\ \sin\alpha & \cos\alpha \end{pmatrix}$$

#### Spatial Modulation via Blur

The equilibrium angle $\theta_{\text{eq}}(\mathbf{x}_i)$ is read from a **blurred parameter texture**:

1. User interactions paint values into `parameters_texture` layer 0
2. A **separable Gaussian blur** (5-pixel radius) smooths the field:
   - Horizontal pass: layer 0 → layer 1
   - Vertical pass: layer 1 → layer 0
3. The curvature update reads the blurred value at each node's position

This creates smooth spatial gradients in bending stiffness, allowing interactive control over local chain flexibility.

### Storage Buffer Usage

Unlike texture-based examples, this simulation uses a **storage buffer** (`var<storage, read_write>`) for node data:
- **Dynamic size**: Number of nodes determined at runtime
- **Structured data**: Direct access to Node struct fields
- **Efficient for sparse data**: No need for 2D texture layout
- **Per-node dispatch**: Compute shader dispatches over node count, not texture dimensions

### Rendering

The fragment shader renders chains by:
1. **Drawing bonds**: Distance from pixel to line segments between connected nodes
2. **Drawing nodes**: Circular beads at node positions
3. **Color coding**: Each pass_id gets a distinct color via HSV color mapping

## Building and Running

```bash
# Build
npm run build -- --env example=wormlike-chain

# Development server (hot-reload)
npm start -- --env example=wormlike-chain

# Test with capture tool (after building)
npm run capture
```

## Files

```
wormlike-chain/
├── index.ts                    # Main entry point with chain initialization
├── README.md                   # This file
└── shaders/
    ├── compute.wgsl            # Physics simulation kernel
    ├── render.wgsl             # Chain rendering with bond/node visualization
    └── includes/
        ├── bindings.wgsl       # Binding indices for buffers
        ├── nodes.wgsl          # Node structure and storage buffer
        └── interactions.wgsl   # Canvas and interaction structs
```

## Customization Ideas

1. **Bending stiffness**: Add angle-dependent forces between three consecutive nodes
2. **Self-avoidance**: Add repulsive forces between non-bonded nodes
3. **Variable rest length**: Different bond lengths for structural variation
4. **Entanglement detection**: Visualize when chains cross or tangle
5. **Multiple polymer types**: Mix rigid and flexible chains
6. **External fields**: Add flow fields or gravitational forces
7. **3D extension**: Extend to volumetric simulation with 3D storage buffer

## Theory & References

**Wormlike Chain Model**:
- Simplification of polymer physics with discrete beads
- Captures entropic elasticity and bending rigidity of polymers
- Widely used in biophysics for DNA/protein modeling
- This implementation uses constraint-based dynamics rather than forces

**Constraint-Based Dynamics**:
- **SHAKE algorithm**: Maintains distance constraints through iterative projection
- **Advantages**: Exact constraint satisfaction, no stiff equations
- **This implementation**: Single-pass constraint projection with orientation-aware offsets
- Damping factor (0.5) ensures stability without multiple iterations

**Graph Coloring for Parallel Updates**:
- Classic technique from parallel computing
- Assigns colors to nodes such that no two adjacent nodes share a color
- Enables safe parallel updates without race conditions
- In 1D chains, only 2 colors needed (alternating pattern)

**Spatial Parameter Fields**:
- Interactive control through blurred texture fields
- Gaussian blur creates smooth spatial gradients
- Allows spatially-varying physical properties (equilibrium angles, stiffness)
- Common in physics simulations (reaction-diffusion, pattern formation)

**Further Reading**:
- [SHAKE Algorithm (Ryckaert et al. 1977)](https://doi.org/10.1016/0021-9991(77)90098-5) - Original constraint dynamics paper
- [Polymer Physics by Rubinstein & Colby](https://global.oup.com/academic/product/polymer-physics-9780198520597) - Comprehensive polymer theory
- [Constraint Dynamics in Molecular Simulation](https://en.wikipedia.org/wiki/Constraint_(computational_chemistry)) - Overview of constraint methods
- [Graph Coloring and Parallel Computing](https://en.wikipedia.org/wiki/Graph_coloring) - Parallel algorithm design
