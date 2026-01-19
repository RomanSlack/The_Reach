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
  CubeTexture,
  SSAO2RenderingPipeline,
  PostProcess,
  Effect,
  VolumetricLightScatteringPostProcess,
} from '@babylonjs/core';
import { TerrainMaterial } from '@babylonjs/materials';
import '@babylonjs/loaders/glTF';
import type { Project } from '../api/client';
import { generateTerrainHeight, distanceToLake, getLakeRadiusAtAngle, getWaterLevel, type LakeConfig } from './terrain';
import { createCloudShadows } from './cloudShadows';
import { createLake } from './lake';
import { createSettlementManager, type SettlementManager } from './settlements';
import { createBirdSystem, type BirdSystem } from './birds';
import { createSheepSystem, type SheepSystem } from './sheep';
import { createFishSystem, type FishSystem } from './fish';

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
  onProjectClick: (projectId: number | null) => void,
  onProjectMove?: (projectId: number, x: number, z: number) => void
): ReachScene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.3, 0.55, 0.85, 1); // Blue sky
  scene.ambientColor = new Color3(0.5, 0.5, 0.5);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0006; // Light fog
  scene.fogColor = new Color3(0.4, 0.6, 0.85); // Blue fog matching sky

  // Performance optimizations
  scene.skipPointerMovePicking = true; // Only pick on click, not every frame

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

  // WASD Panning - smooth velocity-based movement
  const maxPanSpeed = 1.2;        // Maximum movement speed
  const acceleration = 0.08;      // How quickly we reach max speed
  const deceleration = 0.12;      // How quickly we slow down (slightly faster than accel for responsiveness)
  const keysPressed: { [key: string]: boolean } = {};
  let velocity = Vector3.Zero();  // Current movement velocity

  const handleKeyDown = (e: KeyboardEvent) => {
    // Ignore keyboard input when focused on form elements
    const target = e.target as HTMLElement;
    const isFormElement = target.tagName === 'INPUT' ||
                          target.tagName === 'TEXTAREA' ||
                          target.tagName === 'SELECT' ||
                          target.isContentEditable;

    if (isFormElement && e.key.toLowerCase() !== 'escape') {
      return;
    }

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
    // Ignore keyboard input when focused on form elements
    const target = e.target as HTMLElement;
    const isFormElement = target.tagName === 'INPUT' ||
                          target.tagName === 'TEXTAREA' ||
                          target.tagName === 'SELECT' ||
                          target.isContentEditable;

    if (isFormElement) {
      return;
    }

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

    // Calculate target velocity based on input
    let targetVelocity = Vector3.Zero();
    if (keysPressed['w']) targetVelocity.addInPlace(forward.scale(maxPanSpeed));
    if (keysPressed['s']) targetVelocity.addInPlace(forward.scale(-maxPanSpeed));
    if (keysPressed['a']) targetVelocity.addInPlace(right.scale(-maxPanSpeed));
    if (keysPressed['d']) targetVelocity.addInPlace(right.scale(maxPanSpeed));

    // Normalize diagonal movement to prevent faster diagonal speed
    if (targetVelocity.length() > maxPanSpeed) {
      targetVelocity.normalize().scaleInPlace(maxPanSpeed);
    }

    // Smoothly interpolate current velocity toward target velocity
    const isMoving = targetVelocity.length() > 0;
    const lerpFactor = isMoving ? acceleration : deceleration;

    velocity = Vector3.Lerp(velocity, targetVelocity, lerpFactor);

    // Apply velocity to camera (with small threshold to prevent micro-movements)
    if (velocity.length() > 0.001) {
      camera.target.addInPlace(velocity);
    } else {
      velocity = Vector3.Zero(); // Stop completely when very slow
    }
  });

  // ===========================================
  // LIGHTING (Realistic with low-poly aesthetic)
  // ===========================================

  // Ambient/fill light - soft blue from sky
  const ambientLight = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambientLight.intensity = 0.4;
  ambientLight.groundColor = new Color3(0.25, 0.2, 0.15); // Warm ground bounce
  ambientLight.diffuse = new Color3(0.7, 0.8, 1.0); // Cool sky light

  // Main sun light - warm and strong
  const sunLight = new DirectionalLight('sun', new Vector3(-0.5, -1, -0.3).normalize(), scene);
  sunLight.intensity = 1.8; // Strong sun for dramatic lighting
  sunLight.diffuse = new Color3(1, 0.95, 0.8); // Warm sunlight
  sunLight.specular = new Color3(1, 0.98, 0.9);
  sunLight.position = new Vector3(100, 150, 80);

  // High quality shadows - soft and realistic
  const shadowGenerator = new ShadowGenerator(4096, sunLight); // Higher res for quality
  shadowGenerator.usePercentageCloserFiltering = true; // PCF for soft shadows
  shadowGenerator.filteringQuality = ShadowGenerator.QUALITY_HIGH;
  shadowGenerator.bias = 0.0005;
  shadowGenerator.normalBias = 0.01;
  shadowGenerator.setDarkness(0.35); // Visible shadows
  shadowGenerator.frustumEdgeFalloff = 0.5; // Soft edges at frustum bounds

  // Ensure shadows cover the terrain properly
  sunLight.shadowMinZ = 1;
  sunLight.shadowMaxZ = 500;

  // ===========================================
  // SSAO (Screen Space Ambient Occlusion)
  // ===========================================
  const ssao = new SSAO2RenderingPipeline('ssao', scene, {
    ssaoRatio: 0.5, // Half resolution for performance
    blurRatio: 1
  }, [camera], true);
  ssao.radius = 2.0; // AO radius
  ssao.totalStrength = 1.2; // AO intensity
  ssao.base = 0.1; // Base darkness
  ssao.samples = 16; // Quality
  ssao.maxZ = 250; // Max depth
  ssao.minZAspect = 0.5;

  // SSR disabled - too expensive for web, causes noise and low FPS
  // Can be re-enabled for high-end GPUs if needed

  // ===========================================
  // POST-PROCESSING (Cinematic look)
  // ===========================================
  const pipeline = new DefaultRenderingPipeline('pipeline', true, scene, [camera]);

  // Anti-aliasing
  pipeline.fxaaEnabled = true;
  pipeline.samples = 4; // MSAA

  // Bloom - subtle glow on bright areas
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.75;
  pipeline.bloomWeight = 0.3;
  pipeline.bloomKernel = 64;
  pipeline.bloomScale = 0.5;

  // Sharpen - crisp low-poly edges
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.3;
  pipeline.sharpen.colorAmount = 1.0;

  // Tone mapping and color grading
  pipeline.imageProcessingEnabled = true;
  pipeline.imageProcessing.toneMappingEnabled = true;
  pipeline.imageProcessing.toneMappingType = 1; // ACES filmic
  pipeline.imageProcessing.contrast = 1.15; // Punch up contrast
  pipeline.imageProcessing.exposure = 1.1; // Slightly brighter

  // Vignette - subtle darkening at edges
  pipeline.imageProcessing.vignetteEnabled = true;
  pipeline.imageProcessing.vignetteWeight = 0.4;
  pipeline.imageProcessing.vignetteStretch = 0.5;
  pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 0);

  // Color curves for that stylized look
  pipeline.imageProcessing.colorCurvesEnabled = true;
  const curves = pipeline.imageProcessing.colorCurves!;
  curves.globalSaturation = 20; // Slightly more saturated
  curves.highlightsSaturation = -10; // Desaturate highlights slightly
  curves.shadowsHue = 20; // Warm shadows
  curves.shadowsSaturation = 10;

  // Depth of Field - disabled for performance (causes blur)
  pipeline.depthOfFieldEnabled = false;

  // Chromatic Aberration - disabled (can cause visual artifacts)
  pipeline.chromaticAberrationEnabled = false;

  // ===========================================
  // ATMOSPHERIC FOG
  // ===========================================
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0006; // Subtle fog
  scene.fogColor = new Color3(0.78, 0.85, 0.92); // Light bluish atmospheric haze

  // ===========================================
  // STYLIZED EDGE DETECTION SHADER
  // ===========================================
  // Custom post-process for subtle outlines that emphasize low-poly geometry

  // Register the custom shader
  Effect.ShadersStore['edgeDetectionFragmentShader'] = `
    precision highp float;

    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform sampler2D depthSampler;
    uniform vec2 screenSize;
    uniform float edgeStrength;
    uniform float depthThreshold;
    uniform vec3 edgeColor;

    void main(void) {
      vec2 texelSize = 1.0 / screenSize;

      // Sample depth values in a 3x3 kernel
      float d00 = texture2D(depthSampler, vUV + vec2(-texelSize.x, -texelSize.y)).r;
      float d10 = texture2D(depthSampler, vUV + vec2(0.0, -texelSize.y)).r;
      float d20 = texture2D(depthSampler, vUV + vec2(texelSize.x, -texelSize.y)).r;
      float d01 = texture2D(depthSampler, vUV + vec2(-texelSize.x, 0.0)).r;
      float d21 = texture2D(depthSampler, vUV + vec2(texelSize.x, 0.0)).r;
      float d02 = texture2D(depthSampler, vUV + vec2(-texelSize.x, texelSize.y)).r;
      float d12 = texture2D(depthSampler, vUV + vec2(0.0, texelSize.y)).r;
      float d22 = texture2D(depthSampler, vUV + vec2(texelSize.x, texelSize.y)).r;

      // Sobel edge detection on depth
      float sobelX = d00 + 2.0 * d01 + d02 - d20 - 2.0 * d21 - d22;
      float sobelY = d00 + 2.0 * d10 + d20 - d02 - 2.0 * d12 - d22;
      float depthEdge = sqrt(sobelX * sobelX + sobelY * sobelY);

      // Also detect edges based on color differences for detail
      vec3 c00 = texture2D(textureSampler, vUV + vec2(-texelSize.x, -texelSize.y)).rgb;
      vec3 c10 = texture2D(textureSampler, vUV + vec2(0.0, -texelSize.y)).rgb;
      vec3 c20 = texture2D(textureSampler, vUV + vec2(texelSize.x, -texelSize.y)).rgb;
      vec3 c01 = texture2D(textureSampler, vUV + vec2(-texelSize.x, 0.0)).rgb;
      vec3 c21 = texture2D(textureSampler, vUV + vec2(texelSize.x, 0.0)).rgb;
      vec3 c02 = texture2D(textureSampler, vUV + vec2(-texelSize.x, texelSize.y)).rgb;
      vec3 c12 = texture2D(textureSampler, vUV + vec2(0.0, texelSize.y)).rgb;
      vec3 c22 = texture2D(textureSampler, vUV + vec2(texelSize.x, texelSize.y)).rgb;

      vec3 sobelXColor = c00 + 2.0 * c01 + c02 - c20 - 2.0 * c21 - c22;
      vec3 sobelYColor = c00 + 2.0 * c10 + c20 - c02 - 2.0 * c12 - c22;
      float colorEdge = length(sobelXColor) + length(sobelYColor);

      // Combine depth and color edges
      float edge = max(depthEdge * 50.0, colorEdge * 0.5);
      edge = smoothstep(depthThreshold, depthThreshold + 0.3, edge);

      // Get original color
      vec4 color = texture2D(textureSampler, vUV);

      // Blend edge color (subtle dark outline)
      vec3 finalColor = mix(color.rgb, edgeColor, edge * edgeStrength);

      gl_FragColor = vec4(finalColor, color.a);
    }
  `;

  // Enable depth renderer for edge detection
  const depthRenderer = scene.enableDepthRenderer(camera, false);

  // Create the edge detection post-process
  const edgeDetection = new PostProcess(
    'edgeDetection',
    'edgeDetection',
    ['screenSize', 'edgeStrength', 'depthThreshold', 'edgeColor'],
    ['depthSampler'],
    1.0,
    camera
  );

  edgeDetection.onApply = (effect) => {
    effect.setFloat2('screenSize', edgeDetection.width, edgeDetection.height);
    effect.setFloat('edgeStrength', 0.4); // Subtle edges
    effect.setFloat('depthThreshold', 0.15);
    effect.setColor3('edgeColor', new Color3(0.15, 0.12, 0.1)); // Warm dark brown
    effect.setTexture('depthSampler', depthRenderer.getDepthMap());
  };

  // ===========================================
  // GLOW & HIGHLIGHT
  // ===========================================
  const glowLayer = new GlowLayer('glow', scene, { mainTextureFixedSize: 512, blurKernelSize: 32 });
  glowLayer.intensity = 0.2;

  const highlightLayer = new HighlightLayer('highlight', scene);

  // ===========================================
  // CENTRAL LAKE (terrain slopes toward it)
  // ===========================================
  const lakeConfig: LakeConfig = {
    centerX: 0,
    centerZ: 0,
    radius: 35,        // Lake radius
    depth: 4,          // Maximum depth
    shoreWidth: 10,    // Beach/shore transition width (thinner)
  };

  // ===========================================
  // TERRAIN WITH LAKE BASIN
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
    return generateTerrainHeight(x, z, lakeConfig);
  }

  // Helper to get distance to lake shore
  function getDistanceToLake(x: number, z: number): number {
    return distanceToLake(x, z, lakeConfig);
  }

  // Apply terrain height with lake basin
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

  // ===========================================
  // BIOME-BASED TERRAIN SYSTEM (Minecraft-style)
  // ===========================================
  // Procedural biomes: Grassland, Forest, Lakeshore
  // Red = Lakeshore (sand + pebbles), Green = Grass, Blue = Forest floor

  // Noise functions for terrain/biome generation
  const texNoise = (x: number, y: number, seed: number = 0): number => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
    return n - Math.floor(n);
  };

  const texFbm = (x: number, y: number, octaves: number = 6, seed: number = 0): number => {
    let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      const ix = Math.floor(x * frequency);
      const iy = Math.floor(y * frequency);
      const fx = x * frequency - ix;
      const fy = y * frequency - iy;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const n00 = texNoise(ix, iy, i + seed);
      const n10 = texNoise(ix + 1, iy, i + seed);
      const n01 = texNoise(ix, iy + 1, i + seed);
      const n11 = texNoise(ix + 1, iy + 1, i + seed);
      const nx0 = n00 + sx * (n10 - n00);
      const nx1 = n01 + sx * (n11 - n01);
      value += (nx0 + sy * (nx1 - nx0)) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return value / maxValue;
  };

  // --- BIOME MAP GENERATION ---
  // Generate distinct forest zones using large-scale noise
  const biomeScale = 0.01; // Slightly larger scale for bigger forest patches
  const getForestDensity = (x: number, z: number): number => {
    // Main forest noise - large blobs
    const forestNoise = texFbm(x * biomeScale, z * biomeScale, 3, 100);
    // Create more forest with lower threshold
    const threshold = 0.38; // Lower = more forest coverage
    if (forestNoise < threshold) return 0;
    // Smooth falloff from threshold
    const density = (forestNoise - threshold) / (1 - threshold);
    return Math.min(1, density * 1.8); // Stronger density boost
  };

  // Determine if area is pine forest vs deciduous (separate noise for distinct zones)
  const getPineRatio = (x: number, z: number): number => {
    const pineNoise = texFbm(x * biomeScale * 0.8, z * biomeScale * 0.8, 3, 300);
    // Higher elevation = more pine
    const height = getTerrainHeight(x, z);
    const heightBonus = Math.max(0, (height - 3) / 12);
    // Create distinct pine vs deciduous zones
    const baseRatio = pineNoise > 0.5 ? 0.85 : 0.15;
    return Math.min(1, baseRatio + heightBonus * 0.3);
  };

  // Store biome data for vegetation placement later
  const biomeMapSize = 256; // Higher resolution for smoother biome transitions
  const biomeData: { forestDensity: number; pineRatio: number }[][] = [];
  for (let bz = 0; bz < biomeMapSize; bz++) {
    biomeData[bz] = [];
    for (let bx = 0; bx < biomeMapSize; bx++) {
      const worldX = (bx / biomeMapSize - 0.5) * groundSize;
      const worldZ = (bz / biomeMapSize - 0.5) * groundSize;
      const lakeDist = getDistanceToLake(worldX, worldZ);
      // No forest too close to lake
      let forestDensity = lakeDist > lakeConfig.radius + lakeConfig.shoreWidth ? getForestDensity(worldX, worldZ) : 0;
      biomeData[bz][bx] = {
        forestDensity,
        pineRatio: getPineRatio(worldX, worldZ)
      };
    }
  }

  // Helper to sample biome at world position
  const sampleBiome = (worldX: number, worldZ: number) => {
    const bx = Math.floor((worldX / groundSize + 0.5) * biomeMapSize);
    const bz = Math.floor((worldZ / groundSize + 0.5) * biomeMapSize);
    const clampedBx = Math.max(0, Math.min(biomeMapSize - 1, bx));
    const clampedBz = Math.max(0, Math.min(biomeMapSize - 1, bz));
    return biomeData[clampedBz]?.[clampedBx] || { forestDensity: 0, pineRatio: 0.5 };
  };

  // --- Generate Splat/Mix Map ---
  const splatSize = 1024; // Higher resolution to avoid visible squares
  const splatTex = new DynamicTexture('splatMap', splatSize, scene, false);
  const splatCtx = splatTex.getContext() as CanvasRenderingContext2D;
  const splatData = splatCtx.createImageData(splatSize, splatSize);
  const splatPixels = splatData.data;

  for (let py = 0; py < splatSize; py++) {
    for (let px = 0; px < splatSize; px++) {
      const pi = (py * splatSize + px) * 4;
      // Fix coordinate mapping: image Y is flipped relative to world Z
      const worldX = (px / splatSize - 0.5) * groundSize;
      const worldZ = (0.5 - py / splatSize) * groundSize;

      const height = getTerrainHeight(worldX, worldZ);
      const lakeDist = getDistanceToLake(worldX, worldZ);
      const biome = sampleBiome(worldX, worldZ);

      // Calculate slope
      const sampleDist = groundSize / splatSize * 2;
      const hL = getTerrainHeight(worldX - sampleDist, worldZ);
      const hR = getTerrainHeight(worldX + sampleDist, worldZ);
      const hU = getTerrainHeight(worldX, worldZ - sampleDist);
      const hD = getTerrainHeight(worldX, worldZ + sampleDist);
      const slope = Math.sqrt(((hR - hL) / (sampleDist * 2)) ** 2 + ((hD - hU) / (sampleDist * 2)) ** 2);

      // Add noise for natural edges - higher frequency for more organic look
      const edgeNoise = texFbm(worldX * 0.08, worldZ * 0.08, 4) * 0.3;
      const fineNoise = texFbm(worldX * 0.2, worldZ * 0.2, 2) * 0.15;

      let shoreWeight = 0;       // Red: shore/beach texture
      let grassWeight = 0;       // Green: open grass
      let forestWeight = 0;      // Blue: forest floor

      // LAKESHORE: Cover lake bottom and shore, fade into grass
      const shoreEnd = lakeConfig.radius + lakeConfig.shoreWidth;

      if (lakeDist < shoreEnd) {
        if (lakeDist < lakeConfig.radius * 0.9) {
          // Inside lake - full shore/sand texture (visible through water)
          shoreWeight = 1.0;
        } else if (lakeDist < lakeConfig.radius + lakeConfig.shoreWidth * 0.5) {
          // Beach area - strong shore texture
          shoreWeight = 0.9;
        } else {
          // Transition zone from shore to grass
          const fadeProgress = (lakeDist - lakeConfig.radius - lakeConfig.shoreWidth * 0.5) / (lakeConfig.shoreWidth * 0.5);
          // Smoothstep for gradual transition
          const smoothFade = fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
          shoreWeight = 0.9 * (1 - smoothFade);
        }
        // Add noise for organic edges
        if (lakeDist > lakeConfig.radius * 0.5) {
          shoreWeight *= (1 + edgeNoise * 0.4);
        }
        shoreWeight = Math.max(0, Math.min(1, shoreWeight));
      }

      // Steeper slopes near water also get shore texture
      if (lakeDist < shoreEnd * 1.3 && slope > 0.25) {
        const slopeShore = slope * 0.6 * (1 - lakeDist / (shoreEnd * 1.3));
        shoreWeight = Math.max(shoreWeight, slopeShore);
      }

      // FOREST FLOOR: Under trees with smooth edges
      const rawForest = biome.forestDensity * (1 + edgeNoise * 0.3);
      // Smoothstep the forest density for softer transitions
      forestWeight = rawForest * rawForest * (3 - 2 * rawForest);
      // Reduce forest on steep slopes
      if (slope > 0.4) forestWeight *= (1 - (slope - 0.4) * 2);
      forestWeight = Math.max(0, Math.min(1, forestWeight));

      // Don't put forest floor too close to lake
      if (lakeDist < lakeConfig.radius + lakeConfig.shoreWidth) {
        forestWeight *= Math.max(0, (lakeDist - lakeConfig.radius) / lakeConfig.shoreWidth);
      }

      // GRASS: Everything else - smooth blend
      grassWeight = 1 - Math.max(shoreWeight * 0.9, forestWeight * 0.85);
      grassWeight = Math.max(0.05, grassWeight); // Always some grass showing through

      // Soft normalize - allow some overlap for smoother blending
      const total = shoreWeight + grassWeight + forestWeight;
      if (total > 0) {
        shoreWeight /= total;
        grassWeight /= total;
        forestWeight /= total;
      } else {
        grassWeight = 1;
      }

      splatPixels[pi] = Math.floor(shoreWeight * 255);
      splatPixels[pi + 1] = Math.floor(grassWeight * 255);
      splatPixels[pi + 2] = Math.floor(forestWeight * 255);
      splatPixels[pi + 3] = 255;
    }
  }

  // Apply blur to smooth transitions between biomes
  const blurRadius = 3;
  const blurredPixels = new Uint8ClampedArray(splatPixels.length);
  for (let py = 0; py < splatSize; py++) {
    for (let px = 0; px < splatSize; px++) {
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let dy = -blurRadius; dy <= blurRadius; dy++) {
        for (let dx = -blurRadius; dx <= blurRadius; dx++) {
          const sx = Math.max(0, Math.min(splatSize - 1, px + dx));
          const sy = Math.max(0, Math.min(splatSize - 1, py + dy));
          const si = (sy * splatSize + sx) * 4;
          rSum += splatPixels[si];
          gSum += splatPixels[si + 1];
          bSum += splatPixels[si + 2];
          count++;
        }
      }
      const di = (py * splatSize + px) * 4;
      blurredPixels[di] = Math.floor(rSum / count);
      blurredPixels[di + 1] = Math.floor(gSum / count);
      blurredPixels[di + 2] = Math.floor(bSum / count);
      blurredPixels[di + 3] = 255;
    }
  }
  // Copy blurred data back
  for (let i = 0; i < splatPixels.length; i++) {
    splatPixels[i] = blurredPixels[i];
  }

  splatCtx.putImageData(splatData, 0, 0);
  splatTex.update();

  // --- Generate Detail Textures ---
  const detailSize = 512;

  // LAKESHORE TEXTURE: Sandy beach with pebbles
  const lakeshoreTex = new DynamicTexture('lakeshoreTex', detailSize, scene, true);
  const lakeshoreCtx = lakeshoreTex.getContext() as CanvasRenderingContext2D;
  const lakeshoreData = lakeshoreCtx.createImageData(detailSize, detailSize);
  const lakeshorePixels = lakeshoreData.data;
  for (let ty = 0; ty < detailSize; ty++) {
    for (let tx = 0; tx < detailSize; tx++) {
      const ti = (ty * detailSize + tx) * 4;
      const n1 = texFbm(tx / 35, ty / 35, 4);
      const n2 = texFbm(tx / 10, ty / 10, 3);

      // Pebble detection
      const pebbleNoise = texFbm(tx / 7, ty / 7, 2, 50);
      const isPebble = pebbleNoise > 0.68;

      if (isPebble) {
        // Gray-brown pebbles
        const pebbleShade = 85 + n2 * 40;
        lakeshorePixels[ti] = pebbleShade + 5;
        lakeshorePixels[ti + 1] = pebbleShade;
        lakeshorePixels[ti + 2] = pebbleShade - 10;
      } else {
        // Darker muddy/dirt bank - not bright sand
        const base = 90 + n1 * 35 + n2 * 20;
        lakeshorePixels[ti] = base + 10;      // R - slight warmth
        lakeshorePixels[ti + 1] = base - 5;   // G
        lakeshorePixels[ti + 2] = base - 20;  // B - less blue
      }
      lakeshorePixels[ti + 3] = 255;
    }
  }
  lakeshoreCtx.putImageData(lakeshoreData, 0, 0);
  lakeshoreTex.update();
  lakeshoreTex.wrapU = Texture.WRAP_ADDRESSMODE;
  lakeshoreTex.wrapV = Texture.WRAP_ADDRESSMODE;

  // GRASS TEXTURE: Dark, rich grass
  const grassTex = new DynamicTexture('grassTex', detailSize, scene, true);
  const grassCtx = grassTex.getContext() as CanvasRenderingContext2D;
  const grassData = grassCtx.createImageData(detailSize, detailSize);
  const grassPixels = grassData.data;
  for (let ty = 0; ty < detailSize; ty++) {
    for (let tx = 0; tx < detailSize; tx++) {
      const ti = (ty * detailSize + tx) * 4;
      const n1 = texFbm(tx / 60, ty / 60, 4);
      const n2 = texFbm(tx / 15, ty / 15, 3);
      const n3 = texFbm(tx / 4, ty / 4, 2);
      const combined = n1 * 0.35 + n2 * 0.4 + n3 * 0.25;
      // Much darker grass - forest green
      grassPixels[ti] = 45 + combined * 30;       // R - darker
      grassPixels[ti + 1] = 85 + combined * 35;   // G - still green but darker
      grassPixels[ti + 2] = 35 + combined * 25;   // B - darker
      grassPixels[ti + 3] = 255;
    }
  }
  grassCtx.putImageData(grassData, 0, 0);
  grassTex.update();
  grassTex.wrapU = Texture.WRAP_ADDRESSMODE;
  grassTex.wrapV = Texture.WRAP_ADDRESSMODE;

  // FOREST FLOOR TEXTURE: Darker grass with subtle leaf litter
  const forestFloorTex = new DynamicTexture('forestFloorTex', detailSize, scene, true);
  const forestFloorCtx = forestFloorTex.getContext() as CanvasRenderingContext2D;
  const forestFloorData = forestFloorCtx.createImageData(detailSize, detailSize);
  const forestFloorPixels = forestFloorData.data;
  for (let ty = 0; ty < detailSize; ty++) {
    for (let tx = 0; tx < detailSize; tx++) {
      const ti = (ty * detailSize + tx) * 4;
      const n1 = texFbm(tx / 50, ty / 50, 4);
      const n2 = texFbm(tx / 15, ty / 15, 3);
      const n3 = texFbm(tx / 5, ty / 5, 2);
      const combined = n1 * 0.4 + n2 * 0.4 + n3 * 0.2;

      // Occasional leaf/debris spots
      const leafNoise = texFbm(tx / 10, ty / 10, 2, 75);
      const isDebris = leafNoise > 0.7;

      if (isDebris) {
        // Subtle brown debris
        const base = 50 + combined * 30;
        forestFloorPixels[ti] = base + 15;
        forestFloorPixels[ti + 1] = base + 5;
        forestFloorPixels[ti + 2] = base - 10;
      } else {
        // Dark forest grass/moss - darker than regular grass
        forestFloorPixels[ti] = 50 + combined * 35;      // R
        forestFloorPixels[ti + 1] = 85 + combined * 40;  // G - still green but darker
        forestFloorPixels[ti + 2] = 40 + combined * 30;  // B
      }
      forestFloorPixels[ti + 3] = 255;
    }
  }
  forestFloorCtx.putImageData(forestFloorData, 0, 0);
  forestFloorTex.update();
  forestFloorTex.wrapU = Texture.WRAP_ADDRESSMODE;
  forestFloorTex.wrapV = Texture.WRAP_ADDRESSMODE;

  // --- Create Terrain Material ---
  const terrainMat = new TerrainMaterial('terrainMat', scene);
  terrainMat.mixTexture = splatTex;
  terrainMat.specularColor = new Color3(0.1, 0.1, 0.1); // Low specular for matte look
  terrainMat.specularPower = 8;
  terrainMat.maxSimultaneousLights = 8; // Allow more lights for fire effects

  // Texture 1 (Red) - Riverbank with pebbles
  terrainMat.diffuseTexture1 = lakeshoreTex;
  terrainMat.diffuseTexture1.uScale = 70;
  terrainMat.diffuseTexture1.vScale = 70;

  // Texture 2 (Green) - Main grass
  terrainMat.diffuseTexture2 = grassTex;
  terrainMat.diffuseTexture2.uScale = 80;
  terrainMat.diffuseTexture2.vScale = 80;

  // Texture 3 (Blue) - Forest floor
  terrainMat.diffuseTexture3 = forestFloorTex;
  terrainMat.diffuseTexture3.uScale = 60;
  terrainMat.diffuseTexture3.vScale = 60;

  ground.material = terrainMat;
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

  // ===========================================
  // GOD RAYS (Volumetric Light Scattering)
  // ===========================================
  // Creates beautiful light shafts streaming from the sun through clouds
  const godRays = new VolumetricLightScatteringPostProcess(
    'godRays',
    1.0, // Ratio
    camera,
    sun, // Light source mesh
    100, // Samples (quality)
    Texture.BILINEAR_SAMPLINGMODE,
    engine,
    false // Use custom mesh (the sun)
  );

  // God rays settings for subtle, realistic effect
  godRays.exposure = 0.3; // Intensity of rays
  godRays.decay = 0.97; // How quickly rays fade
  godRays.weight = 0.5; // Overall strength
  godRays.density = 0.9; // Density of the effect

  // Make the sun mesh used for god rays slightly larger for better effect
  godRays.mesh.scaling = new Vector3(1.5, 1.5, 1.5);
  godRays.mesh.material = sunMat;

  // Clouds - fluffy low-poly style
  const clouds: Mesh[] = [];
  const cloudMat = new StandardMaterial('cloudMat', scene);
  cloudMat.diffuseColor = new Color3(1, 1, 1);
  cloudMat.emissiveColor = new Color3(0.9, 0.92, 0.98);
  cloudMat.alpha = 0.7;
  cloudMat.disableLighting = true;
  cloudMat.backFaceCulling = true; // Only render front faces
  cloudMat.needDepthPrePass = true; // Fixes transparency sorting issues
  cloudMat.separateCullingPass = true; // Better depth handling for overlapping transparent meshes

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

  // Spawn clouds - lower altitude so visible when zoomed out (tripled amount)
  for (let i = 0; i < 36; i++) {
    const x = (Math.random() - 0.5) * 700;
    const y = 40 + Math.random() * 40;
    const z = (Math.random() - 0.5) * 700;
    const scale = 0.35 + Math.random() * 0.55;
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
  // CLOUD SHADOWS (separate module)
  // ===========================================
  createCloudShadows(scene, groundSize, subdivisions, getTerrainHeight);

  // ===========================================
  // ENVIRONMENT: INSTANCED VEGETATION (High Performance)
  // ===========================================
  // Using Thin Instances for massive performance gains
  // Instead of 1000s of draw calls, we get ~10 draw calls total

  // Shared PBR materials (reused across all instances)
  // Using PBR for realistic lighting response with low-poly geometry

  // Tree trunk - rough bark with slight subsurface look
  const trunkMat = new PBRMaterial('trunkMat', scene);
  trunkMat.albedoColor = new Color3(0.35, 0.22, 0.12);
  trunkMat.metallic = 0.0;
  trunkMat.roughness = 0.95;
  trunkMat.ambientColor = new Color3(0.15, 0.1, 0.05);

  // Deciduous foliage - slightly translucent feel, very rough
  const foliageMat = new PBRMaterial('foliageMat', scene);
  foliageMat.albedoColor = new Color3(0.28, 0.48, 0.22);
  foliageMat.metallic = 0.0;
  foliageMat.roughness = 0.85;
  foliageMat.ambientColor = new Color3(0.1, 0.18, 0.08);

  // Pine foliage - darker, more matte
  const pineFoliageMat = new PBRMaterial('pineFoliageMat', scene);
  pineFoliageMat.albedoColor = new Color3(0.15, 0.32, 0.15);
  pineFoliageMat.metallic = 0.0;
  pineFoliageMat.roughness = 0.9;
  pineFoliageMat.ambientColor = new Color3(0.05, 0.12, 0.05);

  // Bush material - vibrant green
  const bushMat = new PBRMaterial('bushMat', scene);
  bushMat.albedoColor = new Color3(0.3, 0.45, 0.22);
  bushMat.metallic = 0.0;
  bushMat.roughness = 0.88;
  bushMat.ambientColor = new Color3(0.1, 0.15, 0.07);

  // Rock material 1 - gray granite
  const rockMat1 = new PBRMaterial('rockMat1', scene);
  rockMat1.albedoColor = new Color3(0.48, 0.46, 0.44);
  rockMat1.metallic = 0.05;
  rockMat1.roughness = 0.75;
  rockMat1.ambientColor = new Color3(0.15, 0.14, 0.13);

  // Rock material 2 - darker slate/basalt
  const rockMat2 = new PBRMaterial('rockMat2', scene);
  rockMat2.albedoColor = new Color3(0.35, 0.34, 0.36);
  rockMat2.metallic = 0.08;
  rockMat2.roughness = 0.7;
  rockMat2.ambientColor = new Color3(0.1, 0.1, 0.11);

  // Rock material 3 - brownish sandstone
  const rockMat3 = new PBRMaterial('rockMat3', scene);
  rockMat3.albedoColor = new Color3(0.52, 0.45, 0.38);
  rockMat3.metallic = 0.02;
  rockMat3.roughness = 0.85;
  rockMat3.ambientColor = new Color3(0.16, 0.14, 0.11);

  // ===========================================
  // DECIDUOUS TREE TEMPLATE (merged mesh with detailed canopy)
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

  // Create detailed canopy from multiple merged spheres (like clouds)
  // This creates an organic, fluffy tree shape while still being a single mesh for instancing
  const canopyPuffs: Mesh[] = [];

  // Main central mass
  const mainPuff = MeshBuilder.CreateSphere('puff0', { diameter: 3.2, segments: 6 }, scene);
  mainPuff.position = new Vector3(0, 0, 0);
  mainPuff.scaling = new Vector3(1, 0.85, 1);
  canopyPuffs.push(mainPuff);

  // Upper puffs - creates the rounded top
  const upperPuff1 = MeshBuilder.CreateSphere('puff1', { diameter: 2.5, segments: 5 }, scene);
  upperPuff1.position = new Vector3(0, 1.2, 0);
  canopyPuffs.push(upperPuff1);

  const upperPuff2 = MeshBuilder.CreateSphere('puff2', { diameter: 2.0, segments: 5 }, scene);
  upperPuff2.position = new Vector3(0.8, 1.0, 0.3);
  canopyPuffs.push(upperPuff2);

  const upperPuff3 = MeshBuilder.CreateSphere('puff3', { diameter: 1.8, segments: 5 }, scene);
  upperPuff3.position = new Vector3(-0.6, 1.1, -0.4);
  canopyPuffs.push(upperPuff3);

  // Side puffs - creates width and organic shape
  const sidePuff1 = MeshBuilder.CreateSphere('puff4', { diameter: 2.4, segments: 5 }, scene);
  sidePuff1.position = new Vector3(1.3, 0.2, 0);
  sidePuff1.scaling = new Vector3(1, 0.8, 0.9);
  canopyPuffs.push(sidePuff1);

  const sidePuff2 = MeshBuilder.CreateSphere('puff5', { diameter: 2.2, segments: 5 }, scene);
  sidePuff2.position = new Vector3(-1.2, 0.1, 0.3);
  sidePuff2.scaling = new Vector3(0.9, 0.85, 1);
  canopyPuffs.push(sidePuff2);

  const sidePuff3 = MeshBuilder.CreateSphere('puff6', { diameter: 2.3, segments: 5 }, scene);
  sidePuff3.position = new Vector3(0.2, 0, 1.2);
  sidePuff3.scaling = new Vector3(0.95, 0.8, 1);
  canopyPuffs.push(sidePuff3);

  const sidePuff4 = MeshBuilder.CreateSphere('puff7', { diameter: 2.1, segments: 5 }, scene);
  sidePuff4.position = new Vector3(-0.3, 0.15, -1.1);
  sidePuff4.scaling = new Vector3(1, 0.85, 0.9);
  canopyPuffs.push(sidePuff4);

  // Lower edge puffs - fills out the bottom silhouette
  const lowerPuff1 = MeshBuilder.CreateSphere('puff8', { diameter: 1.8, segments: 5 }, scene);
  lowerPuff1.position = new Vector3(0.9, -0.5, 0.8);
  canopyPuffs.push(lowerPuff1);

  const lowerPuff2 = MeshBuilder.CreateSphere('puff9', { diameter: 1.6, segments: 5 }, scene);
  lowerPuff2.position = new Vector3(-0.8, -0.4, -0.7);
  canopyPuffs.push(lowerPuff2);

  // Merge all puffs into single foliage mesh
  const treeFoliageTemplate = Mesh.MergeMeshes(canopyPuffs, true, true, undefined, false, true);
  if (treeFoliageTemplate) {
    treeFoliageTemplate.material = foliageMat;
    treeFoliageTemplate.isVisible = false;
  }

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
  // ROCK TEMPLATES (3 different shapes and colors)
  // ===========================================
  // Type 1: Icosahedron-based - rounded boulder (gray granite)
  const rockTemplate1 = MeshBuilder.CreatePolyhedron('rock1', { type: 1, size: 1 }, scene);
  rockTemplate1.bakeCurrentTransformIntoVertices();
  rockTemplate1.material = rockMat1;
  rockTemplate1.isVisible = false;

  // Type 2: Dodecahedron-based - more angular (dark slate)
  const rockTemplate2 = MeshBuilder.CreatePolyhedron('rock2', { type: 2, size: 1 }, scene);
  rockTemplate2.bakeCurrentTransformIntoVertices();
  rockTemplate2.material = rockMat2;
  rockTemplate2.isVisible = false;

  // Type 3: Octahedron-based - sharper/jagged (brownish sandstone)
  const rockTemplate3 = MeshBuilder.CreatePolyhedron('rock3', { type: 0, size: 1 }, scene);
  rockTemplate3.bakeCurrentTransformIntoVertices();
  rockTemplate3.material = rockMat3;
  rockTemplate3.isVisible = false;

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
  const lakeshoreRockPositions: InstanceData[] = [];

  // Helper to check lake distance - avoid placing things in water
  const isValidPosition = (x: number, z: number, minDistMultiplier: number) => {
    const lakeDist = getDistanceToLake(x, z);
    return lakeDist >= lakeConfig.radius + lakeConfig.shoreWidth * minDistMultiplier * 0.3;
  };

  // Helper to check minimum distance from existing trees (prevents overlapping)
  const minTreeSpacing = 1.5; // Minimum distance between tree trunks
  const isTooCloseToTree = (x: number, z: number): boolean => {
    // Check against all existing trees (both deciduous and pine)
    for (const tree of treePositions) {
      const dx = x - tree.x;
      const dz = z - tree.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minTreeSpacing * minTreeSpacing) return true;
    }
    for (const pine of pinePositions) {
      const dx = x - pine.x;
      const dz = z - pine.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < minTreeSpacing * minTreeSpacing) return true;
    }
    return false;
  };

  // --- BIOME-BASED VEGETATION PLACEMENT ---
  // Trees spawn in forest zones, type determined by biome

  // Random point sampling for forests - dense trees!
  for (let i = 0; i < 5000; i++) {
    const x = (Math.random() - 0.5) * groundSize * 0.95;
    const z = (Math.random() - 0.5) * groundSize * 0.95;

    const lakeDist = getDistanceToLake(x, z);
    if (lakeDist < lakeConfig.radius + lakeConfig.shoreWidth) continue;

    const biome = sampleBiome(x, z);

    // Trees in forest zones - higher spawn rate
    if (biome.forestDensity > 0.12 && Math.random() < biome.forestDensity * 0.9) {
      // Check spacing before placing
      if (isTooCloseToTree(x, z)) continue;

      const scale = 0.45 + Math.random() * 0.55;
      const rotY = Math.random() * Math.PI * 2;

      // More pines overall (40% base + biome ratio)
      const pineChance = 0.4 + biome.pineRatio * 0.4;
      if (Math.random() < pineChance) {
        pinePositions.push({ x, z, scale, rotY });
      } else {
        treePositions.push({ x, z, scale, rotY });
      }
    }
  }

  // Scattered lone trees in open grassland (sparse)
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() - 0.5) * groundSize * 0.9;
    const z = (Math.random() - 0.5) * groundSize * 0.9;
    const biome = sampleBiome(x, z);

    if (biome.forestDensity < 0.1 && isValidPosition(x, z, 2) && !isTooCloseToTree(x, z)) {
      const scale = 0.7 + Math.random() * 0.5;
      const rotY = Math.random() * Math.PI * 2;
      treePositions.push({ x, z, scale, rotY });
    }
  }

  // Bushes at forest edges
  for (let i = 0; i < 120; i++) {
    const x = (Math.random() - 0.5) * groundSize * 0.95;
    const z = (Math.random() - 0.5) * groundSize * 0.95;
    const biome = sampleBiome(x, z);

    // Forest edges: where density transitions
    if (biome.forestDensity > 0.1 && biome.forestDensity < 0.5 && isValidPosition(x, z, 1.5)) {
      bushPositions.push({
        x, z,
        scale: 0.4 + Math.random() * 0.7,
        rotY: Math.random() * Math.PI * 2
      });
    }
  }

  // Some bushes in open areas too
  for (let i = 0; i < 60; i++) {
    const x = (Math.random() - 0.5) * groundSize * 0.9;
    const z = (Math.random() - 0.5) * groundSize * 0.9;
    const biome = sampleBiome(x, z);

    if (biome.forestDensity < 0.2 && isValidPosition(x, z, 1)) {
      bushPositions.push({
        x, z,
        scale: 0.5 + Math.random() * 0.8,
        rotY: Math.random() * Math.PI * 2
      });
    }
  }

  // --- LAKESHORE ROCKS ---
  // Place rocks around the lakeshore
  for (let i = 0; i < 180; i++) {
    // Random angle around the lake
    const angle = Math.random() * Math.PI * 2;
    // Distance from lake center - on the shore
    const baseDist = lakeConfig.radius + Math.random() * lakeConfig.shoreWidth * 0.8;
    const x = lakeConfig.centerX + Math.cos(angle) * baseDist;
    const z = lakeConfig.centerZ + Math.sin(angle) * baseDist;

    const actualDist = getDistanceToLake(x, z);
    if (actualDist > lakeConfig.radius * 0.85 && actualDist < lakeConfig.radius + lakeConfig.shoreWidth) {
      lakeshoreRockPositions.push({
        x, z,
        scale: 0.25 + Math.random() * 0.6,
        rotY: Math.random() * Math.PI * 2
      });
    }
  }

  // --- LAKE BOTTOM ROCKS ---
  // Scatter rocks on the lake bed for realism
  for (let i = 0; i < 120; i++) {
    const angle = Math.random() * Math.PI * 2;
    // Mostly in the center and mid areas of the lake
    const dist = Math.random() * lakeConfig.radius * 0.85;
    const x = lakeConfig.centerX + Math.cos(angle) * dist;
    const z = lakeConfig.centerZ + Math.sin(angle) * dist;

    // Smaller rocks underwater
    lakeshoreRockPositions.push({
      x, z,
      scale: 0.15 + Math.random() * 0.4,
      rotY: Math.random() * Math.PI * 2
    });
  }

  // Regular rocks scattered elsewhere
  for (let i = 0; i < 80; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = lakeConfig.radius + lakeConfig.shoreWidth + 20 + Math.random() * 140;
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
  const treeFoliageColors = new Float32Array(treePositions.length * 4);
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

    // Color variation: darker greens with slight variation
    const colorVar = 0.7 + Math.random() * 0.25;
    const hueShift = (Math.random() - 0.5) * 0.08;
    treeFoliageColors[i * 4] = (0.18 + hueShift * 0.3) * colorVar;     // R - darker
    treeFoliageColors[i * 4 + 1] = (0.38 + hueShift) * colorVar;       // G - darker
    treeFoliageColors[i * 4 + 2] = (0.15 - hueShift * 0.2) * colorVar; // B - darker
    treeFoliageColors[i * 4 + 3] = 1.0;                                 // A
  });
  treeFoliageTemplate.isVisible = true;
  treeFoliageTemplate.thinInstanceSetBuffer('matrix', treeFoliageMatrices, 16);
  treeFoliageTemplate.thinInstanceSetBuffer('color', treeFoliageColors, 4);
  treeFoliageTemplate.receiveShadows = true;
  shadowGenerator.addShadowCaster(treeFoliageTemplate);
  // Enable per-instance colors
  (treeFoliageTemplate.material as PBRMaterial).albedoColor = new Color3(1, 1, 1);

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
    const pineFoliageColors = new Float32Array(pinePositions.length * 4);
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

      // Color variation: very dark greens with minimal variation
      const colorVar = 0.6 + Math.random() * 0.2;
      const hueShift = (Math.random() - 0.5) * 0.05;
      pineFoliageColors[i * 4] = (0.08 + hueShift * 0.2) * colorVar;     // R - very dark
      pineFoliageColors[i * 4 + 1] = (0.22 + hueShift) * colorVar;       // G - dark
      pineFoliageColors[i * 4 + 2] = (0.08 - hueShift * 0.1) * colorVar; // B - very dark
      pineFoliageColors[i * 4 + 3] = 1.0;                                 // A
    });
    pineFoliageTemplate.isVisible = true;
    pineFoliageTemplate.thinInstanceSetBuffer('matrix', pineFoliageMatrices, 16);
    pineFoliageTemplate.thinInstanceSetBuffer('color', pineFoliageColors, 4);
    pineFoliageTemplate.receiveShadows = true;
    shadowGenerator.addShadowCaster(pineFoliageTemplate);
    // Enable per-instance colors
    (pineFoliageTemplate.material as PBRMaterial).albedoColor = new Color3(1, 1, 1);
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

  // Rocks (partially embedded in ground) - combine regular + lakeshore rocks
  // Split among 3 rock types randomly
  const allRockPositions = [...rockPositions, ...lakeshoreRockPositions];

  // Separate positions into 3 groups randomly
  const rock1Positions: typeof allRockPositions = [];
  const rock2Positions: typeof allRockPositions = [];
  const rock3Positions: typeof allRockPositions = [];

  allRockPositions.forEach(pos => {
    const rand = Math.random();
    if (rand < 0.4) {
      rock1Positions.push(pos); // 40% gray granite
    } else if (rand < 0.7) {
      rock2Positions.push(pos); // 30% dark slate
    } else {
      rock3Positions.push(pos); // 30% brownish sandstone
    }
  });

  // Rock type 1 - gray granite (icosahedron)
  const rock1Matrices = new Float32Array(rock1Positions.length * 16);
  rock1Positions.forEach((pos, i) => {
    const terrainY = getTerrainHeight(pos.x, pos.z);
    const rockY = terrainY + pos.scale * 0.35;
    Matrix.ComposeToRef(
      new Vector3(pos.scale, pos.scale * 0.7, pos.scale),
      Quaternion.RotationAxis(Vector3.Up(), pos.rotY),
      new Vector3(pos.x, rockY, pos.z),
      tempMatrix
    );
    tempMatrix.copyToArray(rock1Matrices, i * 16);
  });
  rockTemplate1.isVisible = true;
  rockTemplate1.thinInstanceSetBuffer('matrix', rock1Matrices, 16);
  rockTemplate1.receiveShadows = true;
  shadowGenerator.addShadowCaster(rockTemplate1);

  // Rock type 2 - dark slate (dodecahedron)
  const rock2Matrices = new Float32Array(rock2Positions.length * 16);
  rock2Positions.forEach((pos, i) => {
    const terrainY = getTerrainHeight(pos.x, pos.z);
    const rockY = terrainY + pos.scale * 0.35;
    Matrix.ComposeToRef(
      new Vector3(pos.scale, pos.scale * 0.65, pos.scale), // Slightly flatter
      Quaternion.RotationAxis(Vector3.Up(), pos.rotY),
      new Vector3(pos.x, rockY, pos.z),
      tempMatrix
    );
    tempMatrix.copyToArray(rock2Matrices, i * 16);
  });
  rockTemplate2.isVisible = true;
  rockTemplate2.thinInstanceSetBuffer('matrix', rock2Matrices, 16);
  rockTemplate2.receiveShadows = true;
  shadowGenerator.addShadowCaster(rockTemplate2);

  // Rock type 3 - brownish sandstone (octahedron)
  const rock3Matrices = new Float32Array(rock3Positions.length * 16);
  rock3Positions.forEach((pos, i) => {
    const terrainY = getTerrainHeight(pos.x, pos.z);
    const rockY = terrainY + pos.scale * 0.4;
    Matrix.ComposeToRef(
      new Vector3(pos.scale * 0.9, pos.scale * 0.75, pos.scale * 0.9), // Slightly different proportions
      Quaternion.RotationAxis(Vector3.Up(), pos.rotY),
      new Vector3(pos.x, rockY, pos.z),
      tempMatrix
    );
    tempMatrix.copyToArray(rock3Matrices, i * 16);
  });
  rockTemplate3.isVisible = true;
  rockTemplate3.thinInstanceSetBuffer('matrix', rock3Matrices, 16);
  rockTemplate3.receiveShadows = true;
  shadowGenerator.addShadowCaster(rockTemplate3);

  // Freeze world matrices for static vegetation (major performance gain)
  treeTrunkTemplate.freezeWorldMatrix();
  treeFoliageTemplate.freezeWorldMatrix();
  pineTrunkTemplate.freezeWorldMatrix();
  pineFoliageTemplate?.freezeWorldMatrix();
  bushTemplate.freezeWorldMatrix();
  rockTemplate1.freezeWorldMatrix();
  rockTemplate2.freezeWorldMatrix();
  rockTemplate3.freezeWorldMatrix();
  ground.freezeWorldMatrix();

  // Log performance info
  const totalRocks = rockPositions.length + lakeshoreRockPositions.length;
  console.log(`[Performance] Vegetation instances: ${treePositions.length} trees, ${pinePositions.length} pines, ${bushPositions.length} bushes, ${totalRocks} rocks (${lakeshoreRockPositions.length} lakeshore)`);
  console.log(`[Performance] Draw calls reduced from ~${(treePositions.length * 7) + (pinePositions.length * 4) + (bushPositions.length * 4) + totalRocks} to ~6`);

  // ===========================================
  // LAKE WATER (separate module)
  // ===========================================
  const lakeSystem = createLake(scene, lakeConfig);

  // ===========================================
  // AMBIENT BIRDS
  // ===========================================
  let birdSystem: BirdSystem | null = null;

  // Initialize birds asynchronously (needs tree positions)
  createBirdSystem(scene, treePositions, pinePositions, lakeConfig)
    .then(system => {
      birdSystem = system;
      console.log('[Scene] Bird system ready');
    })
    .catch(err => {
      console.error('[Scene] Failed to initialize bird system:', err);
    });

  // ===========================================
  // AMBIENT SHEEP
  // ===========================================
  let sheepSystem: SheepSystem | null = null;

  // Terrain sampler for sheep (includes forest density for avoidance)
  const sheepTerrainSampler = {
    getHeight: (x: number, z: number) => getTerrainHeight(x, z),
    getForestDensity: (x: number, z: number) => sampleBiome(x, z).forestDensity,
  };

  // Initialize sheep asynchronously
  createSheepSystem(scene, lakeConfig, sheepTerrainSampler, shadowGenerator)
    .then(system => {
      sheepSystem = system;
      console.log('[Scene] Sheep system ready');
    })
    .catch(err => {
      console.error('[Scene] Failed to initialize sheep system:', err);
    });

  // ===========================================
  // AMBIENT FISH
  // ===========================================
  let fishSystem: FishSystem | null = null;

  // Initialize fish asynchronously
  createFishSystem(scene, lakeConfig)
    .then(system => {
      fishSystem = system;
      console.log('[Scene] Fish system ready');
    })
    .catch(err => {
      console.error('[Scene] Failed to initialize fish system:', err);
    });

  // Update lake, birds, sheep, and fish each frame
  let lastTime = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    const currentTime = performance.now();
    const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
    lastTime = currentTime;
    lakeSystem.update(deltaTime);
    birdSystem?.update(deltaTime);
    sheepSystem?.update(deltaTime);
    fishSystem?.update(deltaTime);
    settlementManager?.update(deltaTime);
  });

  // ===========================================
  // PROJECT SETTLEMENTS (Procedural Camps)
  // ===========================================
  // Settlement manager handles procedural camp generation
  // Assets are loaded asynchronously, settlements appear once ready
  let settlementManager: SettlementManager | null = null;
  let pendingProjects: Project[] = [];

  // Terrain sampler for settlements to conform to terrain
  const terrainSampler = {
    getHeight: (x: number, z: number) => getTerrainHeight(x, z),
  };

  // Initialize settlement manager asynchronously
  createSettlementManager(scene, terrainSampler, shadowGenerator, highlightLayer, glowLayer)
    .then(manager => {
      settlementManager = manager;
      console.log('[Scene] Settlement manager ready');

      // Process any projects that were queued while loading
      if (pendingProjects.length > 0) {
        manager.updateSettlements(pendingProjects);
        pendingProjects = [];
      }
    })
    .catch(err => {
      console.error('[Scene] Failed to initialize settlement manager:', err);
    });

  function updateProjects(projects: Project[]) {
    if (settlementManager?.isReady()) {
      settlementManager.updateSettlements(projects);
    } else {
      // Queue projects for when manager is ready
      pendingProjects = projects;
    }
  }

  function setSelectedSettlement(projectId: number | null) {
    settlementManager?.setSelected(projectId);
  }

  function focusProject(project: Project) {
    setSelectedSettlement(project.id);

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
    // Just deselect - don't move the camera
    setSelectedSettlement(null);
  }

  // ===========================================
  // PLACEMENT MODE
  // ===========================================
  const placementMode = {
    active: false,
    ghostNode: null as TransformNode | null,
    onPlace: null as ((x: number, z: number) => void) | null,
    onCancel: null as (() => void) | null,
    color: '#d4a574',
  };

  function startPlacementMode(_projectName: string, _color: string, onPlace: (x: number, z: number) => void, onCancel?: () => void) {
    cancelPlacementMode();

    placementMode.active = true;
    placementMode.onPlace = onPlace;
    placementMode.onCancel = onCancel || null;

    // Create ghost settlement preview (new camp)
    if (settlementManager?.isReady()) {
      placementMode.ghostNode = settlementManager.createGhostPreview(0);
    } else {
      // Fallback: simple marker if settlements not ready
      const ghostMesh = MeshBuilder.CreateCylinder('ghost-marker', {
        height: 4, diameterTop: 0.5, diameterBottom: 2, tessellation: 6,
      }, scene);
      const ghostMat = new StandardMaterial('ghostMat', scene);
      ghostMat.diffuseColor = Color3.FromHexString('#d4a574');
      ghostMat.alpha = 0.5;
      ghostMat.emissiveColor = Color3.FromHexString('#d4a574').scale(0.3);
      ghostMesh.material = ghostMat;
      ghostMesh.isPickable = false;

      const ghostNode = new TransformNode('ghost-fallback', scene);
      ghostMesh.parent = ghostNode;
      placementMode.ghostNode = ghostNode;
    }
  }

  function cancelPlacementMode(notifyCallback = false) {
    if (notifyCallback && placementMode.onCancel) {
      placementMode.onCancel();
    }
    placementMode.active = false;
    placementMode.onPlace = null;
    placementMode.onCancel = null;

    if (placementMode.ghostNode) {
      placementMode.ghostNode.getChildMeshes().forEach(m => m.dispose());
      placementMode.ghostNode.dispose();
      placementMode.ghostNode = null;
    }
  }

  // ===========================================
  // MOVE MODE (button-triggered)
  // ===========================================
  const moveMode = {
    active: false,
    projectId: null as number | null,
    ghostNode: null as TransformNode | null,
    onMove: null as ((x: number, z: number) => void) | null,
    onCancel: null as (() => void) | null,
    color: '#d4a574',
  };

  function startMoveMode(projectId: number, _color: string, onMove: (x: number, z: number) => void, onCancel?: () => void) {
    cancelMoveMode();

    moveMode.active = true;
    moveMode.projectId = projectId;
    moveMode.onMove = onMove;
    moveMode.onCancel = onCancel || null;

    // Hide the actual settlement temporarily
    settlementManager?.setVisibility(projectId, 0.3);

    // Create ghost settlement preview
    if (settlementManager?.isReady()) {
      // Get the current project's task count for appropriate preview
      const settlement = settlementManager.getSettlement(projectId);
      const taskCount = settlement ? 5 : 0; // Default to small camp if not found
      moveMode.ghostNode = settlementManager.createGhostPreview(taskCount);
    } else {
      // Fallback: simple marker
      const ghostMesh = MeshBuilder.CreateCylinder('move-ghost-marker', {
        height: 4, diameterTop: 0.5, diameterBottom: 2, tessellation: 6,
      }, scene);
      const ghostMat = new StandardMaterial('moveGhostMat', scene);
      ghostMat.diffuseColor = Color3.FromHexString('#d4a574');
      ghostMat.alpha = 0.7;
      ghostMat.emissiveColor = Color3.FromHexString('#d4a574').scale(0.3);
      ghostMesh.material = ghostMat;
      ghostMesh.isPickable = false;

      const ghostNode = new TransformNode('move-ghost-fallback', scene);
      ghostMesh.parent = ghostNode;
      moveMode.ghostNode = ghostNode;
    }
  }

  function cancelMoveMode(notifyCallback = false) {
    if (notifyCallback && moveMode.onCancel) {
      moveMode.onCancel();
    }

    // Restore settlement visibility
    if (moveMode.projectId !== null) {
      settlementManager?.setVisibility(moveMode.projectId, 1);
    }

    moveMode.active = false;
    moveMode.projectId = null;
    moveMode.onMove = null;
    moveMode.onCancel = null;

    if (moveMode.ghostNode) {
      moveMode.ghostNode.getChildMeshes().forEach(m => m.dispose());
      moveMode.ghostNode.dispose();
      moveMode.ghostNode = null;
    }
  }

  // ===========================================
  // POINTER HANDLING
  // ===========================================
  scene.onPointerObservable.add((pointerInfo: PointerInfo) => {
    const pickResult = scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh === ground);
    const groundPos = pickResult?.pickedPoint;

    // Update ghost position in placement mode (with terrain height)
    if (placementMode.active && groundPos && placementMode.ghostNode) {
      const terrainY = getTerrainHeight(groundPos.x, groundPos.z);
      placementMode.ghostNode.position.set(groundPos.x, terrainY, groundPos.z);
    }

    // Update ghost position in move mode (with terrain height)
    if (moveMode.active && groundPos && moveMode.ghostNode) {
      const terrainY = getTerrainHeight(groundPos.x, groundPos.z);
      moveMode.ghostNode.position.set(groundPos.x, terrainY, groundPos.z);
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

      // Check if clicking on a settlement - select it
      const pick = pointerInfo.pickInfo;
      if (pick?.hit && pick.pickedMesh?.metadata?.type === 'settlement') {
        const projectId = pick.pickedMesh.metadata.projectId;
        onProjectClick(projectId);
      } else if (groundPos) {
        // Clicked on ground (not a settlement) - deselect
        onProjectClick(null);
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
      birdSystem?.dispose();
      sheepSystem?.dispose();
      fishSystem?.dispose();
      settlementManager?.dispose();
      pipeline.dispose();
      glowLayer.dispose();
      highlightLayer.dispose();
      scene.dispose();
    },
  };
}
