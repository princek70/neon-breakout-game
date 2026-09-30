(function (global) {
  "use strict";

  const U = global.U;
  const Sound = global.Sound;
  const Input = global.Input;
  const Particles = global.Particles;
  const E = global.Entities;

  const W = 480;
  const H = 720;
  const COLS = 11;
  const PAD_X = 14;
  const PAD_TOP = 58;
  const GAP = 5;
  const BRICK_H = 24;
  const BRICK_W = (W - PAD_X * 2 - GAP * (COLS - 1)) / COLS;

  const ROW_PALETTE = ["#31e1ff", "#43ffd0", "#7cff6b", "#ffe066", "#ff9f45", "#ff5fa2", "#b06bff"];

  const LEVELS = [
    [
      "11111111111",
      ".111111111.",
      "..1111111..",
      "...11111...",
      "....111...."
    ],
    [
      "2.2.2.2.2.2",
      ".1.1.1.1.1.",
      "2.2.2.2.2.2",
      ".1.1.1.1.1.",
      "2.2.2.2.2.2"
    ],
    [
      "11111111111",
      "1.........1",
      "1.2222222.1",
      "1.2.....2.1",
      "1.2.333.2.1",
      "1.2.....2.1",
      "1.2222222.1",
      "11111111111"
    ],
    [
      "2.2.2.2.2.2",
      ".3.3.3.3.3.",
      "2.2.2.2.2.2",
      ".3.3.3.3.3.",
      "2.2.2.2.2.2"
    ],
    [
      ".....1.....",
      "....222....",
      "...22222...",
      "..2222222..",
      ".222222222.",
      "..2222222..",
      "...22222...",
      "....222...."
    ],
    [
      "XX.11111.XX",
      "X.3333333.X",
      "..2.....2..",
      ".333333333.",
      "..2.....2..",
      "X.3333333.X",
      "XX.11111.XX"
    ]
  ];

  function normalizeRow(row) {
    let r = String(row).replace(/\s/g, "");
    if (r.length > COLS) r = r.slice(0, COLS);
    while (r.length < COLS) r += ".";
    return r;
  }

  function generateLevel(n) {
    const rows = Math.min(8, 5 + Math.floor((n - 7) / 3));
    const toughChance = Math.min(0.6, 0.24 + (n - 7) * 0.05);
    const out = [];
    for (let r = 0; r < rows; r++) {
      let row = "";
      for (let c = 0; c < COLS; c++) {
        if (Math.random() < 0.14) { row += "."; continue; }
        const roll = Math.random();
        if (roll < toughChance * 0.45) row += "3";
        else if (roll < toughChance) row += "2";
        else row += "1";
      }
      out.push(row);
    }
    if (!out.some((row) => /[123]/.test(row))) out[0] = "11111111111";
    return out;
  }

  const Game = {
    W: W,
    H: H,

    canvas: null,
    ctx: null,
    dpr: 1,
    view: { scale: 1, ox: 0, oy: 0 },

    state: "menu",
    time: 0,
    last: 0,
    raf: 0,

    paddle: null,
    balls: [],
    bricks: [],
    powerups: [],
    bolts: [],

    level: 1,
    score: 0,
    best: 0,
    bestAtRunStart: 0,
    lives: 3,
    bricksSmashed: 0,

    combo: 0,
    comboTimer: 0,
    comboTimerMax: 2.6,

    baseSpeed: 300,
    countdown: 0,
    countdownLabel: "",
    serving: false,
    freeze: 0,
    shake: 0,
    autoAdvance: 0,

    dom: {},

    /* ---------------------------------------------------------------- */

    init() {
      this.canvas = document.getElementById("game");
      this.ctx = this.canvas.getContext("2d", { alpha: false });

      this.dom = {
        stage: document.getElementById("stage"),
        score: document.getElementById("score"),
        level: document.getElementById("level"),
        best: document.getElementById("best"),
        comboFill: document.getElementById("comboFill"),
        combo: document.getElementById("combo"),
        lives: document.getElementById("lives"),
        chips: document.getElementById("chips"),
        countdown: document.getElementById("countdown"),
        serveHint: document.getElementById("serveHint"),
        flash: document.getElementById("flash"),
        menuBest: document.getElementById("menuBest"),
        pauseInfo: document.getElementById("pauseInfo"),
        clearBonus: document.getElementById("clearBonus"),
        finalScore: document.getElementById("finalScore"),
        overNote: document.getElementById("overNote"),
        overLevel: document.getElementById("overLevel"),
        overBricks: document.getElementById("overBricks"),
        btnMute: document.getElementById("btnMute"),
        btnPause: document.getElementById("btnPause"),
        screens: {
          menu: document.getElementById("screen-menu"),
          pause: document.getElementById("screen-pause"),
          level: document.getElementById("screen-level"),
          over: document.getElementById("screen-over")
        }
      };

      try {
        const storage = global.CrazyGames?.SDK?.data || global.localStorage;
        this.best = parseInt(storage.getItem("neon-breakout-best") || "0", 10) || 0;
      } catch (err) {
        this.best = 0;
      }
      this.bestAtRunStart = this.best;

      this.paddle = new E.Paddle(this);
      Particles.initDust(W, H);

      Input.init(this.canvas, (cx) => this.mapPointer(cx), {
        pause: () => this.togglePause(),
        mute: () => this.toggleMute(),
        anything: () => Sound.unlock()
      });

      this.bindUI();
      this.resize();
      global.addEventListener("resize", () => this.resize());
      if (global.ResizeObserver) {
        new global.ResizeObserver(() => this.resize()).observe(this.dom.stage);
      }
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && this.state === "playing") this.togglePause();
      });

      this.updateMuteButton();
      this.loadLevel(1);
      this.setState("menu");
      this.updateHud(true);

      this.last = performance.now();
      const loop = (ts) => {
        const dt = U.clamp((ts - this.last) / 1000, 0, 1 / 30);
        this.last = ts;
        this.update(dt);
        this.draw();
        this.raf = global.requestAnimationFrame(loop);
      };
      this.raf = global.requestAnimationFrame(loop);
    },

    bindUI() {
      const click = (fn) => (e) => {
        e.preventDefault();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        Sound.unlock();
        Sound.ui();
        fn();
      };
      const on = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", click(fn));
      };

      on("btnPlay", () => this.newGame());
      on("btnRetry", () => this.newGame());
      on("btnResume", () => this.togglePause());
      on("btnRestartFromPause", () => this.newGame());
      on("btnNextLevel", () => this.nextLevel());
      on("btnPause", () => this.togglePause());
      on("btnMute", () => this.toggleMute());
    },

    mapPointer(clientX) {
      const rect = this.canvas.getBoundingClientRect();
      const x = (clientX - rect.left - this.view.ox) / this.view.scale;
      return U.clamp(x, 0, W);
    },

    resize() {
      const stage = this.dom.stage;
      if (!stage) return;
      const cw = stage.clientWidth;
      const ch = stage.clientHeight;
      if (cw === 0 || ch === 0) return;

      this.dpr = Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(cw * this.dpr);
      this.canvas.height = Math.round(ch * this.dpr);

      const scale = Math.min(cw / W, ch / H);
      this.view.scale = scale;
      this.view.ox = (cw - W * scale) / 2;
      this.view.oy = (ch - H * scale) / 2;
    },

    /* ---------------------------------------------------------------- */

    loadLevel(n) {
      this.level = n;
      const pattern = n <= LEVELS.length ? LEVELS[n - 1] : generateLevel(n);
      this.bricks = [];

      for (let r = 0; r < pattern.length; r++) {
        const row = normalizeRow(pattern[r]);
        for (let c = 0; c < COLS; c++) {
          const ch = row[c];
          if (ch === ".") continue;
          let def;
          if (ch === "X") def = { hp: Infinity, points: 0, color: "#3a4460" };
          else if (ch === "3") def = { hp: 3, points: 120, color: "#ffb43d" };
          else if (ch === "2") def = { hp: 2, points: 80, color: "#a06bff" };
          else def = { hp: 1, points: 40, color: ROW_PALETTE[r % ROW_PALETTE.length] };

          this.bricks.push(new E.Brick(
            PAD_X + c * (BRICK_W + GAP),
            PAD_TOP + r * (BRICK_H + GAP),
            BRICK_W,
            BRICK_H,
            def,
            r,
            c
          ));
        }
      }

      this.balls = [];
      this.powerups = [];
      this.bolts = [];
      this.combo = 0;
      this.comboTimer = 0;
      this.baseSpeed = Math.min(296 + (n - 1) * 16, 468);
      this.paddle.reset();
      Particles.reset();
    },

    newGame() {
      this.score = 0;
      this.lives = 3;
      this.bricksSmashed = 0;
      this.shake = 0;
      this.freeze = 0;
      this.bestAtRunStart = this.best;
      this.loadLevel(1);
      this.setState("playing");
      this.beginServe(true);
      Particles.text(W / 2, H * 0.42, "LEVEL 1", "#8fe9ff", { size: 24, max: 1.1, vy: -30 });
    },

    beginServe(withCountdown) {
      this.serving = true;
      this.balls = [];
      if (withCountdown !== false) {
        this.countdown = 1.6;
        this.countdownLabel = "";
      } else {
        this.countdown = 0;
        this.spawnBall();
      }
    },

    spawnBall() {
      const ball = new E.Ball(this, this.paddle.cx, this.paddle.y - 12);
      ball.attach(this.paddle, 0);
      this.balls = [ball];
      this.serving = true;
      this.countdown = 0;
    },

    launchBall() {
      const ball = this.balls.find((b) => b.stuck && !b.dead);
      if (!ball) return;
      const angle = U.rand(-0.34, 0.34);
      ball.launch(angle, this.baseSpeed);
      this.serving = false;
      Sound.paddle();
      Particles.ring(ball.x, ball.y, { color: "#8fe9ff", size: 8, grow: 220, max: 0.36, width: 2 });
    },

    /* ---------------------------------------------------------------- */

    setState(next) {
      this.state = next;
      const screens = this.dom.screens;
      const show = next === "menu" ? "menu"
        : next === "paused" ? "pause"
          : next === "levelclear" ? "level"
            : next === "gameover" ? "over"
              : null;

      Object.keys(screens).forEach((key) => {
        const el = screens[key];
        if (!el) return;
        el.classList.toggle("is-active", key === show);
      });

      this.dom.btnPause.classList.toggle("off", next === "paused");
      this.serving = next === "playing" ? this.serving : false;
      if (next !== "playing") {
        this.dom.serveHint.classList.remove("show");
      }
      if (next === "paused") this.dom.pauseInfo.textContent = "Level " + this.level;
    },

    togglePause() {
      if (this.state === "playing") {
        this.setState("paused");
      } else if (this.state === "paused") {
        this.setState("playing");
      }
    },

    toggleMute() {
      Sound.unlock();
      Sound.toggleMute();
      this.updateMuteButton();
    },

    updateMuteButton() {
      const btn = this.dom.btnMute;
      if (!btn) return;
      btn.classList.toggle("off", Sound.muted);
      btn.innerHTML = Sound.muted ? "&#9834;&#10005;" : "&#9834;";
    },

    levelClear() {
      if (this.state !== "playing") return;
      this.setState("levelclear");
      const bonus = 250 * this.level + this.lives * 100;
      this.score += bonus;
      this.dom.clearBonus.textContent = "+" + U.formatScore(bonus);
      this.autoAdvance = 2.8;
      Sound.levelClear();
      this.shake = 6;
      this.balls.forEach((b) => { b.dead = true; });
      this.balls = [];
      this.powerups = [];
      this.bolts = [];
      this.saveBest();
      Particles.ring(W / 2, H * 0.32, { color: "#7cff6b", size: 20, grow: 420, max: 0.9, width: 5 });
      Particles.ring(W / 2, H * 0.32, { color: "#31e1ff", size: 10, grow: 320, max: 0.7, width: 3 });
      for (let i = 0; i < 4; i++) {
        Particles.burst(
          U.rand(80, W - 80),
          U.rand(H * 0.2, H * 0.5),
          { count: 16, color: U.pick(ROW_PALETTE), speed: 300 }
        );
      }
    },

    nextLevel() {
      const next = this.level + 1;
      this.loadLevel(next);
      this.setState("playing");
      this.beginServe(true);
      Particles.text(W / 2, H * 0.42, "LEVEL " + next, "#8fe9ff", { size: 24, max: 1.1, vy: -30 });
    },

    loseLife() {
      this.lives -= 1;
      this.combo = 0;
      this.comboTimer = 0;
      this.shake = 16;
      this.freeze = 0.22;
      Sound.loseLife();
      this.fireFlash();
      this.updateLives();
      this.particlesDeathBurst();

      this.powerups = [];
      this.bolts = [];
      if (this.lives <= 0) {
        this.gameOver();
      } else {
        this.paddle.reset();
        this.beginServe(true);
      }
    },

    particlesDeathBurst() {
      const y = H - 30;
      Particles.burst(W / 2, y, { count: 30, color: "#ff2bd6", speed: 420, grav: 420, lifeScale: 1.3 });
      Particles.ring(W / 2, y, { color: "#ff2bd6", size: 12, grow: 520, max: 0.7, width: 4 });
    },

    fireFlash() {
      const el = this.dom.flash;
      if (!el) return;
      el.classList.remove("fire");
      void el.offsetWidth;
      el.classList.add("fire");
    },

    gameOver() {
      const isBest = this.saveBest();
      this.setState("gameover");
      Sound.gameOver();
      this.dom.finalScore.textContent = U.formatScore(this.score);
      this.dom.overLevel.textContent = String(this.level);
      this.dom.overBricks.textContent = U.formatScore(this.bricksSmashed);
      this.dom.overNote.textContent = isBest
        ? "New personal best!"
        : "Best " + U.formatScore(this.best);
    },

    saveBest() {
      const isBest = this.score > this.bestAtRunStart;
      if (this.score > this.best) this.best = this.score;
      try { 
        const storage = global.CrazyGames?.SDK?.data || global.localStorage;
        storage.setItem("neon-breakout-best", String(this.best)); 
      } catch (err) { /* ignore */ }
      return isBest;
    },

    /* ---------------------------------------------------------------- */

    update(dt) {
      this.time += dt;
      this.shake = U.damp(this.shake, 0, 5.5, dt);
      Particles.update(dt, W, H);

      const worldDt = this.freeze > 0 ? dt * 0.12 : dt;
      if (this.freeze > 0) this.freeze = Math.max(0, this.freeze - dt);

      for (let i = 0; i < this.bricks.length; i++) this.bricks[i].update(dt);

      if (this.state === "playing") {
        this.paddle.update(worldDt);
        this.updateCountdown(worldDt);
        this.updateCombo(worldDt);
        this.updatePowerups(worldDt);
        this.updateBolts(worldDt);
        this.updateBalls(worldDt);

        if (this.countdown <= 0 && Input.consumeLaunch()) {
          if (this.balls.some((b) => b.stuck && !b.dead)) this.launchBall();
        }

        if (this.state === "playing" && this.dom.serveHint) {
          const stuck = this.balls.some((b) => b.stuck && !b.dead);
          this.dom.serveHint.classList.toggle("show", stuck && this.countdown <= 0);
        }
        if (this.state === "playing") this.checkLevelClear();
      } else if (this.state === "levelclear") {
        this.autoAdvance -= dt;
        if (this.autoAdvance <= 0) this.nextLevel();
      } else {
        Input.consumeLaunch();
      }

      this.updateHud(false);
    },

    updateCountdown(dt) {
      if (this.countdown <= 0) return;
      this.countdown -= dt;
      let label = "";
      if (this.countdown > 1.2) label = "3";
      else if (this.countdown > 0.8) label = "2";
      else if (this.countdown > 0.4) label = "1";
      else if (this.countdown > 0) label = "GO!";

      if (label !== this.countdownLabel) {
        this.countdownLabel = label;
        const el = this.dom.countdown;
        el.textContent = label;
        el.classList.toggle("go", label === "GO!");
        el.classList.remove("show");
        void el.offsetWidth;
        if (label) el.classList.add("show");
        Sound.count(label === "GO!");
      }

      if (this.countdown <= 0) {
        this.countdown = 0;
        this.countdownLabel = "";
        this.dom.countdown.classList.remove("show", "go");
        if (this.serving && this.balls.length === 0) this.spawnBall();
      }
    },

    updateCombo(dt) {
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) {
          this.comboTimer = 0;
          this.combo = 0;
        }
      }
    },

    get multiplier() {
      return U.clamp(1 + Math.floor(this.combo / 2), 1, 10);
    },

    updatePowerups(dt) {
      for (let i = this.powerups.length - 1; i >= 0; i--) {
        const p = this.powerups[i];
        p.update(dt, H);
        if (p.dead) {
          this.powerups.splice(i, 1);
          continue;
        }
        if (
          p.y + p.h / 2 > this.paddle.y &&
          p.y - p.h / 2 < this.paddle.y + this.paddle.h &&
          p.x + p.w / 2 > this.paddle.x &&
          p.x - p.w / 2 < this.paddle.x + this.paddle.w
        ) {
          this.powerups.splice(i, 1);
          this.applyPowerUp(p);
        }
      }
    },

    applyPowerUp(p) {
      Sound.powerup();
      this.freeze = 0.07;
      this.shake = 6;
      Particles.ring(p.x, p.y, { color: p.def.color, size: 6, grow: 300, max: 0.5, width: 3 });
      Particles.burst(p.x, p.y, { count: 18, color: p.def.color, speed: 300, grav: 120, shape: "circle" });
      Particles.text(p.x, p.y - 14, p.def.name, p.def.color, { size: 14, max: 0.9 });

      switch (p.type) {
        case "multi":
          this.splitBalls();
          break;
        case "life":
          this.lives = Math.min(this.lives + 1, 7);
          this.updateLives();
          break;
        default:
          this.paddle.applyPower(p.type);
          break;
      }
    },

    splitBalls() {
      const sources = this.balls.filter((b) => !b.stuck && !b.dead);
      let added = 0;
      for (let i = 0; i < sources.length; i++) {
        if (this.balls.length >= 10) break;
        const src = sources[i];
        const speed = Math.max(src.speed, this.baseSpeed);
        const angle = Math.atan2(src.vy, src.vx);
        const offsets = [0.44, -0.44];
        for (let k = 0; k < offsets.length; k++) {
          if (this.balls.length >= 10) break;
          const nb = new E.Ball(this, src.x, src.y);
          nb.stuck = false;
          nb.spawn = 1;
          nb.vx = Math.cos(angle + offsets[k]) * speed;
          nb.vy = Math.sin(angle + offsets[k]) * speed;
          this.balls.push(nb);
          added++;
        }
      }
      if (added === 0) {
        const stuck = this.balls.find((b) => b.stuck);
        if (stuck) this.launchBall();
      }
    },

    updateBolts(dt) {
      if (
        this.paddle.laserTimer > 0 &&
        this.paddle.fireCooldown <= 0 &&
        (Input.fireHeld || Input.keys["Space"])
      ) {
        this.paddle.fireCooldown = 0.2;
        this.bolts.push(new E.Bolt(this.paddle.x + 6, this.paddle.y - 8));
        this.bolts.push(new E.Bolt(this.paddle.x + this.paddle.w - 6, this.paddle.y - 8));
        Sound.laser();
      }

      for (let i = this.bolts.length - 1; i >= 0; i--) {
        const bolt = this.bolts[i];
        bolt.update(dt);
        if (bolt.dead) {
          this.bolts.splice(i, 1);
          continue;
        }
        for (let j = 0; j < this.bricks.length; j++) {
          const brick = this.bricks[j];
          if (!brick.alive) continue;
          if (
            bolt.x + bolt.w / 2 > brick.x &&
            bolt.x - bolt.w / 2 < brick.x + brick.w &&
            bolt.y + bolt.h / 2 > brick.y &&
            bolt.y - bolt.h / 2 < brick.y + brick.h
          ) {
            this.bolts.splice(i, 1);
            this.damageBrick(brick, 1, bolt.x, bolt.y);
            break;
          }
        }
      }
    },

    updateBalls(dt) {
      const mul = this.paddle.speedMultiplier;

      for (let i = this.balls.length - 1; i >= 0; i--) {
        const ball = this.balls[i];
        if (ball.dead) {
          this.balls.splice(i, 1);
          continue;
        }

        if (ball.spawn < 1) ball.spawn = Math.min(1, ball.spawn + dt * 3);

        if (ball.stuck) {
          ball.x = U.clamp(this.paddle.cx + ball.stickOffset, ball.r, W - ball.r);
          ball.y = this.paddle.y - ball.r - 2;
          ball.syncTrail();
          continue;
        }

        const distance = ball.speed * mul * dt;
        const steps = U.clamp(Math.ceil(distance / Math.max(2, ball.r * 0.62)), 1, 14);
        const sdt = dt / steps;

        for (let s = 0; s < steps; s++) {
          ball.step(sdt, mul);
          this.collideWalls(ball);
          this.collideBricks(ball);
          this.collidePaddle(ball);
          if (ball.y - ball.r > H + 16) {
            ball.dead = true;
            break;
          }
        }
        ball.syncTrail();
        if (ball.dead) this.balls.splice(i, 1);
      }

      if (
        this.state === "playing" &&
        this.countdown <= 0 &&
        !this.serving &&
        this.balls.length === 0
      ) {
        this.loseLife();
      }
    },

    collideWalls(ball) {
      const r = ball.r;
      let hit = false;
      if (ball.x - r < 0) {
        ball.x = r;
        ball.vx = Math.abs(ball.vx);
        hit = true;
      } else if (ball.x + r > W) {
        ball.x = W - r;
        ball.vx = -Math.abs(ball.vx);
        hit = true;
      }
      if (ball.y - r < 0) {
        ball.y = r;
        ball.vy = Math.abs(ball.vy);
        hit = true;
      }
      if (hit) {
        Sound.wall();
        Particles.burst(ball.x, U.clamp(ball.y, 2, H), {
          count: 5, color: "#9ff0ff", speed: 170, grav: 0, lifeScale: 0.6, sizeScale: 0.7
        });
      }
    },

    collidePaddle(ball) {
      const pad = this.paddle;
      if (ball.vy <= 0) return;
      if (
        ball.y + ball.r < pad.y ||
        ball.y - ball.r > pad.y + pad.h ||
        ball.x + ball.r < pad.x ||
        ball.x - ball.r > pad.x + pad.w
      ) return;

      const rel = U.clamp((ball.x - pad.cx) / (pad.w / 2), -1, 1);
      const maxAngle = Math.PI / 3;
      const angle = rel * maxAngle;
      const speed = U.clamp(ball.speed * 1.015, this.baseSpeed, this.baseSpeed * 1.55);

      ball.vx = Math.sin(angle) * speed + U.clamp(pad.vx * 0.16, -110, 110);
      ball.vy = -Math.cos(angle) * speed;

      const outSpeed = Math.hypot(ball.vx, ball.vy);
      if (Math.abs(ball.vy) < outSpeed * 0.3) {
        ball.vy = -outSpeed * 0.3;
        const rescale = speed / Math.hypot(ball.vx, ball.vy);
        ball.vx *= rescale;
        ball.vy *= rescale;
      }

      ball.y = pad.y - ball.r - 1;
      ball.lastHit = "paddle";
      pad.flash = 1;
      this.freeze = Math.max(this.freeze, 0.018);
      this.shake = Math.max(this.shake, 3.2);
      Sound.paddle();
      Particles.burst(ball.x, pad.y, {
        count: 7, color: "#7ee7ff", speed: 200, grav: 240, spread: 1.6, dir: -Math.PI / 2,
        lifeScale: 0.7, sizeScale: 0.8
      });
    },

    collideBricks(ball) {
      const r = ball.r;
      for (let i = 0; i < this.bricks.length; i++) {
        const brick = this.bricks[i];
        if (!brick.alive) continue;

        if (
          ball.x + r < brick.x ||
          ball.x - r > brick.x + brick.w ||
          ball.y + r < brick.y ||
          ball.y - r > brick.y + brick.h
        ) continue;

        const bcx = brick.x + brick.w / 2;
        const bcy = brick.y + brick.h / 2;
        const overlapX = r + brick.w / 2 - Math.abs(ball.x - bcx);
        const overlapY = r + brick.h / 2 - Math.abs(ball.y - bcy);

        if (overlapX < overlapY) {
          ball.x += ball.x < bcx ? -overlapX : overlapX;
          ball.vx = -ball.vx;
        } else {
          ball.y += ball.y < bcy ? -overlapY : overlapY;
          ball.vy = -ball.vy;
        }

        this.damageBrick(brick, 1, ball.x, ball.y);
        break;
      }
    },

    damageBrick(brick, damage, hx, hy) {
      const destroyed = brick.hit(damage);

      if (brick.solid) {
        Sound.solid();
        Particles.burst(hx, hy, {
          count: 6, color: "#8fa3c8", speed: 180, grav: 300, lifeScale: 0.6, sizeScale: 0.7
        });
        this.shake = Math.max(this.shake, 2);
        return;
      }

      if (!destroyed) {
        Sound.brick(brick.hp + 1, this.combo);
        this.shake = Math.max(this.shake, 2.4);
        Particles.burst(hx, hy, {
          count: 6, color: brick.color, speed: 200, grav: 320, lifeScale: 0.7, sizeScale: 0.8
        });
        return;
      }

      this.bricksSmashed += 1;
      this.combo += 1;
      this.comboTimer = this.comboTimerMax;

      const mult = this.multiplier;
      const gained = brick.points * mult;
      this.addScore(gained);

      Sound.brick(brick.hp + 1, this.combo);
      this.freeze = Math.max(this.freeze, 0.03);
      this.shake = Math.max(this.shake, 4.5);

      Particles.burst(brick.x + brick.w / 2, brick.y + brick.h / 2, {
        count: 16, color: brick.color, speed: 300, grav: 300, lifeScale: 1
      });
      Particles.ring(brick.x + brick.w / 2, brick.y + brick.h / 2, {
        color: brick.color, size: 4, grow: 240, max: 0.36, width: 2
      });
      Particles.text(
        brick.x + brick.w / 2,
        brick.y + brick.h / 2,
        "+" + U.formatScore(gained),
        mult > 1 ? "#7cff6b" : "#eaf6ff",
        { size: mult > 3 ? 17 : 14, max: 0.8 }
      );

      if (Math.random() < 0.22) {
        const type = E.rollPowerUp();
        this.powerups.push(new E.PowerUp(brick.x + brick.w / 2, brick.y + brick.h / 2, type));
      }
    },

    addScore(amount) {
      this.score += amount;
      if (this.score > this.best) this.best = this.score;
    },

    checkLevelClear() {
      for (let i = 0; i < this.bricks.length; i++) {
        const b = this.bricks[i];
        if (!b.solid && b.hp > 0) return;
      }
      this.levelClear();
    },

    /* ---------------------------------------------------------------- */

    updateLives() {
      const wrap = this.dom.lives;
      if (!wrap) return;

      if (this._pipTimer) {
        clearTimeout(this._pipTimer);
        this._pipTimer = null;
      }
      for (let i = wrap.children.length - 1; i >= 0; i--) {
        if (wrap.children[i].classList.contains("lost")) wrap.children[i].remove();
      }

      const target = Math.max(0, this.lives);
      const count = wrap.children.length;

      if (count < target) {
        for (let i = count; i < target; i++) {
          const pip = document.createElement("span");
          pip.className = "pip";
          wrap.appendChild(pip);
        }
      } else if (count > target) {
        for (let i = count - 1; i >= target; i--) wrap.children[i].classList.add("lost");
        this._pipTimer = setTimeout(() => {
          for (let i = wrap.children.length - 1; i >= 0; i--) {
            if (wrap.children[i].classList.contains("lost")) wrap.children[i].remove();
          }
          this._pipTimer = null;
        }, 320);
      }
    },

    updateHud(force) {
      const dom = this.dom;
      const scoreText = U.formatScore(this.score);
      if (force || dom.score.textContent !== scoreText) {
        dom.score.textContent = scoreText;
        dom.score.classList.remove("pulse");
        void dom.score.offsetWidth;
        dom.score.classList.add("pulse");
      }

      const levelText = String(this.level);
      if (dom.level.textContent !== levelText) {
        dom.level.textContent = levelText;
        dom.level.classList.remove("pulse");
        void dom.level.offsetWidth;
        dom.level.classList.add("pulse");
      }

      const bestText = U.formatScore(this.best);
      if (dom.best.textContent !== bestText) dom.best.textContent = bestText;
      if (dom.menuBest.textContent !== bestText) dom.menuBest.textContent = bestText;

      const mult = this.multiplier;
      const comboText = "x" + mult;
      if (dom.combo.textContent !== comboText) dom.combo.textContent = comboText;
      dom.combo.classList.toggle("on", mult > 1);

      const fill = this.comboTimer > 0 ? (this.comboTimer / this.comboTimerMax) * 100 : 0;
      dom.comboFill.style.width = fill.toFixed(1) + "%";
      dom.comboFill.classList.toggle("hot", mult >= 4);

      if (force) this.updateLives();

      const chips = [];
      const pad = this.paddle;
      if (pad.wideTimer > 0) chips.push(["WIDE", pad.wideTimer, "#7cff6b"]);
      if (pad.laserTimer > 0) chips.push(["LASER", pad.laserTimer, "#ff5fa2"]);
      if (pad.slowTimer > 0) chips.push(["SLOW", pad.slowTimer, "#43ffd0"]);
      const sig = chips.map((c) => c[0] + Math.ceil(c[1])).join("|");
      if (sig !== this.chipSig) {
        this.chipSig = sig;
        dom.chips.innerHTML = chips
          .map((c) => '<span class="chip" style="color:' + c[2] + '">' + c[0] + " <b>" + Math.ceil(c[1]) + "s</b></span>")
          .join("");
      } else if (chips.length) {
        const nodes = dom.chips.children;
        for (let i = 0; i < nodes.length; i++) {
          const b = nodes[i].querySelector("b");
          if (b) b.textContent = Math.ceil(chips[i][1]) + "s";
        }
      }
    },

    /* ---------------------------------------------------------------- */

    draw() {
      const ctx = this.ctx;
      const dpr = this.dpr;
      const scale = this.view.scale;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, this.view.ox * dpr, this.view.oy * dpr);
      ctx.imageSmoothingEnabled = true;

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      this.drawBackground(ctx, this.time);

      ctx.save();
      if (this.shake > 0.05) {
        const s = this.shake;
        ctx.translate(U.rand(-s, s) * 0.5, U.rand(-s, s) * 0.5);
      }

      const dim = this.state === "menu" || this.state === "gameover";
      if (dim) ctx.globalAlpha = 0.3;

      this.drawBricks(ctx);

      if (dim) ctx.globalAlpha = 1;

      this.drawPlayfieldGuides(ctx);

      if (!dim) {
        this.drawPowerups(ctx);
        this.drawBolts(ctx);
        this.drawBalls(ctx);
        this.drawPaddle(ctx);
      }

      ctx.globalAlpha = 1;
      Particles.draw(ctx);
      ctx.restore();
    },

    drawBackground(ctx, t) {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#0a1230");
      grad.addColorStop(0.45, "#080d22");
      grad.addColorStop(1, "#04050d");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const pulse = 0.5 + 0.5 * Math.sin(t * 0.7);
      const aurora = ctx.createRadialGradient(W * 0.5, H * 0.16 + pulse * 14, 10, W * 0.5, H * 0.2, H * 0.62);
      aurora.addColorStop(0, "rgba(49, 225, 255, " + (0.14 + pulse * 0.06) + ")");
      aurora.addColorStop(0.5, "rgba(160, 107, 255, 0.07)");
      aurora.addColorStop(1, "rgba(255, 43, 214, 0)");
      ctx.fillStyle = aurora;
      ctx.fillRect(0, 0, W, H);

      const floor = ctx.createLinearGradient(0, H - 120, 0, H);
      floor.addColorStop(0, "rgba(255, 43, 214, 0)");
      floor.addColorStop(1, "rgba(255, 43, 214, " + (0.09 + pulse * 0.05) + ")");
      ctx.fillStyle = floor;
      ctx.fillRect(0, H - 120, W, 120);

      ctx.restore();

      this.drawGrid(ctx, t);
      Particles.drawDust(ctx, W, H, t);
    },

    drawGrid(ctx, t) {
      const cell = 40;
      const offset = (t * 14) % cell;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(90, 180, 255, 0.06)";
      ctx.beginPath();
      for (let x = 0; x <= W; x += cell) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
      }
      for (let y = -cell; y <= H + cell; y += cell) {
        const yy = y + offset;
        ctx.moveTo(0, yy);
        ctx.lineTo(W, yy);
      }
      ctx.stroke();
      ctx.restore();
    },

    drawPlayfieldGuides(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      const top = ctx.createLinearGradient(0, 0, 0, 14);
      top.addColorStop(0, "rgba(49, 225, 255, 0.28)");
      top.addColorStop(1, "rgba(49, 225, 255, 0)");
      ctx.fillStyle = top;
      ctx.fillRect(0, 0, W, 14);

      const limitY = this.paddle.y + this.paddle.h;
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = "#ff2bd6";
      ctx.lineWidth = 1;
      ctx.setLineDash([10, 12]);
      ctx.beginPath();
      ctx.moveTo(0, limitY + 2);
      ctx.lineTo(W, limitY + 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.restore();
    },

    drawBricks(ctx) {
      for (let i = 0; i < this.bricks.length; i++) {
        const brick = this.bricks[i];
        if (!brick.alive) continue;
        brick.draw(ctx);
      }
    },

    drawPowerups(ctx) {
      for (let i = 0; i < this.powerups.length; i++) this.powerups[i].draw(ctx);
    },

    drawBolts(ctx) {
      for (let i = 0; i < this.bolts.length; i++) this.bolts[i].draw(ctx);
    },

    drawBalls(ctx) {
      for (let i = 0; i < this.balls.length; i++) {
        const b = this.balls[i];
        if (!b.dead) b.draw(ctx);
      }
    },

    drawPaddle(ctx) {
      this.paddle.draw(ctx, this.time);
    }
  };

  global.Game = Game;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => Game.init());
  } else {
    Game.init();
  }
})(window);
