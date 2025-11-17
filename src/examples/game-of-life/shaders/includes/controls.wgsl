struct Controls {
  parameter: vec4f,
}

@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].BUFFER.CONTROLS) var<uniform> controls: Controls;
