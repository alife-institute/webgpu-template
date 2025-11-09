# WebGPU Template for 2D Simulations

A minimal WebGPU template for creating interactive 2D simulations and computational art. Perfect for workshops and learning!

## Features

- **Simple Setup**: Minimal boilerplate to get started quickly
- **Educational**: Well-commented code explaining each step
- **Hard-coded Quad**: No vertex buffers needed - the vertex shader generates a full-screen quad
- **Compute Shader Focus**: All interesting logic goes in compute shaders
- **Example Simulation**: Includes Conway's Game of Life as a starting point
- **Easy to Modify**: Clear separation between simulation and rendering

## Prerequisites

- A WebGPU-compatible browser (Chrome 113+, Edge 113+, or Safari 18+)
- Node.js (v18 or higher)

## Quick Start

1. **Install dependencies**:
```bash
npm install
```

2. **Start the development server**:
```bash
npm start
```

3. **Open your browser** and navigate to `http://localhost:5500`

## Project Structure

```
src/
├── index.ts              # Main application setup
├── utils.ts              # WebGPU utility functions
└── shaders/
    ├── compute.wgsl      # Compute shader (simulation logic)
    └── render.wgsl       # Render shader (vertex + fragment)
```

## How It Works

### 1. Simulation Flow

```
Initialize State → Compute Shader → Ping-Pong → Render Shader → Display
                        ↓              ↓
                   Update Logic   Swap Buffers
```

### 2. Ping-Pong Buffers

The template uses two textures that alternate roles:
- **Frame N**: Read from Texture A, write to Texture B
- **Frame N+1**: Read from Texture B, write to Texture A

This prevents reading and writing to the same texture simultaneously.

### 3. Shader Pipeline

**Compute Shader** (`compute.wgsl`):
- Runs on the GPU in parallel
- Each thread processes one pixel/cell
- Implements your simulation logic (e.g., Game of Life rules)

**Vertex Shader** (`render.wgsl`):
- Hard-coded full-screen quad (no vertex buffers!)
- Generates 6 vertices for 2 triangles

**Fragment Shader** (`render.wgsl`):
- Samples the simulation texture
- Maps simulation state to colors
- Outputs final pixel colors

## Modifying the Simulation

### Change Simulation Size

In `src/index.ts`:
```typescript
const SIMULATION_SIZE = { width: 512, height: 512 }; // Change these values
```

### Implement Your Own Simulation

Edit `src/shaders/compute.wgsl`:

```wgsl
@compute @workgroup_size(16, 16)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let pos = vec2i(global_id.xy);

    // 1. Read current state
    let currentState = textureLoad(inputTexture, pos, 0);

    // 2. Implement your simulation logic here
    var newState = vec4f(0.0);
    // ... your calculations ...

    // 3. Write new state
    textureStore(outputTexture, pos, newState);
}
```

### Customize Visualization

Edit the fragment shader in `src/shaders/render.wgsl`:

```wgsl
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    let state = textureSample(simulationTexture, texSampler, input.texCoord);

    // Change these colors!
    let color1 = vec3f(1.0, 0.0, 0.0);  // Red
    let color2 = vec3f(0.0, 0.0, 1.0);  // Blue

    let color = mix(color1, color2, state.r);
    return vec4f(color, 1.0);
}
```

## Example Simulations to Try

### 1. Reaction-Diffusion

Simulate chemical reactions and diffusion (creates pattern formation).

### 2. Heat Equation

Simulate heat spreading across a surface.

### 3. Wave Equation

Simulate ripples and wave propagation.

### 4. Particle Systems

Simulate many particles with simple physics.

### 5. Cellular Automata

Like the included Game of Life, but try other rules!

## Tips for Workshop Participants

1. **Start Simple**: Modify the existing Game of Life rules first
2. **Use Colors**: Visualize different states with different colors
3. **Debug Visually**: Map intermediate calculations to colors to see what's happening
4. **Experiment**: Try changing constants and see what happens
5. **Read Comments**: The code is heavily commented to help you understand

## Common Issues

### Browser Compatibility

If you see "WebGPU is not supported", make sure you're using:
- Chrome/Edge 113+ with WebGPU enabled
- Safari 18+ with WebGPU enabled
- Latest Firefox Nightly with WebGPU enabled

### Performance

If the simulation is slow:
1. Reduce `SIMULATION_SIZE` in `index.ts`
2. Simplify your compute shader logic
3. Check browser developer tools for errors

## Learn More

- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [WGSL Specification](https://www.w3.org/TR/WGSL/)
- [WebGPU Samples](https://webgpu.github.io/webgpu-samples/)

## License

MIT
