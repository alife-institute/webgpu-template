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

const NODE_COUNT = 10000;
const WORKGROUP_SIZE = 256;
const FEATURE_DIMENSION = 5;

// Inject constants into shader includes
shaderIncludes.nodes = shaderIncludes.nodes.replaceAll(
  "{{FEATURE_DIMENSION}}",
  FEATURE_DIMENSION.toString()
);

async function main() {
  const device = await requestDevice({}, [], {
    maxStorageBufferBindingSize: 4294967292,
    maxBufferSize: 4294967292,
  });
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
        [BINDINGS[GROUP_INDEX].TEXTURE.PARAMETERS]: FEATURE_DIMENSION,
        [BINDINGS[GROUP_INDEX].TEXTURE.FEATURE]: FEATURE_DIMENSION,
      },
      width: size.width,
      height: size.height,
    },
    /*format=*/ {
      [BINDINGS[GROUP_INDEX].TEXTURE.RENDER]: "r32float",
      [BINDINGS[GROUP_INDEX].TEXTURE.FEATURE]: "r32float",
      [BINDINGS[GROUP_INDEX].TEXTURE.PARAMETERS]: "r32float",
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

  const processedComputeShader = computeShader.replaceAll(
    "{{FEATURE_DIMENSION}}",
    FEATURE_DIMENSION.toString()
  );
  const processedRenderShader = renderShader.replaceAll(
    "{{FEATURE_DIMENSION}}",
    FEATURE_DIMENSION.toString()
  );

  // traditional render pipeline of vert -> frag
  const render = await createRenderPipeline(
    device,
    format,
    pipeline.layout,
    processedRenderShader,
    shaderIncludes
  );

  // Create compute pipelines
  const module = await createShader(device, processedComputeShader, shaderIncludes);

  const initialize = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "initialize" },
  });

  const clear = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "clear" },
  });

  const update_positions = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "update_positions" },
  });

  const update_textures = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "update_textures" },
  });

  const blur_horizontal = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "blur_horizontal" },
  });

  const blur_vertical = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "blur_vertical" },
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

    pass.setPipeline(clear);
    pass.dispatchWorkgroups(...WORKGROUP_COUNT_TEXTURE);

    pass.setPipeline(initialize);
    pass.dispatchWorkgroups(WORKGROUP_COUNT_BUFFER);

    pass.end();
    device.queue.submit([encoder.finish()]);
  }
  submit_initialization();

  // compute pass - physics simulation
  function computePass() {
    // Update textures
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setBindGroup(pipeline.index, pipeline.bindGroup);
      pass.setPipeline(update_textures);
      pass.dispatchWorkgroups(...WORKGROUP_COUNT_TEXTURE);

      pass.end();
      device.queue.submit([encoder.finish()]);
    }

    // Blur textures
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setBindGroup(pipeline.index, pipeline.bindGroup);
      pass.setPipeline(blur_horizontal);
      pass.dispatchWorkgroups(...WORKGROUP_COUNT_TEXTURE);
      pass.end();
      device.queue.submit([encoder.finish()]);
    }
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setBindGroup(pipeline.index, pipeline.bindGroup);
      pass.setPipeline(blur_vertical);
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
  }

  const gui = new GUI();
  gui.add({ reset: () => submit_initialization() }, "reset");

  controls.compute_steps = 200;
  gui.add(controls, "compute_steps").min(1).max(200).step(1).name("Compute Steps");

  controls.sensor_angle = 2.371220827102661;
  gui.add(controls, "sensor_angle").min(0.01).max(Math.PI).name("Sensor Angle");

  controls.sensor_offset = 50;
  gui.add(controls, "sensor_offset").min(2).max(50).name("Sensor Offset");

  controls.steer_angle = 1.0246360301971436;
  gui.add(controls, "steer_angle").min(0.01).max(Math.PI).name("Steer Angle");

  controls.decay_rate = 0.999;
  gui.add(controls, "decay_rate").min(0.9).max(1.0).step(0.001).name("Trail Decay Rate");

  function frame() {
    for (let i = 0; i < controls.compute_steps; i++) {
      canvas.key = [canvas.key[0] + 1, canvas.key[1]];
      computePass();
    }
    renderPass(device, context, render, pipeline.bindGroup, pipeline.index);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch(console.error);
