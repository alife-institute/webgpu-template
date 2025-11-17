import {
  addEventListeners,
  arrayFromfunction,
  configureCanvas,
  createPipelineLayout,
  createRenderPipeline,
  createShader,
  renderPass,
  requestDevice,
  setupTextures,
} from "../../utils";
import { Struct, bindingsFromWGSL } from "../../wgsl";

import computeShader from "./shaders/compute.wgsl";
import renderShader from "./shaders/render.wgsl";

import bindings from "./shaders/includes/bindings.wgsl";
import canvas from "./shaders/includes/canvas.wgsl";
import controls from "./shaders/includes/controls.wgsl";
import interactions from "./shaders/includes/interactions.wgsl";
import textures from "./shaders/includes/textures.wgsl";

const shaderIncludes: Record<string, string> = {
  canvas: canvas,
  controls: controls,
  bindings: bindings,
  textures: textures,
  interactions: interactions,
};

const WORKGROUP_SIZE = 256;

async function main() {
  const device = await requestDevice();
  const { context, format, size } = configureCanvas(device);

  const GROUP_INDEX = 0;
  const BINDINGS = bindingsFromWGSL(shaderIncludes.bindings);

  const textures = setupTextures(
    device,
    Object.values(BINDINGS[GROUP_INDEX].TEXTURE),
    {
      [BINDINGS[GROUP_INDEX].TEXTURE.VELOCITY]: arrayFromfunction(
        (_x, _y, _z) => {
          // random initial velocity field
          return 30 * (Math.random() - 0.5);
        },
        size,
        /*layers=*/ 2
      ),
      [BINDINGS[GROUP_INDEX].TEXTURE.DYE]: arrayFromfunction((x, y) => {
        // circular dye source in the center
        const radius = Math.min(size.width, size.height) / 10;
        const dx = x - size.width / 2;
        const dy = y - size.height / 2;
        return dx * dx + dy * dy < radius * radius ? 1.0 : 0.0;
      }, size),
    },
    {
      depthOrArrayLayers: {
        [BINDINGS[GROUP_INDEX].TEXTURE.VELOCITY]: 2,
      },
      width: size.width,
      height: size.height,
    },
    {
      [BINDINGS[GROUP_INDEX].TEXTURE.VELOCITY]: "r32float",
      [BINDINGS[GROUP_INDEX].TEXTURE.PRESSURE]: "r32float",
      [BINDINGS[GROUP_INDEX].TEXTURE.DIVERGENCE]: "r32float",
      [BINDINGS[GROUP_INDEX].TEXTURE.DYE]: "r32float",
    }
  );

  const canvas = new Struct(shaderIncludes.canvas, device, {
    label: "Canvas",
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const interactions = new Struct(shaderIncludes.interactions, device, {
    label: "Interactions",
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const controls = new Struct(shaderIncludes.controls, device, {
    label: "Controls",
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const buffers = {
    [BINDINGS[GROUP_INDEX].BUFFER.CANVAS]: {
      buffer: canvas._gpubuffer,
      type: "uniform" as GPUBufferBindingType,
    },
    [BINDINGS[GROUP_INDEX].BUFFER.INTERACTIONS]: {
      buffer: interactions._gpubuffer,
      type: "uniform" as GPUBufferBindingType,
    },
    [BINDINGS[GROUP_INDEX].BUFFER.CONTROLS]: {
      buffer: controls._gpubuffer,
      type: "uniform" as GPUBufferBindingType,
    },
  };

  canvas.size = [size.width, size.height];
  addEventListeners(interactions, context.canvas, textures.size);

  const pipeline = createPipelineLayout(device, BINDINGS[GROUP_INDEX], textures, buffers);
  const render = await createRenderPipeline(
    device,
    format,
    pipeline.layout,
    renderShader,
    shaderIncludes
  );

  const WORKGROUP_COUNT: [number, number] = [
    Math.ceil(textures.size.width / Math.sqrt(WORKGROUP_SIZE)),
    Math.ceil(textures.size.height / Math.sqrt(WORKGROUP_SIZE)),
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

  function computePass() {
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setBindGroup(pipeline.index, pipeline.bindGroup);

      pass.setPipeline(applyForces);
      pass.dispatchWorkgroups(...WORKGROUP_COUNT);

      pass.setPipeline(advectVelocity);
      pass.dispatchWorkgroups(...WORKGROUP_COUNT);

      pass.setPipeline(diffuseVelocity);
      pass.dispatchWorkgroups(...WORKGROUP_COUNT);

      pass.setPipeline(computeDivergence);
      pass.dispatchWorkgroups(...WORKGROUP_COUNT);

      for (let i = 0; i < 20; i++) {
        pass.setPipeline(solvePressure);
        pass.dispatchWorkgroups(...WORKGROUP_COUNT);
      }

      pass.setPipeline(subtractGradient);
      pass.dispatchWorkgroups(...WORKGROUP_COUNT);

      pass.setPipeline(advectDye);
      pass.dispatchWorkgroups(...WORKGROUP_COUNT);

      pass.end();
      device.queue.submit([encoder.finish()]);
    }
  }

  function frame() {
    computePass();
    renderPass(device, context, render, pipeline.bindGroup, pipeline.index);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch(console.error);
