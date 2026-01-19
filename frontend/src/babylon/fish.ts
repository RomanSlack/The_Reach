import {
  Scene,
  Vector3,
  SceneLoader,
  AbstractMesh,
  TransformNode,
  Mesh,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { getWaterLevel, type LakeConfig } from './terrain';

// ===========================================
// FISH SYSTEM
// ===========================================
// Fish that swim around in the lake at various depths
// with realistic darting and resting behavior

type FishBehavior = 'swimming' | 'darting' | 'resting';

interface Fish {
  root: TransformNode;
  meshes: AbstractMesh[];
  behavior: FishBehavior;
  position: Vector3;
  targetPosition: Vector3;
  speed: number;
  behaviorTimer: number;
  behaviorDuration: number;
  restTimer: number; // For slight movement while resting
}

export interface FishSystem {
  update: (deltaTime: number) => void;
  attractToPoint: (x: number, z: number, radius: number) => void;
  dispose: () => void;
}

// Configuration
const FISH_COUNT_MIN = 6;
const FISH_COUNT_MAX = 10;
const FISH_SCALE = 7;

// Depth settings (relative to water surface)
const MIN_DEPTH_BELOW_SURFACE = 0.5; // Don't swim too close to surface
const MIN_HEIGHT_ABOVE_BOTTOM = 0.3; // Don't clip through lake bed

// Speed settings
const SWIM_SPEED_MIN = 0.8;
const SWIM_SPEED_MAX = 1.5;
const DART_SPEED_MIN = 4;
const DART_SPEED_MAX = 7;

// Behavior durations (seconds)
const SWIM_DURATION_MIN = 4;
const SWIM_DURATION_MAX = 10;
const DART_DURATION_MIN = 0.5;
const DART_DURATION_MAX = 1.5;
const REST_DURATION_MIN = 2;
const REST_DURATION_MAX = 8;

// Behavior chances when picking new behavior
const DART_CHANCE = 0.15; // 15% chance to dart
const REST_CHANCE = 0.25; // 25% chance to rest

export async function createFishSystem(
  scene: Scene,
  lakeConfig: LakeConfig
): Promise<FishSystem> {
  const waterLevel = getWaterLevel(lakeConfig);
  const fish: Fish[] = [];
  const templateMeshes: AbstractMesh[] = [];
  let templateRoot: TransformNode | null = null;

  // ===========================================
  // LOAD FISH MODEL
  // ===========================================
  try {
    const result = await SceneLoader.ImportMeshAsync(
      '',
      '/models/animals/',
      'fish_1.glb',
      scene
    );

    templateRoot = new TransformNode('fish_template', scene);
    templateRoot.setEnabled(false);

    result.meshes.forEach(mesh => {
      if (mesh.name === '__root__') {
        mesh.parent = templateRoot;
      }
      mesh.setEnabled(false);
      if (mesh.name !== '__root__') {
        templateMeshes.push(mesh);
      }
    });

    console.log(`[Fish] Loaded fish model (${templateMeshes.length} meshes)`);
  } catch (error) {
    console.error('[Fish] Failed to load fish model:', error);
    return {
      update: () => {},
      dispose: () => {},
    };
  }

  if (templateMeshes.length === 0) {
    console.error('[Fish] No valid meshes found in fish model');
    return {
      update: () => {},
      dispose: () => {},
    };
  }

  // ===========================================
  // HELPER FUNCTIONS
  // ===========================================

  function cloneMeshes(
    templates: AbstractMesh[],
    parent: TransformNode,
    prefix: string
  ): AbstractMesh[] {
    const cloned: AbstractMesh[] = [];
    const cloneMap = new Map<AbstractMesh, AbstractMesh>();

    templates.forEach((template, idx) => {
      if ((template as Mesh).clone) {
        const clone = (template as Mesh).clone(`${prefix}_mesh_${idx}`, null);
        if (clone) {
          clone.setEnabled(true);
          clone.isPickable = false;
          cloneMap.set(template, clone);
          cloned.push(clone);
        }
      }
    });

    templates.forEach(template => {
      const clone = cloneMap.get(template);
      if (!clone) return;

      const templateParent = template.parent;
      if (templateParent && cloneMap.has(templateParent as AbstractMesh)) {
        clone.parent = cloneMap.get(templateParent as AbstractMesh)!;
      } else {
        clone.parent = parent;
      }
    });

    return cloned;
  }

  function getLakeDepthAt(x: number, z: number): number {
    // Calculate depth based on distance from center (deeper in middle)
    const dx = x - lakeConfig.centerX;
    const dz = z - lakeConfig.centerZ;
    const distFromCenter = Math.sqrt(dx * dx + dz * dz);
    const normalizedDist = Math.min(1, distFromCenter / lakeConfig.radius);

    // Parabolic depth profile - deeper in center
    const depthFactor = 1 - normalizedDist * normalizedDist;
    return lakeConfig.depth * depthFactor;
  }

  function getSwimDepthRange(x: number, z: number): { min: number; max: number } {
    const lakeDepth = getLakeDepthAt(x, z);
    const surfaceY = waterLevel;
    const bottomY = waterLevel - lakeDepth;

    return {
      min: bottomY + MIN_HEIGHT_ABOVE_BOTTOM,
      max: surfaceY - MIN_DEPTH_BELOW_SURFACE,
    };
  }

  function getRandomPositionInLake(): Vector3 {
    // Random position within lake, avoiding edges
    const angle = Math.random() * Math.PI * 2;
    const maxDist = lakeConfig.radius * 0.8; // Stay away from edges
    const dist = Math.random() * maxDist;

    const x = lakeConfig.centerX + Math.cos(angle) * dist;
    const z = lakeConfig.centerZ + Math.sin(angle) * dist;

    const depthRange = getSwimDepthRange(x, z);
    const y = depthRange.min + Math.random() * (depthRange.max - depthRange.min);

    return new Vector3(x, y, z);
  }

  function getRandomTargetPosition(currentPos: Vector3): Vector3 {
    // Pick a new target within the lake
    const angle = Math.random() * Math.PI * 2;
    const dist = 5 + Math.random() * 20; // 5-25 units away

    let x = currentPos.x + Math.cos(angle) * dist;
    let z = currentPos.z + Math.sin(angle) * dist;

    // Clamp to lake bounds
    const dx = x - lakeConfig.centerX;
    const dz = z - lakeConfig.centerZ;
    const distFromCenter = Math.sqrt(dx * dx + dz * dz);
    const maxDist = lakeConfig.radius * 0.8;

    if (distFromCenter > maxDist) {
      const scale = maxDist / distFromCenter;
      x = lakeConfig.centerX + dx * scale;
      z = lakeConfig.centerZ + dz * scale;
    }

    const depthRange = getSwimDepthRange(x, z);
    const y = depthRange.min + Math.random() * (depthRange.max - depthRange.min);

    return new Vector3(x, y, z);
  }

  function pickNewBehavior(): FishBehavior {
    const rand = Math.random();
    if (rand < DART_CHANCE) return 'darting';
    if (rand < DART_CHANCE + REST_CHANCE) return 'resting';
    return 'swimming';
  }

  function setBehavior(f: Fish, behavior: FishBehavior) {
    f.behavior = behavior;
    f.behaviorTimer = 0;

    switch (behavior) {
      case 'swimming':
        f.speed = SWIM_SPEED_MIN + Math.random() * (SWIM_SPEED_MAX - SWIM_SPEED_MIN);
        f.behaviorDuration = SWIM_DURATION_MIN + Math.random() * (SWIM_DURATION_MAX - SWIM_DURATION_MIN);
        f.targetPosition = getRandomTargetPosition(f.position);
        break;
      case 'darting':
        f.speed = DART_SPEED_MIN + Math.random() * (DART_SPEED_MAX - DART_SPEED_MIN);
        f.behaviorDuration = DART_DURATION_MIN + Math.random() * (DART_DURATION_MAX - DART_DURATION_MIN);
        f.targetPosition = getRandomTargetPosition(f.position);
        break;
      case 'resting':
        f.speed = 0;
        f.behaviorDuration = REST_DURATION_MIN + Math.random() * (REST_DURATION_MAX - REST_DURATION_MIN);
        f.restTimer = 0;
        break;
    }
  }

  // ===========================================
  // CREATE FISH
  // ===========================================
  const fishCount = FISH_COUNT_MIN + Math.floor(Math.random() * (FISH_COUNT_MAX - FISH_COUNT_MIN + 1));

  for (let i = 0; i < fishCount; i++) {
    const root = new TransformNode(`fish_${i}`, scene);
    root.scaling.setAll(FISH_SCALE);

    const meshes = cloneMeshes(templateMeshes, root, `fish_${i}`);
    const startPos = getRandomPositionInLake();
    root.position = startPos;

    // Random initial rotation
    root.rotation.y = Math.random() * Math.PI * 2;

    const f: Fish = {
      root,
      meshes,
      behavior: 'swimming',
      position: startPos.clone(),
      targetPosition: getRandomTargetPosition(startPos),
      speed: SWIM_SPEED_MIN + Math.random() * (SWIM_SPEED_MAX - SWIM_SPEED_MIN),
      behaviorTimer: 0,
      behaviorDuration: SWIM_DURATION_MIN + Math.random() * (SWIM_DURATION_MAX - SWIM_DURATION_MIN),
      restTimer: 0,
    };

    fish.push(f);
  }

  console.log(`[Fish] Created ${fishCount} fish in the lake`);

  // ===========================================
  // UPDATE LOOP
  // ===========================================
  function update(deltaTime: number) {
    for (const f of fish) {
      f.behaviorTimer += deltaTime;

      // Check for behavior change
      if (f.behaviorTimer >= f.behaviorDuration) {
        setBehavior(f, pickNewBehavior());
      }

      // Update based on behavior
      switch (f.behavior) {
        case 'swimming':
        case 'darting':
          updateSwimming(f, deltaTime);
          break;
        case 'resting':
          updateResting(f, deltaTime);
          break;
      }

      // Update root position
      f.root.position = f.position;
    }
  }

  function updateSwimming(f: Fish, deltaTime: number) {
    const toTarget = f.targetPosition.subtract(f.position);
    const dist = toTarget.length();

    if (dist < 0.5) {
      // Reached target, pick new one
      f.targetPosition = getRandomTargetPosition(f.position);
      return;
    }

    // Move toward target
    const moveDir = toTarget.normalize();
    const moveDist = Math.min(f.speed * deltaTime, dist);
    f.position.addInPlace(moveDir.scale(moveDist));

    // Clamp Y to valid depth range
    const depthRange = getSwimDepthRange(f.position.x, f.position.z);
    f.position.y = Math.max(depthRange.min, Math.min(depthRange.max, f.position.y));

    // Face movement direction
    const targetYaw = Math.atan2(moveDir.x, moveDir.z);
    const currentYaw = f.root.rotation.y;
    let yawDiff = targetYaw - currentYaw;

    // Normalize angle
    while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
    while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

    // Faster rotation when darting
    const rotSpeed = f.behavior === 'darting' ? 8 : 3;
    f.root.rotation.y += yawDiff * Math.min(1, deltaTime * rotSpeed);

    // Slight pitch based on vertical movement
    f.root.rotation.x = -moveDir.y * 0.5;
  }

  function updateResting(f: Fish, deltaTime: number) {
    f.restTimer += deltaTime;

    // Subtle hovering motion while resting
    const hoverOffset = Math.sin(f.restTimer * 2) * 0.02;
    const swayOffset = Math.sin(f.restTimer * 1.5) * 0.01;

    f.position.y += hoverOffset * deltaTime;
    f.root.rotation.y += swayOffset * deltaTime;

    // Clamp Y to valid depth
    const depthRange = getSwimDepthRange(f.position.x, f.position.z);
    f.position.y = Math.max(depthRange.min, Math.min(depthRange.max, f.position.y));

    // Very slight fin movement (rotation wobble)
    f.root.rotation.z = Math.sin(f.restTimer * 3) * 0.05;
  }

  // ===========================================
  // ATTRACT FISH TO POINT
  // ===========================================
  function attractToPoint(x: number, z: number, radius: number) {
    for (const f of fish) {
      const dx = f.position.x - x;
      const dz = f.position.z - z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < radius) {
        // Fish is within attract radius - make it dart toward the point
        f.behavior = 'darting';
        f.behaviorTimer = 0;
        f.behaviorDuration = 1.5 + Math.random() * 1; // Dart for 1.5-2.5 seconds
        f.speed = DART_SPEED_MIN + Math.random() * (DART_SPEED_MAX - DART_SPEED_MIN);

        // Target position near the click point but at fish's current depth
        const depthRange = getSwimDepthRange(x, z);
        const targetY = Math.max(depthRange.min, Math.min(depthRange.max, f.position.y));
        f.targetPosition = new Vector3(x, targetY, z);
      }
    }
  }

  // ===========================================
  // DISPOSE
  // ===========================================
  function dispose() {
    for (const f of fish) {
      f.meshes.forEach(m => m.dispose());
      f.root.dispose();
    }
    templateMeshes.forEach(m => m.dispose());
    templateRoot?.dispose();
    fish.length = 0;
  }

  return {
    update,
    attractToPoint,
    dispose,
  };
}
