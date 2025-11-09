#import includes::bindings
#import includes::textures
#import includes::random
#import includes::buffers

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

@group(GROUP_INDEX) @binding(CONTROLS)
  var<uniform> controls: Controls;

@group(GROUP_INDEX) @binding(INTERACTIONS)
  var<uniform> interactions: Interactions; // for user interactions, like mouse position or touch input

const MEMBRANE_INDEX = 2;
@group(GROUP_INDEX) @binding(MEMBRANE)  
  var<storage, read_write> membrane : array<Segment>;

const PI = 3.14159265358979323846;

fn perpendicular(v: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(-v.y, v.x);
}

fn angle(a: vec2<f32>, b: vec2<f32>) -> f32 {
  return atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
}

fn rotate(v: vec2<f32>, theta: f32) -> vec2<f32> {
  let c = cos(theta);
  let s = sin(theta);
  return vec2<f32>(c * v.x - s * v.y, s * v.x + c * v.y);
}

fn orientation_update(idx: u32, segments: ptr<storage, array<Segment>, read_write>, stiffness: f32) {
  let segment = segments[idx];
  
  if (segment.pass_id != canvas.pass_id || is_disconnected(segment) || idx >= arrayLength(segments)) {
    return;
  }

  let tail = segments[segment.tail];
  let head = segments[segment.head];

  let equilibrium_angle = clamp(load_texture(parameter_fields, FOODCLICK, as_vec2i(segment.position)), -PI/2, PI/2);

  let tail_torque = angle(tail.orientation, segment.orientation) - equilibrium_angle;
  let head_torque = angle(segment.orientation, head.orientation) - equilibrium_angle;

  segments[segment.head].orientation = rotate(segments[segment.head].orientation, -stiffness * f32(has_head(segment)) * head_torque);
  segments[segment.tail].orientation = rotate(segments[segment.tail].orientation,  stiffness * f32(has_tail(segment)) * tail_torque);
}

fn steric_force_update(idx: u32, segments: ptr<storage, array<Segment>, read_write>, coefficients: array<f32, STERIC_POTENTIAL_DIM>) {
  let segment = segments[idx];
  
  if (idx >= arrayLength(segments)) {
    return;
  }

  let tail = segments[segment.tail];
  let head = segments[segment.head];
  
  let theta = random_uniform(idx) * 2.0 * PI;
  let dx = (1 + f32(controls.steric_sampling_range) * random_uniform(idx)) * vec2<f32>(cos(theta), sin(theta));
  
  let normal = perpendicular(segment.orientation);
  let position = segment.position - normal * dot(normalize_safely(dx), normal) * steric_force(segment.position, dx, coefficients);
  
  segments[idx].position = position;
}

fn line_constraint_update(idx: u32, segments: ptr<storage, array<Segment>, read_write>) {
  let segment = segments[idx];
  
  if (segment.pass_id != canvas.pass_id || is_disconnected(segment) || idx >= arrayLength(segments)) {
    return;
  }

  let tail = segments[segment.tail];
  let head = segments[segment.head];
  
  let tail_displacement = tail.position - segment.position + controls.equilibrium_line_distance * (segment.orientation + tail.orientation) / 2;
  let head_displacement = head.position - segment.position - controls.equilibrium_line_distance * (segment.orientation + head.orientation) / 2;

  let net_displacement = f32(has_head(segment)) * head_displacement + f32(has_tail(segment)) * tail_displacement;
  let position =  segment.position + 0.5 * net_displacement;

  segments[idx].position = position;
  segments[idx].orientation = normalize_safely(head.position - tail.position);
}

fn steric_potential_update(idx: u32, segments: ptr<storage, array<Segment>, read_write>) {
  let segment = segments[idx];
  
  if (idx >= arrayLength(segments)) {
    return;
  }

  for (var t=-controls.equilibrium_line_distance / 2; t <= controls.equilibrium_line_distance / 2; t += 1.0) {
    let position = segment.position + t * segment.orientation;
    store_texture(steric_potential, segment.subtype, as_vec2i(position), 1.0);
    store_texture_index(SEGMENT_INDEX, as_vec2i(position), idx + 1);
  }
}

@compute @workgroup_size(256)
fn steric_force_updates(@builtin(global_invocation_id) id : vec3u) {
  steric_force_update(id.x, &membrane, array<f32, STERIC_POTENTIAL_DIM>(1.0, 1.0, 10.0));
}

@compute @workgroup_size(256)
fn orientation_updates(@builtin(global_invocation_id) id : vec3u) {
  orientation_update(id.x, &membrane, controls.stiffness);
}

@compute @workgroup_size(256)
fn line_constraint_updates(@builtin(global_invocation_id) id : vec3u) {
  line_constraint_update(id.x, &membrane);
}

@compute @workgroup_size(256)
fn steric_potential_updates(@builtin(global_invocation_id) id : vec3u) {
  steric_potential_update(id.x, &membrane);
}


@compute @workgroup_size(16, 16)
fn update_textures(@builtin(global_invocation_id) id : vec3u) {
  let p = vec2i(id.xy);
  store_texture(steric_potential, TYPE_MEMBRANE, p, gaussian_blur(steric_potential, p, TYPE_MEMBRANE, 2));
  let x = vec2<f32>(p) + vec2<f32>(0.5, 0.5); // center of pixel
  let y = interactions.position;
  let dims = vec2<f32>(canvas.size);
  let distance = length((x - y) - dims * floor((x - y) / dims + 0.5));

  if distance < abs(interactions.size) {
      store_texture(parameter_fields, FOODCLICK, as_vec2i(x), load_texture(parameter_fields, FOODCLICK, p)+1.0);
  }

  store_texture(parameter_fields, FOODCLICK, p, gaussian_blur(parameter_fields, p, FOODCLICK, 1));

}

@compute @workgroup_size(16, 16)
fn clear_textures(@builtin(global_invocation_id) id : vec3u) {
  let p = vec2i(id.xy);

  store_texture(steric_potential, TYPE_MEMBRANE, p, 0.95 * load_texture(steric_potential, TYPE_MEMBRANE, p));
  store_texture(parameter_fields, FOODCLICK, p, 0.99 * load_texture(parameter_fields, FOODCLICK, p));
  
  store_texture_index(SEGMENT_INDEX, p, 0);
  store_texture(parameter_fields, DEBUG, p, 0.0);
}

@compute @workgroup_size(256)
fn reset_membrane(@builtin(global_invocation_id) id : vec3u) {
  let count = arrayLength(&membrane);
  let idx = id.x;
  
  if (idx >= count) {
    return;
  }
  
  let center = vec2<f32>(canvas.size) * 0.5;
  let radius = min(center.x, center.y) * 0.3;
  let angle =  2 * PI * f32(idx) / f32(count);
  membrane[idx].id = idx;
  membrane[idx].subtype = TYPE_MEMBRANE;
  membrane[idx].pass_id = (idx + 2) % 2;
  membrane[idx].position.x = center.x + radius * cos(angle);
  membrane[idx].position.y = center.y + radius * sin(angle);

  membrane[idx].orientation.x = -sin(angle);
  membrane[idx].orientation.y = cos(angle);

  membrane[idx].tail = (idx + count - 1) % count;
  membrane[idx].head = (idx + count + 1) % count;

  // if (random_uniform(idx) < 0.01) {
  //   membrane[idx].head = idx;
  //   membrane[idx+1].tail = idx+1;
  // }
}
