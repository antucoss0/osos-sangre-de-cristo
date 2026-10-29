import * as THREE from 'three';
import { fbm2, ridged2, smoothstep, clamp, GLSL_NOISE } from '../core/noise';

export const WORLD = 420;
export const LAKE = { x: 0, z: -10, r: 46 };
export const WATER_Y = 0;

// Trail: south start -> lake shore -> west slope (fall) -> north forest -> back south-east
export const TRAIL_POINTS = [
  new THREE.Vector3(10, 0, 150),
  new THREE.Vector3(4, 0, 110),
  new THREE.Vector3(-6, 0, 78),
  new THREE.Vector3(-18, 0, 54),
];
const trailCurve = new THREE.CatmullRomCurve3(TRAIL_POINTS);
const trailSamples = trailCurve.getSpacedPoints(80);

function distToTrail(x: number, z: number) {
  let best = 1e9;
  for (let i = 0; i < trailSamples.length - 1; i++) {
    const a = trailSamples[i], b = trailSamples[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z;
    const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
    const dx = x - (a.x + abx * t), dz = z - (a.z + abz * t);
    best = Math.min(best, dx * dx + dz * dz);
  }
  return Math.sqrt(best);
}

export function lakeDist(x: number, z: number) {
  const dx = x - LAKE.x, dz = (z - LAKE.z) * 1.35;
  const ang = Math.atan2(dz, dx);
  const wob = 1 + 0.16 * Math.sin(ang * 3 + 0.6) + 0.08 * Math.sin(ang * 5 + 2.1) + 0.05 * Math.sin(ang * 9);
  return Math.sqrt(dx * dx + dz * dz) / (LAKE.r * wob);
}

export function talusMask(x: number, z: number) {
  // boulder fields on the east and north-east slopes (like the reference photo)
  const n = fbm2(x * 0.012 + 5, z * 0.012 - 3, 3);
  const east = smoothstep(10, 70, x + n * 40) * smoothstep(80, -40, z);
  const north = smoothstep(-40, -90, z + n * 30) * smoothstep(-60, 40, x);
  const shore = smoothstep(1.35, 1.0, lakeDist(x, z)) * smoothstep(0.92, 1.02, lakeDist(x, z));
  return clamp(Math.max(east, north * 0.85, shore * 0.9) + n * 0.25, 0, 1);
}

export function heightAt(x: number, z: number): number {
  const ld = lakeDist(x, z);
  // cirque bowl rising to N/E/W, opening to the south valley
  const r = Math.sqrt(x * x + (z + 20) * (z + 20));
  let h = smoothstep(40, 210, r) * 55;
  h += smoothstep(-20, -200, z) * 70;
  h += smoothstep(60, 200, Math.abs(x)) * 40;
  h -= smoothstep(40, 200, z) * 18;
  h += fbm2(x * 0.008, z * 0.008, 5) * 22;
  h += ridged2(x * 0.02 + 10, z * 0.02, 4) * 6 * smoothstep(30, 120, r);
  // talus roughness
  const t = talusMask(x, z);
  h += t * (ridged2(x * 0.09, z * 0.09, 3) * 2.2);
  h += fbm2(x * 0.06, z * 0.06, 3) * 1.4;
  // lake basin
  const shore = 2.2 + fbm2(x * 0.05, z * 0.05, 2) * 1.2;
  if (ld < 1.4) {
    const k = smoothstep(1.4, 0.95, ld);
    h = h * (1 - k) + shore * k;
    h -= smoothstep(1.02, 0.55, ld) * (shore + 4.5);
  }
  // trail flattening
  const td = distToTrail(x, z);
  if (td < 8) {
    const k = smoothstep(8, 1.5, td);
    const base = fbm2(x * 0.01, z * 0.01, 2) * 4 + smoothstep(40, 210, r) * 55 - smoothstep(40, 200, z) * 18;
    h = h * (1 - k * 0.55) + base * k * 0.55;
  }
  return h;
}

export function slopeAt(x: number, z: number) {
  const e = 0.6;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.sqrt(dx * dx + dz * dz) / (2 * e);
}

export function normalAt(x: number, z: number, out = new THREE.Vector3()) {
  const e = 0.5;
  out.set(heightAt(x - e, z) - heightAt(x + e, z), 2 * e, heightAt(x, z - e) - heightAt(x, z + e));
  return out.normalize();
}

export function trailDistance(x: number, z: number) {
  return distToTrail(x, z);
}

function makeDetailNormal(): THREE.Texture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const img = g.createImageData(s, s);
  const hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const u = x / s, v = y / s;
      // tileable by sampling on torus
      const a = u * Math.PI * 2, b = v * Math.PI * 2;
      const nx = Math.cos(a) * 3, ny = Math.sin(a) * 3, nz = Math.cos(b) * 3, nw = Math.sin(b) * 3;
      hgt[y * s + x] = fbm2(nx + nz * 1.7, ny + nw * 1.3, 5) + 0.5 * fbm2(nx * 4 + nw, nz * 4 + ny, 3);
    }
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const l = hgt[y * s + ((x - 1 + s) % s)], r = hgt[y * s + ((x + 1) % s)];
      const d = hgt[((y - 1 + s) % s) * s + x], u = hgt[((y + 1) % s) * s + x];
      const n = new THREE.Vector3((l - r) * 6, (d - u) * 6, 1).normalize();
      const i = (y * s + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function createTerrain(segments = 320) {
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const talus = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    talus[i] = talusMask(x, z);
  }
  geo.setAttribute('talus', new THREE.BufferAttribute(talus, 1));
  const trail = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) trail[i] = smoothstep(3.2, 0.6, distToTrail(pos.getX(i), pos.getZ(i)));
  geo.setAttribute('trail', new THREE.BufferAttribute(trail, 1));
  geo.computeVertexNormals();

  const normalMap = makeDetailNormal();
  normalMap.repeat.set(WORLD / 6, WORLD / 6);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0,
    normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
  });
  const uniforms = { uTime: { value: 0 }, uWave: { value: 0 }, uNight: { value: 0 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float talus; attribute float trail;
        varying vec3 vWPos; varying float vTalus; varying float vTrail; varying vec3 vWN;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed,1.0)).xyz; vTalus = talus; vTrail = trail;
        vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uWave; uniform float uNight;
        varying vec3 vWPos; varying float vTalus; varying float vTrail; varying vec3 vWN;
        ${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 p = vWPos.xz;
        float wave = uWave * sin(dot(p, vec2(0.21,0.17)) + uTime*1.6) * 0.5;
        float n1 = fbm(p*0.08 + wave), n2 = fbm(p*0.6), n3 = snoise(p*2.7);
        float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
        vec3 grassA = vec3(0.15,0.23,0.08), grassB = vec3(0.25,0.32,0.13), dry = vec3(0.38,0.36,0.22);
        vec3 grass = mix(grassA, grassB, smoothstep(-0.4,0.6,n1));
        grass = mix(grass, dry, smoothstep(0.25,0.7,n2)*0.25);
        vec3 dirt = vec3(0.27,0.22,0.17) * (0.85+0.3*n3);
        vec3 rock = mix(vec3(0.38,0.37,0.33), vec3(0.50,0.49,0.42), smoothstep(-0.3,0.5,n2));
        float lichen = smoothstep(0.35,0.75, fbm(p*1.7+3.0));
        rock = mix(rock, vec3(0.56,0.58,0.30), lichen*0.55);
        rock = mix(rock, vec3(0.62,0.38,0.26), smoothstep(0.6,0.9, fbm(p*1.1-7.0))*0.4);
        vec3 col = grass;
        col = mix(col, dirt, smoothstep(0.35,0.7,n2*0.5+0.5) * 0.35);
        col = mix(col, rock, clamp(smoothstep(0.35,0.7,slope) + vTalus*0.95, 0.0, 1.0));
        col = mix(col, vec3(0.30,0.25,0.19)*(0.9+0.2*n3), vTrail*0.85);
        // wet dark shore
        float shore = smoothstep(2.6, 0.2, vWPos.y);
        col = mix(col, col*0.45 + vec3(0.02,0.03,0.02), shore*0.8);
        col *= 0.92 + 0.16*n3;
        // psychedelic iridescence (act I)
        vec3 iri = 0.5+0.5*cos(6.2831*(vec3(0.0,0.33,0.67) + n1*1.5 + uTime*0.05));
        col = mix(col, col*iri*1.6, uWave*0.22);
        diffuseColor.rgb = col;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.95, 0.55, smoothstep(2.0, 0.2, vWPos.y));`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return { mesh, uniforms };
}
