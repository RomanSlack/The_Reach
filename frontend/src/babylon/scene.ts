import {
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  PBRMaterial,
  Color3,
  Color4,
  Engine,
  PointerEventTypes,
  PointerInfo,
  Animation,
  Mesh,
  GlowLayer,
  HighlightLayer,
  DefaultRenderingPipeline,
  ShadowGenerator,
  DynamicTexture,
  TransformNode,
  Texture,
} from '@babylonjs/core';
import { GrassProceduralTexture } from '@babylonjs/procedural-textures';
import '@babylonjs/loaders/glTF';
import type { Project } from '../api/client';
import { generateRiverPath, generateTerrainHeight, distanceToRiver } from './terrain';

export interface ReachScene {
  scene: Scene;
  updateProjects: (projects: Project[]) => void;
  focusProject: (project: Project) => void;
  resetCamera: () => void;
  startPlacementMode: (projectName: string, color: string, onPlace: (x: number, z: number) => void, onCancel?: () => void) => void;
  cancelPlacementMode: () => void;
  startMoveMode: (projectId: number, color: string, onMove: (x: number, z: number) => void, onCancel?: () => void) => void;
  cancelMoveMode: () => void;
  dispose: () => void;
}

export function createReachScene(
  engine: Engine,
  onProjectClick: (projectId: number) => void,
  onProjectMove?: (projectId: number, x: number, z: number) => void
): ReachScene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.85, 0.9, 0.92, 1);
  scene.ambientColor = new Color3(0.4, 0.4, 0.4);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.002;
  scene.fogColor = new Color3(0.85, 0.9, 0.88);

  // ===========================================
  // STRATEGIC CAMERA
  // ===========================================
  const camera = new ArcRotateCamera(
    'camera',
    -Math.PI / 2,
    Math.PI / 4,
    50,
    Vector3.Zero(),
    scene
  );
  camera.lowerRadiusLimit = 15;
  camera.upperRadiusLimit = 150;
  camera.lowerBetaLimit = 0.2;
  camera.upperBetaLimit = Math.PI / 3;
  camera.wheelPrecision = 10;
  camera.wheelDeltaPercentage = 0.05;
  camera.panningSensibility = 100;
  camera.panningInertia = 0.7;
  camera.inertia = 0.7;
  camera.attachControl(engine.getRenderingCanvas(), true);

  // WASD Panning - using window events for reliable keyboard capture
  const panSpeed = 1.0;
  const keysPressed: { [key: string]: boolean } = {};

  const handleKeyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    keysPressed[key] = true;

    if (key === 'escape') {
      if (placementMode.active) {
        cancelPlacementMode(true);
      }
      if (moveMode.active) {
        cancelMoveMode(true);
      }
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    keysPressed[key] = false;
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  scene.onBeforeRenderObservable.add(() => {
    if (placementMode.active || moveMode.active) return;

    // Calculate forward direction based on camera position relative to target
    const camPos = camera.position;
    const targetPos = camera.target;

    // Direction from camera to target (this is "forward" - into the screen)
    const forward = new Vector3(
      targetPos.x - camPos.x,
      0,
      targetPos.z - camPos.z
    ).normalize();

    // Right is perpendicular to forward (cross with up)
    const right = Vector3.Cross(Vector3.Up(), forward).normalize();

    let movement = Vector3.Zero();
    if (keysPressed['w']) movement.addInPlace(forward.scale(panSpeed));
    if (keysPressed['s']) movement.addInPlace(forward.scale(-panSpeed));
    if (keysPressed['a']) movement.addInPlace(right.scale(-panSpeed));
    if (keysPressed['d']) movement.addInPlace(right.scale(panSpeed));

    if (movement.length() > 0) {
      camera.target.addInPlace(movement);
    }
  });

  // ===========================================
  // LIGHTING
  // ===========================================
  const ambientLight = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambientLight.intensity = 0.5;
  ambientLight.groundColor = new Color3(0.4, 0.5, 0.4);
  ambientLight.diffuse = new Color3(1, 0.98, 0.95);

  const sunLight = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.3).normalize(), scene);
  sunLight.intensity = 0.9;
  sunLight.diffuse = new Color3(1, 0.97, 0.9);
  sunLight.position = new Vector3(50, 100, 50);

  const shadowGenerator = new ShadowGenerator(2048, sunLight);
  shadowGenerator.useBlurExponentialShadowMap = true;
  shadowGenerator.blurScale = 2;
  shadowGenerator.setDarkness(0.3);

  // ===========================================
  // POST-PROCESSING
  // ===========================================
  const pipeline = new DefaultRenderingPipeline('pipeline', true, scene, [camera]);
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.85;
  pipeline.bloomWeight = 0.2;
  pipeline.bloomKernel = 64;
  pipeline.fxaaEnabled = true;
  pipeline.samples = 4;
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.contrast = 1.05;
  pipeline.imageProcessing.exposure = 1.0;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 0.3;

  // ===========================================
  // GLOW & HIGHLIGHT
  // ===========================================
  const glowLayer = new GlowLayer('glow', scene, { mainTextureFixedSize: 512, blurKernelSize: 32 });
  glowLayer.intensity = 0.15;

  const highlightLayer = new HighlightLayer('highlight', scene);

  // ===========================================
  // RIVER PATH (generated first for terrain carving)
  // ===========================================
  const riverConfig = {
    startX: -200,
    startZ: 0,
    endX: 200,
    endZ: 0,
    width: 12,
    depth: 3,
    meander: 40,
    frequency: 1.5,
  };
  const riverPath = generateRiverPath(riverConfig, 150);

  // ===========================================
  // GRASSY TERRAIN WITH RIVER CARVING
  // ===========================================
  const groundSize = 400;
  const subdivisions = 300; // High resolution for detailed terrain
  const ground = MeshBuilder.CreateGround('ground', {
    width: groundSize,
    height: groundSize,
    subdivisions: subdivisions,
    updatable: true,
  }, scene);

  // Helper to get terrain height at any point
  function getTerrainHeight(x: number, z: number): number {
    return generateTerrainHeight(x, z, riverPath, riverConfig.width, riverConfig.depth);
  }

  // Apply terrain height with river carving
  const positions = ground.getVerticesData('position');
  if (positions) {
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      positions[i + 1] = getTerrainHeight(x, z);
    }
    ground.updateVerticesData('position', positions);
    ground.createNormals(true);
  }

  // Grass material
  const grassMat = new PBRMaterial('grassMat', scene);
  grassMat.albedoColor = new Color3(0.45, 0.55, 0.35);
  grassMat.metallic = 0;
  grassMat.roughness = 0.95;

  // Grass texture - higher detail
  const grassTexture = new GrassProceduralTexture('grassTex', 1024, scene);
  grassTexture.grassColors = [
    new Color3(0.4, 0.55, 0.3),
    new Color3(0.45, 0.6, 0.35),
    new Color3(0.5, 0.65, 0.4),
  ];
  (grassTexture as Texture).uScale = 60;
  (grassTexture as Texture).vScale = 60;
  grassMat.albedoTexture = grassTexture;

  ground.material = grassMat;
  ground.receiveShadows = true;

  // ===========================================
  // SKY
  // ===========================================
  const sky = MeshBuilder.CreateSphere('sky', { diameter: 1000, sideOrientation: Mesh.BACKSIDE }, scene);
  const skyMat = new StandardMaterial('skyMat', scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;

  const skyTexture = new DynamicTexture('skyTex', { width: 1, height: 256 }, scene);
  const ctx = skyTexture.getContext();
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#e8ebe5');
  gradient.addColorStop(0.4, '#c5d4dc');
  gradient.addColorStop(0.7, '#9bb8c9');
  gradient.addColorStop(1, '#7aa3b8');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, 256);
  skyTexture.update();

  skyMat.emissiveTexture = skyTexture;
  skyMat.emissiveColor = Color3.White();
  sky.material = skyMat;
  sky.infiniteDistance = true;
  sky.rotation.x = Math.PI;

  // ===========================================
  // ENVIRONMENT: TREES, ROCKS, RIVER
  // ===========================================
  const environmentParent = new TransformNode('environment', scene);

  // Create simple tree (conforms to terrain height)
  function createTree(x: number, z: number, scale: number = 1) {
    const terrainY = getTerrainHeight(x, z);

    const trunk = MeshBuilder.CreateCylinder('trunk', { height: 3 * scale, diameter: 0.5 * scale }, scene);
    trunk.position = new Vector3(x, terrainY + 1.5 * scale, z);
    const trunkMat = new StandardMaterial('trunkMat', scene);
    trunkMat.diffuseColor = new Color3(0.4, 0.3, 0.2);
    trunk.material = trunkMat;
    shadowGenerator.addShadowCaster(trunk);
    trunk.receiveShadows = true;
    trunk.parent = environmentParent;

    const foliage = MeshBuilder.CreateSphere('foliage', { diameter: 4 * scale, segments: 8 }, scene);
    foliage.position = new Vector3(x, terrainY + 4.5 * scale, z);
    foliage.scaling = new Vector3(1, 1.3, 1);
    const foliageMat = new StandardMaterial('foliageMat', scene);
    foliageMat.diffuseColor = new Color3(0.3 + Math.random() * 0.15, 0.5 + Math.random() * 0.15, 0.25);
    foliage.material = foliageMat;
    shadowGenerator.addShadowCaster(foliage);
    foliage.receiveShadows = true;
    foliage.parent = environmentParent;

    return { trunk, foliage };
  }

  // Create rock (conforms to terrain height)
  function createRock(x: number, z: number, scale: number = 1) {
    const terrainY = getTerrainHeight(x, z);

    const rock = MeshBuilder.CreatePolyhedron('rock', { type: 1, size: scale }, scene);
    rock.position = new Vector3(x, terrainY + scale * 0.3, z);
    rock.rotation = new Vector3(Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5);
    const rockMat = new StandardMaterial('rockMat', scene);
    rockMat.diffuseColor = new Color3(0.5 + Math.random() * 0.1, 0.5 + Math.random() * 0.1, 0.48);
    rock.material = rockMat;
    shadowGenerator.addShadowCaster(rock);
    rock.receiveShadows = true;
    rock.parent = environmentParent;
    return rock;
  }

  // Scatter trees (avoid river)
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 40 + Math.random() * 150;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    // Skip if too close to river
    const distToRiv = distanceToRiver(x, z, riverPath);
    if (distToRiv < riverConfig.width * 2.5) continue;

    createTree(x, z, 0.8 + Math.random() * 0.6);
  }

  // Scatter rocks (can be near river banks)
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 30 + Math.random() * 160;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    // Skip if in river
    const distToRiv = distanceToRiver(x, z, riverPath);
    if (distToRiv < riverConfig.width) continue;

    createRock(x, z, 0.5 + Math.random() * 1);
  }

  // River water surface - simple flat plane at water level
  const riverWaterLevel = -riverConfig.depth * 0.3; // Water level slightly above riverbed

  const river = MeshBuilder.CreateRibbon('river', {
    pathArray: [
      riverPath.map(p => new Vector3(p.x, riverWaterLevel, p.z - riverConfig.width * 0.7)),
      riverPath.map(p => new Vector3(p.x, riverWaterLevel, p.z + riverConfig.width * 0.7)),
    ],
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);

  const riverMat = new PBRMaterial('riverMat', scene);
  riverMat.albedoColor = new Color3(0.2, 0.4, 0.5);
  riverMat.metallic = 0.1;
  riverMat.roughness = 0.2;
  riverMat.alpha = 0.8;
  riverMat.backFaceCulling = false;
  river.material = riverMat;

  // ===========================================
  // PROJECT ISLANDS
  // ===========================================
  const islandMeshes = new Map<number, { base: Mesh; marker: Mesh; label: Mesh | null }>();
  let selectedIslandId: number | null = null;

  function createIsland(project: Project): { base: Mesh; marker: Mesh; label: Mesh | null } {
    const color = Color3.FromHexString(project.color);
    const terrainY = getTerrainHeight(project.position_x, project.position_z);

    const base = MeshBuilder.CreateCylinder(`island-${project.id}`, {
      height: 2,
      diameterTop: 8,
      diameterBottom: 10,
      tessellation: 6,
    }, scene);

    const baseMat = new PBRMaterial(`baseMat-${project.id}`, scene);
    baseMat.albedoColor = color;
    baseMat.metallic = 0.1;
    baseMat.roughness = 0.7;
    baseMat.emissiveColor = color.scale(0.05);
    base.material = baseMat;
    base.position = new Vector3(project.position_x, terrainY + 1, project.position_z);
    base.metadata = { projectId: project.id, type: 'island' };

    shadowGenerator.addShadowCaster(base);
    base.receiveShadows = true;

    const marker = MeshBuilder.CreateCylinder(`marker-${project.id}`, {
      height: 4,
      diameterTop: 0.3,
      diameterBottom: 1.2,
      tessellation: 6,
    }, scene);

    const markerMat = new PBRMaterial(`markerMat-${project.id}`, scene);
    markerMat.albedoColor = color;
    markerMat.metallic = 0.3;
    markerMat.roughness = 0.4;
    markerMat.emissiveColor = color.scale(0.2);
    marker.material = markerMat;
    marker.position = new Vector3(project.position_x, terrainY + 4, project.position_z);
    marker.metadata = { projectId: project.id, type: 'island' };

    shadowGenerator.addShadowCaster(marker);
    glowLayer.addIncludedOnlyMesh(marker);

    const label = createFloatingLabel(project.name);
    if (label) {
      label.position = new Vector3(project.position_x, terrainY + 8, project.position_z);
      label.billboardMode = Mesh.BILLBOARDMODE_ALL;
    }

    return { base, marker, label };
  }

  function createFloatingLabel(text: string): Mesh | null {
    const texture = new DynamicTexture('labelTex', { width: 512, height: 128 }, scene);
    const ctx = texture.getContext() as CanvasRenderingContext2D;

    // Clear with transparency
    ctx.clearRect(0, 0, 512, 128);

    // White text with shadow for readability
    ctx.font = 'bold 72px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Drop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;

    // White text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 256, 64);

    texture.update();
    texture.hasAlpha = true;

    const plane = MeshBuilder.CreatePlane('label', { width: 10, height: 2.5 }, scene);
    const mat = new StandardMaterial('labelMat', scene);
    mat.diffuseTexture = texture;
    mat.emissiveTexture = texture;
    mat.opacityTexture = texture;
    mat.disableLighting = true;
    mat.backFaceCulling = false;
    plane.material = mat;

    return plane;
  }

  function updateIslandPosition(projectId: number, x: number, z: number) {
    const island = islandMeshes.get(projectId);
    if (island) {
      const terrainY = getTerrainHeight(x, z);
      island.base.position.set(x, terrainY + 1, z);
      island.marker.position.set(x, terrainY + 4, z);
      if (island.label) {
        island.label.position.set(x, terrainY + 8, z);
      }
    }
  }

  function updateProjects(projects: Project[]) {
    const currentIds = new Set(projects.map(p => p.id));

    islandMeshes.forEach((meshes, id) => {
      if (!currentIds.has(id)) {
        meshes.base.dispose();
        meshes.marker.dispose();
        meshes.label?.dispose();
        islandMeshes.delete(id);
      }
    });

    projects.forEach(project => {
      if (!islandMeshes.has(project.id)) {
        const meshes = createIsland(project);
        islandMeshes.set(project.id, meshes);
      } else {
        updateIslandPosition(project.id, project.position_x, project.position_z);
      }
    });
  }

  function setSelectedIsland(projectId: number | null) {
    if (selectedIslandId !== null) {
      const prev = islandMeshes.get(selectedIslandId);
      if (prev) {
        highlightLayer.removeMesh(prev.base);
        highlightLayer.removeMesh(prev.marker);
      }
    }

    selectedIslandId = projectId;

    if (projectId !== null) {
      const current = islandMeshes.get(projectId);
      if (current) {
        highlightLayer.addMesh(current.base, Color3.FromHexString('#d4a574'));
        highlightLayer.addMesh(current.marker, Color3.FromHexString('#d4a574'));
      }
    }
  }

  function focusProject(project: Project) {
    setSelectedIsland(project.id);

    Animation.CreateAndStartAnimation(
      'cameraMove', camera, 'target', 60, 40,
      camera.target, new Vector3(project.position_x, 0, project.position_z),
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    Animation.CreateAndStartAnimation(
      'cameraZoom', camera, 'radius', 60, 40,
      camera.radius, 25, Animation.ANIMATIONLOOPMODE_CONSTANT
    );
  }

  function resetCamera() {
    setSelectedIsland(null);

    Animation.CreateAndStartAnimation(
      'cameraReset', camera, 'target', 60, 40,
      camera.target, Vector3.Zero(), Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    Animation.CreateAndStartAnimation(
      'cameraZoomOut', camera, 'radius', 60, 40,
      camera.radius, 50, Animation.ANIMATIONLOOPMODE_CONSTANT
    );
  }

  // ===========================================
  // PLACEMENT MODE
  // ===========================================
  const placementMode = {
    active: false,
    ghostMesh: null as Mesh | null,
    ghostMarker: null as Mesh | null,
    onPlace: null as ((x: number, z: number) => void) | null,
    onCancel: null as (() => void) | null,
    color: '#d4a574',
  };

  function startPlacementMode(_projectName: string, color: string, onPlace: (x: number, z: number) => void, onCancel?: () => void) {
    cancelPlacementMode();

    placementMode.active = true;
    placementMode.onPlace = onPlace;
    placementMode.onCancel = onCancel || null;
    placementMode.color = color;

    const colorObj = Color3.FromHexString(color);

    // Ghost base
    placementMode.ghostMesh = MeshBuilder.CreateCylinder('ghost-base', {
      height: 2,
      diameterTop: 8,
      diameterBottom: 10,
      tessellation: 6,
    }, scene);
    const ghostMat = new StandardMaterial('ghostMat', scene);
    ghostMat.diffuseColor = colorObj;
    ghostMat.alpha = 0.5;
    ghostMat.emissiveColor = colorObj.scale(0.3);
    placementMode.ghostMesh.material = ghostMat;
    placementMode.ghostMesh.position.y = 1;
    placementMode.ghostMesh.isPickable = false;

    // Ghost marker
    placementMode.ghostMarker = MeshBuilder.CreateCylinder('ghost-marker', {
      height: 4,
      diameterTop: 0.3,
      diameterBottom: 1.2,
      tessellation: 6,
    }, scene);
    const ghostMarkerMat = new StandardMaterial('ghostMarkerMat', scene);
    ghostMarkerMat.diffuseColor = colorObj;
    ghostMarkerMat.alpha = 0.5;
    ghostMarkerMat.emissiveColor = colorObj.scale(0.5);
    placementMode.ghostMarker.material = ghostMarkerMat;
    placementMode.ghostMarker.position.y = 4;
    placementMode.ghostMarker.isPickable = false;
  }

  function cancelPlacementMode(notifyCallback = false) {
    if (notifyCallback && placementMode.onCancel) {
      placementMode.onCancel();
    }
    placementMode.active = false;
    placementMode.onPlace = null;
    placementMode.onCancel = null;
    placementMode.ghostMesh?.dispose();
    placementMode.ghostMesh = null;
    placementMode.ghostMarker?.dispose();
    placementMode.ghostMarker = null;
  }

  // ===========================================
  // MOVE MODE (button-triggered)
  // ===========================================
  const moveMode = {
    active: false,
    projectId: null as number | null,
    ghostMesh: null as Mesh | null,
    ghostMarker: null as Mesh | null,
    onMove: null as ((x: number, z: number) => void) | null,
    onCancel: null as (() => void) | null,
    color: '#d4a574',
  };

  function startMoveMode(projectId: number, color: string, onMove: (x: number, z: number) => void, onCancel?: () => void) {
    cancelMoveMode();

    moveMode.active = true;
    moveMode.projectId = projectId;
    moveMode.onMove = onMove;
    moveMode.onCancel = onCancel || null;
    moveMode.color = color;

    const colorObj = Color3.FromHexString(color);

    // Hide the actual island temporarily
    const island = islandMeshes.get(projectId);
    if (island) {
      island.base.visibility = 0.3;
      island.marker.visibility = 0.3;
      if (island.label) island.label.visibility = 0.3;
    }

    // Ghost base
    moveMode.ghostMesh = MeshBuilder.CreateCylinder('move-ghost-base', {
      height: 2,
      diameterTop: 8,
      diameterBottom: 10,
      tessellation: 6,
    }, scene);
    const ghostMat = new StandardMaterial('moveGhostMat', scene);
    ghostMat.diffuseColor = colorObj;
    ghostMat.alpha = 0.7;
    ghostMat.emissiveColor = colorObj.scale(0.3);
    moveMode.ghostMesh.material = ghostMat;
    moveMode.ghostMesh.position.y = 1;
    moveMode.ghostMesh.isPickable = false;

    // Ghost marker
    moveMode.ghostMarker = MeshBuilder.CreateCylinder('move-ghost-marker', {
      height: 4,
      diameterTop: 0.3,
      diameterBottom: 1.2,
      tessellation: 6,
    }, scene);
    const ghostMarkerMat = new StandardMaterial('moveGhostMarkerMat', scene);
    ghostMarkerMat.diffuseColor = colorObj;
    ghostMarkerMat.alpha = 0.7;
    ghostMarkerMat.emissiveColor = colorObj.scale(0.5);
    moveMode.ghostMarker.material = ghostMarkerMat;
    moveMode.ghostMarker.position.y = 4;
    moveMode.ghostMarker.isPickable = false;
  }

  function cancelMoveMode(notifyCallback = false) {
    if (notifyCallback && moveMode.onCancel) {
      moveMode.onCancel();
    }

    // Restore island visibility
    if (moveMode.projectId !== null) {
      const island = islandMeshes.get(moveMode.projectId);
      if (island) {
        island.base.visibility = 1;
        island.marker.visibility = 1;
        if (island.label) island.label.visibility = 1;
      }
    }

    moveMode.active = false;
    moveMode.projectId = null;
    moveMode.onMove = null;
    moveMode.onCancel = null;
    moveMode.ghostMesh?.dispose();
    moveMode.ghostMesh = null;
    moveMode.ghostMarker?.dispose();
    moveMode.ghostMarker = null;
  }

  // ===========================================
  // POINTER HANDLING
  // ===========================================
  scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
    const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh === ground);
    const groundPos = pickResult?.pickedPoint;

    // Update ghost position in placement mode (with terrain height)
    if (placementMode.active && groundPos) {
      const terrainY = getTerrainHeight(groundPos.x, groundPos.z);
      if (placementMode.ghostMesh) {
        placementMode.ghostMesh.position.set(groundPos.x, terrainY + 1, groundPos.z);
      }
      if (placementMode.ghostMarker) {
        placementMode.ghostMarker.position.set(groundPos.x, terrainY + 4, groundPos.z);
      }
    }

    // Update ghost position in move mode (with terrain height)
    if (moveMode.active && groundPos) {
      const terrainY = getTerrainHeight(groundPos.x, groundPos.z);
      if (moveMode.ghostMesh) {
        moveMode.ghostMesh.position.set(groundPos.x, terrainY + 1, groundPos.z);
      }
      if (moveMode.ghostMarker) {
        moveMode.ghostMarker.position.set(groundPos.x, terrainY + 4, groundPos.z);
      }
    }

    // Handle pointer events
    if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
      // Placement mode - place on click
      if (placementMode.active && groundPos && placementMode.onPlace) {
        placementMode.onPlace(groundPos.x, groundPos.z);
        cancelPlacementMode();
        return;
      }

      // Move mode - move on click
      if (moveMode.active && groundPos && moveMode.onMove) {
        moveMode.onMove(groundPos.x, groundPos.z);
        cancelMoveMode();
        return;
      }

      // Check if clicking on an island - just select it
      const pick = pointerInfo.pickInfo;
      if (pick?.hit && pick.pickedMesh?.metadata?.type === 'island') {
        const projectId = pick.pickedMesh.metadata.projectId;
        onProjectClick(projectId);
      }
    }
  });

  return {
    scene,
    updateProjects,
    focusProject,
    resetCamera,
    startPlacementMode,
    cancelPlacementMode,
    startMoveMode,
    cancelMoveMode,
    dispose: () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      pipeline.dispose();
      glowLayer.dispose();
      highlightLayer.dispose();
      scene.dispose();
    },
  };
}
