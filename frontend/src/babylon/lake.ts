import {
  Scene,
  Vector3,
  MeshBuilder,
  Mesh,
  Color3,
  Color4,
  Texture,
  DynamicTexture,
  StandardMaterial,
  ParticleSystem,
  TransformNode,
} from '@babylonjs/core';
import { getWaterLevel, type LakeConfig } from './terrain';

// ===========================================
// LAKE WATER SYSTEM
// ===========================================
// Handles lake mesh, water material, and animated ripple effects
// including random "fish" ripples for organic feel

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

// Fractal Brownian Motion for richer noise
function fbm(x: number, y: number, octaves: number = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, y * frequency);
    amplitude *= 0.5;
    frequency *= 2;
  }

  return value;
}

export interface LakeSystem {
  mesh: Mesh;
  material: StandardMaterial;
  update: (deltaTime: number) => void;
  spawnRippleAt: (x: number, z: number) => void;
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
  // NOISE BUMP TEXTURE (generated once, richer detail)
  // ===========================================
  const textureSize = 256;
  const baseNoiseTexture = new DynamicTexture('waterBaseTex', textureSize, scene, true);
  const baseCtx = baseNoiseTexture.getContext() as CanvasRenderingContext2D;

  // Generate noise pattern with more contrast for visible waves
  const baseImageData = baseCtx.createImageData(textureSize, textureSize);
  const baseData = baseImageData.data;

