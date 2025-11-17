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

import { Struct } from "../../wgsl";

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
  const canvas = configureCanvas(device);

  // binding indexes matching `shaders/includes/bindings.wgsl`
  const GROUP_INDEX = 0;
  const BINDINGS = [
    {
      GROUP: GROUP_INDEX,
      BUFFER: {
        CANVAS: 0,
        INTERACTIONS: 1,
      },
      TEXTURE: {
        STATES: 3,
        NEIGHBORS: 4,
      },
    },
  ];

  const textures = setupTextures(
    device,
    /*bindings=*/ Object.values(BINDINGS[GROUP_INDEX].TEXTURE),
    /*data=*/ {
      [BINDINGS[GROUP_INDEX].TEXTURE.STATES]: arrayFromfunction(
        (_x, _y, _z) => (Math.random() < 0.5 ? 1 : 0),
        canvas.size,
        2
      ),
    },
    /*size=*/ {
      depthOrArrayLayers: {
        [BINDINGS[GROUP_INDEX].TEXTURE.STATES]: 2,
        [BINDINGS[GROUP_INDEX].TEXTURE.NEIGHBORS]: 2,
      },
      width: canvas.size.width,
      height: canvas.size.height,
    },
    /*format=*/ {
      [BINDINGS[GROUP_INDEX].TEXTURE.STATES]: "r32uint",
      [BINDINGS[GROUP_INDEX].TEXTURE.NEIGHBORS]: "r32uint",
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

  const buffers = {
    [BINDINGS[GROUP_INDEX].BUFFER.CANVAS]: {
      buffer: _canvas._gpubuffer,
      type: "uniform" as GPUBufferBindingType,
    },
    [BINDINGS[GROUP_INDEX].BUFFER.INTERACTIONS]: {
      buffer: interactions._gpubuffer,
      type: "uniform" as GPUBufferBindingType,
    },
  };

  addEventListeners(interactions, canvas.context.canvas, textures.size);

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

  // compute pipeline
  const module = await createShader(device, computeShader, shaderIncludes);
  const countNeighbours = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "count_neighbors" },
  });

  const applyRule = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "apply_rule" },
  });

  const WORKGROUP_COUNT: [number, number] = [
    Math.ceil(textures.size.width / Math.sqrt(WORKGROUP_SIZE)),
    Math.ceil(textures.size.height / Math.sqrt(WORKGROUP_SIZE)),
  ];

  // compute pass - interesting things happen here
  function computePass() {
    {
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setBindGroup(pipeline.index, pipeline.bindGroup);

      pass.setPipeline(countNeighbours);
      pass.dispatchWorkgroups(...WORKGROUP_COUNT);

      pass.setPipeline(applyRule);
      pass.dispatchWorkgroups(...WORKGROUP_COUNT);

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
