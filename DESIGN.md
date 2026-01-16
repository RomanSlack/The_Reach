# The Reach - Design Document

## Visual Philosophy

The Reach embraces a **low-poly aesthetic with realistic lighting** - think Minecraft with RTX shaders. The geometry is intentionally simple and stylized, but the lighting, shadows, and post-processing create depth and atmosphere that makes the world feel alive.

## Art Direction

### Core Principles

1. **Low-Poly Geometry** - Simple shapes, low tessellation counts, visible facets
2. **Realistic Lighting** - PBR materials, soft shadows, ambient occlusion
3. **Warm Natural Palette** - Greens, browns, blues inspired by nature
4. **Strategic Clarity** - Everything readable from a top-down view

### The Vibe

Imagine surveying your kingdom from above - a peaceful realm of rolling hills, meandering rivers, and scattered forests. Each project is a settlement in your domain, growing and evolving as work progresses. The world feels handcrafted yet natural, like a detailed diorama brought to life.

## Color Palette

### UI Colors (Anthropic-inspired)
```
Primary Accent:  #d4a574 (warm tan)
Background:      #faf9f7 (off-white)
Borders:         #e8e4df (light gray)
Text Dark:       #1a1a1a
Text Muted:      #8a857f
```

### 3D World Colors
```
Grass Dark:      rgb(95, 130, 70)
Grass Medium:    rgb(110, 150, 85)
Grass Light:     rgb(125, 165, 95)
Tree Trunk:      rgb(89, 56, 31)
Foliage:         rgb(71, 122, 56)
Pine Foliage:    rgb(38, 82, 38)
Rock:            rgb(122, 117, 112)
Water:           rgb(77, 128, 153)
Sky:             Linear gradient from #87CEEB to #E0F6FF
```

## Rendering Pipeline

### Lighting Setup

**Hemisphere Light (Ambient Fill)**
- Direction: Up (0, 1, 0)
- Intensity: 0.4
- Sky color: Cool blue `rgb(0.7, 0.8, 1.0)`
- Ground color: Warm brown `rgb(0.25, 0.2, 0.15)`

**Directional Light (Sun)**
- Direction: (-0.5, -1, -0.3) normalized
- Intensity: 1.8
- Color: Warm white `rgb(1, 0.95, 0.8)`

### Shadows

- **Type**: Percentage Closer Filtering (PCF)
- **Resolution**: 4096x4096
- **Quality**: High
- **Darkness**: 0.4 (not too harsh)
- **Bias**: 0.001 / Normal bias: 0.02

### SSAO (Screen Space Ambient Occlusion)

Adds depth to crevices and contact points between objects.

```
Radius:         2.0
Total Strength: 1.2
Base:           0.1
Samples:        16
Max Z:          250
```

### Post-Processing

**Anti-Aliasing**
- FXAA enabled
- MSAA 4x samples

**Bloom**
- Threshold: 0.75
- Weight: 0.3
- Kernel: 64
- Scale: 0.5

**Sharpen**
- Edge amount: 0.3
- Color amount: 1.0

**Tone Mapping**
- Type: ACES Filmic
- Contrast: 1.15
- Exposure: 1.1

**Color Grading**
- Global saturation: +20
- Highlights saturation: -10
- Shadows hue: 20 (warm)
- Shadows saturation: +10

**Vignette**
- Weight: 0.4
- Stretch: 0.5

## Custom Edge Detection Shader

A custom post-process shader adds subtle dark outlines to geometry edges, emphasizing the low-poly aesthetic.

### How It Works

1. Samples depth buffer in a 3x3 kernel around each pixel
2. Applies Sobel edge detection to find depth discontinuities
3. Also detects edges based on color differences
4. Blends a warm dark brown outline at detected edges

### Parameters

```
Edge Strength:    0.4 (subtle, not cartoon-like)
Depth Threshold:  0.15
Edge Color:       rgb(0.15, 0.12, 0.1) - warm brown
```

## Materials

### PBR Material Settings

All vegetation and terrain use Physically Based Rendering materials:

**Tree Trunk**
- Albedo: `rgb(0.35, 0.22, 0.12)`
- Metallic: 0.0
- Roughness: 0.95

**Deciduous Foliage**
- Albedo: `rgb(0.28, 0.48, 0.22)`
- Metallic: 0.0
- Roughness: 0.85

