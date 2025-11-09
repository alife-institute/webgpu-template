/**
 * Compute Shader - Conway's Game of Life
 *
 * This is a simple example of a 2D cellular automaton simulation.
 * Modify this shader to create your own simulations!
 *
 * Rules of Game of Life:
 * 1. Any live cell with 2-3 neighbors survives
 * 2. Any dead cell with exactly 3 neighbors becomes alive
 * 3. All other cells die or stay dead
 */

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;

// Count the number of alive neighbors around a cell
fn countNeighbors(pos: vec2i) -> u32 {
    let size = vec2i(textureDimensions(inputTexture));
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

            let cell = textureLoad(inputTexture, neighbor, 0);
            if (cell.r > 0.5) {
                count += 1u;
            }
        }
    }

    return count;
}

@compute @workgroup_size(16, 16)
fn compute_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let pos = vec2i(global_id.xy);
    let size = vec2i(textureDimensions(inputTexture));

    // Boundary check
    if (pos.x >= size.x || pos.y >= size.y) {
        return;
    }

    // Get current cell state
    let currentCell = textureLoad(inputTexture, pos, 0);
    let isAlive = currentCell.r > 0.5;

    // Count neighbors
    let neighbors = countNeighbors(pos);

    // Apply Game of Life rules
    var newState = 0.0;
    if (isAlive) {
        // Survival: 2 or 3 neighbors
        if (neighbors == 2u || neighbors == 3u) {
            newState = 1.0;
        }
    } else {
        // Birth: exactly 3 neighbors
        if (neighbors == 3u) {
            newState = 1.0;
        }
    }

    // Write result with some color variation based on neighbors
    let color = vec4f(newState, newState * 0.8, newState * 0.6, 1.0);
    textureStore(outputTexture, pos, color);
}
