// map.js — Cinder Quay: the map's layout data, its meshes, and every
// spatial query the simulation needs (movement collision, bullet and
// sight rays, waypoint pathfinding). One original salvage yard:
// a warehouse lane north, a container dock lane south, a crane court
// in the middle, and Site A in the crane yard to the east.

import { PALETTE } from "./config.js";

// Axis-aligned colliders: [x0, z0, x1, z1, y0, y1, material key].
// Every collider blocks both movement and bullets.
const COLLIDERS = [
  [-33, -23, 33, -22, 0, 4, "wallDark"], // north outer wall
  [-33, 22, 33, 23, 0, 4, "wallDark"], // south outer wall
  [-33, -22, -32, 22, 0, 4, "wallDark"], // west outer wall
  [32, -22, 33, 22, 0, 4, "wallDark"], // east outer wall
  [-17, -21, -5, -17.5, 0, 3.2, "wall"], // warehouse, north strip
  [-17, -14.5, -5, -13, 0, 3.2, "wall"], // warehouse, south strip
  [8, -21, 16, -14, 0, 3.2, "wall"], // watch office
  [-16, 12, -8, 15.5, 0, 2.6, "teal"], // container row 1
  [-2, 12, 6, 15.5, 0, 2.6, "rust"], // container row 2
  [12, 12, 20, 15.5, 0, 2.6, "teal"], // container row 3
  [-2, -2, 2, 2, 0, 2.6, "crane"], // crane pedestal, mid court
  [-9, -5, -7.5, -3.5, 0, 1.1, "crate"], // crate K1
  [-9, 3.5, -7.5, 5, 0, 1.1, "crate"], // crate K2
  [7.5, -5, 9, -3.5, 0, 1.1, "crate"], // crate K3
  [7.5, 3.5, 9, 5, 0, 1.1, "crate"], // crate K4
  [-4, 8, -2.5, 9.5, 0, 1.1, "crate"], // crate K5
  [2.5, -6.5, 4, -5, 0, 1.1, "crate"], // crate K6
  [18.7, -6.3, 19.3, -5.7, 0, 2.8, "rustLight"], // site gate post north
  [18.7, 5.7, 19.3, 6.3, 0, 2.8, "rustLight"], // site gate post south
  [22, -4, 23.5, -2.5, 0, 1.1, "crate"], // site crate north
  [22, 2.5, 23.5, 4, 0, 1.1, "crate"], // site crate south
];

// Waypoints bots steer through. Indices are stable; edges join pairs
// whose straight line stays clear of every collider.
export const WAYPOINTS = [
  [-29, 0], [-22, -16], [-11, -16], [-2, -16], [4, -12], [12, -12],
  [20, -12], [-24, 18.5], [-12, 18.5], [2, 18.5], [16, 18.5], [24, 18.5],
  [-20, 0], [-12, 0], [-5, 0], [0, -6], [0, 6], [5, 0], [12, 0], [17, 0],
  [24, 0], [26, -3], [26, 3], [16, 9], [-5, 9], [9, 9], [-5, -9], [9, -9],
  [29, 0], [20, -6], [20, 6], [-5, 14], [9, 14],
];

const EDGES = [
  [0, 1], [0, 7], [0, 12], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
  [6, 29], [7, 8], [8, 9], [9, 10], [10, 11], [11, 30], [11, 22],
  [12, 13], [13, 14], [14, 15], [14, 16], [15, 17], [16, 17], [17, 18],
  [18, 19], [19, 20], [19, 29], [19, 30], [20, 21], [20, 22], [20, 29],
  [20, 30], [29, 21], [30, 22], [13, 26], [13, 24], [18, 27], [18, 25],
  [26, 3], [26, 27], [27, 4], [27, 5], [24, 31], [25, 32], [31, 8],
  [31, 9], [32, 9], [32, 10], [1, 12], [7, 12], [28, 20], [28, 21],
  [28, 22], [28, 29], [28, 30], [28, 6], [28, 11], [15, 26], [16, 24],
  [17, 27], [17, 25], [24, 16], [26, 15], [14, 26], [14, 24],
  [18, 23], [23, 25], [23, 30], // south-mid connector by the site gate
];

const ADJ = WAYPOINTS.map(() => []);
for (const [a, b] of EDGES) {
  if (!ADJ[a].includes(b)) ADJ[a].push(b);
  if (!ADJ[b].includes(a)) ADJ[b].push(a);
}

export const MAP = {
  bounds: { x0: -31.6, x1: 31.6, z0: -21.6, z1: 21.6 },
  colliders: COLLIDERS,
  site: { x0: 19, z0: -6, x1: 29, z1: 6, cx: 24, cz: 0 },
  spawnsV: [[-29, -3], [-29, 0], [-29, 3]],
  spawnsW: [[29, -3], [29, 0], [29, 3]],
  holdNodes: { W: [21, 22, 5] }, // defender posts: site north, site south, north corridor
  lamps: [[-14, -8], [0, 12], [22, -10], [-24, 10]],
};

// Breadth-first path over the waypoint graph. Returns waypoint indices
// from the node after `from` through `to`, or [] when unreachable.
const BFS_PREV = new Int16Array(WAYPOINTS.length);
const BFS_QUEUE = new Int16Array(WAYPOINTS.length);
export function bfsPath(from, to) {
  if (from === to) return [to];
  BFS_PREV.fill(-1);
  let head = 0, tail = 0;
  BFS_QUEUE[tail++] = from;
  BFS_PREV[from] = from;
  while (head < tail) {
    const cur = BFS_QUEUE[head++];
    for (const nb of ADJ[cur]) {
      if (BFS_PREV[nb] !== -1) continue;
      BFS_PREV[nb] = cur;
      if (nb === to) {
        const path = [to];
        let n = cur;
        while (n !== from) { path.push(n); n = BFS_PREV[n]; }
        path.reverse();
        return path;
      }
      BFS_QUEUE[tail++] = nb;
    }
  }
  return [];
}

