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
  Matrix,
  Quaternion,
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
  scene.clearColor = new Color4(0.3, 0.55, 0.85, 1); // Blue sky
  scene.ambientColor = new Color3(0.5, 0.5, 0.5);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0006; // Light fog
  scene.fogColor = new Color3(0.4, 0.6, 0.85); // Blue fog matching sky

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
  camera.upperRadiusLimit = 300;
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
  ambientLight.intensity = 0.55; // Good ambient so objects aren't too dark
  ambientLight.groundColor = new Color3(0.4, 0.45, 0.5);
  ambientLight.diffuse = new Color3(1, 0.98, 0.95);

  const sunLight = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.3).normalize(), scene);
  sunLight.intensity = 1.3; // Harsher sun
  sunLight.diffuse = new Color3(1, 0.95, 0.85);
  sunLight.specular = new Color3(1, 0.98, 0.9);
  sunLight.position = new Vector3(50, 100, 50);

  const shadowGenerator = new ShadowGenerator(2048, sunLight);
  shadowGenerator.useBlurExponentialShadowMap = true;
  shadowGenerator.blurScale = 1; // Sharper shadows
  shadowGenerator.setDarkness(0.55); // Darker shadows

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
  // SKY WITH SUN AND CLOUDS
  // ===========================================
  const sky = MeshBuilder.CreateSphere('sky', { diameter: 1000, sideOrientation: Mesh.BACKSIDE }, scene);
  const skyMat = new StandardMaterial('skyMat', scene);
  skyMat.backFaceCulling = false;
  skyMat.disableLighting = true;

  const skyTexture = new DynamicTexture('skyTex', { width: 1, height: 256 }, scene);
  const skyCtx = skyTexture.getContext();
  const gradient = skyCtx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#1a5fc4');    // Deep blue at top
  gradient.addColorStop(0.4, '#2e7ad9');  // Medium blue
  gradient.addColorStop(0.7, '#4a9ae8');  // Sky blue
  gradient.addColorStop(1, '#5aacf0');    // Still blue at horizon
  skyCtx.fillStyle = gradient;
  skyCtx.fillRect(0, 0, 1, 256);
  skyTexture.update();

  skyMat.emissiveTexture = skyTexture;
  skyMat.emissiveColor = Color3.White();
  sky.material = skyMat;
  sky.infiniteDistance = true;
  sky.rotation.x = Math.PI;

  // Sun
  const sun = MeshBuilder.CreateSphere('sun', { diameter: 40 }, scene);
  const sunMat = new StandardMaterial('sunMat', scene);
  sunMat.emissiveColor = new Color3(1, 0.95, 0.7);
  sunMat.disableLighting = true;
  sun.material = sunMat;
  sun.position = new Vector3(150, 200, -100);
  glowLayer.addIncludedOnlyMesh(sun);
  glowLayer.customEmissiveColorSelector = (mesh, _subMesh, _material, result) => {
    if (mesh === sun) {
      result.set(1, 0.9, 0.5, 1);
    }
  };

  // Clouds - fluffy low-poly style
  const clouds: Mesh[] = [];
  const cloudMat = new StandardMaterial('cloudMat', scene);
  cloudMat.diffuseColor = new Color3(1, 1, 1);
  cloudMat.emissiveColor = new Color3(0.85, 0.88, 0.95);
  cloudMat.alpha = 0.5; // More transparent
  cloudMat.disableLighting = true;
  cloudMat.backFaceCulling = false;

  function createCloud(x: number, y: number, z: number, scale: number) {
    const cloudParent = new Mesh('cloud', scene);
    cloudParent.position = new Vector3(x, y, z);

    // Cloud shape - flatter, wider, more natural cumulus shape
    // Bottom layer - wide and flat
    const bottomPuffs = [
      { x: 0, y: 0, z: 0, size: 18, scaleY: 0.5 },
      { x: -12, y: -1, z: 3, size: 14, scaleY: 0.45 },
      { x: 10, y: -1, z: -2, size: 15, scaleY: 0.5 },
      { x: -6, y: -1, z: -8, size: 12, scaleY: 0.4 },
      { x: 8, y: -1, z: 6, size: 13, scaleY: 0.45 },
    ];

    // Middle layer - medium bumps
    const middlePuffs = [
      { x: -4, y: 5, z: 0, size: 14, scaleY: 0.7 },
      { x: 6, y: 4, z: 2, size: 12, scaleY: 0.65 },
      { x: -8, y: 3, z: -4, size: 10, scaleY: 0.6 },
      { x: 3, y: 4, z: -5, size: 11, scaleY: 0.65 },
    ];

    // Top layer - smaller rounded tops
    const topPuffs = [
      { x: 0, y: 8, z: 0, size: 10, scaleY: 0.8 },
      { x: -5, y: 7, z: 2, size: 8, scaleY: 0.75 },
      { x: 4, y: 6, z: -2, size: 7, scaleY: 0.7 },
    ];

    const allPuffs = [...bottomPuffs, ...middlePuffs, ...topPuffs];

    allPuffs.forEach((puff, i) => {
      const sphere = MeshBuilder.CreateSphere(`puff${i}`, {
        diameter: puff.size * scale,
        segments: 6, // Low poly
      }, scene);
      sphere.position = new Vector3(
        puff.x * scale + (Math.random() - 0.5) * 3 * scale,
        puff.y * scale,
        puff.z * scale + (Math.random() - 0.5) * 3 * scale
      );
      sphere.scaling.y = puff.scaleY;
      sphere.scaling.x = 1 + (Math.random() - 0.5) * 0.2;
      sphere.scaling.z = 1 + (Math.random() - 0.5) * 0.2;
      sphere.material = cloudMat;
      sphere.parent = cloudParent;
    });

    clouds.push(cloudParent);
    return cloudParent;
  }

  // Spawn clouds - lower altitude so visible when zoomed out
  for (let i = 0; i < 12; i++) {
    const x = (Math.random() - 0.5) * 600;
    const y = 40 + Math.random() * 35;
    const z = (Math.random() - 0.5) * 600;
    const scale = 0.4 + Math.random() * 0.5;
    createCloud(x, y, z, scale);
  }

  // Animate clouds
  let cloudTime = 0;
  scene.onBeforeRenderObservable.add(() => {
    cloudTime += 0.0005;
    clouds.forEach((cloud, i) => {
      cloud.position.x += 0.02 + (i % 3) * 0.01;
      if (cloud.position.x > 350) {
        cloud.position.x = -350;
      }
    });
  });

  // ===========================================
  // CLOUD SHADOWS VIA NOISE TEXTURE (proper implementation)
  // ===========================================
  // Create a large plane high up that casts shadows using animated noise texture

  // Import and create noise texture for clouds
  const cloudNoiseTexture = new DynamicTexture('cloudNoise', 512, scene);
  const noiseCtx = cloudNoiseTexture.getContext() as CanvasRenderingContext2D;

  // Generate cloud noise pattern
  function generateCloudNoise(offsetX: number, offsetY: number) {
    const imgData = noiseCtx.createImageData(512, 512);
    const data = imgData.data;

    for (let y = 0; y < 512; y++) {
      for (let x = 0; x < 512; x++) {
        const i = (y * 512 + x) * 4;

        // Multi-octave noise for cloud-like pattern
        const nx = (x + offsetX) * 0.008;
        const ny = (y + offsetY) * 0.008;

        let noise = 0;
        noise += Math.sin(nx * 3 + ny * 2) * 0.5 + 0.5;
        noise += (Math.sin(nx * 7 + ny * 5) * 0.5 + 0.5) * 0.5;
        noise += (Math.sin(nx * 13 + ny * 11) * 0.5 + 0.5) * 0.25;
        noise /= 1.75;

        // Threshold to create cloud shapes
        const threshold = 0.45;
        const alpha = noise > threshold ? Math.min((noise - threshold) * 3, 1) * 0.4 : 0;

        data[i] = 0;     // R
        data[i + 1] = 0; // G
        data[i + 2] = 0; // B
        data[i + 3] = alpha * 255; // A
      }
    }

    noiseCtx.putImageData(imgData, 0, 0);
    cloudNoiseTexture.update();
  }

  // Initial generation
  let cloudOffsetX = 0;
  let cloudOffsetY = 0;
  generateCloudNoise(0, 0);
  cloudNoiseTexture.hasAlpha = true;

  // Create shadow-casting plane high above the scene
  const cloudShadowPlane = MeshBuilder.CreatePlane('cloudShadowPlane', {
    size: 600
  }, scene);
  cloudShadowPlane.rotation.x = Math.PI / 2;
  cloudShadowPlane.position.y = 80; // High up, below the light
  cloudShadowPlane.isVisible = false; // Invisible but casts shadows

  const cloudShadowMat = new StandardMaterial('cloudShadowMat', scene);
  cloudShadowMat.opacityTexture = cloudNoiseTexture;
  cloudShadowMat.diffuseColor = new Color3(0, 0, 0);
  cloudShadowMat.backFaceCulling = false;
  cloudShadowPlane.material = cloudShadowMat;

  // Enable transparent shadows
  shadowGenerator.transparencyShadow = true;
  shadowGenerator.enableSoftTransparentShadow = true;
  shadowGenerator.addShadowCaster(cloudShadowPlane);

  // Animate cloud shadows by regenerating noise with offset
  let lastNoiseUpdate = 0;
  scene.onBeforeRenderObservable.add(() => {
    cloudOffsetX += 0.3; // Slow drift speed
    cloudOffsetY += 0.1;

    // Update noise texture periodically (not every frame for performance)
    const now = performance.now();
    if (now - lastNoiseUpdate > 100) { // Update every 100ms
      generateCloudNoise(cloudOffsetX, cloudOffsetY);
      lastNoiseUpdate = now;
    }
  });

  // ===========================================
  // ENVIRONMENT: INSTANCED VEGETATION (High Performance)
  // ===========================================
  // Using Thin Instances for massive performance gains
  // Instead of 1000s of draw calls, we get ~10 draw calls total

  // Shared materials (reused across all instances)
  const trunkMat = new StandardMaterial('trunkMat', scene);
  trunkMat.diffuseColor = new Color3(0.4, 0.28, 0.18);
  trunkMat.specularColor = new Color3(0.1, 0.1, 0.1);

  const foliageMat = new StandardMaterial('foliageMat', scene);
  foliageMat.diffuseColor = new Color3(0.3, 0.5, 0.25);
  foliageMat.specularColor = new Color3(0.1, 0.15, 0.1);

  const pineFoliageMat = new StandardMaterial('pineFoliageMat', scene);
  pineFoliageMat.diffuseColor = new Color3(0.18, 0.38, 0.18);
  pineFoliageMat.specularColor = new Color3(0.1, 0.12, 0.1);

  const bushMat = new StandardMaterial('bushMat', scene);
  bushMat.diffuseColor = new Color3(0.32, 0.48, 0.25);
  bushMat.specularColor = new Color3(0.1, 0.12, 0.1);

  const rockMat = new StandardMaterial('rockMat', scene);
  rockMat.diffuseColor = new Color3(0.52, 0.5, 0.48);
  rockMat.specularColor = new Color3(0.2, 0.2, 0.2);

  // ===========================================
  // DECIDUOUS TREE TEMPLATE (merged mesh)
  // ===========================================
  // Note: For thin instances, template position is ignored - offset is baked into matrices
  const treeTrunkTemplate = MeshBuilder.CreateCylinder('treeTrunk', {
    height: 3.5,
    diameterTop: 0.35,
    diameterBottom: 0.6,
    tessellation: 8
  }, scene);
  treeTrunkTemplate.bakeCurrentTransformIntoVertices(); // Bake at origin
  treeTrunkTemplate.material = trunkMat;
  treeTrunkTemplate.isVisible = false;

  const treeFoliageTemplate = MeshBuilder.CreateSphere('treeFoliage', {
    diameter: 4.5,
    segments: 6
  }, scene);
  treeFoliageTemplate.scaling = new Vector3(1.2, 1, 1.2);
  treeFoliageTemplate.bakeCurrentTransformIntoVertices();
  treeFoliageTemplate.material = foliageMat;
  treeFoliageTemplate.isVisible = false;

  // ===========================================
  // PINE TREE TEMPLATES
  // ===========================================
  const pineTrunkTemplate = MeshBuilder.CreateCylinder('pineTrunk', {
    height: 4,
    diameter: 0.4,
    tessellation: 8
  }, scene);
  pineTrunkTemplate.bakeCurrentTransformIntoVertices();
  pineTrunkTemplate.material = trunkMat;
  pineTrunkTemplate.isVisible = false;

  // Single merged pine foliage (3 cones merged) - position baked into merged mesh
  const pineCone1 = MeshBuilder.CreateCylinder('cone1', { height: 2.5, diameterTop: 0, diameterBottom: 3, tessellation: 8 }, scene);
  pineCone1.position.y = 1; // Relative to trunk top (at 2 + offset)
  const pineCone2 = MeshBuilder.CreateCylinder('cone2', { height: 2, diameterTop: 0, diameterBottom: 2.2, tessellation: 8 }, scene);
  pineCone2.position.y = 2.5;
  const pineCone3 = MeshBuilder.CreateCylinder('cone3', { height: 1.5, diameterTop: 0, diameterBottom: 1.4, tessellation: 8 }, scene);
  pineCone3.position.y = 3.8;

  const pineFoliageTemplate = Mesh.MergeMeshes([pineCone1, pineCone2, pineCone3], true, true, undefined, false, true);
  if (pineFoliageTemplate) {
    pineFoliageTemplate.material = pineFoliageMat;
    pineFoliageTemplate.isVisible = false;
  }

  // ===========================================
  // BUSH TEMPLATE
  // ===========================================
  const bushTemplate = MeshBuilder.CreateSphere('bush', {
    diameter: 1.2,
    segments: 5
  }, scene);
  bushTemplate.scaling = new Vector3(1.3, 0.8, 1.3);
  bushTemplate.bakeCurrentTransformIntoVertices();
  bushTemplate.material = bushMat;
  bushTemplate.isVisible = false;

  // ===========================================
  // ROCK TEMPLATE
  // ===========================================
  const rockTemplate = MeshBuilder.CreatePolyhedron('rock', { type: 1, size: 1 }, scene);
  rockTemplate.bakeCurrentTransformIntoVertices();
  rockTemplate.material = rockMat;
  rockTemplate.isVisible = false;

  // ===========================================
  // COLLECT INSTANCE POSITIONS
  // ===========================================
  interface InstanceData {
    x: number;
    z: number;
    scale: number;
    rotY: number;
  }

  const treePositions: InstanceData[] = [];
  const pinePositions: InstanceData[] = [];
  const bushPositions: InstanceData[] = [];
  const rockPositions: InstanceData[] = [];

  // Helper to check river distance
  const isValidPosition = (x: number, z: number, minDist: number) => {
    return distanceToRiver(x, z, riverPath) >= riverConfig.width * minDist;
  };

  // Collect deciduous tree positions
  for (let i = 0; i < 250; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 25 + Math.random() * 170;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isValidPosition(x, z, 2.5)) {
      treePositions.push({ x, z, scale: 0.6 + Math.random() * 0.7, rotY: Math.random() * Math.PI * 2 });
    }
  }

  // Collect pine tree positions
  for (let i = 0; i < 220; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 30 + Math.random() * 175;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isValidPosition(x, z, 2.5)) {
      pinePositions.push({ x, z, scale: 0.5 + Math.random() * 0.7, rotY: Math.random() * Math.PI * 2 });
    }
  }

  // Tree clusters
  for (let cluster = 0; cluster < 20; cluster++) {
    const clusterAngle = Math.random() * Math.PI * 2;
    const clusterRadius = 60 + Math.random() * 120;
    const clusterX = Math.cos(clusterAngle) * clusterRadius;
    const clusterZ = Math.sin(clusterAngle) * clusterRadius;
    if (!isValidPosition(clusterX, clusterZ, 3)) continue;

    const treesInCluster = 5 + Math.floor(Math.random() * 6);
    for (let t = 0; t < treesInCluster; t++) {
      const x = clusterX + (Math.random() - 0.5) * 15;
      const z = clusterZ + (Math.random() - 0.5) * 15;
      const scale = 0.5 + Math.random() * 0.5;
      const rotY = Math.random() * Math.PI * 2;
      if (Math.random() > 0.4) {
        pinePositions.push({ x, z, scale, rotY });
      } else {
        treePositions.push({ x, z, scale, rotY });
      }
    }
  }

  // Collect bush positions
  for (let i = 0; i < 200; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 15 + Math.random() * 180;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isValidPosition(x, z, 1.5)) {
      bushPositions.push({ x, z, scale: 0.5 + Math.random() * 0.9, rotY: Math.random() * Math.PI * 2 });
    }
  }

  // Collect rock positions
  for (let i = 0; i < 100; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * 175;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (isValidPosition(x, z, 1)) {
      rockPositions.push({ x, z, scale: 0.4 + Math.random() * 1.2, rotY: Math.random() * Math.PI * 2 });
    }
  }

  // ===========================================
  // CREATE THIN INSTANCES
  // ===========================================
  const tempMatrix = new Matrix();

  // Deciduous tree trunks (trunk center at 1.75 units up)
  const treeTrunkMatrices = new Float32Array(treePositions.length * 16);
  treePositions.forEach((pos, i) => {
    const terrainY = getTerrainHeight(pos.x, pos.z);
    const trunkY = terrainY + 1.75 * pos.scale; // Trunk center offset
    Matrix.ComposeToRef(
      new Vector3(pos.scale, pos.scale, pos.scale),
      Quaternion.RotationAxis(Vector3.Up(), pos.rotY),
      new Vector3(pos.x, trunkY, pos.z),
      tempMatrix
    );
    tempMatrix.copyToArray(treeTrunkMatrices, i * 16);
  });
  treeTrunkTemplate.isVisible = true;
  treeTrunkTemplate.thinInstanceSetBuffer('matrix', treeTrunkMatrices, 16);
  treeTrunkTemplate.receiveShadows = true;
  shadowGenerator.addShadowCaster(treeTrunkTemplate);

  // Deciduous tree foliage (foliage center at 4.5 units up)
  const treeFoliageMatrices = new Float32Array(treePositions.length * 16);
  treePositions.forEach((pos, i) => {
    const terrainY = getTerrainHeight(pos.x, pos.z);
    const foliageY = terrainY + 4.5 * pos.scale; // Foliage center offset
    const scaleVariation = 0.9 + Math.random() * 0.2;
    Matrix.ComposeToRef(
      new Vector3(pos.scale * scaleVariation, pos.scale * (0.8 + Math.random() * 0.4), pos.scale * scaleVariation),
      Quaternion.RotationAxis(Vector3.Up(), pos.rotY),
      new Vector3(pos.x, foliageY, pos.z),
      tempMatrix
    );
    tempMatrix.copyToArray(treeFoliageMatrices, i * 16);
  });
  treeFoliageTemplate.isVisible = true;
  treeFoliageTemplate.thinInstanceSetBuffer('matrix', treeFoliageMatrices, 16);
  treeFoliageTemplate.receiveShadows = true;
  shadowGenerator.addShadowCaster(treeFoliageTemplate);

  // Pine tree trunks (trunk center at 2 units up)
  const pineTrunkMatrices = new Float32Array(pinePositions.length * 16);
  pinePositions.forEach((pos, i) => {
    const terrainY = getTerrainHeight(pos.x, pos.z);
    const trunkY = terrainY + 2 * pos.scale; // Pine trunk center offset
    Matrix.ComposeToRef(
      new Vector3(pos.scale, pos.scale, pos.scale),
      Quaternion.RotationAxis(Vector3.Up(), pos.rotY),
      new Vector3(pos.x, trunkY, pos.z),
      tempMatrix
    );
    tempMatrix.copyToArray(pineTrunkMatrices, i * 16);
  });
  pineTrunkTemplate.isVisible = true;
  pineTrunkTemplate.thinInstanceSetBuffer('matrix', pineTrunkMatrices, 16);
  pineTrunkTemplate.receiveShadows = true;
  shadowGenerator.addShadowCaster(pineTrunkTemplate);

  // Pine tree foliage (foliage starts at trunk top, around 4 units up)
  if (pineFoliageTemplate) {
    const pineFoliageMatrices = new Float32Array(pinePositions.length * 16);
    pinePositions.forEach((pos, i) => {
      const terrainY = getTerrainHeight(pos.x, pos.z);
      const foliageY = terrainY + 4 * pos.scale; // Pine foliage base offset
      Matrix.ComposeToRef(
        new Vector3(pos.scale, pos.scale, pos.scale),
        Quaternion.RotationAxis(Vector3.Up(), pos.rotY),
        new Vector3(pos.x, foliageY, pos.z),
        tempMatrix
      );
      tempMatrix.copyToArray(pineFoliageMatrices, i * 16);
    });
    pineFoliageTemplate.isVisible = true;
    pineFoliageTemplate.thinInstanceSetBuffer('matrix', pineFoliageMatrices, 16);
    pineFoliageTemplate.receiveShadows = true;
    shadowGenerator.addShadowCaster(pineFoliageTemplate);
  }

  // Bushes (center at ~0.5 units up)
  const bushMatrices = new Float32Array(bushPositions.length * 16);
  bushPositions.forEach((pos, i) => {
    const terrainY = getTerrainHeight(pos.x, pos.z);
    const bushY = terrainY + 0.5 * pos.scale; // Bush center offset
    Matrix.ComposeToRef(
      new Vector3(pos.scale, pos.scale * 0.7, pos.scale),
      Quaternion.RotationAxis(Vector3.Up(), pos.rotY),
      new Vector3(pos.x, bushY, pos.z),
      tempMatrix
    );
    tempMatrix.copyToArray(bushMatrices, i * 16);
  });
  bushTemplate.isVisible = true;
  bushTemplate.thinInstanceSetBuffer('matrix', bushMatrices, 16);
  bushTemplate.receiveShadows = true;
  shadowGenerator.addShadowCaster(bushTemplate);

  // Rocks (partially embedded in ground)
  const rockMatrices = new Float32Array(rockPositions.length * 16);
  rockPositions.forEach((pos, i) => {
    const terrainY = getTerrainHeight(pos.x, pos.z);
    const rockY = terrainY + pos.scale * 0.4; // Rock center offset (partially buried)
    Matrix.ComposeToRef(
      new Vector3(pos.scale, pos.scale * 0.8, pos.scale),
      Quaternion.RotationAxis(Vector3.Up(), pos.rotY),
      new Vector3(pos.x, rockY, pos.z),
      tempMatrix
    );
    tempMatrix.copyToArray(rockMatrices, i * 16);
  });
  rockTemplate.isVisible = true;
  rockTemplate.thinInstanceSetBuffer('matrix', rockMatrices, 16);
  rockTemplate.receiveShadows = true;
  shadowGenerator.addShadowCaster(rockTemplate);

  // Log performance info
  console.log(`[Performance] Vegetation instances: ${treePositions.length} trees, ${pinePositions.length} pines, ${bushPositions.length} bushes, ${rockPositions.length} rocks`);
  console.log(`[Performance] Draw calls reduced from ~${(treePositions.length * 7) + (pinePositions.length * 4) + (bushPositions.length * 4) + rockPositions.length} to ~6`);

  // ===========================================
  // RIVER
  // ===========================================
  // River water surface with animated flow
  const riverWaterLevel = -riverConfig.depth * 0.3;

  const river = MeshBuilder.CreateRibbon('river', {
    pathArray: [
      riverPath.map(p => new Vector3(p.x, riverWaterLevel, p.z - riverConfig.width * 0.7)),
      riverPath.map(p => new Vector3(p.x, riverWaterLevel, p.z + riverConfig.width * 0.7)),
    ],
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);

  // Create subtle water texture
  const waterTexSize = 256;
  const waterTexture = new DynamicTexture('waterTex', waterTexSize, scene);
  const waterCtx = waterTexture.getContext() as CanvasRenderingContext2D;

  // Draw subtle ripple pattern - lighter, more transparent feel
  waterCtx.fillStyle = 'rgba(70, 130, 160, 0.6)';
  waterCtx.fillRect(0, 0, waterTexSize, waterTexSize);

  // Soft ripple highlights
  waterCtx.strokeStyle = 'rgba(150, 200, 220, 0.3)';
  waterCtx.lineWidth = 1;
  for (let i = 0; i < 30; i++) {
    waterCtx.beginPath();
    const y = (i / 30) * waterTexSize;
    waterCtx.moveTo(0, y);
    for (let x = 0; x < waterTexSize; x += 8) {
      waterCtx.lineTo(x, y + Math.sin((x + i * 15) * 0.08) * 4);
    }
    waterCtx.stroke();
  }
  waterTexture.update();

  // Transparent, natural water material
  const riverMat = new StandardMaterial('riverMat', scene);
  riverMat.diffuseTexture = waterTexture;
  (riverMat.diffuseTexture as Texture).uScale = 8;
  (riverMat.diffuseTexture as Texture).vScale = 2;
  riverMat.diffuseColor = new Color3(0.45, 0.6, 0.65); // Lighter, more natural
  riverMat.specularColor = new Color3(0.8, 0.85, 0.9); // Bright specular for sun reflection
  riverMat.specularPower = 64;
  riverMat.alpha = 0.55; // More transparent
  riverMat.backFaceCulling = false;
  riverMat.emissiveColor = new Color3(0.02, 0.05, 0.08); // Subtle glow

  river.material = riverMat;

  // Animate water flow
  let waterOffset = 0;
  scene.onBeforeRenderObservable.add(() => {
    waterOffset += 0.004;
    if (riverMat.diffuseTexture) {
      (riverMat.diffuseTexture as Texture).uOffset = waterOffset;
      (riverMat.diffuseTexture as Texture).vOffset = Math.sin(waterOffset * 2) * 0.01;
    }
  });

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
