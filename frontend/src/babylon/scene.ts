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
// GrassProceduralTexture removed - using custom noise-based texture instead
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

  // WASD Panning - smooth velocity-based movement
  const maxPanSpeed = 1.2;        // Maximum movement speed
  const acceleration = 0.08;      // How quickly we reach max speed
  const deceleration = 0.12;      // How quickly we slow down (slightly faster than accel for responsiveness)
  const keysPressed: { [key: string]: boolean } = {};
  let velocity = Vector3.Zero();  // Current movement velocity

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
  shadowGenerator.bias = 0.001;
  shadowGenerator.normalBias = 0.02;
  shadowGenerator.setDarkness(0.4); // Not too dark

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

  // Grass material with custom non-repeating shader
  const grassMat = new PBRMaterial('grassMat', scene);
  grassMat.metallic = 0;
  grassMat.roughness = 0.95;

  // Create a large procedural texture using noise for seamless, non-repetitive grass
  const grassNoiseTexture = new DynamicTexture('grassNoise', 2048, scene, true);
  const grassCtx = grassNoiseTexture.getContext() as CanvasRenderingContext2D;

  // Noise function for texture generation
  const noise2D = (x: number, y: number, seed: number = 0): number => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
    return n - Math.floor(n);
  };

  // Fractal noise for natural variation
  const fbmNoise = (x: number, y: number, octaves: number = 6): number => {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      // Smoother interpolated noise
      const ix = Math.floor(x * frequency);
      const iy = Math.floor(y * frequency);
      const fx = x * frequency - ix;
      const fy = y * frequency - iy;
      const smoothFx = fx * fx * (3 - 2 * fx);
      const smoothFy = fy * fy * (3 - 2 * fy);

      const n00 = noise2D(ix, iy, i);
      const n10 = noise2D(ix + 1, iy, i);
      const n01 = noise2D(ix, iy + 1, i);
      const n11 = noise2D(ix + 1, iy + 1, i);

      const nx0 = n00 + smoothFx * (n10 - n00);
      const nx1 = n01 + smoothFx * (n11 - n01);
      const n = nx0 + smoothFy * (nx1 - nx0);

      value += n * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return value / maxValue;
  };

  // Generate the grass texture with varied colors
  const imageData = grassCtx.createImageData(2048, 2048);
  const data = imageData.data;

  // Base grass colors
  const grassColors = [
    { r: 95, g: 130, b: 70 },   // Dark grass
    { r: 110, g: 150, b: 85 },  // Medium grass
    { r: 125, g: 165, b: 95 },  // Light grass
    { r: 100, g: 140, b: 75 },  // Variation
  ];

  for (let y = 0; y < 2048; y++) {
    for (let x = 0; x < 2048; x++) {
      const idx = (y * 2048 + x) * 4;

      // Large scale variation (patches of different grass)
      const largeNoise = fbmNoise(x / 300, y / 300, 4);
      // Medium scale variation
      const medNoise = fbmNoise(x / 50, y / 50, 4);
      // Fine detail - higher frequency for sharper look
      const fineNoise = fbmNoise(x / 8, y / 8, 3);
      // Extra fine detail for texture
      const microNoise = fbmNoise(x / 3, y / 3, 2);

      // Combine noise layers - more weight on fine details
      const combined = largeNoise * 0.35 + medNoise * 0.35 + fineNoise * 0.2 + microNoise * 0.1;

      // Select color based on noise
      const colorIdx = Math.floor(combined * grassColors.length) % grassColors.length;
      const nextColorIdx = (colorIdx + 1) % grassColors.length;
      const blend = (combined * grassColors.length) % 1;

      const c1 = grassColors[colorIdx];
      const c2 = grassColors[nextColorIdx];

      // Smooth blend between colors
      let r = c1.r + blend * (c2.r - c1.r);
      let g = c1.g + blend * (c2.g - c1.g);
      let b = c1.b + blend * (c2.b - c1.b);

      // Add fine detail variation - stronger effect
      const detail = (fineNoise - 0.5) * 35 + (microNoise - 0.5) * 15;
      r = Math.max(0, Math.min(255, r + detail));
      g = Math.max(0, Math.min(255, g + detail));
      b = Math.max(0, Math.min(255, b + detail));

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  grassCtx.putImageData(imageData, 0, 0);
  grassNoiseTexture.update();

  // Higher UV scale for sharper, more detailed appearance
  (grassNoiseTexture as Texture).uScale = 25;
  (grassNoiseTexture as Texture).vScale = 25;
  (grassNoiseTexture as Texture).wrapU = Texture.WRAP_ADDRESSMODE;
  (grassNoiseTexture as Texture).wrapV = Texture.WRAP_ADDRESSMODE;
  grassMat.albedoTexture = grassNoiseTexture;
  grassMat.albedoColor = new Color3(1.0, 1.0, 1.0); // Let texture define color

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
  // ROLLING CLOUD SHADOWS (Ground Plane Method)
  // ===========================================
  // Matches terrain resolution, uses billow noise for realistic cloud shapes

  // Generate a tileable cloud shadow texture once
  const cloudShadowTexSize = 1024; // Higher res for better detail
  const cloudShadowTex = new DynamicTexture('cloudShadowTex', cloudShadowTexSize, scene, false);
  const shadowCtx = cloudShadowTex.getContext() as CanvasRenderingContext2D;

  // Hash function for deterministic randomness
  const cloudHash2 = (ix: number, iy: number): number => {
    // Better hash for more uniform distribution
    let n = ix * 374761393 + iy * 668265263;
    n = (n ^ (n >> 13)) * 1274126177;
    return (n ^ (n >> 16)) / 4294967296 + 0.5;
  };

  // Worley (cellular) noise - returns distance to nearest cell point
  const worleyNoise2D = (x: number, y: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let minDist = 1.0;

    // Check 3x3 grid of cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cellX = ix + dx;
        const cellY = iy + dy;
        // Random point position within cell
        const px = cellX + cloudHash2(cellX, cellY);
        const py = cellY + cloudHash2(cellY + 100, cellX + 100);
        // Distance to this cell's point
        const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
        minDist = Math.min(minDist, dist);
      }
    }
    return minDist;
  };

  // Perlin-style smooth noise
  const perlinNoise2D = (x: number, y: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    // Smoothstep interpolation
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const n00 = cloudHash2(ix, iy);
    const n10 = cloudHash2(ix + 1, iy);
    const n01 = cloudHash2(ix, iy + 1);
    const n11 = cloudHash2(ix + 1, iy + 1);
    return n00 * (1 - sx) * (1 - sy) + n10 * sx * (1 - sy) +
           n01 * (1 - sx) * sy + n11 * sx * sy;
  };

  // FBM (Fractal Brownian Motion) for Perlin
  const perlinFbm = (x: number, y: number, octaves: number): number => {
    let value = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      value += perlinNoise2D(x * freq, y * freq) * amp;
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return value / max;
  };

  // FBM for Worley (inverted for puffy blobs)
  const worleyFbm = (x: number, y: number, octaves: number): number => {
    let value = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      // Invert worley: 1 - distance creates blobs instead of cells
      value += (1 - worleyNoise2D(x * freq, y * freq)) * amp;
      max += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return value / max;
  };

  // Remap function (key to distinct cloud shapes)
  const remap = (value: number, inMin: number, inMax: number, outMin: number, outMax: number): number => {
    return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
  };

  // Generate tileable cloud texture
  const cloudImgData = shadowCtx.createImageData(cloudShadowTexSize, cloudShadowTexSize);
  const cloudPixels = cloudImgData.data;

  for (let cy = 0; cy < cloudShadowTexSize; cy++) {
    for (let cx = 0; cx < cloudShadowTexSize; cx++) {
      const ci = (cy * cloudShadowTexSize + cx) * 4;

      // Seamless tiling using torus mapping
      const tx = cx / cloudShadowTexSize;
      const ty = cy / cloudShadowTexSize;
      const angle1 = tx * Math.PI * 2;
      const angle2 = ty * Math.PI * 2;

      // Map to torus for seamless tiling
      const scale = 4;
      const nx = (Math.cos(angle1) + 1) * scale;
      const ny = (Math.sin(angle1) + 1) * scale;
      const nz = (Math.cos(angle2) + 1) * scale;
      const nw = (Math.sin(angle2) + 1) * scale;

      const sampleX = nx + nz * 0.7;
      const sampleY = ny + nw * 0.7;

      // Perlin-Worley combination (industry standard for clouds)
      // Perlin provides connectivity, inverted Worley provides puffy billows
      const perlin = perlinFbm(sampleX, sampleY, 4);
      const worley = worleyFbm(sampleX * 0.8, sampleY * 0.8, 3);

      // Combine: use perlin as base, worley adds billowy character
      // The remap erodes the perlin using worley for puffy edges
      const perlinWorley = remap(perlin, worley * 0.4, 1.0, 0.0, 1.0);
      const cloudBase = Math.max(0, Math.min(1, perlinWorley));

      // Coverage threshold - controls how much of sky has clouds
      const coverage = 0.45;
      let cloudDensity = remap(cloudBase, coverage, 1.0, 0.0, 1.0);
      cloudDensity = Math.max(0, Math.min(1, cloudDensity));

      // Smooth the edges
      cloudDensity = cloudDensity * cloudDensity * (3 - 2 * cloudDensity);

      // Final shadow intensity
      const shadowStrength = cloudDensity * 0.4;

      // Dark texture with alpha for shadow overlay
      cloudPixels[ci] = 0;
      cloudPixels[ci + 1] = 0;
      cloudPixels[ci + 2] = 5;
      cloudPixels[ci + 3] = shadowStrength * 255;
    }
  }
  shadowCtx.putImageData(cloudImgData, 0, 0);
  cloudShadowTex.update();

  // Create shadow plane matching terrain exactly
  const cloudShadowPlane = MeshBuilder.CreateGround('cloudShadowPlane', {
    width: groundSize,        // Match terrain size (400)
    height: groundSize,
    subdivisions: subdivisions, // Match terrain subdivisions (300)
    updatable: true
  }, scene);

  // Conform shadow plane to terrain height
  const shadowPositions = cloudShadowPlane.getVerticesData('position');
  if (shadowPositions) {
    for (let si = 0; si < shadowPositions.length; si += 3) {
      const sx = shadowPositions[si];
      const sz = shadowPositions[si + 2];
      shadowPositions[si + 1] = getTerrainHeight(sx, sz) + 0.15; // Just above terrain
    }
    cloudShadowPlane.updateVerticesData('position', shadowPositions);
  }

  // Material with alpha blending for shadow overlay
  const cloudShadowMat = new StandardMaterial('cloudShadowMat', scene);
  cloudShadowMat.diffuseTexture = cloudShadowTex;
  cloudShadowMat.diffuseTexture.hasAlpha = true;
  cloudShadowMat.diffuseTexture.wrapU = Texture.WRAP_ADDRESSMODE;
  cloudShadowMat.diffuseTexture.wrapV = Texture.WRAP_ADDRESSMODE;
  (cloudShadowMat.diffuseTexture as Texture).uScale = 0.6; // Large clouds
  (cloudShadowMat.diffuseTexture as Texture).vScale = 0.6;
  cloudShadowMat.useAlphaFromDiffuseTexture = true;
  cloudShadowMat.diffuseColor = new Color3(0, 0, 0);
  cloudShadowMat.specularColor = new Color3(0, 0, 0);
  cloudShadowMat.emissiveColor = new Color3(0, 0, 0);
  cloudShadowMat.disableLighting = true;
  cloudShadowMat.backFaceCulling = true;
  cloudShadowPlane.material = cloudShadowMat;

  // Don't receive shadows or interfere with picking
  cloudShadowPlane.receiveShadows = false;
  cloudShadowPlane.isPickable = false;

  // Animate UV offset for rolling shadows (very slow drift)
  scene.onBeforeRenderObservable.add(() => {
    const time = performance.now() * 0.000002; // Slow majestic drift
    (cloudShadowMat.diffuseTexture as Texture).uOffset = time;
    (cloudShadowMat.diffuseTexture as Texture).vOffset = time * 0.3;
  });

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

  // Rock material - slightly reflective minerals
  const rockMat = new PBRMaterial('rockMat', scene);
  rockMat.albedoColor = new Color3(0.48, 0.46, 0.44);
  rockMat.metallic = 0.05;
  rockMat.roughness = 0.75;
  rockMat.ambientColor = new Color3(0.15, 0.14, 0.13);

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
  // River water surface - flat across width (water finds its level)
  // but follows the riverbed depth along its length

  const riverWidthFactor = 0.8; // How much of the carved width to fill with water
  const waterFillLevel = 0.7; // How full the river is (0-1, where 1 = full to banks)

  // Calculate water level at each point along the river center
  // Water is FLAT across width at each point, but follows river depth along length
  const riverWaterLevels = riverPath.map(p => {
    // Get the deepest point (river center)
    const centerDepth = getTerrainHeight(p.x, p.z);
    // Get the bank height (edge of river)
    const bankHeight = getTerrainHeight(p.x, p.z + riverConfig.width);
    // Water level is between riverbed and bank, based on fill level
    return centerDepth + (bankHeight - centerDepth) * waterFillLevel;
  });

  // Create two edge paths with FLAT water surface across width
  const leftBank = riverPath.map((p, i) =>
    new Vector3(p.x, riverWaterLevels[i], p.z - riverConfig.width * riverWidthFactor)
  );
  const rightBank = riverPath.map((p, i) =>
    new Vector3(p.x, riverWaterLevels[i], p.z + riverConfig.width * riverWidthFactor)
  );

  const river = MeshBuilder.CreateRibbon('river', {
    pathArray: [leftBank, rightBank],
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);

  // Offset slightly down to prevent z-fighting with terrain
  river.position.y = -0.05;

  // Simple flowing water with visible animation
  const riverMat = new StandardMaterial('riverMat', scene);

  // Water color - semi-transparent blue
  riverMat.diffuseColor = new Color3(0.3, 0.5, 0.6);
  riverMat.specularColor = new Color3(0.6, 0.7, 0.8);
  riverMat.specularPower = 64;
  riverMat.alpha = 0.65;
  riverMat.backFaceCulling = false;

  // Create simple flow texture with visible streaks
  const waterTexSize = 256;
  const waterTexture = new DynamicTexture('waterTex', waterTexSize, scene, false);
  const waterCtx = waterTexture.getContext() as CanvasRenderingContext2D;

  // Light blue-green base
  waterCtx.fillStyle = '#5a9ab0';
  waterCtx.fillRect(0, 0, waterTexSize, waterTexSize);

  // Flow lines - white/light streaks going horizontally
  for (let i = 0; i < 60; i++) {
    const y = Math.random() * waterTexSize;
    const x = Math.random() * waterTexSize;
    const length = 20 + Math.random() * 60;

    const gradient = waterCtx.createLinearGradient(x, y, x + length, y);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.3, 'rgba(200, 230, 245, 0.4)');
    gradient.addColorStop(0.7, 'rgba(200, 230, 245, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    waterCtx.strokeStyle = gradient;
    waterCtx.lineWidth = 1 + Math.random() * 2;
    waterCtx.beginPath();
    waterCtx.moveTo(x, y);
    waterCtx.lineTo(x + length, y + (Math.random() - 0.5) * 4);
    waterCtx.stroke();
  }

  // Small highlight spots
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * waterTexSize;
    const y = Math.random() * waterTexSize;
    waterCtx.fillStyle = `rgba(220, 240, 255, ${0.2 + Math.random() * 0.2})`;
    waterCtx.beginPath();
    waterCtx.arc(x, y, 1 + Math.random() * 3, 0, Math.PI * 2);
    waterCtx.fill();
  }

  waterTexture.update();

  riverMat.diffuseTexture = waterTexture;
  (riverMat.diffuseTexture as Texture).uScale = 10;
  (riverMat.diffuseTexture as Texture).vScale = 4;
  (riverMat.diffuseTexture as Texture).wrapU = Texture.WRAP_ADDRESSMODE;
  (riverMat.diffuseTexture as Texture).wrapV = Texture.WRAP_ADDRESSMODE;

  // Slight emissive for that water glow
  riverMat.emissiveColor = new Color3(0.05, 0.1, 0.12);

  river.material = riverMat;

  // Animate water flow - slow and steady
  let waterOffset = 0;
  scene.onBeforeRenderObservable.add(() => {
    waterOffset += 0.002; // Slow flow speed
    if (riverMat.diffuseTexture) {
      (riverMat.diffuseTexture as Texture).uOffset = waterOffset;
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
