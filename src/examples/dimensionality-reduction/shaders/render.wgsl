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

    const FEATURE_DIMENSION: u32 = {{FEATURE_DIMENSION}}u;
    let x = vec2<i32>(uv * vec2<f32>(canvas.size));
    var color = vec3f(0.05, 0.05, 0.1);

    var feature_rgb = vec3f(0.0);
    for (var i = 0u; i < FEATURE_DIMENSION; i++) {
        let val = textureLoad(feature_texture, x, i32(i)).x;
        if (i < 3u) {
            feature_rgb[i] += val;
        } else {
            feature_rgb[i % 3u] += val;
        }
    }
    color += feature_rgb;
    return vec4<f32>(color, 1.0);
}