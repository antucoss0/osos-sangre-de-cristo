import type { Input } from '../core/Input';

export interface TouchContext {
  move: boolean;
  look: boolean;
  crouch: boolean;
  flash: boolean;
  blink: boolean;
  skip: boolean;
  pause: boolean;
}

const h = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

const RADIUS = 56;
const LOOK_GAIN = 2.4;

export class TouchControls {
  root: HTMLElement;
  private stickZone: HTMLElement;
  private lookZone: HTMLElement;
  private base: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private crouchOn = false;
  private ctxKey = '';

  constructor(parent: HTMLElement, private input: Input) {
    this.root = h(`<div class="touch">
      <div class="t-look"></div>
      <div class="t-stick"><div class="t-base"><i></i></div></div>
      <div class="t-btns">
        <button data-b="crouch" class="t-btn">Agachar</button>
        <button data-b="flash" class="t-btn t-big">Flash</button>
        <button data-b="blink" class="t-btn">Parpadear</button>
      </div>
      <button data-b="skip" class="t-skip">Saltar ›</button>
      <button data-b="pause" class="t-pause" aria-label="Pausa"><i></i><i></i></button>
    </div>`);
    parent.append(this.root);
    this.stickZone = this.root.querySelector('.t-stick')!;
    this.lookZone = this.root.querySelector('.t-look')!;
    this.base = this.root.querySelector('.t-base')!;
    this.knob = this.base.querySelector('i')!;
    this.bindStick();
    this.bindLook();
    this.bindButtons();
    this.setContext({ move: false, look: false, crouch: false, flash: false, blink: false, skip: false, pause: false });
  }

  private bindStick() {
    const z = this.stickZone;
    z.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      z.setPointerCapture(e.pointerId);
      const r = z.getBoundingClientRect();
      this.origin = { x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX - r.left}px`;
      this.base.style.top = `${e.clientY - r.top}px`;
      this.base.classList.add('active');
      this.input.lock();
    });
    z.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      let dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) { dx *= RADIUS / len; dy *= RADIUS / len; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.stick.x = dx / RADIUS;
      this.input.stick.y = -dy / RADIUS;
      this.input.setKey('ShiftLeft', len > RADIUS * 1.05);
    });
    const end = (e: PointerEvent) => { if (e.pointerId === this.stickId) this.resetStick(); };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', end);
  }

  private resetStick() {
    this.stickId = null;
    this.input.stick.x = 0;
    this.input.stick.y = 0;
    this.input.setKey('ShiftLeft', false);
    this.knob.style.transform = '';
    this.base.style.left = '';
    this.base.style.top = '';
    this.base.classList.remove('active');
  }

  private bindLook() {
    const z = this.lookZone;
    const pts = new Map<number, { x: number; y: number; t: number; moved: number }>();
    z.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      z.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 });
      this.input.lock();
    });
    z.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY; p.moved += Math.abs(dx) + Math.abs(dy);
      const g = LOOK_GAIN * this.input.sensitivity;
      this.input.look(dx * g, dy * g);
    });
    const end = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (p && p.moved < 12 && performance.now() - p.t < 260) this.input.clicked = true;
    };
    z.addEventListener('pointerup', end);
    z.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
  }

  private bindButtons() {
    const act: Record<string, () => void> = {
      crouch: () => { this.crouchOn = !this.crouchOn; this.input.setKey('KeyC', this.crouchOn); },
      flash: () => this.input.tap('KeyF'),
      blink: () => this.input.tap('Space'),
      skip: () => this.input.tap('Enter'),
      pause: () => { this.input.unlock(); this.input.tap('Escape'); },
    };
    this.root.querySelectorAll<HTMLButtonElement>('[data-b]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('down');
        act[b.dataset.b!]?.();
      });
      const up = () => b.classList.remove('down');
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    });
  }

  setContext(c: TouchContext) {
    const key = Object.values(c).map(Number).join('');
    if (key === this.ctxKey) return;
    this.ctxKey = key;
    this.stickZone.classList.toggle('off', !c.move);
    this.lookZone.classList.toggle('off', !c.look);
    if (!c.move && this.stickId !== null) this.resetStick();
    if (!c.crouch && this.crouchOn) { this.crouchOn = false; this.input.setKey('KeyC', false); }
    this.root.querySelectorAll<HTMLElement>('[data-b]').forEach((b) => {
      b.classList.toggle('off', !c[b.dataset.b as keyof TouchContext]);
      if (b.dataset.b === 'crouch') b.classList.toggle('on', this.crouchOn);
    });
  }

  fullscreen() {
    const d = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    try {
      const p = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : (d.webkitRequestFullscreen?.(), undefined);
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      Promise.resolve(p).then(() => o?.lock?.('landscape')).catch(() => {});
    } catch {
      /* ignore */
    }
  }
}
