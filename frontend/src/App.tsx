import { useEffect } from 'react';
import { BabylonCanvas } from './components/BabylonCanvas';
import { Sidebar } from './components/Sidebar';
import { TaskPanel } from './components/TaskPanel';
import { useProjectStore } from './stores/projectStore';

function App() {
  const { fetchProjects } = useProjectStore();

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return (
    <div className="relative w-full h-full">
      <BabylonCanvas />
      <Sidebar />
      <TaskPanel />
    </div>
  );
}

export default App;
