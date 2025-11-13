#import includes::bindings
#import includes::textures
#import includes::interactions

const VISCOSITY = 0.0001;
const DIFFUSION = 0.0001;
const DT = 0.016;

@compute @workgroup_size(16, 16)
fn advect_velocity(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = canvas.size;
    let idx = vec2i(id.xy);

    if (idx.x >= size.x || idx.y >= size.y) {
        return;
    }

    let vel_x = textureLoad(velocity, idx, 0).x;
    let vel_y = textureLoad(velocity, idx, 1).x;
    let vel = vec2f(vel_x, vel_y);
    let backTrace = vec2f(idx) - vel * DT;

    let x0 = i32(floor(backTrace.x));
    let y0 = i32(floor(backTrace.y));
    let x1 = x0 + 1;
    let y1 = y0 + 1;

    let sx = backTrace.x - f32(x0);
    let sy = backTrace.y - f32(y0);

    let vx00 = textureLoad(velocity, vec2i((x0 + size.x) % size.x, (y0 + size.y) % size.y), 0).x;
    let vx10 = textureLoad(velocity, vec2i((x1 + size.x) % size.x, (y0 + size.y) % size.y), 0).x;
    let vx01 = textureLoad(velocity, vec2i((x0 + size.x) % size.x, (y1 + size.y) % size.y), 0).x;
    let vx11 = textureLoad(velocity, vec2i((x1 + size.x) % size.x, (y1 + size.y) % size.y), 0).x;

    let vy00 = textureLoad(velocity, vec2i((x0 + size.x) % size.x, (y0 + size.y) % size.y), 1).x;
    let vy10 = textureLoad(velocity, vec2i((x1 + size.x) % size.x, (y0 + size.y) % size.y), 1).x;
    let vy01 = textureLoad(velocity, vec2i((x0 + size.x) % size.x, (y1 + size.y) % size.y), 1).x;
    let vy11 = textureLoad(velocity, vec2i((x1 + size.x) % size.x, (y1 + size.y) % size.y), 1).x;

    let topX = mix(vx00, vx10, sx);
    let bottomX = mix(vx01, vx11, sx);
    let newVelX = mix(topX, bottomX, sy);

    let topY = mix(vy00, vy10, sx);
    let bottomY = mix(vy01, vy11, sx);
    let newVelY = mix(topY, bottomY, sy);

    textureStore(velocity, idx, 0, vec4f(newVelX, 0.0, 0.0, 0.0));
    textureStore(velocity, idx, 1, vec4f(newVelY, 0.0, 0.0, 0.0));
}

@compute @workgroup_size(16, 16)
fn diffuse_velocity(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = canvas.size;
    let idx = vec2i(id.xy);

    if (idx.x >= size.x || idx.y >= size.y) {
        return;
    }

    let leftX = textureLoad(velocity, vec2i((idx.x - 1 + size.x) % size.x, idx.y), 0).x;
    let rightX = textureLoad(velocity, vec2i((idx.x + 1) % size.x, idx.y), 0).x;
    let downX = textureLoad(velocity, vec2i(idx.x, (idx.y - 1 + size.y) % size.y), 0).x;
    let upX = textureLoad(velocity, vec2i(idx.x, (idx.y + 1) % size.y), 0).x;
    let centerX = textureLoad(velocity, idx, 0).x;

    let leftY = textureLoad(velocity, vec2i((idx.x - 1 + size.x) % size.x, idx.y), 1).x;
    let rightY = textureLoad(velocity, vec2i((idx.x + 1) % size.x, idx.y), 1).x;
    let downY = textureLoad(velocity, vec2i(idx.x, (idx.y - 1 + size.y) % size.y), 1).x;
    let upY = textureLoad(velocity, vec2i(idx.x, (idx.y + 1) % size.y), 1).x;
    let centerY = textureLoad(velocity, idx, 1).x;

    let a = DT * VISCOSITY * f32(size.x * size.y);
    let newVelX = (centerX + a * (leftX + rightX + downX + upX)) / (1.0 + 4.0 * a);
    let newVelY = (centerY + a * (leftY + rightY + downY + upY)) / (1.0 + 4.0 * a);

    textureStore(velocity, idx, 0, vec4f(newVelX, 0.0, 0.0, 0.0));
    textureStore(velocity, idx, 1, vec4f(newVelY, 0.0, 0.0, 0.0));
}

@compute @workgroup_size(16, 16)
fn compute_divergence(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = canvas.size;
    let idx = vec2i(id.xy);

    if (idx.x >= size.x || idx.y >= size.y) {
        return;
    }

    let left = textureLoad(velocity, vec2i((idx.x - 1 + size.x) % size.x, idx.y), 0).x;
    let right = textureLoad(velocity, vec2i((idx.x + 1) % size.x, idx.y), 0).x;
    let down = textureLoad(velocity, vec2i(idx.x, (idx.y - 1 + size.y) % size.y), 1).x;
    let up = textureLoad(velocity, vec2i(idx.x, (idx.y + 1) % size.y), 1).x;

    let div = 0.5 * ((right - left) + (up - down));
    textureStore(divergence, idx, vec4f(div, 0.0, 0.0, 0.0));
}

