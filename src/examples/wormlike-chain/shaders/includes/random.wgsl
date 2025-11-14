@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].BUFFER.RANDOM)  
  var<storage, read_write> random_buffer : array<vec4<u32>>;

fn threefry_2x32(idx: u32) -> vec4<u32> {

    let R: array<u32, 8> = array<u32, 8>(13, 15, 26, 6, 17, 29, 16, 24);
    let C: u32 = 0x1BD11BDAu;

    var state = random_buffer[idx];
  
    state.x += canvas.key.x;
    state.y += canvas.key.y;
    state.z += canvas.key.x ^ C;
    state.w += canvas.key.y ^ C;

    for (var i = 0u; i < 8u; i++) {
        state.x += state.z;
        state.y += state.w;
        state.z ^= state.x;
        state.w ^= state.y;
        state.z = (state.zw.x >> R[i]) | (state.zw.x << (32u - R[i]));
        state.w = (state.zw.y >> R[i]) | (state.zw.y << (32u - R[i]));

        if (i % 4u == 3u) {
            state = vec4<u32>(state.z, state.w, state.x, state.y);
        }
    }
    random_buffer[idx] = state;
    return state;
}

fn random_uniform(thread_id: u32) -> f32 {
    return random_uniform_buffer(thread_id).x;
}

const UINT32_MAX: f32 = 4294967296.0;
fn random_uniform_buffer(thread_id: u32) -> vec4<f32> {

    let random_values = threefry_2x32(thread_id);
    return vec4<f32>(random_values) / UINT32_MAX;
}

fn random_uniform_texture(thread_id: vec2<u32>) -> vec4<f32> {

    let random_values = threefry_2x32(thread_id.x + thread_id.y * u32(canvas.size.x));
    return vec4<f32>(random_values) / UINT32_MAX;
}