import { useState, useMemo, useRef, useEffect } from 'react';
import { useProjectStore, type SortOption } from '../stores/projectStore';
import { Modal, ConfirmModal } from './Modal';
import { PriorityDropdown } from './Dropdown';
import { DatePicker } from './DatePicker';
import type { Task, Project } from '../api/client';

export function TaskPanel() {
  const {
    projects,
    selectedProjectId,
    tasks,
    selectProject,
    addTask,
    updateTaskStatus,
    updateTask,
    deleteTask,
    updateProjectName,
    deleteProject,
    moveMode,
    startMoveMode,
    cancelMoveMode,
    sortBy,
    setSortBy,
  } = useProjectStore();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Focus input when editing name
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  const startEditingName = () => {
    if (selectedProject) {
      setTempName(selectedProject.name);
      setEditingName(true);
    }
  };

  const saveName = async () => {
    if (selectedProject && tempName.trim() && tempName.trim() !== selectedProject.name) {
      await updateProjectName(selectedProject.id, tempName.trim());
    }
    setEditingName(false);
  };

  const cancelEditingName = () => {
    setEditingName(false);
    setTempName('');
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveName();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEditingName();
    }
  };

  const sortedTasks = useMemo(() => {
    const sorted = [...tasks];
    switch (sortBy) {
      case 'priority':
        sorted.sort((a, b) => b.priority - a.priority);
        break;
      case 'deadline':
        sorted.sort((a, b) => {
          if (!a.deadline && !b.deadline) return 0;
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        });
        break;
      case 'created':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case 'alphabetical':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
    return sorted;
  }, [tasks, sortBy]);

  const tasksByStatus = useMemo(() => ({
    in_progress: sortedTasks.filter(t => t.status === 'in_progress'),
    todo: sortedTasks.filter(t => t.status === 'todo'),
    done: sortedTasks.filter(t => t.status === 'done'),
  }), [sortedTasks]);

  const progress = useMemo(() => {
    if (tasks.length === 0) return 0;
    return Math.round((tasksByStatus.done.length / tasks.length) * 100);
  }, [tasks.length, tasksByStatus.done.length]);

  if (!selectedProject) return null;

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

  const priorityConfig: Record<number, { label: string; color: string; bg: string }> = {
    0: { label: 'Low', color: '#8a857f', bg: '#f0ebe5' },
    1: { label: 'Medium', color: '#d4a574', bg: '#fef8f0' },
    2: { label: 'High', color: '#c45c4a', bg: '#fef0ee' },
  };

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'priority', label: 'Priority' },
    { value: 'deadline', label: 'Deadline' },
    { value: 'created', label: 'Created' },
    { value: 'alphabetical', label: 'A-Z' },
  ];

  return (
    <>
      <div className="absolute right-4 top-4 bottom-4 w-96 bg-white/90 backdrop-blur-xl rounded-2xl border border-[#e8e4df] flex flex-col shadow-lg shadow-black/5 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[#e8e4df]/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div
                className="w-4 h-4 rounded-full ring-2 ring-white shadow-sm flex-shrink-0"
                style={{ backgroundColor: selectedProject.color }}
              />
              <div className="min-w-0 flex-1">
                {editingName ? (
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    onKeyDown={handleNameKeyDown}
                    onBlur={saveName}
                    className="w-full text-lg font-semibold text-[#1a1a1a] tracking-tight bg-[#f8f6f4] rounded-lg px-2 py-0.5 -ml-2 border-0 focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30"
                  />
                ) : (
                  <h2
                    onClick={startEditingName}
                    className="text-lg font-semibold text-[#1a1a1a] tracking-tight cursor-pointer hover:bg-[#f8f6f4] rounded-lg px-2 py-0.5 -ml-2 transition-colors truncate"
                    title="Click to edit name"
                  >
                    {selectedProject.name}
                  </h2>
                )}
                <p className="text-xs text-[#8a857f] ml-0.5">{tasks.length} tasks</p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
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
                <>
                  <button
                    onClick={startMoveMode}
                    className="w-8 h-8 rounded-lg hover:bg-[#f0ebe5] flex items-center justify-center text-[#8a857f] hover:text-[#1a1a1a] transition-all"
                    title="Move project"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setDeletingProject(selectedProject)}
                    className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-[#8a857f] hover:text-red-500 transition-all"
                    title="Delete project"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </>
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

          {/* Progress Bar */}
          {tasks.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-[#8a857f]">Progress</span>
                <span className="text-xs font-medium text-[#1a1a1a]">{progress}%</span>
              </div>
              <div className="h-2 bg-[#f0ebe5] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#d4a574] to-[#7a9e7a] rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[10px] text-[#b5b0aa]">
                <span>{tasksByStatus.done.length} completed</span>
                <span>{tasksByStatus.todo.length + tasksByStatus.in_progress.length} remaining</span>
              </div>
            </div>
          )}

          {moveMode.active && (
            <div className="mt-3 p-2.5 bg-[#fef8f0] rounded-lg border border-[#f0d9b5] flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#d4a574] animate-pulse" />
              <p className="text-xs text-[#8a857f]">Click anywhere on the map to move this project</p>
            </div>
          )}
        </div>

        {/* Add Task Button */}
        <div className="p-4 border-b border-[#e8e4df]/60">
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full py-2.5 px-4 bg-[#d4a574] hover:bg-[#c9976a] text-white rounded-xl text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Task
          </button>
        </div>

        {/* Sort Controls */}
        {tasks.length > 0 && (
          <div className="px-4 py-2 border-b border-[#e8e4df]/60 flex items-center justify-between">
            <span className="text-xs text-[#8a857f]">Sort by</span>
            <div className="flex items-center gap-1">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSortBy(option.value)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    sortBy === option.value
                      ? 'bg-[#d4a574] text-white'
                      : 'text-[#8a857f] hover:bg-[#f0ebe5]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

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
                      <TaskItem
                        key={task.id}
                        task={task}
                        config={statusConfig}
                        priorityConfig={priorityConfig}
                        nextStatus={nextStatus}
                        onStatusChange={updateTaskStatus}
                        onEdit={setEditingTask}
                        onDelete={setDeletingTask}
                      />
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
                      <TaskItem
                        key={task.id}
                        task={task}
                        config={statusConfig}
                        priorityConfig={priorityConfig}
                        nextStatus={nextStatus}
                        onStatusChange={updateTaskStatus}
                        onEdit={setEditingTask}
                        onDelete={setDeletingTask}
                      />
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
                      <TaskItem
                        key={task.id}
                        task={task}
                        config={statusConfig}
                        priorityConfig={priorityConfig}
                        nextStatus={nextStatus}
                        onStatusChange={updateTaskStatus}
                        onEdit={setEditingTask}
                        onDelete={setDeletingTask}
                      />
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

      {/* Add Task Modal */}
      {showAddModal && (
        <AddTaskModal
          onClose={() => setShowAddModal(false)}
          onSave={async (data) => {
            await addTask(data.title, data.description, data.priority, data.deadline);
            setShowAddModal(false);
          }}
        />
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={async (updates) => {
            await updateTask(editingTask.id, updates);
            setEditingTask(null);
          }}
        />
      )}

      {/* Delete Task Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingTask}
        onClose={() => setDeletingTask(null)}
        onConfirm={() => deletingTask && deleteTask(deletingTask.id)}
        title="Delete Task"
        message={`Are you sure you want to delete "${deletingTask?.title}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmVariant="danger"
      />

      {/* Delete Project Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingProject}
        onClose={() => setDeletingProject(null)}
        onConfirm={() => deletingProject && deleteProject(deletingProject.id)}
        title="Delete Project"
        message={`Are you sure you want to delete "${deletingProject?.name}"? This will also delete all ${deletingProject?.task_count || 0} tasks in this project. This action cannot be undone.`}
        confirmText="Delete Project"
        confirmVariant="danger"
      />
    </>
  );
}

interface TaskItemProps {
  task: Task;
  config: Record<string, { color: string; bg: string; label: string }>;
  priorityConfig: Record<number, { label: string; color: string; bg: string }>;
  nextStatus: Record<string, string>;
  onStatusChange: (id: number, status: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

function TaskItem({ task, config, priorityConfig, nextStatus, onStatusChange, onEdit, onDelete }: TaskItemProps) {
  const { color } = config[task.status] || config.todo;
  const priority = priorityConfig[task.priority] || priorityConfig[0];
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';

  return (
    <div
      onClick={() => onEdit(task)}
      className={`group p-3 bg-white rounded-xl border transition-all cursor-pointer ${
        isOverdue
          ? 'border-red-200 hover:border-red-300'
          : 'border-[#e8e4df]/60 hover:border-[#d4cfc8]'
      } hover:shadow-sm`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStatusChange(task.id, nextStatus[task.status]);
          }}
          className="mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110"
          style={{ borderColor: color, backgroundColor: task.status === 'done' ? color : 'transparent' }}
          title="Click to change status"
        >
          {task.status === 'done' && (
            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <span className={`text-sm leading-relaxed ${task.status === 'done' ? 'text-[#b5b0aa] line-through' : 'text-[#1a1a1a]'}`}>
            {task.title}
          </span>
          <div className="flex items-center gap-2 mt-1.5">
            {task.description && (
              <span className="text-[#8a857f]" title="Has description">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
                </svg>
              </span>
            )}
            {task.priority > 0 && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: priority.bg, color: priority.color }}
              >
                {priority.label}
              </span>
            )}
            {task.deadline && (
              <span className={`text-[10px] flex items-center gap-1 ${isOverdue ? 'text-red-500 font-medium' : 'text-[#b5b0aa]'}`}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {isOverdue && '⚠ '}
                {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task);
          }}
          className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-[#8a857f] hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
          title="Delete task"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface AddTaskModalProps {
  onClose: () => void;
  onSave: (data: { title: string; description: string | null; priority: number; deadline: string | null }) => Promise<void>;
}

function AddTaskModal({ onClose, onSave }: AddTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(0);
  const [deadline, setDeadline] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    });
    setSaving(false);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="New Task"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[#8a857f] hover:bg-[#f0ebe5] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#d4a574] hover:bg-[#c9976a] disabled:opacity-50 transition-all"
          >
            {saving ? 'Creating...' : 'Create Task'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            className="w-full bg-[#f8f6f4] border-0 rounded-xl px-4 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#b5b0aa] focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 transition-all"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">
            Description <span className="text-[#b5b0aa] font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add more details..."
            rows={3}
            className="w-full bg-[#f8f6f4] border-0 rounded-xl px-4 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#b5b0aa] focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 transition-all resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">Priority</label>
            <PriorityDropdown value={priority} onChange={setPriority} />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">
              Deadline <span className="text-[#b5b0aa] font-normal">(optional)</span>
            </label>
            <DatePicker value={deadline} onChange={setDeadline} placeholder="Select deadline" />
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface EditTaskModalProps {
  task: Task;
  onClose: () => void;
  onSave: (updates: { title?: string; description?: string | null; priority?: number; deadline?: string | null }) => Promise<void>;
}

function EditTaskModal({ task, onClose, onSave }: EditTaskModalProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [priority, setPriority] = useState(task.priority);
  const [deadline, setDeadline] = useState(task.deadline ? task.deadline.split('T')[0] : '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      deadline: deadline ? new Date(deadline).toISOString() : null,
    });
    setSaving(false);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Edit Task"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[#8a857f] hover:bg-[#f0ebe5] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#d4a574] hover:bg-[#c9976a] disabled:opacity-50 transition-all"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-[#f8f6f4] border-0 rounded-xl px-4 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#b5b0aa] focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 transition-all"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">
            Description <span className="text-[#b5b0aa] font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add more details..."
            rows={3}
            className="w-full bg-[#f8f6f4] border-0 rounded-xl px-4 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#b5b0aa] focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 transition-all resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">Priority</label>
            <PriorityDropdown value={priority} onChange={setPriority} />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1a1a1a] mb-1.5">
              Deadline <span className="text-[#b5b0aa] font-normal">(optional)</span>
            </label>
            <DatePicker value={deadline} onChange={setDeadline} placeholder="Select deadline" />
          </div>
        </div>
      </div>
    </Modal>
  );
}