@compute @workgroup_size(16, 16)
fn solve_pressure(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = canvas.size;
    let idx = vec2i(id.xy);

    if (idx.x >= size.x || idx.y >= size.y) {
        return;
    }

    let left = textureLoad(pressure, vec2i((idx.x - 1 + size.x) % size.x, idx.y)).x;
    let right = textureLoad(pressure, vec2i((idx.x + 1) % size.x, idx.y)).x;
    let down = textureLoad(pressure, vec2i(idx.x, (idx.y - 1 + size.y) % size.y)).x;
    let up = textureLoad(pressure, vec2i(idx.x, (idx.y + 1) % size.y)).x;
    let div = textureLoad(divergence, idx).x;

    let newPressure = (left + right + down + up - div) * 0.25;
    textureStore(pressure, idx, vec4f(newPressure, 0.0, 0.0, 0.0));
}

@compute @workgroup_size(16, 16)
fn subtract_gradient(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = canvas.size;
    let idx = vec2i(id.xy);

    if (idx.x >= size.x || idx.y >= size.y) {
        return;
    }

    let left = textureLoad(pressure, vec2i((idx.x - 1 + size.x) % size.x, idx.y)).x;
    let right = textureLoad(pressure, vec2i((idx.x + 1) % size.x, idx.y)).x;
    let down = textureLoad(pressure, vec2i(idx.x, (idx.y - 1 + size.y) % size.y)).x;
    let up = textureLoad(pressure, vec2i(idx.x, (idx.y + 1) % size.y)).x;

    let vel_x = textureLoad(velocity, idx, 0).x;
    let vel_y = textureLoad(velocity, idx, 1).x;
    let gradient = vec2f(right - left, up - down) * 0.5;
    let newVel = vec2f(vel_x, vel_y) - gradient;

    textureStore(velocity, idx, 0, vec4f(newVel.x, 0.0, 0.0, 0.0));
    textureStore(velocity, idx, 1, vec4f(newVel.y, 0.0, 0.0, 0.0));
}

@compute @workgroup_size(16, 16)
fn advect_dye(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = canvas.size;
    let idx = vec2i(id.xy);

    if (idx.x >= size.x || idx.y >= size.y) {
        return;
    }

    let vel_x = textureLoad(velocity, idx, 0).x;
    let vel_y = textureLoad(velocity, idx, 1).x;
    let vel = vec2f(vel_x, vel_y);
    let backTrace = vec2f(idx) - vel * DT * 10.0;

    let x0 = i32(floor(backTrace.x));
    let y0 = i32(floor(backTrace.y));
    let x1 = x0 + 1;
    let y1 = y0 + 1;

    let sx = backTrace.x - f32(x0);
    let sy = backTrace.y - f32(y0);

    let d00 = textureLoad(dye, vec2i((x0 + size.x) % size.x, (y0 + size.y) % size.y)).x;
    let d10 = textureLoad(dye, vec2i((x1 + size.x) % size.x, (y0 + size.y) % size.y)).x;
    let d01 = textureLoad(dye, vec2i((x0 + size.x) % size.x, (y1 + size.y) % size.y)).x;
    let d11 = textureLoad(dye, vec2i((x1 + size.x) % size.x, (y1 + size.y) % size.y)).x;

    let top = mix(d00, d10, sx);
    let bottom = mix(d01, d11, sx);
    let newDye = mix(top, bottom, sy);

    textureStore(dye, idx, vec4f(newDye, 0.0, 0.0, 0.0));
}

@compute @workgroup_size(16, 16)
fn apply_forces(@builtin(global_invocation_id) id: vec3<u32>) {
    let size = canvas.size;
    let idx = vec2i(id.xy);

    if (idx.x >= size.x || idx.y >= size.y) {
        return;
    }

    if (interactions.size != interactions.size) {
        return;
    }

    let x = vec2<f32>(idx);
    let dims = vec2<f32>(size);
    let distance = length((x - interactions.position) - dims * floor((x - interactions.position) / dims + 0.5));

    if distance < abs(interactions.size) {
        let vel_x = textureLoad(velocity, idx, 0).x;
        let vel_y = textureLoad(velocity, idx, 1).x;
        let vel = vec2f(vel_x, vel_y);
        let dir = x - interactions.position;
        let dir_length = length(dir);

        if dir_length > 0.1 {
            let force = (dir / dir_length) * sign(interactions.size) * 5.0;
            let newVel = vel + force;
            textureStore(velocity, idx, 0, vec4f(newVel.x, 0.0, 0.0, 0.0));
            textureStore(velocity, idx, 1, vec4f(newVel.y, 0.0, 0.0, 0.0));
        }

        let hue = fract((interactions.position.x + interactions.position.y) / (dims.x + dims.y));
        let color = hsv_to_rgb(vec3f(hue, 1.0, 1.0));
        let brightness = (color.r + color.g + color.b) / 3.0;
        textureStore(dye, idx, vec4f(brightness, 0.0, 0.0, 0.0));
    }
}

fn hsv_to_rgb(hsv: vec3f) -> vec3f {
    let h = hsv.x * 6.0;
    let s = hsv.y;
    let v = hsv.z;

    let c = v * s;
    let x = c * (1.0 - abs(fract(h * 0.5) * 2.0 - 1.0));
    let m = v - c;

    var rgb = vec3f(0.0);
    if (h < 1.0) {
        rgb = vec3f(c, x, 0.0);
    } else if (h < 2.0) {
        rgb = vec3f(x, c, 0.0);
    } else if (h < 3.0) {
        rgb = vec3f(0.0, c, x);
    } else if (h < 4.0) {
        rgb = vec3f(0.0, x, c);
    } else if (h < 5.0) {
        rgb = vec3f(x, 0.0, c);
    } else {
        rgb = vec3f(c, 0.0, x);
    }

    return rgb + m;
}
