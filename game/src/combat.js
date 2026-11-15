// combat.js — everything about shooting: the player's hitscan fire with
// spread, recoil and bloom, bot fire, reloading, grenades, damage, and
// the buy menu's economy. Hit tests run against bodies (a head sphere
// and a body cylinder per fighter) and stop at the first wall.

import { CFG, WEAPONS, GRENADE, ARMOR_PRICE } from "./config.js";
import { rayWallDist, segmentBlocked, collideMove } from "./map.js";
import { damagePlayer, eyeHeight } from "./player.js";
import { FX } from "./effects.js";
import { AU } from "./audio.js";

export function addFeed(S, text) {
  S.feed.unshift({ text, t: S.time });
  if (S.feed.length > 5) S.feed.length = 5;
}

export function currentGun(S) {
  const p = S.player;
  return p.slot === "primary" && p.primary ? p.primary : p.sidearm;
}

export function currentDef(S) {
  return WEAPONS[currentGun(S).id];
}

function falloff(def, dist) {
  if (dist <= def.falloffStart) return 1;
  const f = (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return 1 - 0.4 * Math.min(1, f);
}

// Ray against one fighter. Returns the hit distance and whether the head
// was struck, or Infinity when the ray misses. Head is a sphere; the
// body is a vertical cylinder from the knees to the shoulders.
function rayFighter(ox, oy, oz, dx, dy, dz, x, z, crouch, headY, bodyTop) {
  let best = Infinity, head = false;
  const hx = x - ox, hy = headY - oy, hz = z - oz;
  const tca = hx * dx + hy * dy + hz * dz;
  if (tca > 0) {
    const d2 = hx * hx + hy * hy + hz * hz - tca * tca;
    if (d2 < 0.26 * 0.26) {
      const t = tca - Math.sqrt(0.26 * 0.26 - d2);
      if (t > 0) { best = t; head = true; }
    }
  }
  const rx = ox - x, rz = oz - z;
  const a = dx * dx + dz * dz;
  if (a > 1e-9) {
    const b = 2 * (rx * dx + rz * dz);
    const c = rx * rx + rz * rz - CFG.bodyRadius * CFG.bodyRadius;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t > 0 && t < best) {
        const y = oy + dy * t;
        const top = crouch ? bodyTop - 0.45 : bodyTop;
        if (y > 0.1 && y < top) { best = t; head = false; }
      }
    }
  }
  return { dist: best, head };
}

// Find the first body hit along a ray, ignoring the shooter's own team.
// Returns { target, bot, head, dist } with target "player", "bot", or null.
export function raycastShot(S, ox, oy, oz, dx, dy, dz, shooterTeam) {
  const wall = rayWallDist(ox, oy, oz, dx, dy, dz, 80);
  let best = wall, target = null, bot = null, head = false;
  const p = S.player;
  if (p.alive && shooterTeam !== "V") {
    const h = rayFighter(ox, oy, oz, dx, dy, dz, p.x, p.z, p.crouch, eyeHeight(S) - 0.12, 1.45);
    if (h.dist < best) { best = h.dist; target = "player"; head = h.head; }
  }
  for (const b of S.bots) {
    if (!b.alive || b.team === shooterTeam) continue;
    const h = rayFighter(ox, oy, oz, dx, dy, dz, b.x, b.z, false, CFG.botEye, 1.45);
    if (h.dist < best) { best = h.dist; target = "bot"; bot = b; head = h.head; }
  }
  return { target, bot, head, dist: best, wall };
}

function applyHit(S, hit, dmg, attacker, isPlayerAttacker) {
  if (hit.target === "player") {
    const killed = damagePlayer(S, dmg, attacker.x, attacker.z);
    if (isPlayerAttacker) { S.stats.hits++; S.hitmarkAt = S.time; AU.play("hit"); }
    if (killed) onKill(S, attacker, "You", isPlayerAttacker);
    return killed;
  }
  if (hit.target === "bot") {
    const b = hit.bot;
    b.hp -= dmg;
    b.spottedAt = S.time; // a hit reveals the bot on the minimap briefly
    if (isPlayerAttacker) { S.stats.hits++; S.hitmarkAt = S.time; AU.play("hit"); }
    b.seen = { x: attacker.x, z: attacker.z, t: S.time };
    b.hearX = attacker.x; b.hearZ = attacker.z; b.hearAt = S.time;
    if (b.hp <= 0) {
      b.hp = 0; b.alive = false;
      onKill(S, attacker, b.name, isPlayerAttacker);
      if (S.charge.state === "carried" && S.charge.carrier === b.id) {
        S.charge.state = "dropped";
        S.charge.x = b.x; S.charge.z = b.z;
        addFeed(S, "The charge dropped at " + b.name + "'s position.");
      }
      return true;
    }
  }
  return false;
}

function onKill(S, attacker, victimName, isPlayerAttacker) {
  const name = attacker.name || "You";
  addFeed(S, name + " eliminated " + victimName + ".");
  if (isPlayerAttacker) {
    S.player.kills++;
    S.player.money = Math.min(CFG.maxMoney, S.player.money + CFG.killMoney);
    AU.play("kill");
  }
}

