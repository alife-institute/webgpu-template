#import includes::bindings
#import includes::textures
#import includes::interactions
#import includes::canvas

struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn vert(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
    var output: VertexOutput;

    // Full-screen quad
    let vertices = array<vec2f, 6>(
        vec2f(-1.0, -1.0),
        vec2f( 1.0, -1.0),
        vec2f(-1.0,  1.0),
        vec2f(-1.0,  1.0),
        vec2f( 1.0, -1.0),
        vec2f( 1.0,  1.0)
    );

    let pos = vertices[vertexIndex];
    output.position = vec4f(pos, 0.0, 1.0);
    output.uv = pos * 0.5 + 0.5;
    output.uv.y = 1.0 - output.uv.y;

    return output;
}

@fragment
fn frag(@location(0) uv : vec2f) -> @location(0) vec4f {

    let x = vec2<i32>(uv * vec2<f32>(canvas.size));
    var color = vec3f(0.05, 0.05, 0.1);

    let density = textureLoad(render_texture, x, 0).x;
    let graph_color = textureLoad(render_texture, x, 1).x;
    color += vec3f(1.0, 0.2, 0.2) * density;
    color += vec3f(0.0, 1.0, 1.0) * graph_color;
    return vec4f(color, 1.0);
}