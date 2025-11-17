#import includes::bindings
#import includes::nodes
#import includes::interactions
#import includes::textures
#import includes::canvas
#import includes::controls

const PI = 3.14159265358979323846;
const dt = 0.1;

@compute @workgroup_size(256)
fn line_constraint_updates(@builtin(global_invocation_id) id : vec3u) {
  line_constraint_update(id.x, &nodes);
}

@compute @workgroup_size(256)
fn curvature_updates(@builtin(global_invocation_id) id : vec3u) {
  curvature_update(id.x, &nodes, 0.0);
}

const EPS = 1e-37;
fn normalize_safely(x: vec2<f32>) -> vec2<f32> {
  return x / max(length(x), EPS);
}

fn line_constraint_update(idx: u32, nodes: ptr<storage, array<Node>, read_write>) {
  let node = nodes[idx];

  if (node.pass_id != canvas.pass_id || is_disconnected(node) || idx >= arrayLength(nodes)) {
    return;
  }

  let tail = nodes[node.tail];
  let head = nodes[node.head];

  let x = tail.position - node.position;
  let y = head.position - node.position;

  nodes[idx].position += 0.5 * ( (length(x) - controls.line_distance) * normalize_safely(x)
                               + (length(y) - controls.line_distance) * normalize_safely(y));
}

fn biharmonic_operator(idx: u32, nodes: ptr<storage, array<Node>, read_write>) -> vec2<f32> {
  
  var node = nodes[idx];
  let tail = nodes[node.tail];
  let head = nodes[node.head];

  let ds = 1.0;

  return (nodes[tail.tail].position - 4*tail.position + 6*nodes[idx].position - 4*head.position + nodes[head.head].position) / pow(ds, 4.0);
}

fn curvature_update(idx: u32, nodes: ptr<storage, array<Node>, read_write>, stiffness: f32) {
  if (idx >= arrayLength(nodes)) {
    return;
  }

  nodes[idx].force = - dt * stiffness * biharmonic_operator(idx, nodes);
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
  nodes[idx].pass_id = (idx + 2) % 2;
  nodes[idx].position.x = center.x + radius * cos(angle);
  nodes[idx].position.y = center.y + radius * sin(angle);

  nodes[idx].force = vec2<f32>(0.0, 0.0);

  nodes[idx].tail = (idx + count + 1) % count;
  nodes[idx].head = (idx + count - 1) % count;

  // cut the chain at idx 0
  // if (idx == 0) {
  //   nodes[idx].tail = idx;
  //   nodes[idx + 1].head = idx + 1;
  // }
}

@compute @workgroup_size(256)
fn draw(@builtin(global_invocation_id) id: vec3<u32>) {

    let position = nodes[id.x].position;
    let pass_id = nodes[id.x].pass_id;

    nodes[id.x].position += nodes[id.x].force;
  
    for (var offset_x: i32 = -2; offset_x <= 2; offset_x += 1) {
        for (var offset_y: i32 = -2; offset_y <= 2; offset_y += 1) {
            let pos = vec2i(position) + vec2<i32>(offset_x, offset_y);
            textureStore(render_texture, pos, 0, vec4<f32>(1, 0, 0, 0));
            textureStore(render_texture, pos, 1, vec4<f32>(f32(pass_id), 0, 0, 0));
        }
    }
}

@compute @workgroup_size(16, 16)
fn clear(@builtin(global_invocation_id) id: vec3<u32>) {
    textureStore(render_texture, id.xy, 0, vec4<f32>(0, 0, 0, 0));
    textureStore(render_texture, id.xy, 1, vec4<f32>(0, 0, 0, 0));
}
