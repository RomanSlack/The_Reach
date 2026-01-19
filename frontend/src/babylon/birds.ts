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
// BIRD SYSTEM
// ===========================================
// Ambient birds that fly around, land on trees, and float on the lake

type BirdState = 'flying' | 'floating' | 'perched';

interface TreePosition {
  x: number;
  z: number;
  scale: number;
  rotY: number;
}

interface Bird {
  root: TransformNode;
  meshes: AbstractMesh[]; // All meshes for this bird
  state: BirdState;
  position: Vector3;
  startPosition: Vector3;
  targetPosition: Vector3;
  flightProgress: number;
  flightDuration: number;
  stateTimer: number;
  stateDuration: number;
  currentTreeIndex: number; // -1 if not on a tree
  bankAngle: number; // For tilting during flight
  floatPhase: number; // For bobbing on water
}

export interface BirdSystem {
  update: (deltaTime: number) => void;
  dispose: () => void;
}

// Flight height range
const MIN_FLIGHT_HEIGHT = 8;
const MAX_FLIGHT_HEIGHT = 25;
const BIRD_COUNT = 6;

// Timing ranges (seconds)
const PERCH_TIME_MIN = 16;
const PERCH_TIME_MAX = 40;
const FLOAT_TIME_MIN = 20;
const FLOAT_TIME_MAX = 50;
const FLIGHT_SPEED = 12; // Units per second

