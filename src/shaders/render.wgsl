/**
 * Render Shader - Displays the simulation on screen
 *
 * Vertex Shader: Hard-coded full-screen quad
 * Fragment Shader: Samples the simulation texture and applies colors
 */

@group(0) @binding(0) var texSampler: sampler;
@group(0) @binding(1) var simulationTexture: texture_2d<u32>;

// Vertex shader output / Fragment shader input
struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
};

/**
 * Vertex Shader - Hard-coded full-screen quad
 * No vertex buffer needed! This generates 6 vertices for 2 triangles.
 */
@vertex
fn vertex_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;

    // Define a full-screen quad using two triangles (6 vertices)
    // Triangle 1: (0,0), (1,0), (0,1)
    // Triangle 2: (0,1), (1,0), (1,1)
    let vertices = array<vec2f, 6>(
        vec2f(-1.0, -1.0),  // Bottom-left
        vec2f( 1.0, -1.0),  // Bottom-right
        vec2f(-1.0,  1.0),  // Top-left
        vec2f(-1.0,  1.0),  // Top-left
        vec2f( 1.0, -1.0),  // Bottom-right
        vec2f( 1.0,  1.0)   // Top-right
    );

    let pos = vertices[vertexIndex];
    output.position = vec4f(pos, 0.0, 1.0);

    // Convert from clip space (-1 to 1) to texture coordinates (0 to 1)
    output.texCoord = pos * 0.5 + 0.5;
    output.texCoord.y = 1.0 - output.texCoord.y; // Flip Y for texture sampling

    return output;
}

/**
 * Fragment Shader - Renders the simulation with custom colors
 * Modify the color mapping to change the visualization!
 */
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    // Get texture dimensions and convert normalized coords to pixel coords
    let texSize = vec2f(textureDimensions(simulationTexture));
    let pixelCoord = vec2i(input.texCoord * texSize);

    // Load the simulation state (uint texture requires textureLoad, not textureSample)
    let stateValue = textureLoad(simulationTexture, pixelCoord, 0);

    // Convert uint to float for color interpolation
    let stateFactor = f32(stateValue.r);

    // Color mapping - modify this for different visualizations!
    // Current: white for alive cells, dark blue for dead cells
    let aliveColor = vec3f(1.0, 1.0, 1.0);    // White
    let deadColor = vec3f(0.05, 0.05, 0.15);  // Dark blue

    let color = mix(deadColor, aliveColor, stateFactor);

    return vec4f(color, 1.0);
}
