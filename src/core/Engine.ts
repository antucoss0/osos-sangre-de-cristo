import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode,
  DepthOfFieldEffect, SMAAEffect, SMAAPreset,
} from 'postprocessing';
import { CinemaEffect } from '../fx/CinemaEffect';

export type QualityLevel = 'low' | 'medium' | 'high';
export interface Quality {
  level: QualityLevel;
  pixelRatio: number;
  shadow: number;
  grass: number;
  trees: number;
  rocks: number;
  water: number;
  dof: boolean;
  terrainSeg: number;
  smaa: boolean;
  softShadow: boolean;
  mobile: boolean;
}

export const QUALITY: Record<QualityLevel, Quality> = {
  low: { level: 'low', pixelRatio: 0.75, shadow: 1024, grass: 12000, trees: 0.45, rocks: 900, water: 0.3, dof: false, terrainSeg: 200, smaa: true, softShadow: true, mobile: false },
  medium: { level: 'medium', pixelRatio: 1, shadow: 2048, grass: 35000, trees: 0.75, rocks: 1800, water: 0.45, dof: true, terrainSeg: 280, smaa: true, softShadow: true, mobile: false },
  high: { level: 'high', pixelRatio: 1.5, shadow: 4096, grass: 70000, trees: 1, rocks: 2600, water: 0.6, dof: true, terrainSeg: 360, smaa: true, softShadow: true, mobile: false },
};

export function qualityFor(level: QualityLevel, touch: boolean): Quality {
  const q = { ...QUALITY[level] };
  if (!touch) return q;
  return {
    ...q,
    pixelRatio: q.pixelRatio * 0.75,
    shadow: Math.min(q.shadow, level === 'high' ? 2048 : 1024),
    grass: Math.round(q.grass * 0.35),
    trees: q.trees * 0.65,
    rocks: Math.round(q.rocks * 0.5),
    water: Math.min(q.water, 0.35),
    terrainSeg: Math.min(q.terrainSeg, level === 'high' ? 240 : 170),
    dof: level === 'high',
    smaa: level === 'high',
    softShadow: false,
    mobile: true,
  };
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  cinema = new CinemaEffect();
  bloom: BloomEffect;
  dof: DepthOfFieldEffect | null = null;
  dofPass: EffectPass | null = null;
  baseFov = 52;
  private baseRatio: number;
  private scale = 1;
  private fpsT = 0;
  private fpsN = 0;
  private lastT = performance.now();
  constructor(canvas: HTMLCanvasElement, public quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.baseRatio = Math.min(window.devicePixelRatio, 2) * quality.pixelRatio;
    this.renderer.setPixelRatio(this.baseRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = quality.softShadow ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, window.innerWidth / window.innerHeight, 0.08, 2400);
    this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new BloomEffect({ intensity: 0.7, luminanceThreshold: 0.72, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 });
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX });
    if (quality.dof) {
      this.dof = new DepthOfFieldEffect(this.camera, { focusDistance: 8, focusRange: 10, bokehScale: 2.2 });
      this.dofPass = new EffectPass(this.camera, this.dof);
      this.composer.addPass(this.dofPass);
    }
    this.composer.addPass(new EffectPass(this.camera, this.bloom, tone));
    if (quality.smaa) this.composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
    this.composer.addPass(new EffectPass(this.camera, this.cinema));
    window.addEventListener('resize', () => this.resize());
  }
  setFocus(distance: number, range: number, bokeh: number) {
    if (!this.dof) return;
    this.dof.cocMaterial.focusDistance = distance;
    this.dof.cocMaterial.focusRange = range;
    this.dof.bokehScale = bokeh;
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h, false);
  }
  render(dt: number) {
    this.adaptResolution();
    this.composer.render(dt);
  }
  private adaptResolution() {
    const now = performance.now();
    this.fpsT += now - this.lastT;
    this.lastT = now;
    this.fpsN++;
    if (this.fpsT < 2000) return;
    const fps = (this.fpsN * 1000) / this.fpsT;
    this.fpsT = 0;
    this.fpsN = 0;
    let s = this.scale;
    if (fps < 28) s = Math.max(0.5, s * 0.85);
    else if (fps > 52) s = Math.min(1, s * 1.1);
    if (Math.abs(s - this.scale) < 0.01) return;
    this.scale = s;
    this.renderer.setPixelRatio(this.baseRatio * s);
    this.resize();
  }
}
