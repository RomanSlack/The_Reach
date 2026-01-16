import { create } from 'zustand';
import { api } from '../api/client';
import type { Project, Task } from '../api/client';

interface ProjectStore {
  projects: Project[];
  selectedProjectId: number | null;
  tasks: Task[];
  loading: boolean;
  placementMode: {
    active: boolean;
    name: string;
    color: string;
  };
  moveMode: {
    active: boolean;
    projectId: number | null;
  };

  fetchProjects: () => Promise<void>;
  selectProject: (id: number | null) => Promise<void>;
  startPlacement: (name: string) => void;
  cancelPlacement: () => void;
  confirmPlacement: (x: number, z: number) => Promise<void>;
  startMoveMode: () => void;
  cancelMoveMode: () => void;
  confirmMove: (x: number, z: number) => Promise<void>;
  moveProject: (id: number, x: number, z: number) => Promise<void>;
  addTask: (title: string) => Promise<void>;
  updateTaskStatus: (taskId: number, status: string) => Promise<void>;
}

// Warm, muted palette
const warmColors = [
  '#d4a574', '#a8c4a2', '#c9b8a8', '#d4b896',
  '#b8a9c4', '#a4b8c4', '#c4a8a8', '#b8c4a4',
];

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  selectedProjectId: null,
  tasks: [],
  loading: false,
  placementMode: {
    active: false,
    name: '',
    color: warmColors[0],
  },
  moveMode: {
    active: false,
    projectId: null,
  },

  fetchProjects: async () => {
    set({ loading: true });
    const projects = await api.getProjects();
    set({ projects, loading: false });
  },

  selectProject: async (id) => {
    set({ selectedProjectId: id, tasks: [] });
    if (id !== null) {
      const tasks = await api.getTasks(id);
      set({ tasks });
    }
  },

  startPlacement: (name) => {
    const count = get().projects.length;
    set({
      placementMode: {
        active: true,
        name,
        color: warmColors[count % warmColors.length],
      },
    });
  },

  cancelPlacement: () => {
    set({
      placementMode: {
        active: false,
        name: '',
        color: warmColors[0],
      },
    });
  },

  confirmPlacement: async (x, z) => {
    const { placementMode, projects } = get();
    if (!placementMode.active || !placementMode.name) return;

    const project = await api.createProject({
      name: placementMode.name,
      description: null,
      color: placementMode.color,
      position_x: x,
      position_z: z,
    });

    set({
      projects: [...projects, project],
      placementMode: {
        active: false,
        name: '',
        color: warmColors[(projects.length + 1) % warmColors.length],
      },
    });
  },

  startMoveMode: () => {
    const projectId = get().selectedProjectId;
    if (projectId === null) return;
    set({
      moveMode: {
        active: true,
        projectId,
      },
    });
  },

  cancelMoveMode: () => {
    set({
      moveMode: {
        active: false,
        projectId: null,
      },
    });
  },

  confirmMove: async (x, z) => {
    const { moveMode } = get();
    if (!moveMode.active || moveMode.projectId === null) return;

    await get().moveProject(moveMode.projectId, x, z);

    set({
      moveMode: {
        active: false,
        projectId: null,
      },
    });
  },

  moveProject: async (id, x, z) => {
    const project = get().projects.find(p => p.id === id);
    if (!project) return;

    await api.updateProject(id, {
      name: project.name,
      description: project.description,
      color: project.color,
      position_x: x,
      position_z: z,
    });

    set({
      projects: get().projects.map(p =>
        p.id === id ? { ...p, position_x: x, position_z: z } : p
      ),
    });
  },

  addTask: async (title) => {
    const projectId = get().selectedProjectId;
    if (projectId === null) return;
    const task = await api.createTask(projectId, {
      title,
      status: 'todo',
      priority: 0,
      deadline: null,
    });
    set({ tasks: [...get().tasks, task] });
  },

  updateTaskStatus: async (taskId, status) => {
    const task = get().tasks.find(t => t.id === taskId);
    if (!task) return;
    await api.updateTask(taskId, {
      title: task.title,
      status,
      priority: task.priority,
      deadline: task.deadline,
    });
    set({
      tasks: get().tasks.map(t => t.id === taskId ? { ...t, status } : t),
    });
  },
}));
