import {
  Scene,
  Vector3,
  MeshBuilder,
  Mesh,
  Color3,
  Texture,
  DynamicTexture,
  StandardMaterial,
} from '@babylonjs/core';
import { getWaterLevel, type LakeConfig } from './terrain';

// ===========================================
// LAKE WATER SYSTEM
// ===========================================
// Handles lake mesh, water material, and animated ripple effects
// including random "fish" ripples for organic feel

// Ripple data structure
interface Ripple {
  x: number;      // World position
  z: number;
  birthTime: number;
  duration: number;
  maxRadius: number;
}

// Simple seeded random for consistent noise
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// 2D noise function
function noise2D(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = seededRandom(ix + iy * 57);
  const b = seededRandom(ix + 1 + iy * 57);
  const c = seededRandom(ix + (iy + 1) * 57);
  const d = seededRandom(ix + 1 + (iy + 1) * 57);

  return a * (1 - ux) * (1 - uy) +
         b * ux * (1 - uy) +
         c * (1 - ux) * uy +
         d * ux * uy;
}

// Simplified FBM (fewer octaves for performance)
function fbm(x: number, y: number): number {
  return noise2D(x, y) * 0.6 +
         noise2D(x * 2, y * 2) * 0.3 +
         noise2D(x * 4, y * 4) * 0.1;
}

export interface LakeSystem {
  mesh: Mesh;
  material: StandardMaterial;
  update: (deltaTime: number) => void;
  dispose: () => void;
}

