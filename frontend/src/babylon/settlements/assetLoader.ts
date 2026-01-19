/**
 * Asset Loader Module
 *
 * Handles loading, caching, and instantiation of GLB models.
 * Uses a singleton pattern to ensure assets are loaded only once.
 */

import {
  Scene,
  SceneLoader,
  AbstractMesh,
  TransformNode,
  Mesh,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { CampAssetType, CAMP_ASSETS, type AssetDefinition } from './types';

// ============================================
// ASSET CACHE
// ============================================

interface CachedAsset {
  definition: AssetDefinition;
  rootMesh: AbstractMesh;
  meshes: AbstractMesh[];
  loaded: boolean;
}

class AssetCache {
  private cache: Map<CampAssetType, CachedAsset> = new Map();
  private loadingPromises: Map<CampAssetType, Promise<CachedAsset>> = new Map();
  private scene: Scene | null = null;

  /**
   * Initialize the cache with a scene reference
   */
  initialize(scene: Scene): void {
    this.scene = scene;
  }

  /**
   * Preload all camp assets
   */
  async preloadAll(): Promise<void> {
    if (!this.scene) {
      throw new Error('AssetCache not initialized. Call initialize(scene) first.');
    }

    const loadPromises = Object.values(CampAssetType).map(type =>
      this.loadAsset(type)
    );

    await Promise.all(loadPromises);
    console.log('[AssetLoader] All camp assets preloaded');
  }

  /**
   * Load a single asset type
   */
  async loadAsset(type: CampAssetType): Promise<CachedAsset> {
    if (!this.scene) {
      throw new Error('AssetCache not initialized');
    }

    // Return cached if already loaded
    const cached = this.cache.get(type);
    if (cached?.loaded) {
      return cached;
    }

    // Return existing promise if currently loading
    const existingPromise = this.loadingPromises.get(type);
    if (existingPromise) {
      return existingPromise;
    }

    // Start loading
    const definition = CAMP_ASSETS[type];
    const loadPromise = this.loadGLB(definition);
    this.loadingPromises.set(type, loadPromise);

    try {
      const result = await loadPromise;
      this.cache.set(type, result);
      this.loadingPromises.delete(type);
      return result;
    } catch (error) {
      this.loadingPromises.delete(type);
      console.error(`[AssetLoader] Failed to load ${type}:`, error);
      throw error;
    }
  }

  /**
   * Load a GLB file and cache the template meshes
   */
  private async loadGLB(definition: AssetDefinition): Promise<CachedAsset> {
    const scene = this.scene!;

    try {
      const result = await SceneLoader.ImportMeshAsync(
        '',
        '',
        definition.path,
        scene
      );

      // Create a container node for the template
      const templateRoot = new TransformNode(`template_${definition.type}`, scene);
      templateRoot.setEnabled(false); // Hide template

      // Parent all loaded meshes to the template root
      const meshes: AbstractMesh[] = [];
      result.meshes.forEach(mesh => {
        if (!mesh.parent) {
          mesh.parent = templateRoot;
        }
        mesh.setEnabled(false);
        meshes.push(mesh);
      });

      // Apply base scale
      templateRoot.scaling = new Vector3(
        definition.baseScale,
        definition.baseScale,
        definition.baseScale
      );

      console.log(`[AssetLoader] Loaded ${definition.type} (${meshes.length} meshes)`);

      return {
        definition,
        rootMesh: templateRoot as unknown as AbstractMesh,
        meshes,
        loaded: true,
      };
    } catch (error) {
      console.error(`[AssetLoader] Error loading ${definition.path}:`, error);
      throw error;
    }
  }

  /**
   * Create an instance of a loaded asset
   */
  createInstance(
    type: CampAssetType,
    name: string,
    parent?: TransformNode
  ): { root: TransformNode; meshes: AbstractMesh[] } | null {
    const cached = this.cache.get(type);
    if (!cached?.loaded || !this.scene) {
      console.warn(`[AssetLoader] Asset ${type} not loaded`);
      return null;
    }

    // Create a new transform node for this instance
    const instanceRoot = new TransformNode(name, this.scene);
    if (parent) {
      instanceRoot.parent = parent;
    }

    // Clone all meshes
    const clonedMeshes: AbstractMesh[] = [];
    cached.meshes.forEach((templateMesh, index) => {
      if (templateMesh instanceof Mesh) {
        const clone = templateMesh.clone(`${name}_mesh_${index}`, instanceRoot);
        if (clone) {
          clone.setEnabled(true);
          clone.isPickable = cached.definition.isPickable;
          clonedMeshes.push(clone);
        }
      }
    });

    // Apply base scale to instance root
    instanceRoot.scaling = new Vector3(
      cached.definition.baseScale,
      cached.definition.baseScale,
      cached.definition.baseScale
    );

    return {
      root: instanceRoot,
      meshes: clonedMeshes,
    };
  }

  /**
   * Check if an asset type is loaded
   */
  isLoaded(type: CampAssetType): boolean {
    return this.cache.get(type)?.loaded ?? false;
  }

  /**
   * Check if all assets are loaded
   */
  allLoaded(): boolean {
    return Object.values(CampAssetType).every(type => this.isLoaded(type));
  }

  /**
   * Dispose of all cached assets
   */
  dispose(): void {
    this.cache.forEach(cached => {
      cached.meshes.forEach(mesh => mesh.dispose());
      if (cached.rootMesh instanceof TransformNode) {
        cached.rootMesh.dispose();
      }
    });
    this.cache.clear();
    this.loadingPromises.clear();
    this.scene = null;
  }
}

// Singleton instance
export const assetCache = new AssetCache();

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Initialize and preload all assets
 */
export async function initializeAssets(scene: Scene): Promise<void> {
  assetCache.initialize(scene);
  await assetCache.preloadAll();
}

/**
 * Create an asset instance at a specific position
 */
export function createAssetInstance(
  type: CampAssetType,
  name: string,
  position: Vector3,
  rotation: number = 0,
  scale: number = 1,
  parent?: TransformNode
): { root: TransformNode; meshes: AbstractMesh[] } | null {
  const instance = assetCache.createInstance(type, name, parent);
  if (!instance) return null;

  instance.root.position = position;
  instance.root.rotation = new Vector3(0, rotation, 0);
  instance.root.scaling.scaleInPlace(scale);

  return instance;
}
