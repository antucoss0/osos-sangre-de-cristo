import { Effect, EffectAttribute, BlendFunction } from 'postprocessing';
import { Uniform } from 'three';

const frag = /* glsl */ `
uniform float uTime;
uniform float uLetterbox;
uniform float uFade;
uniform float uFlash;
uniform float uPsy;
uniform float uAberration;
uniform float uRadialBlur;
uniform float uVignette;
uniform float uGrain;
uniform float uBlink;
uniform float uWarm;
uniform float uDesat;
uniform float uEdge;
uniform float uHeart;
uniform float uExposure;

float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }

vec3 hueShift(vec3 c, float a){
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c*ca + cross(k, c)*sin(a) + k*dot(k, c)*(1.0-ca);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 c = uv - 0.5;
  float r = length(c * vec2(resolution.x/resolution.y, 1.0));
  vec2 duv = uv;
  duv += uPsy * 0.005 * vec2(sin(uv.y*16.0 + uTime*1.2), cos(uv.x*12.0 + uTime*0.9));
  float ab = (uAberration*(0.4 + r*1.6) + uPsy*0.8) * 0.0035;
  vec3 col;
  col.r = texture2D(inputBuffer, duv + c*ab).r;
  col.g = texture2D(inputBuffer, duv).g;
  col.b = texture2D(inputBuffer, duv - c*ab).b;
  if (uRadialBlur > 0.001) {
    vec3 acc = col;
    for (int i = 1; i < 12; i++) {
      float s = 1.0 - float(i) * uRadialBlur * 0.01;
      acc += texture2D(inputBuffer, 0.5 + (duv - 0.5) * s).rgb;
    }
    col = acc / 12.0;
  }
  col *= uExposure;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // cinematic split-tone: cool shadows, warm highlights
  vec3 shadowTint = vec3(0.90, 0.98, 1.06);
  vec3 highTint = vec3(1.05, 1.0, 0.93);
  col *= mix(shadowTint, highTint, smoothstep(0.05, 0.7, l));
  col = mix(vec3(l), col, 1.15 - uDesat);
  col *= mix(vec3(1.0), vec3(1.08, 0.98, 0.86), uWarm);
  if (uPsy > 0.001) {
    vec3 shifted = hueShift(col, uPsy * (sin(uTime*0.4 + l*6.0) * 1.4));
    col = mix(col, shifted * (1.0 + 0.25*uPsy), uPsy * 0.65);
  }
  col *= mix(1.0, smoothstep(1.05, 0.2, r), uVignette);
  float beat = pow(max(0.0, sin(uTime * uHeart)), 8.0);
  col = mix(col, vec3(0.35, 0.0, 0.01), uEdge * smoothstep(0.35, 0.85, r) * (0.55 + 0.45 * beat));
  col += (h12(uv * resolution + fract(uTime * 7.31) * 517.0) - 0.5) * uGrain;
  col = mix(col, vec3(1.0, 0.98, 0.95), uFlash);
  float lid = (1.0 - uBlink) * 0.6;
  col *= smoothstep(lid, lid - 0.08, abs(c.y)) ;
  col *= 1.0 - uFade;
  float bar = uLetterbox * 0.115;
  col *= step(bar, uv.y) * step(uv.y, 1.0 - bar);
  outputColor = vec4(max(col, 0.0), inputColor.a);
}
`;

export class CinemaEffect extends Effect {
  constructor() {
    super('CinemaEffect', frag, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, Uniform>([
        ['uTime', new Uniform(0)],
        ['uLetterbox', new Uniform(0)],
        ['uFade', new Uniform(1)],
        ['uFlash', new Uniform(0)],
        ['uPsy', new Uniform(0)],
        ['uAberration', new Uniform(0.35)],
        ['uRadialBlur', new Uniform(0)],
        ['uVignette', new Uniform(0.85)],
        ['uGrain', new Uniform(0.035)],
        ['uBlink', new Uniform(0)],
        ['uWarm', new Uniform(0.15)],
        ['uDesat', new Uniform(0.05)],
        ['uEdge', new Uniform(0)],
        ['uHeart', new Uniform(6)],
        ['uExposure', new Uniform(1)],
      ]),
    });
  }
  u(name: string) {
    return this.uniforms.get(name)!;
  }
  set(name: string, v: number) {
    this.uniforms.get(name)!.value = v;
  }
  get(name: string): number {
    return this.uniforms.get(name)!.value;
  }
}
