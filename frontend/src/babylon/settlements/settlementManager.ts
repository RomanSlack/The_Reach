/**
 * Settlement Manager
 *
 * Main orchestrator for creating, updating, and managing project settlements.
 * Handles terrain conformance, selection highlighting, and lifecycle management.
 */

import {
  Scene,
  TransformNode,
  Vector3,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  DynamicTexture,
  Color3,
  AbstractMesh,
  ShadowGenerator,
  HighlightLayer,
  GlowLayer,
} from '@babylonjs/core';
import type { Project } from '../../api/client';
import {
  type Settlement,
  type PlacedAsset,
  type TerrainSampler,
  CampAssetType,
  getSettlementLevel,
  SettlementLevel,
} from './types';
import { assetCache, initializeAssets, createAssetInstance } from './assetLoader';
import { generateCampLayout, generatePreviewLayout } from './campGenerator';

// ============================================
// SETTLEMENT MANAGER CLASS
// ============================================

export class SettlementManager {
  private scene: Scene;
  private terrainSampler: TerrainSampler;
  private shadowGenerator: ShadowGenerator | null;
  private highlightLayer: HighlightLayer | null;
  private glowLayer: GlowLayer | null;

  private settlements: Map<number, Settlement> = new Map();
  private selectedId: number | null = null;
  private initialized: boolean = false;

  constructor(
    scene: Scene,
    terrainSampler: TerrainSampler,
    shadowGenerator?: ShadowGenerator,
    highlightLayer?: HighlightLayer,
    glowLayer?: GlowLayer
  ) {
    this.scene = scene;
    this.terrainSampler = terrainSampler;
    this.shadowGenerator = shadowGenerator ?? null;
    this.highlightLayer = highlightLayer ?? null;
    this.glowLayer = glowLayer ?? null;
  }

  /**
   * Initialize the settlement system (preload assets)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await initializeAssets(this.scene);
    this.initialized = true;
    console.log('[SettlementManager] Initialized');
  }

  /**
   * Check if system is ready
   */
  isReady(): boolean {
    return this.initialized && assetCache.allLoaded();
  }

  // ==========================================
  // SETTLEMENT CREATION
  // ==========================================

  /**
   * Create a settlement for a project
   */
  createSettlement(project: Project): Settlement {
    // Clean up existing settlement if present
    if (this.settlements.has(project.id)) {
      this.removeSettlement(project.id);
    }

    const level = getSettlementLevel(project.done_count);
    const layout = generateCampLayout(project.id, project.done_count);

    // Create root transform node
    const rootNode = new TransformNode(`settlement_${project.id}`, this.scene);
    rootNode.position = new Vector3(project.position_x, 0, project.position_z);

    // Metadata for picking
    (rootNode as any).metadata = {
      type: 'settlement',
      projectId: project.id,
    };

    const placedAssets: PlacedAsset[] = [];

    // Place each asset from the layout
    for (const slot of layout.slots) {
      // Skip assets that haven't been unlocked yet
      if (slot.minTasks !== undefined && project.done_count < slot.minTasks) {
        continue;
      }

      // Calculate world position for terrain sampling
      const worldX = project.position_x + slot.localX;
      const worldZ = project.position_z + slot.localZ;
      const terrainY = this.terrainSampler.getHeight(worldX, worldZ);

      // Create asset instance
      const instance = createAssetInstance(
        slot.type,
        `${project.id}_${slot.type}_${placedAssets.length}`,
        new Vector3(slot.localX, terrainY, slot.localZ),
        slot.rotation,
        slot.scale,
        rootNode
      );

      if (instance) {
        // Add shadow casting/receiving
        instance.meshes.forEach(mesh => {
          if (this.shadowGenerator) {
            this.shadowGenerator.addShadowCaster(mesh as Mesh);
          }
          mesh.receiveShadows = true;

          // Add metadata for picking
          mesh.metadata = {
            type: 'settlement',
            projectId: project.id,
            assetType: slot.type,
          };
          mesh.isPickable = true;
        });

        // Add glow to torches
        if (slot.type === CampAssetType.TorchStand && this.glowLayer) {
          instance.meshes.forEach(mesh => {
            this.glowLayer!.addIncludedOnlyMesh(mesh as Mesh);
          });
        }

        placedAssets.push({
          type: slot.type,
          meshes: instance.meshes,
          localX: slot.localX,
          localZ: slot.localZ,
        });
      }
    }

    // Create floating label
    const labelMesh = this.createLabel(project.name, project.position_x, project.position_z);
    if (labelMesh) {
      labelMesh.parent = rootNode;
    }

    const settlement: Settlement = {
      id: project.id,
      level,
      rootNode,
      placedAssets,
      labelMesh,
      centerX: project.position_x,
      centerZ: project.position_z,
    };

    this.settlements.set(project.id, settlement);
    return settlement;
  }

