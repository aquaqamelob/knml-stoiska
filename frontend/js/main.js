import { renderHub } from './hub.js';
import { openGame } from './shell.js';
import { byId } from './registry.js';
import { reducedMotion, el } from './ui.js';
import { resetToday, getSettings, saveSettings, setAdminPass } from './api.js';
import { preloadModels } from './ml/models.js';

// --- scena 1920x1080 skalowana do monitora (tak samo jak na ekranie robota ADAS) -------------
const stage = document.getElementById('stage');
function layout() {
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transform = `scale(${s})`;
  stage.style.left = `${(innerWidth - 1920 * s) / 2}px`;
  stage.style.top = `${(innerHeight - 1080 * s) / 2}px`;
}
addEventListener('resize', layout);
layout();

// --- widoki ----------------------------------------------------------------------------------
const view = document.getElementById('view');
const top = document.getElementById('top');
let cleanup = null;
let currentRoute = null;

function show(render, key) {
  const run = () => {
    try { cleanup?.(); } catch (e) { console.error(e); }
    cleanup = null;
    view.replaceChildren();
    top.replaceChildren();
    // typ widoku zmieniamy dopiero tutaj (w środku przejścia): wcześniej stary pasek strony głównej
    // tracił wyśrodkowanie i na moment pokazywał "Człowiek kontra AI" w lewym rogu
    stage.dataset.view = key;
    cleanup = render(view, top) || null;
  };
  if (document.startViewTransition && !reducedMotion()) {
    const t = document.startViewTransition(run);
    // przerwane przejście (np. zmiana rozmiaru okna) nie jest błędem
    t.ready?.catch(() => {}); t.finished?.catch(() => {}); t.updateCallbackDone?.catch(() => {});
  } else run();
}

function route() {
  const id = location.hash.replace(/^#\/?/, '');
  const game = byId[id.split('/')[0]];          // np. "autopilot/v2" = gra autopilot, wariant widoku v2
  const key = game ? id : 'hub';
  if (key === currentRoute) return;
  currentRoute = key;
  show((v, t) => (game ? openGame(v, t, game) : renderHub(v, t)), key);
}

window.addEventListener('hashchange', route);
route();

// --- tryb kiosku -----------------------------------------------------------------------------
// Powrót do menu po bezczynności (ktoś odszedł w trakcie gry).
const IDLE_MS = 75_000;
let lastInput = Date.now();
for (const ev of ['pointerdown', 'pointermove', 'keydown', 'touchstart']) {
  window.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true });
}
setInterval(() => {
  if (currentRoute !== 'hub' && Date.now() - lastInput > IDLE_MS) location.hash = '#/';
}, 3000);

window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;   // pisanie hasła nie uruchamia skrótów
  if (e.key === 'Escape' && currentRoute !== 'hub') location.hash = '#/';
  if ((e.key === 'f' || e.key === 'F') && currentRoute === 'hub') {
    (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {});
  }
});
window.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
window.addEventListener('dragstart', (e) => e.preventDefault());

// Logotypy: podmiana plików w assets/ widoczna bez przeładowania (co 20 s, jak na ekranie robota).
function refreshLogos() {
  const v = Date.now();
  document.getElementById('logoKolo').src = `/logo/kolo?v=${v}`;
  document.getElementById('logoRzeszow').src = `/logo/rzeszow?v=${v}`;
}
setInterval(refreshLogos, 20_000);

preloadModels();

// --- obsługa stoiska: 5 kliknięć w logo koła naukowego (w ciągu 3 s) -> hasło -> panel obsługi:
//     ukrycie/pokazanie statystyk na stronie głównej i wyzerowanie dzisiejszych statystyk.
//     Okno zamyka się tylko przyciskiem (kolejne kliknięcia w tło niczego nie psują).
const ADMIN_PASS = 'KNML';
const applySettings = (st) => { stage.dataset.stats = st.statsVisible === false ? 'off' : 'on'; };
getSettings().then(applySettings);

let logoClicks = [];
document.getElementById('logoKolo').addEventListener('click', () => {
  const now = Date.now();
  logoClicks = logoClicks.filter((t) => now - t < 3000);
  logoClicks.push(now);
  if (logoClicks.length >= 5) { logoClicks = []; openAdmin(); }
});

function openAdmin() {
  const root = document.getElementById('overlay-root');
  if (root.querySelector('.admin')) return;
  const n = el(`<div class="admin" role="dialog" aria-modal="true" aria-label="Obsługa stoiska"><div class="panel admin__box"></div></div>`);
  const box = n.querySelector('.admin__box');
  const close = () => n.remove();
  n.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  const login = () => {
    box.innerHTML = `
      <form class="admin__form" autocomplete="off">
        <h2>Obsługa stoiska</h2>
        <p>Wpisz hasło obsługi.</p>
        <input class="admin__pass" type="password" aria-label="Hasło" spellcheck="false">
        <p class="admin__msg" aria-live="polite"></p>
        <div class="admin__btns">
          <button class="btn btn--ghost" type="button" data-a="close">Anuluj</button>
          <button class="btn btn--primary" type="submit">Zaloguj</button>
        </div>
      </form>`;
    const input = box.querySelector('.admin__pass');
    box.querySelector('[data-a="close"]').addEventListener('click', close);
    box.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      if (input.value.trim().toUpperCase() !== ADMIN_PASS) {
        const msg = box.querySelector('.admin__msg');
        msg.textContent = 'Nieprawidłowe hasło';
        msg.dataset.tone = 'stop';
        input.value = '';
        input.focus();
        return;
      }
      setAdminPass(input.value.trim());
      panel();
    });
    input.focus();
  };

  const panel = async () => {
    const st = await getSettings();
    const visible = st.statsVisible !== false;
    box.innerHTML = `
      <h2>Obsługa stoiska</h2>
      <div class="admin__row">
        <div><b>Statystyki na stronie głównej</b><span>${visible ? 'Teraz widoczne dla odwiedzających' : 'Teraz ukryte'}</span></div>
        <button class="btn ${visible ? 'btn--ghost' : 'btn--primary'}" type="button" data-a="toggle">${visible ? 'Ukryj' : 'Pokaż'}</button>
      </div>
      <div class="admin__row">
        <div><b>Dzisiejsze statystyki</b><span>Liczba gier i wynik ludzie kontra AI</span></div>
        <button class="btn btn--danger" type="button" data-a="reset">Wyzeruj</button>
      </div>
      <p class="admin__msg" aria-live="polite"></p>
      <div class="admin__btns admin__btns--one"><button class="btn btn--ghost" type="button" data-a="close">Zamknij</button></div>`;
    const msg = box.querySelector('.admin__msg');
    box.querySelector('[data-a="close"]').addEventListener('click', close);
    box.querySelector('[data-a="toggle"]').addEventListener('click', async () => {
      applySettings(await saveSettings({ statsVisible: !visible }));
      panel();
    });
    box.querySelector('[data-a="reset"]').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Na pewno?'; return; }
      await resetToday();
      b.textContent = 'Wyzerowano';
      b.disabled = true;
      msg.textContent = 'Wyzerowano dzisiejsze statystyki';
      msg.dataset.tone = 'go';
    });
  };

  root.append(n);
  login();
}
