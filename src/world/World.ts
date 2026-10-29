import * as THREE from 'three';
import type { Quality } from '../core/Engine';
import { createTerrain, TRAIL_POINTS, heightAt, LAKE } from './Terrain';
import { createWater } from './Water';
import { createSky, createMountains } from './Sky';
import { createForest, createGrass, windUniforms } from './Vegetation';
import { createTalus, rockUniforms } from './Rocks';
import { Petroglyphs } from './Petroglyphs';
import { Colliders } from '../game/Collision';
import { Motes } from '../fx/Particles';
import { lerp, clamp } from '../core/noise';

interface TodKey {
  sunDir: THREE.Vector3; sunColor: number; sunI: number;
  hemiSky: number; hemiGround: number; hemiI: number;
  fog: number; fogD: number; zenith: number; horizon: number; cloud: number; night: number; exposure: number;
}

const KEYS: TodKey[] = [
  // overcast alpine afternoon (reference photo)
  { sunDir: new THREE.Vector3(0.45, 0.62, -0.45), sunColor: 0xfff0dc, sunI: 2.9, hemiSky: 0xbfcad2, hemiGround: 0x4d4a3a, hemiI: 1.2, fog: 0xa3abb0, fogD: 0.0024, zenith: 0x56677a, horizon: 0xc2c8ca, cloud: 0.72, night: 0, exposure: 1.0 },
  // deep sunset over Sangre de Cristo
  { sunDir: new THREE.Vector3(-0.75, 0.07, -0.3), sunColor: 0xff8a4a, sunI: 2.2, hemiSky: 0x8d7f97, hemiGround: 0x2c2620, hemiI: 0.6, fog: 0xb07f6c, fogD: 0.0034, zenith: 0x2e3a62, horizon: 0xf09a62, cloud: 0.5, night: 0.12, exposure: 1.05 },
  // New Mexico night
  { sunDir: new THREE.Vector3(0.3, 0.55, 0.35), sunColor: 0x9fb4e6, sunI: 0.85, hemiSky: 0x34466e, hemiGround: 0x0b0d12, hemiI: 0.6, fog: 0x0c121c, fogD: 0.003, zenith: 0x01030a, horizon: 0x0f1a2c, cloud: 0.18, night: 1, exposure: 1.4 },
];

