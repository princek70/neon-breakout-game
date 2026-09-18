(function (global) {
  "use strict";

  const Input = {
    keys: Object.create(null),
    pointerX: null,
    usePointer: false,
    launchQueued: false,
    fireHeld: false,
    mapPointer: null,
    actions: {},

    init(target, mapPointer, actions) {
      this.mapPointer = mapPointer;
      this.actions = actions || {};

      global.addEventListener("keydown", (e) => this.onKeyDown(e), { passive: false });
      global.addEventListener("keyup", (e) => this.onKeyUp(e), { passive: false });
      global.addEventListener("blur", () => this.clear());

      const opts = { passive: false };
      target.addEventListener("pointermove", (e) => this.onPointerMove(e), opts);
      target.addEventListener("pointerdown", (e) => this.onPointerDown(e), opts);
      global.addEventListener("pointerup", () => { this.fireHeld = false; });
      global.addEventListener("pointercancel", () => { this.fireHeld = false; });
      target.addEventListener("contextmenu", (e) => e.preventDefault());
    },

    onKeyDown(e) {
      const code = e.code;
      if (
        code === "ArrowLeft" || code === "ArrowRight" || code === "ArrowUp" ||
        code === "ArrowDown" || code === "Space" || code === "Enter" ||
        code === "NumpadEnter"
      ) {
        e.preventDefault();
      }

      if (e.repeat) {
        this.keys[code] = true;
        return;
      }

      this.keys[code] = true;

      if (code === "Space" || code === "Enter" || code === "NumpadEnter") {
        this.launchQueued = true;
      }
      if (code === "KeyM") {
        if (this.actions.mute) this.actions.mute();
      }
      if (code === "KeyP" || code === "Escape") {
        if (this.actions.pause) this.actions.pause();
      }
      if (this.actions.anything) this.actions.anything();
    },

    onKeyUp(e) {
      this.keys[e.code] = false;
    },

    onPointerMove(e) {
      if (e.pointerType === "touch" && !this.fireHeld) return;
      if (this.mapPointer) {
        const x = this.mapPointer(e.clientX, e.clientY);
        if (x != null) {
          this.pointerX = x;
          this.usePointer = true;
        }
      }
      if (e.cancelable) e.preventDefault();
    },

    onPointerDown(e) {
      this.fireHeld = true;
      this.launchQueued = true;
      if (this.mapPointer) {
        const x = this.mapPointer(e.clientX, e.clientY);
        if (x != null) {
          this.pointerX = x;
          this.usePointer = true;
        }
      }
      if (e.cancelable) e.preventDefault();
      if (this.actions.anything) this.actions.anything();
    },

    moveAxis() {
      let axis = 0;
      if (this.keys.ArrowLeft || this.keys.KeyA) axis -= 1;
      if (this.keys.ArrowRight || this.keys.KeyD) axis += 1;
      if (axis !== 0) this.usePointer = false;
      return axis;
    },

    consumeLaunch() {
      if (this.launchQueued) {
        this.launchQueued = false;
        return true;
      }
      return false;
    },

    clear() {
      this.keys = Object.create(null);
      this.fireHeld = false;
      this.launchQueued = false;
    }
  };

  global.Input = Input;
})(window);
