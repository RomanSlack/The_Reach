import { useEffect, useState } from 'react';
import type { Scene } from '@babylonjs/core';

interface DebugMetrics {
  fps: number;
  frameTime: number;
  activeMeshes: number;
  totalVertices: number;
  totalMeshes: number;
  totalMaterials: number;
}

interface DebugOverlayProps {
  scene: Scene | null;
}

export function DebugOverlay({ scene }: DebugOverlayProps) {
  const [metrics, setMetrics] = useState<DebugMetrics>({
    fps: 0,
    frameTime: 0,
    activeMeshes: 0,
    totalVertices: 0,
    totalMeshes: 0,
    totalMaterials: 0,
  });

  useEffect(() => {
    if (!scene) return;

    const engine = scene.getEngine();

    const updateMetrics = () => {
      const fps = engine.getFps();
      const activeMeshes = scene.getActiveMeshes();
      let totalVerts = 0;

      for (let i = 0; i < activeMeshes.length; i++) {
        const mesh = activeMeshes.data[i];
        if (mesh && typeof mesh.getTotalVertices === 'function') {
          totalVerts += mesh.getTotalVertices();
        }
      }

      setMetrics({
        fps: Math.round(fps),
        frameTime: fps > 0 ? parseFloat((1000 / fps).toFixed(1)) : 0,
        activeMeshes: activeMeshes.length,
        totalVertices: totalVerts,
        totalMeshes: scene.meshes.length,
        totalMaterials: scene.materials.length,
      });
    };

    const interval = setInterval(updateMetrics, 200);
    return () => clearInterval(interval);
  }, [scene]);

  if (!scene) return null;

  return (
    <div className="fixed top-4 left-4 z-50 bg-black/70 text-white font-mono text-xs p-3 rounded-lg shadow-lg min-w-[160px]">
      <div className="text-green-400 font-bold mb-2">Debug Stats</div>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">FPS:</span>
          <span className={metrics.fps < 30 ? 'text-red-400' : metrics.fps < 50 ? 'text-yellow-400' : 'text-green-400'}>
            {metrics.fps}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Frame:</span>
          <span>{metrics.frameTime}ms</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Active:</span>
          <span>{metrics.activeMeshes}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Meshes:</span>
          <span>{metrics.totalMeshes}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Vertices:</span>
          <span>{(metrics.totalVertices / 1000).toFixed(1)}k</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-gray-400">Materials:</span>
          <span>{metrics.totalMaterials}</span>
        </div>
      </div>
    </div>
  );
}