export function nearestNode(x, z) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const dx = WAYPOINTS[i][0] - x, dz = WAYPOINTS[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Move a circle of radius r by (dx, dz), axis by axis, sliding along
// colliders. Writes the result into out {x, z} and returns it.
export function collideMove(x, z, r, dx, dz, out) {
  const b = MAP.bounds;
  let nx = Math.max(b.x0 + r, Math.min(b.x1 - r, x + dx));
  if (circleHits(nx, z, r)) nx = x;
  let nz = Math.max(b.z0 + r, Math.min(b.z1 - r, z + dz));
  if (circleHits(nx, nz, r)) nz = z;
  out.x = nx; out.z = nz;
  return out;
}

function circleHits(x, z, r) {
  for (const c of COLLIDERS) {
    if (x + r > c[0] && x - r < c[2] && z + r > c[1] && z - r < c[3]) return true;
  }
  return false;
}

// Nearest distance along a ray to any collider or the ground, or Infinity.
export function rayWallDist(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  if (dy < -1e-6) {
    const t = -oy / dy;
    if (t > 0 && t < best) best = t;
  }
  for (const c of COLLIDERS) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, c[0], c[4], c[1], c[2], c[5], c[3]);
    if (t > 0 && t < best) best = t;
  }
  return best;
}

function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return -1; }
  else {
    let t1 = (x0 - ox) / dx, t2 = (x1 - ox) / dx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return -1; }
  else {
    let t1 = (y0 - oy) / dy, t2 = (y1 - oy) / dy;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return -1; }
  else {
    let t1 = (z0 - oz) / dz, t2 = (z1 - oz) / dz;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  return tmin;
}

export function segmentBlocked(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  const d = rayWallDist(ax, ay, az, dx / len, dy / len, dz / len, len);
  return d < len - 0.05;
}

// Build the visible map. Shared geometries and materials; the ground,
// walls, containers, crates, gate posts, lamps, the site ring, painted
// lane lines, and silhouettes beyond the walls for depth.
export function buildMap(THREE, scene) {
  const group = new THREE.Group();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const mats = {};
  for (const key of Object.keys(PALETTE)) {
    if (typeof PALETTE[key] === "number") mats[key] = new THREE.MeshLambertMaterial({ color: PALETTE[key] });
  }
  const addBox = (x0, z0, x1, z1, y0, y1, mat, parent) => {
    const m = new THREE.Mesh(boxGeo, mats[mat] || mats.wall);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.scale.set(x1 - x0, y1 - y0, z1 - z0);
    (parent || group).add(m);
    return m;
  };

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(66, 46), mats.ground);
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);
  // Painted lane lines: thin amber strips guiding the eye down each lane.
  const lineMat = new THREE.MeshBasicMaterial({ color: PALETTE.groundLine });
  for (const [lx, lz, len] of [[-8, -16, 26], [-8, 18.5, 26]]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.25), lineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(lx, 0.02, lz);
    group.add(line);
  }
  for (const c of COLLIDERS) addBox(c[0], c[1], c[2], c[3], c[4], c[5], c[6]);
  // Rooflines and trims that make the big blocks read as buildings.
  addBox(-17, -21, -5, -20.6, 3.2, 3.5, "wallDark");
  addBox(8, -21, 16, -20.6, 3.2, 3.5, "wallDark");
  addBox(-16, 12, -8, 12.4, 2.6, 2.85, "tealDark");
  addBox(-2, 12, 6, 12.4, 2.6, 2.85, "rustLight");
  addBox(12, 12, 20, 12.4, 2.6, 2.85, "tealDark");
  // Crane mast rising from the pedestal, with a jib arm overhead.
  addBox(-0.4, -0.4, 0.4, 0.4, 2.6, 9, "crane");
  addBox(-4.5, -0.35, 4.5, 0.35, 8.4, 9, "crane");
  addBox(3.6, -0.3, 4.4, 0.3, 6.4, 8.4, "rust");
  // Site ring: a flat amber ring on the ground marking the plant zone.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.2, 3.7, 40),
    new THREE.MeshBasicMaterial({ color: PALETTE.site, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(MAP.site.cx, 0.03, MAP.site.cz);
  ring.name = "siteRing";
  group.add(ring);
  // Lamp posts with warm heads; render.js adds the point lights.
  const lampHeadGeo = new THREE.SphereGeometry(0.22, 10, 8);
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: PALETTE.lamp });
  for (const [lx, lz] of MAP.lamps) {
    addBox(lx - 0.09, lz - 0.09, lx + 0.09, lz + 0.09, 0, 3.4, "metal");
    const head = new THREE.Mesh(lampHeadGeo, lampHeadMat);
    head.position.set(lx, 3.5, lz);
    group.add(head);
  }
  // Silhouettes beyond the walls: stacked containers and a second crane.
  const silMat = mats.crane;
  const silhouettes = [
    [-28, -28, -18, -24, 0, 5], [6, -29, 16, -24, 0, 7], [20, -28, 30, -24, 0, 4],
    [-30, 25, -20, 29, 0, 6], [10, 25, 22, 29, 0, 5], [-38, -6, -34, 6, 0, 8],
  ];
  for (const s of silhouettes) {
    const m = new THREE.Mesh(boxGeo, silMat);
    m.position.set((s[0] + s[2]) / 2, (s[4] + s[5]) / 2, (s[1] + s[3]) / 2);
    m.scale.set(s[2] - s[0], s[5] - s[4], s[3] - s[1]);
    group.add(m);
  }
  scene.add(group);
  return { group, ring };
}
