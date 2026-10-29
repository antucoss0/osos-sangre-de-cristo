/** Fully procedural spatial-ish soundscape built on WebAudio (no external files). */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private lakeGain!: GainNode;
  private cricketGain!: GainNode;
  private padGain!: GainNode;
  private padFilter!: BiquadFilterNode;
  private tensionGain!: GainNode;
  private psyGain!: GainNode;
  private heartTimer = 0;
  private birdTimer = 2;
  heartRate = 0;
  night = 0;
  tension = 0;
  psy = 0;
  volumes = { master: 0.85, music: 0.7, sfx: 0.9 };

  init() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    const rev = this.makeReverb(3.4);
    const revGain = ctx.createGain(); revGain.gain.value = 0.35;
    rev.connect(revGain).connect(this.master);
    this.music = ctx.createGain(); this.music.connect(this.master); this.music.connect(rev);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master); this.sfx.connect(rev);
    this.amb = ctx.createGain(); this.amb.connect(this.master);
    this.applyVolumes();
    const len = ctx.sampleRate * 4;
    this.noise = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = this.noise.getChannelData(c);
      let b = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.985 * b + 0.015 * w * 6; d[i] = w * 0.4 + b * 0.6; }
    }
    // wind through conifers
    const wind = this.loopNoise();
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.18;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.amb);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 260;
    lfo.connect(lfoG).connect(this.windFilter.frequency); lfo.start();
    // lake lapping
    const lake = this.loopNoise();
    const lf = ctx.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 380;
    this.lakeGain = ctx.createGain(); this.lakeGain.gain.value = 0.05;
    const lap = ctx.createOscillator(); lap.frequency.value = 0.3;
    const lapG = ctx.createGain(); lapG.gain.value = 0.03;
    lap.connect(lapG).connect(this.lakeGain.gain); lap.start();
    lake.connect(lf).connect(this.lakeGain).connect(this.amb);
    // crickets (night)
    this.cricketGain = ctx.createGain(); this.cricketGain.gain.value = 0;
    const cr = ctx.createOscillator(); cr.type = 'square'; cr.frequency.value = 4300;
    const crAm = ctx.createOscillator(); crAm.frequency.value = 28;
    const crAmG = ctx.createGain(); crAmG.gain.value = 0.5;
    const crG = ctx.createGain(); crG.gain.value = 0.5;
    crAm.connect(crAmG).connect(crG.gain);
    const crHp = ctx.createBiquadFilter(); crHp.type = 'highpass'; crHp.frequency.value = 3500;
    cr.connect(crG).connect(crHp).connect(this.cricketGain).connect(this.amb);
    cr.start(); crAm.start();
    // cinematic pad: D minor add9 drone
    this.padFilter = ctx.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 900; this.padFilter.Q.value = 0.7;
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0.0;
    this.padFilter.connect(this.padGain).connect(this.music);
    for (const f of [73.42, 110, 146.83, 174.61, 220, 329.63]) {
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const g = ctx.createGain(); g.gain.value = 0.022;
        o.connect(g).connect(this.padFilter); o.start();
      }
    }
    // tension: low cluster with slow beating
    this.tensionGain = ctx.createGain(); this.tensionGain.gain.value = 0;
    for (const f of [41.2, 43.65, 61.7]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.18;
      o.connect(g).connect(this.tensionGain); o.start();
    }
    this.tensionGain.connect(this.music);
    // psychedelic shimmer
    this.psyGain = ctx.createGain(); this.psyGain.gain.value = 0;
    for (const f of [880, 1318.5, 1760]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const vib = ctx.createOscillator(); vib.frequency.value = 0.2 + Math.random() * 0.3;
      const vg = ctx.createGain(); vg.gain.value = f * 0.01;
      vib.connect(vg).connect(o.frequency); vib.start();
      const g = ctx.createGain(); g.gain.value = 0.02;
      o.connect(g).connect(this.psyGain); o.start();
    }
    this.psyGain.connect(this.music);
  }
  private makeReverb(sec: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * sec;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = ctx.createConvolver(); conv.buffer = buf;
    return conv;
  }
  private loopNoise() {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 3);
    return s;
  }
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.music.gain.value = this.volumes.music;
    this.sfx.gain.value = this.volumes.sfx;
  }
  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private burst(dur: number, type: BiquadFilterType, freq: number, q: number, peak: number, pan = 0, attack = 0.005, out?: AudioNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(out ?? this.sfx);
    this.env(g, t, attack, peak, dur);
    s.start(t, Math.random() * 3, attack + dur + 0.1);
    return f;
  }
  step(run: boolean, surface = 0.5) {
    if (!this.ctx) return;
    this.burst(run ? 0.12 : 0.16, 'bandpass', 900 + surface * 1800 + Math.random() * 400, 1.2, run ? 0.35 : 0.22, (Math.random() - 0.5) * 0.2);
    this.burst(0.08, 'lowpass', 200, 1, 0.25);
  }
  bearStep(dist: number) {
    if (!this.ctx) return;
    const v = Math.max(0, 1 - dist / 30);
    this.burst(0.25, 'lowpass', 140, 1, 0.5 * v + 0.001);
  }
  heartbeat(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [dt, a] of [[0, 1], [0.24, 0.7]] as const) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(62, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.18);
      const g = ctx.createGain(); this.env(g, t + dt, 0.01, 0.9 * a * strength, 0.22);
      o.connect(g).connect(this.sfx); o.start(t + dt); o.stop(t + dt + 0.35);
    }
  }
  growl(dist = 5, intensity = 0.6) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const v = Math.max(0.05, 1 - dist / 40) * intensity;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(58, t); o.frequency.linearRampToValueAtTime(48, t + 1.4);
    const am = ctx.createOscillator(); am.frequency.value = 23;
    const amg = ctx.createGain(); amg.gain.value = 0.5;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 4;
    am.connect(amg).connect(g.gain);
    o.connect(f).connect(g).connect(this.sfx);
    this.env(g, t, 0.25, 0.55 * v, 1.3);
    o.start(t); am.start(t); o.stop(t + 1.8); am.stop(t + 1.8);
    this.burst(1.2, 'bandpass', 300, 2, 0.25 * v, 0, 0.2);
  }
  huff(dist = 5) {
    if (!this.ctx) return;
    const v = Math.max(0.05, 1 - dist / 40);
    this.burst(0.35, 'bandpass', 700, 0.8, 0.5 * v, 0, 0.02);
    setTimeout(() => this.burst(0.3, 'bandpass', 600, 0.8, 0.4 * v, 0, 0.02), 380);
  }
  sniff() {
    if (!this.ctx) return;
    for (let i = 0; i < 4; i++) setTimeout(() => this.burst(0.09, 'highpass', 2200, 1, 0.12), i * 160);
  }
  roar(dist = 5) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const v = Math.max(0.1, 1 - dist / 50);
    for (const [f0, det] of [[95, 0], [142, 12], [71, -8]] as const) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
      o.frequency.setValueAtTime(f0 * 0.8, t); o.frequency.linearRampToValueAtTime(f0 * 1.25, t + 0.5); o.frequency.linearRampToValueAtTime(f0 * 0.7, t + 2.2);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(900, t + 0.6); f.frequency.linearRampToValueAtTime(350, t + 2.2); f.Q.value = 1.5;
      const g = ctx.createGain(); this.env(g, t, 0.15, 0.5 * v, 2.2);
      o.connect(f).connect(g).connect(this.sfx); o.start(t); o.stop(t + 2.6);
    }
    this.burst(2.2, 'bandpass', 900, 0.7, 0.7 * v, 0, 0.12);
    this.burst(1.5, 'lowpass', 90, 1, 0.8 * v, 0, 0.05);
  }
  flash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.burst(0.04, 'highpass', 3000, 1, 0.5);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(2200, t + 0.05); o.frequency.exponentialRampToValueAtTime(7800, t + 1.4);
    const g = ctx.createGain(); this.env(g, t + 0.05, 0.05, 0.03, 1.4);
    o.connect(g).connect(this.sfx); o.start(t + 0.05); o.stop(t + 1.6);
  }
  whoosh(dur = 1.5) {
    if (!this.ctx) return;
    const f = this.burst(dur, 'bandpass', 300, 0.8, 0.6, 0, dur * 0.5);
    f.frequency.exponentialRampToValueAtTime(2400, this.ctx.currentTime + dur);
  }
  impact() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 1.5);
    const g = ctx.createGain(); this.env(g, t, 0.01, 1.0, 1.8);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 2);
    this.burst(0.6, 'lowpass', 600, 0.7, 0.6);
  }
  sting() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const f of [146.83, 220, 293.66, 440]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); this.env(g, t, 0.6, 0.06, 4.5);
      o.connect(g).connect(this.music); o.start(t); o.stop(t + 5.5);
    }
    this.impact();
  }
  chime() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [659.25, 987.77, 1318.5].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ctx.createGain(); this.env(g, t + i * 0.12, 0.01, 0.08, 2.5);
      o.connect(g).connect(this.music); o.start(t + i * 0.12); o.stop(t + 3);
    });
  }
  private bird() {
    const ctx = this.ctx!, t = ctx.currentTime;
    const base = 2600 + Math.random() * 2200;
    const n = 2 + Math.floor(Math.random() * 4);
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1;
    pan.connect(this.amb);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(); o.type = 'sine';
      const st = t + i * 0.13;
      o.frequency.setValueAtTime(base, st); o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.7), st + 0.09);
      const g = ctx.createGain(); this.env(g, st, 0.01, 0.03, 0.09);
      o.connect(g).connect(pan); o.start(st); o.stop(st + 0.15);
    }
  }
  update(dt: number) {
    if (!this.ctx) return;
    const k = 1 - Math.exp(-1.2 * dt);
    const lerpParam = (p: AudioParam, v: number) => { p.value += (v - p.value) * k; };
    lerpParam(this.windGain.gain, 0.16 + this.tension * 0.05 + this.night * 0.04);
    lerpParam(this.cricketGain.gain, this.night * 0.012);
    lerpParam(this.padGain.gain, 0.35 + this.night * 0.15 - this.tension * 0.2);
    lerpParam(this.padFilter.frequency, 500 + (1 - this.night) * 700 + this.psy * 1500);
    lerpParam(this.tensionGain.gain, this.tension * 0.5);
    lerpParam(this.psyGain.gain, this.psy * 0.8);
    lerpParam(this.lakeGain.gain, 0.05);
    if (this.heartRate > 0) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) { this.heartbeat(Math.min(1, 0.4 + this.tension)); this.heartTimer = 60 / this.heartRate; }
    }
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      if (this.night < 0.4 && this.tension < 0.3) this.bird();
      this.birdTimer = 2 + Math.random() * 6;
    }
  }
}
