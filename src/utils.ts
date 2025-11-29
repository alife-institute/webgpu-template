import { Struct } from "./wgsl";

function throwDetectionError(error: string): never {
  const errorElement = document.querySelector(".webgpu-not-supported") as HTMLElement;
  if (errorElement) {
    errorElement.style.visibility = "visible";
  }
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

  const features = [...requiredFeatures];

  const limits = Object.fromEntries(
    Object.entries(requiredLimits).filter(([_key, value]) => value !== undefined)
  ) as Record<string, number>;

  return adapter.requestDevice({
    requiredFeatures: features,
    requiredLimits: limits,
  });
}

export function configureCanvas(
  device: GPUDevice,
  size = { width: window.innerWidth, height: window.innerHeight }
): {
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  size: { width: number; height: number };
} {
  const canvas = Object.assign(document.createElement("canvas"), size);
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

  return { context: context, format: format, size: size };
}

export async function createShader(
  device: GPUDevice,
  code: string,
  includes?: Record<string, string>
): Promise<GPUShaderModule> {
  const processedCode = prependIncludes(code, includes);

  const module = device.createShaderModule({ code: processedCode });
  const info = await module.getCompilationInfo();
  if (info.messages.length > 0) {
    for (const message of info.messages) {
      console.warn(`${message.message} 
  at line ${message.lineNum}`);
    }
    throw new Error(`Could not compile shader`);
  }
  return module;
}

function prependIncludes(code: string, includes?: Record<string, string>): string {
  const importRegex = /^#import\s+([a-zA-Z0-9_]+)::([a-zA-Z0-9_]+)/gm;
  const imports = [...code.matchAll(importRegex)];

  const includesToAdd: Record<string, string> = {};

  for (const [fullMatch, namespace, moduleName] of imports) {
    if (namespace === "includes" && includes && moduleName in includes) {
      includesToAdd[fullMatch] = includes[moduleName];
    } else {
      console.warn(`Could not resolve import: ${fullMatch}`);
    }
  }

  let processedCode = code;
  for (const [importStatement, content] of Object.entries(includesToAdd)) {
    processedCode = processedCode.replace(importStatement, content);
  }

  return processedCode;
}

export function addEventListeners(
  interactions: Struct,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  texture: { width: number; height: number },
  size: number = 20
) {
  let sign = 1;
  const position = { x: 0, y: 0 };
  const velocity = { x: 0, y: 0 };

  interactions.position = [position.x, position.y];
  if (canvas instanceof HTMLCanvasElement) {
    canvas.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

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

          interactions.position = [x, y];
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
          interactions.size = size;
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
          interactions.size = sign * size;
        },
        { passive: true }
      );
    });
    ["mouseup", "touchend"].forEach((type) => {
      canvas.addEventListener(
        type,
        (_event) => {
          interactions.size = NaN;
        },
        { passive: true }
      );
    });
  }
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
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST,
      format: format && key in format ? format[key] : DEFAULT_FORMAT,
      size: {
        width: size.width,
        height: size.height,
        depthOrArrayLayers: key in depthOrArrayLayers ? depthOrArrayLayers[key] : 1,
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
        : new Float32Array(flatten(zeros(size, layers)));

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

  return {
    textures: textures,
    bindingLayout: bindingLayout,
    size: size,
  };
}

