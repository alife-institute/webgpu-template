#import includes::bindings
#import includes::textures
#import includes::canvas

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec2<f32>,
};

@vertex
fn vert(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;

    let vertices = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>(-1.0,  1.0),
        vec2<f32>( 1.0, -1.0),
        vec2<f32>( 1.0,  1.0)
    );

    let pos = vertices[vertexIndex];
    output.position = vec4<f32>(pos, 0.0, 1.0);
    output.texCoord = pos * 0.5 + 0.5;
    output.texCoord.y = 1.0 - output.texCoord.y;

    return output;
}

@fragment
fn frag(input: VertexOutput) -> @location(0) vec4<f32> {
    let texSize = vec2<f32>(textureDimensions(dye));
    let pixelCoord = vec2i(input.texCoord * texSize);

    let brightness = textureLoad(dye, pixelCoord).x;
    let dyeColor = vec3f(brightness, brightness, brightness);
    let backgroundColor = vec3f(0.02, 0.02, 0.05);

    let finalColor = mix(backgroundColor, dyeColor, brightness);

    return vec4<f32>(finalColor, 1.0);
}
