import * as THREE from 'three';
import { Engine, qualityFor } from '../core/Engine';
import { Input, isTouch } from '../core/Input';
import { TouchControls } from '../ui/TouchControls';
import { StateMachine } from '../core/FSM';
import { loadModels, type Models } from '../core/Assets';
import { World } from '../world/World';
import { heightAt } from '../world/Terrain';
import { Director, ease, type Shot } from '../cinema/Director';
import { UI } from '../ui/UI';
import { AudioEngine } from '../audio/AudioEngine';
import { Player } from './Player';
import { Companion } from './Companion';
import { Bear, type BearEvent } from './Bear';
import { Pack } from './Pack';
import { Breath } from '../fx/Particles';
import { clamp, perlin2 } from '../core/noise';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const G = (x: number, z: number, up = 0) => V(x, heightAt(x, z) + up, z);

const START = { x: 10, z: 150 };
const OVERLOOK = { x: -18, z: 54 };
const WAKE = { x: -30, z: 34 };
const BEAR_FROM = { x: -44, z: 37 };
const BEAR_EXIT = { x: -82, z: 6 };
const UMBRAL = { x: -6, z: 78 };

type FxKey = 'fade' | 'psy' | 'radial' | 'blink' | 'edge' | 'aberration' | 'desat' | 'flash' | 'warm' | 'vignette';