**Pine Foliage**
- Albedo: `rgb(0.15, 0.32, 0.15)`
- Metallic: 0.0
- Roughness: 0.9

**Rock**
- Albedo: `rgb(0.48, 0.46, 0.44)`
- Metallic: 0.05 (slight mineral glint)
- Roughness: 0.75

**Grass/Terrain**
- Metallic: 0.0
- Roughness: 0.95
- Custom noise-based texture (non-repeating)

## Terrain System

### Procedural Generation

The terrain uses **Fractal Brownian Motion (FBM)** - multiple octaves of Perlin noise layered together:

```
Base terrain:   6 octaves, scale 0.008, amplitude 15
Hills:          3 octaves, scale 0.003, amplitude 8
Fine detail:    4 octaves, scale 0.03, amplitude 2
```

### River Carving

A meandering river path is generated using sine waves and noise, then "carved" into the terrain:

- **Deep channel**: Center of river, lowest point
- **Shallow areas**: Gradual slope toward banks
- **Riverbanks**: Smooth transition to terrain height

### Grass Texture

Custom procedural texture using multi-scale noise to avoid visible tiling:

- Large patches (300px wavelength)
- Medium variation (50px wavelength)
- Fine detail (8px wavelength)
- Micro texture (3px wavelength)

## Vegetation

### Performance: Thin Instances

All vegetation uses Babylon.js thin instances for massive performance gains:

- ~3,500+ individual meshes → ~6 draw calls
- GPU-side instancing via matrix buffers
- Each tree/bush/rock is a single template mesh instanced many times

### Tree Types

**Deciduous Trees**
- Trunk: Tapered cylinder (8 segments)
- Canopy: 10 merged spheres forming organic shape
  - Main mass, upper puffs, side puffs, lower edge puffs

**Pine Trees**
- Trunk: Simple cylinder
- Foliage: 3 stacked cones (merged mesh)

**Bushes**
- Flattened sphere (1.3x wide, 0.8x tall)

**Rocks**
- Polyhedron (type 1, icosahedron-based)

## Water/River

### Surface

- Flat across width (water finds its level)
- Follows riverbed depth along length
- 70% fill level between riverbed and banks

### Material

- Semi-transparent (65% opacity)
- Specular highlights for sun reflection
- Animated UV offset for slow flow effect
- Flow lines texture with gradient streaks

## Clouds

### Structure

Each cloud is built from multiple merged spheres:
- Bottom layer: Wide, flat puffs
- Middle layer: Medium bumps
- Top layer: Rounded peaks

### Material

- White with slight blue tint
- Emissive for sky glow
- Depth pre-pass for transparency sorting
- Animated drift across the sky

## Sky

### Dome

- Large inverted sphere (backface rendering)
- Gradient from horizon blue to zenith white
- Procedural coloring based on Y position

### Sun

- Emissive yellow-white sphere
- Positioned to match directional light
- Subtle glow via emissive color

## Settlement System

Projects in The Reach are visualized as evolving settlements that grow and change based on multiple factors. This creates a living world where you can see the health and progress of your projects at a glance.

### Project Health Score

Each project calculates a **Health Score (0-100)** based on weighted factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| Task Completion | 35% | Percentage of tasks marked done |
| Recent Activity | 25% | Work done in the last 7/14/30 days |
| Project Age Bonus | 15% | Mature projects with sustained progress |
| GitHub Activity | 15% | Commits, PRs, issues (if connected) |
| Consistency | 10% | Regular work vs. sporadic bursts |

```
Health Score = (TaskCompletion × 0.35) + (RecentActivity × 0.25) +
               (AgeBonus × 0.15) + (GitHubActivity × 0.15) +
               (Consistency × 0.10)
```

### Settlement Tiers

The Health Score determines which settlement tier is displayed:

#### Tier 1: Campsite (Health 0-20)
*A new project or one that needs attention*

**Visual Elements:**
- 2-3 small tents (triangular prisms)
- Central campfire with animated flames
- Scattered supply crates
- Single torch for light
- Dirt/trampled grass ground texture

**Triggers:**
- New project (< 7 days old)
- No tasks completed
- No activity in 30+ days
- Abandoned GitHub repo

---

