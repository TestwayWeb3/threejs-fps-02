// render.js — the three.js scene: renderer, lights, sky, bot bodies,
// the player's viewmodel weapon, the charge prop, and the per-frame
// sync that copies simulation state into meshes. It never changes
// gameplay state; it only shows it.

import * as THREE from "three";
import { CFG, TEAMS, PALETTE } from "./config.js";
import { buildMap, MAP } from "./map.js";
import { eyeHeight } from "./player.js";

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 34, 78);

  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 200);
  camera.rotation.order = "YXZ";

  const hemi = new THREE.HemisphereLight(0xa89ac8, 0x4a4034, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb35c, 1.9);
  sun.position.set(-18, 26, -10);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6b8fb8, 0.55);
  fill.position.set(20, 14, 18);
  scene.add(fill);
  for (const [lx, lz] of MAP.lamps) {
    const pt = new THREE.PointLight(PALETTE.lamp, 18, 13, 1.8);
    pt.position.set(lx, 3.4, lz);
    scene.add(pt);
  }

  const world = buildMap(THREE, scene);

  // The charge: a small device with a blinking lamp, shown dropped or planted.
  const chargeGroup = new THREE.Group();
  const chargeBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.24, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x2e2a26 }),
  );
  chargeBody.position.y = 0.12;
  const chargeLamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
  );
  chargeLamp.position.set(0.12, 0.28, 0);
  chargeGroup.add(chargeBody, chargeLamp);
  chargeGroup.visible = false;
  scene.add(chargeGroup);

  // Grenade props: one small dark sphere per live grenade, pooled.
  const grenadeMeshes = [];
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenadeMat = new THREE.MeshLambertMaterial({ color: 0x22201e });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(grenadeGeo, grenadeMat);
    m.visible = false;
    scene.add(m);
    grenadeMeshes.push(m);
  }

  return { THREE, renderer, scene, camera, world, chargeGroup, chargeLamp, grenadeMeshes };
}

// One bot body from primitives: capsule torso, sphere head with a visor
// slit, a gun box, and a soft blob shadow. Team colors mark the sides.
export function createBotMesh(R, team) {
  const t = TEAMS[team];
  const group = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: t.cloth });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e2a26 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.78, 4, 10), cloth);
  torso.position.y = 0.69; // capsule feet rest on the ground plane
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), dark);
  head.position.y = 1.55; // matches the hit-test head height (CFG.botEye)
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.07, 0.06),
    new THREE.MeshBasicMaterial({ color: t.accent }),
  );
  visor.position.set(0, 1.56, -0.2);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.62), dark);
  gun.position.set(0.22, 1.15, -0.3);
  const stripe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.315, 0.315, 0.09, 16),
    new THREE.MeshBasicMaterial({ color: t.color }),
  );
  stripe.position.y = 0.95;
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  flash.position.set(0.22, 1.15, -0.66);
  group.add(torso, head, visor, gun, stripe, shadow, flash);
  group.userData.flash = flash;
  group.userData.torso = torso;
  return group;
}

// The viewmodel: a low-poly gun built from boxes, parented to the camera
// so it rides along with the view. Different silhouettes per weapon.
export function createViewmodel(R) {
  const group = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x3d3a35, emissive: 0x171512 });
  const grip = new THREE.MeshLambertMaterial({ color: 0x5c4832, emissive: 0x171008 });
  const accent = new THREE.MeshLambertMaterial({ color: 0x9aa0a6, emissive: 0x222222 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.5), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 8), accent);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, -0.38);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.1), grip);
  mag.position.set(0, -0.12, 0.02);
  mag.rotation.x = 0.15;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.08), accent);
  sight.position.set(0, 0.09, -0.1);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.22), grip);
  stock.position.set(0, -0.02, 0.3);
  group.add(body, barrel, mag, sight, stock);
  group.scale.setScalar(0.82);
  group.position.set(0.26, -0.24, -0.5);
  group.rotation.y = -0.04; // muzzle angles slightly toward the crosshair
  group.userData = { body, barrel, mag, stock, baseY: -0.24, baseX: 0.26, baseZ: -0.5 };
  return group;
}

