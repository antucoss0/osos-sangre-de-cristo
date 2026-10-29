export interface Settings {
  quality: 'low' | 'medium' | 'high';
  master: number;
  music: number;
  sfx: number;
  sensitivity: number;
}

const ACTS = [
  { n: 'I', t: 'El Santuario', d: 'Bosque alpino · Lake Williams · la tarde' },
  { n: 'II', t: 'El Duelo de Ojos', d: 'El quiebre · cinco metros · no apartes la mirada' },
  { n: 'III', t: 'El Laberinto de Sombras', d: 'Diez pares de ojos · madres y cachorros' },
  { n: 'IV', t: 'El Umbral', d: 'Del ocaso a la noche · el regreso' },
];

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
  private counterEl: HTMLElement;
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
    this.settings = { quality: 'medium', master: 0.85, music: 0.7, sfx: 0.9, sensitivity: 1, ...saved };
    if (q) this.settings.quality = q;
    root.innerHTML = '';
    this.loader = h(`<div class="loader">
      <div class="loader-mark"><svg viewBox="0 0 120 60"><path d="M2 58 L34 18 L48 34 L66 8 L118 58" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></div>
      <div class="loader-title">Los Osos de la Sierra<br/><em>de la Sangre de Cristo</em></div>
      <div class="loader-bar"><i></i></div>
      <div class="loader-txt">Preparando la montaña…</div></div>`);
    this.lobby = h(`<div class="lobby hidden">
      <div class="lobby-grad"></div>
      <header class="lobby-top"><span>Taos Ski Valley · Nuevo México</span><span>3 400 m · 36.58°N 105.43°W</span></header>
      <div class="lobby-main">
        <div class="eyebrow">Una experiencia cinemática</div>
        <h1>Los Osos<br/><span>de la Sierra de la Sangre de Cristo</span></h1>
        <div class="lobby-sub">El Duelo de Taos</div>
        <nav class="menu">
          <button data-a="start" class="primary"><span>Comenzar el viaje</span><i></i></button>
          <button data-a="chapters"><span>Capítulos</span></button>
          <button data-a="settings"><span>Ajustes</span></button>
          <button data-a="about"><span>Sobre la experiencia</span></button>
        </nav>
      </div>
      <div class="panel chapters hidden">${ACTS.map((a, i) => `<button data-ch="${i}"><b>Acto ${a.n}</b><span>${a.t}</span><small>${a.d}</small></button>`).join('')}</div>
      <div class="panel settings hidden">
        <label>Calidad <select data-s="quality"><option value="low">Rendimiento</option><option value="medium">Equilibrada</option><option value="high">Cinemática</option></select></label>
        <label>Volumen general <input type="range" min="0" max="1" step="0.01" data-s="master"/></label>
        <label>Música <input type="range" min="0" max="1" step="0.01" data-s="music"/></label>
        <label>Efectos <input type="range" min="0" max="1" step="0.01" data-s="sfx"/></label>
        <label>Sensibilidad del ratón <input type="range" min="0.3" max="2.5" step="0.05" data-s="sensitivity"/></label>
        <p class="note">Usa auriculares. La calidad recarga la experiencia.</p>
      </div>
      <div class="panel about hidden">
        <p>Antu y Nairoby suben al santuario de Lake Williams. Cuatro actos: el bosque que respira, el duelo de miradas con un grizzly a cinco metros, el laberinto de sombras con diez osos, y el umbral entre el ocaso y la noche.</p>
        <p class="keys"><b>WASD</b> mover · <b>Shift</b> correr · <b>C</b> agacharse · <b>Ratón</b> mirar · <b>F / clic</b> flash · <b>Espacio</b> parpadear · <b>Enter</b> saltar cinemática · <b>Esc</b> pausa</p>
      </div>
      <footer class="lobby-foot">Auriculares recomendados · Pantalla completa <b>F11</b></footer>
    </div>`);
    this.hud = h(`<div class="hud hidden">
      <div class="objective"></div>
      <div class="hint"></div>
      <div class="reticle hidden"><i></i><b></b></div>
      <div class="duel hidden">
        <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" class="trk"/><circle cx="50" cy="50" r="46" class="bal"/><circle cx="50" cy="50" r="40" class="str"/></svg>
        <div class="duel-lbl">Equilibrio</div>
      </div>
      <div class="compass hidden"><div class="cmp-strip"></div><i></i></div>
      <div class="counter hidden"><span class="cnt">0</span><small>/10</small><em>osos revelados</em><div class="charge"><i></i></div></div>
    </div>`);
    this.card = h(`<div class="actcard"><div class="n"></div><div class="t"></div><div class="d"></div></div>`);
    this.sub = h(`<div class="subtitle"></div>`);
    this.overlay = h(`<div class="overlay hidden"></div>`);
    this.lockEl = h(`<div class="lock hidden"><div>Haz clic para tomar el control</div><small>WASD · Ratón · Shift</small></div>`);
    this.skipEl = h(`<div class="skip hidden">Enter · saltar</div>`);
    root.append(this.loader, this.lobby, this.hud, this.card, this.sub, this.overlay, this.lockEl, this.skipEl);
    this.obj = this.hud.querySelector('.objective')!;
    this.hintEl = this.hud.querySelector('.hint')!;
    this.reticleEl = this.hud.querySelector('.reticle')!;
    this.duel = this.hud.querySelector('.duel')!;
    this.compassEl = this.hud.querySelector('.compass')!;
    this.counterEl = this.hud.querySelector('.counter')!;
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
  progress(p: number, txt?: string) {
    (this.loader.querySelector('.loader-bar i') as HTMLElement).style.transform = `scaleX(${p})`;
    if (txt) this.loader.querySelector('.loader-txt')!.textContent = txt;
  }
  hideLoader() {
    this.loader.classList.add('gone');
    setTimeout(() => this.loader.remove(), 1600);
  }
  showLobby(h: { start: () => void; chapter: (i: number) => void }) {
    this.lobby.classList.remove('hidden', 'out');
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
    setTimeout(() => this.lobby.classList.add('hidden'), 1400);
    this.hud.classList.remove('hidden');
  }
  actCard(i: number) {
    const a = ACTS[i];
    this.card.querySelector('.n')!.textContent = `Acto ${a.n}`;
    this.card.querySelector('.t')!.textContent = a.t;
    this.card.querySelector('.d')!.textContent = a.d;
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
  counter(v: boolean, n = 0, charge = 1) {
    this.counterEl.classList.toggle('hidden', !v);
    this.counterEl.querySelector('.cnt')!.textContent = String(n);
    (this.counterEl.querySelector('.charge i') as HTMLElement).style.transform = `scaleX(${charge})`;
  }
  lock(v: boolean) {
    this.lockEl.classList.toggle('hidden', !v);
  }
  skip(v: boolean) {
    this.skipEl.classList.toggle('hidden', !v);
  }
  gameOver(title: string, text: string, retry: () => void, menu: () => void) {
    this.overlay.innerHTML = `<div class="ov-box"><div class="eyebrow">Fin del duelo</div><h2>${title}</h2><p>${text}</p>
      <div class="ov-btns"><button class="primary" data-r>Intentar de nuevo</button><button data-m>Volver al inicio</button></div></div>`;
    this.overlay.classList.remove('hidden');
    this.overlay.querySelector<HTMLButtonElement>('[data-r]')!.onclick = () => { this.overlay.classList.add('hidden'); retry(); };
    this.overlay.querySelector<HTMLButtonElement>('[data-m]')!.onclick = () => { this.overlay.classList.add('hidden'); menu(); };
  }
  pause(show: boolean, resume: () => void, menu: () => void) {
    if (!show) { this.overlay.classList.add('hidden'); return; }
    this.overlay.innerHTML = `<div class="ov-box"><div class="eyebrow">Pausa</div><h2>La montaña espera</h2>
      <p class="keys"><b>WASD</b> mover · <b>Shift</b> correr · <b>C</b> agacharse · <b>F / clic</b> flash · <b>Espacio</b> parpadear</p>
      <div class="ov-btns"><button class="primary" data-r>Continuar</button><button data-m>Volver al inicio</button></div></div>`;
    this.overlay.classList.remove('hidden');
    this.overlay.querySelector<HTMLButtonElement>('[data-r]')!.onclick = () => { this.overlay.classList.add('hidden'); resume(); };
    this.overlay.querySelector<HTMLButtonElement>('[data-m]')!.onclick = () => { this.overlay.classList.add('hidden'); menu(); };
  }
  credits(onDone: () => void) {
    const el = h(`<div class="credits"><div class="roll">
      <div class="eyebrow">Fin</div>
      <h2>Los Osos de la Sierra<br/>de la Sangre de Cristo</h2>
      <p class="it">“Los osos no nos atacaron. Nos miraron, y nos dejaron pasar.”</p>
      <dl>
        <dt>Una historia de</dt><dd>Antu &amp; Nairoby</dd>
        <dt>Lugar</dt><dd>Lake Williams · Taos Ski Valley · Nuevo México</dd>
        <dt>Protagonistas</dt><dd>Antu · Nairoby</dd>
        <dt>Y</dt><dd>El grizzly del lago · diez madres y cachorros</dd>
        <dt>Mundo</dt><dd>Terreno procedural, agua reflectante, cielo dinámico</dd>
        <dt>Animación</dt><dd>Rigs y máquinas de estado a medida</dd>
        <dt>Sonido</dt><dd>Paisaje sonoro procedural en tiempo real</dd>
      </dl>
      <p class="it">Respeta la fauna. Mantén la distancia. No corras.</p>
      <button class="primary" data-x>Volver al inicio</button>
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
    this.objective(null); this.hint(null); this.reticle(false); this.duelHUD(false); this.compass(false); this.counter(false);
    this.sub.classList.remove('show');
  }
}
