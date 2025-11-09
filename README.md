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

   (The dev server serves the built files from `dist/` at the root URL)

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
Initialize State → Compute Shader (in-place update) → Render Shader → Display
                        ↓
                   Update Logic (read & write same texture)
```

### 2. In-Place State Updates

This template uses a single read-write storage texture for simplicity:
- **stateTexture**: Single texture with `read_write` access
- Compute shader reads neighbors, then writes new state to same texture
- **Note**: For cellular automata, this creates race conditions (cells may read mixed old/new states)
- Result: Interesting visual artifacts but not "correct" Game of Life

For deterministic cellular automata, use double-buffering (see git history).
This pattern works well for simulations without strict neighbor dependencies.

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

## Automated Testing & Capture

The template includes a browser automation tool for capturing console output and animation frames:

```bash
# Build first
npm run build

# Quick capture: 5 screenshots at 1s intervals (visible browser, captures WebGPU!)
npm run capture:quick

# Standard capture: 10 screenshots at 500ms intervals (visible browser)
npm run capture

# Detailed capture: 30 screenshots at 200ms intervals (visible browser)
npm run capture:detailed
```

**Note**: The capture tool opens a visible browser by default so WebGPU screenshots work. It opens `dist/index.html` directly - no dev server needed!

### What it captures:

- **Console Output**: All logs, warnings, and errors
- **Screenshots**: Animation frames over time
- **Summary Report**: Statistics and error analysis

### Output location:

All captures are saved to `./.capture/session-[timestamp]/` (hidden folder, automatically ignored by git):
- `frame-NNNN.png` - Screenshot frames
- `console.log` - Human-readable console output
- `console.json` - Structured console data
- `summary.json` - Capture statistics

For more details, see [`tools/README.md`](tools/README.md).

## Learn More

- [WebGPU Specification](https://www.w3.org/TR/webgpu/)
- [WGSL Specification](https://www.w3.org/TR/WGSL/)
- [WebGPU Samples](https://webgpu.github.io/webgpu-samples/)

## License

MIT
