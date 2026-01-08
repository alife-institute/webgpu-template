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
    code: string,
    device: GPUDevice,
    bufferDescriptor: {
      label?: string;
      size?: GPUSize64;
      usage: GPUBufferUsageFlags;
    }
  ) {
    this.device = device;
    this.definition = Struct.definitionFromWGSL(code, bufferDescriptor.size);

    let currentOffset = 0;
    let maxAlignment = 0;
    const fieldOffsets: Record<string, number> = {};

    // Note: Object.keys order is not guaranteed, but modern JS engines
    // preserve insertion order for non-numeric keys. For guaranteed
    // layout, you might prefer an array of [key, type] tuples.
    const fields = Object.keys(this.definition);

    for (const fieldName of fields) {
      const fieldType = this.definition[fieldName];

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

          // Write the updated component to GPU buffer immediately
          const componentData = new Uint8Array(this._buffer, componentOffset, baseTypeSize);
          this.device.queue.writeBuffer(this._gpubuffer, componentOffset, componentData);
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

  /**
   * Parses a WGSL struct definition string into a definition object.
   * @param wgslCode A string containing a WGSL struct definition.
   * @returns A Record mapping field names to WgslTypeDescriptor objects.
   */
  public static definitionFromWGSL(
    wgslCode: string,
    size?: number
  ): Record<string, WgslTypeDescriptor> {
    const definition: Record<string, WgslTypeDescriptor> = {};

    const structMatch = wgslCode.match(/struct\s+\w+\s*\{([^}]*)\}/s);
    if (structMatch) {
      const fieldsBlock = structMatch[1];
      // Split by semicolons or newlines, avoiding splitting inside angle brackets
      const fieldLines: string[] = [];
      let currentLine = "";
      let bracketDepth = 0;
      
      for (let i = 0; i < fieldsBlock.length; i++) {
        const char = fieldsBlock[i];
        if (char === "<") bracketDepth++;
        if (char === ">") bracketDepth--;
        
        if ((char === ";" || char === "," || char === "\n") && bracketDepth === 0) {
          if (currentLine.trim()) fieldLines.push(currentLine.trim());
          currentLine = "";
        } else {
          currentLine += char;
        }
      }
      if (currentLine.trim()) fieldLines.push(currentLine.trim());

      for (const line of fieldLines) {
        const fieldMatch = line.match(/^(\w+)\s*:\s*(.+)$/);
        if (!fieldMatch) continue;

        const [, fieldName, typeName] = fieldMatch;
        const typeDescriptor = Struct.parseWGSLType(typeName.trim());
        definition[fieldName] = typeDescriptor;
      }

      return definition;
    } else {
      // If no struct block found, look for storage variable definitions
      // Pattern: var<storage, ...> variable_name : array<TYPE>;
      // Need to handle nested angle brackets like array<vec4<u32>>
      const storageVarMatch = wgslCode.match(
        /var\s*<\s*storage\s*[^>]*>\s*(\w+)\s*:\s*array\s*<\s*(.+?)\s*>\s*;/
      );
      if (storageVarMatch) {
        const [, varName, arrayItemType] = storageVarMatch;
        const typeDescriptor = Struct.parseWGSLType(arrayItemType.trim());

        // If it's a vector type, expand it into component fields (x, y, z, w)
        if (typeDescriptor.componentCount > 1 && typeDescriptor.name.startsWith("vec")) {
          const componentNames = ["x", "y", "z", "w"];
          const scalarType = Struct.parseWGSLType(typeDescriptor.baseType);

          for (let i = 0; i < typeDescriptor.componentCount; i++) {
            // If size is provided, create array fields for each component
            definition[componentNames[i]] =
              size !== undefined ? array(scalarType, size) : scalarType;
          }
        } else {
          definition[varName] = size !== undefined ? array(typeDescriptor, size) : typeDescriptor;
        }

        return definition;
      }

      throw new Error(
        "Invalid WGSL struct definition: could not find struct block or storage variable definition"
      );
    }
  }

  /**
   * Helper method to parse WGSL type names into WgslTypeDescriptor objects.
   * @param typeName The WGSL type name (e.g., "f32", "vec2<f32>", "mat4x4<f32>").
   * @returns The corresponding WgslTypeDescriptor.
   */
  private static parseWGSLType(typeName: string): WgslTypeDescriptor {
    const scalarTypes: Record<string, WgslTypeDescriptor> = {
      f32: f32,
      u32: u32,
      i32: i32,
      f16: f16,
      bool: bool,
    };

    if (typeName in scalarTypes) {
      return scalarTypes[typeName];
    }

    const vecMatch = typeName.match(/^vec([234])<(\w+)>$/);
    if (vecMatch) {
      const n = parseInt(vecMatch[1]) as 2 | 3 | 4;
      const elementType = Struct.parseWGSLType(vecMatch[2]);
      return vec(n, elementType);
    }

    const matMatch = typeName.match(/^mat([234])x([234])<(\w+)>$/);
    if (matMatch) {
      const c = parseInt(matMatch[1]) as 2 | 3 | 4;
      const r = parseInt(matMatch[2]) as 2 | 3 | 4;
      const elementType = Struct.parseWGSLType(matMatch[3]);
      return mat(c, r, elementType);
    }

    const arrayMatch = typeName.match(/^array<(.+),\s*(\d+)>$/);
    if (arrayMatch) {
      const elementType = Struct.parseWGSLType(arrayMatch[1].trim());
      const count = parseInt(arrayMatch[2]);
      return array(elementType, count);
    }

    throw new Error(`Unsupported WGSL type: ${typeName}`);
  }
}

