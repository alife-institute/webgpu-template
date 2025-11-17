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
import { Struct } from "../../wgsl";

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

// Constants matching shader
const NODE_SIZE_BYTES = 4 * 8; // u32, u32, f32, f32, u32, u32
const totalNodes = 70;

async function main() {
  const device = await requestDevice();
  const canvas = configureCanvas(device);

  // binding indexes matching `shaders/includes/bindings.wgsl`
  const GROUP_INDEX = 0;
  const BINDINGS = [
    {
      GROUP: GROUP_INDEX,
      BUFFER: {
        CANVAS: 0,
        INTERACTIONS: 1,
        NODES: 3,
      },
      TEXTURE: {
        RENDER: 4,
      },
    },
  ];

  const textures = setupTextures(
    device,
    /*bindings=*/ Object.values(BINDINGS[GROUP_INDEX].TEXTURE),
    /*data=*/ {},
    /*size=*/ {
      depthOrArrayLayers: {
        [BINDINGS[GROUP_INDEX].TEXTURE.RENDER]: 4,
      },
      width: canvas.size.width,
      height: canvas.size.height,
    },
    /*format=*/ {
      [BINDINGS[GROUP_INDEX].TEXTURE.RENDER]: "r32float",
    }
  );

  const _canvas = new Struct(shaderIncludes.canvas, device, {
    label: "Canvas",
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  _canvas.size = [canvas.size.width, canvas.size.height];

  const interactions = new Struct(shaderIncludes.interactions, device, {
    label: "Interactions",
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  addEventListeners(interactions, canvas.context.canvas, textures.size);
  // Create storage buffer for nodes (empty, will be initialized on GPU)
  const nodesBuffer = device.createBuffer({
    size: totalNodes * NODE_SIZE_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  // Create canvas uniform buffer with pass_id
  const canvasBufferSize = 12; // width(u32) + height(u32) + pass_id(u32)
  const canvasBuffer = device.createBuffer({
    size: canvasBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Initialize canvas buffer
  const canvasData = new Uint32Array(
    new ArrayBuffer(12) // width + height + pass_id
  );
  canvasData[0] = canvas.size.width;
  canvasData[1] = canvas.size.height;
  canvasData[2] = 0; // initial pass_id
  device.queue.writeBuffer(canvasBuffer, 0, canvasData);

  const buffers = {
    [BINDINGS[GROUP_INDEX].BUFFER.CANVAS]: {
      buffer: _canvas._gpubuffer,
      type: "uniform" as GPUBufferBindingType,
    },
    [BINDINGS[GROUP_INDEX].BUFFER.INTERACTIONS]: {
      buffer: interactions._gpubuffer,
      type: "uniform" as GPUBufferBindingType,
    },
    // [BINDINGS[GROUP_INDEX].BUFFER.CONTROLS]: {
    //   buffer: interactions.controls.buffer,
    //   type: "uniform" as GPUBufferBindingType,
    // },
    [BINDINGS[GROUP_INDEX].BUFFER.NODES]: {
      buffer: nodesBuffer,
      type: "storage" as GPUBufferBindingType,
    },
  };

  // overall memory layout
  const pipeline = createPipelineLayout(device, BINDINGS[GROUP_INDEX], textures, buffers);

  // traditional render pipeline of vert -> frag
  const render = await createRenderPipeline(
    device,
    canvas,
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

  const workgroupSize = 256;
  const numWorkgroups = Math.ceil(totalNodes / workgroupSize);

  const numWorkgroupsCanvas = {
    x: Math.ceil(canvas.size.width / 16),
    y: Math.ceil(canvas.size.height / 16),
  };

  function submit_initialization() {
    const encoder = device.createCommandEncoder();

    const pass = encoder.beginComputePass();
    pass.setBindGroup(pipeline.index, pipeline.bindGroup);

    pass.setPipeline(initialize);
    pass.dispatchWorkgroups(numWorkgroups);

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

      _canvas.pass_id = passId;
      pass.dispatchWorkgroups(workgroupSize);

      pass.end();
      device.queue.submit([encoder.finish()]);
    });

    // Curvature updates
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setBindGroup(pipeline.index, pipeline.bindGroup);
      pass.setPipeline(curvature_updates);
      pass.dispatchWorkgroups(numWorkgroups);

      pass.end();
      device.queue.submit([encoder.finish()]);
    }

    // Clear render texture
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setBindGroup(pipeline.index, pipeline.bindGroup);
      pass.setPipeline(clear);
      pass.dispatchWorkgroups(numWorkgroupsCanvas.x, numWorkgroupsCanvas.y);

      pass.end();
      device.queue.submit([encoder.finish()]);
    }

    // Draw nodes to render texture
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();

      pass.setBindGroup(pipeline.index, pipeline.bindGroup);
      pass.setPipeline(draw);
      pass.dispatchWorkgroups(numWorkgroups);

      pass.end();
      device.queue.submit([encoder.finish()]);
    }
  }

  function frame() {
    computePass();
    renderPass(device, canvas, render, pipeline.bindGroup, pipeline.index);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch(console.error);
