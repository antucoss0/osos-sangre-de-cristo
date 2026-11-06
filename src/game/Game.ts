import * as THREE from 'three';
import { Engine, qualityFor } from '../core/Engine';
import { Input, isTouch } from '../core/Input';
import { TouchControls } from '../ui/TouchControls';
import { StateMachine } from '../core/FSM';
import { loadModels, type Models } from '../core/Assets';
import { World } from '../world/World';
import { heightAt, lakeDist } from '../world/Terrain';
import { inClearing } from '../world/Anchors';
import type { PackSpot } from './Pack';
import { STONE, WAKE, BEAR_TREE } from '../world/Tangle';
import { t, line, lineIds, lang, onLang, type LineId, type StrKey } from '../i18n';
import { Director, ease, type Shot } from '../cinema/Director';
import { UI } from '../ui/UI';
import { AudioEngine } from '../audio/AudioEngine';
import { Player } from './Player';
import { Companion } from './Companion';
import { Bear, type BearEvent } from './Bear';
import { Pack } from './Pack';
import { speedOf } from './Steer';
import { Breath } from '../fx/Particles';
import { clamp, perlin2 } from '../core/noise';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const G = (x: number, z: number, up = 0) => V(x, heightAt(x, z) + up, z);

const START = { x: 6, z: 84 };
const TRAIL_END = { x: 1, z: 60 };
const CLIMB = { x: -76, z: 36 };
const EXIT = { x: 10, z: 112 };
const OUT = { x: 14, z: 128 };
const PACK_PLAN: { x: number; z: number; tree?: boolean }[] = [
  { x: -71, z: 36 }, { x: -60, z: 30, tree: true }, { x: -50, z: 50 }, { x: -47, z: 53 }, { x: -34, z: 44 },
  { x: -38, z: 58, tree: true }, { x: -20, z: 60 }, { x: -16, z: 63 }, { x: -6, z: 50 }, { x: -26, z: 48, tree: true },
];

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
  duel = { balance: 0, agitation: 0, lost: 0, strain: 0, blinkT: 0, over: false, t: 0 };
  chase = { threat: 0, still: 0, metPack: false, t: 0 };
  nearStone = false;
  private token = 0;
  flashLight = new THREE.PointLight(0xfff4e6, 0, 70, 1.2);
  beacon = new THREE.Group();
  beaconLight = new THREE.PointLight(0xcfe6ff, 0, 30, 1.5);
  stoneLight = new THREE.PointLight(0xe4f0ff, 0, 20, 1.6);
  fill = new THREE.PointLight(0xffe2c4, 0, 14, 2);
  headlamp = new THREE.SpotLight(0xfff1dc, 0, 30, 0.42, 0.55, 1.4);
  paused = false;
  touchUI: TouchControls | null = null;
  constructor() {
    const canvas = document.getElementById('gl') as HTMLCanvasElement;
    this.ui = new UI(document.getElementById('ui')!);
    this.engine = new Engine(canvas, qualityFor(this.ui.settings.quality, isTouch));
    this.input = new Input(canvas);
    if (this.input.touch) this.touchUI = new TouchControls(document.getElementById('ui')!, this.input);
    this.director = new Director(this.engine);
    this.applySettings();
    this.ui.onSettings = () => this.applySettings();
    this.ui.onMenu = () => this.goMenu();
    onLang(() => this.preloadVoices());
  }
  applySettings() {
    const s = this.ui.settings;
    this.audio.volumes = { master: s.master, music: s.music, sfx: s.sfx };
    this.audio.applyVolumes();
    this.input.sensitivity = s.sensitivity;
    this.audio.voiceVol = s.voice ?? 1;
  }
  async boot() {
    this.ui.progress(0.02, t('load_world'));
    await new Promise((r) => setTimeout(r, 30));
    this.world = new World(this.engine.scene, this.engine.quality);
    this.ui.progress(0.15, t('load_bears'));
    this.models = await loadModels((p) => this.ui.progress(0.15 + p * 0.8, t('load_bears')), this.engine.quality.mobile);
    const scene = this.engine.scene;
    this.player = new Player(this.models.antu, this.input, this.world.colliders, this.engine.camera);
    this.nai = new Companion(this.models.nairoby, this.player, this.world.colliders);
    this.pack = new Pack(this.models.bear, this.world.colliders, scene);
    this.bear = new Bear(this.models.bear, null, { scale: 2.3, eye: 0x9fe0ff, aura: true });
    this.bear.onEvent = (e, b) => this.bearSound(e, b);
    this.pack.onEvent = (e, b) => this.bearSound(e, b);
    this.player.onStep = (run) => this.audio.step(run);
    scene.add(this.player.char.root, this.nai.char.root, this.bear.char.root, this.bear.eyes, this.bear.aura!, this.breath.points, this.breath2.points, this.flashLight, this.beacon);
    this.buildBeacon();
    this.stoneLight.position.copy(this.world.petro.items[0].center).add(V(0, 2, 0));
    scene.add(this.stoneLight, this.fill, this.headlamp, this.headlamp.target);
    this.ui.progress(0.97, t('load_light'));
    this.place(START, TRAIL_END);
    this.engine.renderer.compile(scene, this.engine.camera);
    this.fsm = new StateMachine<Game>(this, this.states(), 'Boot');
    const go = this.fsm.go.bind(this.fsm);
    this.fsm.go = (n: string) => { this.token++; go(n); };
    this.ui.progress(1, t('ready'));
    this.ui.hideLoader();
    this.clock.start();
    this.engine.renderer.setAnimationLoop(() => this.loop());
    (window as unknown as { __game: Game }).__game = this;
    const act = new URLSearchParams(location.search).get('act');
    if (act !== null) { this.audio.init(); this.preloadVoices(); this.ui.hideLobby(); this.jump(parseInt(act)); }
    else this.fsm.go('Lobby');
  }
  private buildBeacon() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 256;
    const g = c.getContext('2d')!;
    const gr = g.createLinearGradient(0, 256, 0, 0);
    gr.addColorStop(0, 'rgba(220,236,255,0.95)'); gr.addColorStop(1, 'rgba(220,236,255,0)');
    g.fillStyle = gr;
    const hg = g.createRadialGradient(32, 128, 0, 32, 128, 32);
    g.fillRect(0, 0, 64, 256);
    void hg;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    sp.scale.set(1.8, 44, 1);
    sp.position.y = 22;
    this.beacon.add(sp, this.beaconLight);
    this.beaconLight.position.y = 1.5;
    this.beacon.position.copy(G(STONE.x, STONE.z));
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
    if (e === 'roar' && b === this.bear && this.fsm.is('Chase')) {
      this.fx.radial.v = 0.8; this.fx.radial.t = 0;
      this.fx.aberration.v = 2.5;
      this.engine.cinema.set('uHeart', 12);
    }
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
    this.fsm.go(['Intro', 'Fall', 'Vamos'][clamp(act, 0, 2)]);
  }
  preloadVoices() {
    this.audio.loadVoices(lineIds.map((id) => `voice/${lang}/${id}.mp3`));
  }
  /** Run a callback later, cancelled if the game state changes. */
  private later(sec: number, f: () => void) {
    const k = this.token;
    setTimeout(() => { if (k === this.token && !this.paused) f(); }, sec * 1000);
  }
  say(id: LineId) {
    const l = line(id);
    const d = this.audio.voice(`voice/${lang}/${id}.mp3`) || Math.max(1.6, l.text.length * 0.065);
    this.ui.subtitle(l.s, l.text, d + 0.5);
    return d;
  }
  sayChain(ids: LineId[], gap = 0.3, done?: () => void) {
    let i = 0;
    const next = () => {
      if (i >= ids.length) { done?.(); return; }
      const d = this.say(ids[i++]);
      this.later(d + gap, next);
    };
    next();
  }
  goMenu() {
    this.paused = false;
    this.director.playing = false;
    this.audio.stopVoice();
    this.ui.pause(false, () => {}, () => {});
    this.ui.closeCredits();
    this.fsm.go('Lobby');
  }
  private fail(title: StrKey, desc: StrKey, retry: string) {
    this.ui.objective(null);
    this.ui.threat(false);
    this.ui.duelHUD(false);
    this.ui.reticle(false);
    this.setFx('edge', 1, 6);
    this.fsm.go('GameOver');
    setTimeout(() => { this.setFx('aberration', 4, 6); this.setFx('radial', 0.6, 4); }, 1100);
    setTimeout(() => this.setFx('fade', 1, 1.2), 2600);
    setTimeout(() => {
      if (!this.fsm.is('GameOver')) return;
      this.input.unlock();
      this.setFx('radial', 0, 4);
      this.ui.gameOver(t(title), t(desc), () => this.fsm.go(retry), () => this.goMenu());
    }, 4400);
  }
  private playable(third = true) {
    this.player.char.root.visible = true;
    this.player.release();
    this.player.controllable = true;
    this.player.camMode = third ? 'third' : 'first';
    this.player.canRun = true;
    this.player.yaw = this.player.char.heading;
    this.player.pitch = 0.12;
    this.player.snapCamera();
    this.nai.fsm.go('Follow');
    this.input.lock();
  }
  private setupTree() {
    const tg = this.world.tangle;
    this.bear.char.position.copy(tg.perch);
    this.bear.char.heading = tg.perchHeading;
    this.bear.char.velocity.set(0, 0, 0);
    this.bear.target.copy(G(WAKE.x, WAKE.z));
    this.bear.fsm.go('Perch');
    this.bear.auraLevel = 1;
    this.bear.eyeGlow = 1;
    this.bear.gap = 6.5;
  }
  private overShoulder(y: number) {
    const w = G(WAKE.x, WAKE.z);
    const d = V(WAKE.x - BEAR_TREE.x, 0, WAKE.z - BEAR_TREE.z).normalize();
    return w.add(V(d.x * 2.4 + d.z * 0.9, y, d.z * 2.4 - d.x * 0.9));
  }
  private bearEye() {
    return this.bear.eyePos(new THREE.Vector3());
  }
  private states() {
    return {
      Boot: {},
      Lobby: {
        enter: (g: Game) => {
          g.ui.clearHUD();
          g.ui.menuButton(false);
          g.audio.stopVoice();
          g.player.controllable = false;
          g.player.camMode = 'free';
          g.player.char.root.visible = true;
          g.pack.hideAll();
          g.bear.fsm.go('Hidden');
          g.bear.perched = false;
          g.bear.auraLevel = 0;
          g.beacon.visible = false;
          g.world.petro.items[0].glow = 0.12;
          g.player.char.mixer.timeScale = 1; g.nai.char.mixer.timeScale = 1;
          g.place(TRAIL_END, { x: 0, z: -10 });
          g.setTod(0.08);
          g.setFx('fade', 0, 0.6);
          g.setFx('psy', 0, 1, true);
          g.setFx('edge', 0, 2, true);
          g.setFx('blink', 0, 2, true);
          g.world.setBreath(0);
          g.director.letterboxTarget = 0;
          g.audio.tension = 0; g.audio.heartRate = 0;
          g.input.unlock();
          g.input.enabled = false;
          const begin = (f: () => void) => { g.touchUI?.fullscreen(); g.audio.init(); g.preloadVoices(); g.ui.hideLobby(); g.input.enabled = true; f(); };
          g.ui.showLobby({
            start: () => begin(() => g.fsm.go('Intro')),
            chapter: (i) => begin(() => g.jump(i)),
          });
        },
        update: (g: Game, _dt: number, tt: number) => {
          const a = tt * 0.025 + 0.6;
          const cam = g.engine.camera;
          cam.position.set(Math.sin(a) * 82, 20 + Math.sin(tt * 0.05) * 3, -10 + Math.cos(a) * 70);
          cam.lookAt(-Math.sin(a) * 30, 9, -10 - Math.cos(a) * 30);
          g.engine.setFocus(70, 90, 1);
          if (cam.fov !== 42) { cam.fov = 42; cam.updateProjectionMatrix(); }
        },
      },
      Intro: { enter: (g: Game) => g.playIntro() },
      Act1: {
        enter: (g: Game) => {
          g.ui.actCard(0);
          g.playable();
          g.ui.objective(t('obj_lake'));
          g.setTod(0.2, 1 / 160);
          g.audio.tension = 0;
          g.later(5, () => g.say('lake_n'));
        },
        update: (g: Game) => {
          const p = g.player.position;
          if (lakeDist(p.x, p.z) < 1.42) return 'Glint';
        },
      },
      Glint: { enter: (g: Game) => g.playGlint() },
      Around: {
        enter: (g: Game) => {
          if (g.fsm.previous !== 'Glint') g.place({ x: -6, z: 46 }, CLIMB);
          g.playable();
          g.beacon.position.copy(G(STONE.x, STONE.z));
          g.beacon.visible = true;
          g.setTod(0.28, 1 / 150);
          g.later(0.4, () => g.sayChain(['glint_a2', 'lake_n'], 0.6));
        },
        update: (g: Game) => {
          const p = g.player.position;
          const d = Math.hypot(p.x - CLIMB.x, p.z - CLIMB.z);
          g.ui.objective(`${t('obj_around')} · ${Math.round(d)} m`);
          if (d < 7) return 'Climb';
        },
      },
      Climb: {
        enter: (g: Game) => {
          if (g.fsm.previous !== 'Around') { g.place(CLIMB, STONE); g.playable(); g.setTod(0.3); }
          g.setFx('fade', 0, 1);
          g.beacon.position.copy(G(STONE.x, STONE.z));
          g.beacon.visible = true;
          g.setTod(0.33, 1 / 120);
        },
        update: (g: Game) => {
          const p = g.player.position;
          const d = Math.hypot(p.x - STONE.x, p.z - STONE.z);
          g.ui.objective(`${t('obj_climb')} · ${Math.round(d)} m`);
          const near = d < 5.4;
          if (near && !g.nearStone) g.ui.hint(t(g.input.touch ? 'hint_touch_mob' : 'hint_touch_desk'), 6);
          g.nearStone = near;
          g.world.petro.items[0].glow = Math.max(g.world.petro.items[0].glow, near ? 0.35 : 0.12);
          if ((near && g.input.pressed('KeyE')) || d < 3.7) return 'Fall';
        },
        exit: (g: Game) => { g.nearStone = false; g.ui.hint(null); },
      },
      Fall: { enter: (g: Game) => g.playFall() },
      Duel: {
        enter: (g: Game) => g.startDuel(),
        update: (g: Game, dt: number) => g.updateDuel(dt),
        exit: (g: Game) => { g.ui.reticle(false); g.ui.duelHUD(false); },
      },
      Vamos: { enter: (g: Game) => g.playVamos() },
      Chase: {
        enter: (g: Game) => g.startChase(),
        update: (g: Game, dt: number) => g.updateChase(dt),
        exit: (g: Game) => { g.ui.threat(false); },
      },
      Finale: { enter: (g: Game) => g.playFinale() },
      GameOver: {},
    };
  }

  private gameCam(): Shot {
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    return {
      dur: 1.8,
      pos: () => this.engine.camera.position.clone(),
      pos2: () => { this.player.camTarget(a, b); return a.clone(); },
      look: () => V(this.player.position.x, this.player.position.y + 1.4, this.player.position.z),
      look2: () => { this.player.camTarget(a, b); return b.clone(); },
      fov: 34, fov2: this.engine.baseFov, ease: ease.inOut,
      onStart: () => { this.player.yaw = this.player.char.heading; this.player.pitch = 0.12; },
    };
  }

  // ───────────────────────── Intro (~20 s)
  playIntro() {
    this.ui.clearHUD();
    this.ui.menuButton(true);
    this.player.controllable = false;
    this.player.camMode = 'free';
    this.player.char.root.visible = true;
    this.setTod(0.06);
    this.setFx('psy', 0, 1, true);
    this.setFx('fade', 1, 1, true);
    this.world.setBreath(0);
    this.beacon.visible = false;
    this.bear.fsm.go('Hidden');
    this.place(START, TRAIL_END);
    const end = G(TRAIL_END.x, TRAIL_END.z);
    const mid = () => this.player.position.clone().lerp(this.nai.char.position, 0.5);
    const shots: Shot[] = [
      {
        dur: 6.5, pos: V(64, 30, 100), pos2: V(26, 17, 66), look: V(0, 6, -60), look2: V(-4, 12, -90), fov: 38, fov2: 34, focus: 110, bokeh: 1,
        onStart: () => { this.setFx('fade', 0, 0.5); this.ui.subtitle('', t('cap1'), 3.4); },
      },
      {
        dur: 5.5, pos: V(-30, 1.2, 30), pos2: V(-10, 0.9, 12), look: V(14, 5, -50), look2: V(18, 9, -60), fov: 30, focus: 70, bokeh: 2,
        onStart: () => this.ui.subtitle('', t('cap2'), 3.6),
      },
      {
        // 360° orbit around the two friends, with a slow roll
        dur: 9,
        pos: (k: number) => {
          const c = mid(), a = 0.4 + k * Math.PI * 2, r = 4.4 - Math.sin(k * Math.PI) * 1.2;
          return V(c.x + Math.sin(a) * r, c.y + 1.3 + Math.sin(k * Math.PI) * 1.4, c.z + Math.cos(a) * r);
        },
        look: () => mid().add(V(0, 1.35, 0)), fov: 36, fov2: 30, roll: -0.12, roll2: 0.12, ease: ease.inOut,
        focus: () => this.engine.camera.position.distanceTo(mid()), range: 2, bokeh: 4,
        onStart: () => {
          this.player.walkTo(end, 1.5);
          this.nai.walkTo(end.clone().add(V(-1.2, 0, 1.4)), 1.5);
          this.later(0.8, () => this.sayChain(['trail_n', 'trail_a']));
        },
      },
      this.gameCam(),
    ];
    this.ui.skip(true);
    this.director.play(shots, () => { this.ui.skip(false); this.fsm.go('Act1'); });
  }

  // ───────────────────────── Petroglyphs under the water + the glint (~19 s)
  playGlint() {
    this.ui.clearHUD();
    this.player.controllable = false;
    this.player.camMode = 'free';
    this.player.char.velocity.set(0, 0, 0);
    this.player.release();
    const pp = this.player.position.clone();
    const glyph = this.world.sunken.items.reduce((a, b) => (a.center.distanceTo(pp) < b.center.distanceTo(pp) ? a : b)).center.clone();
    const toP = pp.clone().sub(glyph).setY(0).normalize();
    const stone = G(STONE.x, STONE.z, 3);
    this.beacon.position.copy(G(STONE.x, STONE.z));
    this.beacon.visible = true;
    this.nai.fsm.go('Scripted');
    this.nai.lookTarget = glyph;
    const shots: Shot[] = [
      {
        dur: 4.2, pos: glyph.clone().addScaledVector(toP, -6).add(V(1.6, 2.6, 0)), pos2: glyph.clone().addScaledVector(toP, -4.4).add(V(0.6, 1.9, 0)),
        look: glyph, fov: 36, fov2: 32, focus: () => this.engine.camera.position.distanceTo(glyph), range: 2, bokeh: 4, ease: ease.inOut,
        onStart: () => { this.say('glyph_n'); this.player.char.faceTowards(glyph.x, glyph.z, 1, 50); this.audio.chime(); },
      },
      {
        dur: 3.6, pos: glyph.clone().lerp(pp, 0.65).add(V(0, 0.9, 0)), look: pp.clone().add(V(0, 1.35, 0)), fov: 32,
        focus: () => this.engine.camera.position.distanceTo(pp), range: 2, bokeh: 5,
        onStart: () => this.say('glyph_a'),
      },
      {
        dur: 3.8, pos: pp.clone().add(V(0, 1.7, 0)), look: stone, fov: 13, fov2: 9, focus: pp.distanceTo(stone), range: 8, bokeh: 3,
        onStart: () => { this.nai.lookTarget = stone; this.player.char.faceTowards(stone.x, stone.z, 1, 50); this.audio.chime(); this.setFx('flash', 0.35, 4, true); this.say('glint_n'); },
      },
      {
        dur: 7.2, pos: pp.clone().add(V(2.8, 1.5, 2.2)), pos2: pp.clone().add(V(2.0, 1.6, 3.1)), look: pp.clone().add(V(-0.4, 1.5, 0)), fov: 32,
        focus: () => this.engine.camera.position.distanceTo(pp), range: 2, bokeh: 4,
        onStart: () => { this.nai.lookTarget = this.player.position; this.sayChain(['glint_a', 'glint_n2']); },
      },
      this.gameCam(),
    ];
    this.ui.skip(true);
    this.director.play(shots, () => { this.ui.skip(false); this.fsm.go('Around'); });
  }

  // ───────────────────────── The slip: the most cinematic moment (~18 s)
  playFall() {
    this.ui.clearHUD();
    this.ui.menuButton(true);
    if (this.fsm.previous !== 'Climb') { this.place({ x: STONE.x + 3.2, z: STONE.z + 1.6 }, STONE); this.setTod(0.34); }
    this.player.controllable = false;
    this.player.camMode = 'free';
    this.player.char.velocity.set(0, 0, 0);
    this.player.release();
    this.beacon.visible = false;
    const glyph = this.world.petro.items[0];
    const stone = glyph.center.clone();
    const pp = this.player.position.clone();
    const wake = G(WAKE.x, WAKE.z);
    const slip = pp.clone().lerp(wake, 0.18);
    slip.y = heightAt(slip.x, slip.z) + 0.3;
    const path = new THREE.CatmullRomCurve3([pp.clone(), slip, V((slip.x + wake.x) / 2, (slip.y + wake.y) / 2 + 2.2, (slip.z + wake.z) / 2), wake.clone()]);
    const body = (k: number) => this.player.char.position.copy(path.getPoint(clamp(k, 0, 1)));
    const slow = (v: number) => { this.player.char.mixer.timeScale = v; this.nai.char.mixer.timeScale = v; };
    const a0 = Math.atan2(pp.x - stone.x, pp.z - stone.z) + 1.2;
    const pc = () => this.player.char.position;
    const shots: Shot[] = [
      {
        dur: 2.8, pos: pp.clone().add(V(-1.6, 1.4, 1.4)), pos2: pp.clone().add(V(-1.1, 1.3, 1.0)), look: stone, fov: 30, fov2: 25,
        focus: () => this.engine.camera.position.distanceTo(stone), range: 1.2, bokeh: 6,
        onStart: () => { this.player.char.faceTowards(stone.x, stone.z, 1, 50); this.player.aim(); this.say('stone_a'); this.audio.tension = 0.3; this.audio.chime(); },
        onUpdate: (k: number) => {
          glyph.glow = 0.3 + k * 1.4;
          this.stoneLight.intensity = 10 + k * 120;
          if (k > 0.75) this.fx.flash.v = Math.max(this.fx.flash.v, (k - 0.75) * 5);
        },
      },
      {
        dur: 1.4, pos: pp.clone().add(V(-1.1, 1.3, 1.0)), look: stone, fov: 60, shake: 2,
        onStart: () => { this.audio.sting(); this.audio.whoosh(1.4); this.setFx('aberration', 3, 3); },
        onUpdate: () => { this.fx.flash.v = 1.8; glyph.glow = 2; this.stoneLight.intensity = 200; },
      },
      {
        // slow motion: the foot slides, the camera circles him
        dur: 3.6,
        pos: (k: number) => { const c = pc(), a = a0 + k * Math.PI * 1.15; return V(c.x + Math.sin(a) * 3.2, c.y + 0.8 + k * 0.7, c.z + Math.cos(a) * 3.2); },
        look: () => pc().clone().add(V(0, 1.1, 0)), fov: 40, fov2: 30, roll: 0.16, roll2: -0.1, ease: ease.inOut,
        focus: () => this.engine.camera.position.distanceTo(pc()), range: 1.2, bokeh: 7,
        onStart: () => {
          slow(0.2); this.player.scared(); this.say('fall_n');
          this.audio.heartRate = 150; this.audio.whoosh(3.4);
          this.setFx('desat', 0.4, 2); this.setFx('aberration', 1.6, 2); this.setFx('radial', 0.35, 2);
        },
        onUpdate: (k: number) => {
          body(k * 0.2);
          this.player.char.root.rotation.x = -k * 0.9;
          this.fx.flash.v = Math.max(this.fx.flash.v, 0.9 - k * 1.2);
          glyph.glow = 2 - k;
        },
      },
      {
        // real speed: tumbling down the slope
        dur: 2.0, pos: (k: number) => path.getPoint(0.2 + k * 0.8).add(V(0, 1.1, 0)), look: (k: number) => path.getPoint(Math.min(1, 0.3 + k * 0.8)).add(V(0, -0.6, 0)),
        fov: 76, roll: 0, roll2: Math.PI * 2.6, ease: ease.in, shake: 2.5,
        onStart: () => { slow(1); this.setFx('radial', 1.3, 6); this.setFx('desat', 0.1, 2); this.audio.whoosh(2); },
        onUpdate: (k: number) => { body(0.2 + k * 0.8); this.player.char.root.rotation.x = Math.sin(k * Math.PI) * 1.5 + k * 0.6; this.player.char.root.rotation.z = Math.sin(k * Math.PI * 2) * 0.55; if (k > 0.8) this.setFx('fade', 1, 8); },
      },
      {
        dur: 1.5, pos: wake.clone().add(V(9, 7, 11)), pos2: wake.clone().add(V(7.5, 5.5, 9)), look: wake.clone().add(V(0, 0.3, 0)), fov: 40, shake: 1.5,
        onStart: () => { body(1); this.audio.impact(); this.setFx('fade', 0, 12, true); this.setFx('radial', 0, 4); },
        onUpdate: (k: number) => { body(1); this.player.char.root.rotation.x = 1.4; if (k > 0.55) this.setFx('fade', 1, 6); },
      },
      {
        dur: 2.2, pos: wake.clone().add(V(0, 0.3, 0)), look: wake.clone().add(V(-4, 0.5, -3)), fov: 55,
        onStart: () => {
          this.setFx('aberration', 0.8, 1);
          this.place(WAKE, BEAR_TREE);
          this.player.release();
          this.nai.place(WAKE.x + 1.4, WAKE.z + 1.6, this.player.char.heading);
          this.nai.lookTarget = G(BEAR_TREE.x, BEAR_TREE.z, 8);
          this.nai.fsm.go('Crouch');
          this.setupTree();
          this.setTod(0.36);
          glyph.glow = 0.5;
          this.audio.heartRate = 80; this.audio.tension = 0.4;
          this.setFx('fade', 0, 1.2);
          this.setFx('blink', 1, 30, true);
        },
        onUpdate: (k: number) => { this.setFx('blink', k < 0.3 ? 1 - k * 2.4 : k < 0.45 ? 0.7 : Math.max(0, 1 - k * 1.2), 12); },
      },
      {
        dur: 3.6, pos: () => this.overShoulder(0.6), pos2: () => this.overShoulder(1.5), look: wake.clone().add(V(-4, 1.5, -3)),
        look2: () => this.bearEye(), fov: 50, fov2: 40, ease: ease.inOut, focus: () => this.engine.camera.position.distanceTo(this.bear.position), range: 3, bokeh: 4,
        onStart: () => { this.ui.subtitle('', t('cap_bear'), 3); this.audio.growl(9, 0.6); },
      },
    ];
    this.ui.skip(true);
    this.director.play(shots, () => { this.ui.skip(false); slow(1); this.fsm.go('Duel'); });
  }

  // ───────────────────────── Duel (~10 s)
  startDuel() {
    this.ui.clearHUD();
    this.ui.menuButton(true);
    if (this.fsm.previous !== 'Fall') {
      this.place(WAKE, BEAR_TREE);
      this.nai.place(WAKE.x + 1.4, WAKE.z + 1.6, this.player.char.heading);
      this.nai.lookTarget = G(BEAR_TREE.x, BEAR_TREE.z, 8);
      this.nai.fsm.go('Crouch');
      this.setTod(0.36);
    }
    this.setupTree();
    this.player.char.mixer.timeScale = 1; this.nai.char.mixer.timeScale = 1;
    this.player.release();
    this.player.char.play('Idle');
    this.player.controllable = false;
    this.player.camMode = 'first';
    const eye = this.bearEye(), p = this.player.position;
    this.player.yaw = Math.atan2(eye.x - p.x, eye.z - p.z);
    this.player.pitch = -Math.atan2(eye.y - (p.y + 1.62), Math.hypot(eye.x - p.x, eye.z - p.z));
    this.player.char.root.visible = false;
    this.setFx('fade', 0, 1);
    this.setFx('blink', 0, 8);
    this.setFx('psy', 0, 1);
    this.setFx('edge', 0, 2, true);
    this.setFx('aberration', 0.6, 1);
    this.duel = { balance: 0, agitation: 0.1, lost: 0, strain: 0, blinkT: 0, over: false, t: 0 };
    this.ui.actCard(1);
    this.ui.objective(t('obj_duel'));
    this.later(0.8, () => this.say('duel_n'));
    this.input.lock();
  }
  updateDuel(dt: number) {
    const d = this.duel, b = this.bear;
    if (d.over) return;
    d.t += dt;
    this.ui.lock(!this.input.locked);
    const n1 = perlin2(this.time * 0.5, 3.1), n2 = perlin2(this.time * 0.43, 7.7);
    const sway = (0.35 + d.agitation * 0.9 + d.strain * 0.5) * this.input.sensitivity;
    this.player.yaw += n1 * dt * 0.09 * sway;
    this.player.pitch += n2 * dt * 0.05 * sway;
    const eye = this.bearEye();
    const cam = this.engine.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const to = eye.clone().sub(cam.position);
    const dist = to.length();
    const ang = fwd.angleTo(to.normalize());
    const on = ang < Math.max(0.07, 0.5 / dist);
    this.ui.reticle(true, on);
    this.engine.setFocus(dist, 3, 3.5);
    const fovTarget = this.engine.baseFov - (on ? 6 : 0) - d.balance * 4;
    cam.fov += (fovTarget + Math.sin(this.time * 1.4) * 0.6 * (1 + d.agitation) - cam.fov) * (1 - Math.exp(-2 * dt));
    cam.updateProjectionMatrix();
    const scoring = d.t > 2.5;
    if (scoring) {
      if (on) { d.lost = 0; d.balance += dt / 7; d.agitation -= dt * 0.25; }
      else { d.lost += dt; d.agitation += dt * 0.25; d.balance = Math.max(0, d.balance - dt * 0.04); }
      d.strain = Math.min(1, d.strain + dt / 8);
      if (this.input.pressed('Space')) { d.blinkT = 0.22; d.strain = 0; d.agitation += 0.3; this.ui.hint(t('blinked'), 2.5); }
      d.agitation = clamp(d.agitation, 0, 1.2);
      b.agitation = d.agitation;
      if (d.lost > 2.5 || d.agitation >= 1) {
        d.over = true;
        b.stand.copy(G(WAKE.x + (BEAR_TREE.x - WAKE.x) * 0.3, WAKE.z + (BEAR_TREE.z - WAKE.z) * 0.3));
        b.fsm.go('Leap');
        this.fail('f_duel_t', d.lost > 2.5 ? 'f_look' : 'f_fear', 'Duel');
        return;
      }
      if (d.balance >= 1) { d.over = true; this.audio.sting(); this.fsm.go('Vamos'); return; }
      if (d.strain > 0.9 && Math.random() < dt * 0.5) { d.blinkT = 0.12; d.strain = 0.4; d.agitation += 0.12; this.ui.hint(t('burning'), 2.5); }
    }
    if (d.blinkT > 0) { d.blinkT -= dt; this.setFx('blink', 1, 40, true); } else this.setFx('blink', Math.pow(d.strain, 4) * 0.35, 6);
    this.setFx('edge', clamp(d.agitation * 0.9 + d.lost * 0.3, 0, 1), 4);
    this.setFx('aberration', 0.5 + d.strain * 2 + d.agitation, 2);
    this.setFx('desat', 0.1 + d.agitation * 0.3, 2);
    this.engine.cinema.set('uHeart', 5 + d.agitation * 7);
    this.audio.tension = 0.4 + d.agitation * 0.6;
    this.audio.heartRate = 70 + d.agitation * 80;
    this.bear.auraLevel = 1 + d.agitation * 0.6;
    this.ui.duelHUD(scoring, d.balance, d.strain, clamp(d.lost / 2.5, 0, 1));
  }

  // ───────────────────────── ¡Vamos! (~8 s)
  playVamos() {
    this.ui.clearHUD();
    this.ui.menuButton(true);
    if (this.fsm.previous !== 'Duel') {
      this.place(WAKE, BEAR_TREE);
      this.nai.place(WAKE.x + 1.4, WAKE.z + 1.6, this.player.char.heading);
      this.setupTree();
      this.setTod(0.38);
    }
    this.player.camMode = 'free';
    this.player.controllable = false;
    this.player.char.root.visible = true;
    this.player.release();
    this.player.scared();
    this.setFx('edge', 0, 1.5); this.setFx('aberration', 0.4, 1); this.setFx('desat', 0.05, 1); this.setFx('blink', 0, 6); this.setFx('fade', 0, 2);
    this.nai.fsm.go('Scripted');
    this.nai.lookTarget = this.player.position;
    const pp = this.player.position.clone();
    const tree = G(BEAR_TREE.x, BEAR_TREE.z);
    const land = G(BEAR_TREE.x + (WAKE.x - BEAR_TREE.x) * 0.45, BEAR_TREE.z + (WAKE.z - BEAR_TREE.z) * 0.45);
    const np = () => this.nai.char.position;
    const shots: Shot[] = [
      {
        dur: 2.2, pos: () => np().clone().add(V(1.2, 1.5, -1.4)), look: () => np().clone().add(V(0, 1.45, 0)), fov: 30,
        focus: () => this.engine.camera.position.distanceTo(np()), range: 1.5, bokeh: 6,
        onStart: () => { this.say('vamos_n'); this.audio.heartRate = 130; },
      },
      {
        dur: 3.6, pos: pp.clone().add(V(3, 0.7, 4)), look: () => this.bear.position.clone().add(V(0, 2, 0)), fov: 40, fov2: 34, shake: 1.2,
        focus: () => this.engine.camera.position.distanceTo(this.bear.position), range: 4, bokeh: 3,
        onStart: () => { this.bear.stand.copy(land); this.bear.target.copy(pp); this.bear.fsm.go('Leap'); this.audio.tension = 0.8; },
      },
      this.gameCam(),
    ];
    void tree;
    this.ui.skip(true);
    this.director.play(shots, () => { this.ui.skip(false); this.fsm.go('Chase'); });
  }

  // ───────────────────────── Chase (~30 s)
  startChase() {
    this.ui.clearHUD();
    this.ui.menuButton(true);
    if (this.fsm.previous !== 'Vamos') {
      this.place(WAKE, EXIT);
      this.nai.place(WAKE.x + 1.4, WAKE.z + 1.6, this.player.char.heading);
      this.bear.place(BEAR_TREE.x + 3, BEAR_TREE.z + 3, 0);
      this.bear.perched = false;
      this.bear.auraLevel = 1;
      this.bear.eyeGlow = 1;
      this.bear.fsm.go('Chase');
    }
    this.place({ x: this.player.position.x, z: this.player.position.z }, EXIT);
    this.playable();
    this.setTod(0.42);
    this.setTod(1, 1 / 38);
    this.setFx('fade', 0, 0.8);
    this.setFx('desat', 0.12, 0.5);
    this.world.setBreath(1);
    this.bear.gap = 6.5;
    if (!this.bear.fsm.is('Leap', 'Land', 'Chase')) this.bear.fsm.go('Chase');
    this.pack.start(this.packSpots(), this.player.position);
    this.beacon.position.copy(G(EXIT.x, EXIT.z));
    this.beacon.visible = true;
    this.chase = { threat: 0, still: 0, metPack: false, t: 0 };
    this.ui.actCard(2);
    this.later(0.8, () => this.say('chase_a'));
    this.later(3.5, () => this.ui.hint(t(this.input.touch ? 'hint_run_mob' : 'hint_run'), 3));
    this.audio.tension = 0.6;
  }
  updateChase(dt: number) {
    const c = this.chase, p = this.player.position;
    c.t += dt;
    this.bear.target.copy(p);
    const sp = speedOf(this.player.char);
    c.still = sp < 0.6 ? c.still + dt : 0;
    this.bear.gap = c.t > 8 && c.still > 4 ? 1.2 : 6.5;
    if (this.bear.fsm.is('Chase') && this.bear.position.distanceTo(p) < 2.6) {
      this.bear.fsm.go('Aggro');
      this.fail('f_caught_t', 'f_caught_d', 'Chase');
      return;
    }
    // other bears: do not stare, do not get close, do not run at them
    const cam = this.engine.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const crouch = this.player.fsm.is('Crouch');
    let inc = 0, nearest = 1e9, hot: Bear | null = null;
    for (const b of this.pack.watching) {
      const d = b.position.distanceTo(p);
      if (d < nearest) { nearest = d; hot = b; }
      const eye = b.eyePos(new THREE.Vector3()).sub(cam.position);
      const look = d < 14 && fwd.angleTo(eye.normalize()) < 0.16;
      if (d < 6) inc += (6 - d) * 0.22 * (crouch ? 0.45 : 1);
      if (look) inc += crouch ? 0.3 : 0.55;
      if (sp > 3 && d < 10) inc += 0.4;
      b.agitation = c.threat;
    }
    c.threat = clamp(inc > 0 ? c.threat + inc * dt : c.threat - dt * 0.22, 0, 1);
    if (!c.metPack && nearest < 24) {
      c.metPack = true;
      this.sayChain(['pack_n', 'pack_a'], 0.4, () => this.ui.hint(t('hint_pack'), 5));
    }
    this.ui.threat(nearest < 26, c.threat);
    if (c.threat >= 1 && hot) {
      hot.fsm.go('Aggro');
      this.fail('f_pack_t', 'f_pack_d', 'Chase');
      return;
    }
    const de = Math.hypot(p.x - EXIT.x, p.z - EXIT.z);
    this.ui.objective(`${t('obj_escape')} · ${Math.round(de)} m`);
    this.setFx('edge', c.threat * 0.8, 3);
    this.audio.tension = 0.45 + c.threat * 0.55;
    this.audio.heartRate = 85 + c.threat * 70 + Math.max(0, 14 - this.bear.position.distanceTo(p)) * 4;
    if (de < 5) return 'Finale';
  }

  private packSpots(): PackSpot[] {
    return PACK_PLAN.map((s) => {
      if (!s.tree) return { x: s.x, z: s.z };
      let best: { x: number; z: number } | null = null, bd = 12;
      for (const tr of this.world.trees) {
        const d = Math.hypot(tr.x - s.x, tr.z - s.z);
        if (d < bd && !inClearing(tr.x, tr.z)) { bd = d; best = tr; }
      }
      if (!best) return { x: s.x, z: s.z };
      const dx = EXIT.x - best.x, dz = EXIT.z - best.z, l = Math.hypot(dx, dz) || 1;
      const x = best.x + (dx / l) * 0.55, z = best.z + (dz / l) * 0.55;
      return { x, z, y: heightAt(best.x, best.z) + 2.6 + (Math.abs(s.x) % 3) * 0.6, trunk: best };
    });
  }

  // ───────────────────────── Finale (~34 s)
  playFinale() {
    this.ui.clearHUD();
    this.ui.menuButton(true);
    this.player.controllable = false;
    this.player.camMode = 'free';
    this.beacon.visible = false;
    if (this.fsm.previous !== 'Chase') { this.place(EXIT, OUT); this.setTod(0.95); }
    this.setTod(1, 1 / 10);
    const out = G(OUT.x, OUT.z);
    const fwd = V(OUT.x - EXIT.x, 0, OUT.z - EXIT.z).normalize();
    const side = V(fwd.z, 0, -fwd.x);
    const watch = G(EXIT.x - fwd.x * 18 + side.x * 3, EXIT.z - fwd.z * 18 + side.z * 3);
    this.bear.perched = false;
    this.bear.place(watch.x, watch.z, Math.atan2(out.x - watch.x, out.z - watch.z));
    this.bear.target.copy(out);
    this.bear.auraLevel = 1; this.bear.eyeGlow = 1;
    this.bear.fsm.go('Perch');
    this.bear.perched = false;
    for (const b of this.pack.bears) if (b.fsm.is('Lurk')) { b.exit.set(b.position.x - 30, 0, b.position.z - 40); b.fsm.go('Leave'); }
    this.audio.tension = 0; this.audio.heartRate = 0;
    this.setFx('edge', 0, 1); this.setFx('desat', 0.05, 1);
    const pc = () => this.player.position, nc = () => this.nai.char.position;
    const mid = () => pc().clone().lerp(nc(), 0.5);
    let turned = false;
    const shots: Shot[] = [
      {
        dur: 5, pos: () => mid().addScaledVector(fwd, 4.6).add(V(0, 0.55, 0)), look: () => mid().add(V(0, 1.2, 0)), fov: 30,
        focus: () => this.engine.camera.position.distanceTo(mid()), range: 2.5, bokeh: 5,
        onStart: () => {
          this.player.walkTo(out, 3.2);
          this.nai.walkTo(out.clone().addScaledVector(side, 1.2), 3.2);
          this.later(2.6, () => { this.player.walkTo(out, 1.1); this.nai.walkTo(out.clone().addScaledVector(side, 1.2), 1.1); });
        },
      },
      {
        dur: 4.6, pos: () => nc().clone().addScaledVector(side, 1.4).addScaledVector(fwd, 0.6).add(V(0, 1.5, 0)), look: () => nc().clone().add(V(0, 1.5, 0)), fov: 26,
        focus: () => this.engine.camera.position.distanceTo(nc()), range: 1, bokeh: 7,
        onStart: () => this.say('exit_n'),
      },
      {
        dur: 4.8, pos: () => pc().clone().addScaledVector(side, -1.4).addScaledVector(fwd, 0.6).add(V(0, 1.55, 0)), look: () => pc().clone().add(V(0, 1.55, 0)), fov: 26,
        focus: () => this.engine.camera.position.distanceTo(pc()), range: 1, bokeh: 7,
        onStart: () => this.say('exit_a'),
      },
      {
        dur: 6.5, pos: () => mid().addScaledVector(fwd, 2.4).add(V(0, 1.75, 0)), look: watch.clone().add(V(0, 2.2, 0)), fov: 24, fov2: 20,
        focus: () => this.engine.camera.position.distanceTo(watch), range: 6, bokeh: 4,
        onStart: () => {
          this.player.char.velocity.set(0, 0, 0); this.nai.char.velocity.set(0, 0, 0);
          this.player.walkTo(pc().clone(), 1); this.nai.walkTo(nc().clone(), 1);
          this.player.char.faceTowards(watch.x, watch.z, 1, 50);
          this.nai.lookTarget = watch;
          this.audio.huff(20);
        },
        onUpdate: (k: number) => {
          this.player.char.faceTowards(watch.x, watch.z, 0.05, 6);
          if (k > 0.55 && !turned) {
            turned = true;
            this.bear.perched = false;
            this.bear.exit.copy(G(watch.x - fwd.x * 30, watch.z - fwd.z * 30));
            this.bear.fsm.go('Accept');
          }
        },
      },
      {
        dur: 5.5, pos: () => mid().addScaledVector(side, 5).add(V(0, 1.4, 0)), pos2: () => mid().addScaledVector(side, 3.8).add(V(0, 1.5, 0)), look: () => mid().add(V(0, 1.4, 0)), fov: 32,
        focus: () => this.engine.camera.position.distanceTo(mid()), range: 2, bokeh: 4,
        onStart: () => { this.nai.lookTarget = this.player.position; this.audio.sting(); },
        onUpdate: () => this.player.char.faceTowards(nc().x, nc().z, 0.05, 4),
      },
      {
        dur: 9, pos: () => mid().addScaledVector(side, 3.8).add(V(0, 1.5, 0)), pos2: V(OUT.x + 20, 75, OUT.z + 40), look: () => mid().add(V(0, 1.2, 0)), look2: V(-20, 30, -120),
        fov: 34, fov2: 48, ease: ease.inOutQuint, focus: 200, bokeh: 0.5,
        onStart: () => this.ui.subtitle('', t('mountain'), 4.5),
        onUpdate: (k: number) => { if (k > 0.72) this.setFx('fade', 0.55, 0.6); },
      },
    ];
    this.director.play(shots, () => {
      this.ui.credits(() => this.goMenu());
      this.director.letterboxTarget = 1;
    });
  }

  /** Soft key/fill light that travels with the camera, and Antu's headlamp once night falls. */
  private updateLights() {
    const night = this.world.sky.uniforms.uNight.value as number;
    const cam = this.engine.camera;
    this.fill.position.copy(cam.position).add(V(0.6, 0.5, 0));
    this.fill.intensity = (this.director.playing ? 4 : 1.2) * (0.35 + night * 0.8);
    const head = this.player.char.bonePos('Head');
    this.headlamp.position.copy(head);
    this.headlamp.target.position.copy(head).addScaledVector(this.player.forward(), 7).add(V(0, -1.4, 0));
    const on = night > 0.35 && this.player.char.root.visible && !this.fsm.is('Lobby');
    this.headlamp.intensity += ((on ? 70 * (night - 0.3) : 0) - this.headlamp.intensity) * 0.1;
  }

  /** Keep bodies from interpenetrating: Antu is pushed out of any grounded bear. */
  private separate() {
    const p = this.player.position;
    for (const b of [this.bear, ...this.pack.bears]) {
      if (!b.char.root.visible || b.perched) continue;
      const r = 0.35 + b.char.model.scale.x * 0.72;
      const dx = p.x - b.position.x, dz = p.z - b.position.z, d = Math.hypot(dx, dz);
      if (d < r && d > 1e-3) { p.x = b.position.x + (dx / d) * r; p.z = b.position.z + (dz / d) * r; }
    }
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
      touch: free && this.fsm.is('Climb') && this.nearStone,
      blink: free && this.fsm.is('Duel') && this.duel.t > 2.5 && !this.duel.over,
      skip: !this.paused && this.director.playing,
      pause: roam,
    });
  }
  loop() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;
    const inp = this.input;
    if (this.touchUI) this.updateTouch();
    if (inp.pressed('Enter') && this.director.playing) this.audio.stopVoice();
    if (inp.pressed('Enter') && this.director.playing) this.director.skip();
    if (inp.pressed('Escape') && !inp.locked && this.player.controllable) {
      this.paused = true;
      this.ui.pause(true, () => { this.paused = false; inp.lock(); }, () => this.goMenu());
    }
    if (this.paused) { inp.endFrame(); this.engine.render(dt); return; }
    this.fsm.update(dt);
    if (this.player.controllable) this.ui.lock(!inp.locked);
    this.player.update(dt, this.time);
    this.separate();
    this.nai.update(dt);
    this.bear.update(dt, this.engine.camera);
    this.pack.update(dt, this.player.position, this.engine.camera, clamp(this.tod.v * 2, 0, 1));
    if (!this.director.playing && this.player.camMode !== 'free') this.player.updateCamera(dt, this.time);
    this.director.update(dt, this.time);
    this.updateLights();
    if (!this.director.playing && this.player.camMode === 'third') {
      const cam = this.engine.camera;
      const f = this.engine.baseFov + Math.sin(this.time * 0.8) * this.fx.psy.v * 3.5 + (this.fsm.is('Chase') ? clamp(speedOf(this.player.char) - 2, 0, 2.5) * 3 : 0);
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
    this.stoneLight.intensity *= Math.exp(-0.5 * dt);
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
