struct Bindings {
  GROUP_INDEX: i32,
  BUFFER: BufferBindings,
  TEXTURE: TextureBindings,
}

struct BufferBindings {
  CANVAS: i32,
  INTERACTIONS: i32,
  CONTROLS: i32,
}

struct TextureBindings {
  VELOCITY: i32,
  PRESSURE: i32,
  DIVERGENCE: i32,
  DYE: i32,
}

const GROUP_INDEX = 0;
const BINDINGS = array<Bindings, 1>(
  Bindings(
    GROUP_INDEX,
    BufferBindings(0,1,2),
    TextureBindings(3,4,5,6),
));
