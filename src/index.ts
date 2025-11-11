import {
  configureCanvas,
  createShader,
  random,
  requestDevice,
  setupInteractions,
  setupTextures
} from "./utils";

import computeShader from "./shaders/compute.wgsl";
import renderShader from "./shaders/render.wgsl";

import bindings from "./shaders/includes/bindings.wgsl";
import textures from "./shaders/includes/textures.wgsl";

const shaderIncludes: Record<string, string> = {
  bindings: bindings,
  textures: textures,
};

const WORKGROUP_SIZE = 256;

async function main() {
  const device = await requestDevice();
  const canvas = configureCanvas(device);

  // binding indexes matching `shaders/includes/bindings.wgsl`
  const GROUP_INDEX = 0;
  const BINDINGS = [{
      GROUP: GROUP_INDEX,
      BUFFER: { CANVAS: 0, CONTROLS: 1, INTERACTIONS: 2},
      TEXTURE: { STATES: 3}
    }
  ];

  const textures = setupTextures(
    device,
    /*bindings=*/ Object.values(BINDINGS[GROUP_INDEX].TEXTURE),
    /*data=*/ {
      [BINDINGS[GROUP_INDEX].TEXTURE.STATES]: random(canvas.size.height, canvas.size.width, 2),
    },
    /*size=*/ {
      depthOrArrayLayers: {
        [BINDINGS[GROUP_INDEX].TEXTURE.STATES]: 2,
      },
      width: canvas.size.width,
      height: canvas.size.height,
    },
    /*format=*/ {
      [BINDINGS[GROUP_INDEX].TEXTURE.STATES]: "r32uint",
    }
  );

  const TEXTURE_WORKGROUP_COUNT: [number, number] = [
    Math.ceil(textures.size.width / Math.sqrt(WORKGROUP_SIZE)),
    Math.ceil(textures.size.height / Math.sqrt(WORKGROUP_SIZE)),
  ];

  const interactions = setupInteractions(device, canvas.context.canvas, textures.size);
  const canvas_buffers = {
    [BINDINGS[GROUP_INDEX].BUFFER.CANVAS]: textures.canvas.buffer,
    [BINDINGS[GROUP_INDEX].BUFFER.CONTROLS]: interactions.controls.buffer,
    [BINDINGS[GROUP_INDEX].BUFFER.INTERACTIONS]: interactions.interactions.buffer,
  };

  // overall memory layout
  const visibility = GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT;
  const bindGroupLayout = device.createBindGroupLayout({
    label: "bindGroupLayout",
    entries: [
      ...Object.values(BINDINGS[GROUP_INDEX].BUFFER).map((binding) => ({
        binding: binding,
        visibility: visibility,
        buffer: { type: "uniform" as GPUBufferBindingType },
      })),
      ...Object.values(BINDINGS[GROUP_INDEX].TEXTURE).map((binding) => ({
        binding: binding,
        visibility: visibility,
        storageTexture: textures.bindingLayout[binding],
      })),
    ],
  });

  const bindGroup = device.createBindGroup({
    label: `Bind Group`,
    layout: bindGroupLayout,
    entries: [
      ...Object.values(BINDINGS[GROUP_INDEX].TEXTURE).map((binding) => ({
        binding,
        resource: textures.textures[binding].createView(),
      })),
      ...Object.values(BINDINGS[GROUP_INDEX].BUFFER).map((binding) => ({
        binding,
        resource: { buffer: canvas_buffers[binding] },
      })),
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: "pipelineLayout",
    bindGroupLayouts: [bindGroupLayout],
  });

  // compute pipeline
  const module = await createShader(device, computeShader, shaderIncludes);
  const computePipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: { module: module, entryPoint: "compute_main"},
  });

  // traditional render pipeline of vert -> frag
  const renderModule = await createShader(device, renderShader, shaderIncludes);
  const renderPipeline = device.createRenderPipeline({
    label: "Render Pipeline",
    layout: pipelineLayout,
    vertex: {
      module: renderModule,
      entryPoint: "vert",
    },
    fragment: {
      module: renderModule,
      entryPoint: "frag",
      targets: [{ format: canvas.format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  function frame() {
    const encoder = device.createCommandEncoder();

    // compute pass
    const pass = encoder.beginComputePass();
    pass.setBindGroup(GROUP_INDEX, bindGroup);

    pass.setPipeline(computePipeline);
    pass.dispatchWorkgroups(...TEXTURE_WORKGROUP_COUNT); // in-place state update

    pass.end();

    // render pass
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvas.context.getCurrentTexture().createView(),
          loadOp: "load", // load existing content
          storeOp: "store",
        },
      ],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(GROUP_INDEX, bindGroup);

    renderPass.draw(6); // draw two triangles for a fullscreen quad
    renderPass.end();

    // submit commands
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch(console.error);
