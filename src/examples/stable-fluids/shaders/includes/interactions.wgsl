struct Interactions {
  position: vec2<f32>,
  size: f32,
}

@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].BUFFER.INTERACTIONS) var<uniform> interactions: Interactions;
