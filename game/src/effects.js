// effects.js — pooled visual effects: tracers, muzzle flashes, impact
// sparks, and explosions. Every pool is allocated once at startup and
// reused; the per-frame update writes into existing buffers only.

const MAX_TRACERS = 24;
const MAX_SPARKS = 120;
const MAX_FLASHES = 8;

class TracerPool {
  constructor(THREE, scene) {
    this.items = [];
    const mat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
    for (let i = 0; i < MAX_TRACERS; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(g, mat.clone());
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.items.push({ line, life: 0 });
    }
    this.next = 0;
  }
  spawn(ax, ay, az, bx, by, bz, color) {
    const it = this.items[this.next];
    this.next = (this.next + 1) % this.items.length;
    const pos = it.line.geometry.attributes.position.array;
    pos[0] = ax; pos[1] = ay; pos[2] = az;
    pos[3] = bx; pos[4] = by; pos[5] = bz;
    it.line.geometry.attributes.position.needsUpdate = true;
    it.line.material.color.setHex(color);
    it.line.material.opacity = 0.9;
    it.line.visible = true;
    it.life = 0.07;
  }
  update(dt) {
    for (const it of this.items) {
      if (!it.line.visible) continue;
      it.life -= dt;
      if (it.life <= 0) it.line.visible = false;
      else it.line.material.opacity = it.life / 0.07 * 0.9;
    }
  }
}

class SparkPool {
  constructor(THREE, scene) {
    this.pos = new Float32Array(MAX_SPARKS * 3);
    this.vel = new Float32Array(MAX_SPARKS * 3);
    this.life = new Float32Array(MAX_SPARKS);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({
      color: 0xffc46b, size: 0.09, transparent: true, opacity: 0.95,
      depthWrite: false,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.next = 0;
    for (let i = 0; i < MAX_SPARKS; i++) this.pos[i * 3 + 1] = -10;
  }
  burst(x, y, z, count, speed) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX_SPARKS;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = (Math.random() - 0.5) * speed;
      this.vel[i * 3 + 1] = Math.random() * speed * 0.8;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      this.life[i] = 0.35 + Math.random() * 0.3;
    }
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) this.pos[i * 3 + 1] = 0.02;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -10;
    }
    if (any) this.geo.attributes.position.needsUpdate = true;
  }
}

export const FX = {
  tracers: null,
  sparks: null,
  flashes: [],
  flashIdx: 0,
  ring: null,
  ringLife: 0,

  init(THREE, scene) {
    this.tracers = new TracerPool(THREE, scene);
    this.sparks = new SparkPool(THREE, scene);
    const flashGeo = new THREE.PlaneGeometry(0.34, 0.34);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a8, transparent: true, opacity: 0, depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (let i = 0; i < MAX_FLASHES; i++) {
      const m = new THREE.Mesh(flashGeo, flashMat.clone());
      m.visible = false;
      scene.add(m);
      this.flashes.push({ mesh: m, life: 0 });
    }
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.1, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb35c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    scene.add(this.ring);
  },

  tracer(ax, ay, az, bx, by, bz, color) {
    if (this.tracers) this.tracers.spawn(ax, ay, az, bx, by, bz, color);
  },
  impact(x, y, z) {
    if (this.sparks) this.sparks.burst(x, y, z, 5, 3.2);
  },
  muzzle(x, y, z) {
    const f = this.flashes[this.flashIdx];
    this.flashIdx = (this.flashIdx + 1) % this.flashes.length;
    f.mesh.position.set(x, y, z);
    f.mesh.rotation.set(0, Math.random() * Math.PI, 0);
    f.mesh.material.opacity = 0.95;
    f.mesh.visible = true;
    f.life = 0.045;
  },
  explosion(x, y, z) {
    if (this.sparks) this.sparks.burst(x, y + 0.3, z, 40, 7);
    this.ring.position.set(x, 0.06, z);
    this.ring.visible = true;
    this.ringLife = 0.45;
  },

  update(dt, camera) {
    if (this.tracers) this.tracers.update(dt);
    if (this.sparks) this.sparks.update(dt);
    for (const f of this.flashes) {
      if (!f.mesh.visible) continue;
      f.life -= dt;
      if (f.life <= 0) f.mesh.visible = false;
      else f.mesh.quaternion.copy(camera.quaternion);
    }
    if (this.ring.visible) {
      this.ringLife -= dt;
      if (this.ringLife <= 0) this.ring.visible = false;
      else {
        const s = 1 + (0.45 - this.ringLife) * 14;
        this.ring.scale.set(s, s, s);
        this.ring.material.opacity = this.ringLife / 0.45;
      }
    }
  },
};
