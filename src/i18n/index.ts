import LINES from './lines.json';

export type Lang = 'es' | 'en';
export type LineId = keyof typeof LINES;

const q = new URLSearchParams(location.search).get('lang');
const stored = localStorage.getItem('osos.lang');
export let lang: Lang = q === 'en' || q === 'es' ? q : stored === 'en' || stored === 'es' ? stored : navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
document.documentElement.lang = lang;

const S = {
  load_mtn: ['Preparando la montaña…', 'Preparing the mountain…'],
  load_world: ['Esculpiendo la montaña…', 'Sculpting the mountain…'],
  load_bears: ['Despertando a los osos…', 'Waking the bears…'],
  load_light: ['Compilando la luz…', 'Compiling the light…'],
  ready: ['Listo', 'Ready'],
  webgl: ['No se pudo iniciar WebGL. Prueba otro navegador.', 'WebGL could not start. Try another browser.'],
  title: ['Los Osos', 'The Bears'],
  title2: ['de la Sierra de la Sangre de Cristo', 'of the Sangre de Cristo Mountains'],
  eyebrow: ['Una experiencia cinemática · 2 min', 'A cinematic experience · 2 min'],
  tagline: ['Dos mejores amigos tratando de encontrarse', 'Two best friends trying to find themselves'],
  start: ['Comenzar', 'Begin'],
  chapters: ['Capítulos', 'Chapters'],
  settings: ['Ajustes', 'Settings'],
  about: ['Sobre la experiencia', 'About'],
  act: ['Acto', 'Act'],
  a1t: ['Fuera del sendero', 'Off the Trail'],
  a1d: ['El lago · un destello en la montaña', 'The lake · a glint on the mountain'],
  a2t: ['El árbol', 'The Tree'],
  a2d: ['Un oso azul mira desde lo alto · no apartes la mirada', 'A blue bear watches from above · don\u2019t look away'],
  a3t: ['La huida', 'The Escape'],
  a3d: ['Cae la noche · pasa entre los osos sin desafiarlos', 'Night falls · slip past the bears without challenging them'],
  quality: ['Calidad', 'Quality'],
  q_low: ['Rendimiento', 'Performance'],
  q_med: ['Equilibrada', 'Balanced'],
  q_high: ['Cinemática', 'Cinematic'],
  master: ['Volumen general', 'Master volume'],
  music: ['Música', 'Music'],
  sfx: ['Efectos', 'Effects'],
  voices: ['Voces', 'Voices'],
  sens_mouse: ['Sensibilidad del ratón', 'Mouse sensitivity'],
  sens_touch: ['Sensibilidad táctil', 'Touch sensitivity'],
  note: ['Usa auriculares. La calidad recarga la experiencia.', 'Use headphones. Changing quality reloads the experience.'],
  about_p: [
    'Antu y Nairoby son mejores amigos. Dejan el sendero para encontrarse, rodean un lago de piedra y siguen un destello en la montaña. Lo que los espera arriba de un árbol los obligará a huir entre osos, mientras cae la noche.',
    'Antu and Nairoby are best friends. They leave the trail to find themselves, circle a stone-bound lake and follow a glint up the mountain. What waits for them up in a tree will make them flee among bears as night falls.',
  ],
  keys_desk: [
    '<b>WASD</b> mover · <b>Shift</b> correr · <b>C</b> agacharse · <b>Ratón</b> mirar · <b>E</b> tocar · <b>Espacio</b> parpadear · <b>Enter</b> saltar cinemática · <b>Esc</b> pausa',
    '<b>WASD</b> move · <b>Shift</b> run · <b>C</b> crouch · <b>Mouse</b> look · <b>E</b> touch · <b>Space</b> blink · <b>Enter</b> skip cutscene · <b>Esc</b> pause',
  ],
  keys_touch: [
    '<b>Joystick</b> mover · <b>Al fondo</b> correr · <b>Deslizar</b> mirar · <b>Agachar</b> · <b>Tocar</b> · <b>Parpadear</b> · <b>Saltar</b> cinemática · <b>Menú</b>',
    '<b>Joystick</b> move · <b>Push to edge</b> run · <b>Swipe</b> look · <b>Crouch</b> · <b>Touch</b> · <b>Blink</b> · <b>Skip</b> cutscene · <b>Menu</b>',
  ],
  foot_desk: ['Auriculares recomendados · Pantalla completa <b>F11</b>', 'Headphones recommended · Fullscreen <b>F11</b>'],
  foot_touch: ['Auriculares recomendados · Juega en horizontal', 'Headphones recommended · Play in landscape'],
  balance: ['Equilibrio', 'Balance'],
  tension: ['Tensión', 'Tension'],
  menu: ['Menú', 'Menu'],
  lock_desk: ['Haz clic para tomar el control', 'Click to take control'],
  lock_touch: ['Toca la pantalla para continuar', 'Tap the screen to continue'],
  lock_desk2: ['WASD · Ratón · Shift', 'WASD · Mouse · Shift'],
  lock_touch2: ['Joystick · Deslizar para mirar', 'Joystick · Swipe to look'],
  skip: ['Enter · saltar', 'Enter · skip'],
  rotate: ['Gira tu teléfono', 'Rotate your phone'],
  rotate2: ['La experiencia se juega en horizontal', 'The experience is played in landscape'],
  t_crouch: ['Agachar', 'Crouch'],
  t_touch: ['Tocar', 'Touch'],
  t_blink: ['Parpadear', 'Blink'],
  t_skip: ['Saltar ›', 'Skip ›'],
  pause: ['Pausa', 'Paused'],
  pause_h: ['La montaña espera', 'The mountain waits'],
  resume: ['Continuar', 'Resume'],
  to_menu: ['Volver al menú', 'Back to menu'],
  retry: ['Intentar de nuevo', 'Try again'],
  over: ['Fin del camino', 'End of the road'],
  cap1: ['Antu y Nairoby. Mejores amigos.', 'Antu and Nairoby. Best friends.'],
  cap2: ['Vinieron a la montaña a encontrarse.', 'They came to the mountain to find themselves.'],
  cap_bear: ['Algo los observa desde lo alto.', 'Something watches them from above.'],
  obj_lake: ['Sal del sendero y busca el lago', 'Leave the trail and find the lake'],
  obj_climb: ['Sube hacia el destello', 'Climb toward the glint'],
  hint_touch_desk: ['Pulsa E para tocar la piedra', 'Press E to touch the stone'],
  hint_touch_mob: ['Pulsa Tocar', 'Press Touch'],
  obj_duel: ['Sostén la mirada del oso', 'Hold the bear\u2019s gaze'],
  obj_escape: ['Escapa del bosque', 'Escape the forest'],
  hint_pack: ['No los mires a los ojos ni te acerques. Agáchate y sigue.', 'Don\u2019t meet their eyes or get close. Crouch and keep going.'],
  hint_run: ['¡Corre! Shift', 'Run! Shift'],
  hint_run_mob: ['¡Corre! Lleva el joystick al borde', 'Run! Push the joystick to the edge'],
  blinked: ['Parpadeaste. El oso lo notó.', 'You blinked. The bear noticed.'],
  burning: ['Tus ojos arden… parpadeas sin querer.', 'Your eyes burn… you blink without meaning to.'],
  f_look: ['Apartaste la mirada.', 'You looked away.'],
  f_fear: ['El oso sintió tu miedo.', 'The bear felt your fear.'],
  f_duel_t: ['El oso no te aceptó', 'The bear did not accept you'],
  f_duel_d: ['Sostén su mirada con calma: él decide si puedes pasar.', 'Hold its gaze calmly: it decides whether you may pass.'],
  f_pack_t: ['Los desafiaste', 'You challenged them'],
  f_pack_d: ['Mirar fijo o acercarte es una amenaza. Pasa despacio, agachado y sin mirarlos.', 'Staring or getting close is a threat. Pass slowly, crouched, without looking at them.'],
  f_caught_t: ['El oso los alcanzó', 'The bear caught you'],
  f_caught_d: ['No te detengas. Corre cuando estés lejos de los demás osos.', 'Don\u2019t stop. Run when you are away from the other bears.'],
  mountain: ['Sierra de la Sangre de Cristo', 'Sangre de Cristo Mountains'],
  end: ['Fin', 'The End'],
  quote: ['“Los osos no nos atacaron. Nos miraron… y nos dejaron ir.”', '“The bears didn\u2019t attack us. They looked at us… and let us go.”'],
  c_story: ['Una historia de', 'A story by'],
  c_cast: ['Protagonistas', 'Starring'],
  c_and: ['Y', 'And'],
  c_bears: ['El oso del árbol · madres y cachorros', 'The bear in the tree · mothers and cubs'],
  c_world: ['Mundo', 'World'],
  c_world_d: ['Terreno procedural, agua reflectante, cielo dinámico', 'Procedural terrain, reflective water, dynamic sky'],
  c_anim: ['Animación', 'Animation'],
  c_anim_d: ['Rigs y máquinas de estado a medida', 'Custom rigs and state machines'],
  c_voice: ['Voces', 'Voices'],
  c_voice_d: ['Voces neuronales en español e inglés', 'Neural voices in Spanish and English'],
  c_sound: ['Sonido', 'Sound'],
  c_sound_d: ['Paisaje sonoro procedural en tiempo real', 'Real-time procedural soundscape'],
  respect: ['Respeta la fauna. Mantén la distancia. No corras hacia ellos.', 'Respect wildlife. Keep your distance. Never run toward them.'],
} satisfies Record<string, [string, string]>;

export type StrKey = keyof typeof S;
export const t = (k: StrKey) => S[k][lang === 'es' ? 0 : 1];
export const line = (id: LineId) => ({ s: LINES[id].s, text: LINES[id][lang] });
export const lineIds = Object.keys(LINES) as LineId[];

const listeners: (() => void)[] = [];
export const onLang = (f: () => void) => listeners.push(f);
export function setLang(l: Lang) {
  lang = l;
  localStorage.setItem('osos.lang', l);
  document.documentElement.lang = l;
  applyLang(document.body);
  listeners.forEach((f) => f());
}
/** Fill every element tagged with data-t="key" (innerHTML) / data-tl="key" (aria-label). */
export function applyLang(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => (el.innerHTML = t(el.dataset.t as StrKey)));
}
