struct Canvas {
  size: vec2<i32>,
  pass_id: u32,
  key: vec2<u32>,
}

struct Interactions {
  position: vec2f,
  size: f32,
}

struct Controls {
  parameter: vec4f,
}

@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].BUFFER.CANVAS) var<uniform> canvas: Canvas;
@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].BUFFER.CONTROLS) var<uniform> controls: Controls;
@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].BUFFER.INTERACTIONS) var<uniform> interactions: Interactions;
