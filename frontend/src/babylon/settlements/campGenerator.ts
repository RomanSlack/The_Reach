/**
 * Camp Generator Module
 *
 * Procedurally generates camp layouts based on project progress.
 * Uses seeded random for deterministic but unique layouts per project.
 */

import {
  CampAssetType,
  SettlementLevel,
  type PlacementSlot,
  type SettlementLayout,
} from './types';

// ============================================
// SEEDED RANDOM NUMBER GENERATOR
// ============================================

/**
 * Mulberry32 - Fast, high-quality 32-bit PRNG
 * Produces deterministic sequences from a seed
 */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /**
   * Generate next random number between 0 and 1
   */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Random number in range [min, max)
   */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /**
   * Random integer in range [min, max]
   */
  intRange(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /**
   * Random element from array
   */
  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }

  /**
   * Shuffle array in place
   */
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// ============================================
// LAYOUT CONFIGURATION
// ============================================

interface CampConfig {
  // Base dimensions
  campRadius: number;

  // Asset placement radii (distance from center)
  campfireRadius: number;       // Campfire is always center
  tentMinRadius: number;        // Inner ring for tents
  tentMaxRadius: number;        // Outer ring for tents
  crateMinRadius: number;       // Crates near tents
  crateMaxRadius: number;
  torchRadius: number;          // Torches at camp perimeter
  rockMinRadius: number;        // Rocks scattered throughout
  rockMaxRadius: number;

  // Placement variation
  positionJitter: number;       // Random offset from calculated position
  rotationJitter: number;       // Random rotation variation (radians)
  scaleVariation: number;       // Scale variation (0.1 = ±10%)

  // Minimum spacing between same-type assets
  tentSpacing: number;
  crateSpacing: number;
  rockSpacing: number;
}

// Compact camp layout - assets are 3x scale but placed close together
const DEFAULT_CAMP_CONFIG: CampConfig = {
  campRadius: 8,               // Selection/hitbox radius

  campfireRadius: 0,           // Campfire always at center
  tentMinRadius: 2.5,          // Tents very close to fire
  tentMaxRadius: 3.5,
  crateMinRadius: 1.5,         // Crates very close, near campfire
  crateMaxRadius: 3,
  torchRadius: 4,              // Torches at camp edge
  rockMinRadius: 1,            // Rocks scattered throughout
  rockMaxRadius: 4,

  positionJitter: 0.3,         // Small random offset
  rotationJitter: Math.PI / 8, // ±22.5 degrees
  scaleVariation: 0.1,         // Slight scale variation

  tentSpacing: 3,              // Minimum distance between tents
  crateSpacing: 1.5,           // Crates can be closer
  rockSpacing: 2,
};

// ============================================
// PROGRESSION-BASED ASSET COUNTS
// ============================================

interface AssetCounts {
  tents: number;
  crates: number;
  torches: number;
  rocksSmall: number;
  rocksLarge: number;
}

/**
 * Calculate asset counts based on completed tasks
 * Base camp: 1 campfire, 2 tents, 3 crates, 2 torches, 2 rocks
 */
function getAssetCounts(completedTasks: number): AssetCounts {
  // Base counts (starting camp)
  const base: AssetCounts = {
    tents: 2,
    crates: 3,
    torches: 2,
    rocksSmall: 1,
    rocksLarge: 1,
  };

  // Progressive additions based on task completion
  if (completedTasks >= 3) base.crates = 4;
  if (completedTasks >= 5) base.tents = 3;
  if (completedTasks >= 6) base.rocksSmall = 2;
  if (completedTasks >= 8) base.torches = 3;
  if (completedTasks >= 10) {
    base.tents = 4;
    base.crates = 5;
    base.rocksLarge = 2;
  }

  return base;
}

// ============================================
// PLACEMENT GENERATION
// ============================================

/**
 * Generate a position on a circle with jitter
 */
