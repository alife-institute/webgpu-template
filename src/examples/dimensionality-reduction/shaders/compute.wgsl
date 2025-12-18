#import includes::bindings
#import includes::nodes
#import includes::interactions
#import includes::textures
#import includes::canvas
#import includes::controls
#import includes::random

const PI = 3.14159265358979323846;

@compute @workgroup_size(256)
fn initialize(@builtin(global_invocation_id) id : vec3u) {
  let count = arrayLength(&nodes);
  let idx = id.x;
  
  if (idx >= count) {
    return;
  }
  
  let center = vec2<f32>(canvas.size) * 0.5;
  let radius = min(center.x, center.y) * 0.3;
  let angle =  2 * PI * f32(idx) / f32(count);

  nodes[idx].id = idx;

  nodes[idx].position.x = center.x + radius * cos(angle);
  nodes[idx].position.y = center.y + radius * sin(angle);

  nodes[idx].orientation = vec2<f32>(cos(angle), sin(angle));
  nodes[idx].features.x = f32(idx % 2);
}

@compute @workgroup_size(256)
fn update_positions(@builtin(global_invocation_id) id : vec3u) {
  let count = arrayLength(&nodes);
  let idx = id.x;

  nodes[idx].position.x += 2*random_uniform(idx) - 1;
  nodes[idx].position.y += 2*random_uniform(idx + 1) - 1;

}

@compute @workgroup_size(256)
fn draw(@builtin(global_invocation_id) id: vec3<u32>) {

    if (id.x >= arrayLength(&nodes)) {
        return;
    }

    let position = nodes[id.x].position;
    let orientation = nodes[id.x].orientation;
    let features = nodes[id.x].features;

    for (var ds = -2.0; ds <= 2.0; ds+= 1.0) {
        let x = vec2i(position + orientation * ds);
        textureStore(render_texture, x, 0, vec4<f32>(1, 0, 0, 0));
        textureStore(render_texture, x, 1, features);
    }
}

@compute @workgroup_size(16, 16)
fn clear(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2i(id.xy);

    if (idx.x >= canvas.size.x || idx.y >= canvas.size.y) {
        return;
    }
    
    textureStore(parameters_texture, idx, 0, 0.9*textureLoad(parameters_texture, idx, 0) );

    textureStore(render_texture, idx, 0, vec4<f32>(0, 0, 0, 0));
    textureStore(render_texture, idx, 1, vec4<f32>(0, 0, 0, 0));
}