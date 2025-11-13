# Stable Fluids Example

GPU-accelerated 2D fluid simulation based on Jos Stam's "Stable Fluids" algorithm with interactive dye painting.

## Features

### Physically-Based Fluid Simulation
- **Navier-Stokes equations**: Simulates incompressible fluid flow
- **Velocity advection**: Fluid motion carried by its own velocity
- **Viscous diffusion**: Natural dissipation of velocity over time
- **Pressure projection**: Enforces incompressibility (divergence-free flow)
- **Dye advection**: Colorful particles carried by fluid motion

### Interactive Painting
- **Mouse/touch**: Click and drag to add forces and colored dye
- **Rainbow colors**: Dye color determined by interaction position
- **Force direction**: Fluid pushed away from interaction point
- **Smooth dissipation**: Dye gradually fades creating trailing effects

### Toroidal Topology
The simulation wraps around edges (like Pac-Man):
- Fluid flows seamlessly from one edge to the opposite
- No boundary conditions to worry about
- Creates continuous, infinite-feeling space

## Implementation Details

### Multi-Pass Algorithm

The simulation runs 7 compute passes per frame:

**1. Apply Forces** (`apply_forces`):
- Detects mouse/touch interaction
- Adds velocity force pushing fluid away from cursor
- Injects rainbow-colored dye at interaction point
- Prevents singularity at interaction center (dir_length > 0.1 check)
- Handles NaN gracefully when no interaction is active

**2. Advect Velocity** (`advect_velocity`):
- Moves velocity field along itself (self-advection)
- Uses bilinear interpolation for smooth motion
- Implements semi-Lagrangian method (backward tracing)

**3. Diffuse Velocity** (`diffuse_velocity`):
- Applies viscosity to smooth out sharp velocity gradients
- Jacobi iteration for implicit diffusion solve
- Configurable viscosity constant

**4. Compute Divergence** (`compute_divergence`):
- Calculates divergence of velocity field
- Divergence measures "compressibility"
- Should be zero for incompressible fluids

**5. Solve Pressure** (`solve_pressure`):
- Iteratively solves Poisson equation for pressure
- 20 Jacobi iterations for convergence
- Pressure forces will counteract divergence

**6. Subtract Gradient** (`subtract_gradient`):
- Subtracts pressure gradient from velocity
- Makes velocity field divergence-free (incompressible)
- This is the "projection" step that enforces physics

**7. Advect Dye** (`advect_dye`):
- Moves dye along velocity field
- Same semi-Lagrangian method as velocity
- Includes gradual fade (0.995 multiplier per frame)

### Key Constants

```wgsl
const VISCOSITY = 0.0001;    // Fluid thickness (lower = thinner/faster)
const DIFFUSION = 0.0001;    // Dye diffusion rate
const DT = 0.016;            // Time step (~60 FPS)
```

### Texture Usage

All textures use `texture_storage_2d_array<r32float, read_write>` format due to WebGPU constraints:

- **velocity** (2 layers): Vector field with x-component in layer 0, y-component in layer 1
- **pressure** (1 layer): Scalar field for pressure projection
- **divergence** (1 layer): Scalar field measuring velocity divergence
- **dye** (1 layer): Grayscale brightness for visualization

**Note**: WebGPU only supports `read_write` storage textures for single-channel formats (`r32float`, `r32uint`, `r32sint`). Multi-channel data is stored using `texture_2d_array` with separate layers per component.

## Building and Running

```bash
# Build
npm run build -- --env example=stable-fluids

# Development server (hot-reload)
npm start -- --env example=stable-fluids

# Test with capture tool (after building)
npm run capture
```

## Files

```
stable-fluids/
├── index.ts                    # Main entry point
├── README.md                   # This file
└── shaders/
    ├── compute.wgsl            # 7 compute kernels for fluid simulation
    ├── render.wgsl             # Fragment shader displaying dye field
    └── includes/
        ├── bindings.wgsl       # Binding indices for buffers and textures
        ├── textures.wgsl       # Texture declarations
        └── interactions.wgsl   # Canvas and interaction structs
```

## Customization Ideas

1. **Adjustable viscosity**: Add UI control to change fluid thickness
2. **Multiple force types**: Attraction, rotation, vortex forces
3. **Obstacles**: Add solid boundaries for fluid to flow around
4. **Temperature**: Add buoyancy forces (hot rises, cold falls)
5. **3D fluids**: Extend to volumetric simulation with texture_3d
6. **Variable density**: Non-uniform fluid density affecting motion
7. **Custom dye injection**: Patterns, images, or procedural colors

## Theory & References

**Jos Stam's "Stable Fluids" (SIGGRAPH 1999)**:
- Uses semi-Lagrangian advection (unconditionally stable)
- Projection method for incompressibility
- Implicit diffusion solving

**Key Insight**: By tracing particles backward in time (semi-Lagrangian), we avoid the instability of forward methods, allowing larger time steps without simulation explosion.

**Further Reading**:
- [Stable Fluids Paper](https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/ns.pdf)
- [Real-Time Fluid Dynamics for Games](https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/GDC03.pdf)
- [GPU Gems Chapter 38: Fast Fluid Dynamics Simulation](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu)
