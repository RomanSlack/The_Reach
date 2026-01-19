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
  <img src="readme_images/The_reach_2_readme.png" alt="The Reach" width="800"/>
</p>

Your projects as living worlds. Each project becomes a procedurally generated settlement that evolves from a humble campsite to a thriving castle as you make progress.

## Overview

The Reach transforms project management into an explorable 3D landscape with a low-poly aesthetic and realistic lighting. Projects are visualized as settlements on procedural terrain - complete with lakes, forests, wildlife, and dynamic day/night cycles.

**Settlements evolve through 5 tiers based on project activity:**

| Tier | Settlement | Triggers |
|------|------------|----------|
| 1 | Campsite | New project, tents & campfire |
| 2 | Outpost | Early progress, wooden huts |
| 3 | Village | Steady work, full palisade |
| 4 | Town | Thriving, stone walls & market |
| 5 | Castle | Excellence, towers & banners |

## Features

- **Procedural Terrain** - FBM noise-based landscapes with lakes, rocks, and vegetation
- **Living Ecosystem** - Sheep grazing, birds flying, fish swimming, ducks in water
- **Dynamic Lighting** - Day/night cycle with stars, campfire glow, and smoke particles
- **Settlement Evolution** - Camps upgrade as you complete tasks and stay active
- **Ambient Details** - Water ripples, grass particles, fire effects

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

## Controls

| Input | Action |
|-------|--------|
| WASD | Pan camera |
| Scroll | Zoom in/out |
| Click island | Select project |
| Click terrain | Place/move project (in placement mode) |
| Escape | Cancel placement |

## Why Not?

Project management doesn't need to be a spreadsheet. So we added:

- **Sheep** that graze and scatter grass particles
- **Birds** circling overhead
- **Fish** swimming in the lake, **ducks** splashing around
- **Campfires** with flickering flames and smoke plumes
- **Stars** that fade in at night
- **Water ripples** and reflections
- **PBR materials** with SSAO, bloom, and ACES tone mapping
- **Day/night cycle** with warm sunsets and glowing windows

None of it is essential. All of it makes you want to keep your projects alive.

## Future

**Agent Visualization** - Watch your Claude Code sessions and other AI coding agents work in real-time. Each agent gets their own character in your settlement:

| Agent      | Character          | Activity          |
|------------|--------------------|-------------------|
| Builder    | Hammer & hardhat   | Creating features |
| Fixer      | Wrench & toolbelt  | Squashing bugs    |
| Researcher | Glasses & scroll   | Exploring code    |

See agents spawn at your project, walk between buildings, and despawn with celebration particles when tasks complete. Multi-project agents leave visible trails as they travel between settlements.

**GitHub Integration** - Connect repos to automatically track commits, PRs, and issues. Activity flows into your settlement's health score.

**Multiplayer Worlds** - Share a realm with your team. Watch everyone's projects grow together.

## Documentation

- [DESIGN.md](./DESIGN.md) - Visual design principles, shaders, and aesthetic
- [AI_INSTRUCTIONS.md](./AI_INSTRUCTIONS.md) - Development guidelines for AI assistants

## License

MIT
