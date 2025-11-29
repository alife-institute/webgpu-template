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

    let position = vec2i(nodes[id.x].position);
    let features = nodes[id.x].features;

    textureStore(render_texture, position, 0, vec4<f32>(1, 0, 0, 0));
    textureStore(render_texture, position, 1, features);
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

@compute @workgroup_size(16, 16)
fn parameters(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2i(id.xy);
    if (idx.x >= canvas.size.x || idx.y >= canvas.size.y) {
        return;
    }

    let x = vec2<f32>(idx);
    let size = vec2<f32>(canvas.size);
    let distance = length((x - interactions.position) - size * floor((x - interactions.position) / size + 0.5));

    if distance < abs(interactions.size) {
        textureStore(parameters_texture, idx, 0, vec4f(1, 0, 0, 0));
    }
}

@compute @workgroup_size(16, 16)
fn blur(@builtin(global_invocation_id) id: vec3<u32>) {
    blur_horizontal(id);
    blur_vertical(id);
}

fn blur_horizontal(id: vec3<u32>) {
    let idx = vec2i(id.xy);
    if (idx.x >= canvas.size.x || idx.y >= canvas.size.y) {
        return;
    }

    let radius = 2;
    var sum = vec4<f32>(0.0);
    var weight_sum = 0.0;

    for (var dx = -radius; dx <= radius; dx++) {
        let sample_x = clamp(idx.x + dx, 0, canvas.size.x - 1);
        let sample_idx = vec2i(sample_x, idx.y);
        sum += textureLoad(parameters_texture, sample_idx, 0);
        weight_sum += 1.0;
    }

    textureStore(parameters_texture, idx, 1, sum / weight_sum);
}

fn blur_vertical(id: vec3<u32>) {
    let idx = vec2i(id.xy);
    if (idx.x >= canvas.size.x || idx.y >= canvas.size.y) {
        return;
    }

    let radius = 2;
    var sum = vec4<f32>(0.0);
    var weight_sum = 0.0;

    for (var dy = -radius; dy <= radius; dy++) {
        let sample_y = clamp(idx.y + dy, 0, canvas.size.y - 1);
        let sample_idx = vec2i(idx.x, sample_y);
        sum += textureLoad(parameters_texture, sample_idx, 1);
        weight_sum += 1.0;
    }

    textureStore(parameters_texture, idx, 0, sum / weight_sum);
}