export function addNoise(S, x, z, radius) {
  S.noises.push({ x, z, radius, t: S.time });
}

// The player's trigger pull. Called every fixed step while firing is
// held (automatic weapons) or on the click edge (semi-automatic).
export function tryPlayerFire(S) {
  const p = S.player;
  if (!p.alive || p.reloading || S.phase !== "live") return;
  const gun = currentGun(S);
  const def = WEAPONS[gun.id];
  if (S.time < p.nextShotAt) return;
  if (gun.mag <= 0) {
    if (gun.reserve > 0) startReload(S);
    else AU.play("empty");
    p.nextShotAt = S.time + 0.3;
    return;
  }
  gun.mag--;
  S.stats.shots++;
  p.nextShotAt = S.time + def.interval;
  p.bloom = Math.min(0.05, p.bloom + def.bloom);
  p.recoilPitch += def.kick;
  p.recoilYaw += (Math.random() - 0.5) * def.kick * 0.6;

  const speed = Math.hypot(p.vx, p.vz);
  const moveFrac = Math.min(1, speed / CFG.walkSpeed);
  const aiming = !!S.input.keys.Aiming;
  let spread = def.spread + p.bloom + def.moveSpread * moveFrac;
  if (p.crouch) spread *= 0.75;
  if (aiming) spread *= 0.6;

  const oy = eyeHeight(S);
  const yaw = p.yaw + p.recoilYaw, pitch = p.pitch + p.recoilPitch;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const fx = -sy * cp, fy = sp, fz = -cy * cp;
  const rx = cy, rz = -sy; // right vector on the ground plane
  const mx = p.x + fx * 0.5 + rx * 0.16, my = oy - 0.12, mz = p.z + fz * 0.5 + rz * 0.16;
  FX.muzzle(mx, my, mz);
  for (let i = 0; i < def.pellets; i++) {
    const a = (Math.random() - 0.5) * 2 * spread;
    const b = (Math.random() - 0.5) * 2 * spread;
    let dx = fx + rx * a, dy = fy + b, dz = fz + rz * a;
    const len = Math.hypot(dx, dy, dz);
    dx /= len; dy /= len; dz /= len;
    const hit = raycastShot(S, p.x, oy, p.z, dx, dy, dz, "V");
    const endD = Math.min(hit.dist, 80);
    FX.tracer(mx, my, mz, p.x + dx * endD, oy + dy * endD, p.z + dz * endD, 0xffd27a);
    if (hit.target) {
      const dmg = def.damage * (hit.head ? def.headMult : 1) * falloff(def, hit.dist);
      applyHit(S, hit, dmg, { x: p.x, z: p.z, name: "You" }, true);
    } else if (hit.dist < 80) {
      FX.impact(p.x + dx * hit.dist, oy + dy * hit.dist, p.z + dz * hit.dist);
    }
  }
  AU.play("shot");
  addNoise(S, p.x, p.z, 26);
  if (gun.mag === 0 && gun.reserve > 0) startReload(S);
}

export function startReload(S) {
  const p = S.player;
  const gun = currentGun(S);
  if (p.reloading || gun.mag >= WEAPONS[gun.id].mag || gun.reserve <= 0) return;
  p.reloading = true;
  p.reloadEnd = S.time + WEAPONS[gun.id].reload;
  AU.play("reload");
}

export function switchSlot(S, slot) {
  const p = S.player;
  if (slot === "primary" && !p.primary) return;
  if (p.slot === slot) return;
  p.slot = slot;
  p.reloading = false;
  AU.play("click");
}

export function stepReloads(S) {
  const p = S.player;
  if (p.reloading && S.time >= p.reloadEnd) {
    const gun = currentGun(S);
    const def = WEAPONS[gun.id];
    const need = def.mag - gun.mag;
    const take = Math.min(need, gun.reserve);
    gun.mag += take; gun.reserve -= take;
    p.reloading = false;
  }
  for (const b of S.bots) {
    if (b.reloading && S.time >= b.reloadEnd) {
      b.mag = 30;
      b.reloading = false;
    }
  }
}

// One bot shot at a world point, with the bot's own aim error.
export function fireBotShot(S, bot, tx, ty, tz) {
  const ox = bot.x, oy = 1.42, oz = bot.z;
  let dx = tx - ox, dy = ty - oy, dz = tz - oz;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  const err = bot.accuracy;
  dx += (Math.random() - 0.5) * 2 * err;
  dy += (Math.random() - 0.5) * 2 * err;
  dz += (Math.random() - 0.5) * 2 * err;
  const l2 = Math.hypot(dx, dy, dz) || 1;
  dx /= l2; dy /= l2; dz /= l2;
  const hit = raycastShot(S, ox, oy, oz, dx, dy, dz, bot.team);
  const endD = Math.min(hit.dist, 80);
  FX.tracer(ox + dx * 0.6, oy - 0.05, oz + dz * 0.6, ox + dx * endD, oy + dy * endD, oz + dz * endD, 0x9df2e6);
  bot.flashUntil = S.time + 0.05;
  if (hit.target) {
    const dmg = 20 * (hit.head ? 2 : 1) * (hit.dist > 25 ? 0.75 : 1);
    applyHit(S, hit, dmg, bot, false);
  } else if (hit.dist < 80) {
    FX.impact(ox + dx * hit.dist, oy + dy * hit.dist, oz + dz * hit.dist);
  }
  AU.play("shotDistant", { x: bot.x, z: bot.z });
  addNoise(S, bot.x, bot.z, 26);
}

