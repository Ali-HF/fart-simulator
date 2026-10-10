import { playBlip, playCrash, playFart, stopThrustFart } from "./audio";

export type GameState = "menu" | "ready" | "playing" | "paused" | "dead";

export interface HudSnapshot {
  score: number;
  best: number;
  combo: number;
  gas: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  r: number;
  grow: number;
  kind: 0 | 1 | 2; // 0 gas, 1 spark, 2 chunk
  hue: number;
  rot: number;
  spin: number;
}

interface Pipe {
  x: number;
  gapY: number;
  gapH: number;
  w: number;
  passed: boolean;
  grazed: boolean;
  wobble: number;
}

interface Bean {
  x: number;
  y: number;
  taken: boolean;
  t: number;
  big: boolean;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
  size: number;
}

const BRAPS = ["PFFFT!", "BRAAAP!", "TOOT!", "POOT!", "BLRRP!", "FFFRT!", "PARP!"];
const PRAISE = ["NICE!", "STINKY!", "SQUEEZE!", "CLOSE ONE!", "PHEW!", "SMOOTH!"];

// Safari < 16 fallback
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    x: number,
    y: number,
    w: number,
    h: number,
    r: number | DOMPointInit | (number | DOMPointInit)[] = 0,
  ) {
    const rad = Math.min(typeof r === "number" ? r : 0, Math.abs(w) / 2, Math.abs(h) / 2);
    this.moveTo(x + rad, y);
    this.arcTo(x + w, y, x + w, y + h, rad);
    this.arcTo(x + w, y + h, x, y + h, rad);
    this.arcTo(x, y + h, x, y, rad);
    this.arcTo(x, y, x + w, y, rad);
    this.closePath();
    return undefined as unknown as void;
  };
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class FartGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w = 0;
  h = 0;
  dpr = 1;

  state: GameState = "menu";
  onState: (s: GameState, score: number) => void = () => {};
  onHud: (h: HudSnapshot) => void = () => {};

  // player
  px = 0;
  py = 0;
  vy = 0;
  radius = 20;
  squash = 1;
  tilt = 0;
  thrusting = false;
  wasThrusting = false;
  thrustTime = 0;
  cheekPulse = 0;

  gas = 100;
  score = 0;
  best = 0;
  combo = 1;
  comboTimer = 0;
  distance = 0;

  speed = 250;
  pipes: Pipe[] = [];
  beans: Bean[] = [];
  parts: Particle[] = [];
  texts: FloatText[] = [];
  clouds: { x: number; y: number; r: number; s: number; a: number }[] = [];
  spawnX = 0;

  shake = 0;
  shakeX = 0;
  shakeY = 0;
  flash = 0;
  stinkMeter = 0; // visual green haze
  time = 0;
  deadTime = 0;
  hudAcc = 0;
  running = false;
  raf = 0;
  last = 0;
  acc = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(320, rect.width);
    this.h = Math.max(320, rect.height);
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.radius = clamp(this.h * 0.035, 16, 26);
    if (this.state === "menu") {
      this.px = this.w * 0.3;
      this.py = this.h * 0.5;
    }
    if (this.clouds.length === 0) this.seedClouds();
  }

  seedClouds() {
    this.clouds = [];
    for (let i = 0; i < 14; i++) {
      this.clouds.push({
        x: rand(0, this.w),
        y: rand(0, this.h),
        r: rand(40, 150),
        s: rand(0.08, 0.35),
        a: rand(0.05, 0.16),
      });
    }
  }

  start() {
    this.reset();
    this.state = "playing";
    this.onState("playing", 0);
    this.emitState();
  }

  startCountdown() {
    this.reset();
    this.state = "ready";
    this.onState("ready", 0);
    this.emitState();
  }

  reset() {
    this.px = this.w * 0.3;
    this.py = this.h * 0.45;
    this.vy = 0;
    this.gas = 100;
    this.score = 0;
    this.combo = 1;
    this.comboTimer = 0;
    this.distance = 0;
    this.speed = 250;
    this.pipes = [];
    this.beans = [];
    this.parts = [];
    this.texts = [];
    this.shake = 0;
    this.flash = 0;
    this.stinkMeter = 0;
    this.deadTime = 0;
    this.thrustTime = 0;
    this.spawnX = this.w + 120;
    for (let i = 0; i < 3; i++) this.spawnPipe(this.spawnX + i * this.pipeSpacing());
    this.spawnX += 3 * this.pipeSpacing();
  }

  pipeSpacing() {
    return clamp(this.w * 0.46, 230, 360);
  }

  spawnPipe(x: number) {
    const diff = clamp(this.distance / 9000, 0, 1);
    const gapH = clamp(this.h * (0.42 - diff * 0.14), this.radius * 5.4, 420);
    const margin = this.h * 0.1;
    const gapY = rand(margin + gapH / 2, this.h - margin - gapH / 2);
    const w = clamp(this.w * 0.085, 52, 78);
    this.pipes.push({ x, gapY, gapH, w, passed: false, grazed: false, wobble: rand(0, 6.28) });
    // beans in the gap
    const n = Math.random() < 0.35 ? 3 : 1;
    for (let i = 0; i < n; i++) {
      this.beans.push({
        x: x + w / 2 + (i - (n - 1) / 2) * 34,
        y: gapY + rand(-gapH * 0.22, gapH * 0.22),
        taken: false,
        t: rand(0, 6.28),
        big: n === 1 && Math.random() < 0.18,
      });
    }
  }

  setThrust(on: boolean) {
    if (this.state !== "playing") {
      stopThrustFart(0.08);
      return;
    }
    this.thrusting = on;
    if (on && this.gas > 1) {
      this.cheekPulse = 1;
      playFart(rand(0.35, 0.48), clamp(this.gas / 100, 0.15, 0.85) + rand(-0.15, 0.15), 0.75, true);
      this.addText(this.px - 10, this.py + 10, BRAPS[(Math.random() * BRAPS.length) | 0], "#d9f99d", 18);
    } else if (!on) {
      stopThrustFart(0.1);
    }
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.thrusting = false;
    stopThrustFart(0.05);
    this.onState("paused", this.score);
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.last = performance.now();
    this.onState("playing", this.score);
  }

  die() {
    if (this.state === "dead") return;
    this.state = "dead";
    this.thrusting = false;
    stopThrustFart(0.04);
    this.shake = 26;
    this.flash = 1;
    playCrash();
    for (let i = 0; i < 70; i++) {
      this.parts.push({
        x: this.px,
        y: this.py,
        vx: rand(-420, 420),
        vy: rand(-420, 320),
        life: rand(0.5, 1.4),
        maxLife: 1.4,
        r: rand(4, 16),
        grow: rand(10, 50),
        kind: Math.random() < 0.55 ? 0 : 2,
        hue: rand(60, 110),
        rot: rand(0, 6.28),
        spin: rand(-8, 8),
      });
    }
    this.onState("dead", Math.floor(this.score));
  }

  addText(x: number, y: number, text: string, color: string, size: number) {
    if (this.texts.length > 18) this.texts.shift();
    this.texts.push({ x, y, vy: -60, life: 0.9, text, color, size });
  }

  puff(x: number, y: number, n: number, power: number) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 420) break;
      const a = rand(-0.6, 0.6);
      this.parts.push({
        x: x + rand(-4, 4),
        y: y + rand(-4, 4),
        vx: -Math.cos(a) * power * rand(0.4, 1) - this.speed * 0.25,
        vy: Math.sin(a) * power * 0.4 + rand(40, 180),
        life: rand(0.5, 1.1),
        maxLife: 1.1,
        r: rand(6, 14),
        grow: rand(26, 60),
        kind: 0,
        hue: rand(70, 115),
        rot: 0,
        spin: 0,
      });
    }
  }

  // ---------------- update ----------------
  step(dt: number) {
    this.time += dt;
    // clouds always drift
    for (const c of this.clouds) {
      c.x -= (20 + c.s * 60) * dt * (this.state === "playing" ? 1 : 0.35);
      if (c.x + c.r < 0) {
        c.x = this.w + c.r;
        c.y = rand(0, this.h);
      }
    }
    this.shake *= Math.pow(0.0016, dt);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.cheekPulse = Math.max(0, this.cheekPulse - dt * 4);
    this.stinkMeter = Math.max(0, this.stinkMeter - dt * 0.6);

    this.updateParticles(dt);
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.x -= (this.state === "playing" ? this.speed * 0.5 : 0) * dt;
      t.vy *= 0.96;
      if (t.life <= 0) this.texts.splice(i, 1);
    }

    if (this.state === "menu" || this.state === "ready") {
      this.py = this.h * 0.45 + Math.sin(this.time * 2.2) * 12;
      this.tilt = Math.sin(this.time * 2.2) * 0.08;
      this.squash += (1 - this.squash) * 0.2;
      if (Math.random() < dt * 1.6) this.puff(this.px - this.radius, this.py + 6, 2, 100);
      return;
    }
    if (this.state === "paused") return;

    if (this.state === "dead") {
      this.deadTime += dt;
      this.vy += 2400 * dt;
      this.py += this.vy * dt;
      this.tilt += dt * 6;
      if (this.py > this.h + 120) this.py = this.h + 120;
      return;
    }

    // --- playing ---
    this.speed = 250 + Math.min(230, this.distance / 42);
    this.distance += this.speed * dt;
    this.score += dt * 2.2;

    // thrust
    const canThrust = this.thrusting && this.gas > 0;
    if (canThrust) {
      this.thrustTime += dt;
      this.vy -= 2950 * dt;
      this.gas = Math.max(0, this.gas - 36 * dt);
      this.stinkMeter = Math.min(1, this.stinkMeter + dt * 1.4);
      this.puff(this.px - this.radius * 0.7, this.py + this.radius * 0.45, 3, 240);
      if (this.thrustTime > 0.18) {
        this.thrustTime = 0;
        playFart(rand(0.18, 0.28), clamp(this.gas / 100, 0.1, 0.8) + rand(-0.1, 0.1), 0.55);
      }
    } else {
      this.gas = Math.min(100, this.gas + 17 * dt);
      if (this.thrusting && this.gas < 20 && Math.random() < dt * 6) {
        this.addText(this.px, this.py - 24, "*squeak*", "#fde68a", 14);
      }
    }
    this.wasThrusting = canThrust;

    this.vy += 1750 * dt;
    this.vy = clamp(this.vy, -860, 1150);
    this.py += this.vy * dt;

    const targetSquash = canThrust ? 1.18 : clamp(1 + this.vy / 2600, 0.86, 1.16);
    this.squash += (targetSquash - this.squash) * clamp(dt * 12, 0, 1);
    this.tilt += (clamp(this.vy / 1400, -0.5, 0.7) - this.tilt) * clamp(dt * 8, 0, 1);

    // bounds
    if (this.py + this.radius > this.h - 6) {
      this.py = this.h - 6 - this.radius;
      this.die();
      return;
    }
    if (this.py - this.radius < 4) {
      this.py = 4 + this.radius;
      this.vy = Math.max(this.vy, 120);
      this.shake = Math.max(this.shake, 8);
    }

    // pipes
    const dx = this.speed * dt;
    this.spawnX -= dx;
    for (const p of this.pipes) p.x -= dx;
    for (const b of this.beans) b.x -= dx;
    if (this.spawnX < this.w + 40) {
      this.spawnPipe(this.w + 80);
      this.spawnX = this.w + 80 + this.pipeSpacing();
    }
    this.pipes = this.pipes.filter((p) => p.x + p.w > -40);
    this.beans = this.beans.filter((b) => b.x > -40 && !b.taken);

    // collisions
    for (const p of this.pipes) {
      const nearX = this.px + this.radius > p.x && this.px - this.radius < p.x + p.w;
      if (nearX) {
        const top = p.gapY - p.gapH / 2;
        const bot = p.gapY + p.gapH / 2;
        if (this.py - this.radius * 0.82 < top || this.py + this.radius * 0.82 > bot) {
          this.die();
          return;
        }
        const edge = Math.min(this.py - top, bot - this.py);
        if (!p.grazed && edge < this.radius * 1.55) {
          p.grazed = true;
          this.score += 15 * this.combo;
          this.bumpCombo();
          this.addText(this.px + 26, this.py - 30, PRAISE[(Math.random() * PRAISE.length) | 0], "#fbbf24", 20);
          playBlip(980, 0.1, "square", 0.18);
          this.shake = Math.max(this.shake, 5);
        }
      }
      if (!p.passed && p.x + p.w < this.px - this.radius) {
        p.passed = true;
        this.score += 10 * this.combo;
        this.flash = Math.max(this.flash, 0.18);
        playBlip(520, 0.09, "triangle", 0.14);
      }
    }

    // beans
    for (const b of this.beans) {
      b.t += dt * 4;
      const r = b.big ? 20 : 13;
      const ddx = b.x - this.px;
      const ddy = b.y - this.py;
      if (ddx * ddx + ddy * ddy < (r + this.radius) * (r + this.radius)) {
        b.taken = true;
        const val = b.big ? 60 : 20;
        this.score += val * this.combo;
        this.gas = Math.min(100, this.gas + (b.big ? 45 : 18));
        this.bumpCombo();
        playBlip(b.big ? 420 : 680 + this.combo * 24, 0.14, "sine", 0.22);
        if (b.big) playFart(0.5, 0.8, 0.4);
        this.addText(b.x, b.y - 10, `+${val * (this.combo - 1 > 0 ? this.combo : 1)}`, b.big ? "#fca5a5" : "#bef264", b.big ? 26 : 18);
        for (let i = 0; i < (b.big ? 26 : 12); i++) {
          this.parts.push({
            x: b.x,
            y: b.y,
            vx: rand(-220, 160),
            vy: rand(-220, 220),
            life: rand(0.3, 0.7),
            maxLife: 0.7,
            r: rand(2, 5),
            grow: -2,
            kind: 1,
            hue: b.big ? rand(10, 40) : rand(70, 110),
            rot: 0,
            spin: 0,
          });
        }
        this.shake = Math.max(this.shake, b.big ? 10 : 4);
      }
    }

    // combo decay
    this.comboTimer -= dt;
    if (this.comboTimer <= 0 && this.combo > 1) {
      this.combo = 1;
    }
  }

  bumpCombo() {
    this.combo = Math.min(9, this.combo + 1);
    this.comboTimer = 3.4;
  }

  updateParticles(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.kind === 0) {
        p.vy -= 60 * dt; // gas rises
        p.vx *= Math.pow(0.2, dt);
        p.r += p.grow * dt;
      } else if (p.kind === 1) {
        p.vy += 520 * dt;
        p.vx *= Math.pow(0.5, dt);
      } else {
        p.vy += 900 * dt;
      }
      if (this.state === "playing") p.x -= this.speed * 0.55 * dt;
    }
  }

  // ---------------- render ----------------
  render() {
    const g = this.ctx;
    const w = this.w;
    const h = this.h;
    this.shakeX = (Math.random() - 0.5) * this.shake;
    this.shakeY = (Math.random() - 0.5) * this.shake;

    // sky
    const sky = g.createLinearGradient(0, 0, 0, h);
    const s = this.stinkMeter;
    sky.addColorStop(0, `rgb(${30 + s * 10}, ${44 + s * 26}, ${52})`);
    sky.addColorStop(0.55, `rgb(${34 + s * 24}, ${64 + s * 40}, ${58})`);
    sky.addColorStop(1, `rgb(${58 + s * 30}, ${86 + s * 40}, ${60})`);
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);

    g.save();
    g.translate(this.shakeX, this.shakeY);

    // haze clouds
    for (const c of this.clouds) {
      const grd = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
      grd.addColorStop(0, `rgba(170, 220, 120, ${c.a})`);
      grd.addColorStop(1, "rgba(170, 220, 120, 0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(c.x, c.y, c.r, 0, 6.2832);
      g.fill();
    }

    // horizon stripes (parallax floor tiles)
    const tile = 60;
    const off = (this.distance * 0.35) % tile;
    g.globalAlpha = 0.12;
    g.fillStyle = "#eafbd0";
    for (let x = -off; x < w; x += tile) g.fillRect(x, h - 26, tile * 0.5, 26);
    g.globalAlpha = 1;

    this.drawPipes(g);
    this.drawBeans(g);
    this.drawParticles(g);
    if (this.state !== "dead" || this.deadTime < 3) this.drawPlayer(g);
    this.drawTexts(g);

    g.restore();

    // ground line
    g.fillStyle = "rgba(20,30,18,0.65)";
    g.fillRect(0, h - 6, w, 6);

    this.drawHud(g);

    // flash + vignette
    if (this.flash > 0.01) {
      g.fillStyle = `rgba(220, 255, 180, ${this.flash * 0.35})`;
      g.fillRect(0, 0, w, h);
    }
    const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.45)");
    g.fillStyle = vig;
    g.fillRect(0, 0, w, h);
  }

  drawPipes(g: CanvasRenderingContext2D) {
    for (const p of this.pipes) {
      const top = p.gapY - p.gapH / 2;
      const bot = p.gapY + p.gapH / 2;
      const grd = g.createLinearGradient(p.x, 0, p.x + p.w, 0);
      grd.addColorStop(0, "#cfe7ef");
      grd.addColorStop(0.35, "#ffffff");
      grd.addColorStop(1, "#7fa6b4");
      const lip = 16;
      const drawSeg = (y: number, hh: number, lipAtBottom: boolean) => {
        g.fillStyle = grd;
        g.beginPath();
        g.roundRect(p.x + 6, y, p.w - 12, hh, 6);
        g.fill();
        g.fillStyle = grd;
        g.beginPath();
        g.roundRect(p.x - 2, lipAtBottom ? y + hh - lip : y, p.w + 4, lip, 7);
        g.fill();
        g.strokeStyle = "rgba(30,60,60,0.35)";
        g.lineWidth = 2;
        g.stroke();
        // stink drip accents
        g.fillStyle = "rgba(132,204,22,0.35)";
        g.fillRect(p.x + 10, lipAtBottom ? y + hh - lip - 4 : y + lip, 4, 10);
      };
      drawSeg(-20, top + 20, true);
      drawSeg(bot, this.h - bot + 20, false);
    }
  }

  drawBeans(g: CanvasRenderingContext2D) {
    for (const b of this.beans) {
      const r = b.big ? 18 : 11;
      const bob = Math.sin(b.t) * 4;
      g.save();
      g.translate(b.x, b.y + bob);
      g.rotate(Math.sin(b.t * 0.6) * 0.4);
      const grd = g.createLinearGradient(-r, -r, r, r);
      if (b.big) {
        grd.addColorStop(0, "#fca5a5");
        grd.addColorStop(1, "#b91c1c");
      } else {
        grd.addColorStop(0, "#d9f99d");
        grd.addColorStop(1, "#65a30d");
      }
      g.fillStyle = grd;
      g.shadowColor = b.big ? "rgba(248,113,113,0.8)" : "rgba(163,230,53,0.7)";
      g.shadowBlur = 14;
      g.beginPath();
      g.ellipse(0, 0, r, r * 0.74, 0, 0, 6.2832);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.beginPath();
      g.ellipse(-r * 0.3, -r * 0.28, r * 0.26, r * 0.16, -0.5, 0, 6.2832);
      g.fill();
      g.restore();
    }
  }

  drawParticles(g: CanvasRenderingContext2D) {
    for (const p of this.parts) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.kind === 0) {
        g.globalAlpha = a * 0.5;
        g.fillStyle = `hsl(${p.hue}, 70%, ${55 + (1 - a) * 20}%)`;
        g.beginPath();
        g.arc(p.x, p.y, Math.max(1, p.r), 0, 6.2832);
        g.fill();
      } else if (p.kind === 1) {
        g.globalAlpha = a;
        g.fillStyle = `hsl(${p.hue}, 90%, 65%)`;
        g.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
      } else {
        g.globalAlpha = a;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillStyle = "#8b5a2b";
        g.beginPath();
        g.roundRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.8, 3);
        g.fill();
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }

  drawPlayer(g: CanvasRenderingContext2D) {
    const r = this.radius;
    const sq = this.squash;
    g.save();
    g.translate(this.px, this.py);
    g.rotate(this.tilt);
    const pulse = 1 + this.cheekPulse * 0.22;

    // butt/exhaust glow
    if (this.wasThrusting) {
      const glow = g.createRadialGradient(-r * 0.9, r * 0.4, 0, -r * 0.9, r * 0.4, r * 2.2);
      glow.addColorStop(0, "rgba(190,242,100,0.55)");
      glow.addColorStop(1, "rgba(190,242,100,0)");
      g.fillStyle = glow;
      g.beginPath();
      g.arc(-r * 0.9, r * 0.4, r * 2.2, 0, 6.2832);
      g.fill();
    }

    // body
    const body = g.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.2, 0, 0, r * 1.3);
    body.addColorStop(0, "#fde68a");
    body.addColorStop(0.6, "#f59e0b");
    body.addColorStop(1, "#b45309");
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(0, 0, r * (2 - sq) * pulse, r * sq * pulse, 0, 0, 6.2832);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "rgba(60,30,0,0.55)";
    g.stroke();

    // cheeks (rear)
    g.fillStyle = "rgba(180,83,9,0.9)";
    g.beginPath();
    g.ellipse(-r * 0.78, r * 0.22, r * 0.4, r * 0.42 * pulse, 0, 0, 6.2832);
    g.fill();

    // eyes
    const look = clamp(this.vy / 900, -0.6, 0.6);
    g.fillStyle = "#fff";
    g.beginPath();
    g.ellipse(r * 0.34, -r * 0.22, r * 0.3, r * 0.33, 0, 0, 6.2832);
    g.ellipse(r * 0.82, -r * 0.2, r * 0.26, r * 0.3, 0, 0, 6.2832);
    g.fill();
    g.fillStyle = "#1f2937";
    g.beginPath();
    g.arc(r * 0.4, -r * 0.2 + look * r * 0.2, r * 0.14, 0, 6.2832);
    g.arc(r * 0.86, -r * 0.18 + look * r * 0.2, r * 0.12, 0, 6.2832);
    g.fill();

    // mouth
    g.strokeStyle = "#7c2d12";
    g.lineWidth = 2.5;
    g.beginPath();
    if (this.wasThrusting) g.arc(r * 0.6, r * 0.3, r * 0.2, 0, Math.PI);
    else g.arc(r * 0.6, r * 0.36, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();

    // blush
    g.fillStyle = "rgba(244,114,182,0.45)";
    g.beginPath();
    g.ellipse(r * 0.2, r * 0.18, r * 0.17, r * 0.11, 0, 0, 6.2832);
    g.fill();
    g.restore();
  }

  drawTexts(g: CanvasRenderingContext2D) {
    g.textAlign = "center";
    for (const t of this.texts) {
      const a = clamp(t.life / 0.9, 0, 1);
      g.globalAlpha = a;
      g.font = `900 ${t.size * (1 + (1 - a) * 0.3)}px ui-rounded, "Trebuchet MS", system-ui, sans-serif`;
      g.lineWidth = 4;
      g.strokeStyle = "rgba(20,30,15,0.7)";
      g.strokeText(t.text, t.x, t.y);
      g.fillStyle = t.color;
      g.fillText(t.text, t.x, t.y);
    }
    g.globalAlpha = 1;
    g.textAlign = "left";
  }

  drawHud(g: CanvasRenderingContext2D) {
    if (this.state === "menu" || this.state === "ready") return;
    const pad = 16;
    // score
    g.font = `900 ${clamp(this.h * 0.065, 26, 44)}px ui-rounded, "Trebuchet MS", system-ui, sans-serif`;
    g.textAlign = "left";
    g.lineWidth = 6;
    g.strokeStyle = "rgba(15,25,12,0.75)";
    const sTxt = String(Math.floor(this.score));
    g.strokeText(sTxt, pad, pad + clamp(this.h * 0.06, 26, 42));
    g.fillStyle = "#ecfccb";
    g.fillText(sTxt, pad, pad + clamp(this.h * 0.06, 26, 42));

    if (this.combo > 1) {
      g.font = `900 ${clamp(this.h * 0.035, 16, 24)}px ui-rounded, "Trebuchet MS", system-ui, sans-serif`;
      const ct = `x${this.combo} STINK`;
      const y = pad + clamp(this.h * 0.06, 26, 42) + 26;
      g.lineWidth = 5;
      g.strokeText(ct, pad, y);
      g.fillStyle = `hsl(${60 + this.combo * 8}, 95%, 65%)`;
      g.fillText(ct, pad, y);
      // combo timer bar
      g.fillStyle = "rgba(255,255,255,0.25)";
      g.fillRect(pad, y + 8, 90, 4);
      g.fillStyle = "#fbbf24";
      g.fillRect(pad, y + 8, 90 * clamp(this.comboTimer / 3.4, 0, 1), 4);
    }

    // gas meter (right)
    const bw = clamp(this.w * 0.28, 110, 200);
    const bh = 16;
    const bx = this.w - bw - pad;
    const by = pad + 6;
    g.fillStyle = "rgba(10,20,10,0.55)";
    g.beginPath();
    g.roundRect(bx - 3, by - 3, bw + 6, bh + 6, 10);
    g.fill();
    const gg = g.createLinearGradient(bx, 0, bx + bw, 0);
    gg.addColorStop(0, this.gas < 25 ? "#f87171" : "#a3e635");
    gg.addColorStop(1, this.gas < 25 ? "#fbbf24" : "#4ade80");
    g.fillStyle = gg;
    g.beginPath();
    g.roundRect(bx, by, Math.max(2, (bw * this.gas) / 100), bh, 8);
    g.fill();
    g.font = `800 12px ui-rounded, "Trebuchet MS", system-ui, sans-serif`;
    g.fillStyle = "rgba(236,252,203,0.9)";
    g.textAlign = "right";
    g.fillText("GAS", bx + bw, by + bh + 15);
    g.textAlign = "left";
  }

  emitState() {
    this.onHud({ score: Math.floor(this.score), best: this.best, combo: this.combo, gas: this.gas });
  }

  loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (!isFinite(dt)) dt = 0;
    dt = Math.min(dt, 0.1);
    this.acc += dt;
    const fixed = 1 / 120;
    let guard = 0;
    while (this.acc >= fixed && guard < 12) {
      this.step(fixed);
      this.acc -= fixed;
      guard++;
    }
    if (guard >= 12) this.acc = 0;
    this.render();
    this.hudAcc += dt;
    if (this.hudAcc > 0.1) {
      this.hudAcc = 0;
      this.emitState();
    }
  };

  mount() {
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  unmount() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
