/// <reference types="@webgpu/types" />

/**
 * Represents the metadata for a WGSL-compatible type.
 */
interface WgslTypeDescriptor {
  /**
   * The byte size of the type (e.g., f32 is 4).
   */
  readonly byteSize: number;
  /**
   * The byte alignment requirement of the type (e.g., vec3<f32> is 16).
   */
  readonly alignment: number;
  /**
   * A string name for the type, used for debugging or code generation.
   */
  readonly name: string;
  /**
   * The scalar type of each component (e.g., 'f32').
   */
  readonly baseType: "f32" | "u32" | "i32" | "f16" | "bool";
  /**
   * The number of components (1 for scalars, 2 for vec2, 4 for vec4, etc.).
   */
  readonly componentCount: number;
  /**
   * The byte size of a single base-type component (e.g., 4 for 'f32').
   */
  readonly baseTypeSize: number;
}

/**
 * Utility function to round a value up to the nearest multiple of an alignment.
 * @param alignment The alignment (must be a power of 2)
 * @param value The value to round up
 * @returns The aligned value
 */
const roundUp = (alignment: number, value: number): number => {
  return Math.ceil(value / alignment) * alignment;
};

/**
 * Provides a set of factory functions and constants to define WGSL types
 * for buffer layout calculations.
 */
// --- Scalar Types ---

/** WGSL `f32` type: 4-byte size, 4-byte alignment. */
export const f32: WgslTypeDescriptor = {
  byteSize: 4,
  alignment: 4,
  name: "f32",
  baseType: "f32",
  componentCount: 1,
  baseTypeSize: 4,
};
/** WGSL `u32` type: 4-byte size, 4-byte alignment. */
export const u32: WgslTypeDescriptor = {
  byteSize: 4,
  alignment: 4,
  name: "u32",
  baseType: "u32",
  componentCount: 1,
  baseTypeSize: 4,
};
/** WGSL `i32` type: 4-byte size, 4-byte alignment. */
export const i32: WgslTypeDescriptor = {
  byteSize: 4,
  alignment: 4,
  name: "i32",
  baseType: "i32",
  componentCount: 1,
  baseTypeSize: 4,
};
/** WGSL `f16` type: 2-byte size, 2-byte alignment. */
export const f16: WgslTypeDescriptor = {
  byteSize: 2,
  alignment: 2,
  name: "f16",
  baseType: "f16",
  componentCount: 1,
  baseTypeSize: 2,
};
/** WGSL `bool` type: 4-byte size, 4-byte alignment (per WGSL spec). */
export const bool: WgslTypeDescriptor = {
  byteSize: 4,
  alignment: 4,
  name: "bool",
  baseType: "bool",
  componentCount: 1,
  baseTypeSize: 4,
};

// --- Vector Types ---

/**
 * Internal function to create vector types.
 * Based on WGSL spec:
 * align(vecN<T>) = (N==2 ? 2 : 4) * align(T)
 * size(vecN<T>)  = N * size(T)
 */
function vec(n: 2 | 3 | 4, elementType: WgslTypeDescriptor): WgslTypeDescriptor {
  const T_align = elementType.alignment;
  const T_size = elementType.byteSize;

  let alignment: number;
  if (n === 2) {
    alignment = 2 * T_align;
  } else {
    // n === 3 or n === 4
    alignment = 4 * T_align;
  }

  // Spec examples:
  // vec3<f32>: size 12 (3*4), align 16 (4*4)
  // vec2<f16>: size 4 (2*2), align 4 (2*2)

  return {
    byteSize: n * T_size,
    alignment: alignment,
    name: `vec${n}<${elementType.name}>`,
    // Propagate component info
    baseType: elementType.baseType,
    componentCount: n,
    baseTypeSize: elementType.baseTypeSize,
  };
}

