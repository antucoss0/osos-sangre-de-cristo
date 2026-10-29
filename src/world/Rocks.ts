import * as THREE from 'three';
import { mulberry32, fbm2, GLSL_NOISE } from '../core/noise';
import { heightAt, lakeDist, talusMask, normalAt } from './Terrain';

function boulderGeometry(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position as THREE.BufferAttribute;
  const r = mulberry32(seed);
  const ox = r() * 100, oy = r() * 100;
  // angular talus block: flatten faces via plane clipping + noise
  const planes = Array.from({ length: 7 }, () =>
    new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize());
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    for (const pl of planes) {
      const d = v.dot(pl);
      if (d > 0.62) v.addScaledVector(pl, -(d - 0.62) * 0.9);
    }
    v.multiplyScalar(1 + fbm2(v.x * 2 + ox, v.y * 2 + v.z + oy, 3) * 0.12);
    v.y *= 0.62;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

export const rockUniforms = { uTime: { value: 0 }, uFlash: { value: 0 } };

export function rockMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: false });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, rockUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRP; varying vec3 vRN;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          mat4 rM = modelMatrix * instanceMatrix;
        #else
          mat4 rM = modelMatrix;
        #endif
        vRP = (rM * vec4(position,1.0)).xyz; vRN = normalize(mat3(rM)*normal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRP; varying vec3 vRN; ${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 ap = vRP*0.9;
        float n = fbm(ap.xz + ap.y) ;
        float n2 = snoise(ap.xy*3.0 + ap.z*2.0);
        vec3 base = mix(vec3(0.33,0.33,0.31), vec3(0.52,0.51,0.46), n*0.5+0.5);
        base = mix(base, vec3(0.22,0.24,0.25), smoothstep(0.3,0.8,n2)*0.4);
        // yellow-green map lichen like the reference photo, mostly on top faces
        float lich = smoothstep(0.15, 0.55, fbm(ap.xz*2.3 + 9.0)) * smoothstep(-0.2, 0.6, vRN.y);
        base = mix(base, vec3(0.60,0.64,0.30), lich*0.7);
        base = mix(base, vec3(0.70,0.45,0.30), smoothstep(0.55,0.85,fbm(ap.zy*1.6-4.0))*0.35);
        float ao = smoothstep(-0.6, 0.6, vRN.y)*0.35+0.65;
        diffuseColor.rgb = base*ao;`);
  };
  return mat;
}

export function createTalus(count = 2600) {
  const group = new THREE.Group();
  const mat = rockMaterial();
  const geos = [boulderGeometry(1), boulderGeometry(2), boulderGeometry(3), boulderGeometry(4)];
  const r = mulberry32(17);
  const lists: THREE.Matrix4[][] = geos.map(() => []);
  const colliders: { x: number; z: number; r: number }[] = [];
  const nrm = new THREE.Vector3();
  let placed = 0;
  for (let i = 0; i < count * 6 && placed < count; i++) {
    const x = (r() - 0.5) * 380, z = (r() - 0.5) * 380;
    const t = talusMask(x, z);
    const ld = lakeDist(x, z);
    const shoreBand = ld > 0.9 && ld < 1.25 ? 0.9 : 0;
    const p = Math.max(t, shoreBand);
    if (r() > p * p) continue;
    const big = r() < 0.08;
    const s = big ? 1.4 + r() * 2.2 : 0.25 + Math.pow(r(), 2) * 1.2;
    normalAt(x, z, nrm);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.6, r() * 6.28, (r() - 0.5) * 0.6)));
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, heightAt(x, z) + s * 0.15 - (ld < 1.0 ? 0.3 : 0), z), q,
      new THREE.Vector3(s * (0.8 + r() * 0.5), s, s * (0.8 + r() * 0.5)));
    lists[Math.floor(r() * geos.length)].push(m);
    if (s > 0.9) colliders.push({ x, z, r: s * 0.9 });
    placed++;
  }
  geos.forEach((g, i) => {
    const im = new THREE.InstancedMesh(g, mat, lists[i].length);
    lists[i].forEach((m, k) => im.setMatrixAt(k, m));
    im.castShadow = true; im.receiveShadow = true;
    group.add(im);
  });
  return { group, colliders, material: mat, geos };
}
