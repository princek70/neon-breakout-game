(function (global) {
  "use strict";

  const U = {
    TAU: Math.PI * 2,

    clamp(v, min, max) {
      return v < min ? min : v > max ? max : v;
    },

    lerp(a, b, t) {
      return a + (b - a) * t;
    },

    damp(current, target, lambda, dt) {
      return U.lerp(current, target, 1 - Math.exp(-lambda * dt));
    },

    rand(min, max) {
      return min + Math.random() * (max - min);
    },

    randInt(min, max) {
      return Math.floor(min + Math.random() * (max - min + 1));
    },

    pick(list) {
      return list[Math.floor(Math.random() * list.length)];
    },

    easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    },

    easeOutBack(t) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },

    easeInOutQuad(t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    },

    roundRect(ctx, x, y, w, h, r) {
      const rad = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.lineTo(x + w - rad, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
      ctx.lineTo(x + w, y + h - rad);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
      ctx.lineTo(x + rad, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
      ctx.lineTo(x, y + rad);
      ctx.quadraticCurveTo(x, y, x + rad, y);
      ctx.closePath();
    },

    shade(hex, amount) {
      const n = parseInt(hex.slice(1), 16);
      let r = (n >> 16) & 255;
      let g = (n >> 8) & 255;
      let b = n & 255;
      r = U.clamp(Math.round(r + 255 * amount), 0, 255);
      g = U.clamp(Math.round(g + 255 * amount), 0, 255);
      b = U.clamp(Math.round(b + 255 * amount), 0, 255);
      return "rgb(" + r + "," + g + "," + b + ")";
    },

    formatScore(n) {
      return String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
  };

  global.U = U;
})(window);
