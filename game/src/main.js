// main.js — Cinder Quay, a round-based tactical FPS for three.js.
//
// CONTROLS: WASD move, mouse look (pointer lock, or hold-and-drag when
// lock is unavailable), left mouse fire, right mouse aim, R reload,
// 1/2 or Q switch weapon, G throw grenade, B buy menu, E hold to plant
// the charge, C crouch, Shift sprint, M mute.
//
// ROUND FLOW: first team to 5 round wins takes the match. A round is
// won by eliminating the other team, by detonating the planted charge,
// or by defusing it; if the 100-second timer runs out before a plant,
// the defending Wardens win. The buy menu works for the first 15
// seconds of each round. Ammunition is topped up between rounds.
//
// WEAPONS: P9 sidearm (starting), K7 Ripper SMG, AR-4 Longshot rifle,
// M870 Breacher shotgun, frag grenades, and kevlar. Kills pay $300, a
// round win pays $1400, a round loss pays $900.
//
// OBJECTIVE: the Vanguard attacker carries a breach charge. Plant it
// inside Site A (hold E, 3 seconds); it detonates 30 seconds later
// unless a Warden defuses it (hold E beside it, 4 seconds). If the
// carrier falls, the charge drops and any Vanguard fighter can recover
// it. Bots run lanes on waypoint routes, hold posts, investigate
// gunfire they hear, and react to what they see.

import * as THREE from "three";
import { CFG, WEAPONS } from "./config.js";
import { createState, buyWindowOpen } from "./state.js";
import { MAP, bfsPath } from "./map.js";
import { attachInput, takePressed, clearStepEdges } from "./input.js";
import { stepPlayer } from "./player.js";
import { resetBots, stepBots } from "./bots.js";
import {
  tryPlayerFire, startReload, switchSlot, stepReloads, throwGrenade,
  stepGrenades, buyItem, addFeed, currentDef,
} from "./combat.js";
import { FX } from "./effects.js";
import { AU } from "./audio.js";
import { createHUD } from "./hud.js";
import {
  createRenderer, createBotMesh, createViewmodel, setViewmodelShape,
  syncFrame, resizeRenderer,
} from "./render.js";

const DT = 1 / 60;
const S = createState();
// The lobby camera rests at the Vanguard spawn, looking down the yard.
S.player.x = MAP.spawnsV[0][0];
S.player.z = MAP.spawnsV[0][1];
S.player.yaw = -Math.PI / 2;
const R = createRenderer(document.getElementById("game"));
FX.init(THREE, R.scene);
R.scene.add(R.camera);
const viewmodel = createViewmodel(R);
R.camera.add(viewmodel);

// Bot meshes are built once and reused across rounds; resetBots only
// reassigns them to the fresh bot states.
const botMeshes = [];
for (let i = 0; i < 5; i++) {
  const mesh = createBotMesh(R, i < 2 ? "V" : "W");
  R.scene.add(mesh);
  botMeshes.push(mesh);
}

const hud = createHUD(S, {
  onBuy: (id) => {
    const msg = buyItem(S, id);
    if (msg) { AU.play("buy"); addFeed(S, msg); }
    else AU.play("empty");
  },
  onStart: () => startFromLobby(),
  onRestart: () => startMatch(),
  onCloseBuy: () => { S.buyOpen = false; },
  onMute: () => setMuted(!S.muted),
});

attachInput(S, R.renderer.domElement, {
  onRequestLock: () => requestLock(),
  onResize: () => resizeRenderer(R),
  onConfirm: () => { if (!S.started) startFromLobby(); },
});

function requestLock() {
  try {
    const p = R.renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* pointer lock unavailable: drag-to-look still works */ }
}

function setMuted(m) {
  S.muted = m;
  AU.setMuted(m);
}

function startFromLobby() {
  AU.init();
  AU.resume();
  S.started = true;
  startMatch();
  requestLock();
}

function startMatch() {
  const p = S.player;
  p.money = CFG.startMoney;
  p.primary = null;
  p.sidearm = { id: "sidearm", mag: 12, reserve: 48 };
  p.slot = "sidearm";
  p.grenades = 0;
  p.kills = 0; p.deaths = 0;
  S.round.num = 1;
  S.round.winsV = 0;
  S.round.winsW = 0;
  S.feed.length = 0;
  startRound();
}

