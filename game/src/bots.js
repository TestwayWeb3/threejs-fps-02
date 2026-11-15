// bots.js — the five bots' brains: waypoint routes, posts to hold,
// seeing and hearing, bursts of fire, and the objective (carrying,
// planting, guarding, and defusing the charge). Decisions run on a
// staggered 6 Hz think; steering and shooting run every fixed step.

import { CFG, BOT_NAMES } from "./config.js";
import { MAP, WAYPOINTS, bfsPath, nearestNode, collideMove, segmentBlocked } from "./map.js";
import { createBotState } from "./state.js";
import { fireBotShot } from "./combat.js";

const STEER_OUT = { x: 0, z: 0 };

export function resetBots(S) {
  S.bots.length = 0;
  const defs = [
    { team: "V", name: BOT_NAMES.V[0], spawn: 1, via: 16 },
    { team: "V", name: BOT_NAMES.V[1], spawn: 2, via: 2 },
    { team: "W", name: BOT_NAMES.W[0], spawn: 0, hold: MAP.holdNodes.W[0] },
    { team: "W", name: BOT_NAMES.W[1], spawn: 1, hold: MAP.holdNodes.W[1] },
    { team: "W", name: BOT_NAMES.W[2], spawn: 2, hold: MAP.holdNodes.W[2] },
  ];
  defs.forEach((d, i) => {
    const b = createBotState(i, d.team, d.name);
    const sp = d.team === "V" ? MAP.spawnsV[d.spawn] : MAP.spawnsW[d.spawn];
    b.x = sp[0]; b.z = sp[1];
    b.yaw = d.team === "V" ? -Math.PI / 2 : Math.PI / 2;
    b.holdNode = d.hold !== undefined ? d.hold : 0;
    b.viaNode = d.via !== undefined ? d.via : -1;
    b.accuracy = 0.03 + (i % 3) * 0.008;
    b.reaction = 0.4 + (i % 3) * 0.1;
    b.mode = d.team === "W" ? "hold" : "advance";
    b.nextThinkAt = S.time + i * 0.05;
    S.bots.push(b);
  });
}

function visibleEnemy(S, bot) {
  // Returns { x, z, chestY, isPlayer, ref } for the nearest enemy this
  // bot can currently see, or null. Sight needs range, facing, and a
  // clear segment; a target closer than 6 m is noticed from any side.
  let best = null, bestD = 42;
  const consider = (x, z, chestY, isPlayer, ref) => {
    const dx = x - bot.x, dz = z - bot.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) return;
    const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
    const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    if (d > 6 && facing < 0.35) return;
    if (segmentBlocked(bot.x, CFG.botEye, bot.z, x, chestY, z)) return;
    bestD = d;
    best = { x, z, chestY, isPlayer, ref, dist: d };
  };
  const p = S.player;
  if (bot.team === "W" && p.alive) {
    consider(p.x, p.z, p.crouch ? 0.9 : 1.25, true, p);
  }
  for (const o of S.bots) {
    if (o === bot || !o.alive || o.team === bot.team) continue;
    consider(o.x, o.z, 1.25, false, o);
  }
  return best;
}

function setPath(bot, goalNode) {
  const from = nearestNode(bot.x, bot.z);
  bot.path = bfsPath(from, goalNode);
  bot.pathIdx = 0;
  bot.goalNode = goalNode;
}

