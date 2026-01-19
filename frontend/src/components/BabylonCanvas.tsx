import { useEffect, useRef, useState, useCallback } from 'react';
import { createEngine } from '../babylon/engine';
import { createReachScene } from '../babylon/scene';
import type { ReachScene } from '../babylon/scene';
import { useProjectStore } from '../stores/projectStore';
import type { Engine, Scene } from '@babylonjs/core';
import { DebugOverlay } from './DebugOverlay';
import { DayNightToggle } from './DayNightToggle';

export function BabylonCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const sceneRef = useRef<ReachScene | null>(null);
  const initRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [targetProgress, setTargetProgress] = useState(10); // Start with initial target so bar moves immediately
  const [displayProgress, setDisplayProgress] = useState(0);
  const [showOverlay, setShowOverlay] = useState(true);
  const [debugScene, setDebugScene] = useState<Scene | null>(null);

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

  // Animate progress bar smoothly toward target
  useEffect(() => {
    if (displayProgress >= targetProgress) return;

    const interval = setInterval(() => {
      setDisplayProgress(prev => {
        // Calculate how much to increment (faster when further from target)
        const remaining = targetProgress - prev;
        const increment = Math.max(0.5, remaining * 0.08);
        const next = prev + increment;

        // Stop just short of target to wait for next real milestone
        if (next >= targetProgress - 1) {
          clearInterval(interval);
          return targetProgress;
        }
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [targetProgress, displayProgress]);

  useEffect(() => {
    if (!canvasRef.current || initRef.current) return;
    initRef.current = true;

    async function init() {
      // Simulate initial progress for engine creation
      setTargetProgress(10);

      const engine = await createEngine(canvasRef.current!);
      engineRef.current = engine;
      setTargetProgress(30);

      const reachScene = createReachScene(
        engine,
        (projectId) => selectProject(projectId),
        (projectId, x, z) => moveProject(projectId, x, z)
      );
      sceneRef.current = reachScene;
      setTargetProgress(70);

      // Wait for scene to be ready
      await reachScene.scene.whenReadyAsync();
      setTargetProgress(90);
      setDebugScene(reachScene.scene);

      engine.runRenderLoop(() => {
        reachScene.scene.render();
      });

      // Small delay to ensure first frame renders
      await new Promise(resolve => setTimeout(resolve, 200));
      setTargetProgress(100);

      // First fade out the loading content
      setTimeout(() => setLoading(false), 400);
      // Then fade out the white overlay to reveal scene
      setTimeout(() => setShowOverlay(false), 900);

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

  // Handle day/night toggle
  const handleNightModeToggle = useCallback((isNight: boolean) => {
    sceneRef.current?.setNightMode(isNight);
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full outline-none"
      />

      {/* White overlay that fades out to reveal scene */}
      {showOverlay && (
        <div
          className={`absolute inset-0 z-50 bg-[#faf9f7] transition-opacity duration-700 ease-out ${
            !loading ? 'opacity-0' : 'opacity-100'
          }`}
        />
      )}

      {/* Loading Content */}
      {loading && (
        <div
          className={`absolute inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-300 ${
            displayProgress >= 100 ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <div className="flex flex-col items-center gap-6">
            {/* Logo */}
            <img
              src="/the_reach_logo_v2_transparent_bg.png"
              alt="The Reach"
              className="w-24 h-24 object-contain"
            />

            {/* Title */}
            <h1
              className="text-3xl font-semibold text-[#1a1a1a] tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              The Reach
            </h1>

            {/* Progress Bar */}
            <div className="w-48 h-1.5 bg-[#e8e4df] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#d4a574] to-[#c9976a] rounded-full transition-[width] duration-500 ease-out"
                style={{ width: `${displayProgress}%` }}
              />
            </div>

            {/* Loading Text */}
            <p className="text-sm text-[#8a857f]">
              {displayProgress < 30 ? 'Initializing...' : displayProgress < 70 ? 'Creating world...' : displayProgress < 100 ? 'Almost ready...' : 'Ready!'}
            </p>
          </div>
        </div>
      )}

      {/* Debug Overlay - FPS and metrics */}
      {!loading && <DebugOverlay scene={debugScene} />}

      {/* Day/Night Toggle */}
      {!loading && <DayNightToggle onToggle={handleNightModeToggle} />}
    </>
  );
}
