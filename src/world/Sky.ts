import * as THREE from 'three';
import { GLSL_NOISE } from '../core/noise';

// Physically-inspired sky dome with overcast fbm clouds, sun glow and night stars.
export function createSky() {
  const uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.4, 0.25, -0.6).normalize() },
    uNight: { value: 0 },
    uCloud: { value: 0.75 },
    uZenith: { value: new THREE.Color(0x4f5d6e) },
    uHorizon: { value: new THREE.Color(0xb9bfc2) },
    uSunColor: { value: new THREE.Color(0xffd6a0) },
    uPsy: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uNight, uCloud, uPsy; uniform vec3 uSunDir, uZenith, uHorizon, uSunColor; varying vec3 vDir;
      ${GLSL_NOISE}
      float star(vec3 d, float scale, float thr){
        vec3 p = d*scale; vec3 i = floor(p); vec3 f = fract(p)-0.5;
        float h = hash12(i.xy + i.z*17.13);
        float s = smoothstep(thr, 1.0, h);
        float tw = 0.6 + 0.4*sin(uTime*2.0 + h*80.0);
        return s * smoothstep(0.5, 0.0, length(f)) * tw;
      }
      void main(){
        vec3 d = normalize(vDir);
        float hgt = clamp(d.y, -0.2, 1.0);
        vec3 day = mix(uHorizon, uZenith, pow(max(hgt,0.0), 0.55));
        float sd = max(dot(d, uSunDir), 0.0);
        day += uSunColor * (pow(sd, 6.0)*0.35 + pow(sd, 64.0)*0.8);
        // overcast clouds projected on a plane
        vec2 cp = d.xz / max(d.y + 0.12, 0.05);
        float c = fbm(cp*0.6 + vec2(uTime*0.006, uTime*0.003));
        c += 0.5*fbm(cp*1.7 - vec2(uTime*0.01, 0.0));
        float cov = smoothstep(0.15 - uCloud*0.6, 0.75, c*0.5+0.5);
        vec3 cloudCol = mix(vec3(0.42,0.45,0.50), vec3(0.86,0.86,0.86), smoothstep(0.2,0.9,c*0.5+0.6));
        cloudCol += uSunColor * pow(sd, 4.0) * 0.35;
        day = mix(day, cloudCol, cov * smoothstep(-0.02, 0.18, d.y) * uCloud);
        // night
        vec3 night = mix(vec3(0.010,0.014,0.030), vec3(0.002,0.004,0.012), pow(max(hgt,0.0),0.4));
        float mw = exp(-pow(dot(d, normalize(vec3(0.3,0.6,-0.74)))*3.2, 2.0));
        float mwn = fbm(d.xy*6.0 + d.z*3.0)*0.5+0.5;
        night += vec3(0.10,0.11,0.16) * mw * mwn * 0.55;
        float st = star(d, 380.0, 0.985)*1.4 + star(d, 160.0, 0.992)*2.2 + star(d, 700.0, 0.975)*0.6;
        night += vec3(st) * smoothstep(0.0, 0.15, d.y) * vec3(0.9,0.95,1.0);
        vec3 col = mix(day, night, uNight);
        vec3 psy = 0.5+0.5*cos(6.2831*(vec3(0.0,0.33,0.67) + c*0.8 + uTime*0.03));
        col = mix(col, col*psy*1.5, uPsy*0.35);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

// Distant Sangre de Cristo ridgeline ring
export function createMountains() {
  const group = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uFog: { value: new THREE.Color(0x9aa3a8) },
      uNight: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.4, 0.25, -0.6).normalize() },
    },
    vertexShader: /* glsl */ `varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uFog; uniform float uNight; uniform vec3 uSunDir; varying vec3 vW; varying vec3 vN;
      ${GLSL_NOISE}
      void main(){
        float n = fbm(vW.xz*0.01);
        vec3 rock = mix(vec3(0.30,0.31,0.30), vec3(0.42,0.40,0.36), n*0.5+0.5);
        vec3 forest = vec3(0.10,0.15,0.10);
        float tree = smoothstep(170.0, 120.0, vW.y + n*30.0);
        vec3 col = mix(rock, forest, tree);
        float snow = smoothstep(0.55,0.85, vN.y) * smoothstep(230.0, 270.0, vW.y + n*40.0);
        col = mix(col, vec3(0.85,0.87,0.9), snow);
        float l = max(dot(vN, uSunDir), 0.0)*0.7 + 0.35;
        col *= l;
        float d = length(vW.xz);
        float a = smoothstep(350.0, 900.0, d)*0.75 + 0.15;
        col = mix(col, uFog, a);
        col = mix(col, vec3(0.012,0.016,0.03), uNight*0.92);
        gl_FragColor = vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const segs = 220;
  const geo = new THREE.CylinderGeometry(620, 620, 1, segs, 24, true);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i) + 0.5; // 0..1
    const a = Math.atan2(z, x);
    let ridge = 0;
    let amp = 1, f = 1;
    for (let o = 0; o < 6; o++) {
      ridge += amp * (1 - Math.abs(Math.sin(a * 3 * f + o * 1.7 + Math.sin(a * 2 * f + o) * 0.8)));
      amp *= 0.5; f *= 2.1;
    }
    // taller to the north (behind the lake), lower to the south valley
    const north = 0.5 + 0.5 * Math.sin(-a);
    const height = 90 + ridge * 120 * (0.45 + 0.75 * north);
    const r = 620 - y * 120 + Math.sin(a * 7) * 20;
    pos.setXYZ(i, Math.cos(a) * r, y * height - 10, Math.sin(a) * r);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  group.add(m);
  return { group, material: mat };
}
