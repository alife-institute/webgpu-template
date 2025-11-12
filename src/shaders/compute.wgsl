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

    // canvas interaction
    var brush = false;
    let x = vec2<f32>(idx);
    let y = interactions.position;

    let dims = vec2<f32>(size);
    let distance = length((x - y) - dims * floor((x - y) / dims + 0.5));

    if distance < abs(interactions.size) {
        brush = true;
    }

    for (var layer = 0; layer < 2; layer++) {

        if brush {
            textureStore(states, idx, layer, vec4u(1u, 0u, 0u, 0u));
            continue;
        }

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
