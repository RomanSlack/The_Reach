# AI Instructions for The Reach

## Development Workflow

### Building
- **Do NOT run builds after every change** - only build when explicitly asked or when ready to test
- The user will run `npm run dev` themselves to test changes
- Use `npm run build` only when:
  - User explicitly requests a build
  - Ready for production deployment
  - Need to verify TypeScript compilation for complex changes

### Servers
- **Do NOT start servers** - the user will handle starting:
  - `docker compose up -d` for Postgres
  - Backend with uvicorn
  - Frontend with `npm run dev`
  - Tauri with `npm run tauri dev`

## Project Architecture

### Tech Stack
- **Frontend**: Vite + React 19 + Babylon.js + Tailwind CSS
- **Desktop**: Tauri 2
- **Backend**: FastAPI (Python)
- **Database**: Postgres via Docker
- **State**: Zustand

### Key Directories
```
The_Reach/
├── frontend/           # React + Babylon.js app
│   ├── src/
│   │   ├── babylon/    # 3D engine code (scene.ts, terrain.ts)
│   │   ├── components/ # React UI components
│   │   ├── stores/     # Zustand state management
│   │   └── api/        # FastAPI client
├── backend/            # FastAPI server
├── src-tauri/          # Tauri desktop wrapper
└── docker-compose.yml  # Postgres container
```

### Terrain System
- Uses multi-octave Perlin noise (FBM) for natural terrain
- River carving lowers terrain where water flows
- `getTerrainHeight(x, z)` function available in scene.ts
- All objects (trees, rocks, projects) should conform to terrain height

### Project Placement
- Projects are placed via the **Move button** only
- No drag-to-move - click to select, use move button, click to place
- Ghost preview follows cursor with terrain height

### Code Organization
- **Keep `scene.ts` lean** - do not bloat it with large features
- New features or systems should go in separate folders/files under `src/babylon/`
- Example: The settlement system lives in `src/babylon/settlements/` with its own modules:
  - `types.ts` - Type definitions and constants
  - `assetLoader.ts` - GLB asset loading and caching
  - `campGenerator.ts` - Procedural layout generation
  - `settlementManager.ts` - Main orchestrator
  - `index.ts` - Public exports
- Import and integrate these modules into `scene.ts` rather than writing everything inline

## Style Guidelines

### UI Design
- Light mode with warm beige/tan Anthropic-style colors
- Primary accent: `#d4a574` (warm tan)
- Background: `#faf9f7` (off-white)
- Borders: `#e8e4df`
- Text: `#1a1a1a` (dark), `#8a857f` (muted)

### 3D Scene
- Strategic top-down camera (Supreme Commander style)
- WASD panning, scroll zoom
- Soft shadows, subtle bloom
- No harsh glows or blinding elements

## Quick Commands
```bash
# Start everything
docker compose up -d
cd backend && source .venv/bin/activate && uvicorn main:app --reload
cd frontend && npm run dev

# Tauri desktop
npm run tauri dev
```
