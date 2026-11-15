// audio.js — synthesized sound only: every effect is generated with the
// Web Audio API in code, no audio files anywhere. Sounds with a world
// position are attenuated by distance from the listener (the player).

export const AU = {
  ctx: null,
  master: null,
  muted: false,
  lx: 0, lz: 0,
  noiseBuf: null,

  init() {
    if (this.ctx) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },

  setListener(x, z) { this.lx = x; this.lz = z; },
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  },

  volumeAt(opts) {
    if (!opts || opts.x === undefined) return 1;
    const d = Math.hypot(opts.x - this.lx, opts.z - this.lz);
    return Math.max(0, 1 - d / 45);
  },

  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noise(dur, vol, filterFreq, type) {
    if (!this.ctx || !this.noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type || "lowpass";
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },

  play(name, opts) {
    if (!this.ctx || this.muted) return;
    const v = this.volumeAt(opts);
    if (v <= 0.02) return;
    switch (name) {
      case "shot":
        this.noise(0.09, 0.5 * v, 3200);
        this.tone(140, 0.08, "triangle", 0.4 * v, 55);
        break;
      case "shotDistant":
        this.noise(0.08, 0.22 * v, 1400);
        break;
      case "empty": this.tone(2200, 0.04, "square", 0.08 * v); break;
      case "reload":
        this.tone(900, 0.05, "square", 0.12 * v);
        setTimeout(() => this.tone(700, 0.05, "square", 0.12 * v), 180);
        break;
      case "hit": this.tone(1560, 0.05, "sine", 0.25 * v); break;
      case "kill":
        this.tone(660, 0.09, "sine", 0.25 * v);
        setTimeout(() => this.tone(990, 0.12, "sine", 0.25 * v), 90);
        break;
      case "explosion":
        this.noise(0.7, 0.8 * v, 500);
        this.tone(70, 0.6, "sine", 0.7 * v, 30);
        break;
      case "bounce": this.tone(320, 0.05, "sine", 0.15 * v, 180); break;
      case "throw": this.noise(0.12, 0.15 * v, 900, "bandpass"); break;
      case "beep": this.tone(1180, 0.07, "square", 0.16 * v); break;
      case "plant":
        this.tone(520, 0.1, "square", 0.2 * v);
        setTimeout(() => this.tone(780, 0.14, "square", 0.2 * v), 120);
        break;
      case "buy": this.tone(1320, 0.08, "sine", 0.2 * v, 1760); break;
      case "click": this.tone(1800, 0.03, "square", 0.08 * v); break;
      case "step": this.noise(0.05, 0.1 * v, 400); break;
      case "roundWin":
        [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, "triangle", 0.25 * v), i * 110));
        break;
      case "roundLose":
        [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, "triangle", 0.22 * v), i * 110));
        break;
      default: break;
    }
  },
};