  /**
   * Create a floating label mesh
   */
  private createLabel(text: string, x: number, z: number): Mesh | null {
    const texture = new DynamicTexture('labelTex', { width: 512, height: 128 }, this.scene);
    const ctx = texture.getContext() as CanvasRenderingContext2D;

    ctx.clearRect(0, 0, 512, 128);

    ctx.font = 'bold 72px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 256, 64);

    texture.update();
    texture.hasAlpha = true;

    const terrainY = this.terrainSampler.getHeight(x, z);

    const plane = MeshBuilder.CreatePlane('label', { width: 10, height: 2.5 }, this.scene);
    const mat = new StandardMaterial('labelMat', this.scene);
    mat.diffuseTexture = texture;
    mat.emissiveTexture = texture;
    mat.opacityTexture = texture;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    plane.material = mat;
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL;

    // Position above the settlement
    plane.position = new Vector3(0, terrainY + 10, 0);

    return plane;
  }

  // ==========================================
  // SETTLEMENT UPDATES
  // ==========================================

  /**
   * Update all settlements from project list
   */
  updateSettlements(projects: Project[]): void {
    const currentIds = new Set(projects.map(p => p.id));

    // Remove settlements for deleted projects
    this.settlements.forEach((_, id) => {
      if (!currentIds.has(id)) {
        this.removeSettlement(id);
      }
    });

    // Create or update settlements
    projects.forEach(project => {
      const existing = this.settlements.get(project.id);

      if (!existing) {
        // Create new settlement
        this.createSettlement(project);
      } else {
        // Check if we need to rebuild (level changed or significant task change)
        const newLevel = getSettlementLevel(project.done_count);
        const positionChanged =
          existing.centerX !== project.position_x ||
          existing.centerZ !== project.position_z;

        if (existing.level !== newLevel || positionChanged) {
          // Rebuild settlement
          this.createSettlement(project);
        } else {
          // Just update position if needed (for minor adjustments)
          this.updateSettlementPosition(project.id, project.position_x, project.position_z);
        }
      }
    });
  }

  /**
   * Update settlement position (for move mode)
   */
  updateSettlementPosition(projectId: number, x: number, z: number): void {
    const settlement = this.settlements.get(projectId);
    if (!settlement) return;

    settlement.centerX = x;
    settlement.centerZ = z;
    settlement.rootNode.position.x = x;
    settlement.rootNode.position.z = z;

    // Update terrain conformance for all assets
    settlement.placedAssets.forEach(asset => {
      const worldX = x + asset.localX;
      const worldZ = z + asset.localZ;
      const terrainY = this.terrainSampler.getHeight(worldX, worldZ);

      asset.meshes.forEach(mesh => {
        if (mesh.parent === settlement.rootNode) {
          mesh.position.y = terrainY;
        }
      });
    });

    // Update label position
    if (settlement.labelMesh) {
      const terrainY = this.terrainSampler.getHeight(x, z);
      settlement.labelMesh.position.y = terrainY + 10;
    }
  }

  /**
   * Remove a settlement
   */
  removeSettlement(projectId: number): void {
    const settlement = this.settlements.get(projectId);
    if (!settlement) return;

    // Remove from highlight layer
    if (this.highlightLayer) {
      settlement.placedAssets.forEach(asset => {
        asset.meshes.forEach(mesh => {
          this.highlightLayer!.removeMesh(mesh as Mesh);
        });
      });
    }

    // Dispose all meshes
    settlement.placedAssets.forEach(asset => {
      asset.meshes.forEach(mesh => mesh.dispose());
    });

    settlement.labelMesh?.dispose();
    settlement.rootNode.dispose();

    this.settlements.delete(projectId);

    if (this.selectedId === projectId) {
      this.selectedId = null;
    }
  }