export class Game {
  engine: Engine;
  input: Input;
  ui: UI;
  audio = new AudioEngine();
  world!: World;
  director: Director;
  player!: Player;
  nai!: Companion;
  bear!: Bear;
  pack!: Pack;
  breath = new Breath();
  breath2 = new Breath();
  fsm!: StateMachine<Game>;
  time = 0;
  clock = new THREE.Clock();
  models!: Models;
  fx: Record<FxKey, { v: number; t: number; r: number }> = {
    fade: { v: 1, t: 1, r: 1.5 }, psy: { v: 0, t: 0, r: 0.6 }, radial: { v: 0, t: 0, r: 3 }, blink: { v: 0, t: 0, r: 10 },
    edge: { v: 0, t: 0, r: 2 }, aberration: { v: 0.35, t: 0.35, r: 2 }, desat: { v: 0.05, t: 0.05, r: 1 },
    flash: { v: 0, t: 0, r: 5 }, warm: { v: 0.15, t: 0.15, r: 0.5 }, vignette: { v: 0.85, t: 0.85, r: 1 },
  };
  tod = { v: 0, t: 0, speed: 0 };
  duel = { balance: 0, agitation: 0, lost: 0, strain: 0, blinkT: 0, over: false };
  flashCharge = 1;
  flashLight = new THREE.PointLight(0xfff4e6, 0, 70, 1.2);
  beacon = new THREE.Group();
  beaconLight = new THREE.PointLight(0xffb070, 0, 30, 1.5);
  paused = false;
  touchUI: TouchControls | null = null;
  private tmp = new THREE.Vector3();
  constructor() {
    const canvas = document.getElementById('gl') as HTMLCanvasElement;
    this.ui = new UI(document.getElementById('ui')!);
    this.engine = new Engine(canvas, qualityFor(this.ui.settings.quality, isTouch));
    this.input = new Input(canvas);
    if (this.input.touch) this.touchUI = new TouchControls(document.getElementById('ui')!, this.input);
    this.director = new Director(this.engine);
    this.applySettings();
    this.ui.onSettings = () => this.applySettings();
  }
  applySettings() {
    const s = this.ui.settings;
    this.audio.volumes = { master: s.master, music: s.music, sfx: s.sfx };
    this.audio.applyVolumes();
    this.input.sensitivity = s.sensitivity;
  }
  async boot() {
    this.ui.progress(0.02, 'Esculpiendo la montaña…');
    await new Promise((r) => setTimeout(r, 30));
    this.world = new World(this.engine.scene, this.engine.quality);
    this.ui.progress(0.15, 'Despertando a los osos…');
    this.models = await loadModels((p) => this.ui.progress(0.15 + p * 0.8, 'Despertando a los osos…'), this.engine.quality.mobile);
    const scene = this.engine.scene;
    this.player = new Player(this.models.antu, this.input, this.world.colliders, this.engine.camera);
    this.nai = new Companion(this.models.nairoby, this.player, this.world.colliders);
    this.bear = new Bear(this.models.bear, null);
    this.bear.onEvent = (e, b) => this.bearSound(e, b);
    this.pack = new Pack(this.models.bear, this.world.colliders, scene);
    this.pack.onEvent = (e, b) => this.bearSound(e, b);
    this.pack.onReveal = (b, n) => {
      this.ui.hint(`${n} / 10 · ${b.char.root.userData.cub ? 'Un cachorro' : 'Una madre'} te observa`, 3.5);
      this.audio.chime();
    };
    this.player.onStep = (run) => this.audio.step(run);
    scene.add(this.player.char.root, this.nai.char.root, this.bear.char.root, this.breath.points, this.breath2.points, this.flashLight, this.beacon);
    this.buildBeacon();
    this.ui.progress(0.97, 'Compilando la luz…');
    this.place(START, OVERLOOK);
    this.engine.renderer.compile(scene, this.engine.camera);
    this.fsm = new StateMachine<Game>(this, this.states(), 'Boot');
    this.ui.progress(1, 'Listo');
    this.ui.hideLoader();
    this.clock.start();
    this.engine.renderer.setAnimationLoop(() => this.loop());
    (window as unknown as { __game: Game }).__game = this;
    const act = new URLSearchParams(location.search).get('act');
    if (act !== null) { this.audio.init(); this.ui.hideLobby(); this.jump(parseInt(act)); }
    else this.fsm.go('Lobby');
  }
  private buildBeacon() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, 'rgba(255,190,120,0.9)'); gr.addColorStop(1, 'rgba(255,190,120,0)');
    g.fillStyle = gr;
    const hg = g.createRadialGradient(32, 128, 0, 32, 128, 32);
    g.fillRect(0, 0, 64, 256);
    void hg;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    sp.scale.set(1.2, 12, 1);
    sp.position.y = 6;
    this.beacon.add(sp, this.beaconLight);
    this.beaconLight.position.y = 1.5;
    this.beacon.position.copy(G(UMBRAL.x, UMBRAL.z));
    this.beacon.visible = false;
  }
  private place(p: { x: number; z: number }, toward: { x: number; z: number }) {
    const h = Math.atan2(toward.x - p.x, toward.z - p.z);
    this.player.place(p.x, p.z, h);
    this.nai.place(p.x - Math.cos(h) * 1.4 - Math.sin(h) * 1.2, p.z + Math.sin(h) * 1.4 - Math.cos(h) * 1.2, h);
  }
  private bearSound(e: BearEvent, b: Bear) {
    const d = b.position.distanceTo(this.engine.camera.position);
    if (e === 'roar') this.audio.roar(d);
    else if (e === 'huff') this.audio.huff(d);
    else if (e === 'growl') this.audio.growl(d, 0.4 + b.agitation);
    else if (e === 'step') this.audio.bearStep(d);
    else if (e === 'sniff') this.audio.sniff();
  }
  setFx(k: FxKey, t: number, r?: number, immediate = false) {
    this.fx[k].t = t;
    if (r !== undefined) this.fx[k].r = r;
    if (immediate) this.fx[k].v = t;
  }
  setTod(t: number, speed = 0) {
    this.tod.t = t;
    this.tod.speed = speed;
    if (!speed) { this.tod.v = t; this.world.setTimeOfDay(t); }
  }
  jump(act: number) {
    this.director.playing = false;
    this.ui.clearHUD();
    this.pack.hideAll();
    this.bear.fsm.go('Hidden');
    this.fsm.go(['Intro', 'Fall', 'Act3', 'Act4'][clamp(act, 0, 3)]);
  }
  private states() {
    return {
      Boot: {},
      Lobby: {
        enter: (g: Game) => {
          g.ui.clearHUD();
          g.player.controllable = false;
          g.player.camMode = 'free';
          g.player.char.root.visible = true;
          g.pack.hideAll();
          g.bear.fsm.go('Hidden');
          g.beacon.visible = false;
          g.place(OVERLOOK, { x: 0, z: -10 });
          g.setTod(0.08);
          g.setFx('fade', 0, 0.6);
          g.setFx('psy', 0, 1, true);
          g.world.setBreath(0);
          g.director.letterboxTarget = 0;
          g.input.unlock();
          g.input.enabled = false;
          g.ui.showLobby({
            start: () => { g.touchUI?.fullscreen(); g.audio.init(); g.ui.hideLobby(); g.input.enabled = true; g.fsm.go('Intro'); },
            chapter: (i) => { g.touchUI?.fullscreen(); g.audio.init(); g.ui.hideLobby(); g.input.enabled = true; g.jump(i); },
          });
        },
        update: (g: Game, _dt: number, t: number) => {
          const a = t * 0.025 + 0.6;
          const cam = g.engine.camera;
          cam.position.set(Math.sin(a) * 58, 16 + Math.sin(t * 0.05) * 3, -10 + Math.cos(a) * 62);
          cam.lookAt(-Math.sin(a) * 30, 9, -10 - Math.cos(a) * 30);
          g.engine.setFocus(60, 80, 1);
          if (cam.fov !== 42) { cam.fov = 42; cam.updateProjectionMatrix(); }
        },
      },
      Intro: { enter: (g: Game) => g.playIntro() },
      Act1: {
        enter: (g: Game) => {
          g.ui.actCard(0);
          g.player.controllable = true;
          g.player.camMode = 'third';
          g.player.canRun = true;
          g.player.char.root.visible = true;
          g.nai.fsm.go('Follow');
          g.ui.objective('Sigue el sendero hacia el lago');
          setTimeout(() => g.fsm.is('Act1') && g.ui.hint('Los petroglifos responden a tu mirada. Obsérvalos de cerca.', 6), 7000);
          g.audio.tension = 0;
        },
        update: (g: Game, dt: number) => {
          const woke = g.world.petro.update(g.engine.camera, dt, g.time, g.player.position);
          const awake = g.world.petro.items.filter((i) => i.awakened).length;
          if (woke >= 0) {
            g.audio.chime();
            const lines = [
              ['Nairoby', '¿Viste eso? La piedra… está respirando.'],
              ['Antu', 'Una espiral. Como si el sendero diera vueltas sobre sí mismo.'],
              ['Nairoby', 'Dos figuras… y un oso. Somos nosotros.'],
              ['Antu', 'Un ojo. Nos está esperando.'],
            ];
            const [s, l] = lines[Math.min(awake - 1, 3)];
            g.ui.subtitle(s, l, 5);
          }
          g.setFx('psy', 0.12 + awake * 0.17, 0.4);
          g.audio.psy = g.fx.psy.v;
          const d = Math.hypot(g.player.position.x - OVERLOOK.x, g.player.position.z - OVERLOOK.z);
          if (d < 7) return 'Fall';
        },
      },
      Fall: { enter: (g: Game) => g.playFall() },
      Duel: {
        enter: (g: Game) => g.startDuel(),
        update: (g: Game, dt: number) => g.updateDuel(dt),
        exit: (g: Game) => { g.ui.reticle(false); g.ui.duelHUD(false); g.audio.heartRate = 0; },
      },
      Accept: { enter: (g: Game) => g.playAccept() },
      Act3: {
        enter: (g: Game) => g.startAct3(),
        update: (g: Game, dt: number, t: number) => g.updateAct3(dt, t),
        exit: (g: Game) => { g.ui.compass(false); g.ui.counter(false); },
      },
      Act4: {
        enter: (g: Game) => g.startAct4(),
        update: (g: Game) => {
          const d = Math.hypot(g.player.position.x - UMBRAL.x, g.player.position.z - UMBRAL.z);
          g.ui.objective(`Regresa al umbral del sendero · ${Math.round(d)} m`);
          if (d < 5) return 'Finale';
        },
      },
      Finale: { enter: (g: Game) => g.playFinale() },
      GameOver: {},
    };
  }

  // ───────────────────────── Intro
  playIntro() {
    this.ui.clearHUD();
    this.player.controllable = false;
    this.player.camMode = 'free';
    this.player.char.root.visible = true;
    this.setTod(0.06);
    this.setFx('psy', 0, 1, true);
    this.setFx('fade', 1, 1, true);
    this.world.setBreath(0);
    this.beacon.visible = false;
    this.place(START, { x: 4, z: 110 });
    const trailA = this.world.trail.getPointAt(0.02), trailB = this.world.trail.getPointAt(0.13);
    const pp = () => this.player.position;
    const shots: Shot[] = [
      {
        dur: 9, pos: V(46, 30, 66), pos2: V(14, 17, 34), look: V(0, 6, -60), look2: V(-4, 12, -90), fov: 38, fov2: 34, focus: 90, bokeh: 1,
        onStart: () => { this.setFx('fade', 0, 0.5); this.ui.subtitle('', 'Lake Williams · Sierra de la Sangre de Cristo · 3 400 m', 6.5); },
      },
      {
        dur: 7, pos: V(-22, 1.1, 22), pos2: V(-6, 0.9, 4), look: V(14, 5, -40), look2: V(18, 9, -50), fov: 30, focus: 60, bokeh: 2,
        onStart: () => this.ui.subtitle('', 'Taos Ski Valley · Nuevo México', 5),
      },
      {
        dur: 9,
        pos: () => this.tmp.copy(pp()).add(V(3.4, 1.4, -1.6)), pos2: () => V(pp().x + 2.2, pp().y + 1.6, pp().z - 3.2),
        look: () => V(pp().x, pp().y + 1.4, pp().z), fov: 34, focus: () => this.engine.camera.position.distanceTo(pp()), range: 2, bokeh: 4,
        onStart: () => {
          this.player.walkTo(trailB, 1.35);
          this.nai.walkTo(trailB.clone().add(V(-1.2, 0, 1.6)), 1.35);
          this.ui.subtitle('Nairoby', 'Dicen que el lago guarda algo… que solo se ve si sabes mirar.', 4.5);
          setTimeout(() => this.fsm.is('Intro') && this.ui.subtitle('Antu', 'Entonces miremos. Sin prisa.', 3.5), 4600);
        },
      },
      {
        dur: 2.5,
        pos: () => this.engine.camera.position.clone(),
        pos2: () => { const a = new THREE.Vector3(), b = new THREE.Vector3(); this.player.camTarget(a, b); return a; },
        look: () => V(pp().x, pp().y + 1.4, pp().z), look2: () => { const a = new THREE.Vector3(), b = new THREE.Vector3(); this.player.camTarget(a, b); return b; },
        fov: 34, fov2: this.engine.baseFov, ease: ease.inOut,
        onStart: () => { this.player.yaw = this.player.char.heading; this.player.pitch = 0.12; },
      },
    ];
    void trailA;
    this.ui.skip(true);
    this.director.play(shots, () => { this.ui.skip(false); this.fsm.go('Act1'); });
  }

  // ───────────────────────── Fall
  playFall() {
    this.ui.clearHUD();
    this.player.controllable = false;
    this.player.camMode = 'free';
    const start = this.engine.camera.position.clone();
    const over = G(OVERLOOK.x, OVERLOOK.z, 1.6);
    const wake = G(WAKE.x, WAKE.z);
    const tumble = new THREE.CatmullRomCurve3([start, over.clone().add(V(-2, 0.2, -3)), V((over.x + wake.x) / 2, (over.y + wake.y) / 2 + 1, (over.z + wake.z) / 2), wake.clone().add(V(0, 0.5, 0))]);
    const shots: Shot[] = [
      {
        dur: 2.6, pos: start, look: () => V(this.player.position.x, this.player.position.y + 1.3, this.player.position.z), fov: this.engine.baseFov, fov2: 62, shake: 3,
        onStart: () => {
          this.player.scared(); this.nai.fsm.go('Scared');
          this.setFx('psy', 1, 2); this.setFx('aberration', 2.5, 2);
          this.audio.whoosh(2.4); this.audio.tension = 0.6; this.audio.heartRate = 90;
          this.ui.subtitle('Nairoby', '¡Antu! ¡El suelo…!', 2.4);
        },
      },
      {
        dur: 2.4, pos: (t) => tumble.getPoint(t), look: (t) => tumble.getPoint(Math.min(1, t + 0.08)).add(V(0, -1, 0)), fov: 70, roll: 0, roll2: Math.PI * 3.2, ease: ease.in, shake: 2,
        onStart: () => { this.setFx('radial', 1.2, 6); this.setFx('fade', 1, 1.2); this.audio.heartRate = 140; },
      },
      {
        dur: 2.6, pos: wake.clone().add(V(0, 0.3, 0)), look: wake.clone().add(V(-5, 0.6, 0)), fov: 55,
        onStart: () => {
          this.audio.impact();
          this.setFx('fade', 1, 10, true); this.setFx('radial', 0, 3); this.setFx('psy', 0, 1, true); this.setFx('aberration', 0.8, 1);
          this.player.release();
          this.place(WAKE, BEAR_FROM);
          this.nai.place(WAKE.x + 1.3, WAKE.z + 1.4, this.player.char.heading);
          this.nai.lookTarget = G(BEAR_FROM.x, BEAR_FROM.z);
          this.nai.fsm.go('Crouch');
          this.bear.place(BEAR_FROM.x - 9, BEAR_FROM.z + 4, Math.atan2(1, 0));
          this.bear.fsm.go('Hidden');
          this.audio.heartRate = 70; this.audio.tension = 0.3;
          this.ui.subtitle('', '…', 2);
        },
      },
      {
        dur: 4.2, pos: wake.clone().add(V(0, 0.35, 0)), pos2: wake.clone().add(V(0, 1.62, 0)), look: wake.clone().add(V(-3, 2.5, -1)), look2: G(BEAR_FROM.x, BEAR_FROM.z, 1.2), fov: 55, fov2: this.engine.baseFov, roll: 0.25, roll2: 0,
        onStart: () => { this.setFx('fade', 0, 1.2); this.setFx('blink', 1, 30, true); this.ui.subtitle('Nairoby', 'Antu… no te muevas. Hay algo entre los árboles.', 4); },
        onUpdate: (t) => { this.setFx('blink', t < 0.25 ? 1 - t * 3 : t < 0.4 ? 0.75 : t < 0.5 ? 0.9 : Math.max(0, 1 - t * 1.4), 12); },
      },
    ];
    this.director.play(shots, () => this.fsm.go('Duel'));
  }

  // ───────────────────────── Duel
  startDuel() {
    this.ui.clearHUD();
    this.setTod(0.18);
    if (this.fsm.previous !== 'Fall' && this.fsm.previous !== 'Duel') {
      this.place(WAKE, BEAR_FROM);
      this.nai.place(WAKE.x + 1.3, WAKE.z + 1.4, this.player.char.heading);
      this.nai.lookTarget = G(BEAR_FROM.x, BEAR_FROM.z);
      this.nai.fsm.go('Crouch');
    }
    this.player.place(WAKE.x, WAKE.z, Math.atan2(BEAR_FROM.x - WAKE.x, BEAR_FROM.z - WAKE.z));
    this.player.release();
    this.player.char.play('Idle');
    this.player.controllable = false;
    this.player.camMode = 'first';
    this.player.pitch = 0.02;
    this.player.char.root.visible = false;
    this.setFx('fade', 0, 1);
    this.setFx('blink', 0, 8);
    this.setFx('psy', 0, 1);
    this.setFx('edge', 0, 2, true);
    this.setFx('aberration', 0.6, 1);
    this.bear.place(BEAR_FROM.x - 9, BEAR_FROM.z + 4, Math.atan2(1, 0));
    const dir = V(BEAR_FROM.x - WAKE.x, 0, BEAR_FROM.z - WAKE.z).normalize();
    this.bear.stand.copy(G(WAKE.x + dir.x * 5, WAKE.z + dir.z * 5));
    this.bear.target.copy(this.player.position);
    const eyeY = this.player.position.y + 1.62;
    this.player.pitch = -Math.atan2(this.bear.stand.y + 1.1 - eyeY, 5);
    this.player.yaw = Math.atan2(this.bear.stand.x - WAKE.x, this.bear.stand.z - WAKE.z);
    this.bear.agitation = 0;
    this.bear.fsm.go('Approach');
    this.duel = { balance: 0, agitation: 0.1, lost: 0, strain: 0, blinkT: 0, over: false };
    this.ui.reticle(true);
    this.ui.actCard(1);
    this.ui.objective('Mantén la retícula sobre sus ojos');
    setTimeout(() => this.fsm.is('Duel') && this.ui.hint(`No apartes la mirada más de un segundo y medio · ${this.input.touch ? 'Desliza para seguir sus ojos' : 'Espacio: parpadear'}`, 7), 3500);
    this.audio.tension = 0.5;
    this.audio.heartRate = 78;
    this.input.lock();
    this.ui.lock(!this.input.locked);
  }
  updateDuel(dt: number) {
    const d = this.duel;
    const b = this.bear;
    this.ui.lock(!this.input.locked && !d.over);
    if (d.over) return;
    // organic sway of the head: the body trembles under fear
    const n1 = perlin2(this.time * 0.5, 3.1), n2 = perlin2(this.time * 0.4, 7.7);
    const sway = (0.35 + d.agitation * 0.9 + d.strain * 0.5) * this.input.sensitivity;
    this.player.yaw += n1 * dt * 0.09 * sway;
    this.player.pitch += n2 * dt * 0.05 * sway;
    const eye = b.eyePos(this.tmp);
    const cam = this.engine.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const to = eye.clone().sub(cam.position);
    const dist = to.length();
    const ang = fwd.angleTo(to.normalize());
    const tol = Math.max(0.055, 0.32 / dist);
    const on = ang < tol;
    this.ui.reticle(true, on);
    this.engine.setFocus(dist, 2.5, 3.5);
    const fovTarget = this.engine.baseFov - (on ? 6 : 0) - d.balance * 4;
    cam.fov += (fovTarget + Math.sin(this.time * 1.4) * 0.6 * (1 + d.agitation) - cam.fov) * (1 - Math.exp(-2 * dt));
    cam.updateProjectionMatrix();
    if (b.fsm.is('Duel')) {
      if (on) { d.lost = 0; d.balance += dt / 15; d.agitation -= dt * 0.22; }
      else { d.lost += dt; d.agitation += dt * 0.3; d.balance = Math.max(0, d.balance - dt * 0.04); }
      d.strain = Math.min(1, d.strain + dt / 10);
      if (this.input.pressed('Space')) {
        d.blinkT = 0.22; d.strain = 0; d.agitation += 0.38;
        this.ui.hint('Parpadeaste. El oso lo notó.', 2.5);
      }
      d.agitation = clamp(d.agitation, 0, 1.2);
      b.agitation = d.agitation;
      if (d.lost > 1.5 || d.agitation >= 1) return this.failDuel(d.lost > 1.5 ? 'Apartaste la mirada.' : 'El oso sintió tu miedo.');
      if (d.balance >= 1) return this.winDuel();
      if (d.strain > 0.85 && Math.random() < dt * 0.6) { d.blinkT = 0.12; d.strain = 0.4; d.agitation += 0.15; this.ui.hint('Tus ojos arden… parpadeas sin querer.', 2.5); }
    } else if (b.fsm.is('Approach', 'Sniff')) {
      d.agitation = 0.15;
    }
    if (d.blinkT > 0) { d.blinkT -= dt; this.setFx('blink', 1, 40, true); } else this.setFx('blink', Math.pow(d.strain, 4) * 0.35, 6);
    this.setFx('edge', clamp(d.agitation * 0.9 + d.lost * 0.35, 0, 1), 4);
    this.setFx('aberration', 0.5 + d.strain * 2.2 + d.agitation, 2);
    this.setFx('desat', 0.1 + d.agitation * 0.3, 2);
    this.engine.cinema.set('uHeart', 5 + d.agitation * 7);
    this.audio.tension = 0.4 + d.agitation * 0.6;
    this.audio.heartRate = 70 + d.agitation * 80;
    this.ui.duelHUD(b.fsm.is('Duel'), d.balance, d.strain, clamp(d.lost / 1.5, 0, 1));
  }
  private failDuel(reason: string) {
    const d = this.duel;
    d.over = true;
    this.bear.fsm.go('Aggro');
    this.ui.objective(null);
    this.ui.duelHUD(false);
    this.ui.reticle(false);
    this.setFx('edge', 1, 6);
    setTimeout(() => { this.setFx('aberration', 4, 6); this.setFx('radial', 0.6, 4); }, 1100);
    setTimeout(() => this.setFx('fade', 1, 1.2), 2600);
    setTimeout(() => {
      this.fsm.go('GameOver');
      this.input.unlock();
      this.setFx('radial', 0, 4);
      this.ui.gameOver('El oso no te aceptó', `${reason} Sostén su mirada con calma: él decide si puedes pasar.`,
        () => { this.fsm.go('Duel'); }, () => this.fsm.go('Lobby'));
    }, 4600);
  }
  private winDuel() {
    this.duel.over = true;
    this.ui.objective(null);
    this.ui.duelHUD(false);
    this.ui.reticle(false);
    this.bear.exit.copy(G(BEAR_EXIT.x, BEAR_EXIT.z));
    this.bear.fsm.go('Accept');
    this.audio.sting();
    this.fsm.go('Accept');
  }

  // ───────────────────────── Accept cinematic
  playAccept() {
    this.player.camMode = 'free';
    this.player.char.root.visible = true;
    this.setFx('edge', 0, 1.5); this.setFx('aberration', 0.35, 1); this.setFx('desat', 0.05, 1); this.setFx('blink', 0, 6);
    this.audio.tension = 0.15; this.audio.heartRate = 60;
    const pp = this.player.position.clone();
    const bp = () => this.bear.position.clone().add(V(0, 0.8, 0));
    const shots: Shot[] = [
      {
        dur: 5, pos: pp.clone().add(V(-0.6, 1.5, 0.9)), pos2: pp.clone().add(V(-0.9, 1.35, 1.3)), look: bp, fov: 34, focus: () => this.engine.camera.position.distanceTo(this.bear.position), range: 2, bokeh: 5,
        onStart: () => this.ui.subtitle('', 'El grizzly sopla, baja la cabeza… y se da la vuelta.', 4.5),
      },
      {
        dur: 7, pos: () => this.bear.position.clone().add(V(4.5, 1.1, 3)), look: bp, fov: 30, focus: () => this.engine.camera.position.distanceTo(this.bear.position), range: 3, bokeh: 4,
        onStart: () => {
          this.nai.fsm.go('Scripted');
          this.nai.lookTarget = this.player.position;
          this.ui.subtitle('Nairoby', 'Nos dejó pasar…', 3);
          setTimeout(() => this.fsm.is('Accept') && this.ui.subtitle('Antu', 'No. Nos aceptó.', 3), 3500);
        },
      },
      {
        dur: 5, pos: pp.clone().add(V(2.6, 1.6, -2.4)), pos2: pp.clone().add(V(3.4, 2.2, -3.6)), look: pp.clone().add(V(0.4, 1.4, 0.4)), fov: 36,
        onStart: () => this.setFx('fade', 1, 0.9),
      },
    ];
    this.director.play(shots, () => this.fsm.go('Act3'));
  }

  // ───────────────────────── Act III
  startAct3() {
    this.ui.clearHUD();
    this.bear.fsm.go('Hidden');
    if (this.fsm.previous !== 'Accept') this.place(WAKE, BEAR_EXIT);
    this.player.char.root.visible = true;
    this.player.release();
    this.player.controllable = true;
    this.player.camMode = 'third';
    this.player.yaw = this.player.char.heading;
    this.player.snapCamera();
    this.nai.fsm.go('Follow');
    this.setTod(0.24, 0);
    this.setTod(0.46, 1 / 160);
    this.setFx('fade', 0, 0.8);
    this.setFx('psy', 0.25, 0.3);
    this.setFx('desat', 0.15, 0.5);
    this.world.setBreath(1);
    this.pack.revealed = 0;
    this.pack.start();
    this.flashCharge = 1;
    this.ui.actCard(2);
    this.ui.objective('Revela a los osos ocultos en las sombras');
    this.ui.counter(true, 0, 1);
    this.ui.compass(true, 0);
    setTimeout(() => this.fsm.is('Act3') && this.ui.hint(`Busca los ojos en la oscuridad · ${this.input.touch ? 'Toca o pulsa Flash' : 'F o clic: flash'}`, 7), 6500);
    this.audio.tension = 0.35;
    this.input.lock();
  }
  updateAct3(dt: number, t: number) {
    this.ui.lock(!this.input.locked);
    // disoriented compass
    const real = this.player.yaw;
    const jitter = Math.sin(t * 0.7) * 1.2 + perlin2(t * 0.6, 1.3) * 2.5 + Math.sin(t * 2.9) * 0.2;
    this.ui.compass(true, real + jitter);
    this.flashCharge = Math.min(1, this.flashCharge + dt / 2.2);
    if ((this.input.pressed('KeyF') || this.input.clicked) && this.flashCharge >= 1) {
      this.flashCharge = 0;
      this.player.aim();
      this.audio.flash();
      this.setFx('flash', 0.9, 6, true);
      this.flashLight.intensity = 900;
      setTimeout(() => {
        const n = this.pack.flash(this.engine.camera, this.engine.camera.position);
        if (!n) this.ui.hint('Solo sombras… y algo que respira.', 2.5);
      }, 120);
    }
    this.ui.counter(true, this.pack.revealed, this.flashCharge);
    this.audio.tension = 0.25 + this.pack.lurking.length * 0.12;
    if (this.pack.revealed >= this.pack.total && t > 3) {
      this.pack.active = false;
      this.ui.objective(null);
      this.ui.subtitle('Nairoby', 'Diez… madres y cachorros. Nunca quisieron hacernos daño.', 5);
      if (!this.act3Done) { this.act3Done = true; setTimeout(() => { this.act3Done = false; if (this.fsm.is('Act3')) this.fsm.go('Act4'); }, 5500); }
    }
  }
  private act3Done = false;

  // ───────────────────────── Act IV
  startAct4() {
    this.ui.clearHUD();
    if (this.fsm.previous !== 'Act3') { this.place({ x: -40, z: 24 }, UMBRAL); this.setTod(0.46); }
    this.player.char.root.visible = true;
    this.player.release();
    this.player.controllable = true;
    this.player.camMode = 'third';
    this.player.yaw = this.player.char.heading;
    this.player.snapCamera();
    this.nai.fsm.go('Follow');
    this.pack.active = false;
    this.player.pitch = -0.12;
    this.setTod(1, 1 / 55);
    this.setFx('fade', 0, 0.8);
    this.setFx('psy', 0, 0.3);
    this.setFx('desat', 0.08, 0.5);
    this.setFx('warm', 0.0, 0.2);
    this.world.setBreath(0);
    this.beacon.visible = true;
    this.ui.actCard(3);
    this.ui.subtitle('Antu', 'Mira el cielo. Ya casi llegamos.', 4);
    this.audio.tension = 0;
    this.input.lock();
  }

  // ───────────────────────── Finale
  playFinale() {
    this.ui.clearHUD();
    this.player.controllable = false;
    this.player.camMode = 'free';
    const p = this.player.position.clone();
    const ahead = this.world.trail.getPointAt(0.3);
    const aheadG = G(ahead.x, ahead.z);
    this.setTod(1);
    const shots: Shot[] = [
      {
        dur: 8, pos: p.clone().add(V(0, 1.5, 5)), pos2: p.clone().add(V(0.5, 1.6, 9)), look: () => this.player.position.clone().add(V(0, 1.3, 0)), fov: 34,
        focus: () => this.engine.camera.position.distanceTo(this.player.position), range: 3, bokeh: 3,
        onStart: () => {
          this.player.walkTo(aheadG, 1.25);
          this.nai.walkTo(aheadG.clone().add(V(1, 0, -1)), 1.25);
          this.ui.subtitle('Nairoby', 'Los osos no nos atacaron. Nos miraron… y nos dejaron pasar.', 6);
        },
      },
      {
        dur: 12, pos: () => this.player.position.clone().add(V(-4, 2, -3)), pos2: V(10, 70, 120), look: () => this.player.position.clone().add(V(0, 1, 0)), look2: V(0, 30, -120), fov: 36, fov2: 48, ease: ease.inOutQuint, focus: 200, bokeh: 0.5,
        onStart: () => { this.audio.sting(); this.ui.subtitle('', 'Sierra de la Sangre de Cristo', 5); },
        onUpdate: (t) => { if (t > 0.75) this.setFx('fade', 0.55, 0.6); },
      },
    ];
    this.director.play(shots, () => {
      this.ui.credits(() => this.fsm.go('Lobby'));
      this.director.letterboxTarget = 1;
    });
  }

  // ───────────────────────── Loop
  private updateTouch() {
    const p = this.player;
    const free = !this.paused && !this.director.playing && !this.fsm.is('Lobby', 'GameOver', 'Boot');
    const roam = free && p.controllable && p.camMode === 'third';
    this.touchUI!.setContext({
      move: roam,
      look: free && (p.controllable || p.camMode === 'first'),
      crouch: roam,
      flash: free && this.fsm.is('Act3'),
      blink: free && this.fsm.is('Duel') && this.bear.fsm.is('Duel'),
      skip: !this.paused && this.director.playing,
      pause: roam,
    });
  }
  loop() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;
    const inp = this.input;
    if (this.touchUI) this.updateTouch();
    if (inp.pressed('Enter') && this.director.playing) this.director.skip();
    if (inp.pressed('Escape') && !inp.locked && this.player.controllable) {
      this.paused = true;
      this.ui.pause(true, () => { this.paused = false; inp.lock(); }, () => { this.paused = false; this.fsm.go('Lobby'); });
    }
    if (this.paused) { inp.endFrame(); this.engine.render(dt); return; }
    this.fsm.update(dt);
    if (this.player.controllable) this.ui.lock(!inp.locked);
    this.player.update(dt, this.time);
    this.nai.update(dt);
    this.bear.update(dt, this.engine.camera);
    this.pack.update(dt, this.player.position, this.engine.camera, clamp(this.tod.v * 2, 0, 1));
    if (!this.director.playing && this.player.camMode !== 'free') this.player.updateCamera(dt, this.time);
    this.director.update(dt, this.time);
    if (!this.director.playing && this.player.camMode === 'third') {
      const cam = this.engine.camera;
      const f = this.engine.baseFov + Math.sin(this.time * 0.8) * this.fx.psy.v * 3.5;
      cam.fov += (f - cam.fov) * (1 - Math.exp(-3 * dt));
      cam.updateProjectionMatrix();
      this.engine.setFocus(cam.position.distanceTo(this.player.position) + 0.5, 6, 1.6);
    }
    // time of day
    if (this.tod.speed) {
      const dir = Math.sign(this.tod.t - this.tod.v);
      this.tod.v += dir * this.tod.speed * dt;
      if (Math.sign(this.tod.t - this.tod.v) !== dir) { this.tod.v = this.tod.t; this.tod.speed = 0; }
      this.world.setTimeOfDay(this.tod.v);
    }
    // breath is visible in the cold dusk/night
    const cold = clamp((this.tod.v - 0.35) * 2.2, 0, 1);
    this.breath.intensity = cold;
    this.breath2.intensity = cold;
    const hp = this.player.char.bonePos('Head');
    this.breath.update(dt, hp.add(this.player.forward().multiplyScalar(0.15)), this.player.forward(), 3.4);
    const np = this.nai.char.bonePos('Head');
    const nf = V(Math.sin(this.nai.char.heading), 0, Math.cos(this.nai.char.heading));
    this.breath2.update(dt, np.addScaledVector(nf, 0.14), nf, 3.0);
    this.flashLight.position.copy(this.engine.camera.position);
    this.flashLight.intensity *= Math.exp(-9 * dt);
    this.beaconLight.intensity = this.beacon.visible ? 40 + Math.sin(this.time * 2) * 6 : 0;
    this.world.setPsy(this.fx.psy.v);
    this.world.update(dt, this.time, this.engine.camera, this.player.position);
    // post fx
    for (const k of Object.keys(this.fx) as FxKey[]) {
      const f = this.fx[k];
      f.v += (f.t - f.v) * (1 - Math.exp(-f.r * dt));
    }
    if (this.fx.flash.t > 0) this.fx.flash.t = 0;
    const c = this.engine.cinema;
    c.set('uTime', this.time);
    c.set('uFade', this.fx.fade.v);
    c.set('uPsy', this.fx.psy.v);
    c.set('uRadialBlur', this.fx.radial.v);
    c.set('uBlink', this.fx.blink.v);
    c.set('uEdge', this.fx.edge.v);
    c.set('uAberration', this.fx.aberration.v);
    c.set('uDesat', this.fx.desat.v);
    c.set('uFlash', this.fx.flash.v);
    c.set('uWarm', this.fx.warm.v + (1 - Math.abs(this.tod.v - 0.5) * 2) * 0.35);
    c.set('uVignette', this.fx.vignette.v);
    c.set('uExposure', this.world.exposure);
    this.audio.night = this.world.sky.uniforms.uNight.value;
    this.audio.psy = this.fx.psy.v;
    this.audio.update(dt);
    this.ui.update(dt);
    this.engine.render(dt);
    inp.endFrame();
  }
}
