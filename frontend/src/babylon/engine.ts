import { Engine, WebGPUEngine } from '@babylonjs/core';

export async function createEngine(canvas: HTMLCanvasElement): Promise<Engine> {
  // Try WebGPU first
  if (navigator.gpu) {
    try {
      const engine = new WebGPUEngine(canvas, {
        antialias: true,
        stencil: true,
      });
      await engine.initAsync();
      console.log('Using WebGPU renderer');
      // WebGPUEngine extends ThinEngine but implements Engine interface at runtime
      return engine as unknown as Engine;
    } catch (e) {
      console.warn('WebGPU init failed, falling back to WebGL:', e);
    }
  }

  // Fallback to WebGL
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    disableUniformBuffers: true, // Allows more lights by avoiding UBO limits
  });
  console.log('Using WebGL renderer');
  return engine;
}
