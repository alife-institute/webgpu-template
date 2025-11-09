function throwDetectionError(error: string): never {
  (
    document.querySelector(".webgpu-not-supported") as HTMLElement
  ).style.visibility = "visible";
  throw new Error("Could not initialize WebGPU: " + error);
}

export async function requestDevice(
  options: GPURequestAdapterOptions = {
    powerPreference: "high-performance",
  },
  requiredFeatures: GPUFeatureName[] = [],
  requiredLimits: Record<string, undefined | number> = {
    maxStorageTexturesPerShaderStage: 8,
  }
): Promise<GPUDevice> {
  if (!navigator.gpu) throwDetectionError("WebGPU NOT Supported");

  const adapter = await navigator.gpu.requestAdapter(options);
  if (!adapter) throwDetectionError("No GPU adapter found");

  const canTimestamp = adapter.features.has("timestamp-query");
  const features = [...requiredFeatures];

  if (canTimestamp) {
    features.push("timestamp-query");
  }

  return adapter.requestDevice({
    requiredFeatures: features,
    requiredLimits: requiredLimits,
    ...(canTimestamp ? ["timestamp-query"] : []),
  });
}

export function configureCanvas(
  device: GPUDevice,
  id: string,
  size = { width: window.innerWidth, height: window.innerHeight }
): {
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  size: { width: number; height: number };
} {
  const canvas = Object.assign(document.createElement("canvas"), size);
  canvas.id = id;
  document.body.appendChild(canvas);

  const context = canvas.getContext("webgpu");
  if (!context) throwDetectionError("Canvas does not support WebGPU");

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    alphaMode: "premultiplied",
  });

  return { canvas: canvas, context: context, format: format, size: size };
}

export async function createShader(
  device: GPUDevice,
  code: string,
  includes?: Record<string, string>
): Promise<GPUShaderModule> {
  // Process the code with imports
  const processedCode = prependIncludes(code, includes);

  const module = device.createShaderModule({ code: processedCode });
  const info = await module.getCompilationInfo();
  if (info.messages.length > 0) {
    for (let message of info.messages) {
      console.warn(`${message.message} 
  at line ${message.lineNum}`);
    }
    throw new Error(`Could not compile shader`);
  }
  return module;
}

/**
 * Process import statements in shader code to include the content of referenced modules
 * @param code - The shader code containing import statements
 * @param includes - Optional mapping of module names to their content
 * @returns The processed shader code with imports resolved
 */
function prependIncludes(
  code: string,
  includes?: Record<string, string>
): string {
  // Extract import statements
  const importRegex = /^#import\s+([a-zA-Z0-9_]+)::([a-zA-Z0-9_]+)/gm;
  const imports = [...code.matchAll(importRegex)];

  // Build a map of imports to their content
  const includesToAdd: Record<string, string> = {};

  // Process each import
  for (const [fullMatch, namespace, moduleName] of imports) {
    if (namespace === "includes" && includes && moduleName in includes) {
      includesToAdd[fullMatch] = includes[moduleName];
    } else {
      console.warn(`Could not resolve import: ${fullMatch}`);
    }
  }

  // Replace import statements with their content
  let processedCode = code;
  for (const [importStatement, content] of Object.entries(includesToAdd)) {
    // Replace the import statement with the content
    processedCode = processedCode.replace(importStatement, content);
  }

  return processedCode;
}

