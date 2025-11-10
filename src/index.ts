import { requestDevice, configureCanvas, createShaderModule } from "./utils";

// Import shaders
import computeShader from "./shaders/compute.wgsl";
import renderShader from "./shaders/render.wgsl";

// Simulation parameters - easy to modify for workshop participants
const SIMULATION_SIZE = { width: 512, height: 512 };
const WORKGROUP_SIZE = 16; // 16x16 threads per workgroup

async function main() {
  // 1. Initialize WebGPU
  const device = await requestDevice();
  const canvas = configureCanvas(device);

  // 2. Create simulation state texture array with 2 layers
  // Using r32uint format with read_write access for in-place updates
  const stateTexture = device.createTexture({
    label: "Simulation State Array",
    size: [SIMULATION_SIZE.width, SIMULATION_SIZE.height, 2], // 2 layers
    format: "r32uint",
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST,
  });

  // 3. Initialize simulation state with random data for both layers
  const layerSize = SIMULATION_SIZE.width * SIMULATION_SIZE.height;
  const initialData = new Uint32Array(layerSize * 2); // 2 layers

  // Initialize layer 0
  for (let i = 0; i < layerSize; i++) {
    initialData[i] = Math.random() > 0.5 ? 1 : 0;
  }

  // Initialize layer 1
  for (let i = layerSize; i < layerSize * 2; i++) {
    initialData[i] = Math.random() > 0.5 ? 1 : 0;
  }

  device.queue.writeTexture(
    { texture: stateTexture },
    initialData,
    {
      bytesPerRow: SIMULATION_SIZE.width * 4,
      rowsPerImage: SIMULATION_SIZE.height,
    },
    [SIMULATION_SIZE.width, SIMULATION_SIZE.height, 2] // Write to both layers
  );

  // 4. Create compute pipeline for simulation
  const computeModule = await createShaderModule(device, computeShader);

  const computeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: {
          access: "read-write",
          format: "r32uint",
          viewDimension: "2d-array",
        },
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

  // 5. Create render pipeline for visualization
  const renderModule = await createShaderModule(device, renderShader);

  const renderBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        sampler: { type: "non-filtering" },
      },
      {
        binding: 1,
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

  // 6. Create sampler for rendering
  const sampler = device.createSampler({
    magFilter: "nearest",
    minFilter: "nearest",
  });

  // 7. Create bind groups
  const computeBindGroup = device.createBindGroup({
    label: "Compute Bind Group",
    layout: computeBindGroupLayout,
    entries: [{ binding: 0, resource: stateTexture.createView() }],
  });

  const renderBindGroup = device.createBindGroup({
    label: "Render Bind Group",
    layout: renderBindGroupLayout,
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: stateTexture.createView() },
    ],
  });

  // 8. Animation loop
  const workgroupCount = [
    Math.ceil(SIMULATION_SIZE.width / WORKGROUP_SIZE),
    Math.ceil(SIMULATION_SIZE.height / WORKGROUP_SIZE),
  ];

  function frame() {
    const encoder = device.createCommandEncoder();

    // Compute pass: update state in-place
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(0, computeBindGroup);
    computePass.dispatchWorkgroups(workgroupCount[0], workgroupCount[1]);
    computePass.end();

    // Render pass: draw state to canvas
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
    renderPass.draw(6); // Draw full-screen quad (6 vertices)
    renderPass.end();

    device.queue.submit([encoder.finish()]);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch(console.error);
