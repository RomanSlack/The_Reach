import { useEffect, useRef } from 'react';
import { createEngine } from '../babylon/engine';
import { createReachScene, ReachScene } from '../babylon/scene';
import { useProjectStore } from '../stores/projectStore';

export function BabylonCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ReachScene | null>(null);
  const { projects, selectProject, selectedProjectId } = useProjectStore();

  useEffect(() => {
    if (!canvasRef.current) return;

    let engine: Awaited<ReturnType<typeof createEngine>> | null = null;

    async function init() {
      engine = await createEngine(canvasRef.current!);
      const reachScene = createReachScene(engine, (projectId) => {
        selectProject(projectId);
      });
      sceneRef.current = reachScene;

      engine.runRenderLoop(() => {
        reachScene.scene.render();
      });

      window.addEventListener('resize', () => engine?.resize());
    }

    init();

    return () => {
      sceneRef.current?.dispose();
      engine?.dispose();
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

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full outline-none"
    />
  );
}
