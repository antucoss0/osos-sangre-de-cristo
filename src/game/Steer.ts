import * as THREE from 'three';
import type { Character } from '../characters/Character';
import type { Colliders } from './Collision';
import { lakeDist } from '../world/Terrain';
import { damp } from '../core/noise';

/** Moves a character toward a target with smooth acceleration and turning. Returns remaining distance. */
export function steer(c: Character, target: THREE.Vector3, speed: number, dt: number, colliders?: Colliders | null, radius = 0.35, turnRate = 5) {
  const p = c.position;
  const dx = target.x - p.x, dz = target.z - p.z;
  const dist = Math.hypot(dx, dz);
  const arrive = Math.min(1, dist / 1.2);
  const want = speed * arrive;
  const cur = Math.hypot(c.velocity.x, c.velocity.z);
  const sp = damp(cur, want, 4, dt);
  const turnErr = c.faceTowards(target.x, target.z, dt, turnRate);
  const fwd = sp * Math.max(0.2, Math.cos(Math.min(turnErr, 1.5)));
  c.velocity.set(Math.sin(c.heading) * fwd, 0, Math.cos(c.heading) * fwd);
  const ox = p.x, oz = p.z;
  p.x += c.velocity.x * dt;
  p.z += c.velocity.z * dt;
  colliders?.resolve(p, radius);
  if (lakeDist(p.x, p.z) < 0.97) { p.x = ox; p.z = oz; }
  return dist;
}

export function speedOf(c: Character) {
  return Math.hypot(c.velocity.x, c.velocity.z);
}

/** Drive locomotion clips from planar speed for humans. */
export function humanLocomotion(c: Character, crouch = false) {
  const s = speedOf(c);
  if (crouch) {
    c.play('Crouch', { fade: 0.3 });
    c.setSpeed(0.6 + s * 0.8);
  } else if (s > 2.6) {
    c.play('Run', { fade: 0.3 });
    c.setSpeed(s / 3.9);
  } else if (s > 0.25) {
    c.play('Walk', { fade: 0.3 });
    c.setSpeed(Math.max(0.55, s / 1.45));
  } else {
    c.play('Idle', { fade: 0.45 });
    c.setSpeed(1);
  }
}

export function bearLocomotion(c: Character) {
  const s = speedOf(c);
  if (s > 2.6) { c.play('Run', { fade: 0.35 }); c.setSpeed(s / 5); }
  else if (s > 0.2) { c.play('Walk', { fade: 0.4 }); c.setSpeed(Math.max(0.5, s / 1.3)); }
  else if (c.current === 'Walk' || c.current === 'Run') c.play('Idle', { fade: 0.5 });
}
