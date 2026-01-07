#import includes::bindings
#import includes::textures
#import includes::interactions
#import includes::canvas

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vert(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;

    // Full-screen quad
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
    output.uv = pos * 0.5 + 0.5;
    output.uv.y = 1.0 - output.uv.y;

    return output;
}

@fragment
fn frag(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {

    let x = vec2<i32>(uv * vec2<f32>(canvas.size));
    var color = vec3f(0.05, 0.05, 0.1);

    var feature: vec3f;
    for (var i = 0; i < 3; i++) {
        feature[i] = textureLoad(feature_texture, x, i).x;
    }
    color += feature;
    return vec4<f32>(color, 1.0);
}