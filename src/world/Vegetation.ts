import * as THREE from 'three';
import { mulberry32, GLSL_NOISE } from '../core/noise';
import { heightAt, lakeDist, talusMask, trailDistance, slopeAt, WORLD } from './Terrain';

export const windUniforms = { uTime: { value: 0 }, uWind: { value: 1 }, uBreath: { value: 0 } };

function needleTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, s, s);
  const r = mulberry32(7);
  // a drooping spruce branch with dense needles (alpha-tested card)
  g.strokeStyle = '#3a2a1c';
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(s * 0.5, s); g.quadraticCurveTo(s * 0.52, s * 0.5, s * 0.5, 0); g.stroke();
  for (let i = 0; i < 2600; i++) {
    const t = r();
    const y = s * (1 - t);
    const spread = (1 - t * 0.85) * s * 0.48;
    const x = s * 0.5 + (r() - 0.5) * 2 * spread * Math.sqrt(r());
    const len = 6 + r() * 10;
    const ang = (x < s * 0.5 ? -1 : 1) * (0.6 + r() * 0.8) - Math.PI / 2;
    const gC = 60 + r() * 50, rC = 22 + r() * 25, bC = 28 + r() * 24;
    g.strokeStyle = `rgb(${rC},${gC},${bC})`;
    g.lineWidth = 1.2 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function barkTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  const r = mulberry32(3);
  g.fillStyle = '#3b2d22'; g.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(${20 + r() * 50},${15 + r() * 35},${10 + r() * 25},0.6)`;
    g.fillRect(r() * 64, r() * 256, 1 + r() * 3, 6 + r() * 30);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Build a spruce: trunk + whorls of drooping branch cards, merged into one geometry
function spruceGeometry(seed: number) {
  const r = mulberry32(seed);
  const H = 1;
  const parts: THREE.BufferGeometry[] = [];
  const branch = new THREE.PlaneGeometry(1, 1, 1, 3);
  branch.translate(0, 0.5, 0);
  // bend down
  const bp = branch.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i++) {
    const y = bp.getY(i);
    bp.setZ(i, -y * y * 0.35);
  }
  branch.rotateX(-Math.PI / 2);
  const whorls = 26;
  for (let w = 0; w < whorls; w++) {
    const t = w / whorls;
    const y = 0.12 + t * 0.86;
    const len = (1 - t) * 0.26 + 0.035;
    const count = 7 + Math.floor((1 - t) * 4);
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + r() * 0.6 + w * 0.7;
      const b = branch.clone();
      b.scale(len * 0.95, 1, len);
      b.rotateX(0.25 + t * 0.35 + r() * 0.15);
      b.rotateY(-a + Math.PI / 2);
      b.translate(0, y * H, 0);
      parts.push(b);
    }
  }
  // crown tip
  for (let k = 0; k < 3; k++) {
    const b = new THREE.PlaneGeometry(0.06, 0.12);
    b.translate(0, 1.0, 0); b.rotateY((k / 3) * Math.PI);
    parts.push(b);
  }
  const merged = mergeGeos(parts);
  const trunk = new THREE.CylinderGeometry(0.004, 0.022, 1, 7, 1);
  trunk.translate(0, 0.5, 0);
  return { foliage: merged, trunk };
}

function mergeGeos(geos: THREE.BufferGeometry[]) {
  let total = 0, idx = 0;
  for (const g of geos) { total += g.attributes.position.count; idx += g.index!.count; }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const index = new Uint32Array(idx);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array as Float32Array, vo * 3);
    nor.set(g.attributes.normal.array as Float32Array, vo * 3);
    uv.set(g.attributes.uv.array as Float32Array, vo * 2);
    const gi = g.index!.array;
    for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  // normals pointing outward from trunk axis for soft canopy lighting
  for (let i = 0; i < total; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const n = new THREE.Vector3(x, (y - 0.5) * 0.6 + 0.35, z).normalize();
    nor[i * 3] = n.x; nor[i * 3 + 1] = n.y; nor[i * 3 + 2] = n.z;
  }
  return out;
}

function windPatch(mat: THREE.Material, foliage: boolean) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uWind; uniform float uBreath; varying float vCamD; ${GLSL_NOISE}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float hh = clamp(transformed.y, 0.0, 1.0);
        float gust = snoise(ip.xz*0.02 + uTime*0.15)*0.5+0.5;
        float sw = sin(uTime*1.3 + ip.x*0.2 + ip.z*0.13) * (0.012 + gust*0.02) * uWind;
        transformed.x += sw * hh * hh;
        transformed.z += sw * 0.6 * hh * hh;
        ${foliage ? 'transformed.xz += (vec2(snoise(transformed.xy*9.0+uTime*1.7), snoise(transformed.zy*9.0-uTime*1.5)))*0.006*uWind*hh;' : ''}
        // vertex warping: trees breathe (act III)
        float br = sin(uTime*0.9 + ip.x*0.05)*uBreath;
        transformed.xz *= 1.0 + br*0.06*(1.0-hh);
        transformed.y *= 1.0 + br*0.03;
        vCamD = distance((modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz, cameraPosition);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCamD;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if (vCamD < 7.0 && fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > (vCamD - 2.0) / 5.0) discard;`);
  };
}