function startRound() {
  const p = S.player;
  const sp = MAP.spawnsV[0];
  p.x = sp[0]; p.z = sp[1];
  p.vx = 0; p.vz = 0;
  p.yaw = -Math.PI / 2; p.pitch = 0;
  p.hp = p.maxHp; p.alive = true;
  p.armor = false;
  p.reloading = false;
  p.bloom = 0; p.recoilPitch = 0; p.recoilYaw = 0;
  p.channel = 0; p.channelKind = null; p.channelDone = null;
  p.flash = 0; p.damageFlash = 0;
  // Ammunition is topped up between rounds; weapons and money persist.
  for (const gun of [p.sidearm, p.primary]) {
    if (!gun) continue;
    const def = WEAPONS[gun.id];
    gun.mag = def.mag;
    gun.reserve = def.reserve;
  }
  resetBots(S);
  S.bots.forEach((b, i) => {
    b.mesh = botMeshes[i];
    b.mesh.rotation.set(0, b.yaw, 0);
    b.mesh.position.set(b.x, 0, b.z);
  });
  S.charge.state = "carried";
  S.charge.carrier = "player";
  S.charge.fuse = 0;
  S.charge.defuseBy = null;
  S.grenades.length = 0;
  S.noises.length = 0;
  S.round.timer = CFG.roundTime;
  S.round.buyUntil = S.time + CFG.buyTime;
  S.round.endWinner = null;
  S.phase = "live";
  S.buyOpen = false;
  S.banner = { text: "ROUND " + S.round.num, sub: "Plant the charge at Site A — or eliminate the Wardens", until: S.time + 2.5 };
  setViewmodelShape(viewmodel, p.slot === "primary" && p.primary ? p.primary.id : "sidearm");
}

function endRound(winner, reason) {
  if (S.phase !== "live") return;
  const r = S.round;
  if (winner === "V") r.winsV++; else r.winsW++;
  const p = S.player;
  p.money = Math.min(CFG.maxMoney, p.money + (winner === "V" ? CFG.winMoney : CFG.lossMoney));
  r.endWinner = winner;
  r.endReason = reason;
  r.endAt = S.time + CFG.roundEndTime;
  S.phase = "roundEnd";
  S.buyOpen = false;
  S.banner = {
    text: winner === "V" ? "ROUND WON" : "ROUND LOST",
    sub: reason + "  —  Vanguard " + r.winsV + " : " + r.winsW + " Wardens",
    until: r.endAt,
  };
  AU.play(winner === "V" ? "roundWin" : "roundLose");
  addFeed(S, (winner === "V" ? "Vanguard" : "Wardens") + " take the round (" + reason + ").");
}

function aliveCount(team) {
  let n = team === "V" && S.player.alive ? 1 : 0;
  for (const b of S.bots) if (b.alive && b.team === team) n++;
  return n;
}

function resolveChannels() {
  const p = S.player;
  if (p.channelDone) {
    const kind = p.channelDone;
    p.channelDone = null;
    if (kind === "plant") plantCharge(p.x, p.z, "You");
  }
  for (const b of S.bots) {
    if (!b.channelDone) continue;
    const kind = b.channelDone;
    b.channelDone = null;
    if (kind === "plant" && S.charge.state === "carried") plantCharge(b.x, b.z, b.name);
    else if (kind === "defuse" && S.charge.state === "planted") endRound("W", "charge defused by " + b.name);
  }
}

function plantCharge(x, z, byName) {
  S.charge.state = "planted";
  S.charge.x = x; S.charge.z = z;
  S.charge.fuse = CFG.fuseTime;
  S.charge.beepAt = S.time;
  AU.play("plant");
  addFeed(S, byName + " planted the charge at Site A.");
  S.banner = { text: "CHARGE PLANTED", sub: "Wardens must defuse it — 30 seconds", until: S.time + 2.5 };
}

