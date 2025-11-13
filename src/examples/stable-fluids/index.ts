import {
  arrayFromfunction,
  configureCanvas,
  createPipelineLayout,
  createRenderPipeline,
  createShader,
  renderPass,
  requestDevice,
  setupInteractions,
  setupTextures,
} from "../../utils";

import computeShader from "./shaders/compute.wgsl";
import renderShader from "./shaders/render.wgsl";

import bindings from "./shaders/includes/bindings.wgsl";
import interactions from "./shaders/includes/interactions.wgsl";
import textures from "./shaders/includes/textures.wgsl";

const shaderIncludes: Record<string, string> = {
  bindings: bindings,
  textures: textures,
  interactions: interactions,
};

const WORKGROUP_SIZE = 256;

async function main() {
  const device = await requestDevice();
  const canvas = configureCanvas(device);

  const GROUP_INDEX = 0;
  const BINDINGS = [{
      GROUP: GROUP_INDEX,
      BUFFER: {
        CANVAS: 0,
        INTERACTIONS: 1,
        CONTROLS: 2,
      },
      TEXTURE: {
        VELOCITY: 3,
        PRESSURE: 4,
        DIVERGENCE: 5,
        DYE: 6,
      }
    }
  ]; 

  const textureData = setupTextures(
    device,
    Object.values(BINDINGS[GROUP_INDEX].TEXTURE),
    {
      [BINDINGS[GROUP_INDEX].TEXTURE.VELOCITY]: arrayFromfunction(
        (x, y, z) => { // random initial velocity field
          return 30*(Math.random() - 0.5)
        },
        canvas.size,
        /*layers=*/ 2,
      ),
      [BINDINGS[GROUP_INDEX].TEXTURE.DYE]: arrayFromfunction(
        (x, y) => { // circular dye source in the center
          const radius = Math.min(canvas.size.width, canvas.size.height) / 10;
          const dx = x - canvas.size.width / 2;
          const dy = y - canvas.size.height / 2;
          return (dx * dx + dy * dy) < (radius * radius) ? 1.0 : 0.0;
        },
        canvas.size
      ),
    },
    {
      depthOrArrayLayers: {
        [BINDINGS[GROUP_INDEX].TEXTURE.VELOCITY]: 2,
      },
      width: canvas.size.width,
      height: canvas.size.height,
    },
    {
      [BINDINGS[GROUP_INDEX].TEXTURE.VELOCITY]: "r32float",
      [BINDINGS[GROUP_INDEX].TEXTURE.PRESSURE]: "r32float",
      [BINDINGS[GROUP_INDEX].TEXTURE.DIVERGENCE]: "r32float",
      [BINDINGS[GROUP_INDEX].TEXTURE.DYE]: "r32float",
    }
  );

  const interactionData = setupInteractions(device, canvas.context.canvas, textureData.size);
  const buffers = {
    [BINDINGS[GROUP_INDEX].BUFFER.CANVAS]: {buffer: textureData.canvas.buffer, type: "uniform" as GPUBufferBindingType},
    [BINDINGS[GROUP_INDEX].BUFFER.INTERACTIONS]: {buffer: interactionData.interactions.buffer, type: "uniform" as GPUBufferBindingType},
    [BINDINGS[GROUP_INDEX].BUFFER.CONTROLS]: {buffer: interactionData.controls.buffer, type: "uniform" as GPUBufferBindingType},
  };

  const pipeline = createPipelineLayout(device, BINDINGS[GROUP_INDEX], textureData, buffers);
  const render = await createRenderPipeline(device, canvas, pipeline.layout, renderShader, shaderIncludes);

  const TEXTURE_WORKGROUP_COUNT: [number, number] = [
    Math.ceil(textureData.size.width / Math.sqrt(WORKGROUP_SIZE)),
    Math.ceil(textureData.size.height / Math.sqrt(WORKGROUP_SIZE)),
  ];

  const module = await createShader(device, computeShader, shaderIncludes);

  const advectVelocity = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "advect_velocity" },
  });

  const diffuseVelocity = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "diffuse_velocity" },
  });

  const computeDivergence = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "compute_divergence" },
  });

  const solvePressure = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "solve_pressure" },
  });

  const subtractGradient = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "subtract_gradient" },
  });

  const advectDye = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "advect_dye" },
  });

  const applyForces = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "apply_forces" },
  });

  function computePass(encoder: GPUCommandEncoder): GPUComputePassEncoder {
    const pass = encoder.beginComputePass();
    pass.setBindGroup(pipeline.index, pipeline.bindGroup);

    pass.setPipeline(applyForces);
    pass.dispatchWorkgroups(...TEXTURE_WORKGROUP_COUNT);

    pass.setPipeline(advectVelocity);
    pass.dispatchWorkgroups(...TEXTURE_WORKGROUP_COUNT);

    pass.setPipeline(diffuseVelocity);
    pass.dispatchWorkgroups(...TEXTURE_WORKGROUP_COUNT);

    pass.setPipeline(computeDivergence);
    pass.dispatchWorkgroups(...TEXTURE_WORKGROUP_COUNT);

    for (let i = 0; i < 20; i++) {
      pass.setPipeline(solvePressure);
      pass.dispatchWorkgroups(...TEXTURE_WORKGROUP_COUNT);
    }

    pass.setPipeline(subtractGradient);
    pass.dispatchWorkgroups(...TEXTURE_WORKGROUP_COUNT);

    pass.setPipeline(advectDye);
    pass.dispatchWorkgroups(...TEXTURE_WORKGROUP_COUNT);

    pass.end();
    return pass;
  }

  function updateParameters() {
    device.queue.writeBuffer(
      interactionData.interactions.buffer,
      0,
      interactionData.interactions.data.buffer
    );
  }

  function frame() {
    updateParameters();
    const encoder = device.createCommandEncoder();

    computePass(encoder);
    renderPass(encoder, canvas, render, pipeline.bindGroup, pipeline.index);

    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch(console.error);