export function throwGrenade(S) {
  const p = S.player;
  if (!p.alive || p.grenades <= 0 || S.phase !== "live") return;
  p.grenades--;
  const cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
  const fx = -Math.sin(p.yaw) * cp, fz = -Math.cos(p.yaw) * cp;
  S.grenades.push({
    x: p.x + fx * 0.5, y: eyeHeight(S) - 0.1, z: p.z + fz * 0.5,
    vx: fx * GRENADE.throwSpeed, vy: sp * GRENADE.throwSpeed + GRENADE.throwSpeed * GRENADE.upBias,
    vz: fz * GRENADE.throwSpeed, fuse: GRENADE.fuse, team: "V", owner: "player",
  });
  AU.play("throw");
}

const G_OUT = { x: 0, z: 0 };
export function stepGrenades(S, dt) {
  for (let i = S.grenades.length - 1; i >= 0; i--) {
    const g = S.grenades[i];
    g.fuse -= dt;
    g.vy -= CFG.gravity * dt;
    const nx = g.x + g.vx * dt, nz = g.z + g.vz * dt;
    collideMove(g.x, g.z, 0.12, g.vx * dt, g.vz * dt, G_OUT);
    if (G_OUT.x !== nx) g.vx *= -0.45;
    if (G_OUT.z !== nz) g.vz *= -0.45;
    g.x = G_OUT.x; g.z = G_OUT.z;
    g.y += g.vy * dt;
    if (g.y < 0.12) {
      g.y = 0.12;
      if (Math.abs(g.vy) > 2) AU.play("bounce", { x: g.x, z: g.z });
      g.vy = Math.abs(g.vy) > 1.5 ? -g.vy * 0.42 : 0;
      g.vx *= 0.7; g.vz *= 0.7;
    }
    if (g.fuse <= 0) {
      explodeGrenade(S, g);
      S.grenades.splice(i, 1);
    }
  }
}

function explodeGrenade(S, g) {
  FX.explosion(g.x, g.y, g.z);
  AU.play("explosion", { x: g.x, z: g.z });
  S.shake = Math.max(S.shake, 0.6);
  const tryDamage = (tx, tz, chestY, hurt) => {
    const dx = tx - g.x, dz = tz - g.z, dy = chestY - g.y;
    const d = Math.hypot(dx, dy, dz);
    if (d > GRENADE.radius) return;
    if (segmentBlocked(g.x, g.y + 0.2, g.z, tx, chestY, tz)) return;
    const dmg = GRENADE.damage * (1 - 0.75 * (d / GRENADE.radius));
    hurt(dmg);
  };
  const p = S.player;
  if (p.alive) {
    tryDamage(p.x, p.z, 1.0, (dmg) => {
      if (damagePlayer(S, dmg, g.x, g.z)) addFeed(S, "You were caught by the blast.");
    });
    const pd = Math.hypot(p.x - g.x, p.z - g.z);
    if (pd < GRENADE.radius * 1.6) p.flash = Math.max(p.flash, 0.7);
  }
  for (const b of S.bots) {
    if (!b.alive || b.team === g.team) continue;
    tryDamage(b.x, b.z, 1.0, (dmg) => {
      b.hp -= dmg;
      if (b.hp <= 0) {
        b.hp = 0; b.alive = false;
        onKill(S, { x: g.x, z: g.z, name: "You" }, b.name, g.owner === "player");
      }
    });
  }
}

// Buy menu purchases. Returns a message for the HUD, or null when refused.
export function buyItem(S, id) {
  const p = S.player;
  if (S.phase !== "live" || !p.alive || S.time >= S.round.buyUntil) return null;
  if (id === "grenade") {
    if (p.grenades >= GRENADE.maxCarried || p.money < GRENADE.price) return null;
    p.money -= GRENADE.price; p.grenades++;
    return "Frag grenade bought.";
  }
  if (id === "armor") {
    if (p.armor || p.money < ARMOR_PRICE) return null;
    p.money -= ARMOR_PRICE; p.armor = true;
    return "Kevlar bought.";
  }
  const def = WEAPONS[id];
  if (!def || !def.price || p.money < def.price) return null;
  if (p.primary && p.primary.id === id) return null;
  p.money -= def.price;
  p.primary = { id, mag: def.mag, reserve: def.reserve };
  p.slot = "primary";
  p.reloading = false;
  return def.name + " bought.";
}
