(function (global) {
  "use strict";

  const U = global.U;

  const Particles = {
    list: [],
    texts: [],
    dust: [],

    reset() {
      this.list.length = 0;
      this.texts.length = 0;
    },

    initDust(w, h) {
      this.dust.length = 0;
      for (let i = 0; i < 70; i++) {
        this.dust.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z: U.rand(0.25, 1),
          vy: U.rand(-16, -4),
          vx: U.rand(-6, 6),
          size: U.rand(0.6, 2.2)
        });
      }
    },

    burst(x, y, opts) {
      const o = opts || {};
      const count = o.count || 14;
      const color = o.color || "#31e1ff";
      const speed = o.speed || 260;
      const spread = o.spread == null ? U.TAU : o.spread;
      const dir = o.dir == null ? 0 : o.dir;
      for (let i = 0; i < count; i++) {
        const angle = dir + U.rand(-spread / 2, spread / 2);
        const v = speed * U.rand(0.35, 1);
        this.list.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v,
          life: 0,
          max: U.rand(0.32, 0.72) * (o.lifeScale || 1),
          size: U.rand(1.6, 4.4) * (o.sizeScale || 1),
          color: color,
          drag: o.drag == null ? 2.6 : o.drag,
          grav: o.grav == null ? 260 : o.grav,
          shape: o.shape || "square",
          rot: U.rand(0, U.TAU),
          vrot: U.rand(-9, 9),
          add: true
        });
      }
    },

    ring(x, y, opts) {
      const o = opts || {};
      this.list.push({
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        life: 0,
        max: o.max || 0.42,
        size: o.size || 10,
        grow: o.grow || 190,
        color: o.color || "#31e1ff",
        drag: 0,
        grav: 0,
        shape: "ring",
        width: o.width || 3,
        rot: 0,
        vrot: 0,
        add: true
      });
    },

    trailDot(x, y, color, size, life) {
      this.list.push({
        x: x,
        y: y,
        vx: 0,
        vy: 0,
        life: 0,
        max: life || 0.28,
        size: size || 5,
        color: color,
        drag: 0,
        grav: 0,
        shape: "circle",
        rot: 0,
        vrot: 0,
        add: true
      });
    },

    text(x, y, str, color, opts) {
      const o = opts || {};
      this.texts.push({
        x: x,
        y: y,
        vy: o.vy == null ? -46 : o.vy,
        life: 0,
        max: o.max || 0.85,
        str: str,
        color: color || "#eaf6ff",
        size: o.size || 15,
        weight: o.weight || 700
      });
    },

    update(dt, w, h) {
      const list = this.list;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.life += dt;
        if (p.life >= p.max) {
          list.splice(i, 1);
          continue;
        }
        if (p.shape === "ring") {
          p.size += p.grow * dt;
          p.grow *= Math.exp(-2.2 * dt);
          continue;
        }
        const damp = Math.exp(-p.drag * dt);
        p.vx *= damp;
        p.vy = p.vy * damp + p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        if (p.y > h + 30) {
          list.splice(i, 1);
        }
      }

      const texts = this.texts;
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i];
        t.life += dt;
        if (t.life >= t.max) {
          texts.splice(i, 1);
          continue;
        }
        t.vy *= Math.exp(-2.4 * dt);
        t.y += t.vy * dt;
      }

      for (let i = 0; i < this.dust.length; i++) {
        const d = this.dust[i];
        d.y += d.vy * d.z * dt;
        d.x += d.vx * d.z * dt;
        if (d.y < -12) { d.y = h + 12; d.x = Math.random() * w; }
        if (d.x < -12) d.x = w + 12;
        if (d.x > w + 12) d.x = -12;
      }
    },

    drawDust(ctx, w, h, time) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < this.dust.length; i++) {
        const d = this.dust[i];
        const twinkle = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(time * 1.6 + i));
        ctx.globalAlpha = 0.1 * d.z * twinkle;
        ctx.fillStyle = i % 5 === 0 ? "#ff8ad8" : "#8fd8ff";
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size * d.z * 1.8, 0, U.TAU);
        ctx.fill();
      }
      ctx.restore();
    },

    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const list = this.list;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const t = p.life / p.max;
        const alpha = 1 - t * t;

        if (p.shape === "ring") {
          ctx.globalAlpha = alpha * 0.5;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.width * (1 - t * 0.7);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, U.TAU);
          ctx.stroke();
          continue;
        }

        ctx.globalAlpha = alpha * 0.9;
        ctx.fillStyle = p.color;
        if (p.shape === "square") {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const s = p.size * (1 - t * 0.45);
          ctx.fillRect(-s / 2, -s / 2, s, s);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.6), 0, U.TAU);
          ctx.fill();
        }
      }

      ctx.globalCompositeOperation = "source-over";
      const texts = this.texts;
      for (let i = 0; i < texts.length; i++) {
        const tx = texts[i];
        const t = tx.life / tx.max;
        const pop = t < 0.18 ? U.easeOutBack(t / 0.18) : 1;
        ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
        ctx.save();
        ctx.translate(tx.x, tx.y);
        ctx.scale(pop, pop);
        ctx.font = tx.weight + " " + tx.size + 'px "Orbitron", "Rajdhani", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(3,6,16,0.85)";
        ctx.strokeText(tx.str, 0, 0);
        ctx.fillStyle = tx.color;
        ctx.fillText(tx.str, 0, 0);
        ctx.restore();
      }

      ctx.restore();
    }
  };

  global.Particles = Particles;
})(window);
