/**
 * Settlement System
 *
 * A modular system for rendering project markers as evolving settlements.
 * Settlements progress from camps → villages → towns → cities based on
 * project task completion.
 *
 * Architecture:
 * - types.ts: Type definitions and constants
 * - assetLoader.ts: GLB asset loading and caching
 * - campGenerator.ts: Procedural camp layout generation
 * - settlementManager.ts: Main orchestrator
 *
 * Usage:
 * ```typescript
 * import { createSettlementManager } from './settlements';
 *
 * const manager = await createSettlementManager(scene, terrainSampler, shadowGen);
 * manager.updateSettlements(projects);
 * manager.setSelected(projectId);
 * ```
 */

// Types and constants
export {
  SettlementLevel,
  CampAssetType,
  SETTLEMENT_THRESHOLDS,
  CAMP_ASSETS,
  getSettlementLevel,
  getProgressWithinLevel,
  type Settlement,
  type PlacementSlot,
  type SettlementLayout,
  type TerrainSampler,
  type AssetDefinition,
} from './types';

// Asset loading
export {
  assetCache,
  initializeAssets,
  createAssetInstance,
} from './assetLoader';

// Camp generation
export {
  generateCampLayout,
  generatePreviewLayout,
  type LayoutPreview,
} from './campGenerator';

// Settlement manager
export {
  SettlementManager,
  createSettlementManager,
} from './settlementManager';
