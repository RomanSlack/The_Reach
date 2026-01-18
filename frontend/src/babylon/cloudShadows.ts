/**
 * Cloud Shadow System
 *
 * Creates animated cloud shadows that scroll across the terrain.
 * Uses Perlin FBM noise with edge padding for smooth cloud shapes.
 */

import {
  Scene,
  MeshBuilder,
  StandardMaterial,
  Color3,
  DynamicTexture,
  Texture,
  Mesh
} from '@babylonjs/core';

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
  TEX_SIZE: 512,           // Texture resolution
  PANEL_SCALE: 0.9,        // Panel size relative to ground
  SPEED: 5,                // Units per second
  HEIGHT: 1.5,             // Height above terrain
  EDGE_PADDING: 0.2,       // 20% edge fade
  NOISE_SCALE: 60,         // Larger = bigger cloud blobs
  COVERAGE: 0.45,          // Threshold (higher = fewer clouds)
  SHADOW_OPACITY: 0.5,     // Max shadow darkness
  OVERLAP: 0.85,           // Panel overlap factor
};

// ============================================
// PERLIN NOISE
// ============================================
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + t * (b - a);

function generateCloudTexture(scene: Scene, seed: number): DynamicTexture {
  const tex = new DynamicTexture(`cloudShadow_${seed}`, CONFIG.TEX_SIZE, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const img = ctx.createImageData(CONFIG.TEX_SIZE, CONFIG.TEX_SIZE);
  const px = img.data;

  // Gradient cache
  const grads: Map<number, [number, number]> = new Map();
  const getGrad = (ix: number, iy: number): [number, number] => {
    const k = iy * 9999 + ix;
    if (!grads.has(k)) {
      const h = Math.sin(ix * 12.9898 + iy * 78.233 + seed) * 43758.5453;
      const a = (h - Math.floor(h)) * Math.PI * 2;
      grads.set(k, [Math.cos(a), Math.sin(a)]);
    }
    return grads.get(k)!;
  };

  // Perlin 2D
  const perlin = (x: number, y: number): number => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const sx = x - x0, sy = y - y0;
    const [g00x, g00y] = getGrad(x0, y0);
    const [g10x, g10y] = getGrad(x0 + 1, y0);
    const [g01x, g01y] = getGrad(x0, y0 + 1);
    const [g11x, g11y] = getGrad(x0 + 1, y0 + 1);
    const n00 = g00x * sx + g00y * sy;
    const n10 = g10x * (sx - 1) + g10y * sy;
    const n01 = g01x * sx + g01y * (sy - 1);
    const n11 = g11x * (sx - 1) + g11y * (sy - 1);
    const u = fade(sx), v = fade(sy);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
  };

  // FBM (5 octaves)
  const fbm = (px: number, py: number): number => {
    let total = 0, amp = 1, sum = 0;
    for (let o = 0; o < 5; o++) {
      total += perlin(px, py) * amp;
      sum += amp;
      amp *= 0.5;
      px *= 2;
      py *= 2;
    }
    return (total / sum + 0.7) * 0.7;
  };

  // Generate noise values
  const noise = new Float32Array(CONFIG.TEX_SIZE * CONFIG.TEX_SIZE);
  let minV = Infinity, maxV = -Infinity;
  for (let y = 0; y < CONFIG.TEX_SIZE; y++) {
    for (let x = 0; x < CONFIG.TEX_SIZE; x++) {
      const v = fbm(x / CONFIG.NOISE_SCALE, y / CONFIG.NOISE_SCALE);
      noise[y * CONFIG.TEX_SIZE + x] = v;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  }
  const range = maxV - minV || 1;

  // Edge padding zone
  const pad = Math.floor(CONFIG.TEX_SIZE * CONFIG.EDGE_PADDING);

  // Generate pixels
  for (let y = 0; y < CONFIG.TEX_SIZE; y++) {
    for (let x = 0; x < CONFIG.TEX_SIZE; x++) {
      const i = (y * CONFIG.TEX_SIZE + x) * 4;
      const n = (noise[y * CONFIG.TEX_SIZE + x] - minV) / range;

      // Edge fade mask
      const edgeL = Math.min(1, x / pad);
      const edgeR = Math.min(1, (CONFIG.TEX_SIZE - 1 - x) / pad);
      const edgeT = Math.min(1, y / pad);
      const edgeB = Math.min(1, (CONFIG.TEX_SIZE - 1 - y) / pad);
      const mask = fade(Math.min(edgeL, edgeR)) * fade(Math.min(edgeT, edgeB));

      // Threshold and smoothstep
      let density = (n - CONFIG.COVERAGE) / (1.0 - CONFIG.COVERAGE);
      density = Math.max(0, Math.min(1, density));
      density = density * density * (3 - 2 * density);

      const alpha = density * mask * CONFIG.SHADOW_OPACITY;

      px[i] = 0;
      px[i + 1] = 0;
      px[i + 2] = 0;
      px[i + 3] = Math.floor(alpha * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  tex.hasAlpha = true;
  tex.update();
  return tex;
}

function createMaterial(scene: Scene, name: string, texture: DynamicTexture): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseTexture = texture;
  mat.useAlphaFromDiffuseTexture = true;
  mat.diffuseColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0, 0, 0);
  mat.emissiveColor = new Color3(0, 0, 0);
  mat.disableLighting = true;
  mat.backFaceCulling = false;
  mat.transparencyMode = 2; // ALPHABLEND
  return mat;
}

// ============================================
// MAIN EXPORT
// ============================================
export function createCloudShadows(scene: Scene, groundSize: number): void {
  const panelSize = groundSize * CONFIG.PANEL_SCALE;
  const rightEdge = groundSize / 2 + panelSize / 2;

  // Create two panels
  const panelA = MeshBuilder.CreateGround('cloudPanelA', {
    width: panelSize,
    height: panelSize
  }, scene);

  const panelB = MeshBuilder.CreateGround('cloudPanelB', {
    width: panelSize,
    height: panelSize
  }, scene);

  // Initial positions: B to the left of A
  panelA.position.set(0, CONFIG.HEIGHT, 0);
  panelB.position.set(-panelSize * CONFIG.OVERLAP, CONFIG.HEIGHT, 0);

  panelA.isPickable = false;
  panelB.isPickable = false;

  // Create materials with different seeds
  panelA.material = createMaterial(scene, 'cloudMatA', generateCloudTexture(scene, 42));
  panelB.material = createMaterial(scene, 'cloudMatB', generateCloudTexture(scene, 137));

  // Random initial rotations
  panelA.rotation.y = Math.random() * Math.PI * 2;
  panelB.rotation.y = Math.random() * Math.PI * 2;

  let seedCounter = 200;
  let prevTime = performance.now();

  // Animation loop
  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    const dt = (now - prevTime) / 1000;
    prevTime = now;

    // Move both panels to the right
    const move = CONFIG.SPEED * dt;
    panelA.position.x += move;
    panelB.position.x += move;

    // Respawn logic for panel A
    if (panelA.position.x > rightEdge) {
      respawnPanel(panelA, panelB, panelSize, scene, seedCounter++);
    }

    // Respawn logic for panel B
    if (panelB.position.x > rightEdge) {
      respawnPanel(panelB, panelA, panelSize, scene, seedCounter++);
    }
  });

  console.log('Cloud shadows initialized');
}

function respawnPanel(
  panel: Mesh,
  otherPanel: Mesh,
  panelSize: number,
  scene: Scene,
  seed: number
): void {
  // Move to left of the other panel
  panel.position.x = otherPanel.position.x - panelSize * CONFIG.OVERLAP;
  panel.rotation.y = Math.random() * Math.PI * 2;

  // Generate new texture
  const newTex = generateCloudTexture(scene, seed);
  const mat = panel.material as StandardMaterial;
  mat.diffuseTexture?.dispose();
  mat.diffuseTexture = newTex;
}
