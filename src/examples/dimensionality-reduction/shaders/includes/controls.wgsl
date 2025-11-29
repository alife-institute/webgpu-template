struct Controls {
  compute_steps: u32,
  line_distance: f32,
  stiffness: f32,
}

@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].BUFFER.CONTROLS) var<uniform> controls: Controls;