export function createPipelineLayout(
  device: GPUDevice,
  BINDINGS: {
    GROUP: number;
    BUFFER: { [key: string]: number };
    TEXTURE: { [key: string]: number };
  },
  textures: {
    textures: { [key: number]: GPUTexture };
    bindingLayout: { [key: number]: GPUStorageTextureBindingLayout };
  },
  buffers: { [key: number]: { buffer: GPUBuffer; type: GPUBufferBindingType } },
  visibility: number = GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT
): {
  index: number;
  bindGroup: GPUBindGroup;
  layout: GPUPipelineLayout;
} {
  const bindGroupLayout = device.createBindGroupLayout({
    label: "bindGroupLayout",
    entries: [
      ...Object.values(BINDINGS.TEXTURE).map((binding) => ({
        binding: binding,
        visibility: visibility,
        storageTexture: textures.bindingLayout[binding],
      })),
      ...Object.values(BINDINGS.BUFFER).map((binding) => ({
        binding: binding,
        visibility: visibility,
        buffer: { type: buffers[binding].type as GPUBufferBindingType },
      })),
    ],
  });

  const bindGroup = device.createBindGroup({
    label: `bindGroup`,
    layout: bindGroupLayout,
    entries: [
      ...Object.values(BINDINGS.TEXTURE).map((binding) => ({
        binding,
        resource: textures.textures[binding].createView(),
      })),
      ...Object.values(BINDINGS.BUFFER).map((binding) => ({
        binding,
        resource: { buffer: buffers[binding].buffer },
      })),
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: "pipelineLayout",
    bindGroupLayouts: [bindGroupLayout],
  });

  return {
    index: BINDINGS.GROUP,
    bindGroup: bindGroup,
    layout: pipelineLayout,
  };
}

export async function createRenderPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  pipelineLayout: GPUPipelineLayout,
  shader: string,
  shaderIncludes: Record<string, string>,
  label: string = "Render Pipeline",
  entryPoints: { vertex: string; fragment: string } = { vertex: "vert", fragment: "frag" },
  topology: GPUPrimitiveTopology = "triangle-list"
): Promise<{
  module: GPUShaderModule;
  pipeline: GPURenderPipeline;
}> {
  const module = await createShader(device, shader, shaderIncludes);
  const pipeline = device.createRenderPipeline({
    label: label,
    layout: pipelineLayout,
    vertex: {
      module: module,
      entryPoint: entryPoints.vertex,
    },
    fragment: {
      module: module,
      entryPoint: entryPoints.fragment,
      targets: [{ format: format }],
    },
    primitive: {
      topology: topology,
    },
  });
  return {
    module: module,
    pipeline: pipeline,
  };
}

export function renderPass(
  device: GPUDevice,
  context: GPUCanvasContext,
  render: { pipeline: GPURenderPipeline },
  bindGroup: GPUBindGroup,
  GROUP_INDEX: number,
  vertexCount: number = 6,
  loadOp: GPULoadOp = "load",
  storeOp: GPUStoreOp = "store"
) {
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        loadOp: loadOp, // load existing content
        storeOp: storeOp,
      },
    ],
  });
  pass.setPipeline(render.pipeline);
  pass.setBindGroup(GROUP_INDEX, bindGroup);

  pass.draw(vertexCount); // draw two triangles for a fullscreen quad
  pass.end();
  device.queue.submit([encoder.finish()]);
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

function zeros(size: { height: number; width: number }, layers: number = 1): number[][][] {
  const zeroArray: number[][][] = [];

  for (let i = 0; i < size.height; i++) {
    const row: number[][] = [];
    for (let j = 0; j < size.width; j++) {
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

export function arrayFromfunction(
  func: (x: number, y: number, layer?: number) => number,
  size: { height: number; width: number },
  layers: number = 1
): number[][][] {
  const array: number[][][] = [];

  for (let i = 0; i < size.height; i++) {
    const row: number[][] = [];
    for (let j = 0; j < size.width; j++) {
      const layer: number[] = [];
      for (let k = 0; k < layers; k++) {
        layer.push(func(j, i, k));
      }
      row.push(layer);
    }
    array.push(row);
  }

  return array;
}

export function getRandomValues(length: number): number[] {
  const maxChunkLength = 65536;
  const result = new Uint32Array(length);
  for (let i = 0; i < length; i += maxChunkLength) {
    const chunkLength = Math.min(maxChunkLength, length - i);
    crypto.getRandomValues(result.subarray(i, i + chunkLength));
  }
  return Array.from(result);
}
