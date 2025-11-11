import {
  configureCanvas,
  createShader,
  requestDevice,
  setupTextures,
} from "./utils";

import computeShader from "./shaders/compute.wgsl";
import renderShader from "./shaders/render.wgsl";

const SIMULATION_SIZE = { width: 512, height: 512 };
const WORKGROUP_SIZE = 16;

async function main() {
  const device = await requestDevice();
  const canvas = configureCanvas(device);

  const { textures, bindingLayout } = setupTextures(
    device,
    [0],
    {},
    {
      width: SIMULATION_SIZE.width,
      height: SIMULATION_SIZE.height,
      depthOrArrayLayers: { 0: 2 },
    },
    { 0: "r32uint" }
  );

  const stateTexture = textures[0];

  const layerSize = SIMULATION_SIZE.width * SIMULATION_SIZE.height;
  const initialData = new Uint32Array(layerSize * 2);

  for (let i = 0; i < layerSize * 2; i++) {
    initialData[i] = Math.random() > 0.5 ? 1 : 0;
  }

  device.queue.writeTexture(
    { texture: stateTexture },
    initialData,
    {
      bytesPerRow: SIMULATION_SIZE.width * 4,
      rowsPerImage: SIMULATION_SIZE.height,
    },
    [SIMULATION_SIZE.width, SIMULATION_SIZE.height, 2]
  );

  const computeModule = await createShader(device, computeShader);

  const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: bindingLayout[0],
      },
    ],
  });

  const computePipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [computeBindGroupLayout],
    }),
    compute: {
      module: computeModule,
      entryPoint: "compute_main",
    },
  });

  const renderModule = await createShader(device, renderShader);

  const renderBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: "uint",
          viewDimension: "2d-array",
        },
      },
    ],
  });

  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [renderBindGroupLayout],
    }),
    vertex: {
      module: renderModule,
      entryPoint: "vertex_main",
    },
    fragment: {
      module: renderModule,
      entryPoint: "fragment_main",
      targets: [{ format: canvas.format }],
    },
    primitive: {
      topology: "triangle-list",
    },
  });

  const computeBindGroup = device.createBindGroup({
    label: "Compute Bind Group",
    layout: computeBindGroupLayout,
    entries: [{ binding: 0, resource: stateTexture.createView() }],
  });

  const renderBindGroup = device.createBindGroup({
    label: "Render Bind Group",
    layout: renderBindGroupLayout,
    entries: [{ binding: 0, resource: stateTexture.createView() }],
  });

  const workgroupCount = [
    Math.ceil(SIMULATION_SIZE.width / WORKGROUP_SIZE),
    Math.ceil(SIMULATION_SIZE.height / WORKGROUP_SIZE),
  ];

  function frame() {
    const encoder = device.createCommandEncoder();

    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(workgroupCount[0], workgroupCount[1]);
    computePass.end();

    const renderPass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvas.context.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1.0 },
          storeOp: "store",
        },
      ],
    });
    renderPass.setPipeline(renderPipeline);
    renderPass.setBindGroup(0, renderBindGroup);
    renderPass.draw(6);
    renderPass.end();

    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch(console.error);
