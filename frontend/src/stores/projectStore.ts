import { create } from 'zustand';
import { api } from '../api/client';
import type { Project, Task } from '../api/client';

export type SortOption = 'priority' | 'deadline' | 'created' | 'alphabetical';

interface ProjectStore {
  projects: Project[];
  selectedProjectId: number | null;
  tasks: Task[];
  loading: boolean;
  sortBy: SortOption;
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
  updateProjectName: (id: number, name: string) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
  addTask: (title: string, description?: string | null, priority?: number, deadline?: string | null) => Promise<void>;
  updateTaskStatus: (taskId: number, status: string) => Promise<void>;
  updateTask: (taskId: number, updates: { title?: string; description?: string | null; priority?: number; deadline?: string | null }) => Promise<void>;
  deleteTask: (taskId: number) => Promise<void>;
  setSortBy: (sort: SortOption) => void;
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
  sortBy: 'priority' as SortOption,
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

    // Add stats fields for new project
    const projectWithStats = { ...project, task_count: 0, done_count: 0 };

    set({
      projects: [...projects, projectWithStats],
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

  updateProjectName: async (id, name) => {
    const project = get().projects.find(p => p.id === id);
    if (!project) return;

    await api.updateProject(id, {
      name,
      description: project.description,
      color: project.color,
      position_x: project.position_x,
      position_z: project.position_z,
    });

    set({
      projects: get().projects.map(p =>
        p.id === id ? { ...p, name } : p
      ),
    });
  },

  deleteProject: async (id) => {
    await api.deleteProject(id);
    const { selectedProjectId } = get();
    set({
      projects: get().projects.filter(p => p.id !== id),
      // Clear selection and tasks if deleting the selected project
      selectedProjectId: selectedProjectId === id ? null : selectedProjectId,
      tasks: selectedProjectId === id ? [] : get().tasks,
    });
  },

  addTask: async (title, description = null, priority = 0, deadline = null) => {
    const projectId = get().selectedProjectId;
    if (projectId === null) return;
    const task = await api.createTask(projectId, {
      title,
      description,
      status: 'todo',
      priority,
      deadline,
    });
    set({ tasks: [...get().tasks, task] });
    // Update project stats
    set({
      projects: get().projects.map(p =>
        p.id === projectId ? { ...p, task_count: p.task_count + 1 } : p
      ),
    });
  },

  updateTaskStatus: async (taskId, status) => {
    const task = get().tasks.find(t => t.id === taskId);
    if (!task) return;
    const oldStatus = task.status;
    await api.updateTask(taskId, {
      title: task.title,
      description: task.description,
      status,
      priority: task.priority,
      deadline: task.deadline,
    });
    set({
      tasks: get().tasks.map(t => t.id === taskId ? { ...t, status } : t),
    });
    // Update project stats if status changed to/from done
    const projectId = get().selectedProjectId;
    if (projectId !== null && oldStatus !== status) {
      const doneChange = (status === 'done' ? 1 : 0) - (oldStatus === 'done' ? 1 : 0);
      if (doneChange !== 0) {
        set({
          projects: get().projects.map(p =>
            p.id === projectId ? { ...p, done_count: p.done_count + doneChange } : p
          ),
        });
      }
    }
  },

  updateTask: async (taskId, updates) => {
    const task = get().tasks.find(t => t.id === taskId);
    if (!task) return;
    const updatedTask = await api.updateTask(taskId, {
      title: updates.title ?? task.title,
      description: updates.description !== undefined ? updates.description : task.description,
      status: task.status,
      priority: updates.priority ?? task.priority,
      deadline: updates.deadline !== undefined ? updates.deadline : task.deadline,
    });
    set({
      tasks: get().tasks.map(t => t.id === taskId ? updatedTask : t),
    });
  },

  deleteTask: async (taskId) => {
    const task = get().tasks.find(t => t.id === taskId);
    const projectId = get().selectedProjectId;
    await api.deleteTask(taskId);
    set({
      tasks: get().tasks.filter(t => t.id !== taskId),
    });
    // Update project stats
    if (projectId !== null && task) {
      set({
        projects: get().projects.map(p =>
          p.id === projectId ? {
            ...p,
            task_count: p.task_count - 1,
            done_count: task.status === 'done' ? p.done_count - 1 : p.done_count
          } : p
        ),
      });
    }
  },

  setSortBy: (sort) => {
    set({ sortBy: sort });
  },
}));
