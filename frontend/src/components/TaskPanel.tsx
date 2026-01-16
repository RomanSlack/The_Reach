import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';

export function TaskPanel() {
  const { projects, selectedProjectId, tasks, selectProject, addTask, updateTaskStatus, moveMode, startMoveMode, cancelMoveMode } = useProjectStore();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  if (!selectedProject) return null;

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    setIsAdding(true);
    await addTask(newTaskTitle.trim());
    setNewTaskTitle('');
    setIsAdding(false);
  };

  const statusConfig: Record<string, { color: string; bg: string; label: string }> = {
    todo: { color: '#8a857f', bg: '#f0ebe5', label: 'To Do' },
    in_progress: { color: '#d4a574', bg: '#faf3eb', label: 'In Progress' },
    done: { color: '#7a9e7a', bg: '#f0f5f0', label: 'Done' },
  };

  const nextStatus: Record<string, string> = {
    todo: 'in_progress',
    in_progress: 'done',
    done: 'todo',
  };

  const tasksByStatus = {
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    todo: tasks.filter(t => t.status === 'todo'),
    done: tasks.filter(t => t.status === 'done'),
  };

  return (
    <div className="absolute right-4 top-4 bottom-4 w-96 bg-white/90 backdrop-blur-xl rounded-2xl border border-[#e8e4df] flex flex-col shadow-lg shadow-black/5 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-[#e8e4df]/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full ring-2 ring-white shadow-sm"
              style={{ backgroundColor: selectedProject.color }}
            />
            <div>
              <h2 className="text-lg font-semibold text-[#1a1a1a] tracking-tight">{selectedProject.name}</h2>
              <p className="text-xs text-[#8a857f]">{tasks.length} tasks</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {moveMode.active ? (
              <button
                onClick={cancelMoveMode}
                className="px-3 py-1.5 rounded-lg bg-[#f0ebe5] hover:bg-[#e8e3dd] text-[#8a857f] text-xs font-medium transition-all flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Cancel Move
              </button>
            ) : (
              <button
                onClick={startMoveMode}
                className="w-8 h-8 rounded-lg hover:bg-[#f0ebe5] flex items-center justify-center text-[#8a857f] hover:text-[#1a1a1a] transition-all"
                title="Move project"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            )}
            <button
              onClick={() => selectProject(null)}
              className="w-8 h-8 rounded-lg hover:bg-[#f0ebe5] flex items-center justify-center text-[#8a857f] hover:text-[#1a1a1a] transition-all"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {moveMode.active && (
          <div className="mt-3 p-2.5 bg-[#fef8f0] rounded-lg border border-[#f0d9b5] flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#d4a574] animate-pulse" />
            <p className="text-xs text-[#8a857f]">Click anywhere on the map to move this project</p>
          </div>
        )}
      </div>

      {/* Add Task */}
      <div className="p-4 border-b border-[#e8e4df]/60">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            placeholder="Add a task..."
            className="flex-1 bg-[#f8f6f4] border-0 rounded-xl px-4 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#b5b0aa] focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 transition-all"
          />
          <button
            onClick={handleAddTask}
            disabled={isAdding || !newTaskTitle.trim()}
            className="px-4 py-2.5 bg-[#d4a574] hover:bg-[#c9976a] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-all hover:scale-105 active:scale-95"
          >
            {isAdding ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : 'Add'}
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tasks.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-2xl bg-[#f0ebe5] mx-auto mb-3 flex items-center justify-center">
              <svg className="w-6 h-6 text-[#b5b0aa]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-[#8a857f] text-sm font-medium">No tasks yet</p>
            <p className="text-[#b5b0aa] text-xs mt-1">Add your first task above</p>
          </div>
        ) : (
          <>
            {/* In Progress */}
            {tasksByStatus.in_progress.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-[#d4a574]" />
                  <span className="text-xs font-semibold text-[#8a857f] uppercase tracking-wide">In Progress</span>
                  <span className="text-xs text-[#b5b0aa]">({tasksByStatus.in_progress.length})</span>
                </div>
                <div className="space-y-2">
                  {tasksByStatus.in_progress.map((task) => (
                    <TaskItem key={task.id} task={task} config={statusConfig} nextStatus={nextStatus} onStatusChange={updateTaskStatus} />
                  ))}
                </div>
              </div>
            )}

            {/* To Do */}
            {tasksByStatus.todo.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-[#8a857f]" />
                  <span className="text-xs font-semibold text-[#8a857f] uppercase tracking-wide">To Do</span>
                  <span className="text-xs text-[#b5b0aa]">({tasksByStatus.todo.length})</span>
                </div>
                <div className="space-y-2">
                  {tasksByStatus.todo.map((task) => (
                    <TaskItem key={task.id} task={task} config={statusConfig} nextStatus={nextStatus} onStatusChange={updateTaskStatus} />
                  ))}
                </div>
              </div>
            )}

            {/* Done */}
            {tasksByStatus.done.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-[#7a9e7a]" />
                  <span className="text-xs font-semibold text-[#8a857f] uppercase tracking-wide">Done</span>
                  <span className="text-xs text-[#b5b0aa]">({tasksByStatus.done.length})</span>
                </div>
                <div className="space-y-2">
                  {tasksByStatus.done.map((task) => (
                    <TaskItem key={task.id} task={task} config={statusConfig} nextStatus={nextStatus} onStatusChange={updateTaskStatus} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#e8e4df]/60 bg-[#faf9f7]/50">
        <div className="flex items-center justify-between text-xs text-[#8a857f]">
          <span>Click status to cycle</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#8a857f]" /> todo
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#d4a574]" /> progress
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#7a9e7a]" /> done
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface TaskItemProps {
  task: { id: number; title: string; status: string };
  config: Record<string, { color: string; bg: string; label: string }>;
  nextStatus: Record<string, string>;
  onStatusChange: (id: number, status: string) => void;
}

function TaskItem({ task, config, nextStatus, onStatusChange }: TaskItemProps) {
  const { color } = config[task.status] || config.todo;

  return (
    <div
      className="group p-3 bg-white rounded-xl border border-[#e8e4df]/60 hover:border-[#d4cfc8] hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => onStatusChange(task.id, nextStatus[task.status])}
          className="mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110"
          style={{ borderColor: color, backgroundColor: task.status === 'done' ? color : 'transparent' }}
          title={`Click to change status`}
        >
          {task.status === 'done' && (
            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
        <span className={`flex-1 text-sm leading-relaxed ${task.status === 'done' ? 'text-[#b5b0aa] line-through' : 'text-[#1a1a1a]'}`}>
          {task.title}
        </span>
      </div>
    </div>
  );
}