export function createLake(scene: Scene, lakeConfig: LakeConfig): LakeSystem {
  const waterLevel = getWaterLevel(lakeConfig);
  const lakeRadius = lakeConfig.radius * 1.15;

  // ===========================================
  // LAKE MESH
  // ===========================================
  const lake = MeshBuilder.CreateDisc('lake', {
    radius: lakeRadius,
    tessellation: 64,
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);

  lake.rotation.x = Math.PI / 2;
  lake.position = new Vector3(lakeConfig.centerX, waterLevel, lakeConfig.centerZ);

  // ===========================================
  // WATER MATERIAL
  // ===========================================
  const lakeMat = new StandardMaterial('lakeMat', scene);
  lakeMat.diffuseColor = new Color3(0.3, 0.55, 0.7);
  lakeMat.specularColor = new Color3(0.8, 0.9, 1.0);
  lakeMat.specularPower = 128;
  lakeMat.alpha = 0.55;
  lakeMat.backFaceCulling = false;
  lakeMat.emissiveColor = new Color3(0.05, 0.1, 0.15);

  // ===========================================
  // STATIC BASE NOISE TEXTURE (generated once)
  // ===========================================
  const textureSize = 256;
  const baseNoiseTexture = new DynamicTexture('waterBaseTex', textureSize, scene, true);
  const baseCtx = baseNoiseTexture.getContext() as CanvasRenderingContext2D;

  // Generate static noise pattern once
  const baseImageData = baseCtx.createImageData(textureSize, textureSize);
  const baseData = baseImageData.data;

  for (let py = 0; py < textureSize; py++) {
    for (let px = 0; px < textureSize; px++) {
      const idx = (py * textureSize + px) * 4;
      const u = px / textureSize;
      const v = py / textureSize;

      // Multi-scale noise for natural look
      const n = fbm(u * 8, v * 8);

      // Convert to normal map (pointing mostly up with slight variation)
      const nx = (fbm(u * 8 + 0.01, v * 8) - n) * 4;
      const ny = (fbm(u * 8, v * 8 + 0.01) - n) * 4;
      const nz = 1.0;

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

      baseData[idx] = Math.floor((nx / len * 0.5 + 0.5) * 255);
      baseData[idx + 1] = Math.floor((ny / len * 0.5 + 0.5) * 255);
      baseData[idx + 2] = Math.floor((nz / len * 0.5 + 0.5) * 255);
      baseData[idx + 3] = 255;
    }
  }

  baseCtx.putImageData(baseImageData, 0, 0);
  baseNoiseTexture.update();
  baseNoiseTexture.wrapU = Texture.WRAP_ADDRESSMODE;
  baseNoiseTexture.wrapV = Texture.WRAP_ADDRESSMODE;

  // Apply as bump texture
  lakeMat.bumpTexture = baseNoiseTexture;
  (lakeMat.bumpTexture as Texture).level = 0.3;
  (lakeMat.bumpTexture as Texture).uScale = 6;
  (lakeMat.bumpTexture as Texture).vScale = 6;

  lake.material = lakeMat;

  // ===========================================
  // RIPPLE RINGS (3D meshes that expand and fade)
  // ===========================================
  interface RippleMesh {
    mesh: Mesh;
    birthTime: number;
    duration: number;
    maxRadius: number;
    x: number;
    z: number;
  }

  const activeRippleMeshes: RippleMesh[] = [];
  const maxRipples = 5;
  let totalTime = 0;
  let nextRippleTime = 3 + Math.random() * 4; // First ripple after 3-7 seconds

  function getNextRippleDelay(): number {
    return 5 + Math.random() * 8; // 5-13 seconds between ripples
  }

  // Create ripple ring material (shared)
  const rippleMat = new StandardMaterial('rippleMat', scene);
  rippleMat.diffuseColor = new Color3(0.7, 0.85, 1.0);
  rippleMat.specularColor = new Color3(1, 1, 1);
  rippleMat.specularPower = 64;
  rippleMat.emissiveColor = new Color3(0.15, 0.2, 0.25);
  rippleMat.alpha = 0;
  rippleMat.backFaceCulling = false;

  function spawnRipple() {
    // Remove oldest if at max
    if (activeRippleMeshes.length >= maxRipples) {
      const oldest = activeRippleMeshes.shift();
      if (oldest) oldest.mesh.dispose();
    }

    // Random position within lake (avoid edges)
    const angle = Math.random() * Math.PI * 2;
    const dist = 5 + Math.random() * (lakeRadius * 0.5);
    const x = lakeConfig.centerX + Math.cos(angle) * dist;
    const z = lakeConfig.centerZ + Math.sin(angle) * dist;

    // Create torus (ring shape)
    const ring = MeshBuilder.CreateTorus('ripple', {
      diameter: 0.5,
      thickness: 0.15,
      tessellation: 32,
    }, scene);

    ring.position = new Vector3(x, waterLevel + 0.02, z);
    ring.rotation.x = Math.PI / 2;

    // Clone material for independent alpha
    const mat = rippleMat.clone('rippleMat_' + totalTime);
    mat.alpha = 0.6;
    ring.material = mat;

    const duration = 4 + Math.random() * 2;
    const maxRadius = 8 + Math.random() * 6;

    activeRippleMeshes.push({
      mesh: ring,
      birthTime: totalTime,
      duration,
      maxRadius,
      x,
      z,
    });

    console.log(`[Lake] Fish ripple at (${x.toFixed(1)}, ${z.toFixed(1)}), duration: ${duration.toFixed(1)}s`);
  }

  // ===========================================
  // UPDATE LOOP
  // ===========================================
  let animTime = 0;

  function update(deltaTime: number) {
    totalTime += deltaTime;
    animTime += deltaTime;

    // Animate base texture UV offset (slow drift)
    const slowTime = animTime * 0.02;
    (lakeMat.bumpTexture as Texture).uOffset = Math.sin(slowTime * 0.5) * 0.05 + slowTime * 0.01;
    (lakeMat.bumpTexture as Texture).vOffset = Math.cos(slowTime * 0.35) * 0.05 + slowTime * 0.008;

    // Spawn ripples periodically
    nextRippleTime -= deltaTime;
    if (nextRippleTime <= 0) {
      spawnRipple();
      nextRippleTime = getNextRippleDelay();
    }

    // Update ripple meshes
    for (let i = activeRippleMeshes.length - 1; i >= 0; i--) {
      const ripple = activeRippleMeshes[i];
      const age = totalTime - ripple.birthTime;

      if (age > ripple.duration) {
        // Remove expired ripple
        ripple.mesh.material?.dispose();
        ripple.mesh.dispose();
        activeRippleMeshes.splice(i, 1);
        continue;
      }

      // Calculate progress (0 to 1)
      const progress = age / ripple.duration;

      // Expand the ring
      const currentRadius = 0.5 + progress * ripple.maxRadius;
      ripple.mesh.scaling.x = currentRadius;
      ripple.mesh.scaling.z = currentRadius;

      // Fade out with smooth curve
      const fadeOut = Math.pow(1 - progress, 2);
      const mat = ripple.mesh.material as StandardMaterial;
      if (mat) {
        mat.alpha = fadeOut * 0.5;
      }

      // Ring gets thinner as it expands
      ripple.mesh.scaling.y = 1 - progress * 0.7;
    }
  }

  function dispose() {
    // Clean up ripple meshes
    for (const ripple of activeRippleMeshes) {
      ripple.mesh.material?.dispose();
      ripple.mesh.dispose();
    }
    rippleMat.dispose();
    baseNoiseTexture.dispose();
    lakeMat.dispose();
    lake.dispose();
  }

  return {
    mesh: lake,
    material: lakeMat,
    update,
    dispose,
  };
}
