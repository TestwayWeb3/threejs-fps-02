// config.js — every tuning number for Cinder Quay in one place.
// Nothing here changes at runtime; the mutable game state lives in state.js.

export const CFG = {
  roundTime: 100, // seconds of live play per round
  buyTime: 15, // seconds from round start during which the buy menu works
  plantTime: 3.0, // seconds holding E inside the site to plant the charge
  defuseTime: 4.0, // seconds holding E beside the planted charge to defuse it
  fuseTime: 30, // seconds from plant to detonation
  roundEndTime: 3.5, // seconds the round-end banner shows before the next round
  winRounds: 5, // first team to this many round wins takes the match
  startMoney: 800,
  killMoney: 300,
  winMoney: 1400,
  lossMoney: 900,
  maxMoney: 16000,
  eyeHeight: 1.62,
  crouchEye: 1.12,
  bodyRadius: 0.35,
  walkSpeed: 4.6,
  sprintSpeed: 6.3,
  crouchSpeed: 2.4,
  accel: 42,
  friction: 11,
  botEye: 1.55,
  botSpeed: 3.9,
  gravity: 22, // grenades only; on-foot movement stays on the ground plane
  maxPitch: 1.45, // radians of look up/down
};

// Weapons. spread is the base cone half-angle in radians; bloom is added
// per shot and decays; moveSpread is added while moving at full speed.
// kick is the recoil pitch added per shot in radians.
export const WEAPONS = {
  sidearm: {
    id: "sidearm", name: "P9 Sidearm", price: 0, damage: 26, headMult: 2,
    mag: 12, reserve: 48, interval: 0.28, reload: 1.4, spread: 0.012,
    moveSpread: 0.02, bloom: 0.006, pellets: 1, auto: false, kick: 0.011,
    falloffStart: 22, falloffEnd: 48,
  },
  smg: {
    id: "smg", name: "K7 Ripper", price: 1500, damage: 24, headMult: 2,
    mag: 30, reserve: 90, interval: 0.09, reload: 1.9, spread: 0.021,
    moveSpread: 0.028, bloom: 0.007, pellets: 1, auto: true, kick: 0.007,
    falloffStart: 18, falloffEnd: 40,
  },
  rifle: {
    id: "rifle", name: "AR-4 Longshot", price: 2700, damage: 33, headMult: 2,
    mag: 30, reserve: 90, interval: 0.11, reload: 2.2, spread: 0.011,
    moveSpread: 0.03, bloom: 0.008, pellets: 1, auto: true, kick: 0.01,
    falloffStart: 26, falloffEnd: 55,
  },
  shotgun: {
    id: "shotgun", name: "M870 Breacher", price: 1900, damage: 12, headMult: 2,
    mag: 6, reserve: 24, interval: 0.75, reload: 2.6, spread: 0.05,
    moveSpread: 0.02, bloom: 0.004, pellets: 6, auto: false, kick: 0.03,
    falloffStart: 10, falloffEnd: 26,
  },
};

export const GRENADE = {
  price: 300, maxCarried: 2, fuse: 2.0, radius: 7, damage: 110,
  throwSpeed: 14, upBias: 0.35,
};

export const ARMOR_PRICE = 650;
export const ARMOR_ABSORB = 0.5; // fraction of damage armor removes

// Team presentation: Vanguard (attackers, the player's team) in amber,
// Wardens (defenders) in teal. The palette is dusk over a salvage yard.
export const TEAMS = {
  V: { name: "Vanguard", color: 0xe8a33d, cloth: 0xb97a24, accent: 0xffd27a },
  W: { name: "Wardens", color: 0x3db8a8, cloth: 0x2a7d74, accent: 0x9df2e6 },
};

export const BOT_NAMES = {
  V: ["Rook", "Fable"],
  W: ["Vex", "Marrow", "Sable"],
};

export const PALETTE = {
  sky: 0x4a3d5c,
  fog: 0x4a3d5c,
  ground: 0x4d535a,
  groundLine: 0xd8c27a,
  wall: 0x7d7468,
  wallDark: 0x5b5148,
  rust: 0x8a4a2a,
  rustLight: 0xa85f36,
  teal: 0x2e6f68,
  tealDark: 0x224f4b,
  crate: 0x7a5c38,
  crateDark: 0x5d452a,
  metal: 0x565e66,
  lamp: 0xffc46b,
  site: 0xe8a33d,
  crane: 0x46403a,
};