function step(dt) {
  S.time += dt;
  S.tick++;
  if (S.phase === "roundEnd") {
    clearStepEdges(S);
    if (S.time >= S.round.endAt) {
      if (S.round.winsV >= CFG.winRounds || S.round.winsW >= CFG.winRounds) {
        S.phase = "matchEnd";
      } else {
        S.round.num++;
        startRound();
      }
    }
    return;
  }
  // Lobby / match-end: drop stale click and key edges so nothing fires
  // the moment a new round starts.
  if (S.phase !== "live") { clearStepEdges(S); return; }

  handleKeys();
  const wasAlive = S.player.alive;
  stepPlayer(S, dt);
  if (wasAlive && !S.player.alive && S.charge.state === "carried" && S.charge.carrier === "player") {
    S.charge.state = "dropped";
    S.charge.x = S.player.x; S.charge.z = S.player.z;
    addFeed(S, "You dropped the charge.");
  }
  // Recover a dropped charge by walking over it.
  if (S.charge.state === "dropped" && S.player.alive) {
    const dx = S.player.x - S.charge.x, dz = S.player.z - S.charge.z;
    if (dx * dx + dz * dz < 1.44) {
      S.charge.state = "carried";
      S.charge.carrier = "player";
      addFeed(S, "You recovered the charge.");
    }
  }
  stepBots(S, dt);
  stepGrenades(S, dt);
  stepReloads(S);
  resolveChannels();

  // Firing: automatic weapons fire while held; the rest fire on the click
  // edge. A semi-automatic click that lands inside the fire interval is
  // kept, not dropped, and fires as soon as the interval elapses.
  const def = currentDef(S);
  if (S.input.firing && def.auto) {
    tryPlayerFire(S);
    clearStepEdges(S);
  } else if (S.input.firedEdge && !def.auto) {
    if (S.time >= S.player.nextShotAt) {
      tryPlayerFire(S);
      clearStepEdges(S);
    }
  } else {
    clearStepEdges(S);
  }

  if (S.player.stepped) {
    S.player.stepped = false;
    AU.play("step");
  }

  // Planted charge: accelerating beeps, then detonation.
  if (S.charge.state === "planted") {
    S.charge.fuse -= dt;
    const interval = 0.22 + (S.charge.fuse / CFG.fuseTime) * 0.7;
    if (S.time >= S.charge.beepAt) {
      S.charge.beepAt = S.time + interval;
      AU.play("beep", { x: S.charge.x, z: S.charge.z });
    }
    if (S.charge.fuse <= 0) {
      FX.explosion(S.charge.x, 0.3, S.charge.z);
      AU.play("explosion", { x: S.charge.x, z: S.charge.z });
      S.shake = 1;
      S.charge.state = "spent";
      endRound("V", "charge detonated");
      return;
    }
  }

  S.round.timer -= dt;
  // Round end checks: elimination, or the timer with no plant.
  if (aliveCount("W") === 0) endRound("V", "all Wardens eliminated");
  else if (aliveCount("V") === 0) endRound("W", "all Vanguard eliminated");
  else if (S.round.timer <= 0 && S.charge.state !== "planted") endRound("W", "time expired");

  // Noises older than a moment stop pulling bots.
  for (let i = S.noises.length - 1; i >= 0; i--) {
    if (S.time - S.noises[i].t > 0.6) S.noises.splice(i, 1);
  }
  if (S.buyOpen && !buyWindowOpen(S)) S.buyOpen = false;
  if (S.player.alive && S.buyOpen && S.input.firing) S.input.firing = false;
}

function handleKeys() {
  const p = S.player;
  if (takePressed(S, "KeyM")) setMuted(!S.muted);
  if (S.phase !== "live") return;
  if (takePressed(S, "KeyB")) {
    if (S.buyOpen) S.buyOpen = false;
    else if (buyWindowOpen(S)) S.buyOpen = true;
    return;
  }
  if (takePressed(S, "Escape")) S.buyOpen = false;
  if (S.buyOpen) {
    const ids = ["smg", "rifle", "shotgun", "grenade", "armor"];
    for (let i = 0; i < ids.length; i++) {
      if (takePressed(S, "Digit" + (i + 1))) {
        const msg = buyItem(S, ids[i]);
        if (msg) { AU.play("buy"); addFeed(S, msg); }
        else AU.play("empty");
      }
    }
    return;
  }
  if (!p.alive) return;
  if (takePressed(S, "KeyR")) startReload(S);
  if (takePressed(S, "KeyG")) throwGrenade(S);
  if (takePressed(S, "Digit1")) { switchSlot(S, "primary"); setViewmodelShape(viewmodel, p.primary ? p.primary.id : "sidearm"); }
  if (takePressed(S, "Digit2")) { switchSlot(S, "sidearm"); setViewmodelShape(viewmodel, "sidearm"); }
  if (takePressed(S, "KeyQ")) {
    const next = p.slot === "primary" ? "sidearm" : "primary";
    switchSlot(S, next);
    setViewmodelShape(viewmodel, p.slot === "primary" && p.primary ? p.primary.id : "sidearm");
  }
}

// Fixed-step simulation apart from rendering: the accumulator runs the
// game at 60 Hz regardless of frame rate; rendering reads state after.
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let elapsed = (now - last) / 1000;
  last = now;
  if (elapsed > 0.25) elapsed = 0.25;
  acc += elapsed;
  let steps = 0;
  while (acc >= DT && steps < 5) {
    step(DT);
    acc -= DT;
    steps++;
  }
  if (steps === 5) acc = 0;
  AU.setListener(S.player.x, S.player.z);
  FX.update(elapsed, R.camera);
  syncFrame(R, S, viewmodel, elapsed);
  hud.update();
}
requestAnimationFrame(frame);

// A read hook for play-testing: positions, round state, and the
// pathfinder, exposed without changing how the game plays.
window.__fps = { state: S, map: MAP, bfsPath, version: "cinder-quay-1" };
