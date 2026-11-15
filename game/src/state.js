// state.js — the one place mutable game state lives.
// Every module reads and writes this object; no other module keeps its own
// copy of positions, health, money, or round progress.

import { CFG } from "./config.js";

export function createPlayerState() {
  return {
    x: 0, z: 0, vx: 0, vz: 0, yaw: 0, pitch: 0,
    hp: 100, maxHp: 100, armor: false, alive: true,
    money: CFG.startMoney,
    primary: null, // { id, mag, reserve } or null when only the sidearm is held
    sidearm: { id: "sidearm", mag: 12, reserve: 48 },
    slot: "sidearm",
    grenades: 0,
    crouch: false, sprint: false,
    reloading: false, reloadEnd: 0,
    nextShotAt: 0, bloom: 0,
    recoilPitch: 0, recoilYaw: 0, // unrecovered recoil offsets, decayed over time
    channel: 0, // plant/defuse progress 0..1 while holding E
    channelKind: null, // "plant" | "defuse" | null
    bobPhase: 0, stepAt: 0,
    flash: 0, // grenade flash timer, dims the view while positive
    damageFlash: 0, // red vignette timer after taking damage
    lastDamageDir: 0,
    kills: 0, deaths: 0,
  };
}

export function createBotState(id, team, name) {
  return {
    id, team, name,
    x: 0, z: 0, yaw: 0, hp: 100, alive: true,
    weapon: "smg",
    mag: 30, reloading: false, reloadEnd: 0,
    mode: "hold", // hold | advance | engage | investigate | toSite | plant | defuse | guard
    path: [], pathIdx: 0, // waypoint indices, filled by the pathfinder
    holdNode: 0, // waypoint index this bot guards while holding
    reactUntil: 0, // time until which a newly seen enemy is not yet engaged
    seen: null, // { x, z, t } last confirmed sighting of an enemy
    hearX: 0, hearZ: 0, hearAt: -99, // last heard gunshot position and time
    nextShotAt: 0, burstLeft: 0, burstPauseUntil: 0,
    strafeDir: 1, strafeUntil: 0,
    channel: 0, // plant/defuse progress for bots
    nextThinkAt: 0, // staggered perception ticks
    spottedAt: 0, // last time a Vanguard fighter saw this bot (minimap)
    bobPhase: 0, moveBlend: 0,
    accuracy: 0.035, // radians of aim error, varied per bot at spawn
    reaction: 0.45,
    mesh: null, // render group, attached by render.js
    flashUntil: 0, // muzzle flash visibility deadline
  };
}

export function createState() {
  return {
    time: 0,
    tick: 0,
    phase: "lobby", // lobby | live | roundEnd | matchEnd
    round: {
      num: 1, timer: CFG.roundTime, buyUntil: 0,
      winsV: 0, winsW: 0, endAt: 0, endWinner: null, endReason: "",
    },
    player: createPlayerState(),
    bots: [],
    charge: {
      state: "carried", // carried | dropped | planted | spent
      carrier: "player", // "player" or a bot id, while carried
      x: 0, z: 0, fuse: 0, defuseBy: null, beepAt: 0,
    },
    grenades: [], // { x,y,z, vx,vy,vz, fuse, team, owner }
    noises: [], // { x, z, radius, t } gunshots heard this tick; cleared each step
    feed: [], // { text, t } kill feed lines, newest first
    banner: { text: "", sub: "", until: 0 },
    buyOpen: false,
    shake: 0, // camera shake magnitude, decayed in the render step
    muted: false,
    started: false, // true once the player leaves the start overlay
    stats: { shots: 0, hits: 0 },
    input: {
      keys: Object.create(null),
      lookX: 0, lookY: 0, // accumulated mouse deltas, consumed by the player step
      firing: false, firedEdge: false,
      pressed: Object.create(null), // key codes pressed since the last step
      pointerLocked: false, dragging: false,
    },
  };
}

// True while the buy menu may be opened: alive, live phase, inside the window.
export function buyWindowOpen(S) {
  return S.phase === "live" && S.player.alive && S.time < S.round.buyUntil;
}
