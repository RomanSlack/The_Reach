/**
 * Fire Effects Module
 *
 * Creates particle-based fire effects for campfires and torches.
 * Includes flickering point lights for ambient glow.
 */

import {
  Scene,
  ParticleSystem,
  Texture,
  Vector3,
  Color4,
  PointLight,
  Color3,
  TransformNode,
  DynamicTexture,
} from '@babylonjs/core';

// ============================================
// TEXTURE GENERATION
// ============================================

let sharedFireTexture: Texture | null = null;
let sharedSmokeTexture: Texture | null = null;

/**
 * Create a simple procedural fire particle texture
 * Soft circular gradient - works well for low-poly aesthetic
 */
function getFireTexture(scene: Scene): Texture {
  if (sharedFireTexture) return sharedFireTexture;

  const size = 64;
  const texture = new DynamicTexture('fireParticleTex', size, scene, false);
  const ctx = texture.getContext() as CanvasRenderingContext2D;

  // Create radial gradient - soft glow
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 200, 100, 0.8)');
  gradient.addColorStop(0.6, 'rgba(255, 100, 50, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 50, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  texture.update();
  sharedFireTexture = texture;
  return texture;
}

/**
 * Create a smoke particle texture
 * Gray gradient that fades out at edges
 */
function getSmokeTexture(scene: Scene): Texture {
  if (sharedSmokeTexture) return sharedSmokeTexture;

  const size = 64;
  const texture = new DynamicTexture('smokeParticleTex', size, scene, false);
  const ctx = texture.getContext() as CanvasRenderingContext2D;

  // Create radial gradient - visible smoke puff
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );
  gradient.addColorStop(0, 'rgba(200, 200, 200, 1)');
  gradient.addColorStop(0.4, 'rgba(160, 160, 160, 0.8)');
  gradient.addColorStop(0.7, 'rgba(130, 130, 130, 0.4)');
  gradient.addColorStop(1, 'rgba(100, 100, 100, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  texture.update();
  sharedSmokeTexture = texture;
  return texture;
}

// ============================================
// FIRE EFFECT INTERFACE
// ============================================

export interface FireEffect {
  particleSystem: ParticleSystem;
  smokeSystem: ParticleSystem | null;
  light: PointLight;
  baseIntensity: number;
  update: (time: number) => void;
  dispose: () => void;
}

// ============================================
// CAMPFIRE EFFECT
// ============================================

export function createCampfireEffect(
  scene: Scene,
  parent: TransformNode,
  localPosition: Vector3 = Vector3.Zero()
): FireEffect {
  const fireTexture = getFireTexture(scene);
  const smokeTexture = getSmokeTexture(scene);

  // Create emitter node
  const emitter = new TransformNode('campfireEmitter', scene);
  emitter.parent = parent;
  emitter.position = localPosition.add(new Vector3(0, 0.2, 0)); // Low, near fire pit

  // ========== FIRE PARTICLES ==========
  const particles = new ParticleSystem('campfireParticles', 80, scene);
  particles.particleTexture = fireTexture;
  particles.emitter = emitter;

  // Emission shape - small box at fire center
  particles.minEmitBox = new Vector3(-0.15, 0, -0.15);
  particles.maxEmitBox = new Vector3(0.15, 0.1, 0.15);

  // Particle colors - warm orange/yellow gradient
  particles.color1 = new Color4(1.0, 0.8, 0.3, 1);
  particles.color2 = new Color4(1.0, 0.5, 0.1, 1);
  particles.colorDead = new Color4(0.5, 0.1, 0.0, 0);

  // Particle sizes (halved)
  particles.minSize = 0.2;
  particles.maxSize = 0.4;

  // Particle lifetime (doubled for slower movement)
  particles.minLifeTime = 0.6;
  particles.maxLifeTime = 1.6;

  // Emission rate
  particles.emitRate = 60;

  // Direction - upward with slight spread
  particles.direction1 = new Vector3(-0.3, 1, -0.3);
  particles.direction2 = new Vector3(0.3, 1.5, 0.3);

  // Speed (slow, gentle flames)
  particles.minEmitPower = 0.2;
  particles.maxEmitPower = 0.375;
  particles.updateSpeed = 0.01;

  // Gravity - gentle upward pull
  particles.gravity = new Vector3(0, 0.5, 0);

  // Blending for glow effect
  particles.blendMode = ParticleSystem.BLENDMODE_ADD;

  // Start the system
  particles.start();

  // ========== SMOKE PARTICLES ==========
  // Create smoke emitter above the fire
  const smokeEmitter = new TransformNode('campfireSmokeEmitter', scene);
  smokeEmitter.parent = parent;
  smokeEmitter.position = localPosition.add(new Vector3(0, 1.0, 0)); // Above the flames

  const smoke = new ParticleSystem('campfireSmoke', 30, scene);
  smoke.particleTexture = smokeTexture;
  smoke.emitter = smokeEmitter;

  // Emission shape - wider area above fire
  smoke.minEmitBox = new Vector3(-0.2, 0, -0.2);
  smoke.maxEmitBox = new Vector3(0.2, 0.3, 0.2);

  // Smoke colors - visible gray fading to transparent
  smoke.color1 = new Color4(0.7, 0.7, 0.7, 0.6);
  smoke.color2 = new Color4(0.55, 0.55, 0.55, 0.5);
  smoke.colorDead = new Color4(0.4, 0.4, 0.4, 0);

  // Larger, softer particles
  smoke.minSize = 0.4;
  smoke.maxSize = 0.8;

  // Long lifetime - smoke drifts for a while
  smoke.minLifeTime = 5.0;
  smoke.maxLifeTime = 10.0;

  // Lower emission rate
  smoke.emitRate = 6;

  // Direction - upward with spread
  smoke.direction1 = new Vector3(-0.3, 1, -0.3);
  smoke.direction2 = new Vector3(0.3, 1.5, 0.3);

  // Gentle initial speed
  smoke.minEmitPower = 0.08;
  smoke.maxEmitPower = 0.15;
  smoke.updateSpeed = 0.01;

  // Upward drift with sideways wind effect
  smoke.gravity = new Vector3(0.12, 0.2, 0.05);

  // Standard blending for smoke (not additive)
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;

  smoke.start();

  // ========== POINT LIGHT ==========
  const light = new PointLight('campfireLight', Vector3.Zero(), scene);
  light.parent = emitter;
  light.position = new Vector3(0, 0.5, 0);
  light.diffuse = new Color3(1.0, 0.6, 0.2);
  light.specular = new Color3(1.0, 0.5, 0.1);
  light.intensity = 0.75;
  light.range = 12;

  const baseIntensity = light.intensity;

  // Flicker update function
  function update(time: number) {
    // Multi-frequency flicker for realistic fire
    const flicker1 = Math.sin(time * 15) * 0.1;
    const flicker2 = Math.sin(time * 23) * 0.08;
    const flicker3 = Math.sin(time * 37) * 0.05;
    const randomFlicker = (Math.random() - 0.5) * 0.15;

    light.intensity = baseIntensity + flicker1 + flicker2 + flicker3 + randomFlicker;
  }

  function dispose() {
    particles.stop();
    particles.dispose();
    smoke.stop();
    smoke.dispose();
    light.dispose();
    emitter.dispose();
    smokeEmitter.dispose();
  }

  return {
    particleSystem: particles,
    smokeSystem: smoke,
    light,
    baseIntensity,
    update,
    dispose,
  };
}

