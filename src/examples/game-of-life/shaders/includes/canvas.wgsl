struct Canvas {
  size: vec2<i32>,
  pass_id: u32,
  key: vec2<u32>,
}

@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].BUFFER.CANVAS) var<uniform> canvas: Canvas;
