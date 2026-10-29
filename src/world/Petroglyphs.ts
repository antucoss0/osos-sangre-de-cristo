import * as THREE from 'three';
import { mulberry32 } from '../core/noise';
import { heightAt, normalAt } from './Terrain';
import { rockMaterial } from './Rocks';

type Draw = (g: CanvasRenderingContext2D, s: number) => void;

const glyphs: Draw[] = [
  // spiral of the sanctuary
  (g, s) => {
    g.beginPath();
    for (let a = 0; a < Math.PI * 9; a += 0.05) {
      const r = a * s * 0.016;
      g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r);
    }
    g.stroke();
  },
  // bear paw
  (g, s) => {
    g.beginPath(); g.ellipse(s / 2, s * 0.6, s * 0.17, s * 0.14, 0, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.15 + i * 0.175);
      g.beginPath(); g.arc(s / 2 + Math.cos(a) * s * 0.26, s * 0.6 + Math.sin(a) * s * 0.24, s * 0.04, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(s / 2 + Math.cos(a) * s * 0.3, s * 0.6 + Math.sin(a) * s * 0.28);
      g.lineTo(s / 2 + Math.cos(a) * s * 0.36, s * 0.6 + Math.sin(a) * s * 0.34); g.stroke();
    }
  },
  // two figures and a bear (the journey)
  (g, s) => {
    const fig = (x: number, y: number, k: number) => {
      g.beginPath(); g.arc(x, y - k * 0.5, k * 0.1, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x, y - k * 0.4); g.lineTo(x, y); g.lineTo(x - k * 0.15, y + k * 0.35);
      g.moveTo(x, y); g.lineTo(x + k * 0.15, y + k * 0.35);
      g.moveTo(x - k * 0.22, y - k * 0.3); g.lineTo(x + k * 0.22, y - k * 0.2); g.stroke();
    };
    fig(s * 0.22, s * 0.55, s * 0.4); fig(s * 0.36, s * 0.58, s * 0.34);
    g.beginPath();
    g.moveTo(s * 0.52, s * 0.62); g.quadraticCurveTo(s * 0.62, s * 0.4, s * 0.8, s * 0.48);
    g.quadraticCurveTo(s * 0.9, s * 0.5, s * 0.88, s * 0.62);
    g.moveTo(s * 0.56, s * 0.62); g.lineTo(s * 0.56, s * 0.74); g.moveTo(s * 0.66, s * 0.6); g.lineTo(s * 0.66, s * 0.74);
    g.moveTo(s * 0.76, s * 0.6); g.lineTo(s * 0.76, s * 0.74); g.moveTo(s * 0.86, s * 0.6); g.lineTo(s * 0.86, s * 0.74);
    g.stroke();
    g.beginPath(); g.arc(s * 0.5, s * 0.2, s * 0.07, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath(); g.moveTo(s * 0.5 + Math.cos(a) * s * 0.1, s * 0.2 + Math.sin(a) * s * 0.1);
      g.lineTo(s * 0.5 + Math.cos(a) * s * 0.15, s * 0.2 + Math.sin(a) * s * 0.15); g.stroke();
    }
  },
  // eye — the duel foretold
  (g, s) => {
    g.beginPath(); g.moveTo(s * 0.12, s / 2); g.quadraticCurveTo(s / 2, s * 0.12, s * 0.88, s / 2);
    g.quadraticCurveTo(s / 2, s * 0.88, s * 0.12, s / 2); g.stroke();
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.13, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.04, 0, Math.PI * 2); g.fill();
  },
];

function glyphTexture(i: number) {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.lineWidth = s * 0.028; g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = '#fff'; g.shadowBlur = 6;
  glyphs[i % glyphs.length](g, s);
  // pecked texture: random gaps like ancient carving
  const r = mulberry32(i + 1);
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 2500; k++) {
    g.beginPath(); g.arc(r() * s, r() * s, 1 + r() * 2.5, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export interface Glyph {
  mesh: THREE.Mesh;
  face: THREE.Mesh;
  center: THREE.Vector3;
  glow: number;
  charge: number;
  awakened: boolean;
  mat: THREE.ShaderMaterial;
}

export class Petroglyphs {
  group = new THREE.Group();
  items: Glyph[] = [];
  private ray = new THREE.Vector3();
  constructor(points: { x: number; z: number; face: number }[]) {
    const rockMat = rockMaterial();
    points.forEach((p, i) => {
      const geo = new THREE.BoxGeometry(2.6, 2.0, 1.2, 6, 6, 3);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const r = mulberry32(i * 13 + 5);
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
        const n = 1 + (r() - 0.5) * 0.08;
        pos.setXYZ(k, x * n * (1 - Math.max(0, y) * 0.12), y * n, z < 0 ? z * n * 1.3 : z * (0.98 + r() * 0.02));
      }
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, rockMat);
      const h = heightAt(p.x, p.z);
      rock.position.set(p.x, h + 0.75, p.z);
      rock.rotation.y = p.face;
      const n = normalAt(p.x, p.z);
      rock.rotation.x = -n.z * 0.3;
      rock.castShadow = rock.receiveShadow = true;
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uMap: { value: glyphTexture(i) }, uGlow: { value: 0 }, uTime: { value: 0 }, uBase: { value: 0.18 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform sampler2D uMap; uniform float uGlow; uniform float uTime; uniform float uBase; varying vec2 vUv;
          void main(){
            float m = texture2D(uMap, vUv).r;
            float m2 = texture2D(uMap, vUv + vec2(0.004)).r;
            float halo = (texture2D(uMap, vUv+vec2(0.012,0.0)).r + texture2D(uMap, vUv-vec2(0.012,0.0)).r + texture2D(uMap, vUv+vec2(0.0,0.012)).r + texture2D(uMap, vUv-vec2(0.0,0.012)).r)*0.25;
            vec3 ochre = vec3(0.85,0.55,0.35)*m*uBase;
            float pulse = 0.75 + 0.25*sin(uTime*2.4 + vUv.x*6.0);
            vec3 glow = mix(vec3(1.0,0.55,0.2), vec3(0.4,0.9,1.0), 0.5+0.5*sin(uTime*0.7)) * (m*2.6 + halo*1.2) * uGlow * pulse;
            gl_FragColor = vec4(ochre + glow - m2*0.04, 1.0);
          }`,
      });
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.5), mat);
      face.position.set(0, 0.05, 0.62);
      rock.add(face);
      this.group.add(rock);
      this.items.push({ mesh: rock, face, center: new THREE.Vector3(p.x, h + 0.8, p.z), glow: 0, charge: 0, awakened: false, mat });
    });
  }
  /** returns index of glyph that awakened this frame or -1 */
  update(camera: THREE.Camera, dt: number, time: number, playerPos: THREE.Vector3) {
    let woke = -1;
    camera.getWorldDirection(this.ray);
    this.items.forEach((g, i) => {
      g.mat.uniforms.uTime.value = time;
      const toG = g.center.clone().sub(camera.position);
      const dist = playerPos.distanceTo(g.center);
      const ang = this.ray.angleTo(toG.normalize());
      const looking = dist < 9 && ang < 0.3;
      if (!g.awakened) {
        g.charge = Math.max(0, g.charge + (looking ? dt / 1.6 : -dt));
        if (g.charge >= 1) { g.awakened = true; woke = i; }
      }
      const target = g.awakened ? 1 : g.charge * 0.6 + (dist < 14 ? 0.08 : 0);
      g.glow += (target - g.glow) * (1 - Math.exp(-3 * dt));
      g.mat.uniforms.uGlow.value = g.glow;
    });
    return woke;
  }
}
