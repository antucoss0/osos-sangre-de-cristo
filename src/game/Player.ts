import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Character } from '../characters/Character';
import { StateMachine } from '../core/FSM';
import type { Input } from '../core/Input';
import type { Colliders } from './Collision';
import { heightAt, lakeDist } from '../world/Terrain';
import { damp, clamp } from '../core/noise';
import { humanLocomotion, speedOf, steer } from './Steer';

export type CamMode = 'third' | 'first' | 'free';

export class Player {
  char: Character;
  fsm: StateMachine<Player>;
  yaw = Math.PI;
  pitch = 0.12;
  camMode: CamMode = 'third';
  camDist = 4.4;
  controllable = false;
  canRun = true;
  stepPhase = 0;
  onStep: ((run: boolean) => void) | null = null;
  scriptTarget: THREE.Vector3 | null = null;
  scriptSpeed = 1.4;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private bob = 0;
  private tmp = new THREE.Vector3();
  private lastStep = 0;
  constructor(gltf: GLTF, private input: Input, private colliders: Colliders, private camera: THREE.PerspectiveCamera) {
    this.char = new Character(gltf);
    const self = this;
    this.fsm = new StateMachine<Player>(this, {
      Explore: {
        update(p, dt) {
          if (!p.controllable) return 'Scripted';
          p.move(dt);
          if (p.input.isDown('KeyC') || p.input.isDown('ControlLeft')) return 'Crouch';
        },
      },
      Crouch: {
        update(p, dt) {
          p.move(dt, 0.8);
          if (!p.input.isDown('KeyC') && !p.input.isDown('ControlLeft')) return 'Explore';
        },
      },
      Aim: {
        enter(p) { p.char.play('Aim', { fade: 0.15 }); p.char.velocity.multiplyScalar(0.2); },
        update(p, dt, t) {
          p.char.faceTowards(p.char.position.x + Math.sin(p.yaw), p.char.position.z + Math.cos(p.yaw), dt, 14);
          if (t > 0.9) return p.controllable ? 'Explore' : 'Scripted';
        },
      },
      Scared: {
        enter(p) { p.char.velocity.set(0, 0, 0); p.char.play('Scared', { fade: 0.25 }); },
      },
      Scripted: {
        update(p, dt) {
          if (p.controllable) return 'Explore';
          if (p.scriptTarget) {
            const d = steer(p.char, p.scriptTarget, p.scriptSpeed, dt, p.colliders);
            if (d < 0.3) { p.scriptTarget = null; p.char.velocity.set(0, 0, 0); }
            humanLocomotion(p.char);
          } else if (p.char.current !== 'Scared' && p.char.current !== 'Aim') {
            p.char.velocity.multiplyScalar(0.8);
            humanLocomotion(p.char);
          }
        },
      },
    }, 'Scripted');
    void self;
  }
  get position() {
    return this.char.position;
  }
  place(x: number, z: number, heading: number) {
    this.char.position.set(x, heightAt(x, z), z);
    this.char.heading = heading;
    this.yaw = heading;
    this.char.velocity.set(0, 0, 0);
    this.snapCamera();
  }
  aim() {
    this.fsm.go('Aim');
  }
  scared() {
    this.fsm.go('Scared');
  }
  release() {
    this.fsm.go(this.controllable ? 'Explore' : 'Scripted');
  }
  walkTo(target: THREE.Vector3, speed = 1.4) {
    this.scriptTarget = target.clone();
    this.scriptSpeed = speed;
    if (!this.controllable) this.fsm.go('Scripted');
  }
  private move(dt: number, maxSpeed?: number) {
    const ax = this.input.axis();
    const run = this.canRun && this.input.isDown('ShiftLeft');
    const target = maxSpeed ?? (run ? 4.3 : 1.6);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dir = this.tmp.set(fx * ax.y - fz * ax.x, 0, fz * ax.y + fx * ax.x);
    const len = dir.length();
    const c = this.char;
    if (len > 0.01) {
      dir.divideScalar(len);
      const want = Math.atan2(dir.x, dir.z);
      let d = want - c.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      c.heading += d * (1 - Math.exp(-10 * dt));
    }
    const slow = 1 - clamp((heightAt(c.position.x + dir.x, c.position.z + dir.z) - c.position.y) * 0.25, -0.2, 0.45);
    const tv = len > 0.01 ? target * slow : 0;
    c.velocity.x = damp(c.velocity.x, dir.x * tv, 7, dt);
    c.velocity.z = damp(c.velocity.z, dir.z * tv, 7, dt);
    const p = c.position;
    const ox = p.x, oz = p.z;
    p.x += c.velocity.x * dt;
    p.z += c.velocity.z * dt;
    this.colliders.resolve(p, 0.35);
    if (lakeDist(p.x, p.z) < 0.98 || Math.hypot(p.x, p.z) > 195) { p.x = ox; p.z = oz; }
    humanLocomotion(c, maxSpeed !== undefined && maxSpeed < 1);
  }
  snapCamera() {
    this.camTarget(this.camPos, this.camLook);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }
  camTarget(pos: THREE.Vector3, look: THREE.Vector3) {
    const p = this.char.position;
    const crouch = this.fsm.is('Crouch') ? -0.45 : 0;
    look.set(p.x, p.y + 1.5 + crouch, p.z);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const fx = Math.sin(this.yaw) * cp, fz = Math.cos(this.yaw) * cp;
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw);
    const dist = this.camDist + speedOf(this.char) * 0.18;
    pos.set(look.x - fx * dist + rx * 0.55, look.y + sp * dist, look.z - fz * dist + rz * 0.55);
    look.x += rx * 0.55 + fx * 2;
    look.z += rz * 0.55 + fz * 2;
    look.y -= sp * 2;
    const g = heightAt(pos.x, pos.z) + 0.45;
    if (pos.y < g) pos.y = g;
  }
  updateLook(sens = 1) {
    if (!this.input.locked) return;
    this.yaw -= this.input.mouseDX * 0.0021 * sens;
    this.pitch += this.input.mouseDY * 0.0021 * sens;
    this.pitch = clamp(this.pitch, this.camMode === 'first' ? -0.9 : -0.45, this.camMode === 'first' ? 0.9 : 0.95);
  }
  update(dt: number, time: number) {
    if (this.controllable || this.camMode === 'first') this.updateLook();
    if (this.controllable && this.input.pressed('KeyC') && !this.fsm.is('Crouch')) this.fsm.go('Crouch');
    this.fsm.update(dt);
    this.char.update(dt);
    const s = speedOf(this.char);
    if (s > 0.3) {
      this.stepPhase += dt * (s > 2.6 ? 2.9 : 1.75) * 2;
      if (Math.floor(this.stepPhase) !== this.lastStep) { this.lastStep = Math.floor(this.stepPhase); this.onStep?.(s > 2.6); }
    }
    this.bob = damp(this.bob, s, 4, dt);
    void time;
  }
  updateCamera(dt: number, time: number) {
    if (this.camMode === 'third') {
      this.camTarget(this.tmp, this.camLook);
      this.camPos.lerp(this.tmp, 1 - Math.exp(-10 * dt));
      this.camera.position.copy(this.camPos);
      this.camera.position.y += Math.sin(time * 1.7 * Math.max(1, this.bob)) * 0.015 * this.bob;
      this.camera.lookAt(this.camLook);
    } else if (this.camMode === 'first') {
      const p = this.char.position;
      this.camera.position.set(p.x, p.y + 1.62 + Math.sin(time * 0.35) * 0.01, p.z);
      const cp = Math.cos(this.pitch);
      this.camLook.set(p.x + Math.sin(this.yaw) * cp, p.y + 1.62 - Math.sin(this.pitch), p.z + Math.cos(this.yaw) * cp);
      this.camera.lookAt(this.camLook);
    }
  }
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.char.heading), 0, Math.cos(this.char.heading));
  }
}
