// hud.js — every DOM overlay: health, ammo, money, timer, score,
// crosshair, kill feed, banners, the buy menu, the minimap, and the
// start and match-end screens. It reads S and never writes game state
// except through the callbacks main.js hands it (buy, start, restart).

import { CFG, WEAPONS, GRENADE, ARMOR_PRICE } from "./config.js";
import { MAP } from "./map.js";
import { currentGun, currentDef } from "./combat.js";

const $ = (id) => document.getElementById(id);

export function createHUD(S, cb) {
  const el = {};
  for (const id of ["timer", "round-label", "score-v", "score-w", "health-num",
    "health-fill", "armor-tag", "ammo-mag", "ammo-reserve", "weapon-name",
    "money", "grenade-num", "alive-v", "alive-w", "crosshair", "hitmarker",
    "feed", "banner", "banner-text", "banner-sub", "channel", "channel-fill",
    "channel-label", "objective", "vignette", "flash", "buy-menu", "buy-items",
    "buy-money", "buy-note", "start-overlay", "match-overlay", "match-text",
    "minimap", "mute-btn", "charge-line"]) el[id] = $(id);

  const last = {};
  const setText = (key, node, value) => {
    if (last[key] !== value) { last[key] = value; node.textContent = value; }
  };

  // Buy menu rows, built once from the weapon table.
  const buyDefs = [
    { id: "smg", label: "K7 Ripper", desc: "Fast SMG, 30 rounds", price: WEAPONS.smg.price },
    { id: "rifle", label: "AR-4 Longshot", desc: "Accurate rifle, 30 rounds", price: WEAPONS.rifle.price },
    { id: "shotgun", label: "M870 Breacher", desc: "6 pellets, close range", price: WEAPONS.shotgun.price },
    { id: "grenade", label: "Frag grenade", desc: "Timed blast, hold G to throw", price: GRENADE.price },
    { id: "armor", label: "Kevlar", desc: "Halves damage this round", price: ARMOR_PRICE },
  ];
  buyDefs.forEach((def, i) => {
    const row = document.createElement("button");
    row.className = "buy-row";
    row.innerHTML = "<span class='buy-key'>" + (i + 1) + "</span><span class='buy-name'>" +
      def.label + "</span><span class='buy-desc'>" + def.desc + "</span><span class='buy-price'>$" + def.price + "</span>";
    row.addEventListener("click", () => cb.onBuy(def.id));
    el["buy-items"].appendChild(row);
    def.row = row;
  });

  $("start-btn").addEventListener("click", () => cb.onStart());
  $("match-restart").addEventListener("click", () => cb.onRestart());
  $("buy-close").addEventListener("click", () => cb.onCloseBuy());
  el["mute-btn"].addEventListener("click", () => cb.onMute());

  // Minimap: the static map is painted once to an offscreen canvas.
  const mm = el.minimap.getContext("2d");
  const MW = el.minimap.width, MH = el.minimap.height;
  const mx = (x) => (x + 33) / 66 * MW;
  const mz = (z) => (z + 23) / 46 * MH;
  const base = document.createElement("canvas");
  base.width = MW; base.height = MH;
  const bctx = base.getContext("2d");
  bctx.fillStyle = "#23262e";
  bctx.fillRect(0, 0, MW, MH);
  bctx.fillStyle = "#565e66";
  for (const c of MAP.colliders) bctx.fillRect(mx(c[0]), mz(c[1]), mx(c[2]) - mx(c[0]), mz(c[3]) - mz(c[1]));
  bctx.strokeStyle = "#e8a33d";
  bctx.lineWidth = 2;
  bctx.strokeRect(mx(MAP.site.x0), mz(MAP.site.z0), mx(MAP.site.x1) - mx(MAP.site.x0), mz(MAP.site.z1) - mz(MAP.site.z0));
  bctx.fillStyle = "#e8a33d";
  bctx.font = "bold 11px sans-serif";
  bctx.fillText("A", mx(24) - 4, mz(0) + 4);

  let frame = 0;
  function drawMinimap() {
    mm.drawImage(base, 0, 0);
    const dot = (x, z, color, r) => {
      mm.fillStyle = color;
      mm.beginPath();
      mm.arc(mx(x), mz(z), r, 0, Math.PI * 2);
      mm.fill();
    };
    for (const b of S.bots) {
      if (!b.alive) continue;
      if (b.team === "V") dot(b.x, b.z, "#e8a33d", 3);
    }
    // Spotted enemies: shown briefly after any Vanguard fighter sees them.
    for (const b of S.bots) {
      if (b.team === "W" && b.alive && b.spottedAt && S.time - b.spottedAt < 3) dot(b.x, b.z, "#ff5a4e", 3);
    }
    const p = S.player;
    if (p.alive) {
      mm.save();
      mm.translate(mx(p.x), mz(p.z));
      mm.rotate(-p.yaw);
      mm.fillStyle = "#ffffff";
      mm.beginPath();
      mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(-4, 5); mm.closePath();
      mm.fill();
      mm.restore();
    }
    if (S.charge.state === "planted" || S.charge.state === "dropped") {
      dot(S.charge.x, S.charge.z, "#ffd27a", 4);
    }
  }

  function update() {
    frame++;
    const p = S.player;
    const r = S.round;
    const t = Math.max(0, Math.ceil(S.charge.state === "planted" ? S.charge.fuse : r.timer));
    setText("timer", el.timer, Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"));
    el.timer.classList.toggle("urgent", S.charge.state === "planted");
    setText("round", el["round-label"], "ROUND " + r.num);
    setText("sv", el["score-v"], String(r.winsV));
    setText("sw", el["score-w"], String(r.winsW));
    setText("hp", el["health-num"], String(Math.max(0, Math.ceil(p.hp))));
    const hpf = Math.max(0, p.hp / p.maxHp);
    if (last.hpf !== hpf) {
      last.hpf = hpf;
      el["health-fill"].style.width = (hpf * 100) + "%";
      el["health-fill"].classList.toggle("low", hpf < 0.3);
    }
    el["armor-tag"].style.display = p.armor ? "inline" : "none";
    const gun = currentGun(S);
    const def = currentDef(S);
    setText("mag", el["ammo-mag"], p.reloading ? "--" : String(gun.mag));
    setText("res", el["ammo-reserve"], String(gun.reserve));
    setText("wname", el["weapon-name"], def.name + (p.reloading ? " — reloading" : ""));
    setText("money", el.money, "$" + p.money);
    setText("nade", el["grenade-num"], String(p.grenades));
    let av = p.alive ? 1 : 0, aw = 0;
    for (const b of S.bots) {
      if (b.alive && b.team === "V") av++;
      if (b.alive && b.team === "W") aw++;
    }
    setText("av", el["alive-v"], String(av));
    setText("aw", el["alive-w"], String(aw));

    // Crosshair gap mirrors the current spread: wide while moving or
    // firing, tight while still, crouched, or aiming.
    const speed = Math.hypot(p.vx, p.vz);
    let spread = def.spread + p.bloom + def.moveSpread * Math.min(1, speed / CFG.walkSpeed);
    if (p.crouch) spread *= 0.75;
    if (S.input.keys.Aiming) spread *= 0.6;
    const gap = Math.round(5 + spread * 260);
    if (last.gap !== gap) { last.gap = gap; el.crosshair.style.setProperty("--gap", gap + "px"); }
    el.crosshair.style.display = p.alive && S.phase === "live" && !S.buyOpen ? "block" : "none";
    el.hitmarker.style.opacity = S.hitmarkAt && S.time - S.hitmarkAt < 0.12 ? "1" : "0";

    const feedSig = S.feed.map((f) => f.text).join("|");
    if (last.feed !== feedSig) {
      last.feed = feedSig;
      el.feed.innerHTML = S.feed.map((f) => "<div>" + f.text + "</div>").join("");
    }

    const showBanner = S.time < S.banner.until && S.banner.text;
    el.banner.style.display = showBanner ? "block" : "none";
    if (showBanner) {
      setText("bt", el["banner-text"], S.banner.text);
      setText("bs", el["banner-sub"], S.banner.sub || "");
    }

    const showChannel = p.channel > 0 && p.channelKind;
    el.channel.style.display = showChannel ? "block" : "none";
    if (showChannel) {
      el["channel-fill"].style.width = (p.channel * 100) + "%";
      setText("cl", el["channel-label"], p.channelKind === "plant" ? "PLANTING CHARGE…" : "DEFUSING…");
    }

    let obj;
    if (S.charge.state === "planted") obj = "CHARGE PLANTED — defend it until it blows";
    else if (S.charge.state === "dropped") obj = "CHARGE DROPPED — recover it and plant at Site A";
    else if (S.charge.carrier === "player") obj = "YOU CARRY THE CHARGE — plant it at Site A (hold E)";
    else obj = "YOUR TEAM CARRIES THE CHARGE — take Site A";
    setText("obj", el.objective, obj);

    el.vignette.style.opacity = p.damageFlash > 0 ? String(Math.min(0.85, p.damageFlash)) : "0";
    el.flash.style.opacity = p.flash > 0 ? String(Math.min(0.9, p.flash)) : "0";
    el["buy-menu"].style.display = S.buyOpen ? "block" : "none";
    if (S.buyOpen) {
      setText("bm", el["buy-money"], "$" + p.money);
      const left = Math.max(0, Math.ceil(S.round.buyUntil - S.time));
      setText("bn", el["buy-note"], "Buy window closes in " + left + "s — press 1–5 or click, B to close");
      buyDefs.forEach((def) => {
        const afford = p.money >= def.price;
        const owned = (def.id === "armor" && p.armor) ||
          (def.id === "grenade" && p.grenades >= GRENADE.maxCarried) ||
          (p.primary && p.primary.id === def.id);
        def.row.classList.toggle("cant", !afford || owned);
      });
    }
    el["start-overlay"].style.display = S.started ? "none" : "flex";
    el["match-overlay"].style.display = S.phase === "matchEnd" ? "flex" : "none";
    if (S.phase === "matchEnd") {
      setText("mt", el["match-text"], r.winsV > r.winsW
        ? "VANGUARD WINS THE MATCH " + r.winsV + "–" + r.winsW
        : "WARDENS WIN THE MATCH " + r.winsW + "–" + r.winsV);
    }
    el["mute-btn"].textContent = S.muted ? "SOUND OFF (M)" : "SOUND ON (M)";
    if (frame % 2 === 0) drawMinimap();
  }

  return { update, drawMinimap };
}
