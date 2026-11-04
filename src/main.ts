import './style.css';
import { Game } from './game/Game';
import { t } from './i18n';

const game = new Game();
game.boot().catch((e) => {
  console.error(e);
  const el = document.querySelector('.loader-txt');
  if (el) el.textContent = t('webgl');
});
