/**
 * Settlement System Types
 *
 * Defines the type hierarchy for the settlement progression system.
 * Settlements evolve from camps → villages → towns → cities based on project progress.
 */

import type { TransformNode, Mesh, AbstractMesh } from '@babylonjs/core';

// ============================================
// SETTLEMENT LEVELS
// ============================================

export enum SettlementLevel {
  Camp = 1,      // Level 1: Basic camp (0-10 tasks completed)
  Village = 2,   // Level 2: Small village (11-25 tasks)
  Town = 3,      // Level 3: Town (26-50 tasks)
  City = 4,      // Level 4: City (51+ tasks)
}

export interface SettlementThresholds {
  level: SettlementLevel;
  minTasks: number;
  maxTasks: number;
}

export const SETTLEMENT_THRESHOLDS: SettlementThresholds[] = [
  { level: SettlementLevel.Camp, minTasks: 0, maxTasks: 10 },
  { level: SettlementLevel.Village, minTasks: 11, maxTasks: 25 },
  { level: SettlementLevel.Town, minTasks: 26, maxTasks: 50 },
  { level: SettlementLevel.City, minTasks: 51, maxTasks: Infinity },
];

// ============================================
// ASSET DEFINITIONS
// ============================================

export enum CampAssetType {
  Tent = 'tent',
  Campfire = 'campfire',
  Crate = 'crate',
  TorchStand = 'torch',
  Banner = 'banner',
  RockSmall = 'rock_small',
  RockLarge = 'rock_large',
}

export interface AssetDefinition {
  type: CampAssetType;
  path: string;
  baseScale: number;
  yOffset: number; // Offset from terrain height
  castsShadow: boolean;
  receivesShadow: boolean;
  isPickable: boolean;
}

// Global scale multiplier for all camp assets
export const CAMP_SCALE_MULTIPLIER = 3.0;

export const CAMP_ASSETS: Record<CampAssetType, AssetDefinition> = {
  [CampAssetType.Tent]: {
    type: CampAssetType.Tent,
    path: '/models/camp_1/tent_1.glb',
    baseScale: 3.0,
    yOffset: 0.65, // Raised to compensate for model origin
    castsShadow: true,
    receivesShadow: true,
    isPickable: true,
  },
  [CampAssetType.Campfire]: {
    type: CampAssetType.Campfire,
    path: '/models/camp_1/camp_fire_1_no_fire.glb',
    baseScale: 3.0,
    yOffset: 0,
    castsShadow: true,
    receivesShadow: true,
    isPickable: true,
  },
  [CampAssetType.Crate]: {
    type: CampAssetType.Crate,
    path: '/models/camp_1/crate_1.glb',
    baseScale: 3.0,
    yOffset: -0.05, // Model space offset, scaled by baseScale at runtime
    castsShadow: true,
    receivesShadow: true,
    isPickable: true,
  },
  [CampAssetType.TorchStand]: {
    type: CampAssetType.TorchStand,
    path: '/models/camp_1/tall_torch_1.glb',
    baseScale: 3.0,
    yOffset: 0,
    castsShadow: true,
    receivesShadow: true,
    isPickable: true,
  },
  [CampAssetType.Banner]: {
    type: CampAssetType.Banner,
    path: '/models/camp_1/banner_1.glb',
    baseScale: 3.0,
    yOffset: 0,
    castsShadow: true,
    receivesShadow: true,
    isPickable: true,
  },
  [CampAssetType.RockSmall]: {
    type: CampAssetType.RockSmall,
    path: '/models/camp_1/rock_1.glb',
    baseScale: 3.0,
    yOffset: -0.1, // Model space offset, scaled by baseScale at runtime
    castsShadow: true,
    receivesShadow: true,
    isPickable: false,
  },
  [CampAssetType.RockLarge]: {
    type: CampAssetType.RockLarge,
    path: '/models/camp_1/rock_2.glb',
    baseScale: 3.0,
    yOffset: -0.15, // Model space offset, scaled by baseScale at runtime
    castsShadow: true,
    receivesShadow: true,
    isPickable: false,
  },
};

// ============================================
// PLACEMENT DEFINITIONS
// ============================================

export interface PlacementSlot {
  type: CampAssetType;
  localX: number;        // Offset from settlement center
  localZ: number;        // Offset from settlement center
  rotation: number;      // Y-axis rotation in radians
  scale: number;         // Scale multiplier
  required: boolean;     // Is this slot always filled?
  minTasks?: number;     // Minimum tasks to show this item
}

export interface SettlementLayout {
  level: SettlementLevel;
  slots: PlacementSlot[];
  radius: number;        // Approximate radius for placement validation
}

// ============================================
// SETTLEMENT INSTANCE
// ============================================

export interface PlacedAsset {
  type: CampAssetType;
  meshes: AbstractMesh[];
  localX: number;
  localZ: number;
}

export interface Settlement {
  id: number;                    // Project ID
  level: SettlementLevel;
  rootNode: TransformNode;       // Parent node for all meshes
  placedAssets: PlacedAsset[];   // All placed asset instances
  labelMesh: Mesh | null;        // Floating label
  hitboxMesh: Mesh | null;       // Invisible selection hitbox
  centerX: number;
  centerZ: number;
}

// ============================================
// TERRAIN INTERFACE
// ============================================

export interface TerrainSampler {
  getHeight(x: number, z: number): number;
  getNormal?(x: number, z: number): { x: number; y: number; z: number };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getSettlementLevel(completedTasks: number): SettlementLevel {
  for (const threshold of SETTLEMENT_THRESHOLDS) {
    if (completedTasks >= threshold.minTasks && completedTasks <= threshold.maxTasks) {
      return threshold.level;
    }
  }
  return SettlementLevel.Camp;
}

export function getProgressWithinLevel(completedTasks: number): number {
  const level = getSettlementLevel(completedTasks);
  const threshold = SETTLEMENT_THRESHOLDS.find(t => t.level === level)!;

  if (threshold.maxTasks === Infinity) {
    // For max level, use a logarithmic scale
    return Math.min(1, (completedTasks - threshold.minTasks) / 50);
  }

  const range = threshold.maxTasks - threshold.minTasks;
  return (completedTasks - threshold.minTasks) / range;
}