#### Tier 2: Outpost (Health 21-40)
*Early progress, foundations being laid*

**Visual Elements:**
- Wooden palisade wall (partial)
- 1-2 small wooden huts
- Watchtower (simple platform)
- Storage tent
- Small garden plot
- 2-3 torches

**Triggers:**
- 10-25% tasks completed
- Some activity in last 14 days
- Initial GitHub commits

---

#### Tier 3: Village (Health 41-60)
*Steady progress, taking shape*

**Visual Elements:**
- Complete wooden palisade
- 4-6 varied buildings (homes, workshop, storage)
- Central well or fountain
- Dirt paths between buildings
- Small market stalls
- Smoke from chimneys
- Lanterns and torches throughout

**Triggers:**
- 25-50% tasks completed
- Regular weekly activity
- Active GitHub branch with recent commits

---

#### Tier 4: Town (Health 61-80)
*Thriving project, significant progress*

**Visual Elements:**
- Stone walls replacing wooden
- 8-12 buildings (2-story structures)
- Town hall / central building
- Paved main street
- Marketplace with awnings
- Church/temple spire
- Working watermill or windmill
- Guard towers at gates
- Ambient NPCs (tiny figures)

**Triggers:**
- 50-75% tasks completed
- Consistent activity over 30+ days
- Multiple GitHub contributors
- Regular PR merges

---

#### Tier 5: Castle (Health 81-100)
*Project excellence, near completion*

**Visual Elements:**
- Full stone castle with towers
- Inner and outer walls
- Keep (tall central tower)
- Courtyard with activity
- Flags/banners in project color
- Moat or decorative water feature
- Surrounding village buildings
- Glowing windows at night
- Particle effects (birds, smoke, sparkles)

**Triggers:**
- 75-100% tasks completed
- Sustained high activity
- Healthy GitHub metrics
- Project milestones achieved

---

### Activity Metrics

#### Recent Activity Calculation

Activity is measured on a sliding scale with decay:

```
RecentActivity = (Last7Days × 1.0) + (Last14Days × 0.6) + (Last30Days × 0.3)
                 ─────────────────────────────────────────────────────────────
                                    Expected Activity Rate
```

**What counts as activity:**
- Task created (+1)
- Task status changed (+2)
- Task completed (+5)
- Project settings modified (+1)
- GitHub commit (+2)
- GitHub PR opened (+3)
- GitHub PR merged (+5)
- GitHub issue closed (+3)

#### Consistency Score

Measures regular engagement vs. sporadic bursts:

```
Consistency = 1 - (StandardDeviation(DailyActivity) / Mean(DailyActivity))
```

- **High consistency**: Work spread evenly across days/weeks
- **Low consistency**: Long gaps followed by intense bursts

### Project Age Bonus

Projects earn trust over time with sustained progress:

| Age | Multiplier | Requirement |
|-----|------------|-------------|
| < 7 days | 0.5x | New project |
| 7-30 days | 0.75x | Some sustained work |
| 1-3 months | 1.0x | Established project |
| 3-6 months | 1.15x | Mature project |
| 6+ months | 1.25x | Long-term project |

*Note: Age bonus only applies if the project shows continued activity. An old abandoned project doesn't get bonus points.*

### GitHub Integration

Connect a GitHub repository to automatically track development progress.

#### Setup
```
Project Settings → Integrations → Connect GitHub
  → Authorize The Reach
  → Select repository
  → Choose tracking options
```

#### Tracked Metrics

| Metric | Points | Notes |
|--------|--------|-------|
| Commit | +2 | Per commit to tracked branches |
| PR Opened | +3 | New pull request |
| PR Merged | +5 | Successfully merged |
| PR Closed (no merge) | +1 | Reviewed but not merged |
| Issue Opened | +1 | New issue created |
| Issue Closed | +3 | Issue resolved |
| Release Published | +10 | New version released |
| Branch Created | +1 | Feature branch started |

#### Branch Tracking

Choose which branches to monitor:
- **Main/Master only**: Production-focused tracking
- **All branches**: Full development activity
- **Custom pattern**: e.g., `feature/*`, `release/*`

#### Commit Message Parsing

Optionally link commits to tasks:
```
git commit -m "Fix login bug [REACH-42]"
```
- Automatically marks task #42 as progressed
- Links commit to task history
- Bonus points for linked commits (+1)