export async function createBirdSystem(
  scene: Scene,
  treePositions: TreePosition[],
  pinePositions: TreePosition[],
  lakeConfig: LakeConfig
): Promise<BirdSystem> {
  const waterLevel = getWaterLevel(lakeConfig);
  const allTrees = [...treePositions, ...pinePositions];
  const birds: Bird[] = [];
  let templateMeshes: AbstractMesh[] = [];
  let templateRoot: TransformNode | null = null;

  // ===========================================
  // LOAD BIRD MODEL
  // ===========================================
  try {
    const result = await SceneLoader.ImportMeshAsync(
      '',
      '/models/animals/',
      'bird_1.glb',
      scene
    );

    // Create a template container and store all meshes
    templateRoot = new TransformNode('bird_template', scene);
    templateRoot.setEnabled(false);

    // Parent all meshes to template root and hide them
    result.meshes.forEach(mesh => {
      if (mesh.name === '__root__') {
        mesh.parent = templateRoot;
      }
      mesh.setEnabled(false);
      if (mesh.name !== '__root__') {
        templateMeshes.push(mesh);
      }
    });

    console.log(`[Birds] Loaded bird model (${templateMeshes.length} meshes)`);
  } catch (error) {
    console.error('[Birds] Failed to load bird model:', error);
    return {
      update: () => {},
      dispose: () => {},
    };
  }

  if (templateMeshes.length === 0) {
    console.error('[Birds] No valid meshes found in bird model');
    return {
      update: () => {},
      dispose: () => {},
    };
  }

  // ===========================================
  // HELPER FUNCTIONS
  // ===========================================

  function getRandomTree(): { position: Vector3; index: number } | null {
    if (allTrees.length === 0) return null;
    const index = Math.floor(Math.random() * allTrees.length);
    const tree = allTrees[index];
    // Position slightly above tree (tree height varies with scale)
    const treeHeight = 3 + tree.scale * 2;
    return {
      position: new Vector3(tree.x, treeHeight, tree.z),
      index,
    };
  }

  function getRandomLakePosition(): Vector3 {
    // Random point within lake radius (not too close to edge)
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (lakeConfig.radius * 0.7);
    return new Vector3(
      lakeConfig.centerX + Math.cos(angle) * dist,
      waterLevel + 0.1, // Slightly above water
      lakeConfig.centerZ + Math.sin(angle) * dist
    );
  }

  function getRandomSkyPosition(): Vector3 {
    // Random position in the sky for flying through
    const angle = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 80;
    const height = MIN_FLIGHT_HEIGHT + Math.random() * (MAX_FLIGHT_HEIGHT - MIN_FLIGHT_HEIGHT);
    return new Vector3(
      Math.cos(angle) * dist,
      height,
      Math.sin(angle) * dist
    );
  }

  function pickNewTarget(bird: Bird): { target: Vector3; state: BirdState; treeIndex: number } {
    const rand = Math.random();

    // 40% chance to go to a tree
    if (rand < 0.4 && allTrees.length > 0) {
      const tree = getRandomTree();
      if (tree) {
        return { target: tree.position, state: 'perched', treeIndex: tree.index };
      }
    }

    // 35% chance to go to the lake
    if (rand < 0.75) {
      return { target: getRandomLakePosition(), state: 'floating', treeIndex: -1 };
    }

    // 25% chance to just fly around (pick another sky position)
    return { target: getRandomSkyPosition(), state: 'flying', treeIndex: -1 };
  }

  function startFlight(bird: Bird, target: Vector3, nextState: BirdState, treeIndex: number) {
    bird.startPosition = bird.position.clone();
    bird.targetPosition = target;
    bird.state = 'flying';
    bird.flightProgress = 0;

    // Calculate flight duration based on distance
    const distance = Vector3.Distance(bird.position, target);
    bird.flightDuration = distance / FLIGHT_SPEED;

    // Store what state we'll be in when we arrive
    (bird as any).nextState = nextState;
    (bird as any).nextTreeIndex = treeIndex;

    // Make visible when flying
    bird.meshes.forEach(m => m.setEnabled(true));
  }

  // ===========================================
  // CREATE BIRDS
  // ===========================================
  const BIRD_SCALE = 1.0; // Scale multiplier for birds

  for (let i = 0; i < BIRD_COUNT; i++) {
    const root = new TransformNode(`bird_${i}`, scene);
    root.scaling.setAll(BIRD_SCALE); // Apply 2x scale

    // Clone all meshes from template, preserving hierarchy
    const clonedMeshes: AbstractMesh[] = [];
    const cloneMap = new Map<AbstractMesh, AbstractMesh>();

    // First pass: clone all meshes
    templateMeshes.forEach((templateMesh, idx) => {
      if (templateMesh instanceof Mesh) {
        const clone = templateMesh.clone(`bird_${i}_mesh_${idx}`, null);
        if (clone) {
          clone.setEnabled(true);
          clone.isPickable = false;
          cloneMap.set(templateMesh, clone);
          clonedMeshes.push(clone);
        }
      }
    });

    // Second pass: reconstruct hierarchy
    templateMeshes.forEach(templateMesh => {
      const clone = cloneMap.get(templateMesh);
      if (!clone) return;

      const templateParent = templateMesh.parent;
      if (templateParent instanceof Mesh && cloneMap.has(templateParent)) {
        // Parent was also cloned - use the cloned parent
        clone.parent = cloneMap.get(templateParent)!;
      } else {
        // No cloned parent - attach to bird root
        clone.parent = root;
      }
    });

    // Start at a random position
    const startPos = getRandomSkyPosition();
    root.position = startPos;

    const bird: Bird = {
      root,
      meshes: clonedMeshes,
      state: 'flying',
      position: startPos.clone(),
      startPosition: startPos.clone(),
      targetPosition: getRandomSkyPosition(),
      flightProgress: 0,
      flightDuration: 3 + Math.random() * 2,
      stateTimer: 0,
      stateDuration: 0,
      currentTreeIndex: -1,
      bankAngle: 0,
      floatPhase: Math.random() * Math.PI * 2,
    };

    // Pick initial target
    const { target, state, treeIndex } = pickNewTarget(bird);
    startFlight(bird, target, state, treeIndex);

    birds.push(bird);
  }

  console.log(`[Birds] Created ${BIRD_COUNT} birds`);

  // ===========================================
  // UPDATE LOOP
  // ===========================================
  function update(deltaTime: number) {
    for (const bird of birds) {
      switch (bird.state) {
        case 'flying':
          updateFlying(bird, deltaTime);
          break;
        case 'floating':
          updateFloating(bird, deltaTime);
          break;
        case 'perched':
          updatePerched(bird, deltaTime);
          break;
      }

      // Update root position
      bird.root.position = bird.position;
    }
  }

  function updateFlying(bird: Bird, deltaTime: number) {
    bird.flightProgress += deltaTime / bird.flightDuration;

    if (bird.flightProgress >= 1) {
      // Arrived at destination
      bird.position = bird.targetPosition.clone();
      bird.flightProgress = 1;

      const nextState = (bird as any).nextState as BirdState;
      const nextTreeIndex = (bird as any).nextTreeIndex as number;

      if (nextState === 'perched') {
        // Land on tree - become invisible
        bird.state = 'perched';
        bird.currentTreeIndex = nextTreeIndex;
        bird.stateTimer = 0;
        bird.stateDuration = PERCH_TIME_MIN + Math.random() * (PERCH_TIME_MAX - PERCH_TIME_MIN);
        bird.meshes.forEach(m => m.setEnabled(false));
      } else if (nextState === 'floating') {
        // Land on water
        bird.state = 'floating';
        bird.stateTimer = 0;
        bird.stateDuration = FLOAT_TIME_MIN + Math.random() * (FLOAT_TIME_MAX - FLOAT_TIME_MIN);
        bird.floatPhase = Math.random() * Math.PI * 2;
        // Level out rotation for floating
        bird.root.rotation.set(0, bird.root.rotation.y, 0);
      } else {
        // Continue flying - pick new target
        const { target, state, treeIndex } = pickNewTarget(bird);
        startFlight(bird, target, state, treeIndex);
      }
    } else {
      // Smooth flight path with slight arc
      const t = bird.flightProgress;
      // Ease in-out for smoother motion
      const smoothT = t * t * (3 - 2 * t);

      // Lerp position
      bird.position = Vector3.Lerp(bird.startPosition, bird.targetPosition, smoothT);

      // Add slight arc (higher in middle of flight)
      const arcHeight = Math.sin(t * Math.PI) * 3;
      bird.position.y += arcHeight;

      // Calculate direction for rotation
      const direction = bird.targetPosition.subtract(bird.startPosition).normalize();
      const targetYaw = Math.atan2(direction.x, direction.z);
      bird.root.rotation.y = targetYaw;

      // Bank into turns (simplified - based on horizontal movement)
      const horizontalDir = new Vector3(direction.x, 0, direction.z).normalize();
      const right = Vector3.Cross(Vector3.Up(), horizontalDir);
      const turnAmount = Math.sin(t * Math.PI * 2) * 0.3; // Gentle banking
      bird.root.rotation.z = turnAmount;

      // Slight pitch based on vertical movement
      bird.root.rotation.x = -direction.y * 0.3;
    }
  }

  function updateFloating(bird: Bird, deltaTime: number) {
    bird.stateTimer += deltaTime;
    bird.floatPhase += deltaTime * 1.5;

    // Gentle bobbing
    bird.position.y = waterLevel + 0.1 + Math.sin(bird.floatPhase) * 0.03;

    // Very slow drift
    bird.position.x += Math.sin(bird.floatPhase * 0.3) * deltaTime * 0.1;
    bird.position.z += Math.cos(bird.floatPhase * 0.2) * deltaTime * 0.1;

    // Gentle rotation
    bird.root.rotation.y += Math.sin(bird.floatPhase * 0.5) * deltaTime * 0.1;

    // Time to fly away?
    if (bird.stateTimer >= bird.stateDuration) {
      const { target, state, treeIndex } = pickNewTarget(bird);
      startFlight(bird, target, state, treeIndex);
    }
  }

  function updatePerched(bird: Bird, deltaTime: number) {
    bird.stateTimer += deltaTime;

    // Time to fly away?
    if (bird.stateTimer >= bird.stateDuration) {
      // Make visible again before flying
      bird.meshes.forEach(m => m.setEnabled(true));
      const { target, state, treeIndex } = pickNewTarget(bird);
      startFlight(bird, target, state, treeIndex);
    }
  }

  // ===========================================
  // DISPOSE
  // ===========================================
  function dispose() {
    for (const bird of birds) {
      bird.meshes.forEach(m => m.dispose());
      bird.root.dispose();
    }
    templateMeshes.forEach(m => m.dispose());
    if (templateRoot) {
      templateRoot.dispose();
    }
    birds.length = 0;
  }

  return {
    update,
    dispose,
  };
}