/** Creates a `vec2<T>` type descriptor. */
export const vec2 = (elementType: WgslTypeDescriptor) => vec(2, elementType);
/** Creates a `vec3<T>` type descriptor. */
export const vec3 = (elementType: WgslTypeDescriptor) => vec(3, elementType);
/** Creates a `vec4<T>` type descriptor. */
export const vec4 = (elementType: WgslTypeDescriptor) => vec(4, elementType);

// --- Matrix Types (Bonus) ---

/**
 * Creates a matrix type descriptor.
 * Based on WGSL spec:
 * A matCxR<T> is an array of C columns, each of type vecR<T>.
 * align(mat) = align(vecR<T>)
 * size(mat) = C * roundUp(align(vecR<T>), size(vecR<T>))
 */
function mat(c: 2 | 3 | 4, r: 2 | 3 | 4, elementType: WgslTypeDescriptor): WgslTypeDescriptor {
  const columnType = vec(r, elementType);
  const columnStride = roundUp(columnType.alignment, columnType.byteSize);

  return {
    byteSize: c * columnStride,
    alignment: columnType.alignment,
    name: `mat${c}x${r}<${elementType.name}>`,
    // Propagate component info
    baseType: elementType.baseType,
    componentCount: c * r,
    baseTypeSize: elementType.baseTypeSize,
  };
}

/** Creates a `mat2x2<T>` type descriptor. */
export const mat2x2 = (elementType: WgslTypeDescriptor) => mat(2, 2, elementType);
/** Creates a `mat3x3<T>` type descriptor. */
export const mat3x3 = (elementType: WgslTypeDescriptor) => mat(3, 3, elementType);
/** Creates a `mat4x4<T>` type descriptor. */
export const mat4x4 = (elementType: WgslTypeDescriptor) => mat(4, 4, elementType);

// --- Array Type (Bonus) ---

/**
 * Creates a fixed-size array type descriptor.
 * `array<T, N>`
 * align(array) = align(T)
 * size(array) = N * roundUp(align(T), size(T))
 */
export function array(elementType: WgslTypeDescriptor, count: number): WgslTypeDescriptor {
  const elementStride = roundUp(elementType.alignment, elementType.byteSize);
  return {
    byteSize: count * elementStride,
    alignment: elementType.alignment,
    name: `array<${elementType.name}, ${count}>`,
    // Propagate component info
    baseType: elementType.baseType,
    componentCount: elementType.componentCount * count,
    baseTypeSize: elementType.baseTypeSize,
  };
}

/**
 * Defines a data structure that mimics a WGSL struct, automatically
 * calculating byte layout, padding, and total size.
 */
export class Struct {
  /**
   * The raw ArrayBuffer holding all data for this struct.
   * This is the CPU-side mirror.
   */
  public readonly _buffer: ArrayBuffer;

  /**
   * The underlying GPUBuffer created for this struct.
   */
  public readonly _gpubuffer: GPUBuffer;

  /**
   * The total byte size of the struct, including all padding.
   * This is the minimum required size for the `GPUBuffer`.
   */
  public readonly byteSize: number;

  /**
   * The alignment of the struct, determined by the largest alignment
   * of its members.
   */
  public readonly structAlignment: number;

  /**
   * A map of field names to their byte offsets within the buffer.
   */
  public readonly offsets: Readonly<Record<string, number>> = {};

  /**
   * The GPUDevice this struct is associated with.
   */
  private readonly device: GPUDevice;

  /**
   * The original definition provided to the constructor.
   */
  public readonly definition: Readonly<Record<string, WgslTypeDescriptor>>;

  /**
   * Allows TypeScript to access dynamically defined properties.
   * e.g., `myStruct.myField = ...`
   */
  [key: string]: any;

