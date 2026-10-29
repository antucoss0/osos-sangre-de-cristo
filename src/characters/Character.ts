import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { heightAt } from '../world/Terrain';
import { damp } from '../core/noise';

export interface PlayOpts {
  fade?: number;
  once?: boolean;
  timeScale?: number;
  clamp?: boolean;
}

export class Character {
  root = new THREE.Group();
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction> = {};
  current = '';
  heading = 0;
  velocity = new THREE.Vector3();
  quadruped: boolean;
  bones: Record<string, THREE.Bone> = {};
  private pitch = 0;
  private roll = 0;
  constructor(gltf: GLTF, opts: { scale?: number; quadruped?: boolean; clone?: boolean } = {}) {
    this.model = opts.clone ? skClone(gltf.scene) : gltf.scene;
    this.model.scale.setScalar(opts.scale ?? 1);
    this.quadruped = !!opts.quadruped;
    this.root.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of gltf.animations) {
      const name = clip.name.replace(/_Rig$/, '');
      this.actions[name] = this.mixer.clipAction(clip);
    }
    this.model.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone) this.bones[b.name] = b;
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
      }
    });
  }
  get position() {
    return this.root.position;
  }
  play(name: string, opts: PlayOpts = {}) {
    const next = this.actions[name];
    if (!next) return;
    const fade = opts.fade ?? 0.35;
    next.timeScale = opts.timeScale ?? 1;
    if (this.current === name && !opts.once) return;
    next.reset();
    next.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = opts.clamp ?? !!opts.once;
    next.enabled = true;
    next.setEffectiveWeight(1);
    const prev = this.actions[this.current];
    if (prev && prev !== next) {
      // sync gait phase between walk/run for seamless blending
      if ((name === 'Walk' || name === 'Run') && (this.current === 'Walk' || this.current === 'Run')) {
        next.time = (prev.time / prev.getClip().duration) * next.getClip().duration;
      }
      next.crossFadeFrom(prev, fade, true);
    }
    next.play();
    this.current = name;
  }
  setSpeed(timeScale: number) {
    const a = this.actions[this.current];
    if (a) a.timeScale = timeScale;
  }
  progress() {
    const a = this.actions[this.current];
    return a ? a.time / a.getClip().duration : 0;
  }
  bonePos(name: string, out = new THREE.Vector3()) {
    const b = this.bones[name];
    if (!b) return out.copy(this.root.position);
    return b.getWorldPosition(out);
  }
  faceTowards(x: number, z: number, dt: number, rate = 6) {
    const target = Math.atan2(x - this.root.position.x, z - this.root.position.z);
    let d = target - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * (1 - Math.exp(-rate * dt));
    return Math.abs(d);
  }
  update(dt: number, ground = true) {
    this.mixer.update(dt);
    const p = this.root.position;
    if (ground) {
      const h = heightAt(p.x, p.z);
      p.y = damp(p.y, h, 18, dt);
    }
    if (this.quadruped) {
      // align body to terrain slope (front/back + left/right samples)
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const L = 0.95, W = 0.35;
      const hf = heightAt(p.x + fx * L, p.z + fz * L), hb = heightAt(p.x - fx * L, p.z - fz * L);
      const hl = heightAt(p.x + fz * W, p.z - fx * W), hr = heightAt(p.x - fz * W, p.z + fx * W);
      this.pitch = damp(this.pitch, Math.atan2(hb - hf, 2 * L), 8, dt);
      this.roll = damp(this.roll, Math.atan2(hl - hr, 2 * W) * 0.5, 8, dt);
    }
    this.root.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
  }
}
