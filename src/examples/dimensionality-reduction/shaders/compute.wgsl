#import includes::bindings
#import includes::nodes
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
    nodes[idx].features = vec3<f32>(
        random_uniform(idx),
        random_uniform(idx + 1u),
        random_uniform(idx + 2u),
    );
}

@compute @workgroup_size(256)
fn update_positions(@builtin(global_invocation_id) id : vec3u) {
    let count = arrayLength(&nodes);
    let idx = id.x;
    
    if (idx >= count) {
        return;
    }

    let position = nodes[idx].position;
    let features = nodes[id.x].features;

    let orientation = nodes[idx].orientation;
    let normal = rotate(orientation, PI);

    // drop feature trail
    for (var i = 0; i < 3; i++) {
        textureStore(feature_texture, vec2i(position - orientation), i, vec4<f32>(features[i], 0, 0, 0));
    }

    var sense_left: vec3f;
    for (var i = 0; i < 3; i++) {
        sense_left[i] = textureLoad(feature_texture, vec2i(position + orientation + normal), i).x;
    }

    var sense_right: vec3f;
    for (var i = 0; i < 3; i++) {
        sense_right[i] = textureLoad(feature_texture, vec2i(position + orientation - normal), i).x;
    }

    let pull_left = dot(sense_left, features);
    let pull_right = dot(sense_right, features);
    let net_pull = pull_left - pull_right;

    let angle = 2*random_uniform(idx) - 1.0;
    let speed = 0.5;

    nodes[idx].orientation = rotate(orientation, -net_pull*angle);
    nodes[idx].position += speed * nodes[idx].orientation;

    // periodic boundary conditions
    nodes[idx].position = (nodes[idx].position + vec2<f32>(canvas.size)) % vec2<f32>(canvas.size);
}

fn rotate(v: vec2<f32>, angle: f32) -> vec2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec2<f32>(
        c * v.x - s * v.y,
        s * v.x + c * v.y
    );
}

@compute @workgroup_size(16, 16)
fn update_textures(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2i(id.xy);

    if (idx.x >= canvas.size.x || idx.y >= canvas.size.y) {
        return;
    }
    
    for (var i = 0; i < 3; i++) {
        textureStore(feature_texture, idx, i, 0.99*textureLoad(feature_texture, idx, i) );
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

    let radius = 1;

    for (var i = 0; i < 3; i++) {
        var sum = vec4<f32>(0.0);
        var weight_sum = 0.0;

        for (var dx = -radius; dx <= radius; dx++) {
            let sample_x = clamp(idx.x + dx, 0, canvas.size.x - 1);
            let sample_idx = vec2i(sample_x, idx.y);
            sum += textureLoad(feature_texture, sample_idx, i);
            weight_sum += 1.0;
        }

        textureStore(feature_texture, idx, i, sum / weight_sum);
    }
}

fn blur_vertical(id: vec3<u32>) {
    let idx = vec2i(id.xy);
    if (idx.x >= canvas.size.x || idx.y >= canvas.size.y) {
        return;
    }

    let radius = 1;

    for (var i = 0; i < 3; i++) {
        var sum = vec4<f32>(0.0);
        var weight_sum = 0.0;

        for (var dy = -radius; dy <= radius; dy++) {
            let sample_y = clamp(idx.y + dy, 0, canvas.size.y - 1);
            let sample_idx = vec2i(idx.x, sample_y);
            sum += textureLoad(feature_texture, sample_idx, i);
            weight_sum += 1.0;
        }

        textureStore(feature_texture, idx, i, sum / weight_sum);
    }
}