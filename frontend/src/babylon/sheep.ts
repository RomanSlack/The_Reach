import {
  Scene,
  Vector3,
  SceneLoader,
  AbstractMesh,
  TransformNode,
  Mesh,
  ShadowGenerator,
  ParticleSystem,
  Color4,
  DynamicTexture,
  Texture,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { LakeConfig } from './terrain';

// ===========================================
// SHEEP HERD SYSTEM
// ===========================================
// Groups of sheep that roam open fields, graze, and avoid
// water, forests, and settlements

type SheepState = 'walking' | 'grazing' | 'idle' | 'drinking';

interface Sheep {
  root: TransformNode;
  standingMeshes: AbstractMesh[];
  eatingMeshes: AbstractMesh[];
  grazeParticles: ParticleSystem; // Grass particles when eating
  state: SheepState;
  stateTimer: number;
  stateDuration: number;
  offsetFromHerd: Vector3; // Local offset from herd center
  targetOffset: Vector3; // Target offset (for wandering within herd)
  walkSpeed: number;
}

interface Herd {
  sheep: Sheep[];
  centerPosition: Vector3;
  targetPosition: Vector3;
  wanderTimer: number;
  wanderInterval: number;
  moveSpeed: number;
  isAtLake: boolean; // True when herd is at the lake drinking
  drinkTimer: number; // How long the herd has been drinking
}

export interface SheepSystem {
  update: (deltaTime: number) => void;
  updateCampPositions: (positions: { x: number; z: number }[]) => void;
  dispose: () => void;
}

// Configuration
const HERD_COUNT = 10; // was 3
const SHEEP_PER_HERD_MIN = 7; //  3 was original
const SHEEP_PER_HERD_MAX = 30; //6 is the original
const HERD_SPREAD = 4; // How spread out sheep are within a herd
const HERD_MOVE_SPEED = 0.8; // Units per second for herd movement
const SHEEP_WALK_SPEED = 1.2; // Individual sheep speed
const WANDER_INTERVAL_MIN = 15;
const WANDER_INTERVAL_MAX = 30;
const GRAZE_TIME_MIN = 8;
const GRAZE_TIME_MAX = 20;
const IDLE_TIME_MIN = 3;
const IDLE_TIME_MAX = 8;
const WALK_TIME_MIN = 5;
const WALK_TIME_MAX = 12;
const DRINK_TIME_MIN = 10;
const DRINK_TIME_MAX = 20;

// Lake drinking behavior
const LAKE_DRINK_CHANCE = 0.2; // 20% chance to go to lake when picking new target
const LAKE_SHORE_DISTANCE = 8; // How close to lake edge sheep go to drink
const HERD_DRINK_DURATION_MIN = 15;
const HERD_DRINK_DURATION_MAX = 30;

// Avoidance distances
const LAKE_AVOID_DISTANCE = 15;
const CAMP_AVOID_DISTANCE = 20;
const FOREST_DENSITY_THRESHOLD = 0.3; // Avoid areas with density above this

// Terrain bounds
const TERRAIN_MIN = -180;
const TERRAIN_MAX = 180;

// Model settings
const SHEEP_SCALE = 7.0;
const MODEL_ROTATION_OFFSET = 0; // Model faces correct direction

export interface TerrainSampler {
  getHeight: (x: number, z: number) => number;
  getForestDensity: (x: number, z: number) => number;
}

export async function createSheepSystem(
  scene: Scene,
  lakeConfig: LakeConfig,
  terrainSampler: TerrainSampler,
  shadowGenerator?: ShadowGenerator
): Promise<SheepSystem> {
  const herds: Herd[] = [];
  let campPositions: { x: number; z: number }[] = [];

  // Template meshes
  const standingTemplateMeshes: AbstractMesh[] = [];
  const eatingTemplateMeshes: AbstractMesh[] = [];
  let standingTemplateRoot: TransformNode | null = null;
  let eatingTemplateRoot: TransformNode | null = null;

  // ===========================================
  // LOAD SHEEP MODELS
  // ===========================================
  try {
    // Load standing sheep
    const standingResult = await SceneLoader.ImportMeshAsync(
      '',
      '/models/animals/',
      'sheep_1_standing.glb',
      scene
    );

    standingTemplateRoot = new TransformNode('sheep_standing_template', scene);
    standingTemplateRoot.setEnabled(false);

    standingResult.meshes.forEach(mesh => {
      if (mesh.name === '__root__') {
        mesh.parent = standingTemplateRoot;
      }
      mesh.setEnabled(false);
      if (mesh.name !== '__root__') {
        standingTemplateMeshes.push(mesh);
      }
    });

    // Load eating sheep
    const eatingResult = await SceneLoader.ImportMeshAsync(
      '',
      '/models/animals/',
      'sheep_1_eating.glb',
      scene
    );

    eatingTemplateRoot = new TransformNode('sheep_eating_template', scene);
    eatingTemplateRoot.setEnabled(false);

    eatingResult.meshes.forEach(mesh => {
      if (mesh.name === '__root__') {
        mesh.parent = eatingTemplateRoot;
      }
      mesh.setEnabled(false);
      if (mesh.name !== '__root__') {
        eatingTemplateMeshes.push(mesh);
      }
    });

    console.log(`[Sheep] Loaded models: standing(${standingTemplateMeshes.length}), eating(${eatingTemplateMeshes.length})`);
  } catch (error) {
    console.error('[Sheep] Failed to load sheep models:', error);
    return {
      update: () => {},
      updateCampPositions: () => {},
      dispose: () => {},
    };
  }

  if (standingTemplateMeshes.length === 0 || eatingTemplateMeshes.length === 0) {
    console.error('[Sheep] No valid meshes found in sheep models');
    return {
      update: () => {},
      updateCampPositions: () => {},
      dispose: () => {},
    };
  }

  // ===========================================
  // GRASS PARTICLE TEXTURE
  // ===========================================
  const grassTexture = new DynamicTexture('grassParticleTex', 32, scene, false);
  const grassCtx = grassTexture.getContext() as CanvasRenderingContext2D;

  // Simple soft grass particle - vertical blade shape
  const gradient = grassCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(100, 180, 80, 1)');
  gradient.addColorStop(0.5, 'rgba(80, 150, 60, 0.8)');
  gradient.addColorStop(1, 'rgba(60, 120, 40, 0)');
  grassCtx.fillStyle = gradient;
  grassCtx.fillRect(0, 0, 32, 32);
  grassTexture.update();

  function createGrazeParticles(parent: TransformNode): ParticleSystem {
    const particles = new ParticleSystem('grazeParticles', 40, scene); // 2x more particles
    particles.particleTexture = grassTexture;

    // Emitter at ground level in front of sheep
    const emitter = new TransformNode('grazeEmitter', scene);
    emitter.parent = parent;
    emitter.position = new Vector3(0, 0, 0.3); // At ground, in front
    particles.emitter = emitter;

    // Tight emission area - right from the ground
    particles.minEmitBox = new Vector3(-0.05, 0, -0.05);
    particles.maxEmitBox = new Vector3(0.05, 0, 0.05);

    // Green grass colors
    particles.color1 = new Color4(0.4, 0.7, 0.3, 1);
    particles.color2 = new Color4(0.3, 0.6, 0.2, 1);
    particles.colorDead = new Color4(0.5, 0.7, 0.3, 0);

    // Small particles
    particles.minSize = 0.05;
    particles.maxSize = 0.12;

    // Short lifetime - quick puffs
    particles.minLifeTime = 0.4;
    particles.maxLifeTime = 0.8;

    // Higher emission rate for density
    particles.emitRate = 16; // 2x more

    // Float mostly upward, less spread
    particles.direction1 = new Vector3(-0.1, 0.8, -0.1);
    particles.direction2 = new Vector3(0.1, 1, 0.1);

    // Gentle speed
    particles.minEmitPower = 0.1;
    particles.maxEmitPower = 0.25;
    particles.updateSpeed = 0.01;

    // Slight gravity to make them float then fall
    particles.gravity = new Vector3(0, -0.2, 0);

    // Standard blending (not additive)
    particles.blendMode = ParticleSystem.BLENDMODE_STANDARD;

    // Start stopped - will be started when grazing
    particles.stop();

    return particles;
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

    // First pass: clone all meshes
    templates.forEach((template, idx) => {
      // Check if it's a Mesh that can be cloned
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

    // Second pass: reconstruct hierarchy
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

  function distanceToLake(x: number, z: number): number {
    const dx = x - lakeConfig.centerX;
    const dz = z - lakeConfig.centerZ;
    return Math.sqrt(dx * dx + dz * dz) - lakeConfig.radius;
  }

  function getLakeShorePosition(): Vector3 {
    // Pick a random point on the lake shore for drinking
    const angle = Math.random() * Math.PI * 2;
    const dist = lakeConfig.radius + LAKE_SHORE_DISTANCE;
    const x = lakeConfig.centerX + Math.cos(angle) * dist;
    const z = lakeConfig.centerZ + Math.sin(angle) * dist;
    const y = terrainSampler.getHeight(x, z);
    return new Vector3(x, y, z);
  }

  function isValidLakeApproach(x: number, z: number): boolean {
    // Check if position is valid for approaching lake (not in forest or camp)
    if (x < TERRAIN_MIN || x > TERRAIN_MAX || z < TERRAIN_MIN || z > TERRAIN_MAX) {
      return false;
    }
    if (distanceToCamps(x, z) < CAMP_AVOID_DISTANCE) {
      return false;
    }
    if (terrainSampler.getForestDensity(x, z) > FOREST_DENSITY_THRESHOLD) {
      return false;
    }
    return true;
  }

  function distanceToCamps(x: number, z: number): number {
    if (campPositions.length === 0) return Infinity;
    let minDist = Infinity;
    for (const camp of campPositions) {
      const dx = x - camp.x;
      const dz = z - camp.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }

  function isValidPosition(x: number, z: number): boolean {
    // Check bounds
    if (x < TERRAIN_MIN || x > TERRAIN_MAX || z < TERRAIN_MIN || z > TERRAIN_MAX) {
      return false;
    }
    // Check lake
    if (distanceToLake(x, z) < LAKE_AVOID_DISTANCE) {
      return false;
    }
    // Check camps
    if (distanceToCamps(x, z) < CAMP_AVOID_DISTANCE) {
      return false;
    }
    // Check forest density
    if (terrainSampler.getForestDensity(x, z) > FOREST_DENSITY_THRESHOLD) {
      return false;
    }
    return true;
  }

  function findValidSpawnPosition(): Vector3 | null {
    // Try to find a valid position in open fields
    for (let attempt = 0; attempt < 50; attempt++) {
      const x = TERRAIN_MIN + Math.random() * (TERRAIN_MAX - TERRAIN_MIN);
      const z = TERRAIN_MIN + Math.random() * (TERRAIN_MAX - TERRAIN_MIN);

      if (isValidPosition(x, z)) {
        const y = terrainSampler.getHeight(x, z);
        return new Vector3(x, y, z);
      }
    }
    return null;
  }

  function findValidWanderTarget(currentPos: Vector3): Vector3 {
    // Try to find a valid position within wander range
    const maxWanderDist = 40;

    for (let attempt = 0; attempt < 30; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 15 + Math.random() * maxWanderDist;
      const x = currentPos.x + Math.cos(angle) * dist;
      const z = currentPos.z + Math.sin(angle) * dist;

      if (isValidPosition(x, z)) {
        const y = terrainSampler.getHeight(x, z);
        return new Vector3(x, y, z);
      }
    }

    // If no valid position found, stay put
    return currentPos.clone();
  }

  function setSheepState(sheep: Sheep, state: SheepState) {
    sheep.state = state;
    sheep.stateTimer = 0;

    // Show/hide appropriate meshes (drinking and grazing use eating pose)
    const showStanding = state !== 'grazing' && state !== 'drinking';
    sheep.standingMeshes.forEach(m => m.setEnabled(showStanding));
    sheep.eatingMeshes.forEach(m => m.setEnabled(!showStanding));

    // Start/stop grass particles (only when grazing on land, not drinking)
    if (state === 'grazing') {
      sheep.grazeParticles.start();
    } else {
      sheep.grazeParticles.stop();
    }

    // Set duration based on state
    switch (state) {
      case 'grazing':
        sheep.stateDuration = GRAZE_TIME_MIN + Math.random() * (GRAZE_TIME_MAX - GRAZE_TIME_MIN);
        break;
      case 'idle':
        sheep.stateDuration = IDLE_TIME_MIN + Math.random() * (IDLE_TIME_MAX - IDLE_TIME_MIN);
        break;
      case 'walking':
        sheep.stateDuration = WALK_TIME_MIN + Math.random() * (WALK_TIME_MAX - WALK_TIME_MIN);
        // Pick new target offset within herd
        sheep.targetOffset = new Vector3(
          (Math.random() - 0.5) * HERD_SPREAD * 2,
          0,
          (Math.random() - 0.5) * HERD_SPREAD * 2
        );
        break;
      case 'drinking':
        sheep.stateDuration = DRINK_TIME_MIN + Math.random() * (DRINK_TIME_MAX - DRINK_TIME_MIN);
        break;
    }
  }

  function pickNextSheepState(herd: Herd): SheepState {
    // If herd is at the lake, sheep should drink
    if (herd.isAtLake) {
      const rand = Math.random();
      if (rand < 0.7) return 'drinking'; // 70% drinking
      if (rand < 0.9) return 'idle'; // 20% idle (looking around)
      return 'walking'; // 10% repositioning
    }

    // Normal field behavior
    const rand = Math.random();
    if (rand < 0.5) return 'grazing';
    if (rand < 0.8) return 'idle';
    return 'walking';
  }

  // ===========================================
  // CREATE HERDS
  // ===========================================
  for (let h = 0; h < HERD_COUNT; h++) {
    const spawnPos = findValidSpawnPosition();
    if (!spawnPos) {
      console.warn(`[Sheep] Could not find valid spawn for herd ${h}`);
      continue;
    }

    const sheepCount = SHEEP_PER_HERD_MIN + Math.floor(Math.random() * (SHEEP_PER_HERD_MAX - SHEEP_PER_HERD_MIN + 1));
    const herdSheep: Sheep[] = [];

    for (let s = 0; s < sheepCount; s++) {
      const root = new TransformNode(`sheep_${h}_${s}`, scene);
      root.scaling.setAll(SHEEP_SCALE); // Apply scale

      // Clone both mesh sets
      const standingMeshes = cloneMeshes(standingTemplateMeshes, root, `sheep_${h}_${s}_stand`);
      const eatingMeshes = cloneMeshes(eatingTemplateMeshes, root, `sheep_${h}_${s}_eat`);

      console.log(`[Sheep] Created sheep ${h}_${s}: standing=${standingMeshes.length}, eating=${eatingMeshes.length}`);

      // Add meshes to shadow generator
      if (shadowGenerator) {
        standingMeshes.forEach(m => {
          shadowGenerator.addShadowCaster(m);
          m.receiveShadows = true;
        });
        eatingMeshes.forEach(m => {
          shadowGenerator.addShadowCaster(m);
          m.receiveShadows = true;
        });
      }

      // Start with eating hidden
      eatingMeshes.forEach(m => m.setEnabled(false));

      // Create grass particles for grazing
      const grazeParticles = createGrazeParticles(root);

      // Random offset within herd
      const offsetX = (Math.random() - 0.5) * HERD_SPREAD * 2;
      const offsetZ = (Math.random() - 0.5) * HERD_SPREAD * 2;
      const offset = new Vector3(offsetX, 0, offsetZ);

      // Position sheep
      const sheepX = spawnPos.x + offsetX;
      const sheepZ = spawnPos.z + offsetZ;
      const sheepY = terrainSampler.getHeight(sheepX, sheepZ);
      root.position = new Vector3(sheepX, sheepY, sheepZ);

      // Random rotation (with model offset for correct facing)
      root.rotation.y = Math.random() * Math.PI * 2 + MODEL_ROTATION_OFFSET;

      const sheep: Sheep = {
        root,
        standingMeshes,
        eatingMeshes,
        grazeParticles,
        state: 'idle',
        stateTimer: 0,
        stateDuration: IDLE_TIME_MIN + Math.random() * (IDLE_TIME_MAX - IDLE_TIME_MIN),
        offsetFromHerd: offset,
        targetOffset: offset.clone(),
        walkSpeed: SHEEP_WALK_SPEED * (0.8 + Math.random() * 0.4), // Slight variation
      };

      // Randomize initial state (field behavior - not at lake yet)
      const rand = Math.random();
      const initialState: SheepState = rand < 0.5 ? 'grazing' : rand < 0.8 ? 'idle' : 'walking';
      setSheepState(sheep, initialState);

      herdSheep.push(sheep);
    }

    const herd: Herd = {
      sheep: herdSheep,
      centerPosition: spawnPos.clone(),
      targetPosition: spawnPos.clone(),
      wanderTimer: 0,
      wanderInterval: WANDER_INTERVAL_MIN + Math.random() * (WANDER_INTERVAL_MAX - WANDER_INTERVAL_MIN),
      moveSpeed: HERD_MOVE_SPEED * (0.8 + Math.random() * 0.4),
      isAtLake: false,
      drinkTimer: 0,
    };

    herds.push(herd);
    console.log(`[Sheep] Created herd ${h} with ${sheepCount} sheep at (${spawnPos.x.toFixed(1)}, ${spawnPos.z.toFixed(1)})`);
  }

  console.log(`[Sheep] Created ${herds.length} herds`);

  // ===========================================
  // UPDATE LOOP
  // ===========================================
  function update(deltaTime: number) {
    for (const herd of herds) {
      updateHerd(herd, deltaTime);
    }
  }

  function updateHerd(herd: Herd, deltaTime: number) {
    // Handle lake drinking state
    if (herd.isAtLake) {
      herd.drinkTimer += deltaTime;
      const drinkDuration = HERD_DRINK_DURATION_MIN + Math.random() * (HERD_DRINK_DURATION_MAX - HERD_DRINK_DURATION_MIN);

      // Check if done drinking
      if (herd.drinkTimer >= drinkDuration) {
        herd.isAtLake = false;
        herd.drinkTimer = 0;
        // Pick a field position to return to
        herd.targetPosition = findValidWanderTarget(herd.centerPosition);
        herd.wanderTimer = 0;
        console.log(`[Sheep] Herd leaving lake, returning to fields`);
      }
    } else {
      // Update herd wander timer
      herd.wanderTimer += deltaTime;

      if (herd.wanderTimer >= herd.wanderInterval) {
        // Chance to go to lake for drinking
        if (Math.random() < LAKE_DRINK_CHANCE) {
          const lakePos = getLakeShorePosition();
          // Make sure the lake approach is valid (not blocked by camp/forest)
          if (isValidLakeApproach(lakePos.x, lakePos.z)) {
            herd.targetPosition = lakePos;
            console.log(`[Sheep] Herd heading to lake for drinking`);
          } else {
            herd.targetPosition = findValidWanderTarget(herd.centerPosition);
          }
        } else {
          herd.targetPosition = findValidWanderTarget(herd.centerPosition);
        }
        herd.wanderTimer = 0;
        herd.wanderInterval = WANDER_INTERVAL_MIN + Math.random() * (WANDER_INTERVAL_MAX - WANDER_INTERVAL_MIN);
      }
    }

    // Move herd center toward target
    const toTarget = herd.targetPosition.subtract(herd.centerPosition);
    const distToTarget = toTarget.length();

    if (distToTarget > 1 && !herd.isAtLake) {
      const moveDir = toTarget.normalize();
      const moveDist = Math.min(herd.moveSpeed * deltaTime, distToTarget);
      herd.centerPosition.addInPlace(moveDir.scale(moveDist));
      herd.centerPosition.y = terrainSampler.getHeight(herd.centerPosition.x, herd.centerPosition.z);

      // Check if arrived at lake
      if (distanceToLake(herd.centerPosition.x, herd.centerPosition.z) < LAKE_SHORE_DISTANCE + 2) {
        herd.isAtLake = true;
        herd.drinkTimer = 0;
        console.log(`[Sheep] Herd arrived at lake, starting to drink`);
      }
    }

    // Update each sheep
    for (const sheep of herd.sheep) {
      updateSheep(sheep, herd, deltaTime);
    }
  }

  function updateSheep(sheep: Sheep, herd: Herd, deltaTime: number) {
    sheep.stateTimer += deltaTime;

    // Check state transition
    if (sheep.stateTimer >= sheep.stateDuration) {
      const nextState = pickNextSheepState(herd);
      setSheepState(sheep, nextState);
    }

    // Calculate target position (herd center + offset)
    const targetPos = herd.centerPosition.add(sheep.targetOffset);

    // Get current position
    const currentPos = sheep.root.position;

    // Move toward target position (following the herd)
    const toTarget = new Vector3(
      targetPos.x - currentPos.x,
      0,
      targetPos.z - currentPos.z
    );
    const distToTarget = toTarget.length();

    // Grazing and drinking sheep stay stationary unless too far from herd
    const isTooFarFromHerd = distToTarget > HERD_SPREAD * 3;
    const shouldMove = (sheep.state === 'walking' || sheep.state === 'idle') && !herd.isAtLake || isTooFarFromHerd;

    if (distToTarget > 0.5 && shouldMove) {
      // Determine speed based on state
      let speed = sheep.state === 'walking' ? sheep.walkSpeed : sheep.walkSpeed * 0.3;

      // If too far from herd, speed up to catch up
      if (isTooFarFromHerd) {
        speed = sheep.walkSpeed * 2;
      }

      const moveDir = toTarget.normalize();
      const moveDist = Math.min(speed * deltaTime, distToTarget);

      // Move sheep
      const newX = currentPos.x + moveDir.x * moveDist;
      const newZ = currentPos.z + moveDir.z * moveDist;
      const newY = terrainSampler.getHeight(newX, newZ);

      sheep.root.position.set(newX, newY, newZ);

      // Face movement direction (only when actually moving)
      if (moveDist > 0.01) {
        const targetYaw = Math.atan2(moveDir.x, moveDir.z) + MODEL_ROTATION_OFFSET;
        // Smooth rotation
        const currentYaw = sheep.root.rotation.y;
        let yawDiff = targetYaw - currentYaw;

        // Normalize angle difference
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

        sheep.root.rotation.y += yawDiff * Math.min(1, deltaTime * 3);
      }
    }

    // Update offset gradually (sheep wander within herd)
    if (sheep.state === 'walking') {
      const offsetDiff = sheep.targetOffset.subtract(sheep.offsetFromHerd);
      if (offsetDiff.length() > 0.1) {
        sheep.offsetFromHerd.addInPlace(offsetDiff.scale(deltaTime * 0.5));
      }
    }
  }

  // ===========================================
  // PUBLIC METHODS
  // ===========================================
  function updateCampPositions(positions: { x: number; z: number }[]) {
    campPositions = positions;
  }

  function dispose() {
    for (const herd of herds) {
      for (const sheep of herd.sheep) {
        sheep.grazeParticles.stop();
        sheep.grazeParticles.dispose();
        sheep.standingMeshes.forEach(m => m.dispose());
        sheep.eatingMeshes.forEach(m => m.dispose());
        sheep.root.dispose();
      }
    }
    standingTemplateMeshes.forEach(m => m.dispose());
    eatingTemplateMeshes.forEach(m => m.dispose());
    standingTemplateRoot?.dispose();
    eatingTemplateRoot?.dispose();
    grassTexture.dispose();
    herds.length = 0;
  }

  return {
    update,
    updateCampPositions,
    dispose,
  };
}
