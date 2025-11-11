#import includes::bindings
#import includes::textures

/**
 * Render Shader - Displays the simulation on screen
 *
 * Vertex Shader: Hard-coded full-screen quad
 * Fragment Shader: Samples the simulation texture and applies colors
 */

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) texCoord: vec2f,
};

// Hard-coded full-screen quad (6 vertices for 2 triangles)
@vertex
fn vert(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
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
fn frag(input: VertexOutput) -> @location(0) vec4f {
    let texSize = vec2f(textureDimensions(states));
    let pixelCoord = vec2i(input.texCoord * texSize);

    let layer0State = textureLoad(states, pixelCoord, 0);
    let layer1State = textureLoad(states, pixelCoord, 1);

    let layer0Alive = f32(layer0State.r);
    let layer1Alive = f32(layer1State.r);

    // Color mapping: Layer 0 = Cyan, Layer 1 = Magenta, Both = White (additive)
    let layer0Color = vec3f(0.0, 1.0, 1.0) * layer0Alive;
    let layer1Color = vec3f(1.0, 0.0, 1.0) * layer1Alive;

    let combinedColor = layer0Color + layer1Color;
    let backgroundColor = vec3f(0.05, 0.05, 0.15);

    let hasAnyAlive = layer0Alive + layer1Alive;
    let finalColor = mix(backgroundColor, combinedColor, min(hasAnyAlive, 1.0));

    return vec4f(finalColor, 1.0);
}
