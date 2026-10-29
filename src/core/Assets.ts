import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export interface Models {
  antu: GLTF;
  nairoby: GLTF;
  bear: GLTF;
}

const BASE = import.meta.env.BASE_URL;

export async function loadModels(onProgress: (p: number) => void): Promise<Models> {
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${BASE}draco/`);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const files = { antu: 'antu.glb', nairoby: 'nairoby.glb', bear: 'bear.glb' } as const;
  const sizes: Record<string, number> = { antu: 5.9e6, nairoby: 6.9e6, bear: 7.7e6 };
  const loaded: Record<string, number> = { antu: 0, nairoby: 0, bear: 0 };
  const total = () => Object.values(sizes).reduce((a, b) => a + b, 0);
  const report = () => onProgress(Object.values(loaded).reduce((a, b) => a + b, 0) / total());
  const entries = await Promise.all(
    (Object.keys(files) as (keyof typeof files)[]).map(
      (k) =>
        new Promise<[string, GLTF]>((res, rej) =>
          loader.load(
            `${BASE}models/${files[k]}`,
            (g) => {
              loaded[k] = sizes[k];
              report();
              res([k, g]);
            },
            (e) => {
              if (e.total) sizes[k] = e.total;
              loaded[k] = e.loaded;
              report();
            },
            rej,
          ),
        ),
    ),
  );
  const out = Object.fromEntries(entries) as unknown as Models;
  for (const g of Object.values(out)) prepare(g.scene);
  return out;
}

export function prepare(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const s = mat as THREE.MeshStandardMaterial;
      if (s.isMeshStandardMaterial) {
        s.envMapIntensity = 0.8;
        s.roughness = Math.max(s.roughness, 0.6);
        s.metalness = 0;
        if (s.map) s.map.anisotropy = 8;
      }
    }
  });
}
