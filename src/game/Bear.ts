import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Character } from '../characters/Character';
import { StateMachine } from '../core/FSM';
import type { Colliders } from './Collision';
import { bearLocomotion, steer, speedOf } from './Steer';
import { heightAt } from '../world/Terrain';

export type BearEvent = 'roar' | 'huff' | 'step' | 'growl' | 'sniff';

/**
 * Grizzly behaviour:
 * Hidden -> Approach (walks to a stand point) -> Sniff -> Duel (huffs, sways, stares)
 * Duel -> Aggro (rears + roars) | Accept (huffs, turns around, walks away) -> Gone
 * Pack bears use Lurk -> Revealed -> Leave.
 */
export class Bear {
  char: Character;
  fsm: StateMachine<Bear>;
  target = new THREE.Vector3();
  stand = new THREE.Vector3();
  exit = new THREE.Vector3();
  agitation = 0;
  onEvent: ((e: BearEvent, b: Bear) => void) | null = null;
  eyes: THREE.Group;
  eyeGlow = 0;
  speedScale = 1;
  private stepT = 0;
  constructor(gltf: GLTF, private colliders: Colliders | null, opts: { scale?: number; clone?: boolean } = {}) {
    this.char = new Character(gltf, { quadruped: true, scale: opts.scale ?? 1.15, clone: opts.clone });
    this.speedScale = opts.scale ? Math.sqrt(opts.scale / 1.15) : 1;
    // glowing eye pair (visible in shadows / at dusk)
    this.eyes = new THREE.Group();
    const eyeMat = new THREE.SpriteMaterial({ color: 0xffb25a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: eyeTex });
    for (const s of [-1, 1]) {
      const sp = new THREE.Sprite(eyeMat);
      sp.scale.setScalar(0.09);
      sp.position.set(s * 0.075, 0, 0);
      this.eyes.add(sp);
    }
    this.eyes.userData.mat = eyeMat;
    this.char.root.visible = false;
    this.fsm = new StateMachine<Bear>(this, {
      Hidden: { enter(b) { b.char.root.visible = false; } },
      Approach: {
        enter(b) { b.char.root.visible = true; },
        update(b, dt) {
          const d = steer(b.char, b.stand, 1.25 * b.speedScale, dt, null, 0.8, 2.5);
          bearLocomotion(b.char);
          if (d < 0.35) return 'Sniff';
        },
      },
      Sniff: {
        enter(b) { b.char.velocity.set(0, 0, 0); b.char.play('Sniff', { fade: 0.5 }); b.onEvent?.('sniff', b); },
        update(b, dt, t) { b.char.faceTowards(b.target.x, b.target.z, dt, 1.5); if (t > 3.2) return 'Duel'; },
      },
      Duel: {
        enter(b) { b.char.play('Idle', { fade: 0.6 }); },
        update(b, dt, t) {
          b.char.faceTowards(b.target.x, b.target.z, dt, 1.2);
          const want = b.agitation > 0.55 ? 'Huff' : 'Idle';
          if (b.char.current !== want) {
            b.char.play(want, { fade: 0.4 });
            if (want === 'Huff') b.onEvent?.('huff', b);
          }
          if (b.agitation > 0.35 && Math.floor(t * 0.5) !== Math.floor((t - dt) * 0.5)) b.onEvent?.('growl', b);
        },
      },
      Aggro: {
        enter(b) { b.char.play('Rear', { once: true, fade: 0.25 }); },
        update(b, dt, t) {
          b.char.faceTowards(b.target.x, b.target.z, dt, 4);
          if (t > 1.1 && b.char.current === 'Rear') { b.char.play('Roar', { once: true, fade: 0.3 }); b.onEvent?.('roar', b); }
        },
      },
      Accept: {
        enter(b) { b.char.play('Huff', { fade: 0.4 }); b.onEvent?.('huff', b); },
        update(b, dt, t) {
          if (t < 2.4) return;
          const d = steer(b.char, b.exit, 1.0 * b.speedScale, dt, null, 0.8, 1.2);
          bearLocomotion(b.char);
          if (d < 1) return 'Hidden';
        },
      },
      Lurk: {
        enter(b) { b.char.root.visible = true; b.char.play('Idle', { fade: 0.6 }); },
        update(b, dt) {
          const d = b.char.position.distanceTo(b.stand);
          if (d > 0.6) { steer(b.char, b.stand, 1.1 * b.speedScale, dt, b.colliders, 0.7, 2); bearLocomotion(b.char); }
          else { b.char.velocity.set(0, 0, 0); b.char.faceTowards(b.target.x, b.target.z, dt, 1); if (b.char.current !== 'Idle' && b.char.current !== 'Sniff') b.char.play('Idle'); }
        },
      },
      Revealed: {
        enter(b) { b.char.velocity.set(0, 0, 0); b.char.play('Rear', { once: true, fade: 0.2, timeScale: 1.2 }); b.onEvent?.('huff', b); },
        update(b, dt, t) { b.char.faceTowards(b.target.x, b.target.z, dt, 3); if (t > 2.2) return 'Leave'; },
      },
      Leave: {
        update(b, dt, t) {
          const d = steer(b.char, b.exit, 2.2 * b.speedScale, dt, b.colliders, 0.7, 2);
          bearLocomotion(b.char);
          if (d < 1 || t > 25) return 'Hidden';
        },
      },
    }, 'Hidden');
  }
  get position() {
    return this.char.position;
  }
  place(x: number, z: number, heading: number) {
    this.char.position.set(x, heightAt(x, z), z);
    this.char.heading = heading;
    this.char.velocity.set(0, 0, 0);
  }
  eyePos(out = new THREE.Vector3()) {
    this.char.bonePos('Head', out);
    const s = this.char.model.scale.x;
    out.x += Math.sin(this.char.heading) * 0.2 * s;
    out.z += Math.cos(this.char.heading) * 0.2 * s;
    out.y += 0.1 * s;
    return out;
  }
  update(dt: number, camera: THREE.Camera) {
    this.fsm.update(dt);
    this.char.update(dt);
    const s = speedOf(this.char);
    if (s > 0.2 && this.char.root.visible) {
      this.stepT += dt * s * 1.2;
      if (this.stepT > 1) { this.stepT = 0; this.onEvent?.('step', this); }
    }
    if (this.eyes.parent) {
      this.eyePos(this.eyes.position);
      this.eyes.quaternion.copy(camera.quaternion);
      (this.eyes.userData.mat as THREE.SpriteMaterial).opacity = this.eyeGlow * (this.char.root.visible ? 1 : 0);
    }
  }
}

const eyeTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.15, 'rgba(255,220,150,0.9)');
  gr.addColorStop(0.5, 'rgba(255,120,30,0.25)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
