export class Input {
  private down = new Set<string>();
  private pressedNow = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  clicked = false;
  locked = false;
  sensitivity = 1;
  enabled = true;
  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.pressedNow.add(e.code);
      this.down.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (this.enabled && !this.locked) this.lock();
      else this.clicked = true;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
    });
  }
  lock() {
    try {
      const p = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* ignore */
    }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  isDown(code: string) {
    return this.enabled && this.down.has(code);
  }
  pressed(code: string) {
    return this.enabled && this.pressedNow.has(code);
  }
  axis() {
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