/**
 * Parses WGSL bindings definition code and generates a TypeScript bindings structure.
 * @param wgslCode WGSL code containing GROUP_INDEX and BINDINGS array definition.
 * @returns A TypeScript array matching the structure used in examples.
 */
export function bindingsFromWGSL(wgslCode: string): Array<{
  GROUP: number;
  BUFFER: Record<string, number>;
  TEXTURE: Record<string, number>;
}> {
  const groupIndexMatch = wgslCode.match(/const\s+GROUP_INDEX\s*=\s*(\d+)/);
  if (!groupIndexMatch) {
    throw new Error("Could not find GROUP_INDEX constant in WGSL code");
  }
  const groupIndex = parseInt(groupIndexMatch[1]);

  const bufferBindingsMatch = wgslCode.match(/BufferBindings\s*\(([^)]+)\)/);
  if (!bufferBindingsMatch) {
    throw new Error("Could not find BufferBindings initialization");
  }

  const textureBindingsMatch = wgslCode.match(/TextureBindings\s*\(([^)]+)\)/);
  if (!textureBindingsMatch) {
    throw new Error("Could not find TextureBindings initialization");
  }

  const bufferStructMatch = wgslCode.match(/struct\s+BufferBindings\s*\{([^}]+)\}/s);
  if (!bufferStructMatch) {
    throw new Error("Could not find BufferBindings struct definition");
  }

  const textureStructMatch = wgslCode.match(/struct\s+TextureBindings\s*\{([^}]+)\}/s);
  if (!textureStructMatch) {
    throw new Error("Could not find TextureBindings struct definition");
  }

  const bufferFields = bufferStructMatch[1]
    .split(/[,;\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^(\w+)\s*:\s*i32/);
      return match ? match[1] : null;
    })
    .filter((name) => name !== null) as string[];

  const textureFields = textureStructMatch[1]
    .split(/[,;\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^(\w+)\s*:\s*i32/);
      return match ? match[1] : null;
    })
    .filter((name) => name !== null) as string[];

  const bufferValues = bufferBindingsMatch[1].split(",").map((v) => parseInt(v.trim()));

  const textureValues = textureBindingsMatch[1].split(",").map((v) => parseInt(v.trim()));

  const BUFFER: Record<string, number> = {};
  bufferFields.forEach((field, index) => {
    BUFFER[field] = bufferValues[index];
  });

  const TEXTURE: Record<string, number> = {};
  textureFields.forEach((field, index) => {
    TEXTURE[field] = textureValues[index];
  });

  return [
    {
      GROUP: groupIndex,
      BUFFER,
      TEXTURE,
    },
  ];
}
