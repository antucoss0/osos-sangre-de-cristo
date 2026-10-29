import * as THREE from 'three';

function softSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const sprite = softSprite();

/** Visible condensed breath puffs (Act IV night cold). */
export class Breath {
  points: THREE.Points;
  private n = 90;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private cursor = 0;
  private timer = 0;
  intensity = 0;
  constructor() {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.life = new Float32Array(this.n).fill(1);
    this.size = new Float32Array(this.n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('life', new THREE.BufferAttribute(this.life, 1));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uMap: { value: sprite }, uScale: { value: window.innerHeight } },
      vertexShader: `attribute float life; attribute float size; uniform float uScale; varying float vL;
        void main(){ vL=life; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize = size*(0.12+life*0.7)*uScale/(-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uMap; varying float vL; void main(){ float a = texture2D(uMap, gl_PointCoord).a * (1.0-vL) * 0.32; gl_FragColor = vec4(vec3(0.92,0.95,1.0), a); }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }
  update(dt: number, mouth: THREE.Vector3, forward: THREE.Vector3, rate = 3.2) {
    this.timer += dt;
    const phase = (this.timer % rate) / rate;
    if (this.intensity > 0.01 && phase < 0.28) {
      for (let k = 0; k < 2; k++) {
        const i = this.cursor++ % this.n;
        this.pos[i * 3] = mouth.x; this.pos[i * 3 + 1] = mouth.y; this.pos[i * 3 + 2] = mouth.z;
        this.vel[i * 3] = forward.x * 0.6 + (Math.random() - 0.5) * 0.15;
        this.vel[i * 3 + 1] = 0.08 + Math.random() * 0.1;
        this.vel[i * 3 + 2] = forward.z * 0.6 + (Math.random() - 0.5) * 0.15;
        this.life[i] = 0;
        this.size[i] = (0.25 + Math.random() * 0.25) * this.intensity;
      }
    }
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] >= 1) continue;
      this.life[i] = Math.min(1, this.life[i] + dt / 2.2);
      const drag = Math.exp(-1.6 * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.life.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
}

/** Floating dust / pollen motes in light shafts, become fireflies at night and color-shift in psychedelic phase. */
export class Motes {
  points: THREE.Points;
  uniforms = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uNight: { value: 0 }, uPsy: { value: 0 }, uScale: { value: window.innerHeight } };
  constructor(n = 1400) {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3), s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 60; p[i * 3 + 1] = Math.random() * 12; p[i * 3 + 2] = (Math.random() - 0.5) * 60;
      s[i] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { ...this.uniforms, uMap: { value: sprite } },
      vertexShader: `uniform float uTime; uniform vec3 uCenter; uniform float uScale; attribute float seed; varying float vS; varying float vA;
        void main(){
          vec3 p = position;
          p.x += sin(uTime*0.3 + seed*40.0)*2.0; p.y += sin(uTime*0.2 + seed*17.0)*1.2; p.z += cos(uTime*0.25 + seed*23.0)*2.0;
          p.xz = mod(p.xz - uCenter.xz + 30.0, 60.0) - 30.0 + uCenter.xz;
          p.y += uCenter.y - 1.0;
          vec4 mv = modelViewMatrix*vec4(p,1.0);
          vS = seed; vA = smoothstep(30.0, 6.0, length(mv.xyz));
          gl_PointSize = (0.04 + seed*0.05)*uScale/(-mv.z);
          gl_Position = projectionMatrix*mv;
        }`,
      fragmentShader: `uniform sampler2D uMap; uniform float uTime; uniform float uNight; uniform float uPsy; varying float vS; varying float vA;
        void main(){
          float a = texture2D(uMap, gl_PointCoord).a * vA;
          vec3 day = vec3(1.0,0.95,0.8)*0.25;
          float blink = pow(max(0.0, sin(uTime*1.5 + vS*60.0)), 6.0);
          vec3 fly = vec3(0.9,1.0,0.45) * blink * 2.0 * step(0.75, vS);
          vec3 psy = 0.6 + 0.4*cos(6.2831*(vec3(0.0,0.33,0.67) + vS + uTime*0.1));
          vec3 c = mix(day, fly, uNight);
          c = mix(c, psy*1.4, uPsy);
          gl_FragColor = vec4(c, a);
        }`,
    });
    this.uniforms = m.uniforms as typeof this.uniforms;
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }
}