export async function createPerformanceQueries(device: GPUDevice): Promise<{
  querySet: GPUQuerySet;
  resolveBuffer: GPUBuffer;
  resultBuffer: GPUBuffer;
}> {
  const canTimestamp = device.features.has("timestamp-query");
  // if (!canTimestamp) {
  //   console.warn("Timestamp queries are not supported by this device.");
  //   return {};
  // }
  const querySet = device.createQuerySet({
    type: "timestamp",
    count: 2,
  });

  const resolveBuffer = device.createBuffer({
    size: querySet.count * 8,
    usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
  });

  const resultBuffer = device.createBuffer({
    size: resolveBuffer.size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  return { querySet, resolveBuffer, resultBuffer };
}

export function setupInteractions(
  device: GPUDevice,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  texture: { width: number; height: number },
  size: number = 10
): {
  interactions: {
    data: Float32Array;
    buffer: GPUBuffer;
  };
  controls: {
    data: ArrayBuffer;
    buffer: GPUBuffer;
  };
  type: GPUBufferBindingType;
} {
  let uniformBufferData = new Float32Array(4);
  let controlsBufferData = new ArrayBuffer(64);

  var sign = 1;

  let position = { x: 0, y: 0 };
  let velocity = { x: 0, y: 0 };

  uniformBufferData.set([position.x, position.y]);
  if (canvas instanceof HTMLCanvasElement) {
    // disable context menu
    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    // move events
    ["mousemove", "touchmove"].forEach((type) => {
      canvas.addEventListener(
        type,
        (event) => {
          const rect = canvas.getBoundingClientRect();
          let clientX = 0;
          let clientY = 0;

          if (event instanceof MouseEvent) {
            clientX = event.clientX;
            clientY = event.clientY;
          } else if (event instanceof TouchEvent) {
            if (event.touches.length === 0) return;
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
          }

          position.x = clientX - rect.left;
          position.y = clientY - rect.top;

          // Scale from CSS pixels to texture coordinates
          const x = Math.floor((position.x / rect.width) * texture.width);
          const y = Math.floor((position.y / rect.height) * texture.height);

          uniformBufferData.set([x, y]);
        },
        { passive: true }
      );
    });

    // zoom events TODO(@gszep) add pinch and scroll for touch devices
    ["wheel"].forEach((type) => {
      canvas.addEventListener(
        type,
        (event) => {
          switch (true) {
            case event instanceof WheelEvent:
              velocity.x = event.deltaY;
              velocity.y = event.deltaY;
              break;
          }

          size += velocity.y;
          uniformBufferData.set([size], 2);
        },
        { passive: true }
      );
    });

    // click events TODO(@gszep) implement right click equivalent for touch devices
    ["mousedown", "touchstart"].forEach((type) => {
      canvas.addEventListener(
        type,
        (event) => {
          switch (true) {
            case event instanceof MouseEvent:
              sign = 1 - event.button;
              break;

            case event instanceof TouchEvent:
              sign = event.touches.length > 1 ? -1 : 1;
          }
          uniformBufferData.set([sign * size], 2);
        },
        { passive: true }
      );
    });
    ["mouseup", "touchend"].forEach((type) => {
      canvas.addEventListener(
        type,
        (event) => {
          uniformBufferData.set([NaN], 2);
        },
        { passive: true }
      );
    });
  }
  const uniformBuffer = device.createBuffer({
    label: "Interaction Buffer",
    size: uniformBufferData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const controlsBuffer = device.createBuffer({
    label: "Controls Buffer",
    size: controlsBufferData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  return {
    interactions: { data: uniformBufferData, buffer: uniformBuffer },
    controls: { data: controlsBufferData, buffer: controlsBuffer },
    type: "uniform",
  };
}

export function setupTextures(
  device: GPUDevice,
  bindings: number[],
  data: { [key: number]: number[][][] },
  size: {
    depthOrArrayLayers?: { [key: number]: number };
    width: number;
    height: number;
  },
  format?: { [key: number]: GPUTextureFormat }
): {
  canvas: {
    buffer: GPUBuffer;
    data: Uint32Array;
    type: GPUBufferBindingType;
  };
  textures: { [key: number]: GPUTexture };
  bindingLayout: { [key: number]: GPUStorageTextureBindingLayout };
  size: {
    depthOrArrayLayers?: { [key: number]: number };
    width: number;
    height: number;
  };
} {
  const textures: { [key: number]: GPUTexture } = {};
  const bindingLayout: { [key: number]: GPUStorageTextureBindingLayout } = {};
  const depthOrArrayLayers = size.depthOrArrayLayers || {};
  const DEFAULT_FORMAT = "r32float";

  bindings.forEach((key) => {
    textures[key] = device.createTexture({
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_DST,
      format: format && key in format ? format[key] : DEFAULT_FORMAT,
      size: {
        width: size.width,
        height: size.height,
        depthOrArrayLayers:
          key in depthOrArrayLayers ? depthOrArrayLayers[key] : 1,
      },
    });
  });

  Object.keys(textures).forEach((key) => {
    const layers = key in depthOrArrayLayers ? depthOrArrayLayers[key] : 1;

    bindingLayout[key] = {
      format: format && key in format ? format[key] : DEFAULT_FORMAT,
      access: "read-write",
      viewDimension: layers > 1 ? "2d-array" : "2d",
    };

    const array =
      key in data
        ? new Float32Array(flatten(data[key]))
        : new Float32Array(flatten(zeros(size.height, size.width, layers)));

    const channels = channelCount(bindingLayout[key].format);
    device.queue.writeTexture(
      { texture: textures[key] },
      /*data=*/ array,
      /*dataLayout=*/ {
        offset: 0,
        bytesPerRow: size.width * array.BYTES_PER_ELEMENT * channels,
        rowsPerImage: size.height,
      },
      /*size=*/ {
        width: size.width,
        height: size.height,
        depthOrArrayLayers: layers,
      }
    );
  });

  let canvasData = new Uint32Array([size.width, size.height, 0, 0, 0, 0]);
  const canvasBuffer = device.createBuffer({
    label: "Canvas Buffer",
    size: canvasData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  device.queue.writeBuffer(canvasBuffer, /*offset=*/ 0, /*data=*/ canvasData);

  return {
    canvas: {
      buffer: canvasBuffer,
      data: canvasData,
      type: "uniform",
    },
    textures: textures,
    bindingLayout: bindingLayout,
    size: size,
  };
}

function channelCount(format: GPUTextureFormat): number {
  if (format.includes("rgba")) {
    return 4;
  } else if (format.includes("rgb")) {
    return 3;
  } else if (format.includes("rg")) {
    return 2;
  } else if (format.includes("r")) {
    return 1;
  } else {
    throw new Error("Invalid format: " + format);
  }
}

function flatten(nestedArray: number[][][]): number[] {
  const flattened: number[] = [];
  for (let k = 0; k < nestedArray[0][0].length; k++) {
    for (let i = 0; i < nestedArray.length; i++) {
      for (let j = 0; j < nestedArray[0].length; j++) {
        flattened.push(nestedArray[i][j][k]);
      }
    }
  }

  return flattened;
}

function zeros(
  height: number,
  width: number,
  layers: number = 1
): number[][][] {
  const zeroArray: number[][][] = [];

  for (let i = 0; i < height; i++) {
    const row: number[][] = [];
    for (let j = 0; j < width; j++) {
      const layer: number[] = [];
      for (let k = 0; k < layers; k++) {
        layer.push(0);
      }
      row.push(layer);
    }
    zeroArray.push(row);
  }

  return zeroArray;
}

export function getRandomValues(length: number): Uint32Array {
  // fast cpu-side random number generation

  const maxChunkLength = 65536 / 4;
  const result = new Uint32Array(4 * length);
  for (let i = 0; i < 4 * length; i += maxChunkLength) {
    const chunkLength = Math.min(maxChunkLength, 4 * length - i);
    crypto.getRandomValues(result.subarray(i, i + chunkLength));
  }
  return result;
}

export class PerformanceMonitor {
  private lastTime: number;
  private frameCount: number;
  private framesPerTimeLog: number;
  private fpsDisplay: HTMLElement;

  constructor(framesPerTimeLog: number = 30) {
    this.framesPerTimeLog = framesPerTimeLog;
    this.fpsDisplay = document.getElementById("fpsCounter")!;
    this.lastTime = performance.now();
    this.frameCount = 0;
  }

  public update(time: number) {
    if (time % this.framesPerTimeLog === 0) {
      const currentTime = performance.now();
      const timeElapsed = currentTime - this.lastTime;

      // FPS Calculation
      const fps = Math.round((this.frameCount * 1000) / timeElapsed);

      // Reset counters
      this.frameCount = 0;
      this.lastTime = currentTime;
    }
    this.frameCount++;
  }
}
