import { Vector3, Color3 } from '@babylonjs/core';

// Permutation table for Perlin noise
const permutation = [
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
  8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
  35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
  134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
  55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
  18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
  250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
  189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
  172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
  228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
  107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
  138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
];

// Double the permutation to avoid overflow
const p = [...permutation, ...permutation];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(t: number, a: number, b: number): number {
  return a + t * (b - a);
}

function grad(hash: number, x: number, y: number): number {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

// 2D Perlin noise
export function perlin2D(x: number, y: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;

  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const aa = p[p[X] + Y];
  const ab = p[p[X] + Y + 1];
  const ba = p[p[X + 1] + Y];
  const bb = p[p[X + 1] + Y + 1];

  return lerp(
    v,
    lerp(u, grad(aa, xf, yf), grad(ba, xf - 1, yf)),
    lerp(u, grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1))
  );
}

// Fractal Brownian Motion (multi-octave noise)
export function fbm(
  x: number,
  y: number,
  octaves: number = 6,
  persistence: number = 0.5,
  lacunarity: number = 2.0,
  scale: number = 1.0
): number {
  let total = 0;
  let frequency = scale;
  let amplitude = 1;
  let maxValue = 0;

  for (let i = 0; i < octaves; i++) {
    total += perlin2D(x * frequency, y * frequency) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return total / maxValue;
}

// River path definition with smooth curves
export interface RiverConfig {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  width: number;
  depth: number;
  meander: number;
  frequency: number;
}

export function generateRiverPath(config: RiverConfig, segments: number = 100): Vector3[] {
  const path: Vector3[] = [];
  const { startX, startZ, endX, endZ, meander, frequency } = config;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = lerp(t, startX, endX);

    // Base Z interpolation
    const baseZ = lerp(t, startZ, endZ);

    // Add meandering using sine waves with noise
    const meander1 = Math.sin(x * frequency * 0.01) * meander;
    const meander2 = Math.sin(x * frequency * 0.025 + 1.5) * meander * 0.5;
    const meander3 = perlin2D(x * 0.02, 0) * meander * 0.3;

    const z = baseZ + meander1 + meander2 + meander3;

    path.push(new Vector3(x, 0, z));
  }

  return path;
}

// Calculate distance from a point to the river path
export function distanceToRiver(x: number, z: number, riverPath: Vector3[]): number {
  let minDist = Infinity;

  for (let i = 0; i < riverPath.length - 1; i++) {
    const a = riverPath[i];
    const b = riverPath[i + 1];

    // Project point onto line segment
    const ax = x - a.x;
    const az = z - a.z;
    const bx = b.x - a.x;
    const bz = b.z - a.z;

    const dot = ax * bx + az * bz;
    const lenSq = bx * bx + bz * bz;
    let t = Math.max(0, Math.min(1, dot / lenSq));

    const projX = a.x + t * bx;
    const projZ = a.z + t * bz;

    const dist = Math.sqrt((x - projX) ** 2 + (z - projZ) ** 2);
    minDist = Math.min(minDist, dist);
  }

  return minDist;
}

// Generate terrain height with river carving
export function generateTerrainHeight(
  x: number,
  z: number,
  riverPath: Vector3[],
  riverWidth: number,
  riverDepth: number
): number {
  // Base terrain using FBM
  const baseHeight = fbm(x, z, 6, 0.5, 2.0, 0.008) * 15;

  // Add some larger hills
  const hills = fbm(x, z, 3, 0.6, 2.0, 0.003) * 8;

  // Add fine detail
  const detail = fbm(x, z, 4, 0.4, 2.5, 0.03) * 2;

  let height = baseHeight + hills + detail;

  // Carve river into terrain
  const distToRiver = distanceToRiver(x, z, riverPath);

  if (distToRiver < riverWidth * 2) {
    // River bed (deeper in center)
    if (distToRiver < riverWidth * 0.5) {
      // Deep center channel
      const centerFactor = 1 - (distToRiver / (riverWidth * 0.5));
      height = -riverDepth * (0.5 + 0.5 * centerFactor);
    } else if (distToRiver < riverWidth) {
      // Shallow river area
      const bankFactor = (distToRiver - riverWidth * 0.5) / (riverWidth * 0.5);
      height = lerp(bankFactor, -riverDepth * 0.5, -riverDepth * 0.2);
    } else {
      // Riverbank slope (gradual transition to terrain)
      const slopeFactor = (distToRiver - riverWidth) / riverWidth;
      const smoothSlope = smoothstep(0, 1, slopeFactor);
      const bankHeight = lerp(smoothSlope, -riverDepth * 0.2, height);
      height = bankHeight;
    }
  }

  return height;
}

// Smoothstep function for smoother transitions
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// Generate terrain colors based on height and features
export function getTerrainColor(height: number, distToRiver: number, riverWidth: number): Color3 {
  // River/water area
  if (distToRiver < riverWidth) {
    return new Color3(0.2, 0.4, 0.5); // Water color (handled by separate mesh)
  }

  // Riverbank
  if (distToRiver < riverWidth * 1.5) {
    return new Color3(0.45, 0.4, 0.3); // Sandy/muddy bank
  }

  // Low grass
  if (height < 2) {
    return new Color3(0.4, 0.55, 0.35);
  }

  // Medium grass
  if (height < 6) {
    return new Color3(0.35, 0.5, 0.3);
  }

  // High grass / shrubs
  if (height < 10) {
    return new Color3(0.3, 0.45, 0.25);
  }

  // Rocky areas
  return new Color3(0.5, 0.5, 0.45);
}
