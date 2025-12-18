import GUI from "lil-gui";
import {
  addEventListeners,
  configureCanvas,
  createPipelineLayout,
  createRenderPipeline,
  createShader,
  getRandomValues,
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
import nodes from "./shaders/includes/nodes.wgsl";
import random from "./shaders/includes/random.wgsl";
import textures from "./shaders/includes/textures.wgsl";

const shaderIncludes: Record<string, string> = {
  nodes: nodes,
  random: random,
  canvas: canvas,
  controls: controls,
  bindings: bindings,
  textures: textures,
  interactions: interactions,
};

const NODE_COUNT = 20;
const WORKGROUP_SIZE = 256;

async function main() {
  const device = await requestDevice();
  const { context, format, size } = configureCanvas(device);

  // binding indexes matching `shaders/includes/bindings.wgsl`
  const GROUP_INDEX = 0;
  const BINDINGS = bindingsFromWGSL(shaderIncludes.bindings);

  const textures = setupTextures(
    device,
    /*bindings=*/ Object.values(BINDINGS[GROUP_INDEX].TEXTURE),
    /*data=*/ {},
    /*size=*/ {
      depthOrArrayLayers: {
        [BINDINGS[GROUP_INDEX].TEXTURE.RENDER]: 4,
        [BINDINGS[GROUP_INDEX].TEXTURE.PARAMETERS]: 2,
      },
      width: size.width,
      height: size.height,
    },
    /*format=*/ {
      [BINDINGS[GROUP_INDEX].TEXTURE.RENDER]: "r32float",
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

  const nodes = new Struct(shaderIncludes.nodes, device, {
    label: "Nodes",
    size: NODE_COUNT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const random = new Struct(shaderIncludes.random, device, {
    label: "Random",
    size: NODE_COUNT,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  random.x = getRandomValues(NODE_COUNT);
  random.y = getRandomValues(NODE_COUNT);
  random.z = getRandomValues(NODE_COUNT);
  random.w = getRandomValues(NODE_COUNT);

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
    [BINDINGS[GROUP_INDEX].BUFFER.NODES]: {
      buffer: nodes._gpubuffer,
      type: "storage" as GPUBufferBindingType,
    },
    [BINDINGS[GROUP_INDEX].BUFFER.RANDOM]: {
      buffer: random._gpubuffer,
      type: "storage" as GPUBufferBindingType,
    },
  };

  canvas.key = [0, 0];
  canvas.size = [size.width, size.height];
  addEventListeners(interactions, context.canvas, textures.size);

  // overall memory layout
  const pipeline = createPipelineLayout(device, BINDINGS[GROUP_INDEX], textures, buffers);

  // traditional render pipeline of vert -> frag
  const render = await createRenderPipeline(
    device,
    format,
    pipeline.layout,
    renderShader,
    shaderIncludes
  );

  // Create compute pipelines
  const module = await createShader(device, computeShader, shaderIncludes);

  const initialize = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "initialize" },
  });

  const update_positions = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "update_positions" },
  });

  const draw = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "draw" },
  });

  const clear = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "clear" },
  });

  const WORKGROUP_COUNT_BUFFER = Math.ceil(NODE_COUNT / WORKGROUP_SIZE);
  const WORKGROUP_COUNT_TEXTURE: [number, number] = [
    Math.ceil(textures.size.width / Math.sqrt(WORKGROUP_SIZE)),
    Math.ceil(textures.size.height / Math.sqrt(WORKGROUP_SIZE)),
  ];

  function submit_initialization() {
    const encoder = device.createCommandEncoder();

    const pass = encoder.beginComputePass();
    pass.setBindGroup(pipeline.index, pipeline.bindGroup);

    pass.setPipeline(initialize);
    pass.dispatchWorkgroups(WORKGROUP_COUNT_BUFFER);

    pass.end();
    device.queue.submit([encoder.finish()]);
  }
  submit_initialization();

  // compute pass - physics simulation
  function computePass() {
    // Clear textures
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setBindGroup(pipeline.index, pipeline.bindGroup);
      pass.setPipeline(clear);
      pass.dispatchWorkgroups(...WORKGROUP_COUNT_TEXTURE);

      pass.end();
      device.queue.submit([encoder.finish()]);
    }

    // Update positions
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setBindGroup(pipeline.index, pipeline.bindGroup);
      pass.setPipeline(update_positions);
      pass.dispatchWorkgroups(WORKGROUP_COUNT_BUFFER);

      pass.end();
      device.queue.submit([encoder.finish()]);
    }

    // Draw nodes to render texture
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setBindGroup(pipeline.index, pipeline.bindGroup);
      pass.setPipeline(draw);
      pass.dispatchWorkgroups(WORKGROUP_COUNT_BUFFER);

      pass.end();
      device.queue.submit([encoder.finish()]);
    }
  }

  const gui = new GUI();
  gui.add({ reset: () => submit_initialization() }, "reset");

  controls.compute_steps = 5;
  gui.add(controls, "compute_steps").min(1).max(20).step(1).name("Compute Steps");

  controls.line_distance = 20.0;
  gui.add(controls, "line_distance").min(1).max(50).name("Equilibrium Line Distance");

  controls.stiffness = 0.5;
  gui.add(controls, "stiffness").min(0).max(1.0).step(0.01).name("Bending Stiffness");

  function frame() {
    computePass();
    renderPass(device, context, render, pipeline.bindGroup, pipeline.index);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch(console.error);
