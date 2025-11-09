import {
  requestDevice,
  configureCanvas,
  createShader,
  setupInteractions,
  setupTextures,
  getRandomValues,
  PerformanceMonitor,
} from "./utils";
import renderCode from "./shaders/render.wgsl";
import simulateCode from "./shaders/simulate.wgsl";
import { createSimulationPipelines, runSimulationStep } from "./simulate";

// Import shader includes
import bindingsCode from "./shaders/includes/bindings.wgsl";
import texturesCode from "./shaders/includes/textures.wgsl";
import buffersCode from "./shaders/includes/buffers.wgsl";
import randomCode from "./shaders/includes/random.wgsl";
import { RenderModule } from "./render";

// Shader includes mapping
const shaderIncludes: Record<string, string> = {
  bindings: bindingsCode,
  textures: texturesCode,
  buffers: buffersCode,
  random: randomCode,
};

// Sizes in bytes - useful for calculating buffer sizes and offsets
const size32 = 4; // size of a 32-bit float or int

// Uniform values container
const uniforms = {
  computeStepsPerFrame: 20,
  targetFPS: 120,
  actinCount: 1, // 4000 is minimum for nice action.
  membraneCount: 500,
  stiffness: 0.25,
  equilibriumAngle: 0.0,
  disconnectionProbability: 0.006,
  polymerRepulsion: 0.422,
  stericSamplingRange: 16,
  actinCohesionRange: 1,
  bindProb: 0.03,
  monomerBindProbReduction: 0.1, // 10x less likely to bind monomer than polymer
  actinStericForce: 0.2,
  equilibriumLineDistance: 1.0,
  foodSpawnArea: 0.77,
  movementMode: 1,
};

const DEBUGMODE = false;
const debugSize = 200;
const WORKGROUP_SIZE = 256;
const DOWNSAMPLE_SIZE = 28;

