# The Reach

[![Made with Claude Code](https://img.shields.io/badge/Made%20with-Claude%20Code-orange?style=for-the-badge)](https://claude.ai)

[![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Babylon.js](https://img.shields.io/badge/Babylon.js-BB464B?style=flat-square&logo=babylondotjs&logoColor=white)](https://www.babylonjs.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Tauri](https://img.shields.io/badge/Tauri_2-FFC131?style=flat-square&logo=tauri&logoColor=black)](https://tauri.app/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Zustand](https://img.shields.io/badge/Zustand-443E38?style=flat-square&logo=react&logoColor=white)](https://zustand-demo.pmnd.rs/)

<p align="center">
  <img src="readme_images/The_reach_1.png" alt="The Reach" width="800"/>
</p>

A project management and AI orchestration platform that represents projects as interactive 3D worlds. Tasks, timelines, and autonomous agents can be observed and controlled from a single strategic view.

## Overview

The Reach reimagines project management as an explorable 3D landscape. Each project becomes an island in a procedurally generated world, complete with terrain, vegetation, and a flowing river. The strategic top-down camera lets you survey your entire project ecosystem at a glance.

## Project Structure

```
The_Reach/
├── frontend/               # React + Babylon.js app
│   ├── src/
│   │   ├── babylon/        # 3D engine (scene.ts, terrain.ts, engine.ts)
│   │   ├── components/     # React UI components
│   │   ├── stores/         # Zustand state management
│   │   └── api/            # FastAPI client
├── backend/                # FastAPI server
├── src-tauri/              # Tauri desktop wrapper
└── docker-compose.yml      # PostgreSQL container
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker & Docker Compose
- Rust (for Tauri desktop builds)

### Quick Start

```bash
# Start PostgreSQL
docker compose up -d

# Start backend
cd backend
source .venv/bin/activate
uvicorn main:app --reload

# Start frontend (new terminal)
cd frontend
npm install
npm run dev

# Or run as desktop app
npm run tauri dev
```

## Features

- **3D Project Visualization** - Projects rendered as interactive islands
- **Procedural Terrain** - Multi-octave Perlin noise with river carving
- **Strategic Camera** - WASD panning, scroll zoom, top-down view
- **Task Management** - Create, track, and complete tasks per project
- **Real-time Updates** - Changes reflected instantly in the 3D world

## Controls

| Input | Action |
|-------|--------|
| WASD | Pan camera |
| Scroll | Zoom in/out |
| Click island | Select project |
| Click terrain | Place/move project (in placement mode) |
| Escape | Cancel placement |

## Documentation

- [DESIGN.md](./DESIGN.md) - Visual design principles, shaders, and aesthetic
- [AI_INSTRUCTIONS.md](./AI_INSTRUCTIONS.md) - Development guidelines for AI assistants

## License

MIT