  for (let py = 0; py < textureSize; py++) {
    for (let px = 0; px < textureSize; px++) {
      const idx = (py * textureSize + px) * 4;
      const u = px / textureSize;
      const v = py / textureSize;

      // Multi-scale noise for waves
      const scale = 6;
      const eps = 0.008;

      // Sample noise at current point and neighbors for normal calculation
      const h = fbm(u * scale, v * scale, 4);
      const hL = fbm((u - eps) * scale, v * scale, 4);
      const hR = fbm((u + eps) * scale, v * scale, 4);
      const hD = fbm(u * scale, (v - eps) * scale, 4);
      const hU = fbm(u * scale, (v + eps) * scale, 4);

      // Calculate normal from height differences (subtle for gentle waves)
      let nx = (hL - hR) * 3;
      let ny = (hD - hU) * 3;
      let nz = 1.0;

      // Normalize
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;
      nz /= len;

      // Convert to RGB normal map (0-1 range mapped to 0-255)
      baseData[idx] = Math.floor((nx * 0.5 + 0.5) * 255);
      baseData[idx + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      baseData[idx + 2] = Math.floor((nz * 0.5 + 0.5) * 255);
      baseData[idx + 3] = 255;
    }
  }

  baseCtx.putImageData(baseImageData, 0, 0);
  baseNoiseTexture.update();
  baseNoiseTexture.wrapU = Texture.WRAP_ADDRESSMODE;
  baseNoiseTexture.wrapV = Texture.WRAP_ADDRESSMODE;

  // Apply as bump texture (subtle)
  lakeMat.bumpTexture = baseNoiseTexture;
  (lakeMat.bumpTexture as Texture).level = 0.2;
  (lakeMat.bumpTexture as Texture).uScale = 5;
  (lakeMat.bumpTexture as Texture).vScale = 5;

  lake.material = lakeMat;

  // ===========================================
  // RIPPLE RINGS (flat discs that expand and fade)
  // ===========================================
  interface RippleMesh {
    outerRing: Mesh;
    innerRing: Mesh;
    birthTime: number;
    duration: number;
    maxRadius: number;
    x: number;
    z: number;
  }

  const activeRippleMeshes: RippleMesh[] = [];
  const maxRipples = 5;
  let totalTime = 0;
  let nextRippleTime = 10 + Math.random() * 10;

  function getNextRippleDelay(): number {
    return 15 + Math.random() * 24; // 15-39 seconds (3x less frequent)
  }

  function spawnRipple(atX?: number, atZ?: number) {
    if (activeRippleMeshes.length >= maxRipples) {
      const oldest = activeRippleMeshes.shift();
      if (oldest) {
        oldest.outerRing.dispose();
        oldest.innerRing.dispose();
      }
    }

    // Use provided position or random position within lake
    let x: number, z: number;
    if (atX !== undefined && atZ !== undefined) {
      x = atX;
      z = atZ;
    } else {
      const angle = Math.random() * Math.PI * 2;
      const dist = 5 + Math.random() * (lakeRadius * 0.5);
      x = lakeConfig.centerX + Math.cos(angle) * dist;
      z = lakeConfig.centerZ + Math.sin(angle) * dist;
    }

    // Create outer ring (flat torus lying on water)
    const outerRing = MeshBuilder.CreateTorus('rippleOuter', {
      diameter: 1,
      thickness: 0.08,
      tessellation: 48,
    }, scene);

    // Position flat on water - torus default is in XZ plane, no rotation needed
    outerRing.position = new Vector3(x, waterLevel + 0.03, z);

    const outerMat = new StandardMaterial('rippleOuterMat_' + totalTime, scene);
    outerMat.diffuseColor = new Color3(0.6, 0.75, 0.85);
    outerMat.specularColor = new Color3(0.3, 0.35, 0.4); // Reduced specular
    outerMat.specularPower = 32;
    outerMat.emissiveColor = new Color3(0.08, 0.1, 0.12); // Subtle glow
    outerMat.alpha = 0.5;
    outerMat.backFaceCulling = false;
    outerRing.material = outerMat;

    // Create inner ring (smaller, follows behind)
    const innerRing = MeshBuilder.CreateTorus('rippleInner', {
      diameter: 0.5,
      thickness: 0.05,
      tessellation: 32,
    }, scene);

    innerRing.position = new Vector3(x, waterLevel + 0.02, z); // Slightly lower

    const innerMat = new StandardMaterial('rippleInnerMat_' + totalTime, scene);
    innerMat.diffuseColor = new Color3(0.55, 0.7, 0.8);
    innerMat.specularColor = new Color3(0.2, 0.25, 0.3);
    innerMat.specularPower = 32;
    innerMat.emissiveColor = new Color3(0.05, 0.07, 0.09);
    innerMat.alpha = 0.35;
    innerMat.backFaceCulling = false;
    innerRing.material = innerMat;

    const duration = 5 + Math.random() * 2; // 5-7 seconds for slower fade
    const maxRadius = 3 + Math.random() * 2; // Half size (3-5 units)

    activeRippleMeshes.push({
      outerRing,
      innerRing,
      birthTime: totalTime,
      duration,
      maxRadius,
      x,
      z,
    });

    console.log(`[Lake] Fish ripple at (${x.toFixed(1)}, ${z.toFixed(1)})`);
  }

  // ===========================================
  // UPDATE LOOP
  // ===========================================
  let animTime = 0;

  function update(deltaTime: number) {
    totalTime += deltaTime;
    animTime += deltaTime;

    // Animate base texture UV offset (slow drift) - 2x speed
    const slowTime = animTime * 0.03;
    (lakeMat.bumpTexture as Texture).uOffset = Math.sin(slowTime * 0.4) * 0.08 + slowTime * 0.024;
    (lakeMat.bumpTexture as Texture).vOffset = Math.cos(slowTime * 0.3) * 0.08 + slowTime * 0.018;

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
      const progress = Math.min(age / ripple.duration, 1);

      // Smooth fade out - stays visible until 50%, then fades linearly to zero
      const fadeStart = 0.5;
      let fadeOut = 1;
      if (progress > fadeStart) {
        // Linear fade from 1 to 0 over the remaining 50%
        fadeOut = 1 - ((progress - fadeStart) / (1 - fadeStart));
      }

      // Remove only after fully faded (progress past duration)
      if (age > ripple.duration + 0.1) {
        ripple.outerRing.material?.dispose();
        ripple.outerRing.dispose();
        ripple.innerRing.material?.dispose();
        ripple.innerRing.dispose();
        activeRippleMeshes.splice(i, 1);
        continue;
      }

      // Expand the rings smoothly
      const easeOut = 1 - Math.pow(1 - progress, 2); // ease out quad
      const outerRadius = 1 + easeOut * ripple.maxRadius;
      const innerRadius = 0.5 + easeOut * ripple.maxRadius * 0.6;

      // Scale rings (they lie flat, so scale X and Z)
      ripple.outerRing.scaling.x = outerRadius;
      ripple.outerRing.scaling.z = outerRadius;
      ripple.outerRing.scaling.y = Math.max(0.3, 1 - progress * 0.5); // Thinner over time

      ripple.innerRing.scaling.x = innerRadius;
      ripple.innerRing.scaling.z = innerRadius;
      ripple.innerRing.scaling.y = Math.max(0.3, 1 - progress * 0.4);

      // Update alpha with smooth fade
      const outerMat = ripple.outerRing.material as StandardMaterial;
      const innerMat = ripple.innerRing.material as StandardMaterial;

      if (outerMat) outerMat.alpha = fadeOut * 0.45;
      if (innerMat) innerMat.alpha = fadeOut * 0.3;
    }
  }

