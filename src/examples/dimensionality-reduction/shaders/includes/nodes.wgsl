struct Node {
    id: u32,
    position: vec2<f32>,
    orientation: vec2<f32>,
    features: vec3<f32>
}

@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].BUFFER.NODES)
var<storage, read_write> nodes: array<Node>;
