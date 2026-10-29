import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Bear, type BearEvent } from './Bear';
import type { Colliders } from './Collision';
import { lakeDist, talusMask, heightAt } from '../world/Terrain';

/** Procedural spawn manager for the ten ghost bears of Act III (mothers and cubs). */
export class Pack {
  bears: Bear[] = [];
  revealed = 0;
  total = 10;
  maxActive = 3;
  onEvent: ((e: BearEvent, b: Bear) => void) | null = null;
  onReveal: ((b: Bear, count: number) => void) | null = null;
  private spawnTimer = 2;
  private queue: Bear[] = [];
  private tmp = new THREE.Vector3();
  active = false;
  constructor(gltf: GLTF, private colliders: Colliders, private scene: THREE.Object3D) {
    for (let i = 0; i < this.total; i++) {
      const cub = i % 5 !== 0 && i % 3 !== 0 ? true : false;
      const b = new Bear(gltf, colliders, { clone: true, scale: cub ? 0.55 : 1.05 });
      b.char.root.userData.cub = cub;
      b.onEvent = (e, bb) => this.onEvent?.(e, bb);
      this.scene.add(b.char.root, b.eyes);
      this.bears.push(b);
    }
    this.queue = [...this.bears];
  }
  start() {
    this.active = true;
    this.spawnTimer = 3;
  }
  get lurking() {
    return this.bears.filter((b) => b.fsm.is('Lurk'));
  }
  private findShadowSpot(player: THREE.Vector3, camFwd: THREE.Vector3) {
    for (let k = 0; k < 40; k++) {
      const a = Math.atan2(camFwd.x, camFwd.z) + (Math.random() - 0.5) * Math.PI * 1.3;
      const r = 14 + Math.random() * 14;
      const x = player.x + Math.sin(a) * r, z = player.z + Math.cos(a) * r;
      if (lakeDist(x, z) < 1.1 || talusMask(x, z) > 0.6 || Math.hypot(x, z) > 185) continue;
      if (Math.abs(heightAt(x, z) - player.y) > 6) continue;
      // prefer spots next to tree trunks (deep shadow)
      const tree = this.colliders.nearest(x, z, 4);
      if (!tree && k < 30) continue;
      return new THREE.Vector3(x, 0, z);
    }
    return null;
  }
  update(dt: number, player: THREE.Vector3, camera: THREE.Camera, dusk: number) {
    camera.getWorldDirection(this.tmp);
    const fwd = this.tmp.clone();
    if (this.active) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.lurking.length < this.maxActive && this.queue.length) {
        const spot = this.findShadowSpot(player, fwd);
        if (spot) {
          const b = this.queue.shift()!;
          const back = new THREE.Vector3(spot.x - player.x, 0, spot.z - player.z).normalize();
          b.place(spot.x + back.x * 8, spot.z + back.z * 8, Math.atan2(-back.x, -back.z));
          b.stand.copy(spot);
          b.exit.set(spot.x + back.x * 40, 0, spot.z + back.z * 40);
          b.fsm.go('Lurk');
        }
        this.spawnTimer = 4 + Math.random() * 3;
      }
    }
    for (const b of this.bears) {
      b.target.copy(player);
      if (b.fsm.is('Lurk')) {
        // keep a ghostly distance: if the player walks off, re-position ahead
        if (b.position.distanceTo(player) > 42) {
          const spot = this.findShadowSpot(player, fwd);
          if (spot) { b.place(spot.x, spot.z, 0); b.stand.copy(spot); }
        }
        b.eyeGlow += (Math.min(1, 0.35 + dusk) - b.eyeGlow) * (1 - Math.exp(-2 * dt));
      } else {
        b.eyeGlow *= Math.exp(-3 * dt);
      }
      b.update(dt, camera);
    }
  }
  /** Camera flash: reveal lurking bears inside the cone. Returns number newly revealed. */
  flash(camera: THREE.Camera, origin: THREE.Vector3) {
    camera.getWorldDirection(this.tmp);
    let n = 0;
    for (const b of this.lurking) {
      const to = b.position.clone().sub(origin);
      to.y += 0.6;
      const d = to.length();
      if (d > 38) continue;
      if (this.tmp.angleTo(to.normalize()) > 0.6) continue;
      b.fsm.go('Revealed');
      this.revealed++;
      n++;
      this.onReveal?.(b, this.revealed);
    }
    return n;
  }
  hideAll() {
    this.active = false;
    this.bears.forEach((b) => b.fsm.go('Hidden'));
  }
}
