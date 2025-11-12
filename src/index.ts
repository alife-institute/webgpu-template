import {
  configureCanvas,
  createPipelineLayout,
  createRenderPipeline,
  createShader,
  random,
  renderPass,
  requestDevice,
  setupInteractions,
  setupTextures,
} from "./utils";

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

  // binding indexes matching `shaders/includes/bindings.wgsl`
  const GROUP_INDEX = 0;
  const BINDINGS = [{
      GROUP: GROUP_INDEX,
      BUFFER: {
        CANVAS: 0,
        CONTROLS: 1,
        INTERACTIONS: 2
      },
      TEXTURE: {
        STATES: 3
      }
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

  const interactions = setupInteractions(device, canvas.context.canvas, textures.size);
  const buffers = {
    [BINDINGS[GROUP_INDEX].BUFFER.CANVAS]: {buffer: textures.canvas.buffer, type: "uniform" as GPUBufferBindingType},
    [BINDINGS[GROUP_INDEX].BUFFER.CONTROLS]: {buffer: interactions.controls.buffer, type: "uniform" as GPUBufferBindingType},
    [BINDINGS[GROUP_INDEX].BUFFER.INTERACTIONS]: {buffer: interactions.interactions.buffer, type: "uniform" as GPUBufferBindingType},
  };

  // overall memory layout
  const pipeline = createPipelineLayout(device, BINDINGS[GROUP_INDEX], textures, buffers);

  // compute pipeline
  const module = await createShader(device, computeShader, shaderIncludes);
  const computePipeline = device.createComputePipeline({
    layout: pipeline.layout,
    compute: { module: module, entryPoint: "compute_main"},
  });

  // traditional render pipeline of vert -> frag
  const render = await createRenderPipeline(device, canvas, pipeline.layout, renderShader, shaderIncludes);

  const TEXTURE_WORKGROUP_COUNT: [number, number] = [
    Math.ceil(textures.size.width / Math.sqrt(WORKGROUP_SIZE)),
    Math.ceil(textures.size.height / Math.sqrt(WORKGROUP_SIZE)),
  ];

  // compute pass - interesting things happen here
  function computePass(encoder: GPUCommandEncoder): GPUComputePassEncoder {
    const pass = encoder.beginComputePass();
    pass.setBindGroup(pipeline.index, pipeline.bindGroup);

    pass.setPipeline(computePipeline);
    pass.dispatchWorkgroups(...TEXTURE_WORKGROUP_COUNT); // in-place state update

    pass.end();
    return pass;
  }

  // ui interaction to gpu buffer 
  function updateParameters() {
    device.queue.writeBuffer( // interaction parameters
      /*buffer=*/ interactions.interactions.buffer,
      /*offset=*/ 0,
      /*data=*/ interactions.interactions.data.buffer
    );
  }

  function frame() {

    updateParameters();
    const encoder = device.createCommandEncoder();

    computePass(encoder);
    renderPass(encoder, canvas, render, pipeline.bindGroup, pipeline.index);

    // submit commands
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch(console.error);
