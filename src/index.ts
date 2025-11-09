import {
  requestDevice,
  configureCanvas,
  createShaderModule,
} from "./utils";

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

  // 2. Create simulation state textures (ping-pong buffers)
  const textureA = device.createTexture({
    size: [SIMULATION_SIZE.width, SIMULATION_SIZE.height],
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST,
  });

  const textureB = device.createTexture({
    size: [SIMULATION_SIZE.width, SIMULATION_SIZE.height],
    format: "rgba8unorm",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });

  // 3. Initialize simulation state with random data
  const initialData = new Uint8Array(
    SIMULATION_SIZE.width * SIMULATION_SIZE.height * 4
  );
  for (let i = 0; i < initialData.length; i += 4) {
    // Random initial state (black or white)
    const value = Math.random() > 0.5 ? 255 : 0;
    initialData[i] = value;     // R
    initialData[i + 1] = value; // G
    initialData[i + 2] = value; // B
    initialData[i + 3] = 255;   // A
  }

  device.queue.writeTexture(
    { texture: textureA },
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
        texture: { sampleType: "unfilterable-float" },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: "write-only", format: "rgba8unorm" },
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
        texture: { sampleType: "unfilterable-float" },
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

  // 7. Create bind groups for ping-pong rendering
  const computeBindGroupA = device.createBindGroup({
    layout: computeBindGroupLayout,
    entries: [
      { binding: 0, resource: textureA.createView() },
      { binding: 1, resource: textureB.createView() },
    ],
  });

  const computeBindGroupB = device.createBindGroup({
    layout: computeBindGroupLayout,
    entries: [
      { binding: 0, resource: textureB.createView() },
      { binding: 1, resource: textureA.createView() },
    ],
  });

  const renderBindGroupA = device.createBindGroup({
    layout: renderBindGroupLayout,
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: textureA.createView() },
    ],
  });

  const renderBindGroupB = device.createBindGroup({
    layout: renderBindGroupLayout,
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: textureB.createView() },
    ],
  });

  // 8. Animation loop with ping-pong buffers
  let frameCount = 0;
  const workgroupCount = [
    Math.ceil(SIMULATION_SIZE.width / WORKGROUP_SIZE),
    Math.ceil(SIMULATION_SIZE.height / WORKGROUP_SIZE),
  ];

  function frame() {
    const isEvenFrame = frameCount % 2 === 0;

    // Compute pass: update simulation state
    const encoder = device.createCommandEncoder();
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(computePipeline);
    computePass.setBindGroup(
      0,
      isEvenFrame ? computeBindGroupA : computeBindGroupB
    );
    computePass.dispatchWorkgroups(workgroupCount[0], workgroupCount[1]);
    computePass.end();

    // Render pass: draw to canvas
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
    renderPass.setBindGroup(
      0,
      isEvenFrame ? renderBindGroupB : renderBindGroupA
    );
    renderPass.draw(6); // Draw full-screen quad (6 vertices)
    renderPass.end();

    device.queue.submit([encoder.finish()]);

    frameCount++;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

main().catch(console.error);
