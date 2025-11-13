@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].TEXTURE.VELOCITY) var velocity: texture_storage_2d_array<r32float, read_write>;
@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].TEXTURE.PRESSURE) var pressure: texture_storage_2d<r32float, read_write>;
@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].TEXTURE.DIVERGENCE) var divergence: texture_storage_2d<r32float, read_write>;
@group(GROUP_INDEX) @binding(BINDINGS[GROUP_INDEX].TEXTURE.DYE) var dye: texture_storage_2d<r32float, read_write>;