function generateCircularPosition(
  rng: SeededRandom,
  baseAngle: number,
  radius: number,
  config: CampConfig
): { x: number; z: number } {
  const jitteredAngle = baseAngle + rng.range(-config.rotationJitter, config.rotationJitter);
  const jitteredRadius = radius + rng.range(-config.positionJitter, config.positionJitter);

  return {
    x: Math.cos(jitteredAngle) * jitteredRadius,
    z: Math.sin(jitteredAngle) * jitteredRadius,
  };
}

/**
 * Check if a position is too close to existing positions
 */
function isTooClose(
  x: number,
  z: number,
  existing: Array<{ x: number; z: number }>,
  minDistance: number
): boolean {
  for (const pos of existing) {
    const dx = x - pos.x;
    const dz = z - pos.z;
    if (dx * dx + dz * dz < minDistance * minDistance) {
      return true;
    }
  }
  return false;
}

/**
 * Generate camp layout for a project
 */
export function generateCampLayout(
  projectId: number,
  completedTasks: number,
  config: CampConfig = DEFAULT_CAMP_CONFIG
): SettlementLayout {
  const rng = new SeededRandom(projectId * 31337 + 12345);
  const counts = getAssetCounts(completedTasks);
  const slots: PlacementSlot[] = [];

  // Track placed positions for spacing checks
  const placedPositions: Array<{ x: number; z: number; type: CampAssetType }> = [];

  // ===========================================
  // 1. CAMPFIRE - Always at center
  // ===========================================
  const campfireRotation = rng.range(0, Math.PI * 2);
  slots.push({
    type: CampAssetType.Campfire,
    localX: 0,
    localZ: 0,
    rotation: campfireRotation,
    scale: 1 + rng.range(-config.scaleVariation, config.scaleVariation),
    required: true,
  });
  placedPositions.push({ x: 0, z: 0, type: CampAssetType.Campfire });

  // ===========================================
  // 2. TENTS - Arranged in arc facing campfire
  // ===========================================
  const tentStartAngle = rng.range(0, Math.PI * 2);
  const tentArcSpan = Math.PI * 0.8; // Tents span ~140 degrees

  for (let i = 0; i < counts.tents; i++) {
    const angleOffset = counts.tents > 1
      ? (i / (counts.tents - 1) - 0.5) * tentArcSpan
      : 0;
    const angle = tentStartAngle + angleOffset;
    const radius = rng.range(config.tentMinRadius, config.tentMaxRadius);

    const pos = generateCircularPosition(rng, angle, radius, config);

    // Tent opening faces +X in model space
    // To face campfire at (0,0), we need rotation.y to point +X toward (-pos.x, -pos.z)
    // In Babylon.js left-handed system: rotation.y rotates +X toward -Z (clockwise from above)
    // Formula: atan2(pos.z, -pos.x) points tent opening toward center
    const faceAngle = Math.atan2(pos.z, -pos.x) + rng.range(-0.15, 0.15);

    slots.push({
      type: CampAssetType.Tent,
      localX: pos.x,
      localZ: pos.z,
      rotation: faceAngle,
      scale: 1 + rng.range(-config.scaleVariation * 0.5, config.scaleVariation * 0.5),
      required: i < 2, // First 2 tents are required
      minTasks: i < 2 ? 0 : (i - 1) * 5, // Additional tents unlock progressively
    });
    placedPositions.push({ x: pos.x, z: pos.z, type: CampAssetType.Tent });
  }

  // ===========================================
  // 3. CRATES - Near tents, clustered
  // ===========================================
  for (let i = 0; i < counts.crates; i++) {
    let attempts = 0;
    let placed = false;

    while (!placed && attempts < 20) {
      const angle = rng.range(0, Math.PI * 2);
      const radius = rng.range(config.crateMinRadius, config.crateMaxRadius);
      const pos = generateCircularPosition(rng, angle, radius, config);

      // Check spacing from other crates
      const cratePositions = placedPositions.filter(p => p.type === CampAssetType.Crate);
      if (!isTooClose(pos.x, pos.z, cratePositions, config.crateSpacing)) {
        slots.push({
          type: CampAssetType.Crate,
          localX: pos.x,
          localZ: pos.z,
          rotation: rng.range(0, Math.PI * 2),
          scale: 1 + rng.range(-config.scaleVariation, config.scaleVariation),
          required: i < 3, // First 3 crates are required
          minTasks: i < 3 ? 0 : (i - 2) * 3, // Additional crates unlock progressively
        });
        placedPositions.push({ x: pos.x, z: pos.z, type: CampAssetType.Crate });
        placed = true;
      }
      attempts++;
    }
  }

  // ===========================================
  // 4. TORCH STANDS - At camp perimeter
  // ===========================================
  const torchStartAngle = tentStartAngle + Math.PI; // Opposite side from tents

  for (let i = 0; i < counts.torches; i++) {
    const angleOffset = counts.torches > 1
      ? (i / (counts.torches - 1) - 0.5) * Math.PI
      : 0;
    const angle = torchStartAngle + angleOffset;

    const pos = generateCircularPosition(rng, angle, config.torchRadius, config);

    slots.push({
      type: CampAssetType.TorchStand,
      localX: pos.x,
      localZ: pos.z,
      rotation: rng.range(0, Math.PI * 2),
      scale: 1 + rng.range(-config.scaleVariation * 0.3, config.scaleVariation * 0.3),
      required: i < 2, // First 2 torches are required
      minTasks: i < 2 ? 0 : (i - 1) * 4, // Additional torches unlock progressively
    });
    placedPositions.push({ x: pos.x, z: pos.z, type: CampAssetType.TorchStand });
  }

  // ===========================================
  // 5. ROCKS - Scattered decoration
  // ===========================================
  const rockTypes = [
    { type: CampAssetType.RockSmall, count: counts.rocksSmall },
    { type: CampAssetType.RockLarge, count: counts.rocksLarge },
  ];

  let totalRocksPlaced = 0;
  for (const { type, count } of rockTypes) {
    for (let i = 0; i < count; i++) {
      let attempts = 0;
      let placed = false;

      while (!placed && attempts < 15) {
        const angle = rng.range(0, Math.PI * 2);
        const radius = rng.range(config.rockMinRadius, config.rockMaxRadius);
        const pos = generateCircularPosition(rng, angle, radius, config);

        // Check spacing from other rocks
        const rockPositions = placedPositions.filter(
          p => p.type === CampAssetType.RockSmall || p.type === CampAssetType.RockLarge
        );
        if (!isTooClose(pos.x, pos.z, rockPositions, config.rockSpacing)) {
          slots.push({
            type,
            localX: pos.x,
            localZ: pos.z,
            rotation: rng.range(0, Math.PI * 2),
            scale: 1 + rng.range(-config.scaleVariation, config.scaleVariation),
            required: totalRocksPlaced < 2, // First 2 rocks are required
            minTasks: totalRocksPlaced < 2 ? 0 : (totalRocksPlaced - 1) * 3,
          });
          placedPositions.push({ x: pos.x, z: pos.z, type });
          placed = true;
          totalRocksPlaced++;
        }
        attempts++;
      }
    }
  }

  return {
    level: SettlementLevel.Camp,
    slots,
    radius: config.campRadius,
  };
}

// ============================================
// LAYOUT PREVIEW (for ghost mode)
// ============================================

export interface LayoutPreview {
  positions: Array<{
    type: CampAssetType;
    x: number;
    z: number;
    rotation: number;
    scale: number;
  }>;
  radius: number;
}

/**
 * Generate a simplified layout preview for ghost mode
 * Uses a generic seed for consistent preview appearance
 */
export function generatePreviewLayout(completedTasks: number = 0): LayoutPreview {
  const layout = generateCampLayout(0, completedTasks);

  return {
    positions: layout.slots
      .filter(slot => slot.required || (slot.minTasks ?? 0) <= completedTasks)
      .map(slot => ({
        type: slot.type,
        x: slot.localX,
        z: slot.localZ,
        rotation: slot.rotation,
        scale: slot.scale,
      })),
    radius: layout.radius,
  };
}
