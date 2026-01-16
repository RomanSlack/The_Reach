import { useEffect, useRef } from 'react';
import { createEngine } from '../babylon/engine';
import { createReachScene } from '../babylon/scene';
import type { ReachScene } from '../babylon/scene';
import { useProjectStore } from '../stores/projectStore';
import type { Engine } from '@babylonjs/core';

export function BabylonCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<ReachScene | null>(null);
  const initRef = useRef(false);

  const {
    projects,
    selectProject,
    selectedProjectId,
    placementMode,
    confirmPlacement,
    cancelPlacement,
    moveMode,
    confirmMove,
    cancelMoveMode,
    moveProject,
  } = useProjectStore();

  useEffect(() => {
    if (!canvasRef.current || initRef.current) return;
    initRef.current = true;

    async function init() {
      const engine = await createEngine(canvasRef.current!);
      engineRef.current = engine;

      const reachScene = createReachScene(
        engine,
        (projectId) => selectProject(projectId),
        (projectId, x, z) => moveProject(projectId, x, z)
      );
      sceneRef.current = reachScene;

      engine.runRenderLoop(() => {
        reachScene.scene.render();
      });

      const handleResize = () => engine.resize();
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }

    init();

    return () => {
      sceneRef.current?.dispose();
      engineRef.current?.dispose();
      sceneRef.current = null;
      engineRef.current = null;
    };
  }, []);

  // Update islands when projects change
  useEffect(() => {
    sceneRef.current?.updateProjects(projects);
  }, [projects]);

  // Focus on selected project
  useEffect(() => {
    if (selectedProjectId !== null) {
      const project = projects.find(p => p.id === selectedProjectId);
      if (project) {
        sceneRef.current?.focusProject(project);
      }
    } else {
      sceneRef.current?.resetCamera();
    }
  }, [selectedProjectId, projects]);

  // Handle placement mode
  useEffect(() => {
    if (placementMode.active) {
      sceneRef.current?.startPlacementMode(
        placementMode.name,
        placementMode.color,
        (x, z) => confirmPlacement(x, z),
        () => cancelPlacement()
      );
    } else {
      sceneRef.current?.cancelPlacementMode();
    }
  }, [placementMode.active, placementMode.name, placementMode.color, confirmPlacement, cancelPlacement]);

  // Handle move mode
  useEffect(() => {
    if (moveMode.active && moveMode.projectId !== null) {
      const project = projects.find(p => p.id === moveMode.projectId);
      if (project) {
        sceneRef.current?.startMoveMode(
          project.id,
          project.color,
          (x, z) => confirmMove(x, z),
          () => cancelMoveMode()
        );
      }
    } else {
      sceneRef.current?.cancelMoveMode();
    }
  }, [moveMode.active, moveMode.projectId, projects, confirmMove, cancelMoveMode]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full outline-none"
    />
  );
}