async function index() {
  const isMobileDevice =
    /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
      navigator.userAgent
    );
  if (isMobileDevice) {
    uniforms.computeStepsPerFrame = 1;
  }

  // setup and configure WebGPU
  const device = await requestDevice();
  // Get the existing canvas from the DOM instead of creating a new one
  const canvas = configureCanvas(device, "main-canvas"); // Pass the existing canvas element
  const downsampledCanvas = configureCanvas(device, "downsampled-canvas", {
    width: DOWNSAMPLE_SIZE,
    height: DOWNSAMPLE_SIZE,
  }); // Pass the existing canvas element

  let time = Math.floor(Math.random() * 1000);

  const GROUP_INDEX = 0;
  const BINDINGS_BUFFER = { CANVAS: 0, CONTROLS: 1, INTERACTIONS: 2 };
  const BINDINGS_TEXTURE = {
    INDEX: 3,
    STERIC_POTENTIAL: 4,
    PARAMETER_FIELDS: 5,
  };

  const BINDINGS_AGENTS = {
    RANDOM: 6,
    MEMBRANE: 7,
    ACTIN: 8,
    CONNECTION_LOCKS: 9,
    PREY: 10,
  };

  // ---------------------------
  // Set up memory resources
  var actualWidth = canvas.size.width;
  var actualHeight = canvas.size.height;
  if (DEBUGMODE) {
    actualWidth = debugSize;
    actualHeight = debugSize;
  }

  const textures = setupTextures(
    device,
    Object.values(BINDINGS_TEXTURE),
    {},
    {
      depthOrArrayLayers: {
        [BINDINGS_TEXTURE.STERIC_POTENTIAL]: 3,
        [BINDINGS_TEXTURE.PARAMETER_FIELDS]: 4,
        [BINDINGS_TEXTURE.INDEX]: 3,
      },
      width: actualWidth,
      height: actualHeight,
    },
    {
      [BINDINGS_TEXTURE.STERIC_POTENTIAL]: "r32float",
      [BINDINGS_TEXTURE.PARAMETER_FIELDS]: "r32float",
      [BINDINGS_TEXTURE.INDEX]: "r32uint",
    }
  );

  const TEXTURE_WORKGROUP_COUNT: [number, number] = [
    Math.ceil(textures.size.width / Math.sqrt(WORKGROUP_SIZE)),
    Math.ceil(textures.size.height / Math.sqrt(WORKGROUP_SIZE)),
  ];

  const BUFFER_WORKGROUP_COUNT = {
    ACTIN: Math.ceil(uniforms.actinCount / WORKGROUP_SIZE),
    MEMBRANE: Math.ceil(uniforms.membraneCount / WORKGROUP_SIZE),
    PREY: 1,
  };
  const MAX_BUFFER_WORKGROUP_COUNT = Math.max(
    ...Object.values(BUFFER_WORKGROUP_COUNT)
  );

  // setup interactions
  const interactions = setupInteractions(
    device,
    canvas.context.canvas,
    textures.size
  );
  const canvas_buffers = {
    [BINDINGS_BUFFER.CANVAS]: textures.canvas.buffer,
    [BINDINGS_BUFFER.CONTROLS]: interactions.controls.buffer,
    [BINDINGS_BUFFER.INTERACTIONS]: interactions.interactions.buffer,
  };

  // Function to write the uniforms object into the ArrayBuffer according to WGSL struct layout
  const controlsDataView = new DataView(interactions.controls.data);
  const canvasView = new DataView(textures.canvas.data.buffer);

  const writeUniforms = () => {
    // Write canvas size
    canvasView.setInt32(0, actualWidth, true);
    canvasView.setInt32(4, actualHeight, true);

    // Generate a PRNGKey
    canvasView.setUint32(
      12,
      crypto.getRandomValues(new Uint32Array(1))[0],
      true
    );
    canvasView.setUint32(
      16,
      crypto.getRandomValues(new Uint32Array(1))[0],
      true
    );

    // Write controls with adjusted offsets:
    controlsDataView.setUint32(0, uniforms.membraneCount, true);
    controlsDataView.setUint32(4, uniforms.actinCount, true);
    controlsDataView.setFloat32(8, uniforms.stiffness, true);
    controlsDataView.setFloat32(12, uniforms.equilibriumAngle, true);
    controlsDataView.setFloat32(16, uniforms.disconnectionProbability, true);
    controlsDataView.setFloat32(20, uniforms.polymerRepulsion, true);
    controlsDataView.setInt32(24, uniforms.stericSamplingRange, true);
    controlsDataView.setInt32(28, uniforms.actinCohesionRange, true);
    controlsDataView.setFloat32(32, uniforms.bindProb, true);
    controlsDataView.setFloat32(36, uniforms.monomerBindProbReduction, true);
    controlsDataView.setFloat32(40, uniforms.actinStericForce, true);
    controlsDataView.setFloat32(44, uniforms.equilibriumLineDistance, true);
    controlsDataView.setFloat32(48, uniforms.foodSpawnArea, true);
    controlsDataView.setUint32(52, uniforms.movementMode, true);

    device.queue.writeBuffer(
      interactions.controls.buffer,
      0,
      interactions.controls.data
    );
    device.queue.writeBuffer(
      textures.canvas.buffer,
      0,
      new Uint32Array(textures.canvas.data)
    );
  };

  writeUniforms();

  // setup agents
  const randomBufferSize = Math.max(
    textures.size.width * textures.size.height,
    uniforms.actinCount,
    uniforms.membraneCount
  );

  // initialize random buffer
  const randomData = getRandomValues(randomBufferSize);

  const agent_buffers = {
    [BINDINGS_AGENTS.RANDOM]: device.createBuffer({
      label: "Random Buffer",
      size: randomData.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    [BINDINGS_AGENTS.ACTIN]: device.createBuffer({
      size: size32 * 10 * uniforms.actinCount,
      usage: GPUBufferUsage.STORAGE,
    }),
    [BINDINGS_AGENTS.MEMBRANE]: device.createBuffer({
      size: size32 * 10 * uniforms.membraneCount,
      usage: GPUBufferUsage.STORAGE,
    }),
    [BINDINGS_AGENTS.CONNECTION_LOCKS]: device.createBuffer({
      label: "Actin Connection Locks Buffer",
      size: size32 * uniforms.actinCount,
      usage: GPUBufferUsage.STORAGE,
    }),
    [BINDINGS_AGENTS.PREY]: device.createBuffer({
      size: size32 * 10,
      usage: GPUBufferUsage.STORAGE,
    }),
  };

  device.queue.writeBuffer(
    agent_buffers[BINDINGS_AGENTS.RANDOM],
    /*offset=*/ 0,
    /*data=*/ new Float32Array(randomData)
  );

  // ---------------------------
  // Overall memory layout
  const visibility = GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT;

  // This layout is for shared resources between simulation and rendering
  const sharedLayoutEntries = [
    ...Object.values(BINDINGS_BUFFER).map((binding) => ({
      binding: binding,
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      buffer: { type: "uniform" as GPUBufferBindingType },
    })),
    ...Object.values(BINDINGS_TEXTURE).map((binding) => ({
      binding: binding,
      visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
      storageTexture: textures.bindingLayout[binding],
    })),
  ];

  const sharedBindGroupEntries = [
    ...Object.values(BINDINGS_TEXTURE).map((binding) => ({
      binding,
      resource: textures.textures[binding].createView(),
    })),
    ...Object.values(BINDINGS_BUFFER).map((binding) => ({
      binding,
      resource: { buffer: canvas_buffers[binding] },
    })),
  ];

  const bindGroupLayoutSimulate = device.createBindGroupLayout({
    label: "bindGroupLayoutSimulate",
    entries: [
      ...sharedLayoutEntries,
      ...Object.values(BINDINGS_AGENTS).map((binding) => ({
        binding: binding,
        visibility: visibility,
        buffer: { type: "storage" as GPUBufferBindingType },
      })),
    ],
  });

  const bindGroupSimulate = device.createBindGroup({
    label: `Bind Group`,
    layout: bindGroupLayoutSimulate,
    entries: [
      ...sharedBindGroupEntries,
      ...Object.values(BINDINGS_AGENTS).map((binding) => ({
        binding,
        resource: { buffer: agent_buffers[binding] },
      })),
    ],
  });

  const pipelineLayoutSimulate = device.createPipelineLayout({
    label: "pipelineLayout",
    bindGroupLayouts: [bindGroupLayoutSimulate],
  });

  // ---------------------------
  // Set up code instructions
  const module = await createShader(device, simulateCode, shaderIncludes);

  const simPipelines = createSimulationPipelines(
    device,
    module,
    pipelineLayoutSimulate
  );

  // ---------------------------
  // RUN the reset shader function
  const reset = () => {
    writeUniforms();

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setBindGroup(GROUP_INDEX, bindGroupSimulate);

    pass.setPipeline(simPipelines.resetMembrane);
    pass.dispatchWorkgroups(BUFFER_WORKGROUP_COUNT.MEMBRANE);

    pass.end();
    device.queue.submit([encoder.finish()]);
  };
  reset();

  const performanceMonitor = new PerformanceMonitor();
  const renderShader = await createShader(device, renderCode, shaderIncludes);
  const renderModule = new RenderModule(
    device,
    canvas.format,
    downsampledCanvas.format,
    { width: actualWidth, height: actualHeight },
    { width: DOWNSAMPLE_SIZE, height: DOWNSAMPLE_SIZE },
    renderShader,
    textures,
    sharedLayoutEntries,
    sharedBindGroupEntries
  );

  // RUN the sim compute function and render pixels
  function timestep() {
    time++;
    device.queue.writeBuffer(
      interactions.interactions.buffer,
      0,
      new Float32Array(interactions.interactions.data)
    );

    for (let i = 0; i < uniforms.computeStepsPerFrame; i++) {
      runSimulationStep(
        device,
        simPipelines,
        bindGroupSimulate,
        textures.canvas.buffer,
        BUFFER_WORKGROUP_COUNT,
        TEXTURE_WORKGROUP_COUNT
      );
    }

    renderModule.render(canvas.context);
    renderModule.downSample(downsampledCanvas.context);
    performanceMonitor.update(time);
  }

  let lastFrameTime = 0;
  const getFrameInterval = () => 1000 / uniforms.targetFPS; // Convert FPS to milliseconds

  function frame(currentTime: number) {
    if (currentTime - lastFrameTime >= getFrameInterval()) {
      timestep();
      lastFrameTime = currentTime;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return;
}

index();
