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

    let size_f = vec2f(canvas.size);
    
    nodes[idx].id = idx;
    
    // Random initialization
    let rand = random_uniform_buffer(idx);
    nodes[idx].position = rand.xy * size_f;
    
    let angle = rand.z * 2.0 * PI;
    nodes[idx].orientation = vec2<f32>(cos(angle), sin(angle));

    nodes[idx].features = vec3<f32>(
        random_uniform(idx + 1u),
        random_uniform(idx + 2u),
        0.0
    );
    // nodes[idx].features[u32(idx % 3)] = 1.0;
}

fn wrap_vec2i(v: vec2i, size: vec2i) -> vec2i {
    return (v % size + size) % size;
}

fn wrap_vec2f(v: vec2f, size: vec2f) -> vec2f {
    return v - size * floor(v / size);
}

@compute @workgroup_size(256)
fn update_positions(@builtin(global_invocation_id) id : vec3u) {
    let count = arrayLength(&nodes);
    let idx = id.x;
    
    if (idx >= count) {
        return;
    }

    let size_f = vec2f(canvas.size);
    let size_i = vec2i(canvas.size);
    let position = nodes[idx].position;
    let features = nodes[idx].features;
    let orientation = nodes[idx].orientation;

    // drop feature trail with toroidal wrapping
    for (var i = 0; i < 3; i++) {
        let trail_pos = vec2i(floor(position - orientation));
        textureStore(feature_texture, wrap_vec2i(trail_pos, size_i), i, vec4<f32>(features[i], 0, 0, 0));
    }

    let sensor_angle = controls.sensor_angle;
    let sensor_offset = controls.sensor_offset;
    let steer_angle = controls.steer_angle;

    let center_pos = position + orientation * sensor_offset;
    let left_pos = position + rotate(orientation, sensor_angle) * sensor_offset;
    let right_pos = position + rotate(orientation, -sensor_angle) * sensor_offset;

    let wrapped_center = wrap_vec2i(vec2i(floor(center_pos)), size_i);
    let wrapped_left = wrap_vec2i(vec2i(floor(left_pos)), size_i);
    let wrapped_right = wrap_vec2i(vec2i(floor(right_pos)), size_i);

    var sense_center: vec3f;
    var sense_left: vec3f;
    var sense_right: vec3f;

    for (var i = 0; i < 3; i++) {
        sense_center[i] = textureLoad(feature_texture, wrapped_center, i).x;
        sense_left[i] = textureLoad(feature_texture, wrapped_left, i).x;
        sense_right[i] = textureLoad(feature_texture, wrapped_right, i).x;
    }

    let pull_center = dot(normalize(sense_center), normalize(features));
    let pull_left = dot(normalize(sense_left), normalize(features));
    let pull_right = dot(normalize(sense_right), normalize(features));

    var turn_dir = 0.0;
    if (pull_center > pull_left && pull_center > pull_right) {
        turn_dir = 0.0;
    } else if (pull_center < pull_left && pull_center < pull_right) {
        turn_dir = (random_uniform(idx) - 0.5) * 2.0 * steer_angle;
    } else if (pull_left > pull_right) {
        turn_dir = steer_angle;
    } else if (pull_right > pull_left) {
        turn_dir = -steer_angle;
    }

    // Low signal random walk
    if (pull_center + pull_left + pull_right < 0.01) {
        turn_dir = (random_uniform(idx) - 0.5) * 2.0 * steer_angle;
    }

    let speed = 1.0;
    nodes[idx].orientation = rotate(orientation, turn_dir);
    nodes[idx].position += speed * nodes[idx].orientation;

    // periodic boundary conditions
    nodes[idx].position = wrap_vec2f(nodes[idx].position, size_f);
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
fn clear(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2i(id.xy);
    if (idx.x >= canvas.size.x || idx.y >= canvas.size.y) {
        return;
    }

    for (var i = 0; i < 3; i++) {
        textureStore(feature_texture, idx, i, vec4f(0.0));
        textureStore(parameters_texture, idx, i, vec4f(0.0));
    }
}

@compute @workgroup_size(16, 16)
fn update_textures(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2i(id.xy);

    if (idx.x >= canvas.size.x || idx.y >= canvas.size.y) {
        return;
    }
    
    for (var i = 0; i < 3; i++) {
        textureStore(feature_texture, idx, i, controls.decay_rate * textureLoad(feature_texture, idx, i) );
    }
}

@compute @workgroup_size(16, 16)
fn blur_horizontal(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2i(id.xy);
    if (idx.x >= canvas.size.x || idx.y >= canvas.size.y) {
        return;
    }

    let radius = 1;
    let size = vec2i(canvas.size);

    for (var i = 0; i < 3; i++) {
        var sum = vec4<f32>(0.0);
        var weight_sum = 0.0;

        for (var dx = -radius; dx <= radius; dx++) {
            let sample_idx = vec2i((idx.x + dx + size.x) % size.x, idx.y);
            sum += textureLoad(feature_texture, sample_idx, i);
            weight_sum += 1.0;
        }

        // textureStore(parameters_texture, idx, i, sum / weight_sum);
    }
}

@compute @workgroup_size(16, 16)
fn blur_vertical(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = vec2i(id.xy);
    if (idx.x >= canvas.size.x || idx.y >= canvas.size.y) {
        return;
    }

    let radius = 1;
    let size = vec2i(canvas.size);

    for (var i = 0; i < 3; i++) {
        var sum = vec4<f32>(0.0);
        var weight_sum = 0.0;

        for (var dy = -radius; dy <= radius; dy++) {
            let sample_idx = vec2i(idx.x, (idx.y + dy + size.y) % size.y);
            sum += textureLoad(parameters_texture, sample_idx, i);
            weight_sum += 1.0;
        }

        // textureStore(feature_texture, idx, i, sum / weight_sum);
    }
}