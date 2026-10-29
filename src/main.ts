import './style.css';
import { Game } from './game/Game';

const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  const el = document.querySelector('.loader-txt');
  if (el) el.textContent = 'No se pudo iniciar WebGL. Prueba otro navegador.';
});
