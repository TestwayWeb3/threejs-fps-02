// player.js — the player's body: look, movement with acceleration and
// friction, crouching, map collision, and taking damage. The plant and
// defuse channels live here too: holding E in the right place fills
// progress; letting go drains it.

import { CFG, ARMOR_ABSORB } from "./config.js";
import { collideMove, MAP } from "./map.js";

const MOVE_OUT = { x: 0, z: 0 };

export function eyeHeight(S) {
  return S.player.crouch ? CFG.crouchEye : CFG.eyeHeight;
}

export function stepPlayer(S, dt) {
  const p = S.player;
  const input = S.input;
  if (!p.alive) {
    input.lookX = 0; input.lookY = 0;
    return;
  }
  // Look: consume accumulated mouse deltas, then decay unrecovered recoil.
  p.yaw -= input.lookX;
  p.pitch -= input.lookY;
  input.lookX = 0; input.lookY = 0;
  p.pitch = Math.max(-CFG.maxPitch, Math.min(CFG.maxPitch, p.pitch));
  p.recoilPitch *= Math.exp(-6 * dt);
  p.recoilYaw *= Math.exp(-6 * dt);
  p.bloom = Math.max(0, p.bloom - 0.03 * dt);

  p.crouch = !!(input.keys.KeyC || input.keys.ControlLeft || input.keys.ControlRight);
  p.sprint = !!(input.keys.ShiftLeft || input.keys.ShiftRight) && !p.crouch;

  // Wish direction in world space from the view yaw.
  let wx = 0, wz = 0;
  const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
  if (input.keys.KeyW || input.keys.ArrowUp) { wx += -sy; wz += -cy; }
  if (input.keys.KeyS || input.keys.ArrowDown) { wx += sy; wz += cy; }
  if (input.keys.KeyA || input.keys.ArrowLeft) { wx += -cy; wz += sy; }
  if (input.keys.KeyD || input.keys.ArrowRight) { wx += cy; wz += -sy; }
  const wlen = Math.hypot(wx, wz);
  const maxSpeed = p.crouch ? CFG.crouchSpeed : (p.sprint ? CFG.sprintSpeed : CFG.walkSpeed);
  if (wlen > 0) {
    wx /= wlen; wz /= wlen;
    p.vx += wx * CFG.accel * dt;
    p.vz += wz * CFG.accel * dt;
    const speed = Math.hypot(p.vx, p.vz);
    if (speed > maxSpeed) {
      p.vx = (p.vx / speed) * maxSpeed;
      p.vz = (p.vz / speed) * maxSpeed;
    }
  } else {
    const damp = Math.max(0, 1 - CFG.friction * dt);
    p.vx *= damp; p.vz *= damp;
    if (Math.hypot(p.vx, p.vz) < 0.05) { p.vx = 0; p.vz = 0; }
  }
  collideMove(p.x, p.z, CFG.bodyRadius, p.vx * dt, p.vz * dt, MOVE_OUT);
  p.x = MOVE_OUT.x; p.z = MOVE_OUT.z;

  // Walk bob and footstep timing feed the viewmodel and the audio.
  const speed = Math.hypot(p.vx, p.vz);
  if (speed > 0.5) {
    p.bobPhase += dt * speed * 1.6;
    if (S.time >= p.stepAt) {
      p.stepAt = S.time + (p.crouch ? 0.55 : 0.38);
      p.stepped = true;
    }
  }

  stepChannel(S, dt);
  p.flash = Math.max(0, p.flash - dt);
  p.damageFlash = Math.max(0, p.damageFlash - dt * 1.4);
}

function stepChannel(S, dt) {
  const p = S.player;
  const holding = !!S.input.keys.KeyE;
  const charge = S.charge;
  // The player is Vanguard (attackers): only planting applies. Defusing
  // is the defenders' job and runs through the Warden bots.
  const kind = charge.state === "carried" && charge.carrier === "player" && inSite(p.x, p.z) ? "plant" : null;
  if (kind && holding && !p.reloading) {
    p.channelKind = kind;
    const rate = kind === "plant" ? CFG.plantTime : CFG.defuseTime;
    p.channel = Math.min(1, p.channel + dt / rate);
    if (p.channel >= 1) {
      p.channelDone = kind; // main.js resolves the completed channel
      p.channel = 0;
      p.channelKind = null;
    }
  } else {
    p.channel = Math.max(0, p.channel - dt * 0.5);
    if (p.channel === 0) p.channelKind = null;
  }
}

function inSite(x, z) {
  const s = MAP.site;
  return x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;
}

// Damage the player. Armor absorbs a share. Returns true when killed.
export function damagePlayer(S, dmg, fromX, fromZ) {
  const p = S.player;
  if (!p.alive) return false;
  if (p.armor) dmg *= (1 - ARMOR_ABSORB);
  p.hp -= dmg;
  p.damageFlash = 1;
  p.lastDamageDir = Math.atan2(fromX - p.x, fromZ - p.z);
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    p.deaths++;
    return true;
  }
  return false;
}