export function setViewmodelShape(vm, weaponId) {
  const u = vm.userData;
  // Barrel length and magazine size read as the weapon's silhouette.
  if (weaponId === "sidearm") {
    u.barrel.scale.set(1, 0.55, 1);
    u.barrel.position.set(0, 0.03, -0.3);
    u.mag.scale.set(0.8, 0.7, 0.8);
    u.stock.visible = false;
  } else if (weaponId === "shotgun") {
    u.barrel.scale.set(1.5, 1.1, 1.5);
    u.barrel.position.set(0, 0.03, -0.42);
    u.mag.scale.set(1, 0.5, 1.6);
    u.stock.visible = true;
  } else if (weaponId === "smg") {
    u.barrel.scale.set(1, 0.8, 1);
    u.barrel.position.set(0, 0.03, -0.35);
    u.mag.scale.set(0.9, 1.3, 0.9);
    u.stock.visible = true;
  } else {
    u.barrel.scale.set(1, 1, 1);
    u.barrel.position.set(0, 0.03, -0.38);
    u.mag.scale.set(1, 1, 1);
    u.stock.visible = true;
  }
}

const SHAKE_TMP = { x: 0, y: 0 };

export function syncFrame(R, S, vm, dt) {
  const p = S.player;
  const cam = R.camera;
  // Camera from the player: yaw/pitch plus unrecovered recoil and shake.
  S.shake = Math.max(0, S.shake - dt * 1.8);
  SHAKE_TMP.x = (Math.random() - 0.5) * S.shake * 0.05;
  SHAKE_TMP.y = (Math.random() - 0.5) * S.shake * 0.05;
  cam.position.set(p.x + SHAKE_TMP.x, eyeHeight(S) + SHAKE_TMP.y, p.z);
  cam.rotation.y = p.yaw;
  cam.rotation.x = p.pitch + p.recoilPitch;
  cam.rotation.z = p.recoilYaw * 0.5;

  // Viewmodel bob, recoil kick, and the reload dip.
  const speed = Math.hypot(p.vx, p.vz);
  const bob = Math.min(1, speed / CFG.walkSpeed) * 0.012;
  const u = vm.userData;
  vm.position.y = u.baseY + Math.sin(p.bobPhase * 2) * bob - (p.reloading ? 0.12 : 0);
  vm.position.x = u.baseX + Math.cos(p.bobPhase) * bob * 0.6;
  vm.position.z = u.baseZ + p.recoilPitch * 1.2;
  vm.rotation.x = p.recoilPitch * 1.6 + (p.reloading ? 0.5 : 0);

  for (const b of S.bots) {
    const m = b.mesh;
    if (!m) continue;
    if (!b.alive) {
      // Fallen bots tip over and stay down for the rest of the round.
      m.position.set(b.x, 0.25, b.z);
      m.rotation.z = Math.PI / 2 * 0.9;
      m.userData.flash.material.opacity = 0;
      continue;
    }
    m.position.set(b.x, Math.abs(Math.sin(b.bobPhase)) * 0.03 * b.moveBlend, b.z);
    m.rotation.y = b.yaw;
    m.rotation.z = 0;
    const flash = m.userData.flash;
    const on = S.time < b.flashUntil;
    flash.material.opacity = on ? 0.95 : 0;
    if (on) flash.quaternion.copy(cam.quaternion);
  }

  const c = S.charge;
  if (c.state === "planted" || c.state === "dropped") {
    R.chargeGroup.visible = true;
    R.chargeGroup.position.set(c.x, 0, c.z);
    const blink = c.state === "planted" ? (Math.sin(S.time * (6 + (30 - c.fuse) * 0.2)) > 0) : true;
    R.chargeLamp.material.color.setHex(blink ? 0xff3b30 : 0x551512);
  } else {
    R.chargeGroup.visible = false;
  }

  for (let i = 0; i < R.grenadeMeshes.length; i++) {
    const g = S.grenades[i];
    const mesh = R.grenadeMeshes[i];
    if (g) {
      mesh.visible = true;
      mesh.position.set(g.x, g.y, g.z);
    } else mesh.visible = false;
  }

  // The site ring pulses faster while the charge ticks down.
  const ring = R.world.ring;
  if (ring) {
    const planted = c.state === "planted";
    const pulse = planted ? 0.6 + 0.4 * Math.sin(S.time * 8) : 0.6 + 0.2 * Math.sin(S.time * 1.5);
    ring.material.opacity = 0.5 + 0.3 * pulse;
  }
  R.renderer.render(R.scene, cam);
}

export function resizeRenderer(R) {
  R.camera.aspect = window.innerWidth / window.innerHeight;
  R.camera.updateProjectionMatrix();
  R.renderer.setSize(window.innerWidth, window.innerHeight);
}
