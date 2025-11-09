// Textures
@group(GROUP_INDEX) @binding(INDEX)
  var index_texture: texture_storage_2d_array<r32uint, read_write>;

@group(GROUP_INDEX) @binding(STERIC_POTENTIAL)  
  var steric_potential: texture_storage_2d_array<r32float, read_write>;

@group(GROUP_INDEX) @binding(PARAMETER_FIELDS)  
  var parameter_fields: texture_storage_2d_array<r32float, read_write>;

const DX = vec2i(1, 0);
const DY = vec2i(0, 1);

const EPS = 1e-37;

fn as_r32float(r: f32) -> vec4<f32> {
    return vec4<f32>(f32(r), 0.0, 0.0, 1.0);
}

fn as_r32uint(r: u32) -> vec4<u32> {
    return vec4<u32>(u32(r), 0, 0, 1);
}

fn normalize_safely(x: vec2<f32>) -> vec2<f32> {
  return x / max(length(x), EPS);
}

fn load_texture(texture: texture_storage_2d_array<r32float, read_write>, F: i32, p: vec2<i32>) -> f32 {
  let q = p + canvas.size;
  return textureLoad(texture, q  % canvas.size, F).r;
}

fn store_texture(texture: texture_storage_2d_array<r32float, read_write>, F: u32, p: vec2<i32>, value: f32) {
  let q = p + canvas.size;
  textureStore(texture, q  % canvas.size, F, as_r32float(value));
}

fn load_texture_index(F: i32, p: vec2<i32>) -> u32 {
  let q = p + canvas.size;
  return textureLoad(index_texture, q  % canvas.size, F).r;
}

fn store_texture_index(F: i32, p: vec2<i32>, value: u32) {
  let q = p + canvas.size;
  textureStore(index_texture, q  % canvas.size, F, as_r32uint(value));
}

fn as_vec2i(p: vec2<f32>) -> vec2<i32> {
  return vec2<i32>(p + (0.5 - fract(p)));
}

fn load_steric_potential(p: vec2<i32>) -> array<f32, STERIC_POTENTIAL_DIM> {
  var U: array<f32, STERIC_POTENTIAL_DIM>;
  for (var i = 0; i < STERIC_POTENTIAL_DIM; i++) {
    U[i] = load_texture(steric_potential, i, p);
  }
  return U;
}

fn steric_force(x: vec2<f32>, dx: vec2<f32>, coefficients: array<f32, STERIC_POTENTIAL_DIM>) -> f32 {
  var force: f32 = 0.0;
  for (var i = 0; i < STERIC_POTENTIAL_DIM; i++) {
    var dU = load_texture(steric_potential, i, as_vec2i(x + dx)) - load_texture(steric_potential, i, as_vec2i(x - dx));
    force += coefficients[i] * select(dU, 0.0, dU < 0.3) / length(2*dx);
  }
  return force;
}

fn store_steric_potential(p: vec2<i32>, U: array<f32, STERIC_POTENTIAL_DIM>) {
  for (var i = 0u; i < STERIC_POTENTIAL_DIM; i++) {
    store_texture(steric_potential, i, p, U[i]);
  }
}

fn gaussian_blur(texture: texture_storage_2d_array<r32float, read_write>, p: vec2<i32>, F: i32, spreadAmt: f32) -> f32 {
  var sum: f32 = 0.0;
  var weightSum: f32 = 0.0;
  for (var dx = -2; dx <= 2; dx++) {
    for (var dy = -2; dy <= 2; dy++) {
      let offset = vec2<f32>(f32(dx), f32(dy));
      let weight = exp(-dot(offset, offset) / (2.0 * spreadAmt * spreadAmt)) / (2.0 * 3.14159 * spreadAmt * spreadAmt);
      sum += weight * load_texture(texture, F, p + vec2i(dx, dy));
      weightSum += weight;
    }
  }
  return sum / weightSum;
}
