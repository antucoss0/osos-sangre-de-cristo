import * as THREE from 'three';
import { DARK, heightAt, lakeDist, WATER_Y } from './Terrain';

/** Story anchors around the dark corner of the lake. */
export const STONE = { x: -88, z: 27 };
export const WAKE = { x: -70, z: 13 };
export const BEAR_TREE = { x: -79, z: 5 };

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** Black water, dead wood, snags and the great tree where the bear waits. */
export function createTangle() {
  const group = new THREE.Group();
  const colliders: { x: number; z: number; r: number }[] = [];
  const r = rng(77);
  // black water patch (soft radial edge)
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const dark = new THREE.Mesh(
    new THREE.CircleGeometry(DARK.r * 1.25, 48),
    new THREE.MeshBasicMaterial({ color: 0x010403, transparent: true, opacity: 0.82, alphaMap: new THREE.CanvasTexture(c), depthWrite: false, fog: true }),
  );
  dark.rotation.x = -Math.PI / 2;
  dark.position.set(DARK.x + 4, WATER_Y + 0.04, DARK.z);
  dark.renderOrder = 2;
  group.add(dark);
  const bark = new THREE.MeshStandardMaterial({ color: 0x2b231c, roughness: 1 });
  const deadBark = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 0.95 });
  const needles = new THREE.MeshStandardMaterial({ color: 0x0f1d15, roughness: 0.9, flatShading: true });
  // fallen logs, half in the water
  const logGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  for (let i = 0; i < 22; i++) {
    const a = r() * Math.PI * 2, d = r() * DARK.r;
    const x = DARK.x + Math.cos(a) * d - 4, z = DARK.z + Math.sin(a) * d;
    const len = 4 + r() * 7, rad = 0.12 + r() * 0.28;
    const m = new THREE.Mesh(logGeo, r() > 0.5 ? bark : deadBark);
    m.scale.set(rad, len, rad);
    m.position.set(x, Math.max(heightAt(x, z), WATER_Y - 0.1) + rad * 0.6, z);
    m.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.5, 0, r() * Math.PI);
    m.castShadow = true;
    group.add(m);
  }
  // dead snags with bare branches
  const snagGeo = new THREE.CylinderGeometry(0.12, 0.32, 1, 6);
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, d = 6 + r() * DARK.r * 1.1;
    const x = DARK.x - 6 + Math.cos(a) * d, z = DARK.z + Math.sin(a) * d;
    if (lakeDist(x, z) < 1.0) continue;
    const hgt = 6 + r() * 8, y = heightAt(x, z);
    const s = new THREE.Mesh(snagGeo, deadBark);
    s.scale.set(1, hgt, 1); s.position.set(x, y + hgt / 2, z); s.rotation.z = (r() - 0.5) * 0.15; s.castShadow = true;
    group.add(s);
    for (let k = 0; k < 4; k++) {
      const b = new THREE.Mesh(snagGeo, deadBark);
      const bl = 1 + r() * 2.2;
      b.scale.set(0.3, bl, 0.3);
      const by = y + hgt * (0.35 + r() * 0.55), ba = r() * Math.PI * 2;
      b.position.set(x + Math.cos(ba) * bl * 0.45, by, z + Math.sin(ba) * bl * 0.45);
      b.rotation.set(0, -ba, Math.PI / 2 - 0.4);
      group.add(b);
    }
    colliders.push({ x, z, r: 0.4 });
  }
  // the great tree
  const tx = BEAR_TREE.x, tz = BEAR_TREE.z, ty = heightAt(tx, tz);
  const toWake = Math.atan2(WAKE.x - tx, WAKE.z - tz);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.5, 26, 14), bark);
  trunk.position.set(tx, ty + 13, tz); trunk.castShadow = true;
  group.add(trunk);
  const branchLen = 6, branchY = 7.4;
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.7, branchLen, 10), bark);
  branch.position.set(tx + Math.sin(toWake) * branchLen * 0.5, ty + branchY, tz + Math.cos(toWake) * branchLen * 0.5);
  branch.rotation.set(Math.PI / 2 - 0.08, toWake, 0, 'YXZ');
  branch.castShadow = true;
  group.add(branch);
  for (let k = 0; k < 6; k++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(5.6 - k * 0.7, 5, 9), needles);
    cone.position.set(tx, ty + 16.5 + k * 2.2, tz); cone.rotation.y = k; cone.castShadow = true;
    group.add(cone);
  }
  colliders.push({ x: tx, z: tz, r: 1.7 });
  const perch = new THREE.Vector3(tx + Math.sin(toWake) * 3.6, ty + branchY + 0.55, tz + Math.cos(toWake) * 3.0);
  return { group, colliders, perch, perchHeading: toWake };
}
