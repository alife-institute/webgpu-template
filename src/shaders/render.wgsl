#import includes::bindings
#import includes::textures

struct VertexOutput {
    @builtin(position) Position : vec4f,
    @location(0) fragUV : vec2f,
}

@group(GROUP_INDEX) @binding(CONTROLS)
  var<uniform> controls: Controls;

@vertex
fn vert(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
    const pos = array(
        vec2( 1.0,  1.0),
        vec2( 1.0, -1.0),
        vec2(-1.0, -1.0),
        vec2( 1.0,  1.0),
        vec2(-1.0, -1.0),
        vec2(-1.0,  1.0),
    );

    const uv = array(
        vec2(1.0, 0.0),
        vec2(1.0, 1.0),
        vec2(0.0, 1.0),
        vec2(1.0, 0.0),
        vec2(0.0, 1.0),
        vec2(0.0, 0.0),
    );

    var output : VertexOutput;
    output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
    output.fragUV = uv[VertexIndex];
    return output;
}

struct Canvas {
    size: vec2<i32>,
    pass_id: u32,
    key: vec2<u32>,
}

struct Interactions {
    position: vec2<f32>,
    size: f32,
};

// Uniforms
@group(GROUP_INDEX) @binding(CANVAS) 
  var<uniform> canvas: Canvas;

@group(GROUP_INDEX) @binding(INTERACTIONS)
  var<uniform> interactions: Interactions;

@group(GROUP_INDEX) @binding(BINDING_INTERMEDIATE_TEXTURE)
  var intermediateTexture: texture_storage_2d<rgba8unorm, write>; //rgba8unorm

// Bindings for the final screen render
@group(1) @binding(0) var screenSampler: sampler;
@group(1) @binding(1) var screenTexture: texture_2d<f32>;

// #e0600cff
const orange = vec4(0.878, 0.373, 0.000, 1.0);

// #064164ff
const blue = vec4(0.024, 0.255, 0.396, 1.0);

fn random_uniform(seed: u32) -> f32 {
    return fract(sin(f32(seed) * 43758.5453123) * 12345.6789);
}

@compute @workgroup_size(16, 16)
fn render(@builtin(global_invocation_id) id: vec3u) {
    let x = vec2<i32>(id.xy);
    var color = blue / 4;  // background

    // steric potential
    var max_potential = 0.0;
    let potential = load_steric_potential(x);

    for (var i = 0; i < STERIC_POTENTIAL_DIM; i++) {
        max_potential = max(max_potential, potential[i]);
    }
    color += max_potential * orange; // add shadow

    // agent locations
    let idx = load_texture_index(SEGMENT_INDEX, x);
    if (idx > 0){
        color = vec4(1.0, 1.0, 1.0, 1.0);
    }
    
    // food signal
    let foodsignal = load_texture(parameter_fields, CONNECTION_PROBABILITY, x);
    let foodClick = load_texture(parameter_fields, FOODCLICK, x);

    var foodnearbyColor = vec4(0.0, 0.0, 0.0, 1.0);
    var decayedFoodSignal = foodsignal;
    decayedFoodSignal = select(1.0, foodsignal / 0.01, foodsignal < 0.01);
    foodnearbyColor = vec4(0.4, 0.4, 0.4, 1.0) * decayedFoodSignal;
    let foodColor = vec4(0.0, 0.4, 0.25, 1.0);
    color = color + foodClick*foodColor + foodnearbyColor;
    
    var debug = load_texture(parameter_fields, DEBUG, x);
    color += debug * vec4(1.0, 1.0, 1.0, 1.0);

    textureStore(intermediateTexture, x, color);
}

fn index_to_rainbow(idx: u32) -> vec4f {
    if idx == 0 {
        return vec4(0.0, 0.0, 0.0, 1.0);
    }
    let r = 0.5 + 0.5 * sin(f32(idx) * 0.1 + 0.0);
    let g = 0.5 + 0.5 * sin(f32(idx) * 0.1 + 2.094);
    let b = 0.5 + 0.5 * sin(f32(idx) * 0.1 + 4.188);
    return vec4(r, g, b, 1.0);
}
fn index_to_parity(idx: u32) -> vec4f {
    if idx == 0 {
        return vec4(0.0, 0.0, 0.0, 1.0);
    }
    if (idx % 2 == 0) {
        return vec4(1.0, 0.0, 0.0, 1.0);
    } else {
        return vec4(0.0, 1.0, 0.0, 1.0);
    }
}

// Add this to your rendering shader
fn get_actin_color(position: vec2<f32>) -> vec4<f32> {
  let recency = load_texture(parameter_fields, RECENCY, as_vec2i(position));
  
  // Red color (newest)
  let red = vec3<f32>(1.0, 0.0, 0.0);
  // Yellow color (oldest)
  let yellow = vec3<f32>(1.0, 1.0, 0.0);
  
  // Interpolate between yellow and red based on recency
  let color = mix(red, yellow, recency);
  
  return vec4<f32>(color, 1.0);
}

@fragment
fn frag(@location(0) fragUV: vec2f) -> @location(0) vec4f {
  return textureSample(screenTexture, screenSampler, fragUV);
}