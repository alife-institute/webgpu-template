struct Node {
    id: u32,
    pass_id: u32,
    position: vec2<f32>,
    force: vec2<f32>,
    tail: u32,
    head: u32,
}

fn is_disconnected(node: Node) -> bool {
  return node.tail == node.id && node.head == node.id;
}

fn is_head(node: Node) -> bool {
  return node.tail != node.id && node.head == node.id;
}

fn is_tail(node: Node) -> bool {
  return node.tail == node.id && node.head != node.id;
}

fn has_connection(node: Node) -> bool {
  return node.tail != node.id || node.head != node.id;
}

fn has_head(node: Node) -> bool {
  return node.head != node.id;
}

fn has_tail(node: Node) -> bool {
  return node.tail != node.id;
}

fn has_both_connections(node: Node) -> bool {
  return node.tail != node.id && node.head != node.id;
}

fn disconnect_from_head(idx: u32, nodes: ptr<storage, array<Node>, read_write>) {
  let node = nodes[idx];

  nodes[node.head].tail = nodes[node.head].id;
  nodes[idx].head = node.id;
}

fn disconnect_from_tail(idx: u32, nodes: ptr<storage, array<Node>, read_write>) {
  let node = nodes[idx];

  nodes[node.tail].head = nodes[node.tail].id;
  nodes[idx].tail = node.id;
}

@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].BUFFER.NODES)
var<storage, read_write> nodes: array<Node>;
