import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Character } from '../characters/Character';
import { StateMachine } from '../core/FSM';
import type { Colliders } from './Collision';
import type { Player } from './Player';
import { heightAt } from '../world/Terrain';
import { humanLocomotion, speedOf, steer } from './Steer';

/** Nairoby: follows a breadcrumb trail of Antu, reacts to fear and crouching, can be scripted by cinematics. */
export class Companion {
  char: Character;
  fsm: StateMachine<Companion>;
  crumbs: THREE.Vector3[] = [];
  scriptTarget: THREE.Vector3 | null = null;
  scriptSpeed = 1.4;
  lookTarget: THREE.Vector3 | null = null;
  private idleTimer = 0;
  constructor(gltf: GLTF, private player: Player, private colliders: Colliders) {
    this.char = new Character(gltf);
    this.fsm = new StateMachine<Companion>(this, {
      Follow: {
        update(c, dt) {
          const p = c.player.position;
          const d = c.char.position.distanceTo(p);
          if (d > 2.4) {
            const goal = c.crumbs.find((b) => b.distanceTo(p) < d - 1.8 && b.distanceTo(c.char.position) > 0.6) ?? p;
            const speed = d > 7 ? 4.2 : d > 4 ? 2.2 : speedOf(c.player.char) + 0.15;
            steer(c.char, goal, Math.max(1.2, speed), dt, c.colliders);
          } else {
            c.char.velocity.multiplyScalar(Math.exp(-6 * dt));
            if (speedOf(c.char) < 0.2) c.char.faceTowards(p.x, p.z, dt, 2);
          }
          humanLocomotion(c.char, c.player.fsm.is('Crouch'));
          if (speedOf(c.char) < 0.1) { c.idleTimer += dt; if (c.idleTimer > 6) return 'LookAround'; } else c.idleTimer = 0;
        },
      },
      LookAround: {
        enter(c) { c.char.play('Idle', { fade: 0.6, timeScale: 0.8 }); },
        update(c, dt, t) {
          c.char.heading += Math.sin(t * 0.6) * dt * 0.4;
          if (c.player.position.distanceTo(c.char.position) > 3 || t > 5) { c.idleTimer = 0; return 'Follow'; }
        },
      },
      Scared: {
        enter(c) { c.char.velocity.set(0, 0, 0); c.char.play('Scared', { fade: 0.3 }); },
        update(c, dt) { if (c.lookTarget) c.char.faceTowards(c.lookTarget.x, c.lookTarget.z, dt, 3); },
      },
      Crouch: {
        enter(c) { c.char.velocity.set(0, 0, 0); c.char.play('Crouch', { fade: 0.4, timeScale: 0.4 }); },
        update(c, dt) { if (c.lookTarget) c.char.faceTowards(c.lookTarget.x, c.lookTarget.z, dt, 3); },
      },
      Scripted: {
        update(c, dt) {
          if (c.scriptTarget) {
            const d = steer(c.char, c.scriptTarget, c.scriptSpeed, dt, c.colliders);
            if (d < 0.3) c.scriptTarget = null;
          } else {
            c.char.velocity.multiplyScalar(0.8);
            if (c.lookTarget) c.char.faceTowards(c.lookTarget.x, c.lookTarget.z, dt, 3);
          }
          humanLocomotion(c.char);
        },
      },
    }, 'Follow');
  }
  get position() {
    return this.char.position;
  }
  place(x: number, z: number, heading: number) {
    this.char.position.set(x, heightAt(x, z), z);
    this.char.heading = heading;
    this.char.velocity.set(0, 0, 0);
    this.crumbs = [];
  }
  walkTo(t: THREE.Vector3, speed = 1.4) {
    this.scriptTarget = t.clone();
    this.scriptSpeed = speed;
    this.fsm.go('Scripted');
  }
  update(dt: number) {
    const p = this.player.position;
    const last = this.crumbs[this.crumbs.length - 1];
    if (!last || last.distanceTo(p) > 0.8) {
      this.crumbs.push(p.clone());
      if (this.crumbs.length > 40) this.crumbs.shift();
    }
    this.fsm.update(dt);
    this.char.update(dt);
  }
}