  // ==========================================
  // SELECTION
  // ==========================================

  /**
   * Set selected settlement
   */
  setSelected(projectId: number | null): void {
    // Deselect previous
    if (this.selectedId !== null && this.highlightLayer) {
      const prev = this.settlements.get(this.selectedId);
      if (prev) {
        prev.placedAssets.forEach(asset => {
          asset.meshes.forEach(mesh => {
            this.highlightLayer!.removeMesh(mesh as Mesh);
          });
        });
      }
    }

    this.selectedId = projectId;

    // Select new
    if (projectId !== null && this.highlightLayer) {
      const current = this.settlements.get(projectId);
      if (current) {
        const highlightColor = Color3.FromHexString('#d4a574');
        current.placedAssets.forEach(asset => {
          asset.meshes.forEach(mesh => {
            this.highlightLayer!.addMesh(mesh as Mesh, highlightColor);
          });
        });
      }
    }
  }

  /**
   * Get selected settlement ID
   */
  getSelectedId(): number | null {
    return this.selectedId;
  }

  /**
   * Get settlement by ID
   */
  getSettlement(projectId: number): Settlement | undefined {
    return this.settlements.get(projectId);
  }

  // ==========================================
  // VISIBILITY
  // ==========================================

  /**
   * Set settlement visibility (for move mode)
   */
  setVisibility(projectId: number, visibility: number): void {
    const settlement = this.settlements.get(projectId);
    if (!settlement) return;

    settlement.placedAssets.forEach(asset => {
      asset.meshes.forEach(mesh => {
        mesh.visibility = visibility;
      });
    });

    if (settlement.labelMesh) {
      settlement.labelMesh.visibility = visibility;
    }
  }

  // ==========================================
  // GHOST PREVIEW
  // ==========================================

  /**
   * Create ghost preview meshes for placement/move mode
   */
  createGhostPreview(completedTasks: number = 0): TransformNode {
    const ghostRoot = new TransformNode('ghost_settlement', this.scene);
    const preview = generatePreviewLayout(completedTasks);

    preview.positions.forEach((pos, index) => {
      const instance = createAssetInstance(
        pos.type,
        `ghost_${pos.type}_${index}`,
        new Vector3(pos.x, 0, pos.z),
        pos.rotation,
        pos.scale,
        ghostRoot
      );

      if (instance) {
        instance.meshes.forEach(mesh => {
          mesh.visibility = 0.5;
          mesh.isPickable = false;

          // Make semi-transparent
          if (mesh.material) {
            const mat = mesh.material.clone(`ghost_mat_${index}`);
            if (mat && 'alpha' in mat) {
              (mat as any).alpha = 0.5;
            }
            mesh.material = mat;
          }
        });
      }
    });

    return ghostRoot;
  }

  /**
   * Update ghost position with terrain conformance
   */
  updateGhostPosition(ghostRoot: TransformNode, x: number, z: number): void {
    ghostRoot.position.x = x;
    ghostRoot.position.z = z;

    // Update each child's Y position based on terrain
    ghostRoot.getChildren().forEach(child => {
      if (child instanceof TransformNode) {
        const worldX = x + child.position.x;
        const worldZ = z + child.position.z;
        // Note: We can't directly set Y here since assets have their own Y offset
        // The terrain Y is handled when we finalize placement
      }
    });

    // Set base Y to terrain height at center
    const terrainY = this.terrainSampler.getHeight(x, z);
    ghostRoot.position.y = terrainY;
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.settlements.forEach((_, id) => {
      this.removeSettlement(id);
    });
    this.settlements.clear();
    assetCache.dispose();
    this.initialized = false;
  }
}

// ============================================
// FACTORY FUNCTION
// ============================================

export async function createSettlementManager(
  scene: Scene,
  terrainSampler: TerrainSampler,
  shadowGenerator?: ShadowGenerator,
  highlightLayer?: HighlightLayer,
  glowLayer?: GlowLayer
): Promise<SettlementManager> {
  const manager = new SettlementManager(
    scene,
    terrainSampler,
    shadowGenerator,
    highlightLayer,
    glowLayer
  );

  await manager.initialize();
  return manager;
}
