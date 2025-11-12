#import includes::bindings
#import includes::textures
#import includes::interactions

@compute @workgroup_size(16, 16)
fn count_neighbors(@builtin(global_invocation_id) id: vec3<u32>) {

    let size = canvas.size;
    let idx = vec2i(id.xy);

    for (var layer = 0; layer < 2; layer++) {
        var count = 0u;

        for (var dy = -1; dy <= 1; dy++) {
            for (var dx = -1; dx <= 1; dx++) {
                if (dx == 0 && dy == 0) {
                    continue;
                }

                // Wrap around edges (toroidal topology)
                let neighbor = vec2i(
                    (idx.x + dx + size.x) % size.x,
                    (idx.y + dy + size.y) % size.y
                );

                let cell = textureLoad(states, neighbor, layer);
                if (cell.r > 0u) {
                    count += 1u;
                }
            }
        }
        textureStore(neighbors, idx, layer, vec4u(count, 0u, 0u, 0u));
    }
}

@compute @workgroup_size(16, 16)
fn apply_rule(@builtin(global_invocation_id) id: vec3<u32>) {

    let size = canvas.size;
    let idx = vec2i(id.xy);

    if (idx.x >= size.x || idx.y >= size.y) {
        return;
    }

    // Canvas interaction: per-layer brush painting
    let x = vec2<f32>(idx);
    let dims = vec2<f32>(size);
    let distance = length((x - interactions.position) - dims * floor((x - interactions.position) / dims + 0.5));

    let layer = select(0, 1, sign(interactions.size) > 0.0);
    if distance < abs(interactions.size) {
        textureStore(states, idx, layer, vec4u(1u, 0u, 0u, 0u));
    }

    for (var layer = 0; layer < 2; layer++) {

        let currentCell = textureLoad(states, idx, layer);
        let isAlive = currentCell.r > 0u;

        let neighbors = textureLoad(neighbors, idx, layer).r;

        // Game of Life rules
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

        textureStore(states, idx, layer, vec4u(newState, 0u, 0u, 0u));
    }
}
