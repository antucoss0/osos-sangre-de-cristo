import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Bear, type BearEvent } from './Bear';
import type { Colliders } from './Collision';

/** Mothers and cubs that wait along the escape route. They must be passed without being challenged. */
export class Pack {
  bears: Bear[] = [];
  onEvent: ((e: BearEvent, b: Bear) => void) | null = null;
  active = false;
  constructor(gltf: GLTF, colliders: Colliders, scene: THREE.Object3D, count = 6) {
    for (let i = 0; i < count; i++) {
      const cub = i % 2 === 1;
      const b = new Bear(gltf, colliders, { clone: true, scale: cub ? 0.55 : 1.05 });
      b.char.root.userData.cub = cub;
      b.onEvent = (e, bb) => this.onEvent?.(e, bb);
      scene.add(b.char.root, b.eyes);
      this.bears.push(b);
    }
  }
  get watching() {
    return this.bears.filter((b) => b.fsm.is('Lurk'));
  }
  start(spots: { x: number; z: number }[], player: THREE.Vector3) {
    this.active = true;
    this.bears.forEach((b, i) => {
      const s = spots[i % spots.length];
      const ox = i >= spots.length ? 2.2 : 0;
      b.place(s.x + ox, s.z + ox, Math.atan2(player.x - s.x, player.z - s.z));
      b.stand.set(s.x + ox, 0, s.z + ox);
      b.agitation = 0;
      b.fsm.go('Lurk');
    });
  }
  update(dt: number, player: THREE.Vector3, camera: THREE.Camera, dusk: number) {
    for (const b of this.bears) {
      b.target.copy(player);
      if (b.fsm.is('Lurk')) b.eyeGlow += (Math.min(1, 0.35 + dusk) - b.eyeGlow) * (1 - Math.exp(-2 * dt));
      else b.eyeGlow *= Math.exp(-3 * dt);
      b.update(dt, camera);
    }
  }
  hideAll() {
    this.active = false;
    this.bears.forEach((b) => b.fsm.go('Hidden'));
  }
}
