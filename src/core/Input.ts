export const isTouch =
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch'));

export class Input {
  private down = new Set<string>();
  private pressedNow = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  clicked = false;
  locked = false;
  sensitivity = 1;
  enabled = true;
  readonly touch = isTouch;
  stick = { x: 0, y: 0 };
  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.pressedNow.add(e.code);
      this.down.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || this.touch) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.touch) return;
      if (this.enabled && !this.locked) this.lock();
      else this.clicked = true;
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.touch) this.locked = document.pointerLockElement === this.el;
    });
  }
  lock() {
    if (this.touch) { this.locked = true; return; }
    try {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* ignore */
    }
  }
  unlock() {
    if (this.touch) { this.locked = false; return; }
    if (document.pointerLockElement) document.exitPointerLock();
  }
  setKey(code: string, on: boolean) {
    if (on && !this.down.has(code)) this.pressedNow.add(code);
    if (on) this.down.add(code);
    else this.down.delete(code);
  }
  tap(code: string) {
    this.pressedNow.add(code);
  }
  look(dx: number, dy: number) {
    if (!this.locked) return;
    this.mouseDX += dx;
    this.mouseDY += dy;
  }
  isDown(code: string) {
    return this.enabled && this.down.has(code);
  }
  pressed(code: string) {
    return this.enabled && this.pressedNow.has(code);
  }
  axis() {
    if (this.enabled && Math.hypot(this.stick.x, this.stick.y) > 0.12) return { x: this.stick.x, y: this.stick.y };
    const x = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    const y = (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
    return { x, y };
  }
  endFrame() {
    this.pressedNow.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;
  }
}