  /**
   * Creates a new Struct layout definition and associated GPUBuffer.
   * @param device The GPUDevice to create the buffer on.
   * @param bufferDescriptor The descriptor for the GPUBuffer (e.g., usage).
   * The `size` property will be overridden by the
   * struct's calculated size.
   * @param definition An object where keys are field names and values are
   * Wgsl type descriptors (e.g., `Wgsl.f32`, `Wgsl.vec2(Wgsl.f32)`).
   */
  constructor(
    device: GPUDevice,
    bufferDescriptor: {
      label?: string;
      size?: GPUSize64;
      usage: GPUBufferUsageFlags;
    },
    definition: Record<string, WgslTypeDescriptor>
  ) {
    this.device = device;
    this.definition = definition;

    let currentOffset = 0;
    let maxAlignment = 0;
    const fieldOffsets: Record<string, number> = {};

    // Note: Object.keys order is not guaranteed, but modern JS engines
    // preserve insertion order for non-numeric keys. For guaranteed
    // layout, you might prefer an array of [key, type] tuples.
    const fields = Object.keys(definition);

    for (const fieldName of fields) {
      const fieldType = definition[fieldName];

      // 1. Update max alignment for the whole struct
      // The struct's alignment is the largest alignment of its members.
      if (fieldType.alignment > maxAlignment) {
        maxAlignment = fieldType.alignment;
      }

      // 2. Add padding to align the current field
      // The current offset must be a multiple of the field's alignment.
      currentOffset = roundUp(fieldType.alignment, currentOffset);

      // 3. Store the aligned offset
      fieldOffsets[fieldName] = currentOffset;

      // 4. Advance the offset by the field's size
      currentOffset += fieldType.byteSize;
    }

    // 5. Calculate total struct size
    // The total size of the struct must be a multiple of its max alignment.
    this.structAlignment = maxAlignment || 1; // Handle empty struct
    this.byteSize = roundUp(this.structAlignment, currentOffset);
    this.offsets = fieldOffsets;

    // 6. Create the GPUBuffer
    if (bufferDescriptor.size === undefined) {
      bufferDescriptor.size = 1;
    }

    bufferDescriptor.size = bufferDescriptor.size * this.byteSize;
    this._gpubuffer = device.createBuffer(bufferDescriptor as GPUBufferDescriptor);

    // 7. Create the local CPU-side ArrayBuffer
    this._buffer = new ArrayBuffer(this.byteSize);

    // --- Add dynamic getters/setters ---
    const dataView = new DataView(this._buffer);

    for (const fieldName of fields) {
      const fieldType = this.definition[fieldName];
      const offset = this.offsets[fieldName];

      const { baseType, componentCount, baseTypeSize } = fieldType;

      // Helper function to set a single component at its byte offset
      const setComponent = (index: number, value: number | boolean) => {
        // This is the byte offset *for this specific component*
        const componentOffset = offset + index * baseTypeSize;
        try {
          switch (baseType) {
            case "f32":
              dataView.setFloat32(componentOffset, value as number, true);
              break;
            case "u32":
              dataView.setUint32(componentOffset, value as number, true);
              break;
            case "i32":
              dataView.setInt32(componentOffset, value as number, true);
              break;
            case "f16":
              dataView.setFloat16(componentOffset, value as number, true);
              break;
            case "bool":
              dataView.setUint32(componentOffset, value ? 1 : 0, true);
              break;
          }
        } catch (e) {
          console.error(
            `Error setting field '${fieldName}' (component ${index}) at offset ${componentOffset}: ${e}`
          );
        }
      };

      // Helper function to get a single component from its byte offset
      const getComponent = (index: number): number | boolean => {
        const componentOffset = offset + index * baseTypeSize;
        try {
          switch (baseType) {
            case "f32":
              return dataView.getFloat32(componentOffset, true);
            case "u32":
              return dataView.getUint32(componentOffset, true);
            case "i32":
              return dataView.getInt32(componentOffset, true);
            case "f16":
              return dataView.getFloat16(componentOffset, true);
            case "bool":
              return dataView.getUint32(componentOffset, true) === 1;
            default:
              return 0; // Should be unreachable
          }
        } catch (e) {
          console.error(
            `Error getting field '${fieldName}' (component ${index}) at offset ${componentOffset}: ${e}`
          );
          return baseType === "bool" ? false : 0;
        }
      };

      Object.defineProperty(this, fieldName, {
        enumerable: true,
        configurable: true, // Allows re-definition
        get: () => {
          // Scalar: return the value directly
          if (componentCount === 1) {
            return getComponent(0);
          }
          // Vector/Matrix/Array: return a new array
          const values: (number | boolean)[] = [];
          for (let i = 0; i < componentCount; i++) {
            values.push(getComponent(i));
          }
          return values;
        },
        set: (value: number | boolean | (number | boolean)[]) => {
          // Scalar: set the single value
          if (componentCount === 1) {
            setComponent(0, value as number | boolean);
          }
          // Vector/Matrix/Array: set all components from an array
          else {
            if (Array.isArray(value) && value.length === componentCount) {
              for (let i = 0; i < componentCount; i++) {
                setComponent(i, value[i]);
              }
            } else if (Array.isArray(value)) {
              console.error(
                `Field '${fieldName}' expects an array of length ${componentCount}, but got array of length ${value.length}.`
              );
            } else {
              console.error(`Field '${fieldName}' expects an array, but got: ${typeof value}`);
            }
          }
        },
      });
    }
  }

