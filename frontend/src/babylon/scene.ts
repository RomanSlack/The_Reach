import {
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Engine,
  PointerEventTypes,
  Animation,
  Mesh,
  GlowLayer,
  PointLight,
} from '@babylonjs/core';
import { Project } from '../api/client';

export interface ReachScene {
  scene: Scene;
  updateProjects: (projects: Project[]) => void;
  focusProject: (project: Project) => void;
  resetCamera: () => void;
  dispose: () => void;
}

export function createReachScene(
  engine: Engine,
  onProjectClick: (projectId: number) => void
): ReachScene {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.04, 0.04, 0.06, 1);

  // Camera
  const camera = new ArcRotateCamera(
    'camera',
    -Math.PI / 2,
    Math.PI / 3,
    30,
    Vector3.Zero(),
    scene
  );
  camera.lowerRadiusLimit = 10;
  camera.upperRadiusLimit = 100;
  camera.wheelPrecision = 20;
  camera.attachControl(engine.getRenderingCanvas(), true);

  // Lighting
  const ambientLight = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambientLight.intensity = 0.4;
  ambientLight.groundColor = new Color3(0.1, 0.1, 0.2);

  const keyLight = new PointLight('key', new Vector3(10, 20, 10), scene);
  keyLight.intensity = 0.8;

  // Glow layer for that sci-fi feel
  const glowLayer = new GlowLayer('glow', scene);
  glowLayer.intensity = 0.5;

  // Ground plane (void/space aesthetic)
  const ground = MeshBuilder.CreateGround('ground', { width: 200, height: 200 }, scene);
  const groundMat = new StandardMaterial('groundMat', scene);
  groundMat.diffuseColor = new Color3(0.02, 0.02, 0.04);
  groundMat.specularColor = new Color3(0, 0, 0);
  ground.material = groundMat;
  ground.position.y = -0.5;

  // Grid lines on ground
  const gridLines = MeshBuilder.CreateLineSystem('grid', {
    lines: createGridLines(200, 10),
  }, scene);
  gridLines.color = new Color3(0.1, 0.15, 0.2);
  gridLines.alpha = 0.3;

  // Project islands storage
  const islandMeshes = new Map<number, Mesh>();

  function createGridLines(size: number, spacing: number): Vector3[][] {
    const lines: Vector3[][] = [];
    const half = size / 2;
    for (let i = -half; i <= half; i += spacing) {
      lines.push([new Vector3(i, -0.4, -half), new Vector3(i, -0.4, half)]);
      lines.push([new Vector3(-half, -0.4, i), new Vector3(half, -0.4, i)]);
    }
    return lines;
  }

  function createIsland(project: Project): Mesh {
    // Main platform
    const island = MeshBuilder.CreateCylinder(`island-${project.id}`, {
      height: 1.5,
      diameterTop: 6,
      diameterBottom: 7,
      tessellation: 32,
    }, scene);

    const mat = new StandardMaterial(`mat-${project.id}`, scene);
    const color = Color3.FromHexString(project.color);
    mat.diffuseColor = color;
    mat.specularColor = new Color3(0.3, 0.3, 0.3);
    mat.emissiveColor = color.scale(0.2);
    island.material = mat;

    island.position = new Vector3(project.position_x, 0, project.position_z);
    island.metadata = { projectId: project.id };

    // Central spire/beacon
    const spire = MeshBuilder.CreateCylinder(`spire-${project.id}`, {
      height: 3,
      diameterTop: 0.2,
      diameterBottom: 0.8,
    }, scene);
    const spireMat = new StandardMaterial(`spireMat-${project.id}`, scene);
    spireMat.emissiveColor = color;
    spire.material = spireMat;
    spire.position.y = 2;
    spire.parent = island;

    // Add to glow
    glowLayer.addIncludedOnlyMesh(spire);

    return island;
  }

  function updateProjects(projects: Project[]) {
    // Remove old islands
    const currentIds = new Set(projects.map(p => p.id));
    islandMeshes.forEach((mesh, id) => {
      if (!currentIds.has(id)) {
        mesh.dispose();
        islandMeshes.delete(id);
      }
    });

    // Add/update islands
    projects.forEach(project => {
      if (!islandMeshes.has(project.id)) {
        const island = createIsland(project);
        islandMeshes.set(project.id, island);
      }
    });
  }

  function focusProject(project: Project) {
    const targetPosition = new Vector3(project.position_x, 0, project.position_z);

    Animation.CreateAndStartAnimation(
      'cameraMove',
      camera,
      'target',
      60,
      30,
      camera.target,
      targetPosition,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    Animation.CreateAndStartAnimation(
      'cameraZoom',
      camera,
      'radius',
      60,
      30,
      camera.radius,
      15,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
  }

  function resetCamera() {
    Animation.CreateAndStartAnimation(
      'cameraReset',
      camera,
      'target',
      60,
      30,
      camera.target,
      Vector3.Zero(),
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );

    Animation.CreateAndStartAnimation(
      'cameraZoomOut',
      camera,
      'radius',
      60,
      30,
      camera.radius,
      30,
      Animation.ANIMATIONLOOPMODE_CONSTANT
    );
  }

  // Click detection
  scene.onPointerObservable.add((pointerInfo) => {
    if (pointerInfo.type === PointerEventTypes.POINTERPICK && pointerInfo.pickInfo?.hit) {
      const mesh = pointerInfo.pickInfo.pickedMesh;
      if (mesh?.metadata?.projectId) {
        onProjectClick(mesh.metadata.projectId);
      }
    }
  });

  return {
    scene,
    updateProjects,
    focusProject,
    resetCamera,
    dispose: () => scene.dispose(),
  };
}
