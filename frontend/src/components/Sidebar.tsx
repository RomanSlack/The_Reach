import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';

export function Sidebar() {
  const { projects, selectedProjectId, selectProject, addProject, loading } = useProjectStore();
  const [newProjectName, setNewProjectName] = useState('');

  const handleAddProject = async () => {
    if (!newProjectName.trim()) return;
    await addProject(newProjectName.trim());
    setNewProjectName('');
  };

  return (
    <div className="absolute left-0 top-0 bottom-0 w-72 bg-black/80 backdrop-blur-md border-r border-white/10 flex flex-col">
      <div className="p-4 border-b border-white/10">
        <h1 className="text-xl font-bold text-white/90">The Reach</h1>
        <p className="text-sm text-white/50">Project Command</p>
      </div>

      <div className="p-4 border-b border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddProject()}
            placeholder="New project..."
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleAddProject}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-medium transition-colors"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="text-white/50 text-sm p-2">Loading...</div>
        )}
        {projects.map((project) => (
          <button
            key={project.id}
            onClick={() => selectProject(project.id === selectedProjectId ? null : project.id)}
            className={`w-full text-left p-3 rounded-lg mb-1 transition-all ${
              project.id === selectedProjectId
                ? 'bg-white/10 border border-white/20'
                : 'hover:bg-white/5 border border-transparent'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              <span className="text-white/90 font-medium">{project.name}</span>
            </div>
          </button>
        ))}
        {projects.length === 0 && !loading && (
          <div className="text-white/30 text-sm p-4 text-center">
            No projects yet. Create one above.
          </div>
        )}
      </div>
    </div>
  );
}
