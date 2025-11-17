#import includes::bindings
#import includes::nodes
#import includes::interactions
#import includes::textures
#import includes::canvas
#import includes::controls

const PI = 3.14159265358979323846;

@compute @workgroup_size(256)
fn line_constraint_updates(@builtin(global_invocation_id) id : vec3u) {
  line_constraint_update(id.x, &nodes);
}

@compute @workgroup_size(256)
fn curvature_updates(@builtin(global_invocation_id) id : vec3u) {
  curvature_update(id.x, &nodes, controls.stiffness);
}

fn line_constraint_update(idx: u32, nodes: ptr<storage, array<Node>, read_write>) {
  let node = nodes[idx];
  
  if (node.pass_id != canvas.pass_id || is_disconnected(node) || idx >= arrayLength(nodes)) {
    return;
  }

  let tail = nodes[node.tail];
  let head = nodes[node.head];
  
  let tail_displacement = tail.position - node.position + controls.line_distance * (node.orientation + tail.orientation) / 2;
  let head_displacement = head.position - node.position - controls.line_distance * (node.orientation + head.orientation) / 2;

  let net_displacement = f32(has_head(node)) * head_displacement + f32(has_tail(node)) * tail_displacement;
  let position =  node.position + 0.5 * net_displacement;

  nodes[idx].position = position;
}

fn biharmonic_operator(idx: u32, nodes: ptr<storage, array<Node>, read_write>) -> vec2<f32> {

  var node = nodes[idx];

  if (is_disconnected(node)) {
    return vec2<f32>(0.0, 0.0);
  }

  let tail = nodes[node.tail];
  let head = nodes[node.head];

  if (is_disconnected(tail) || is_disconnected(head)) {
    return vec2<f32>(0.0, 0.0);
  }

  return nodes[head.head].orientation - 2*head.orientation + 2*tail.orientation - nodes[tail.tail].orientation;
}

fn curvature_update(idx: u32, nodes: ptr<storage, array<Node>, read_write>, stiffness: f32) {
  if (idx >= arrayLength(nodes)) {
    return;
  }

  nodes[idx].orientation = rotate( nodes[idx].orientation, -stiffness * length(biharmonic_operator(idx, nodes)));
}

@compute @workgroup_size(256)
fn initialize_chains(@builtin(global_invocation_id) id : vec3u) {
  let count = arrayLength(&nodes);
  let idx = id.x;
  
  if (idx >= count) {
    return;
  }
  
  let center = vec2<f32>(canvas.size) * 0.5;
  let radius = min(center.x, center.y) * 0.3;
  let angle =  2 * PI * f32(idx) / f32(count);

  nodes[idx].id = idx;
  nodes[idx].pass_id = idx % 2;

  nodes[idx].position.x = center.x + radius * cos(angle);
  nodes[idx].position.y = center.y + radius * sin(angle);

  nodes[idx].orientation.x = -sin(angle);
  nodes[idx].orientation.y = cos(angle);

  nodes[idx].tail = (idx + count - 1) % count;
  nodes[idx].head = (idx + count + 1) % count;

  // cut the chain at idx 0
  disconnect_from_head(0, &nodes);
}

@compute @workgroup_size(256)
fn draw(@builtin(global_invocation_id) id: vec3<u32>) {

    if (id.x >= arrayLength(&nodes)) {
        return;
    }

    let position = nodes[id.x].position;
    let orientation = nodes[id.x].orientation;
    let pass_id = nodes[id.x].pass_id;

    for (var t = -controls.line_distance/2; t <= controls.line_distance/2; t+=1.0) {
        let x = vec2i(position + orientation * f32(t));

        textureStore(render_texture, x, 0, vec4<f32>(1, 0, 0, 0));
        textureStore(render_texture, x, 1, vec4<f32>(f32(pass_id), 0, 0, 0));
    }
}

@compute @workgroup_size(16, 16)
fn clear(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x >= u32(canvas.size.x) || id.y >= u32(canvas.size.y)) {
        return;
    }

    textureStore(render_texture, id.xy, 0, vec4<f32>(0, 0, 0, 0));
    textureStore(render_texture, id.xy, 1, vec4<f32>(0, 0, 0, 0));
}

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

fn cross(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x * b.y - a.y * b.x, a.y * b.x - a.x * b.y);
}