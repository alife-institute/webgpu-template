export class RenderModule {
  private device: GPUDevice;
  private canvasFormat: GPUTextureFormat;
  private downsampleCanvasFormat: GPUTextureFormat;

  // Rendering resources
  private intermediateTexture: GPUTexture;
  private computeRenderPipeline: GPUComputePipeline;
  private renderPipeline: GPURenderPipeline;
  private bindGroupPostProcess: GPUBindGroup;
  private renderBindGroup: GPUBindGroup;

  // Downsampling resources
  private downsampleTexture: GPUTexture;
  private downsamplePipeline: GPUComputePipeline;
  private downsampleRenderPipeline: GPURenderPipeline;
  private downsampleBindGroup: GPUBindGroup;
  private downsampleRenderBindGroup: GPUBindGroup;
  private downsampleWorkgroupCount: [number, number];

  private TEXTURE_WORKGROUP_COUNT: [number, number];

  public constructor(
    device: GPUDevice,
    canvasFormat: GPUTextureFormat,
    downsampleCanvasFormat: GPUTextureFormat,
    canvasSize: { width: number; height: number },
    downsampleSize: { width: number; height: number },
    renderShader: GPUShaderModule,
    textures: {
      size: { width: number; height: number };
    },
    sharedLayoutEntries: GPUBindGroupLayoutEntry[],
    sharedBindGroupEntries: GPUBindGroupEntry[]
  ) {
    this.device = device;
    this.canvasFormat = canvasFormat;
    this.downsampleCanvasFormat = downsampleCanvasFormat;
    this.TEXTURE_WORKGROUP_COUNT = [
      Math.ceil(textures.size.width / 16),
      Math.ceil(textures.size.height / 16),
    ];
    this.downsampleWorkgroupCount = [
      Math.ceil(downsampleSize.width / 16),
      Math.ceil(downsampleSize.height / 16),
    ];

    const BINDING_INTERMEDIATE_TEXTURE = 10;

    this.intermediateTexture = this.device.createTexture({
      size: [canvasSize.width, canvasSize.height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC,
    });

    // Downsample texture
    this.downsampleTexture = this.device.createTexture({
      size: [downsampleSize.width, downsampleSize.height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const bindGroupLayoutPostProcess = this.device.createBindGroupLayout({
      label: "bindGroupLayoutPostProcess",
      entries: [
        ...sharedLayoutEntries,
        {
          binding: BINDING_INTERMEDIATE_TEXTURE,
          visibility: GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
          storageTexture: {
            access: "write-only",
            format: "rgba8unorm",
          },
        },
      ],
    });

    this.bindGroupPostProcess = this.device.createBindGroup({
      label: `Bind Group Post Process`,
      layout: bindGroupLayoutPostProcess,
      entries: [
        ...sharedBindGroupEntries,
        {
          binding: BINDING_INTERMEDIATE_TEXTURE,
          resource: this.intermediateTexture.createView(),
        },
      ],
    });

    const pipelineLayoutPostProcess = this.device.createPipelineLayout({
      label: "pipelineLayoutPostProcess",
      bindGroupLayouts: [bindGroupLayoutPostProcess],
    });

    this.computeRenderPipeline = this.device.createComputePipeline({
      layout: pipelineLayoutPostProcess,
      compute: { module: renderShader, entryPoint: "render" },
    });

    // Downsample pipeline setup
    const downsampleBindGroupLayout = this.device.createBindGroupLayout({
      label: "Downsample Bind Group Layout",
      entries: [
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "unfilterable-float" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: "write-only", format: "rgba8unorm" },
        },
      ],
    });

    this.downsampleBindGroup = this.device.createBindGroup({
      label: "Downsample Bind Group",
      layout: downsampleBindGroupLayout,
      entries: [
        { binding: 1, resource: this.intermediateTexture.createView() },
        { binding: 2, resource: this.downsampleTexture.createView() },
      ],
    });

    const screenSampler = this.device.createSampler({
      magFilter: "nearest",
      minFilter: "nearest",
    });

    const renderBindGroupLayout = this.device.createBindGroupLayout({
      label: "Render Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "non-filtering" },
        },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });

    this.renderBindGroup = this.device.createBindGroup({
      label: "Render Bind Group",
      layout: renderBindGroupLayout,
      entries: [
        { binding: 0, resource: screenSampler },
        { binding: 1, resource: this.intermediateTexture.createView() },
      ],
    });

    this.renderPipeline = this.device.createRenderPipeline({
      label: "Render Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.device.createBindGroupLayout({ entries: [] }),
          renderBindGroupLayout,
        ],
      }),
      vertex: {
        module: renderShader,
        entryPoint: "vert",
      },
      fragment: {
        module: renderShader,
        entryPoint: "frag",
        targets: [{ format: this.canvasFormat }],
      },
      primitive: {
        topology: "triangle-list",
      },
    });

    // Downsample render pipeline
    this.downsampleRenderBindGroup = this.device.createBindGroup({
      label: "Downsample Render Bind Group",
      layout: renderBindGroupLayout, // Reuse layout
      entries: [
        { binding: 0, resource: screenSampler }, // Reuse sampler
        { binding: 1, resource: this.downsampleTexture.createView() },
      ],
    });

    this.downsampleRenderPipeline = this.device.createRenderPipeline({
      label: "Downsample Render Pipeline",
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [
          this.device.createBindGroupLayout({ entries: [] }),
          renderBindGroupLayout,
        ],
      }),
      vertex: {
        module: renderShader, // Can reuse the same full-screen quad vertex shader
        entryPoint: "vert",
      },
      fragment: {
        module: renderShader, // Can reuse the same fragment shader
        entryPoint: "frag",
        targets: [{ format: this.downsampleCanvasFormat }],
      },
      primitive: {
        topology: "triangle-list",
      },
    });
  }

  public render(
    canvasContext: GPUCanvasContext,
    querySet?: GPUQuerySet,
    resolveBuffer?: GPUBuffer,
    resultBuffer?: GPUBuffer
  ) {
    const commandEncoder = this.device.createCommandEncoder();

    // 1. Main compute render pass
    const passCompute = commandEncoder.beginComputePass();
    passCompute.setPipeline(this.computeRenderPipeline);
    passCompute.setBindGroup(0, this.bindGroupPostProcess);
    passCompute.dispatchWorkgroups(...this.TEXTURE_WORKGROUP_COUNT);
    passCompute.end();

    // 2. Main render pass
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasContext.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: "store",
        },
      ],
    });
    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(1, this.renderBindGroup);
    renderPass.draw(6, 1, 0, 0);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }

  public downSample(downsampleCanvasContext: GPUCanvasContext) {
    const commandEncoder = this.device.createCommandEncoder();

    // Pass 2: Render the downsampleTexture to the downsample canvas
    const downsampleRenderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: downsampleCanvasContext.getCurrentTexture().createView(),
          loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: "store",
        },
      ],
    });
    downsampleRenderPass.setPipeline(this.downsampleRenderPipeline);
    downsampleRenderPass.setBindGroup(1, this.downsampleRenderBindGroup);
    downsampleRenderPass.draw(6, 1, 0, 0);
    downsampleRenderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }
}
