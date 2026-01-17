import { useState } from 'react';
import { useProjectStore } from '../stores/projectStore';

export function Sidebar() {
  const { projects, selectedProjectId, selectProject, startPlacement, cancelPlacement, placementMode, loading } = useProjectStore();
  const [newProjectName, setNewProjectName] = useState('');

  const handleStartPlacement = () => {
    if (!newProjectName.trim()) return;
    startPlacement(newProjectName.trim());
    setNewProjectName('');
  };

  const handleCancelPlacement = () => {
    cancelPlacement();
  };

  return (
    <div className="absolute left-4 top-4 bottom-4 w-72 bg-white/90 backdrop-blur-xl rounded-2xl border border-[#e8e4df] flex flex-col shadow-lg shadow-black/5 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-[#e8e4df]/60">
        <div className="flex items-center gap-4">
          <img
            src="/the_reach_logo_v2_transparent_bg.png"
            alt="The Reach"
            className="w-12 h-12 rounded-xl object-cover shadow-sm"
          />
          <div>
            <h1 className="text-xl font-semibold text-[#1a1a1a] tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>The Reach</h1>
            <p className="text-xs text-[#8a857f] font-medium">Project Command</p>
          </div>
        </div>
      </div>

      {/* Add Project */}
      <div className="p-4 border-b border-[#e8e4df]/60">
        {placementMode.active ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-[#fef8f0] rounded-xl border border-[#f0d9b5]">
              <div
                className="w-4 h-4 rounded-full animate-pulse"
                style={{ backgroundColor: placementMode.color }}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-[#1a1a1a]">{placementMode.name}</p>
                <p className="text-xs text-[#8a857f]">Click on the map to place</p>
              </div>
            </div>
            <button
              onClick={handleCancelPlacement}
              className="w-full py-2 px-4 bg-[#f0ebe5] hover:bg-[#e8e3dd] text-[#8a857f] rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleStartPlacement()}
              placeholder="New project..."
              className="flex-1 bg-[#f8f6f4] border-0 rounded-xl px-4 py-2.5 text-sm text-[#1a1a1a] placeholder:text-[#b5b0aa] focus:outline-none focus:ring-2 focus:ring-[#d4a574]/30 transition-all"
            />
            <button
              onClick={handleStartPlacement}
              disabled={!newProjectName.trim()}
              className="w-10 h-10 bg-[#d4a574] hover:bg-[#c9976a] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-lg font-medium transition-all hover:scale-105 active:scale-95 flex items-center justify-center"
            >
              +
            </button>
          </div>
        )}
      </div>

      {/* Project List */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <svg className="w-5 h-5 animate-spin text-[#d4a574]" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        <div className="space-y-1">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => selectProject(project.id === selectedProjectId ? null : project.id)}
              className={`w-full text-left p-3 rounded-xl transition-all group ${
                project.id === selectedProjectId
                  ? 'bg-[#f0ebe5] shadow-sm'
                  : 'hover:bg-[#f8f6f4]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full ring-2 ring-white shadow-sm transition-transform group-hover:scale-110"
                  style={{ backgroundColor: project.color }}
                />
                <span className="text-[#1a1a1a] font-medium text-sm">{project.name}</span>
                {project.id === selectedProjectId && (
                  <svg className="w-4 h-4 text-[#d4a574] ml-auto" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>

        {projects.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-2xl bg-[#f0ebe5] mx-auto mb-3 flex items-center justify-center">
              <svg className="w-6 h-6 text-[#b5b0aa]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <p className="text-[#8a857f] text-sm font-medium">No projects yet</p>
            <p className="text-[#b5b0aa] text-xs mt-1">Create your first project above</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[#e8e4df]/60 bg-[#faf9f7]/50">
        <div className="flex items-center gap-2 text-xs text-[#8a857f] flex-wrap">
          <kbd className="px-1.5 py-0.5 bg-[#f0ebe5] rounded text-[10px] font-mono">W A S D</kbd>
          <span>pan</span>
          <span className="mx-0.5">·</span>
          <kbd className="px-1.5 py-0.5 bg-[#f0ebe5] rounded text-[10px] font-mono">Scroll</kbd>
          <span>zoom</span>
          <span className="mx-0.5">·</span>
          <kbd className="px-1.5 py-0.5 bg-[#f0ebe5] rounded text-[10px] font-mono">ESC</kbd>
          <span>cancel</span>
        </div>
      </div>
    </div>
  );
}
