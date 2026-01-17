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

// Lake configuration
export interface LakeConfig {
  centerX: number;
  centerZ: number;
  radius: number;      // Base radius of the lake
  depth: number;       // Maximum depth
  shoreWidth: number;  // Width of the shore/beach area
}

// Calculate distance from a point to the lake center, with organic shape
export function distanceToLake(x: number, z: number, config: LakeConfig): number {
  const dx = x - config.centerX;
  const dz = z - config.centerZ;
  const baseDist = Math.sqrt(dx * dx + dz * dz);

  // Add noise to make the lake shape organic (not perfectly circular)
  const angle = Math.atan2(dz, dx);
  const shapeNoise = perlin2D(angle * 2, baseDist * 0.01) * config.radius * 0.25;
  const shapeNoise2 = perlin2D(angle * 5 + 100, baseDist * 0.02) * config.radius * 0.1;

  // Effective distance accounts for organic shape
  return baseDist - shapeNoise - shapeNoise2;
}

// Get the effective lake radius at a given angle (for water mesh)
export function getLakeRadiusAtAngle(angle: number, config: LakeConfig): number {
  const shapeNoise = perlin2D(angle * 2, 0) * config.radius * 0.25;
  const shapeNoise2 = perlin2D(angle * 5 + 100, 0) * config.radius * 0.1;
  return config.radius + shapeNoise + shapeNoise2;
}

// Water surface level (exported for use in scene.ts)
export function getWaterLevel(lakeConfig: LakeConfig): number {
  return -lakeConfig.depth * 0.2; // Water surface Y position
}

// Generate terrain height with central lake basin
export function generateTerrainHeight(
  x: number,
  z: number,
  lakeConfig: LakeConfig
): number {
  const distToLake = distanceToLake(x, z, lakeConfig);
  const waterSurface = getWaterLevel(lakeConfig);

  // Base terrain using FBM (always positive base)
  const baseHeight = fbm(x, z, 6, 0.5, 2.0, 0.008) * 10 + 3;

  // Rolling hills
  const hills = fbm(x, z, 3, 0.6, 2.0, 0.004) * 6;

  // Fine detail everywhere
  const detail = fbm(x, z, 4, 0.4, 2.5, 0.03) * 1.5;

  let height = baseHeight + hills + detail;

  // Lake bed - below water level
  if (distToLake < lakeConfig.radius) {
    // Inside the lake - create bowl-shaped depression
    const lakeInfluence = 1 - distToLake / lakeConfig.radius;
    const lakeSmooth = lakeInfluence * lakeInfluence;

    // Deeper toward center, starting from water surface
    const lakebedDepth = lakeConfig.depth * (0.3 + 0.7 * lakeSmooth);
    height = waterSurface - lakebedDepth;

    // Add slight lakebed variation
    const bedNoise = fbm(x * 0.05, z * 0.05, 2, 0.5, 2.0, 1.0) * 0.5;
    height += bedNoise;
  } else if (distToLake < lakeConfig.radius + lakeConfig.shoreWidth) {
    // Shore/beach area - slopes up from water edge to terrain
    const shoreProgress = (distToLake - lakeConfig.radius) / lakeConfig.shoreWidth;
    const shoreSmooth = shoreProgress * shoreProgress * (3 - 2 * shoreProgress);

    // Shore starts at water level and rises to meet terrain
    const shoreTerrainHeight = Math.max(waterSurface + 1, height * 0.3);
    height = lerp(shoreSmooth, waterSurface - 0.1, shoreTerrainHeight);
  } else {
    // Beyond shore - gradually reduce height toward lake (basin effect)
    const basinWidth = lakeConfig.radius * 2;
    const basinDist = distToLake - lakeConfig.radius - lakeConfig.shoreWidth;
    if (basinDist < basinWidth) {
      const basinInfluence = 1 - basinDist / basinWidth;
      const basinSmooth = basinInfluence * basinInfluence;
      // Reduce terrain height near the lake
      const minHeight = waterSurface + 2;
      height = lerp(basinSmooth, height, Math.max(minHeight, height * 0.5));
    }
  }

  return height;
}

// Legacy function signatures for compatibility (redirects to lake-based)
export function distanceToRiver(x: number, z: number, _riverPath: Vector3[]): number {
  // Redirect to lake distance - this is a compatibility shim
  const defaultLake: LakeConfig = { centerX: 0, centerZ: 0, radius: 35, depth: 4, shoreWidth: 15 };
  return distanceToLake(x, z, defaultLake);
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
