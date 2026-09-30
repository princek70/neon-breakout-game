(function (global) {
  "use strict";

  const Sound = {
    ctx: null,
    master: null,
    enabled: true,
    muted: false,

    load() {
      try {
        const storage = global.CrazyGames?.SDK?.data || global.localStorage;
        const stored = storage.getItem("neon-breakout-muted");
        if (stored === "1") this.muted = true;
      } catch (e) { /* storage unavailable */ }

      // Listen for CrazyGames SDK mute settings
      if (global.CrazyGames?.SDK?.game) {
        // Initial state
        if (global.CrazyGames.SDK.game.settings?.muteAudio) {
          this.muted = true;
        }
        // Listener for changes
        global.CrazyGames.SDK.game.addSettingsChangeListener((settings) => {
          if (settings.muteAudio !== undefined) {
            this.muted = settings.muteAudio;
          }
        });
      }
    },

    unlock() {
      if (!this.enabled) return;
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume();
        return;
      }
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      try {
        this.ctx = new AC();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 24;
        comp.ratio.value = 8;
        comp.attack.value = 0.003;
        comp.release.value = 0.22;
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
      } catch (e) {
        this.enabled = false;
      }
    },

    toggleMute() {
      this.muted = !this.muted;
      try {
        const storage = global.CrazyGames?.SDK?.data || global.localStorage;
        storage.setItem("neon-breakout-muted", this.muted ? "1" : "0");
      } catch (e) { /* ignore */ }
      return this.muted;
    },

    ready() {
      return this.enabled && !this.muted && !!this.ctx;
    },

    tone(opts) {
      if (!this.ready()) return;
      const o = opts || {};
      const freq = o.freq || 440;
      const dur = o.dur || 0.12;
      const vol = o.vol == null ? 0.22 : o.vol;
      const type = o.type || "square";
      const slide = o.slide || 0;
      const delay = o.delay || 0;
      const attack = o.attack == null ? 0.006 : o.attack;
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(24, freq * slide), t0 + dur);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.04);
    },

    noise(opts) {
      if (!this.ready()) return;
      const o = opts || {};
      const dur = o.dur || 0.25;
      const vol = o.vol == null ? 0.28 : o.vol;
      const freq = o.freq || 900;
      const q = o.q || 1.2;
      const t0 = this.ctx.currentTime + (o.delay || 0);
      const frames = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(freq, t0);
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.35), t0 + dur);
      filter.Q.value = q;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    },

    arp(freqs, step, opts) {
      const o = opts || {};
      freqs.forEach((f, i) => {
        this.tone({
          freq: f,
          type: o.type || "triangle",
          dur: o.dur || 0.16,
          vol: o.vol == null ? 0.2 : o.vol,
          delay: i * step,
          slide: o.slide || 0
        });
      });
    },

    /* -------- game events -------- */

    paddle() {
      this.tone({ freq: 208, type: "square", dur: 0.08, vol: 0.2, slide: 1.7 });
      this.noise({ dur: 0.06, vol: 0.09, freq: 2400 });
    },

    wall() {
      this.tone({ freq: 168, type: "triangle", dur: 0.06, vol: 0.14, slide: 1.5 });
    },

    brick(hp, combo) {
      const base = 420 + Math.min(combo, 12) * 26;
      this.tone({ freq: base, type: "square", dur: 0.09, vol: 0.2, slide: 1.55 });
      if (hp <= 1) this.noise({ dur: 0.1, vol: 0.16, freq: 3200 });
    },

    solid() {
      this.tone({ freq: 120, type: "sawtooth", dur: 0.09, vol: 0.16, slide: 0.7 });
    },

    powerup() {
      this.arp([660, 880, 1180], 0.055, { type: "triangle", dur: 0.18, vol: 0.2 });
    },

    laser() {
      this.tone({ freq: 1180, type: "sawtooth", dur: 0.11, vol: 0.14, slide: 0.18 });
    },

    loseLife() {
      this.tone({ freq: 320, type: "sawtooth", dur: 0.55, vol: 0.26, slide: 0.16 });
      this.noise({ dur: 0.5, vol: 0.22, freq: 1200, q: 0.6 });
    },

    levelClear() {
      this.arp([523, 659, 784, 1046, 1318], 0.085, { type: "triangle", dur: 0.26, vol: 0.22 });
    },

    gameOver() {
      this.arp([523, 415, 330, 220], 0.16, { type: "sawtooth", dur: 0.4, vol: 0.2, slide: 0.75 });
    },

    ui() {
      this.tone({ freq: 880, type: "triangle", dur: 0.07, vol: 0.16, slide: 1.25 });
    },

    count(high) {
      this.tone({ freq: high ? 980 : 560, type: "square", dur: 0.13, vol: 0.2, slide: high ? 1.4 : 1.1 });
    }
  };

  Sound.load();
  global.Sound = Sound;
})(window);