export interface Forest {
  group: THREE.Group;
  trees: { x: number; z: number; r: number }[];
}

export function createForest(density = 1): Forest {
  const group = new THREE.Group();
  const needle = needleTexture();
  const bark = barkTexture();
  const variants = [spruceGeometry(11), spruceGeometry(23), spruceGeometry(41)];
  const fmat = new THREE.MeshStandardMaterial({
    map: needle, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, color: 0xd6e2bc,
  });
  windPatch(fmat, true);
  const tmat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 });
  windPatch(tmat, false);
  const r = mulberry32(99);
  const trees: { x: number; z: number; r: number }[] = [];
  const placements: THREE.Matrix4[][] = [[], [], []];
  const target = Math.floor(1700 * density);
  let tries = 0;
  while (trees.length < target && tries < target * 12) {
    tries++;
    const x = (r() - 0.5) * WORLD * 0.96, z = (r() - 0.5) * WORLD * 0.96;
    const ld = lakeDist(x, z);
    if (ld < 1.12) continue;
    const tal = talusMask(x, z);
    if (r() < tal * 0.82) continue;
    if (trailDistance(x, z) < 3.5) continue;
    if (slopeAt(x, z) > 1.3) continue;
    // keep open clearings near the lake shore for views
    if (ld < 1.5 && r() < 0.6) continue;
    const h = heightAt(x, z);
    if (h > 120 && r() < 0.7) continue;
    const scale = 9 + r() * 16 + (r() < 0.1 ? 8 : 0);
    let ok = true;
    for (let i = Math.max(0, trees.length - 400); i < trees.length; i++) {
      const t = trees[i];
      if ((t.x - x) ** 2 + (t.z - z) ** 2 < 4) { ok = false; break; }
    }
    if (!ok) continue;
    trees.push({ x, z, r: scale * 0.02 + 0.2 });
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, h - 0.3, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.05, r() * Math.PI * 2, (r() - 0.5) * 0.05)),
      new THREE.Vector3(scale * (0.32 + r() * 0.1), scale, scale * (0.32 + r() * 0.1)),
    );
    placements[Math.floor(r() * 3)].push(m);
  }
  variants.forEach((v, i) => {
    const n = placements[i].length;
    const f = new THREE.InstancedMesh(v.foliage, fmat, n);
    const t = new THREE.InstancedMesh(v.trunk, tmat, n);
    const col = new THREE.Color();
    placements[i].forEach((m, k) => {
      f.setMatrixAt(k, m); t.setMatrixAt(k, m);
      col.setHSL(0.27 + r() * 0.06, 0.25 + r() * 0.15, 0.5 + r() * 0.25);
      f.setColorAt(k, col);
    });
    f.castShadow = true; f.receiveShadow = true; t.castShadow = true;
    group.add(f, t);
  });
  // dead fallen logs (silver-grey like in the reference photo)
  const logMat = new THREE.MeshStandardMaterial({ color: 0x8d8a80, roughness: 0.9 });
  const logGeo = new THREE.CylinderGeometry(0.08, 0.12, 1, 6);
  logGeo.rotateZ(Math.PI / 2);
  const logs = new THREE.InstancedMesh(logGeo, logMat, 160);
  for (let i = 0; i < 160; i++) {
    let x = 0, z = 0;
    for (let k = 0; k < 20; k++) {
      x = (r() - 0.5) * 220; z = (r() - 0.5) * 220 - 10;
      const ld = lakeDist(x, z);
      if (ld > 1.0 && ld < 2.2) break;
    }
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, heightAt(x, z) + 0.1, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.3, r() * Math.PI, (r() - 0.5) * 0.3)),
      new THREE.Vector3(3 + r() * 5, 1 + r(), 1 + r()),
    );
    logs.setMatrixAt(i, m);
  }
  logs.castShadow = true; logs.receiveShadow = true;
  group.add(logs);
  return { group, trees };
}

