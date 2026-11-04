import { isTouch } from '../core/Input';
import { t, lang, setLang, applyLang, type StrKey } from '../i18n';

export interface Settings {
  quality: 'low' | 'medium' | 'high';
  master: number;
  music: number;
  sfx: number;
  sensitivity: number;
  voice: number;
}

const ACTS: { n: string; t: StrKey; d: StrKey }[] = [
  { n: 'I', t: 'a1t', d: 'a1d' },
  { n: 'II', t: 'a2t', d: 'a2d' },
  { n: 'III', t: 'a3t', d: 'a3d' },
];

const keys = () => t(isTouch ? 'keys_touch' : 'keys_desk');
const T = (k: StrKey) => `<span data-t="${k}">${t(k)}</span>`;

const h = (html: string) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

export class UI {
  root: HTMLElement;
  private loader: HTMLElement;
  private lobby: HTMLElement;
  private hud: HTMLElement;
  private sub: HTMLElement;
  private card: HTMLElement;
  private obj: HTMLElement;
  private hintEl: HTMLElement;
  private reticleEl: HTMLElement;
  private duel: HTMLElement;
  private compassEl: HTMLElement;
  private threatEl: HTMLElement;
  private menuBtn: HTMLButtonElement;
  onMenu: (() => void) | null = null;
  private overlay: HTMLElement;
  private lockEl: HTMLElement;
  private skipEl: HTMLElement;
  private subTimer = 0;
  private hintTimer = 0;
  onSettings: ((s: Settings) => void) | null = null;
  settings: Settings;
  constructor(root: HTMLElement) {
    this.root = root;
    const saved = JSON.parse(localStorage.getItem('osos.settings') || 'null');
    const q = new URLSearchParams(location.search).get('q') as Settings['quality'] | null;
    this.settings = { quality: isTouch ? 'low' : 'medium', master: 0.85, music: 0.7, sfx: 0.9, sensitivity: 1, voice: 1, ...saved };
    if (q) this.settings.quality = q;
    root.innerHTML = '';
    document.body.classList.toggle('touch', isTouch);
    this.loader = h(`<div class="loader">
      <div class="loader-mark"><svg viewBox="0 0 120 60"><path d="M2 58 L34 18 L48 34 L66 8 L118 58" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></div>
      <div class="loader-title">${T('title')}<br/><em>${T('title2')}</em></div>
      <div class="loader-bar"><i></i></div>
      <div class="loader-txt">${t('load_mtn')}</div></div>`);
    this.lobby = h(`<div class="lobby hidden">
      <div class="lobby-grad"></div>
      <div class="lobby-lang"><button data-lang="es">ES</button><i></i><button data-lang="en">EN</button></div>
      <div class="lobby-main">
        <div class="eyebrow">${T('eyebrow')}</div>
        <h1><div data-t="title">${t('title')}</div><span data-t="title2">${t('title2')}</span></h1>
        <div class="lobby-rule"></div>
        <div class="lobby-sub">${T('tagline')}</div>
        <nav class="menu">
          <button data-a="start" class="primary">${T('start')}</button>
          <button data-a="chapters">${T('chapters')}</button>
          <button data-a="settings">${T('settings')}</button>
          <button data-a="about">${T('about')}</button>
        </nav>
      </div>
      <div class="panel chapters hidden">${ACTS.map((a, i) => `<button data-ch="${i}"><b>${T('act')} ${a.n}</b><span>${T(a.t)}</span><small>${T(a.d)}</small></button>`).join('')}</div>
      <div class="panel settings hidden">
        <label>${T('quality')} <select data-s="quality"><option value="low" data-t="q_low">${t('q_low')}</option><option value="medium" data-t="q_med">${t('q_med')}</option><option value="high" data-t="q_high">${t('q_high')}</option></select></label>
        <label>${T('master')} <input type="range" min="0" max="1" step="0.01" data-s="master"/></label>
        <label>${T('voices')} <input type="range" min="0" max="1" step="0.01" data-s="voice"/></label>
        <label>${T('music')} <input type="range" min="0" max="1" step="0.01" data-s="music"/></label>
        <label>${T('sfx')} <input type="range" min="0" max="1" step="0.01" data-s="sfx"/></label>
        <label>${T(isTouch ? 'sens_touch' : 'sens_mouse')} <input type="range" min="0.3" max="2.5" step="0.05" data-s="sensitivity"/></label>
        <p class="note">${T('note')}</p>
      </div>
      <div class="panel about hidden">
        <p>${T('about_p')}</p>
        <p class="keys">${T(isTouch ? 'keys_touch' : 'keys_desk')}</p>
      </div>
      <footer class="lobby-foot">${T(isTouch ? 'foot_touch' : 'foot_desk')}</footer>
    </div>`);
    this.hud = h(`<div class="hud hidden">
      <div class="objective"></div>
      <div class="hint"></div>
      <div class="reticle hidden"><i></i><b></b></div>
      <div class="duel hidden">
        <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="trk"/><circle cx="50" cy="50" r="46" class="bal"/><circle cx="50" cy="50" r="40" class="str"/></svg>
        <div class="duel-lbl">${T('balance')}</div>
      </div>
      <div class="compass hidden"><div class="cmp-strip"></div><i></i></div>
      <div class="threat hidden"><em>${T('tension')}</em><div class="bar"><i></i></div></div>
      <button class="menu-btn">${T('menu')}</button>
    </div>`);
    this.card = h(`<div class="actcard"><div class="n"></div><div class="t"></div><div class="d"></div></div>`);
    this.sub = h(`<div class="subtitle"></div>`);
    this.overlay = h(`<div class="overlay hidden"></div>`);
    this.lockEl = h(`<div class="lock hidden"><div>${T(isTouch ? 'lock_touch' : 'lock_desk')}</div><small>${T(isTouch ? 'lock_touch2' : 'lock_desk2')}</small></div>`);
    this.skipEl = h(`<div class="skip hidden">${T('skip')}</div>`);
    const rotate = h(`<div class="rotate"><svg viewBox="0 0 60 60"><rect x="18" y="8" width="24" height="44" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg><div>${T('rotate')}</div><small>${T('rotate2')}</small></div>`);
    root.append(this.loader, this.lobby, this.hud, this.card, this.sub, this.overlay, this.lockEl, this.skipEl, rotate);
    this.obj = this.hud.querySelector('.objective')!;
    this.hintEl = this.hud.querySelector('.hint')!;
    this.reticleEl = this.hud.querySelector('.reticle')!;
    this.duel = this.hud.querySelector('.duel')!;
    this.compassEl = this.hud.querySelector('.compass')!;
    this.threatEl = this.hud.querySelector('.threat')!;
    this.menuBtn = this.hud.querySelector('.menu-btn')!;
    this.menuBtn.onclick = (e) => { e.stopPropagation(); this.onMenu?.(); };
    this.lobby.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => (b.onclick = () => { setLang(b.dataset.lang as 'es' | 'en'); this.markLang(); }));
    this.markLang();
    const strip = this.compassEl.querySelector('.cmp-strip')!;
    const marks = ['N', '·', 'NE', '·', 'E', '·', 'SE', '·', 'S', '·', 'SO', '·', 'O', '·', 'NO', '·'];
    strip.innerHTML = [...marks, ...marks, ...marks].map((m) => `<span>${m}</span>`).join('');
    this.bindSettings();
  }
  private bindSettings() {
    const sp = this.lobby.querySelector('.settings')!;
    sp.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-s]').forEach((el) => {
      const k = el.dataset.s as keyof Settings;
      el.value = String(this.settings[k]);
      el.addEventListener('input', () => {
        (this.settings as unknown as Record<string, unknown>)[k] = k === 'quality' ? el.value : parseFloat(el.value);
        localStorage.setItem('osos.settings', JSON.stringify(this.settings));
        if (k === 'quality') { const u = new URL(location.href); u.searchParams.set('q', el.value); location.href = u.toString(); }
        this.onSettings?.(this.settings);
      });
    });
  }
  private markLang() {
    this.lobby.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === lang));
    applyLang(this.root);
  }
  progress(p: number, txt?: string) {
    (this.loader.querySelector('.loader-bar i') as HTMLElement).style.transform = `scaleX(${p})`;
    if (txt) this.loader.querySelector('.loader-txt')!.textContent = txt;
  }
  hideLoader() {
    this.loader.classList.add('gone');
    setTimeout(() => this.loader.remove(), 1600);
  }
  get creditsOpen() { return !!this.root.querySelector('.credits'); }
  closeCredits() { this.root.querySelector('.credits')?.remove(); }
  showLobby(h: { start: () => void; chapter: (i: number) => void }) {
    this.lobby.classList.remove('hidden', 'out');
    document.body.classList.remove('playing');
    this.hud.classList.add('hidden');
    const panels = this.lobby.querySelectorAll<HTMLElement>('.panel');
    const toggle = (name: string) => panels.forEach((p) => p.classList.toggle('hidden', !p.classList.contains(name) || !p.classList.contains('hidden')));
    this.lobby.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a!;
        if (a === 'start') h.start();
        else toggle(a);
      };
    });
    this.lobby.querySelectorAll<HTMLButtonElement>('[data-ch]').forEach((b) => (b.onclick = () => h.chapter(parseInt(b.dataset.ch!))));
  }
  hideLobby() {
    this.lobby.classList.add('out');
    document.body.classList.add('playing');
    setTimeout(() => this.lobby.classList.add('hidden'), 1400);
    this.hud.classList.remove('hidden');
  }
  actCard(i: number) {
    const a = ACTS[i];
    this.card.querySelector('.n')!.textContent = `${t('act')} ${a.n}`;
    this.card.querySelector('.t')!.textContent = t(a.t);
    this.card.querySelector('.d')!.textContent = t(a.d);
    this.card.classList.remove('show');
    void this.card.offsetWidth;
    this.card.classList.add('show');
  }
  objective(t: string | null) {
    this.obj.textContent = t ?? '';
    this.obj.classList.toggle('show', !!t);
  }
  hint(t: string | null, dur = 5) {
    this.hintEl.textContent = t ?? '';
    this.hintEl.classList.toggle('show', !!t);
    this.hintTimer = t ? dur : 0;
  }
  subtitle(speaker: string, text: string, dur = 4) {
    this.sub.innerHTML = speaker ? `<b>${speaker}</b>${text}` : text;
    this.sub.classList.add('show');
    this.subTimer = dur;
  }
  reticle(v: boolean, on = false) {
    this.reticleEl.classList.toggle('hidden', !v);
    this.reticleEl.classList.toggle('on', on);
  }
  duelHUD(v: boolean, balance = 0, strain = 0, lost = 0) {
    this.duel.classList.toggle('hidden', !v);
    if (!v) return;
    const C = 2 * Math.PI * 46;
    (this.duel.querySelector('.bal') as SVGCircleElement).style.strokeDashoffset = String(C * (1 - balance));
    const C2 = 2 * Math.PI * 40;
    (this.duel.querySelector('.str') as SVGCircleElement).style.strokeDashoffset = String(C2 * (1 - strain));
    this.duel.style.setProperty('--lost', String(lost));
  }
  compass(v: boolean, heading = 0) {
    this.compassEl.classList.toggle('hidden', !v);
    if (!v) return;
    const deg = ((((-heading * 180) / Math.PI) % 360) + 360) % 360;
    (this.compassEl.querySelector('.cmp-strip') as HTMLElement).style.transform = `translateX(${-(deg / 360) * 16 * 40 - 16 * 40 + 120}px)`;
  }
  threat(v: boolean, k = 0) {
    this.threatEl.classList.toggle('hidden', !v);
    (this.threatEl.querySelector('.bar i') as HTMLElement).style.transform = `scaleX(${k})`;
    this.threatEl.classList.toggle('hot', k > 0.6);
  }
  menuButton(v: boolean) {
    this.menuBtn.classList.toggle('hidden', !v);
  }
  lock(v: boolean) {
    this.lockEl.classList.toggle('hidden', !v);
  }
  skip(v: boolean) {
    this.skipEl.classList.toggle('hidden', !v || isTouch);
  }
  gameOver(title: string, text: string, retry: () => void, menu: () => void) {
    this.overlay.innerHTML = `<div class="ov-box"><div class="eyebrow">${t('over')}</div><h2>${title}</h2><p>${text}</p>
      <div class="ov-btns"><button class="primary" data-r>${t('retry')}</button><button data-m>${t('to_menu')}</button></div></div>`;
    this.overlay.classList.remove('hidden');
    this.overlay.querySelector<HTMLButtonElement>('[data-r]')!.onclick = () => { this.overlay.classList.add('hidden'); retry(); };
    this.overlay.querySelector<HTMLButtonElement>('[data-m]')!.onclick = () => { this.overlay.classList.add('hidden'); menu(); };
  }
  pause(show: boolean, resume: () => void, menu: () => void) {
    if (!show) { this.overlay.classList.add('hidden'); return; }
    this.overlay.innerHTML = `<div class="ov-box"><div class="eyebrow">${t('pause')}</div><h2>${t('pause_h')}</h2>
      <p class="keys">${keys()}</p>
      <div class="ov-btns"><button class="primary" data-r>${t('resume')}</button><button data-m>${t('to_menu')}</button></div></div>`;
    this.overlay.classList.remove('hidden');
    this.overlay.querySelector<HTMLButtonElement>('[data-r]')!.onclick = () => { this.overlay.classList.add('hidden'); resume(); };
    this.overlay.querySelector<HTMLButtonElement>('[data-m]')!.onclick = () => { this.overlay.classList.add('hidden'); menu(); };
  }
  credits(onDone: () => void) {
    const el = h(`<div class="credits"><div class="roll">
      <div class="eyebrow">${t('end')}</div>
      <h2>${t('title')}<br/>${t('title2')}</h2>
      <p class="it">${t('quote')}</p>
      <dl>
        <dt>${t('c_story')}</dt><dd>Antu &amp; Nairoby</dd>
        <dt>${t('c_cast')}</dt><dd>Antu · Nairoby</dd>
        <dt>${t('c_and')}</dt><dd>${t('c_bears')}</dd>
        <dt>${t('c_world')}</dt><dd>${t('c_world_d')}</dd>
        <dt>${t('c_anim')}</dt><dd>${t('c_anim_d')}</dd>
        <dt>${t('c_voice')}</dt><dd>${t('c_voice_d')}</dd>
        <dt>${t('c_sound')}</dt><dd>${t('c_sound_d')}</dd>
      </dl>
      <p class="it">${t('respect')}</p>
      <button class="primary" data-x>${t('to_menu')}</button>
    </div></div>`);
    this.root.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    el.querySelector<HTMLButtonElement>('[data-x]')!.onclick = () => { el.remove(); onDone(); };
  }
  update(dt: number) {
    if (this.subTimer > 0) { this.subTimer -= dt; if (this.subTimer <= 0) this.sub.classList.remove('show'); }
    if (this.hintTimer > 0) { this.hintTimer -= dt; if (this.hintTimer <= 0) this.hintEl.classList.remove('show'); }
  }
  clearHUD() {
    this.objective(null); this.hint(null); this.reticle(false); this.duelHUD(false); this.compass(false); this.threat(false);
    this.sub.classList.remove('show');
  }
}
