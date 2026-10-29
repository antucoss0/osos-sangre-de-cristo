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
}

export const QUALITY: Record<QualityLevel, Quality> = {
  low: { level: 'low', pixelRatio: 0.75, shadow: 1024, grass: 12000, trees: 0.45, rocks: 900, water: 0.3, dof: false, terrainSeg: 200 },
  medium: { level: 'medium', pixelRatio: 1, shadow: 2048, grass: 35000, trees: 0.75, rocks: 1800, water: 0.45, dof: true, terrainSeg: 280 },
  high: { level: 'high', pixelRatio: 1.5, shadow: 4096, grass: 70000, trees: 1, rocks: 2600, water: 0.6, dof: true, terrainSeg: 360 },
};

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
  constructor(canvas: HTMLCanvasElement, public quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * quality.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    this.composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
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
    this.composer.render(dt);
  }
}