  // ===========================================
  // SPLASH PARTICLE EFFECT
  // ===========================================
  // Create a small splash particle texture (soft blue circle)
  const splashTexture = new DynamicTexture('splashParticleTex', 32, scene, false);
  const splashCtx = splashTexture.getContext() as CanvasRenderingContext2D;
  const splashGradient = splashCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  splashGradient.addColorStop(0, 'rgba(150, 200, 255, 1)');
  splashGradient.addColorStop(0.5, 'rgba(100, 170, 230, 0.7)');
  splashGradient.addColorStop(1, 'rgba(80, 150, 220, 0)');
  splashCtx.fillStyle = splashGradient;
  splashCtx.fillRect(0, 0, 32, 32);
  splashTexture.update();

  function spawnSplash(x: number, z: number) {
    // Create emitter at click position (slightly above water)
    const emitter = new TransformNode('splashEmitter_' + Date.now(), scene);
    emitter.position = new Vector3(x, waterLevel + 0.1, z);

    const splash = new ParticleSystem('splash_' + Date.now(), 50, scene);
    splash.particleTexture = splashTexture;
    splash.emitter = emitter;

    // Tight emission at water surface
    splash.minEmitBox = new Vector3(-0.2, 0, -0.2);
    splash.maxEmitBox = new Vector3(0.2, 0.1, 0.2);

    // Light blue water colors (more opaque)
    splash.color1 = new Color4(0.7, 0.85, 1.0, 1.0);
    splash.color2 = new Color4(0.6, 0.8, 0.95, 0.9);
    splash.colorDead = new Color4(0.5, 0.7, 0.9, 0);

    // Bigger particles
    splash.minSize = 0.15;
    splash.maxSize = 0.35;

    // Short lifetime
    splash.minLifeTime = 0.4;
    splash.maxLifeTime = 0.8;

    // Burst upward and outward
    splash.direction1 = new Vector3(-0.8, 2, -0.8);
    splash.direction2 = new Vector3(0.8, 4, 0.8);

    // Stronger burst speed
    splash.minEmitPower = 1.5;
    splash.maxEmitPower = 3;
    splash.updateSpeed = 0.01;

    // Gravity pulls droplets back down
    splash.gravity = new Vector3(0, -6, 0);

    // Additive blending for more visibility
    splash.blendMode = ParticleSystem.BLENDMODE_ADD;

    // Use manual emit for one-shot burst
    splash.emitRate = 0;
    splash.manualEmitCount = 30;

    splash.start();

    // Clean up after particles fade (don't dispose texture)
    setTimeout(() => {
      splash.stop();
      splash.particleTexture = null; // Prevent texture disposal
      splash.dispose();
      emitter.dispose();
    }, 1500);
  }

  function spawnRippleAt(x: number, z: number) {
    spawnRipple(x, z);
    spawnSplash(x, z);
  }

  // ===========================================
  // DISPOSE
  // ===========================================
  function dispose() {
    for (const ripple of activeRippleMeshes) {
      ripple.outerRing.material?.dispose();
      ripple.outerRing.dispose();
      ripple.innerRing.material?.dispose();
      ripple.innerRing.dispose();
    }
    baseNoiseTexture.dispose();
    splashTexture.dispose();
    lakeMat.dispose();
    lake.dispose();
  }

  return {
    mesh: lake,
    material: lakeMat,
    update,
    spawnRippleAt,
    dispose,
  };
}
