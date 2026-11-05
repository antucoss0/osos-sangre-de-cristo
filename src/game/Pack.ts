import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Bear, type BearEvent } from './Bear';
import type { Colliders } from './Collision';

export interface PackSpot { x: number; z: number; y?: number; trunk?: { x: number; z: number } }

/** Ten mothers and cubs along the escape route — some on the ground, cubs up in the trees. No blue glow. */
export class Pack {
  bears: Bear[] = [];
  onEvent: ((e: BearEvent, b: Bear) => void) | null = null;
  active = false;
  constructor(gltf: GLTF, colliders: Colliders, scene: THREE.Object3D, count = 10) {
    for (let i = 0; i < count; i++) {
      const cub = i % 2 === 1;
      const b = new Bear(gltf, colliders, { clone: true, scale: cub ? 0.5 + (i % 3) * 0.06 : 1.0 + (i % 3) * 0.06 });
      b.char.root.userData.cub = cub;
      b.onEvent = (e, bb) => this.onEvent?.(e, bb);
      scene.add(b.char.root, b.eyes);
      this.bears.push(b);
    }
  }
  get watching() {
    return this.bears.filter((b) => b.fsm.is('Lurk', 'Cling'));
  }
  /** spots[i] is used by bear i (odd indices are cubs). */
  start(spots: PackSpot[], player: THREE.Vector3) {
    this.active = true;
    this.bears.forEach((b, i) => {
      const s = spots[i % spots.length];
      b.agitation = 0;
      b.perched = false;
      b.place(s.x, s.z, Math.atan2(player.x - s.x, player.z - s.z));
      b.stand.set(s.x, 0, s.z);
      if (s.trunk) {
        b.char.position.y = s.y ?? b.char.position.y + 3.5;
        b.exit.set(s.trunk.x, 0, s.trunk.z);
        b.char.heading = Math.atan2(s.trunk.x - s.x, s.trunk.z - s.z);
        b.fsm.go('Cling');
      } else b.fsm.go('Lurk');
    });
  }
  update(dt: number, player: THREE.Vector3, camera: THREE.Camera, dusk: number) {
    for (const b of this.bears) {
      b.target.copy(player);
      if (b.fsm.is('Lurk', 'Cling')) b.eyeGlow += (Math.min(1, 0.35 + dusk) - b.eyeGlow) * (1 - Math.exp(-2 * dt));
      else b.eyeGlow *= Math.exp(-3 * dt);
      b.update(dt, camera);
    }
  }
  hideAll() {
    this.active = false;
    this.bears.forEach((b) => { b.perched = false; b.fsm.go('Hidden'); });
  }
}
