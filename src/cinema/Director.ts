import * as THREE from 'three';
import type { Engine } from '../core/Engine';
import { clamp } from '../core/noise';

type V = THREE.Vector3 | ((t: number) => THREE.Vector3);

export interface Shot {
  dur: number;
  pos: V;
  look: V;
  pos2?: V;
  look2?: V;
  fov?: number;
  fov2?: number;
  ease?: (t: number) => number;
  focus?: number | ((t: number) => number);
  range?: number;
  bokeh?: number;
  shake?: number;
  roll?: number;
  roll2?: number;
  onStart?: () => void;
  onUpdate?: (t: number, dt: number) => void;
}

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => t * t * (3 - 2 * t),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  inOutQuint: (t: number) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
};

/** Camera rail cinematics with letterbox, depth of field focus pulls and handheld shake. */
export class Director {
  shots: Shot[] = [];
  index = -1;
  t = 0;
  playing = false;
  letterbox = 0;
  letterboxTarget = 0;
  onDone: (() => void) | null = null;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private la = new THREE.Vector3();
  private lb = new THREE.Vector3();
  constructor(private engine: Engine) {}
  play(shots: Shot[], onDone?: () => void, letterbox = true) {
    this.shots = shots;
    this.index = -1;
    this.playing = true;
    this.onDone = onDone ?? null;
    this.letterboxTarget = letterbox ? 1 : 0;
    this.next();
  }
  private next() {
    this.index++;
    this.t = 0;
    if (this.index >= this.shots.length) {
      this.playing = false;
      this.letterboxTarget = 0;
      const cb = this.onDone;
      this.onDone = null;
      cb?.();
      return;
    }
    this.shots[this.index].onStart?.();
  }
  skip() {
    if (!this.playing) return;
    // fire remaining onStart hooks so story state stays consistent
    for (let i = this.index + 1; i < this.shots.length; i++) this.shots[i].onStart?.();
    this.index = this.shots.length - 1;
    this.t = this.shots[this.index].dur;
  }
  private val(v: V, t: number, out: THREE.Vector3) {
    return typeof v === 'function' ? out.copy(v(t)) : out.copy(v);
  }
  update(dt: number, time: number) {
    this.letterbox += (this.letterboxTarget - this.letterbox) * (1 - Math.exp(-2.5 * dt));
    this.engine.cinema.set('uLetterbox', this.letterbox);
    if (!this.playing) return;
    const s = this.shots[this.index];
    this.t += dt;
    const raw = clamp(this.t / s.dur, 0, 1);
    const k = (s.ease ?? ease.inOut)(raw);
    const cam = this.engine.camera;
    this.val(s.pos, raw, this.a);
    if (s.pos2) { this.val(s.pos2, raw, this.b); this.a.lerp(this.b, k); }
    this.val(s.look, raw, this.la);
    if (s.look2) { this.val(s.look2, raw, this.lb); this.la.lerp(this.lb, k); }
    cam.position.copy(this.a);
    if (s.shake) {
      const sh = s.shake;
      cam.position.x += (Math.sin(time * 13.1) + Math.sin(time * 7.3)) * 0.02 * sh;
      cam.position.y += (Math.sin(time * 11.7) + Math.sin(time * 5.1)) * 0.02 * sh;
    } else {
      // subtle handheld drift for premium feel
      cam.position.x += Math.sin(time * 0.7) * 0.012;
      cam.position.y += Math.sin(time * 0.9 + 1) * 0.01;
    }
    cam.lookAt(this.la);
    const roll = (s.roll ?? 0) + ((s.roll2 ?? s.roll ?? 0) - (s.roll ?? 0)) * k;
    if (roll) cam.rotateZ(roll);
    const fov = (s.fov ?? 40) + ((s.fov2 ?? s.fov ?? 40) - (s.fov ?? 40)) * k;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const focus = typeof s.focus === 'function' ? s.focus(raw) : s.focus ?? cam.position.distanceTo(this.la);
    this.engine.setFocus(focus, s.range ?? Math.max(2, focus * 0.6), s.bokeh ?? 3);
    s.onUpdate?.(raw, dt);
    if (this.t >= s.dur) this.next();
  }
}
