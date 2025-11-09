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

  // 2. Create simulation state texture
  // Using r32uint format with read_write access for in-place updates
  const stateTexture = device.createTexture({
    label: "Simulation State",
    size: [SIMULATION_SIZE.width, SIMULATION_SIZE.height],
    format: "r32uint",
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST,
  });

  // 3. Initialize simulation state with random data
  const initialData = new Uint32Array(
    SIMULATION_SIZE.width * SIMULATION_SIZE.height
  );
  for (let i = 0; i < initialData.length; i++) {
    // Random initial state (0 or 1)
    initialData[i] = Math.random() > 0.5 ? 1 : 0;
  }

  device.queue.writeTexture(
    { texture: stateTexture },
    initialData,
    {
      bytesPerRow: SIMULATION_SIZE.width * 4,
      rowsPerImage: SIMULATION_SIZE.height,
    },
    [SIMULATION_SIZE.width, SIMULATION_SIZE.height]
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
        texture: { sampleType: "uint" },
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
