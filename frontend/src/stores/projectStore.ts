import { create } from 'zustand';
import { api, Project, Task } from '../api/client';

interface ProjectStore {
  projects: Project[];
  selectedProjectId: number | null;
  tasks: Task[];
  loading: boolean;

  fetchProjects: () => Promise<void>;
  selectProject: (id: number | null) => Promise<void>;
  addProject: (name: string) => Promise<void>;
  addTask: (title: string) => Promise<void>;
  updateTaskStatus: (taskId: number, status: string) => Promise<void>;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  selectedProjectId: null,
  tasks: [],
  loading: false,

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

  addProject: async (name) => {
    const count = get().projects.length;
    const angle = (count * 2.4); // golden angle spread
    const radius = 8 + count * 2;
    const project = await api.createProject({
      name,
      description: null,
      color: `hsl(${(count * 137.5) % 360}, 70%, 60%)`,
      position_x: Math.cos(angle) * radius,
      position_z: Math.sin(angle) * radius,
    });
    set({ projects: [...get().projects, project] });
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
