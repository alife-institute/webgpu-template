# WebGPU Template for 2D Simulations

A minimal WebGPU template for creating interactive 2D simulations and computational art. Perfect for workshops and learning!

## Features

- **Simple Setup**: Minimal boilerplate to get started quickly
- **Educational**: Well-commented code explaining each step
- **Hard-coded Quad**: No vertex buffers needed - the vertex shader generates a full-screen quad
- **Compute Shader Focus**: All interesting logic goes in compute shaders
- **Complete Examples**: Conway's Game of Life, Stable Fluids, Dimensionality Reduction, and Wormlike Chain simulation
- **Easy to Modify**: Clear separation between simulation and rendering
- **Texture Array Support**: Efficient multi-channel storage using `texture_storage_2d_array`
- **N-Dimensional Support**: Dimensionality reduction example supports arbitrary feature dimensions

## Prerequisites

- A WebGPU-compatible browser (Chrome 113+, Edge 113+, or Safari 18+)
- Node.js (v18 or higher)

## Quick Start

1. **Install dependencies**:
```bash
npm install
```

2. **Build an example** (specify which example to build):
```bash
npm run build -- --env example=game-of-life
```

3. **Start the development server**:
```bash
npm start -- --env example=game-of-life
```

4. **Open your browser** and navigate to `http://localhost:5500`

**Note**: You must specify which example to build.
Running without `--env example=` will show available examples.

## Project Structure

```
src/
├── utils.ts              # WebGPU utility functions
├── assets/               # Static assets (images, etc.)
└── examples/             # Example simulations
    ├── game-of-life/     # Conway's Game of Life
    │   ├── index.ts
    │   └── shaders/
    │       ├── compute.wgsl
    │       ├── render.wgsl
    │       └── includes/
    │           ├── bindings.wgsl
    │           └── textures.wgsl
    └── stable-fluids/    # Stable Fluids simulation
    │   ├── index.ts
    │   └── shaders/
    │       ├── compute.wgsl
    │       ├── render.wgsl
    │       └── includes/
    │           ├── bindings.wgsl
    │           └── textures.wgsl
    └── # other examples
```

## How It Works

### 1. Simulation Flow

```
Initialize State → Compute Shader (in-place update) → Render Shader → Display
                        ↓
                   Update Logic (read & write same texture)
```

### 2. Includes System for Shared WGSL Code

The template uses a custom `#import` system to share code across shaders:

**In TypeScript** (`index.ts`):
```typescript
import bindings from "./shaders/includes/bindings.wgsl";
import textures from "./shaders/includes/textures.wgsl";

const shaderIncludes: Record<string, string> = {
  bindings: bindings,
  textures: textures,
};

// Pass includes when creating shaders
const module = await createShader(device, computeShader, shaderIncludes);
```

**In WGSL** (any `.wgsl` file):
```wgsl
#import includes::bindings  // Imports binding layout definitions
#import includes::textures  // Imports texture declarations

// Now you can use BINDINGS and texture variables
```

**Benefits**:
- **Single source of truth**: Binding indices defined once in `includes/bindings.wgsl`
- **No duplication**: Texture declarations shared across compute and render shaders
- **Easy to extend**: Add new textures by updating includes files only

### 3. In-Place State Updates

This template uses a single read-write storage texture for simplicity:
- **states texture**: 2D array texture with `read_write` access (supports multiple layers)
- Compute shader reads neighbors, then writes new state to same texture
- **Note**: For cellular automata, this creates race conditions (cells may read mixed old/new states)
- Result: Interesting visual artifacts but not "correct" Game of Life

For deterministic cellular automata, use double-buffering (see git history).
This pattern works well for simulations without strict neighbor dependencies.

### 4. Shader Pipeline

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

### Adding or Editing Textures

The `setupTextures` utility in `utils.ts` simplifies texture management:

**Step 1: Define binding indices** in `src/shaders/includes/bindings.wgsl`:
```wgsl
struct TextureBindings {
  STATES: i32,
  VELOCITIES: i32,  // Add new texture binding
}

const BINDINGS = array<Bindings, 1>(
  Bindings(
    GROUP_INDEX,
    BufferBindings(0,1,2),
    TextureBindings(3, 4),  // Update indices
));
```

