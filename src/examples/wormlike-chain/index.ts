import GUI from "lil-gui";
import {
  addEventListeners,
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
import nodes from "./shaders/includes/nodes.wgsl";
import textures from "./shaders/includes/textures.wgsl";

const shaderIncludes: Record<string, string> = {
  nodes: nodes,
  canvas: canvas,
  controls: controls,
  bindings: bindings,
  textures: textures,
  interactions: interactions,
};

const NODE_COUNT = 70;
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
  const line_constraint_updates = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "line_constraint_updates" },
  });

  const curvature_updates = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "curvature_updates" },
  });

  const initialize = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "initialize_chains" },
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
    [0, 1].forEach((passId, _index) => {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setBindGroup(pipeline.index, pipeline.bindGroup);
      pass.setPipeline(line_constraint_updates);

      canvas.pass_id = passId;
      pass.dispatchWorkgroups(WORKGROUP_COUNT_BUFFER);

      pass.end();
      device.queue.submit([encoder.finish()]);
    });

    // Curvature updates
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setBindGroup(pipeline.index, pipeline.bindGroup);
      pass.setPipeline(curvature_updates);
      pass.dispatchWorkgroups(WORKGROUP_COUNT_BUFFER);

      pass.end();
      device.queue.submit([encoder.finish()]);
    }

    // Clear render texture
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setBindGroup(pipeline.index, pipeline.bindGroup);
      pass.setPipeline(clear);
      pass.dispatchWorkgroups(...WORKGROUP_COUNT_TEXTURE);

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

  controls.line_distance = 1.0;
  gui.add(controls, "line_distance").min(1).max(50).name("Equilibrium Line Distance");

  function frame() {
    computePass();
    renderPass(device, context, render, pipeline.bindGroup, pipeline.index);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch(console.error);