export class World {
  group = new THREE.Group();
  sun = new THREE.DirectionalLight(0xffffff, 2);
  hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  colliders = new Colliders();
  terrain: ReturnType<typeof createTerrain>;
  water: ReturnType<typeof createWater>;
  sky: ReturnType<typeof createSky>;
  mountains: ReturnType<typeof createMountains>;
  petro: Petroglyphs;
  motes = new Motes();
  fog: THREE.FogExp2;
  tod = 0;
  psy = 0;
  exposure = 1;
  trail = new THREE.CatmullRomCurve3(TRAIL_POINTS);
  private c1 = new THREE.Color();
  private c2 = new THREE.Color();
  constructor(scene: THREE.Scene, q: Quality) {
    scene.add(this.group);
    this.fog = new THREE.FogExp2(0xa3abb0, 0.0045);
    scene.fog = this.fog;
    this.terrain = createTerrain(q.terrainSeg);
    this.terrain.mesh.receiveShadow = true;
    this.water = createWater(q.water);
    this.sky = createSky();
    this.mountains = createMountains();
    const forest = createForest(q.trees);
    const talus = createTalus(q.rocks);
    const grass = createGrass(q.grass);
    this.colliders.addAll(forest.trees.map((t) => ({ x: t.x, z: t.z, r: 0.35 })));
    this.colliders.addAll(talus.colliders);
    const glyphPts = [0.16, 0.42, 0.68, 0.9].map((t, i) => {
      const p = this.trail.getPointAt(t);
      const tan = this.trail.getTangentAt(t);
      const side = i % 2 ? 1 : -1;
      const x = p.x + tan.z * 4.2 * side, z = p.z - tan.x * 4.2 * side;
      return { x, z, face: Math.atan2(p.x - x, p.z - z) };
    });
    this.petro = new Petroglyphs(glyphPts);
    glyphPts.forEach((g) => this.colliders.add({ x: g.x, z: g.z, r: 1.4 }));
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(q.shadow, q.shadow);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.group.add(this.terrain.mesh, this.water.water, this.sky.mesh, this.mountains.group,
      forest.group, talus.group, grass, this.petro.group, this.sun, this.sun.target, this.hemi, this.motes.points);
    this.setTimeOfDay(0);
  }
  setTimeOfDay(t: number) {
    this.tod = clamp(t, 0, 1);
    const seg = this.tod < 0.5 ? 0 : 1;
    const k = this.tod < 0.5 ? this.tod * 2 : (this.tod - 0.5) * 2;
    const a = KEYS[seg], b = KEYS[seg + 1];
    const col = (x: number, y: number) => this.c1.set(x).lerp(this.c2.set(y), k).clone();
    const sunDir = a.sunDir.clone().lerp(b.sunDir, k).normalize();
    this.sun.color.copy(col(a.sunColor, b.sunColor));
    this.sun.intensity = lerp(a.sunI, b.sunI, k);
    this.hemi.color.copy(col(a.hemiSky, b.hemiSky));
    this.hemi.groundColor.copy(col(a.hemiGround, b.hemiGround));
    this.hemi.intensity = lerp(a.hemiI, b.hemiI, k);
    const fog = col(a.fog, b.fog);
    this.fog.color.copy(fog);
    this.fog.density = lerp(a.fogD, b.fogD, k);
    const su = this.sky.uniforms;
    su.uSunDir.value.copy(sunDir);
    su.uZenith.value.copy(col(a.zenith, b.zenith));
    su.uHorizon.value.copy(col(a.horizon, b.horizon));
    su.uSunColor.value.copy(this.sun.color);
    su.uCloud.value = lerp(a.cloud, b.cloud, k);
    const night = lerp(a.night, b.night, k);
    su.uNight.value = night;
    const mu = this.mountains.material.uniforms;
    mu.uFog.value.copy(fog);
    mu.uNight.value = night;
    mu.uSunDir.value.copy(sunDir);
    const wu = this.water.uniforms;
    wu.uFogColor.value.copy(fog);
    wu.uFogDensity.value = this.fog.density * 1.3;
    wu.uSky.value.copy(su.uHorizon.value);
    this.terrain.uniforms.uNight.value = night;
    this.motes.uniforms.uNight.value = night;
    this.exposure = lerp(a.exposure, b.exposure, k);
    this.sunDir.copy(sunDir);
  }
  sunDir = new THREE.Vector3();
  setPsy(v: number) {
    this.psy = v;
    this.sky.uniforms.uPsy.value = v;
    this.terrain.uniforms.uWave.value = v;
    this.motes.uniforms.uPsy.value = v;
  }
  setBreath(v: number) {
    windUniforms.uBreath.value = v;
  }
  ripple(x: number, z: number, strength: number) {
    this.water.uniforms.uRipplePos.value.set(x, z);
    this.water.uniforms.uRipple.value = strength;
  }
  update(dt: number, time: number, camera: THREE.Camera, focus: THREE.Vector3) {
    windUniforms.uTime.value = time;
    rockUniforms.uTime.value = time;
    this.terrain.uniforms.uTime.value = time;
    this.water.uniforms.uTime.value = time;
    this.water.uniforms.uCam.value.copy(camera.position);
    this.water.uniforms.uRipple.value *= Math.exp(-0.8 * dt);
    this.sky.uniforms.uTime.value = time;
    this.sky.mesh.position.copy(camera.position);
    this.motes.uniforms.uTime.value = time;
    this.motes.uniforms.uCenter.value.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 160);
    this.sun.target.position.copy(focus);
  }
  groundAt(x: number, z: number) {
    return heightAt(x, z);
  }
  static lake = LAKE;
}