function think(S, bot) {
  const now = S.time;
  // Hearing: the nearest recent gunshot inside its radius pulls attention.
  for (const n of S.noises) {
    const d = Math.hypot(n.x - bot.x, n.z - bot.z);
    if (d < n.radius && now - n.t < 0.6) {
      bot.hearX = n.x; bot.hearZ = n.z; bot.hearAt = now;
    }
  }
  const enemy = visibleEnemy(S, bot);
  if (enemy) {
    const fresh = !bot.seen || now - bot.seen.t > 1.0;
    bot.seen = { x: enemy.x, z: enemy.z, t: now, ref: enemy.ref, isPlayer: enemy.isPlayer };
    if (fresh) bot.reactUntil = now + bot.reaction;
    if (bot.team === "V" && !enemy.isPlayer) enemy.ref.spottedAt = now;
    bot.mode = "engage";
    return;
  }
  // Lost sight: keep engaging the last known spot briefly, then move on.
  if (bot.mode === "engage" && bot.seen && now - bot.seen.t < 2.0) return;

  const charge = S.charge;
  if (charge.state === "planted") {
    if (bot.team === "W") {
      bot.mode = "defuse";
      if (bot.goalNode !== nearestNode(charge.x, charge.z)) setPath(bot, nearestNode(charge.x, charge.z));
    } else {
      bot.mode = "guard";
      if (bot.goalNode !== 20) setPath(bot, 20);
    }
    return;
  }
  if (charge.state === "dropped" && bot.team === "V") {
    // The nearest living Vanguard goes to recover the charge.
    let nearest = null, nd = Infinity;
    for (const o of S.bots) {
      if (o.team !== "V" || !o.alive) continue;
      const d = Math.hypot(o.x - charge.x, o.z - charge.z);
      if (d < nd) { nd = d; nearest = o; }
    }
    if (nearest === bot) {
      bot.mode = "recover";
      if (bot.goalNode !== nearestNode(charge.x, charge.z)) setPath(bot, nearestNode(charge.x, charge.z));
      return;
    }
  }
  if (charge.state === "carried" && charge.carrier === bot.id) {
    bot.mode = "toSite";
    if (bot.goalNode !== 20) setPath(bot, 20);
    return;
  }
  if (bot.team === "W") {
    if (now - bot.hearAt < 3.5) {
      bot.mode = "investigate";
      const hn = nearestNode(bot.hearX, bot.hearZ);
      if (bot.goalNode !== hn) setPath(bot, hn);
    } else {
      bot.mode = "hold";
      if (bot.goalNode !== bot.holdNode) setPath(bot, bot.holdNode);
    }
    return;
  }
  // Vanguard attackers push toward the site, each by its own lane,
  // detouring briefly toward a gunshot they just heard.
  if (now - bot.hearAt < 1.0) {
    bot.mode = "investigate";
    const hn = nearestNode(bot.hearX, bot.hearZ);
    if (bot.goalNode !== hn) setPath(bot, hn);
    return;
  }
  bot.mode = "advance";
  const via = bot.viaNode;
  const nearVia = via >= 0 && Math.hypot(bot.x - WAYPOINTS[via][0], bot.z - WAYPOINTS[via][1]) < 2;
  const goal = via >= 0 && !nearVia && bot.goalNode !== 20 ? via : 20;
  if (bot.goalNode !== goal) setPath(bot, goal);
  if (goal === via && nearVia) setPath(bot, 20);
}

function steerTo(S, bot, tx, tz, dt, speedMul) {
  const dx = tx - bot.x, dz = tz - bot.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) return true;
  const speed = CFG.botSpeed * (speedMul || 1);
  const step = Math.min(d, speed * dt);
  collideMove(bot.x, bot.z, CFG.bodyRadius, (dx / d) * step, (dz / d) * step, STEER_OUT);
  const moved = Math.hypot(STEER_OUT.x - bot.x, STEER_OUT.z - bot.z);
  bot.x = STEER_OUT.x; bot.z = STEER_OUT.z;
  bot.moveBlend = Math.min(1, bot.moveBlend + dt * 6);
  if (moved > 0.001) bot.bobPhase += dt * speed * 1.5;
  turnToward(bot, Math.atan2(-dx, -dz), dt);
  return d < 0.9;
}

function turnToward(bot, wantYaw, dt) {
  let diff = wantYaw - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = 6 * dt;
  bot.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));
}

