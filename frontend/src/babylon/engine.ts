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
      return engine;
    } catch (e) {
      console.warn('WebGPU init failed, falling back to WebGL:', e);
    }
  }

  // Fallback to WebGL
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });
  console.log('Using WebGL renderer');
  return engine;
}
