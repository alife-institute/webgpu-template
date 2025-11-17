struct Controls {
  parameter: vec4<f32>,
}

@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].BUFFER.CONTROLS) var<uniform> controls: Controls;