**Step 2: Declare texture** in `src/shaders/includes/textures.wgsl`:
```wgsl
@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].TEXTURE.STATES)
  var states: texture_storage_2d_array<r32uint, read_write>;

@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].TEXTURE.VELOCITIES)
  var velocities: texture_storage_2d_array<rg32float, read_write>;  // Add new texture
```

**Step 3: Initialize in TypeScript** (`src/index.ts`):
```typescript
const BINDINGS = [{
  GROUP: GROUP_INDEX,
  BUFFER: { CANVAS: 0, CONTROLS: 1, INTERACTIONS: 2 },
  TEXTURE: { STATES: 3, VELOCITIES: 4 }  // Add new texture
}];

const textures = setupTextures(
  device,
  /*bindings=*/ Object.values(BINDINGS[GROUP_INDEX].TEXTURE),  // Automatically includes all textures
  /*data=*/ {
    [BINDINGS[GROUP_INDEX].TEXTURE.STATES]: random(canvas.size.height, canvas.size.width, 2),
    [BINDINGS[GROUP_INDEX].TEXTURE.VELOCITIES]: zeros(canvas.size.height, canvas.size.width, 2),  // Initialize new texture
  },
  /*size=*/ {
    depthOrArrayLayers: {
      [BINDINGS[GROUP_INDEX].TEXTURE.STATES]: 2,
      [BINDINGS[GROUP_INDEX].TEXTURE.VELOCITIES]: 2,  // Specify layers
    },
    width: canvas.size.width,
    height: canvas.size.height,
  },
  /*format=*/ {
    [BINDINGS[GROUP_INDEX].TEXTURE.STATES]: "r32uint",
    [BINDINGS[GROUP_INDEX].TEXTURE.VELOCITIES]: "r32float",  // Specify format
  }
);
```

**That's it!** The `setupTextures` utility handles:
- Creating GPU textures with correct usage flags
- Setting up bind group layouts automatically
- Uploading initial data to textures
- Configuring 2D vs 2D-array based on layer count

### Change Simulation Size

Simulation size is automatically set to match canvas dimensions. To change it, modify canvas size in `utils.ts`:

```typescript
export function configureCanvas(
  device: GPUDevice,
  size = { width: 512, height: 512 }  // Change default size here
)
```

Or pass custom size when calling `configureCanvas` in `index.ts`:
```typescript
const canvas = configureCanvas(device, { width: 1024, height: 1024 });
```

### Implement Your Own Simulation

Edit `src/shaders/compute.wgsl`:

```wgsl
#import includes::bindings
#import includes::textures

@compute @workgroup_size(16, 16)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let pos = vec2i(global_id.xy);

    // 1. Read current state from texture (specify layer)
    let currentState = textureLoad(states, pos, 0);

    // 2. Implement your simulation logic here
    var newState = vec4u(0u);
    // ... your calculations ...

    // 3. Write new state
    textureStore(states, pos, 0, newState);
}
```

### Customize Visualization

Edit the fragment shader in `src/shaders/render.wgsl`:

```wgsl
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let state = textureSample(simulationTexture, texSampler, input.texCoord);

    // Change these colors!
    let color1 = vec3f(1.0, 0.0, 0.0);  // Red
    let color2 = vec3f(0.0, 0.0, 1.0);  // Blue

    let color = mix(color1, color2, state.r);
    return vec4<f32>(color, 1.0);
}
```

## Automated Testing & Capture

The template includes a browser automation tool for capturing console output and animation frames:

```bash
# Build first
npm run build -- --env example=game-of-life

# Standard capture: 10 screenshots at 500ms intervals
npm run capture

# Custom capture with options
npm run capture -- --screenshots 5 --interval 1000   # Quick: 5 frames at 1s intervals
npm run capture -- --screenshots 30 --interval 200   # Detailed: 30 frames at 200ms intervals
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