// ============================================
// TORCH EFFECT
// ============================================

export function createTorchEffect(
  scene: Scene,
  parent: TransformNode,
  localPosition: Vector3 = Vector3.Zero()
): FireEffect {
  const fireTexture = getFireTexture(scene);

  // Create emitter node at torch top
  const emitter = new TransformNode('torchEmitter', scene);
  emitter.parent = parent;
  emitter.position = localPosition.add(new Vector3(-0.7, 0.3, 0.45)); // Top of torch - adjust this value

  // Particle system - smaller than campfire
  const particles = new ParticleSystem('torchParticles', 40, scene);
  particles.particleTexture = fireTexture;
  particles.emitter = emitter;

  // Smaller emission area
  particles.minEmitBox = new Vector3(-0.05, 0, -0.05);
  particles.maxEmitBox = new Vector3(0.05, 0.06, 0.05);

  // Particle colors - similar warm gradient
  particles.color1 = new Color4(1.0, 0.8, 0.4, 1);
  particles.color2 = new Color4(1.0, 0.5, 0.15, 1);
  particles.colorDead = new Color4(0.4, 0.1, 0.0, 0);

  // Smaller particles (1.5x smaller)
  particles.minSize = 0.1;
  particles.maxSize = 0.23;

  // Particle lifetime (doubled for slower movement)
  particles.minLifeTime = 0.4;
  particles.maxLifeTime = 1.0;

  // Emission rate
  particles.emitRate = 60;

  // Direction - mostly upward, tighter spread
  particles.direction1 = new Vector3(-0.15, 1, -0.15);
  particles.direction2 = new Vector3(0.15, 1.2, 0.15);

  // Speed (slow, gentle flames)
  particles.minEmitPower = 0.125;
  particles.maxEmitPower = 0.25;
  particles.updateSpeed = 0.01;

  // Gravity (gentle)
  particles.gravity = new Vector3(0, 0.375, 0);

  // Additive blending
  particles.blendMode = ParticleSystem.BLENDMODE_ADD;

  particles.start();

  // No point light for torches - just particles

  function update(_time: number) {
    // No light to update
  }

  function dispose() {
    particles.stop();
    particles.dispose();
    emitter.dispose();
  }

  return {
    particleSystem: particles,
    smokeSystem: null, // No smoke for torch
    light: null as unknown as PointLight, // No light for torch
    baseIntensity: 0,
    update,
    dispose,
  };
}

// ============================================
// FIRE MANAGER
// ============================================

export class FireManager {
  private scene: Scene;
  private fires: FireEffect[] = [];
  private time: number = 0;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  addCampfire(parent: TransformNode, localPosition?: Vector3): FireEffect {
    const fire = createCampfireEffect(this.scene, parent, localPosition);
    this.fires.push(fire);
    return fire;
  }

  addTorch(parent: TransformNode, localPosition?: Vector3): FireEffect {
    const fire = createTorchEffect(this.scene, parent, localPosition);
    this.fires.push(fire);
    return fire;
  }

  update(deltaTime: number): void {
    this.time += deltaTime;
    for (const fire of this.fires) {
      fire.update(this.time);
    }
  }

  removeFire(fire: FireEffect): void {
    const index = this.fires.indexOf(fire);
    if (index !== -1) {
      this.fires.splice(index, 1);
      fire.dispose();
    }
  }

  dispose(): void {
    for (const fire of this.fires) {
      fire.dispose();
    }
    this.fires = [];
    if (sharedFireTexture) {
      sharedFireTexture.dispose();
      sharedFireTexture = null;
    }
    if (sharedSmokeTexture) {
      sharedSmokeTexture.dispose();
      sharedSmokeTexture = null;
    }
  }
}