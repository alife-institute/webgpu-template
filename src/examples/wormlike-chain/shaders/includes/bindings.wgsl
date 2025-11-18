struct Bindings {
  GROUP_INDEX: i32,
  BUFFER: BufferBindings,
  TEXTURE: TextureBindings,
}

struct BufferBindings {
  CANVAS: i32,
  INTERACTIONS: i32,
  CONTROLS: i32,
  NODES: i32,
}

struct TextureBindings {
  PARAMETERS: i32,
  RENDER: i32,
}

const GROUP_INDEX = 0;
const BINDINGS = array<Bindings, 1>(
  Bindings(
    GROUP_INDEX,
    BufferBindings(0,1,2,3),
    TextureBindings(4,5),
));
