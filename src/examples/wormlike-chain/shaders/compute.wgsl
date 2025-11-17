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

const EPS = 1e-37;
fn normalize_safely(x: vec2<f32>) -> vec2<f32> {
  return x / max(length(x), EPS);
}

fn line_constraint_update(idx: u32, nodes: ptr<storage, array<Node>, read_write>) {
  let node = nodes[idx];

  if (node.pass_id != canvas.pass_id || is_disconnected(node) || idx >= arrayLength(nodes)) {
    return;
  }

  var position_update = vec2<f32>(0.0, 0.0);

  if has_tail(node) {
    let tail = nodes[node.tail];
    let x = tail.position - node.position;
    position_update += 0.5 * (length(x) - controls.line_distance) * normalize_safely(x);
  }

  if has_head(node) {
    let head = nodes[node.head];
    let y = head.position - node.position;
    position_update += 0.5 * (length(y) - controls.line_distance) * normalize_safely(y);
  }

  nodes[idx].position += position_update;
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

  return nodes[tail.tail].position - 4*tail.position + 6*nodes[idx].position - 4*head.position + nodes[head.head].position;
}

fn curvature_update(idx: u32, nodes: ptr<storage, array<Node>, read_write>, stiffness: f32) {
  if (idx >= arrayLength(nodes)) {
    return;
  }

  nodes[idx].position += -stiffness * biharmonic_operator(idx, nodes);
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

  nodes[idx].force = vec2<f32>(0.0, 0.0);

  nodes[idx].tail = (idx + count - 1) % count;
  nodes[idx].head = (idx + count + 1) % count;

  // cut the chain at idx 0
  if (idx == 0) {
    nodes[idx].head = idx;
    nodes[idx + 1].tail = idx + 1;
  }
}

@compute @workgroup_size(256)
fn draw(@builtin(global_invocation_id) id: vec3<u32>) {

    if (id.x >= arrayLength(&nodes)) {
        return;
    }

    let position = nodes[id.x].position;
    let pass_id = nodes[id.x].pass_id;

    for (var offset_x: i32 = -2; offset_x <= 2; offset_x += 1) {
        for (var offset_y: i32 = -2; offset_y <= 2; offset_y += 1) {
            let pos = vec2i(position) + vec2<i32>(offset_x, offset_y);
            if (pos.x >= 0 && pos.x < canvas.size.x && pos.y >= 0 && pos.y < canvas.size.y) {
                textureStore(render_texture, pos, 0, vec4<f32>(1, 0, 0, 0));
                textureStore(render_texture, pos, 1, vec4<f32>(f32(pass_id), 0, 0, 0));
            }
        }
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