export function createGrass(count = 60000) {
  const blade = new THREE.PlaneGeometry(0.09, 0.42, 1, 3);
  blade.translate(0, 0.21, 0);
  const bp = blade.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setX(i, bp.getX(i) * (1 - bp.getY(i) / 0.46));
  const geo = new THREE.BufferGeometry();
  // tuft of 3 crossed blades
  const g2 = blade.clone(); g2.rotateY(Math.PI / 3);
  const g3 = blade.clone(); g3.rotateY(-Math.PI / 3);
  const g4 = blade.clone(); g4.rotateZ(0.35); g4.translate(0.05, 0, 0.03);
  const g5 = blade.clone(); g5.rotateZ(-0.3); g5.rotateY(1.2); g5.translate(-0.04, 0, -0.03);
  const merged = mergeGeos([blade, g2, g3, g4, g5]);
  geo.copy(merged);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a9a4c, side: THREE.DoubleSide, roughness: 1 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, windUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime; uniform float uWind; varying float vH; ${GLSL_NOISE}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float hh = transformed.y*2.0; vH = hh;
        float w = snoise(ip.xz*0.08 + uTime*0.35)*0.5+0.5;
        transformed.x += (sin(uTime*2.2 + ip.x*0.5)*0.06 + w*0.12)*hh*hh*uWind;
        transformed.z += cos(uTime*1.9 + ip.z*0.5)*0.04*hh*hh*uWind;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.35, 1.25, vH);`);
  };
  const r = mulberry32(5);
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < count * 4 && n < count; i++) {
    const x = (r() - 0.5) * 170, z = (r() - 0.5) * 220 + 40;
    const ld = lakeDist(x, z);
    if (ld < 1.05) continue;
    if (talusMask(x, z) > 0.45) continue;
    if (trailDistance(x, z) < 1.2) continue;
    if (slopeAt(x, z) > 0.9) continue;
    const s = 0.6 + r() * 1.1;
    inst.setMatrixAt(n, new THREE.Matrix4().compose(
      new THREE.Vector3(x, heightAt(x, z) - 0.05, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * Math.PI, 0)),
      new THREE.Vector3(s, s * (0.7 + r() * 0.8), s)));
    col.setHSL(0.19 + r() * 0.08, 0.35 + r() * 0.2, 0.34 + r() * 0.18);
    inst.setColorAt(n, col);
    n++;
  }
  inst.count = n;
  inst.receiveShadow = true;
  return inst;
}