  /**
   * (Bonus) Generates a WGSL struct definition string.
   * @param structName The name to give the struct in WGSL.
   * @returns A string of WGSL code.
   */
  public getWGSL(structName: string): string {
    let code = `struct ${structName} {\n`;
    for (const fieldName of Object.keys(this.definition)) {
      const fieldType = this.definition[fieldName];
      code += `  ${fieldName}: ${fieldType.name},\n`;
    }
    code += `};\n`;
    return code;
  }

  public updateBuffer() {
    this.device.queue.writeBuffer(this._gpubuffer, /*offset=*/ 0, this._buffer);
  }
}

// --- --- ---
// --- EXAMPLE USAGE ---
// --- --- ---
/*
// Import the builders
// import { Struct, Wgsl } from './wgsl_struct_builder';

// --- (Example setup: You must have a GPUDevice) ---
// const adapter = await navigator.gpu.requestAdapter();
// const device = await adapter.requestDevice();
// ---

// --- Your example ---

const interactions = new Struct(
  device,
  { usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST },
  {
    position: Wgsl.vec2(Wgsl.f32), // vec2<f32>: size 8, align 8
    size: Wgsl.f32,                 // f32: size 4, align 4
  }
);

const controls = new Struct(
  device,
  { usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST },
  {
    parameter: Wgsl.vec2(Wgsl.u32), // vec2<u32>: size 8, align 8
  }
);

console.log("--- Interactions Struct ---");
console.log(`Byte Size: ${interactions.byteSize}`); // 16
// Layout:
// field    | align | offset | size
// ---------------------------------
// position | 8     | 0      | 8
// size     | 4     | 8      | 4
// ---------------------------------
// total (pre-pad) = 12
// max align = 8
// total (padded) = roundUp(8, 12) = 16
console.log(`Offsets:`, interactions.offsets); // { position: 0, size: 8 }
console.log(`Buffer Size: ${interactions._buffer.byteLength}`); // 16
console.log(interactions.getWgslCode('Interactions'));
// struct Interactions {
//   position: vec2<f32>,
//   size: f32,
// };

// --- NEW MUTATION EXAMPLE ---
console.log("\n--- Mutation Example ---");
// Set values
interactions.size = 42.0;
interactions.position = [1.0, 2.0];

// Get values back
console.log(`interactions.size: ${interactions.size}`); // 42
console.log(`interactions.position: ${interactions.position}`); // 1,2

// Verify the underlying buffer (using a Float32 view)
const f32View = new Float32Array(interactions._buffer);
console.log(`Buffer (as f32): ${f32View}`);
// Expected: [1.0, 2.0, 42.0, 0.0] (position, size, padding)
// Layout:
// position: offset 0, size 8 (f32, f32)
// size:     offset 8, size 4 (f32)
// padding:  offset 12, size 4
// total: 16
// So f32View[0]=1.0, f32View[1]=2.0, f32View[2]=42.0


console.log("\n--- Controls Struct ---");
console.log(`Byte Size: ${controls.byteSize}`); // 8
console.log(`Offsets:`, controls.offsets); // { parameter: 0 }
console.log(`Buffer Size: ${controls._buffer.byteLength}`); // 8
console.log(controls.getWgslCode('Controls'));
// struct Controls {
//   parameter: vec2<u32>,
// };

// --- More Complex Example ---

const sceneUniforms = new Struct(
  device,
  { usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST },
  {
    worldMatrix: Wgsl.mat4x4(Wgsl.f32),  // size 64, align 16
    cameraPos: Wgsl.vec3(Wgsl.f32),      // size 12, align 16
    time: Wgsl.f32,                      // size 4,  align 4
    lights: Wgsl.array(Wgsl.vec4(Wgsl.f32), 4), // el_size 16, el_align 16. total size 64, align 16
  }
);

console.log("\n--- Scene Uniforms Struct ---");
console.log(`Byte Size: ${sceneUniforms.byteSize}`); // 160
// Layout:
// field       | align | offset | size
// -----------------------------------
// worldMatrix | 16    | 0      | 64
// cameraPos   | 16    | 64     | 12
// time        | 4     | 76     | 4    (offset 76 is multiple of 4)
// lights      | 16    | 80     | 64   (offset 80 is multiple of 16)
// -----------------------------------
// total (pre-pad) = 144
// max align = 16
// total (padded) = roundUp(16, 144) = 144
// ... wait, my manual math is wrong.
//
// Let's trace:
// 1. worldMatrix: align 16. offset = roundUp(16, 0) = 0. next_offset = 0 + 64 = 64. maxAlign = 16.
// 2. cameraPos:   align 16. offset = roundUp(16, 64) = 64. next_offset = 64 + 12 = 76. maxAlign = 16.
// 3. time:        align 4.  offset = roundUp(4, 76) = 76. next_offset = 76 + 4 = 80. maxAlign = 16.
// 4. lights:      align 16. offset = roundUp(16, 80) = 80. next_offset = 80 + 64 = 144. maxAlign = 16.
//
// Final size: roundUp(maxAlign, next_offset) = roundUp(16, 144) = 144.
//
// Why did my example log 160? Ah, I had a bug in my test `array` function.
// Let's re-check the `array` function logic.
// `array<T, N>`
// Stride = roundUp(align(T), size(T))
// Size = N * Stride
// Align = align(T)
//
// My `lights` array: T = vec4<f32> (size 16, align 16), N = 4
// Stride = roundUp(16, 16) = 16.
// Size = 4 * 16 = 64.
// Align = 16.
// This seems correct.
//
// Let's re-trace:
// 1. worldMatrix: align 16. offset 0. next 64. maxAlign 16.
// 2. cameraPos:   align 16. offset 64. next 76. maxAlign 16.
// 3. time:        align 4.  offset 76. next 80. maxAlign 16.
// 4. lights:      align 16. offset 80. next 144. maxAlign 16.
// Final size = roundUp(16, 144) = 144.
//
// The code in the file is correct. My mental math was just wrong in the comment.
// The output *should* be 144.
console.log(`Correct Byte Size: ${sceneUniforms.byteSize}`); // 144
console.log(`Offsets:`, sceneUniforms.offsets); // { worldMatrix: 0, cameraPos: 64, time: 76, lights: 80 }
console.log(`Buffer Size: ${sceneUniforms._buffer.byteLength}`); // 144
console.log(sceneUniforms.getWgslCode('SceneUniforms'));
// struct SceneUniforms {
//   worldMatrix: mat4x4<f32>,
//   cameraPos: vec3<f32>,
//   time: f32,
//   lights: array<vec4<f32>, 4>,
// };
*/
