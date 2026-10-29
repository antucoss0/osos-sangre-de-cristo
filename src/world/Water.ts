import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { GLSL_NOISE } from '../core/noise';
import { LAKE, WATER_Y } from './Terrain';

const WaterShader = {
  name: 'LakeWaterShader',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(0x0b1a12) },
    uShallow: { value: new THREE.Color(0x24402a) },
    uSky: { value: new THREE.Color(0x8a96a3) },
    uFogColor: { value: new THREE.Color(0x9aa3a8) },
    uFogDensity: { value: 0.006 },
    uCam: { value: new THREE.Vector3() },
    uRipple: { value: 0 },
    uRipplePos: { value: new THREE.Vector2() },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv; varying vec3 vW;
    void main(){
      vUv = textureMatrix * vec4(position,1.0);
      vW = (modelMatrix*vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky;
    uniform vec3 uFogColor; uniform float uFogDensity; uniform vec3 uCam; uniform float uRipple; uniform vec2 uRipplePos;
    varying vec4 vUv; varying vec3 vW;
    ${GLSL_NOISE}
    void main(){
      vec2 p = vW.xz;
      float t = uTime;
      vec2 d = vec2(snoise(p*0.35+vec2(t*0.05,t*0.03)), snoise(p*0.35+vec2(-t*0.04,t*0.06)+7.0))*0.6
             + vec2(snoise(p*1.6+t*0.2), snoise(p*1.6-t*0.17+3.0))*0.25;
      float rd = length(p-uRipplePos);
      d += vec2(sin(rd*6.0-t*6.0))*exp(-rd*0.25)*uRipple*0.8;
      vec3 V = normalize(uCam - vW);
      float fres = 0.04 + 0.96*pow(1.0-max(V.y,0.0), 5.0);
      vec4 uv = vUv; uv.xy += d*0.9;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      float depthK = smoothstep(0.0, 1.0, length(p - vec2(${LAKE.x.toFixed(1)}, ${LAKE.z.toFixed(1)}))/${LAKE.r.toFixed(1)});
      vec3 body = mix(uDeep, uShallow, depthK*0.7);
      vec3 col = mix(body, refl, clamp(0.55 + fres*0.45, 0.0, 1.0));
      col += pow(max(0.0, snoise(p*3.0+t*0.4)), 6.0)*0.04;
      float dist = length(uCam - vW);
      float fog = 1.0 - exp(-pow(uFogDensity*dist, 2.0));
      col = mix(col, uFogColor, fog);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function createWater(resScale = 0.5) {
  const geo = new THREE.CircleGeometry(LAKE.r * 1.6, 96);
  const w = Math.floor(window.innerWidth * resScale * window.devicePixelRatio);
  const h = Math.floor(window.innerHeight * resScale * window.devicePixelRatio);
  const water = new Reflector(geo, {
    textureWidth: w,
    textureHeight: h,
    clipBias: 0.003,
    shader: WaterShader,
  }) as Reflector & { material: THREE.ShaderMaterial };
  water.rotation.x = -Math.PI / 2;
  water.position.set(LAKE.x, WATER_Y, LAKE.z);
  water.scale.set(1, 0.74, 1);
  const u = (water.material as THREE.ShaderMaterial).uniforms;
  return { water, uniforms: u };
}
