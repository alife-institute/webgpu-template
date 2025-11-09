/**
 * Compute Shader - Conway's Game of Life (In-Place Update)
 *
 * NOTE: This uses a single read-write texture for simplicity.
 * For cellular automata with neighbor dependencies, this creates race conditions
 * because cells may read a mix of old and new states. This produces interesting
 * visual artifacts but is not the "correct" Game of Life algorithm.
 *
 * For deterministic cellular automata, use double-buffering (see git history).
 * This pattern works well for simulations without neighbor dependencies.
 */

@group(0) @binding(0) var stateTexture: texture_storage_2d<r32uint, read_write>;

// Count the number of alive neighbors around a cell
fn countNeighbors(pos: vec2i) -> u32 {
    let size = vec2i(textureDimensions(stateTexture));
    var count = 0u;

    // Check all 8 neighbors
    for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) {
                continue; // Skip the center cell
            }

            // Wrap around edges (toroidal topology)
            let neighbor = vec2i(
                (pos.x + dx + size.x) % size.x,
                (pos.y + dy + size.y) % size.y
            );

            let cell = textureLoad(stateTexture, neighbor);
            if (cell.r > 0u) {
                count += 1u;
            }
        }
    }

    return count;
}

@compute @workgroup_size(16, 16)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let pos = vec2i(global_id.xy);
    let size = vec2i(textureDimensions(stateTexture));

    // Boundary check
    if (pos.x >= size.x || pos.y >= size.y) {
        return;
    }

    // Get current cell state
    let currentCell = textureLoad(stateTexture, pos);
    let isAlive = currentCell.r > 0u;

    // Count neighbors
    let neighbors = countNeighbors(pos);

    // Apply Game of Life rules
    var newState = 0u;
    if (isAlive) {
        // Survival: 2 or 3 neighbors
        if (neighbors == 2u || neighbors == 3u) {
            newState = 1u;
        }
    } else {
        // Birth: exactly 3 neighbors
        if (neighbors == 3u) {
            newState = 1u;
        }
    }

    // Write result back to same texture
    textureStore(stateTexture, pos, vec4u(newState, 0u, 0u, 0u));
}
