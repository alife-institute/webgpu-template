# Game of Life Example

Conway's Game of Life with interactive brush painting on two independent layers.

## Features

### Two-Layer Simulation
- **Layer 0 (Cyan)**: Independent Game of Life simulation
- **Layer 1 (Magenta)**: Independent Game of Life simulation
- **Overlap (White)**: When both layers have living cells at the same position

### Interactive Brush Painting
- **Left click** or **single touch**: Paint layer 0 (cyan cells)
- **Right click** or **multi-touch**: Paint layer 1 (magenta cells)
- **Scroll wheel**: Adjust brush size

### Game of Life Rules
- **Survival**: Live cell with 2-3 neighbors survives
- **Birth**: Dead cell with exactly 3 neighbors becomes alive
- **Death**: Otherwise (underpopulation <2 or overpopulation >3)

### Toroidal Topology
The simulation wraps around edges (like Pac-Man), so:
- Cells at the left edge are neighbors with cells at the right edge
- Cells at the top are neighbors with cells at the bottom
- Brush painting also wraps around edges

## Implementation Details

### Two-Pass Algorithm (Race Condition Free)

**Pass 1: Count Neighbors** (`count_neighbors`):
- Reads current states from `states` texture
- Counts neighbors for each cell
- Writes counts to separate `neighbors` texture
- **No race conditions**: Reads and writes to different textures

**Pass 2: Apply Rules** (`apply_rule`):
- Reads from `neighbors` texture (computed counts)
- Reads from `states` texture (current alive/dead)
- Applies Game of Life rules
- Handles brush painting (overrides rules when active)
- Writes new states to `states` texture
- **No race conditions**: All reads complete before writes begin

### Brush Sign Convention

The `interactions.size` field encodes both brush radius and target layer:
- **Positive size**: Paint layer 0 (left click, single touch)
- **Negative size**: Paint layer 1 (right click, multi-touch)
- **NaN**: Brush inactive (mouse up, touch end)

From `utils.ts:193-199`:
```typescript
// Mouse: left click (button 0) = +1, right click (button 2) = -1
sign = 1 - event.button;

// Touch: single touch = +1, multi-touch = -1
sign = event.touches.length > 1 ? -1 : 1;

uniformBufferData.set([sign * size], 2);
```

## Building and Running

```bash
# Build
npm run build -- --env example=game-of-life

# Development server (hot-reload)
npm start -- --env example=game-of-life

# Test with capture tool (after building)
npm run capture
```

## Files

```
game-of-life/
├── index.ts                    # Main entry point
└── shaders/
    ├── compute.wgsl            # Two compute kernels: count_neighbors, apply_rule
    ├── render.wgsl             # Fragment shader with layer color mapping
    └── includes/
        ├── bindings.wgsl       # Binding indices for buffers and textures
        ├── textures.wgsl       # States and neighbors texture declarations
        └── interactions.wgsl   # Canvas, controls, and interactions structs
```

## Customization Ideas

1. **Different rules**: Modify the survival/birth conditions in `apply_rule`
2. **More layers**: Extend to 3+ layers with different colors
3. **Persistent trails**: Fade cells gradually instead of instant death
4. **Reaction-diffusion**: Use the two-layer structure for chemical simulation
5. **Brush modes**: Erase, toggle, or different patterns
