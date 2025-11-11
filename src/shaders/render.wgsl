/**
 * Render Shader - Displays the simulation on screen
 *
 * Vertex Shader: Hard-coded full-screen quad
 * Fragment Shader: Samples the simulation texture and applies colors
 */

@group(0) @binding(0) var simulationTexture: texture_2d_array<u32>;

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
 * Visualizes two layers with different colors:
 * - Layer 0: Cyan/Blue
 * - Layer 1: Magenta/Red
 * - Both layers: White (overlap)
 */
@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4f {
    // Get texture dimensions and convert normalized coords to pixel coords
    let texSize = vec2f(textureDimensions(simulationTexture));
    let pixelCoord = vec2i(input.texCoord * texSize);

    // Load the simulation state from both layers
    // textureLoad for texture_2d_array requires: (texture, coords, array_index, mip_level)
    let layer0State = textureLoad(simulationTexture, pixelCoord, 0, 0);
    let layer1State = textureLoad(simulationTexture, pixelCoord, 1, 0);

    // Convert uint to float for color interpolation
    let layer0Alive = f32(layer0State.r);
    let layer1Alive = f32(layer1State.r);

    // Color mapping for two layers:
    // Layer 0: Cyan (0, 1, 1) when alive
    // Layer 1: Magenta (1, 0, 1) when alive
    // Both: White (additive mixing)
    let layer0Color = vec3f(0.0, 1.0, 1.0) * layer0Alive;  // Cyan
    let layer1Color = vec3f(1.0, 0.0, 1.0) * layer1Alive;  // Magenta

    // Combine layers additively
    let combinedColor = layer0Color + layer1Color;

    // Background color (dark)
    let backgroundColor = vec3f(0.05, 0.05, 0.15);

    // Mix background with combined layer colors
    let hasAnyAlive = layer0Alive + layer1Alive;
    let finalColor = mix(backgroundColor, combinedColor, min(hasAnyAlive, 1.0));

    return vec4f(finalColor, 1.0);
}
