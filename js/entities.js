(function (global) {
  "use strict";

  const U = global.U;
  const Input = global.Input;
  const TAU = Math.PI * 2;

  const POWERUPS = {
    multi: { color: "#31e1ff", label: "M", name: "MULTI" },
    wide: { color: "#7cff6b", label: "W", name: "WIDE" },
    slow: { color: "#43ffd0", label: "S", name: "SLOW" },
    laser: { color: "#ff5fa2", label: "L", name: "LASER" },
    life: { color: "#ff2bd6", label: "+", name: "LIFE" }
  };

  const POWERUP_WEIGHTS = [
    ["multi", 26],
    ["wide", 22],
    ["laser", 17],
    ["slow", 15],
    ["life", 8]
  ];

  const POWERUP_TOTAL = POWERUP_WEIGHTS.reduce((sum, p) => sum + p[1], 0);

  function rollPowerUp() {
    let roll = Math.random() * POWERUP_TOTAL;
    for (let i = 0; i < POWERUP_WEIGHTS.length; i++) {
      roll -= POWERUP_WEIGHTS[i][1];
      if (roll <= 0) return POWERUP_WEIGHTS[i][0];
    }
    return "multi";
  }

  /* ------------------------------------------------------------------ */

  class Paddle {
    constructor(game) {
      this.game = game;
      this.baseW = 96;
      this.w = this.baseW;
      this.h = 13;
      this.cx = game.W / 2;
      this.y = game.H - 58;
      this.vx = 0;
      this.targetScale = 1;
      this.wideTimer = 0;
      this.laserTimer = 0;
      this.slowTimer = 0;
      this.fireCooldown = 0;
      this.flash = 0;
      this.tilt = 0;
      this.x = this.cx - this.w / 2;
    }

    reset() {
      this.targetScale = 1;
      this.w = this.baseW;
      this.wideTimer = 0;
      this.laserTimer = 0;
      this.slowTimer = 0;
      this.fireCooldown = 0;
      this.flash = 0;
      this.tilt = 0;
      this.cx = this.game.W / 2;
      this.vx = 0;
      this.x = this.cx - this.w / 2;
    }

    get speedMultiplier() {
      return this.slowTimer > 0 ? 0.7 : 1;
    }

    applyPower(type) {
      switch (type) {
        case "wide":
          this.targetScale = 1.75;
          this.wideTimer = 14;
          break;
        case "laser":
          this.laserTimer = 11;
          break;
        case "slow":
          this.slowTimer = 9;
          break;
        default:
          break;
      }
    }

    update(dt) {
      const prevCx = this.cx;

      const targetW = this.baseW * this.targetScale;
      this.w = U.damp(this.w, targetW, 12, dt);

      if (this.wideTimer > 0) {
        this.wideTimer -= dt;
        if (this.wideTimer <= 0) {
          this.wideTimer = 0;
          this.targetScale = 1;
        }
      }
      if (this.laserTimer > 0) this.laserTimer = Math.max(0, this.laserTimer - dt);
      if (this.slowTimer > 0) this.slowTimer = Math.max(0, this.slowTimer - dt);
      if (this.fireCooldown > 0) this.fireCooldown -= dt;
      this.flash = Math.max(0, this.flash - dt * 4);

      const axis = Input.moveAxis();
      if (axis !== 0) {
        this.cx += axis * 760 * dt;
      } else if (Input.usePointer && Input.pointerX != null) {
        this.cx = U.damp(this.cx, Input.pointerX, 24, dt);
      }

      const half = this.w / 2;
      this.cx = U.clamp(this.cx, half, this.game.W - half);
      this.x = this.cx - half;

      this.vx = dt > 0 ? (this.cx - prevCx) / dt : 0;
      this.tilt = U.damp(this.tilt, U.clamp(this.vx / 2600, -0.22, 0.22), 10, dt);
    }

    draw(ctx, time) {
      const x = this.x;
      const y = this.y;
      const w = this.w;
      const h = this.h;

      ctx.save();
      ctx.translate(this.cx, y + h / 2);
      ctx.rotate(this.tilt);
      ctx.translate(-this.cx, -(y + h / 2));

      const glow = ctx.createLinearGradient(x, y, x + w, y + h);
      glow.addColorStop(0, "#31e1ff");
      glow.addColorStop(0.5, "#7ee7ff");
      glow.addColorStop(1, "#a06bff");

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.32 + this.flash * 0.3;
      ctx.fillStyle = glow;
      U.roundRect(ctx, x - 4, y - 5, w + 8, h + 10, 12);
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      U.roundRect(ctx, x, y, w, h, 7);
      ctx.fill();

      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      U.roundRect(ctx, x + 6, y + 2.5, Math.max(4, w - 12), 2, 2);
      ctx.fill();

      if (this.flash > 0) {
        ctx.globalAlpha = this.flash * 0.7;
        ctx.fillStyle = "#ffffff";
        U.roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 9);
        ctx.fill();
      }

      if (this.laserTimer > 0) {
        const blink = 0.55 + 0.45 * Math.sin(time * 22);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = blink;
        ctx.fillStyle = "#ff5fa2";
        U.roundRect(ctx, x - 1, y - 8, 7, 9, 3);
        ctx.fill();
        U.roundRect(ctx, x + w - 6, y - 8, 7, 9, 3);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ */

  class Ball {
    constructor(game, x, y) {
      this.game = game;
      this.r = 7;
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.stuck = true;
      this.stickOffset = 0;
      this.trail = [];
      this.dead = false;
      this.spawn = 0;
      this.lastHit = "none";
    }

    get speed() {
      return Math.hypot(this.vx, this.vy);
    }

    attach(paddle, offset) {
      this.stuck = true;
      this.stickOffset = offset;
      this.vx = 0;
      this.vy = 0;
      this.lastHit = "none";
      this.x = paddle.cx + offset;
      this.y = paddle.y - this.r - 2;
    }

    launch(angle, speed) {
      this.stuck = false;
      this.vx = Math.sin(angle) * speed;
      this.vy = -Math.cos(angle) * speed;
      this.trail.length = 0;
    }

    step(dt, mul) {
      this.x += this.vx * mul * dt;
      this.y += this.vy * mul * dt;
    }

    syncTrail() {
      this.trail.unshift(this.x, this.y);
      if (this.trail.length > 26) this.trail.length = 26;
    }

    speedUp(factor, min, max) {
      const s = U.clamp(this.speed * factor, min, max);
      const angle = Math.atan2(this.vy, this.vx);
      this.vx = Math.cos(angle) * s;
      this.vy = Math.sin(angle) * s;
    }

    draw(ctx) {
      const r = this.r;
      const ballScale = this.spawn < 1 ? U.easeOutBack(this.spawn) : 1;
      const rr = r * (0.6 + 0.4 * ballScale);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      for (let i = this.trail.length - 2; i >= 0; i -= 2) {
        const t = 1 - i / Math.max(2, this.trail.length);
        const px = this.trail[i];
        const py = this.trail[i + 1];
        ctx.globalAlpha = 0.2 * t * t;
        ctx.fillStyle = "#8fe9ff";
        ctx.beginPath();
        ctx.arc(px, py, rr * (0.35 + 0.6 * t), 0, TAU);
        ctx.fill();
      }

      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#31e1ff";
      ctx.beginPath();
      ctx.arc(this.x, this.y, rr * 2.5, 0, TAU);
      ctx.fill();

      ctx.globalAlpha = 0.65;
      ctx.fillStyle = "#9ff0ff";
      ctx.beginPath();
      ctx.arc(this.x, this.y, rr * 1.4, 0, TAU);
      ctx.fill();

      ctx.restore();

      ctx.globalAlpha = 1;
      const core = ctx.createRadialGradient(
        this.x - rr * 0.35, this.y - rr * 0.35, rr * 0.15,
        this.x, this.y, rr
      );
      core.addColorStop(0, "#ffffff");
      core.addColorStop(0.55, "#d6f8ff");
      core.addColorStop(1, "#31e1ff");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(this.x, this.y, rr, 0, TAU);
      ctx.fill();
    }
  }

  /* ------------------------------------------------------------------ */

  class Brick {
    constructor(x, y, w, h, def, row, col) {
      this.x = x;
      this.y = y;
      this.w = w;
      this.h = h;
      this.row = row;
      this.col = col;
      this.solid = def.hp === Infinity;
      this.maxHp = this.solid ? Infinity : def.hp;
      this.hp = def.hp;
      this.points = def.points;
      this.color = def.color;
      this.flash = 0;
      this.spawn = 0;
      this.spawnDelay = row * 0.035 + col * 0.012;
      this.shake = 0;
    }

    get alive() {
      return this.solid || this.hp > 0;
    }

    get damaged() {
      return !this.solid && this.hp < this.maxHp;
    }

    hit(damage) {
      this.flash = 1;
      this.shake = 1;
      if (this.solid) return false;
      this.hp -= damage;
      return this.hp <= 0;
    }

    update(dt) {
      this.flash = Math.max(0, this.flash - dt * 5.5);
      this.shake = Math.max(0, this.shake - dt * 6);
      this.spawn = Math.min(1, this.spawn + dt * 2.6);
    }

    draw(ctx) {
      const t = this.damaged ? this.hp / this.maxHp : 1;
      const base = this.solid ? "#3a4460" : this.color;
      const scale = this.spawn < 1 ? 0.55 + 0.45 * U.easeOutBack(this.spawn) : 1;
      const sx = this.shake * Math.sin(this.shake * 40) * 2.4;

      ctx.save();
      ctx.globalAlpha = this.spawn;
      ctx.translate(this.x + this.w / 2 + sx, this.y + this.h / 2);
      ctx.scale(1, scale);

      const w = this.w;
      const h = this.h;
      const grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
      grad.addColorStop(0, U.shade(base, 0.26));
      grad.addColorStop(0.5, base);
      grad.addColorStop(1, U.shade(base, -0.32));

      if (!this.solid) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = this.spawn * (0.16 + 0.24 * (1 - t));
        ctx.fillStyle = base;
        U.roundRect(ctx, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 7);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = this.spawn;
      }

      ctx.fillStyle = grad;
      U.roundRect(ctx, -w / 2, -h / 2, w, h, 5);
      ctx.fill();

      ctx.lineWidth = 1;
      ctx.strokeStyle = this.solid
        ? "rgba(190, 210, 255, 0.35)"
        : "rgba(255, 255, 255, 0.38)";
      ctx.stroke();

      ctx.globalAlpha = this.spawn * (this.solid ? 0.5 : 0.55);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      U.roundRect(ctx, -w / 2 + 4, -h / 2 + 3, Math.max(3, w - 8), 2, 1);
      ctx.fill();

      if (this.solid) {
        ctx.globalAlpha = this.spawn * 0.35;
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath();
        for (let i = -1; i <= 1; i++) {
          ctx.moveTo(i * w * 0.26 - 3, -h / 2 + 4);
          ctx.lineTo(i * w * 0.26 + 3, h / 2 - 4);
        }
        ctx.stroke();
      } else if (this.damaged) {
        ctx.globalAlpha = this.spawn * 0.5;
        ctx.strokeStyle = "rgba(10, 12, 24, 0.75)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-w * 0.24, -h * 0.3);
        ctx.lineTo(-w * 0.06, 0);
        ctx.lineTo(-w * 0.2, h * 0.32);
        ctx.stroke();
      }

      if (this.flash > 0) {
        ctx.globalAlpha = this.flash * 0.85;
        ctx.fillStyle = "#ffffff";
        U.roundRect(ctx, -w / 2 - 1, -h / 2 - 1, w + 2, h + 2, 6);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ */

  class PowerUp {
    constructor(x, y, type) {
      this.x = x;
      this.y = y;
      this.type = type;
      this.def = POWERUPS[type];
      this.w = 30;
      this.h = 18;
      this.vy = 118;
      this.rot = 0;
      this.t = 0;
      this.dead = false;
      this.phase = U.rand(0, TAU);
    }

    update(dt, h) {
      this.t += dt;
      this.y += this.vy * dt;
      this.x += Math.sin(this.t * 3 + this.phase) * 26 * dt;
      this.rot = Math.sin(this.t * 4 + this.phase) * 0.24;
      if (this.y - this.h > h) this.dead = true;
    }

    draw(ctx) {
      const color = this.def.color;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);

      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + 0.18 * Math.sin(this.t * 8 + this.phase);
      ctx.fillStyle = color;
      U.roundRect(ctx, -this.w / 2 - 5, -this.h / 2 - 5, this.w + 10, this.h + 10, 12);
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      const grad = ctx.createLinearGradient(0, -this.h / 2, 0, this.h / 2);
      grad.addColorStop(0, U.shade(color, 0.35));
      grad.addColorStop(1, U.shade(color, -0.15));
      ctx.fillStyle = grad;
      U.roundRect(ctx, -this.w / 2, -this.h / 2, this.w, this.h, 9);
      ctx.fill();

      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#07101c";
      ctx.font = '700 12px "Orbitron", monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.def.label, 0, 0.5);

      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ */

  class Bolt {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.vy = -880;
      this.w = 3.5;
      this.h = 18;
      this.dead = false;
    }

    update(dt) {
      this.y += this.vy * dt;
      if (this.y + this.h < -10) this.dead = true;
    }

    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#ff5fa2";
      U.roundRect(ctx, this.x - this.w * 1.8, this.y - this.h / 2, this.w * 3.6, this.h, 4);
      ctx.fill();

      ctx.globalAlpha = 1;
      const grad = ctx.createLinearGradient(0, this.y - this.h / 2, 0, this.y + this.h / 2);
      grad.addColorStop(0, "rgba(255,255,255,0.9)");
      grad.addColorStop(0.5, "#ff9ecd");
      grad.addColorStop(1, "#ff2bd6");
      ctx.fillStyle = grad;
      U.roundRect(ctx, this.x - this.w / 2, this.y - this.h / 2, this.w, this.h, 2);
      ctx.fill();

      ctx.restore();
    }
  }

  global.Entities = { Paddle, Ball, Brick, PowerUp, Bolt, POWERUPS, rollPowerUp };
})(window);
