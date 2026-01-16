import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';

export function TaskPanel() {
  const { projects, selectedProjectId, tasks, selectProject, addTask, updateTaskStatus } = useProjectStore();
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  if (!selectedProject) return null;

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    await addTask(newTaskTitle.trim());
    setNewTaskTitle('');
  };

  const statusColors: Record<string, string> = {
    todo: 'bg-gray-500',
    in_progress: 'bg-amber-500',
    done: 'bg-emerald-500',
  };

  const nextStatus: Record<string, string> = {
    todo: 'in_progress',
    in_progress: 'done',
    done: 'todo',
  };

  return (
    <div className="absolute right-0 top-0 bottom-0 w-96 bg-black/80 backdrop-blur-md border-l border-white/10 flex flex-col">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: selectedProject.color }}
          />
          <h2 className="text-lg font-bold text-white/90">{selectedProject.name}</h2>
        </div>
        <button
          onClick={() => selectProject(null)}
          className="text-white/50 hover:text-white/90 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 border-b border-white/10">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            placeholder="New task..."
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={handleAddTask}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-sm font-medium transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tasks.length === 0 ? (
          <div className="text-white/30 text-sm text-center py-8">
            No tasks yet. Add one above.
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="p-3 bg-white/5 rounded-lg border border-white/10 hover:border-white/20 transition-all"
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => updateTaskStatus(task.id, nextStatus[task.status])}
                    className={`mt-0.5 w-3 h-3 rounded-full ${statusColors[task.status]} hover:ring-2 ring-white/30 transition-all`}
                    title={`Status: ${task.status} (click to change)`}
                  />
                  <span className={`flex-1 text-sm ${task.status === 'done' ? 'text-white/40 line-through' : 'text-white/90'}`}>
                    {task.title}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/10 text-xs text-white/30">
        Click status dot to cycle: todo → in progress → done
      </div>
    </div>
  );
}
