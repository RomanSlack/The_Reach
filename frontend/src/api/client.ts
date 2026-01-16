const API_BASE = 'http://localhost:8000';

export interface Project {
  id: number;
  name: string;
  description: string | null;
  color: string;
  position_x: number;
  position_z: number;
  created_at: string;
}

export interface Task {
  id: number;
  project_id: number;
  title: string;
  status: string;
  priority: number;
  deadline: string | null;
  created_at: string;
}

export const api = {
  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/projects`);
    return res.json();
  },

  async createProject(data: Omit<Project, 'id' | 'created_at'>): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateProject(id: number, data: Omit<Project, 'id' | 'created_at'>): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteProject(id: number): Promise<void> {
    await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
  },

  async getTasks(projectId: number): Promise<Task[]> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/tasks`);
    return res.json();
  },

  async createTask(projectId: number, data: Omit<Task, 'id' | 'project_id' | 'created_at'>): Promise<Task> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async updateTask(taskId: number, data: Omit<Task, 'id' | 'project_id' | 'created_at'>): Promise<Task> {
    const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async deleteTask(taskId: number): Promise<void> {
    await fetch(`${API_BASE}/tasks/${taskId}`, { method: 'DELETE' });
  },
};
