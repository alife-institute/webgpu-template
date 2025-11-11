import {
  configureCanvas,
  createShader,
  requestDevice,
  setupInteractions,
  setupTextures,
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

  const GROUP_INDEX = 0;
  const BINDINGS = [{
      GROUP: GROUP_INDEX,
      BUFFER: { CANVAS: 0, CONTROLS: 1, INTERACTIONS: 2},
      TEXTURE: { STATES: 3}
    }
  ];

  const textures = setupTextures(
    device,
    Object.values(BINDINGS[GROUP_INDEX].TEXTURE),
    {},
    {
      depthOrArrayLayers: {
        [BINDINGS[GROUP_INDEX].TEXTURE.STATES]: 2,
      },
      width: canvas.size.width,
      height: canvas.size.height,
    },
    {
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

  const depth = textures.size.depthOrArrayLayers ? textures.size.depthOrArrayLayers[BINDINGS[GROUP_INDEX].TEXTURE.STATES]: 1;
  const arraySize = textures.size.width * textures.size.height * depth;
  const initialData = new Uint32Array(arraySize)

  for (let i = 0; i < arraySize; i++) {
    initialData[i] = Math.random() > 0.5 ? 1 : 0;
  }

  device.queue.writeTexture(
    { texture: textures.textures[BINDINGS[GROUP_INDEX].TEXTURE.STATES] },
    initialData,
    {
      bytesPerRow: textures.size.width * 4,
      rowsPerImage: textures.size.height,
    },
    [textures.size.width, textures.size.height, depth]
  );

  // Overall memory layout
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

  const module = await createShader(device, computeShader, shaderIncludes);
  const computePipeline = device.createComputePipeline({
    layout: pipelineLayout,
    compute: { module: module, entryPoint: "compute_main"},
  });

  // Traditional render pipeline of vert -> frag
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
      targets: [{ format: canvas.format }], // Stage 1 renders to intermediate texture
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  function frame() {
    const encoder = device.createCommandEncoder();

    const pass = encoder.beginComputePass();
    pass.setBindGroup(GROUP_INDEX, bindGroup);

    pass.setPipeline(computePipeline);
    pass.dispatchWorkgroups(...TEXTURE_WORKGROUP_COUNT);

    pass.end();

    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvas.context.getCurrentTexture().createView(),
          loadOp: "load", // Load existing content from stage 1
          storeOp: "store",
        },
      ],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(GROUP_INDEX, bindGroup);

    renderPass.draw(6);
    renderPass.end();

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch(console.error);