export function stepBots(S, dt) {
  for (const bot of S.bots) {
    if (!bot.alive) continue;
    if (S.time >= bot.nextThinkAt) {
      think(S, bot);
      bot.nextThinkAt = S.time + 0.15 + (bot.id % 3) * 0.05;
    }
    if (bot.mode === "engage" && bot.seen) {
      const t = bot.seen;
      const tx = t.ref && t.ref.alive !== false ? (t.isPlayer ? S.player.x : t.ref.x) : t.x;
      const tz = t.ref && t.ref.alive !== false ? (t.isPlayer ? S.player.z : t.ref.z) : t.z;
      // Face the target, strafe sideways, and fire in bursts after reacting.
      turnToward(bot, Math.atan2(-(tx - bot.x), -(tz - bot.z)), dt);
      if (S.time >= bot.strafeUntil) {
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
        bot.strafeUntil = S.time + 0.6 + Math.random() * 0.7;
      }
      const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
      const sx = -fz * bot.strafeDir, sz = fx * bot.strafeDir;
      const dist = Math.hypot(tx - bot.x, tz - bot.z);
      const approach = dist > 14 ? 0.6 : 0;
      collideMove(bot.x, bot.z, CFG.bodyRadius,
        (sx * 0.8 + fx * approach) * CFG.botSpeed * 0.55 * dt,
        (sz * 0.8 + fz * approach) * CFG.botSpeed * 0.55 * dt, STEER_OUT);
      bot.x = STEER_OUT.x; bot.z = STEER_OUT.z;
      if (S.time >= bot.reactUntil && !bot.reloading && bot.mag > 0) {
        if (bot.burstLeft > 0 && S.time >= bot.nextShotAt) {
          const chestY = 1.25;
          fireBotShot(S, bot, tx, chestY, tz);
          bot.mag--;
          bot.burstLeft--;
          bot.nextShotAt = S.time + 0.13;
          if (bot.mag <= 0) { bot.reloading = true; bot.reloadEnd = S.time + 1.8; }
        } else if (bot.burstLeft <= 0 && S.time >= bot.burstPauseUntil) {
          bot.burstLeft = 2 + Math.floor(Math.random() * 2);
          bot.burstPauseUntil = S.time + 0.55 + Math.random() * 0.5;
        }
      }
      continue;
    }

    if (bot.mode === "defuse") {
      const c = S.charge;
      const d = Math.hypot(c.x - bot.x, c.z - bot.z);
      if (d > 1.6) {
        if (bot.pathIdx >= bot.path.length) steerTo(S, bot, c.x, c.z, dt, 1);
        else followPath(S, bot, dt);
      } else {
        bot.channel += dt / CFG.defuseTime;
        if (bot.channel >= 1) bot.channelDone = "defuse";
      }
      continue;
    }
    if (bot.mode === "toSite" || bot.mode === "plant") {
      const s = MAP.site;
      const inSite = bot.x >= s.x0 && bot.x <= s.x1 && bot.z >= s.z0 && bot.z <= s.z1;
      if (inSite) {
        bot.mode = "plant";
        bot.channel += dt / CFG.plantTime;
        if (bot.channel >= 1) bot.channelDone = "plant";
      } else {
        followPath(S, bot, dt);
      }
      continue;
    }
    if (bot.mode === "recover") {
      const c = S.charge;
      const d = Math.hypot(c.x - bot.x, c.z - bot.z);
      if (d < 1.0) {
        S.charge.state = "carried";
        S.charge.carrier = bot.id;
        bot.mode = "toSite";
        setPath(bot, 20);
      } else if (bot.pathIdx >= bot.path.length) {
        steerTo(S, bot, c.x, c.z, dt, 1);
      } else {
        followPath(S, bot, dt);
      }
      continue;
    }
    // hold / advance / investigate / guard: walk the waypoint path.
    followPath(S, bot, dt);
    if (bot.mode === "hold" && bot.pathIdx >= bot.path.length) {
      // At the post: sweep the facing across the lane.
      const sweep = Math.sin(S.time * 0.4 + bot.id) * 0.7;
      const baseYaw = bot.team === "W" ? Math.PI / 2 : -Math.PI / 2;
      turnToward(bot, baseYaw + sweep, dt);
      bot.moveBlend = Math.max(0, bot.moveBlend - dt * 6);
    }
  }
  // Gentle separation so bots never stack inside each other.
  for (let i = 0; i < S.bots.length; i++) {
    const a = S.bots[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < S.bots.length; j++) {
      const b = S.bots[j];
      if (!b.alive) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01 && d < 0.7) {
        const push = (0.7 - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        a.x -= nx * push; a.z -= nz * push;
        b.x += nx * push; b.z += nz * push;
      }
    }
  }
}

function followPath(S, bot, dt) {
  if (bot.pathIdx >= bot.path.length) {
    bot.moveBlend = Math.max(0, bot.moveBlend - dt * 6);
    return;
  }
  const node = WAYPOINTS[bot.path[bot.pathIdx]];
  if (steerTo(S, bot, node[0], node[1], dt, 1)) bot.pathIdx++;
}
