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
    id: u32,           // Unique node identifier
    pass_id: u32,      // Graph coloring for parallel updates
    position: vec2f,   // Current 2D position
    tail: u32,         // ID of previous node in chain (or INVALID_NODE)
    head: u32,         // ID of next node in chain (or INVALID_NODE)
}
```

### Graph Coloring for Parallel Safety

**Problem**: Updating connected nodes in parallel can cause race conditions where one node reads stale data from its neighbor.

**Solution**: Graph coloring assigns alternating `pass_id` values (0, 1, 0, 1...) along each chain. The simulation runs multiple passes per frame:
- **Pass 0**: Update all nodes with `pass_id == 0`
- **Pass 1**: Update all nodes with `pass_id == 1`

This ensures nodes read converged data from their neighbors since neighboring nodes are never updated in the same pass.

### Spring Force Calculation

For each node, spring forces are computed from connections to `tail` and `head` neighbors:

```wgsl
let delta = neighbor.position - position;
let distance = length(delta);
let spring_force = SPRING_CONSTANT * (distance - REST_LENGTH);
force += spring_force * (delta / distance);
```

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
- Simplification of polymer physics
- Discrete beads connected by springs
- Captures entropic elasticity of polymers
- Widely used in biophysics for DNA/protein modeling

**Graph Coloring for Parallel Updates**:
- Classic technique from parallel computing
- Assigns colors to nodes such that no two adjacent nodes share a color
- Enables safe parallel updates without race conditions
- In 1D chains, only 2 colors needed (alternating pattern)

**Further Reading**:
- [Polymer Physics by Rubinstein & Colby](https://global.oup.com/academic/product/polymer-physics-9780198520597)
- [Graph Coloring and Parallel Computing](https://en.wikipedia.org/wiki/Graph_coloring)
- [Molecular Dynamics Simulations](https://en.wikipedia.org/wiki/Molecular_dynamics)
