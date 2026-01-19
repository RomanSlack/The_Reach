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

      // Find root meshes (meshes without parents or with __root__ as parent)
      // and parent them to our template root while preserving internal hierarchy
      const meshes: AbstractMesh[] = [];
      result.meshes.forEach(mesh => {
        // Only reparent root-level meshes to preserve hierarchy
        if (!mesh.parent || mesh.parent.name === '__root__') {
          mesh.parent = templateRoot;
        }
        mesh.setEnabled(false);
        meshes.push(mesh);
      });

      // Apply base scale to template root
      templateRoot.scaling = new Vector3(
        definition.baseScale,
        definition.baseScale,
        definition.baseScale
      );

      const meshCount = meshes.filter(m => m instanceof Mesh).length;
      console.log(`[AssetLoader] Loaded ${definition.type}: ${meshes.length} total, ${meshCount} Mesh instances`);

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

    // Build a map of template mesh -> cloned mesh for hierarchy reconstruction
    const cloneMap = new Map<AbstractMesh, AbstractMesh>();
    const clonedMeshes: AbstractMesh[] = [];

    // First pass: clone all meshes
    cached.meshes.forEach((templateMesh, index) => {
      if (templateMesh instanceof Mesh) {
        const clone = templateMesh.clone(`${name}_mesh_${index}`, null);
        if (clone) {
          clone.setEnabled(true);
          clone.isPickable = cached.definition.isPickable;
          cloneMap.set(templateMesh, clone);
          clonedMeshes.push(clone);
        }
      }
    });

    // Second pass: reconstruct hierarchy
    cached.meshes.forEach(templateMesh => {
      const clone = cloneMap.get(templateMesh);
      if (!clone) return;

      const templateParent = templateMesh.parent;
      if (templateParent instanceof Mesh && cloneMap.has(templateParent)) {
        // Parent was also cloned - use the cloned parent
        clone.parent = cloneMap.get(templateParent)!;
      } else {
        // No cloned parent - attach to instance root
        clone.parent = instanceRoot;
      }
    });

    if (clonedMeshes.length === 0) {
      console.warn(`[AssetLoader] No meshes cloned for ${type} - template had ${cached.meshes.length} meshes`);
    }

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