### Settlement Decay

Projects can regress if abandoned:

#### Decay Timeline

| Inactivity Period | Effect |
|-------------------|--------|
| 7 days | Warning indicator (yellow) |
| 14 days | Settlement dims slightly |
| 30 days | Drop 1 tier |
| 60 days | Drop 2 tiers |
| 90 days | Reduce to Campsite |
| 180 days | "Ruins" visual state |

#### Ruins State

Abandoned projects (180+ days inactive) display as ruins:
- Crumbling walls
- Overgrown vegetation
- Muted/desaturated colors
- No ambient activity
- Cobwebs and decay particles

*Ruins can be restored by resuming activity - they rebuild over time.*

### Visual Transitions

Settlements don't instantly change - they animate between states:

#### Upgrade Animation
1. Construction scaffolding appears
2. Workers (tiny figures) move around
3. New buildings fade in over 2-3 seconds
4. Celebration particles (confetti, fireworks)
5. Settlement "levels up" with fanfare

#### Downgrade Animation
1. Buildings slowly weather/fade
2. Color saturation decreases
3. Ambient activity reduces
4. Structures simplify over time
5. No dramatic transition - gradual decline

### Procedural Building Placement

Buildings within settlements are procedurally placed:

```javascript
Settlement Layout Algorithm:
1. Place central building (town hall/keep)
2. Create main road from entrance to center
3. Place important buildings along main road
4. Fill remaining space with housing
5. Add decorative elements (wells, trees, fences)
6. Ensure pathways connect all buildings
```

#### Building Variety

Each tier has a pool of building types:

**Campsite**: tent_small, tent_large, crate, barrel, campfire
**Outpost**: hut_wood, storage_shed, watchtower_wood, fence_section
**Village**: house_small, house_medium, workshop, market_stall, well
**Town**: house_large, shop, inn, church, guardtower, fountain
**Castle**: keep, tower, wall_section, gate, barracks, stable, chapel

### Agent Visualization

AI agents working on projects appear as animated characters:

#### Agent Types

| Agent | Appearance | Role |
|-------|------------|------|
| Builder | Hard hat, hammer | Creating new features |
| Fixer | Wrench, toolbelt | Bug fixes |
| Researcher | Glasses, scroll | Investigation/analysis |
| Messenger | Wings, letter | Communication/notifications |
| Guardian | Shield, sword | Security/monitoring |

#### Agent Behavior

- Agents spawn at project when work begins
- Walk between buildings purposefully
- Carry items related to their task
- Multiple agents for parallel work
- Despawn with completion particles when done

#### Agent Trails

When an agent works across multiple projects:
- Dotted line shows travel path
- Agent animates moving between islands
- Creates visual connection between related projects

### Ambient Life

Settlements have ambient activity based on health:

| Health | Ambient Elements |
|--------|------------------|
| 0-20 | Flickering campfire, occasional bird |
| 21-40 | Smoke from huts, patrolling guard |
| 41-60 | Villagers walking, animals, market activity |
| 61-80 | Busy streets, carts, multiple smoke plumes |
| 81-100 | Festivals, parades, glowing prosperity |

### Time of Day Effects

Settlements respond to a day/night cycle:

**Day**: Full activity, bright colors, working NPCs
**Sunset**: Warm orange lighting, workers heading home
**Night**: Lit windows, torches, guards patrolling, quieter
**Dawn**: Roosters crow, activity slowly resumes

### Sound Design (Future)

Each settlement tier has ambient audio:

- **Campsite**: Crackling fire, wind, occasional owl
- **Outpost**: Hammering, sawing, footsteps
- **Village**: Chatter, animals, market sounds
- **Town**: Busy crowd, bells, carts on cobblestone
- **Castle**: Horns, marching, grand ambiance

## Future Directions

### Multi-Project Relationships

- Visual roads connecting related projects
- Trade routes showing dependencies
- Shared resources between linked projects

### Seasonal Events

- Winter: Snow-covered settlements
- Spring: Blooming flowers, renewal
- Summer: Festivals, peak activity
- Autumn: Harvest themes, preparation

### Achievement System

Unlock cosmetic rewards for project milestones:
- Custom banners and flags
- Unique building styles
- Special particle effects
- Legendary structures
