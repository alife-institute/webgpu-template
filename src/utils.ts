/**
 * WebGPU Utility Functions
 * Simple helper functions for WebGPU setup and configuration
 */

function throwDetectionError(error: string): never {
  const errorElement = document.querySelector(
    ".webgpu-not-supported"
  ) as HTMLElement;
  if (errorElement) {
    errorElement.style.visibility = "visible";
  }
  throw new Error("Could not initialize WebGPU: " + error);
}

/**
 * Request a WebGPU device with optional features and limits
 */
export async function requestDevice(
  options: GPURequestAdapterOptions = {
    powerPreference: "high-performance",
  }
): Promise<GPUDevice> {
  if (!navigator.gpu) {
    throwDetectionError("WebGPU is not supported in this browser");
  }

  const adapter = await navigator.gpu.requestAdapter(options);
  if (!adapter) {
    throwDetectionError("No GPU adapter found");
  }

  return adapter.requestDevice();
}

/**
 * Configure a canvas for WebGPU rendering
 */
export function configureCanvas(
  device: GPUDevice,
  size = { width: window.innerWidth, height: window.innerHeight }
): {
  canvas: HTMLCanvasElement;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
} {
  const canvas = Object.assign(document.createElement("canvas"), size);
  document.body.appendChild(canvas);

  const context = canvas.getContext("webgpu");
  if (!context) {
    throwDetectionError("Canvas does not support WebGPU");
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device: device,
    format: format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
    alphaMode: "premultiplied",
  });

  return { canvas, context, format };
}

/**
 * Create a shader module from WGSL code
 */
export async function createShaderModule(
  device: GPUDevice,
  code: string
): Promise<GPUShaderModule> {
  const module = device.createShaderModule({ code });

  // Check for compilation errors
  const info = await module.getCompilationInfo();
  if (info.messages.length > 0) {
    let hasErrors = false;
    for (const message of info.messages) {
      if (message.type === "error") {
        hasErrors = true;
        console.error(
          `Shader compilation error at line ${message.lineNum}: ${message.message}`
        );
      } else {
        console.warn(
          `Shader compilation warning at line ${message.lineNum}: ${message.message}`
        );
      }
    }
    if (hasErrors) {
      throw new Error("Shader compilation failed");
    }
  }

  return module;
}
