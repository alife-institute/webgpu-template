export function createSimulationPipelines(device: GPUDevice, module: GPUShaderModule, layout: GPUPipelineLayout) {
  return {
    lineConstraint: device.createComputePipeline({ layout, compute: { module, entryPoint: "line_constraint_updates" } }),
    resetMembrane: device.createComputePipeline({ layout, compute: { module, entryPoint: "reset_membrane" } }),
    stericForceUpdate: device.createComputePipeline({ layout, compute: { module, entryPoint: "steric_force_updates" } }),
    orientationUpdate: device.createComputePipeline({ layout, compute: { module, entryPoint: "orientation_updates" } }),
    stericPotentialUpdate: device.createComputePipeline({ layout, compute: { module, entryPoint: "steric_potential_updates" } }),
    textures: device.createComputePipeline({ layout, compute: { module, entryPoint: "update_textures" } }),
    clear: device.createComputePipeline({ layout, compute: { module, entryPoint: "clear_textures" } }),
  };
}

export function runSimulationStep(
  device: GPUDevice,
  pipelines: ReturnType<typeof createSimulationPipelines>,
  bindGroup: GPUBindGroup,
  canvasBuffer: GPUBuffer,
  workgroupCounts: { ACTIN: number; MEMBRANE: number; PREY: number },
  textureWorkgroupCount: [number, number],
  queryInfo?: { querySet: GPUQuerySet; isFirstStep: boolean },
  projectionSteps: number = 20
) {
  // unconstrained force update steps
  {
    const encoder = device.createCommandEncoder();
    let pass = encoder.beginComputePass({
      ...(queryInfo?.isFirstStep && {
        timestampWrites: {
          querySet: queryInfo.querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        },
      }),
    });
    pass.setBindGroup(0, bindGroup);

    pass.setPipeline(pipelines.stericForceUpdate);
    pass.dispatchWorkgroups(workgroupCounts.MEMBRANE);

    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  // line constraint projection steps
  for (let i = 0; i < projectionSteps; i++) {
    [0, 1].forEach((passId) => {
      device.queue.writeBuffer(canvasBuffer, 2 * 4, new Uint32Array([passId]));

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setBindGroup(0, bindGroup);

      pass.setPipeline(pipelines.orientationUpdate);
      pass.dispatchWorkgroups(workgroupCounts.MEMBRANE);

      pass.setPipeline(pipelines.lineConstraint);
      pass.dispatchWorkgroups(workgroupCounts.MEMBRANE);

      pass.end();
      device.queue.submit([encoder.finish()]);
    });
  }

  // update steric potential
  {
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setBindGroup(0, bindGroup);

    pass.setPipeline(pipelines.clear);
    pass.dispatchWorkgroups(...textureWorkgroupCount);

    pass.setPipeline(pipelines.stericPotentialUpdate);
    pass.dispatchWorkgroups(workgroupCounts.MEMBRANE);

    pass.setPipeline(pipelines.textures);
    pass.dispatchWorkgroups(...textureWorkgroupCount);

    pass.end();
    device.queue.submit([encoder.finish()]);
  }
}
