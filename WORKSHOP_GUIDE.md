# Workshop Guide: WebGPU 2D Simulations

This guide provides additional context for workshop facilitators and participants.

## What Was Simplified

This template was derived from a more complex WebGPU project. Here's what was removed to make it workshop-friendly:

### Removed Complexity

1. **Multiple Agent Systems**: The original had membrane, actin, and prey agents with complex interactions
2. **Multi-layered Textures**: Simplified to single-layer simulation state
3. **Complex Bind Groups**: Reduced from 10+ bindings to just 2 per pipeline
4. **Custom Shader Includes**: Removed import system for simpler shader code
5. **Project-Specific Logic**: Removed all biological simulation specifics

### What Remains

The template now contains only the essential WebGPU concepts:

- **Device initialization** and canvas configuration
- **Compute pipelines** for parallel simulation
- **Render pipelines** for visualization
- **Ping-pong buffers** for state management
- **Workgroup dispatch** and synchronization

## Key Concepts for Beginners

### 1. GPU vs CPU Computing

**CPU**: Sequential, great for complex logic
**GPU**: Parallel, great for simple operations on many data points

WebGPU lets you leverage GPU parallelism for simulations where many cells/particles follow the same rules.

### 2. Workgroups and Threads

```
Simulation Grid (512×512 pixels)
    ↓
Divided into Workgroups (16×16 threads each)
    ↓
32×32 = 1,024 workgroups dispatched
    ↓
Each workgroup processes 256 pixels in parallel
```

### 3. Ping-Pong Pattern

Why we need two textures:

```
❌ WRONG: Read and write same texture
   Frame N: Read A, Write A ← Race condition!

✅ RIGHT: Ping-pong between textures
   Frame N:   Read A, Write B
   Frame N+1: Read B, Write A
```

### 4. Texture Formats

`rgba8unorm`: 4 channels (RGBA), 8 bits each, normalized to [0,1]

- Perfect for visual data
- Each pixel: 4 bytes
- Efficient for color mapping

## Workshop Activities

### Activity 1: Color Exploration (15 min)

**Goal**: Understand fragment shader and color mapping

1. Modify the fragment shader colors
2. Try gradient effects
3. Map simulation state to different color channels

**Example**:
```wgsl
// Rainbow colors based on state
let hue = state.r * 6.28; // 0 to 2π
let color = vec3f(
    0.5 + 0.5 * cos(hue),
    0.5 + 0.5 * cos(hue + 2.09),
    0.5 + 0.5 * cos(hue + 4.18)
);
```

### Activity 2: Modify Game of Life Rules (20 min)

**Goal**: Understand compute shader logic

1. Change survival/birth conditions
2. Try different neighbor counts
3. Experiment with different initial patterns

**Examples**:
- **HighLife**: Birth on 3,6 neighbors (creates replicators!)
- **Day & Night**: Birth on 3,6,7,8; Survive on 3,4,6,7,8
- **Seeds**: Birth on 2; Never survive (creates explosive patterns)

### Activity 3: Simple Particle System (30 min)

**Goal**: Build something from scratch

Replace Game of Life with bouncing particles:

```wgsl
@compute @workgroup_size(16, 16)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let pos = vec2i(global_id.xy);
    let size = textureDimensions(inputTexture);

    // Read current state: (velocity_x, velocity_y, unused, unused)
    let state = textureLoad(inputTexture, pos, 0);

    // Simple physics
    var velocity = state.xy;
    velocity.y += 0.001; // Gravity

    // Boundary collision
    if (pos.y >= size.y - 1 && velocity.y > 0.0) {
        velocity.y *= -0.8; // Bounce with damping
    }

    // Store updated velocity
    textureStore(outputTexture, pos, vec4f(velocity, 0.0, 1.0));
}
```

### Activity 4: Reaction-Diffusion (Advanced, 45 min)

**Goal**: Implement a more complex simulation

Create pattern formation inspired by Turing patterns:

```wgsl
// Gray-Scott reaction-diffusion model
let feed = 0.055;
let kill = 0.062;
let diffusionA = 1.0;
let diffusionB = 0.5;

// Compute Laplacian for diffusion
// Update concentrations A and B
// Creates beautiful organic patterns!
```

## Common Pitfalls

### 1. Texture Coordinate Confusion

```
Clip Space:     (-1,-1) to (1,1)
Texture Space:  (0,0) to (1,1)
Pixel Space:    (0,0) to (width,height)
```

Always know which space you're working in!

### 2. Integer Division

```wgsl
❌ let workgroups = size / 16;      // Integer division!
✅ let workgroups = (size + 15) / 16; // Correct ceiling division
```

### 3. Boundary Conditions

Always check boundaries in compute shaders:
```wgsl
if (pos.x >= size.x || pos.y >= size.y) {
    return; // Don't process out-of-bounds pixels
}
```

## Extension Ideas

### For Beginners

1. **Pattern Generator**: Create interesting initial states
2. **Color Schemes**: Different color palettes for visualization
3. **Speed Control**: Add FPS limiter or step-by-step mode
4. **Multiple Rules**: Switch between different cellular automata

### Intermediate

1. **Mouse Interaction**: Draw on the simulation
2. **Multiple Species**: Different rules for different "colors"
3. **Diffusion**: Add blur/spreading effects
4. **Performance Metrics**: Display FPS and compute time

### Advanced

1. **Multi-pass Rendering**: Post-processing effects
2. **Compute-based Rendering**: Entirely in compute shaders
3. **3D Visualization**: Use compute output for 3D geometry
4. **Fluid Simulation**: Navier-Stokes equations on GPU

## Resources

### WebGPU Fundamentals
- [WebGPU Spec](https://www.w3.org/TR/webgpu/)
- [Learn WGSL](https://google.github.io/tour-of-wgsl/)
- [WebGPU Samples](https://webgpu.github.io/webgpu-samples/)

### Math & Algorithms
- [Gray-Scott Model](https://groups.csail.mit.edu/mac/projects/amorphous/GrayScott/)
- [Cellular Automata](https://en.wikipedia.org/wiki/Cellular_automaton)
- [Reaction-Diffusion](https://www.karlsims.com/rd.html)

### Inspiration
- [Shader Toy](https://www.shadertoy.com/) (GLSL, but concepts transfer)
- [Compute Toy](https://compute.toys/) (WebGPU compute shaders)

## Debugging Tips

### 1. Visual Debugging

Output intermediate values as colors:
```wgsl
// Debug: Show neighbor count
let neighborColor = f32(neighbors) / 8.0;
textureStore(outputTexture, pos, vec4f(neighborColor, 0.0, 0.0, 1.0));
```

### 2. Console Logging

Check for shader compilation errors:
```javascript
const info = await module.getCompilationInfo();
console.log(info.messages);
```

### 3. Reduced Test Cases

Start with tiny grids (16×16) to verify logic before scaling up.

### 4. Step-by-Step Execution

Add a pause mechanism to step through frames manually.

## Questions for Reflection

1. How does parallelization change how you think about algorithms?
2. What kinds of problems are naturally suited for GPU computing?
3. How do biological systems inspire computational models?
4. What creative applications can you imagine for these techniques?

## Post-Workshop

Share your creations! Consider:
- Recording videos of interesting patterns
- Sharing code on GitHub
- Writing blog posts about your experiments
- Continuing to explore WebGPU and compute shaders

---

Happy coding! 🚀
