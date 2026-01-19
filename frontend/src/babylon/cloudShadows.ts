/**
 * Cloud Shadow System
 *
 * CURRENTLY DISABLED - needs more work to get smooth scrolling
 * without morphing artifacts.
 *
 * TODO: Implement proper cloud shadows with either:
 * - Tileable Perlin noise (no padding needed)
 * - UV offset animation with seamless texture
 * - Congo line approach with flat (non-terrain-conforming) planes
 */

import { Scene } from '@babylonjs/core';

export function createCloudShadows(
  _scene: Scene,
  _groundSize: number,
  _subdivisions?: number,
  _getTerrainHeight?: (x: number, z: number) => number
): void {
  // Cloud shadows disabled for now
  console.log('Cloud shadows: disabled');
}
