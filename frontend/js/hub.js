import { el, esc, plural, icons, pct } from './ui.js';
import { GAMES } from './registry.js';
import { fetchStats, onStats } from './api.js';
import { loadDigits } from './ml/models.js';
import { signSvg } from './games/signs.js';
import { PREVIEW } from './ml/masks.js';
import { MarkovPredictor } from './ml/markov.js';
import { humanLikeSeq } from './ml/randomness.js';


export function renderHub(view, top) {
  top.append(el(`<div class="mark">${icons.mark}<span class="wordmark">Człowiek kontra AI</span></div>`));

  const node = el(`
    <section class="hub">
      <nav class="tiles" aria-label="Gry">
        ${GAMES.map((g) => `
          <div class="tile tile--${g.id}" role="link" tabindex="0" data-go="${g.id}">
            <span class="cap"><span>${esc(g.tech)}</span></span>
            <span class="tile__viz" data-viz="${g.id}"></span>
            <span class="tile__body">
              <span class="tile__title">${esc(g.title)}</span>
              <span class="tile__line">${g.line.map(esc).join('<br>')}</span>
            </span>
            <span class="tile__go">${icons.play}<span>Zagraj</span></span>
          </div>`).join('')}
      </nav>
      <section class="readouts">
        <div class="readout stats-count">
          <div class="r-top"><span class="st-games">0</span><small class="st-unit">gier</small></div>
          <div class="r-label">rozegrano dziś na stoisku</div>
        </div>
        <i class="readouts__rule" aria-hidden="true"></i>
        <div class="readout stats-vs">
          <div class="r-top r-top--bars">
            <div class="vsrow vsrow--you"><span>Ludzie</span><div class="track"><i class="st-h"></i></div><b class="st-hv">–</b></div>
            <div class="vsrow vsrow--ai"><span>AI</span><div class="track"><i class="st-a"></i></div><b class="st-av">–</b></div>
          </div>
          <div class="r-label">wygrane gry dziś: ludzie vs AI</div>
        </div>
      </section>
    </section>`);
  view.append(node);

  const $ = (s) => node.querySelector(s);
  const off = onStats((s) => {
    $('.st-games').textContent = String(s.games);
    $('.st-unit').textContent = plural(s.games, 'gra', 'gry', 'gier');
    const win = s.win ?? null;   // udział gier wygranych przez ludzi (remis = pół punktu)
    if (win == null) {
      $('.st-h').style.width = '0%'; $('.st-a').style.width = '0%';
      $('.st-hv').textContent = '–'; $('.st-av').textContent = '–';
    } else {
      const h = Math.round(win * 100);
      $('.st-h').style.width = `${h}%`; $('.st-a').style.width = `${100 - h}%`;
      $('.st-hv').textContent = `${h}%`; $('.st-av').textContent = `${100 - h}%`;
    }
  });
  fetchStats();
  const poll = setInterval(fetchStats, 30_000);

  // --- podglądy: wszystkie 3 kafelki animują się jednocześnie, płynnie, w jednej pętli requestAnimationFrame
  const demos = [
    demoMind(node.querySelector('[data-viz="mind"]')),
    demoIllusion(node.querySelector('[data-viz="illusion"]')),
    demoAutopilot(node.querySelector('[data-viz="autopilot"]')),
  ];
  let raf = 0;
  const t0 = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    demos.forEach((d) => d.frame(now - t0));
  };
  raf = requestAnimationFrame(loop);

  // kafelki to zwykłe elementy (nie linki), więc przechodzimy do gry ręcznie
  node.querySelectorAll('.tile[data-go]').forEach((t) => {
    const go = () => { location.hash = `#/${t.dataset.go}`; };
    t.addEventListener('click', go);
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });

  return () => { cancelAnimationFrame(raf); off(); clearInterval(poll); };
}

// ---------------------------------------------------------------------------- podglądy (dema)
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, k) => a + (b - a) * k;

/**
 * Kafelek 1: symulowany "człowiek" klika co 0,85 s, prawdziwy predyktor Markowa zgaduje.
 * 16 pustych pól zapełnia się po kolei; gdy wszystkie są pełne, wynik chwilę zostaje, pola płynnie się
 * opróżniają i przychodzi nowy "gracz". Procent nie znika między rundami (zostaje ostatni wynik).
 */
export function demoMind(host) {
  const N = 16, STEP = 850, HOLD = 2400, CLEAR = 900, CYCLE = N * STEP + HOLD + CLEAR + 400;
  host.innerHTML = `<span class="pv"><span class="pv-sq pv-bits">${'<i></i>'.repeat(N)}</span><span class="pv-pred"><small>AI przewidziało</small><b class="pv-accv">–</b><em>twoich ruchów</em></span></span>`;
  const cells = [...host.querySelectorAll('.pv-bits i')];
  const accEl = host.querySelector('.pv-accv');
  let cycle = -1, pred = null, seq = [], shown = 0, hits = 0, cleared = 0, accShown = null;
  return {
    frame(t) {
      const c = Math.floor(t / CYCLE), local = t % CYCLE;
      if (c !== cycle) {
        cycle = c; pred = new MarkovPredictor(); seq = humanLikeSeq(N); shown = 0; hits = 0; cleared = 0;
        cells.forEach((e) => { e.className = ''; e.textContent = ''; });
      }
      const want = Math.min(N, Math.floor(local / STEP + 0.5));
      while (shown < want) {
        const b = seq[shown];
        const ok = pred.predict().bit === b;
        pred.update(b);
        if (ok) hits++;
        const e = cells[shown++];
        e.textContent = b;
        e.className = ok ? 'ai' : 'you';
        void e.offsetWidth;
        e.classList.add('pop');
      }
      const clearAt = N * STEP + HOLD;
      const wantClear = local < clearAt ? 0 : Math.min(N, Math.floor(((local - clearAt) / CLEAR) * N) + 1);
      while (cleared < wantClear) { const e = cells[cleared++]; e.className = 'out'; }
      if (shown && cleared < N) accShown = accShown == null ? hits / shown : lerp(accShown, hits / shown, 0.06);
      accEl.textContent = accShown == null ? '–' : pct(accShown);
    },
  };
}

/** Kafelek 2: prawdziwa sieć MLP - co ~1,2 s zapala się kolejny wrażliwy punkt i decyzja sieci płynnie się zmienia. */
export function demoIllusion(host) {
  host.innerHTML = `<span class="pv"><span class="pv-sq pv-dots"></span><span class="pv-pred"><small>AI widzi</small><b>–</b><em></em></span></span>`;
  const grid = host.querySelector('.pv-dots');
  const lab = host.querySelector('.pv-pred b');
  const pp = host.querySelector('.pv-pred em');
  const CYCLE = 7200, MOVES_AT = [1500, 2700, 3900];
  let D = null, cells = [], L = null, cycle = -1, applied = 0, pShown = 0, pTarget = 0, k = 0;
  loadDigits().then((d) => {
    D = d;
    grid.style.setProperty('--g', D.G);
    grid.innerHTML = Array.from({ length: D.G * D.G }, () => '<i></i>').join('');
    cells = [...grid.children];
  }).catch(() => {});
  const draw = () => {
    const x = Float32Array.from(L.x);
    const moves = L.good.slice(0, applied);
    moves.forEach((i) => { x[i] = 1 - x[i]; });
    cells.forEach((c, i) => {
      // dołożona / zabrana kropka; świecące kropki z "+" (do dołożenia) albo "−" (do zabrania), jak w grze
      c.className = moves.includes(i) ? (L.x[i] ? 'rem' : 'add') : L.click.includes(i) ? (x[i] ? 'on hint-rm' : 'hint') : x[i] ? 'on' : '';
    });
    const p = D.net.predict(x, L.T);
    const top = p.indexOf(Math.max(...p));
    lab.textContent = D.names[top].toUpperCase();
    lab.className = top === L.src ? '' : 'is-ai';
    pTarget = p[top];
  };
  return {
    frame(t) {
      if (!D) return;
      const c = Math.floor(t / CYCLE), local = t % CYCLE;
      if (c !== cycle) {
        // nowa cyfra podmieniana bez animacji kropek (podgląd jest wtedy wygaszony), potem płynne pojawienie się
        cycle = c; L = D.levels[(k++ * 7) % D.levels.length]; applied = 0;
        grid.classList.add('no-anim'); draw(); void grid.offsetWidth; grid.classList.remove('no-anim');
        pShown = pTarget;
      }
      const want = MOVES_AT.filter((m) => local >= m).length;
      if (want !== applied) { applied = want; draw(); }
      grid.classList.toggle('is-out', local > CYCLE - 600);
      pShown = lerp(pShown, pTarget, 0.08);
      pp.textContent = pct(pShown);
    },
  };
}

// ---------------------------------------------------------------------------- kafelek 3
// Przykłady SPOZA gry (podgląd nie może zdradzać, gdzie naklejać w grze); co cykl inny przykład.
// przykłady SPOZA gry; naklejki zakrywają całą różnicę między cyframi (położenia z generatora masek)
const apEx = (sign, tgtSign, src, tgt, p0, p2) => ({ sign, src, tgt, p0, p2, stk: PREVIEW[`${sign}>${tgtSign}`].map(([x, y]) => ({ x: x / 100, y: y / 100 })) });
const AP_EXAMPLES = [
  apEx('limit60', 'limit80', '60 km/h', '80 km/h', 0.95, 0.97),
  apEx('limit100', 'limit120', '100 km/h', '120 km/h', 0.96, 0.95),
  apEx('limit70', 'limit20', '70 km/h', '20 km/h', 0.97, 0.94),
];
// oś czasu (ms w cyklu): czysty znak -> naklejka 1 -> naklejka 2 -> skan -> decyzja
const AP = { s1: 1300, s2: 2400, scan: 3300, done: 4100, out: 6600, cycle: 7200 };
const apPhase = (l) => (l < AP.s1 ? 0 : l < AP.s2 ? 1 : l < AP.scan ? 2 : l < AP.done ? 3 : 4);
/** pętla: nowy przykład bez animacji na początku cyklu (podgląd jest wygaszony), wygaszenie pod koniec */
function apLoop(root, onCycle, onFrame) {
  let cycle = -1;
  return (t) => {
    const c = Math.floor(t / AP.cycle), local = t % AP.cycle;
    if (c !== cycle) { cycle = c; root.classList.add('no-anim'); onCycle(c); void root.offsetWidth; root.classList.remove('no-anim'); }
    root.classList.toggle('is-out', local > AP.out);
    onFrame(local, apPhase(local));
  };
}

/**
 * Kafelek 3: znak w ramce detekcji (narożniki jak w grze), naklejki wskakują jedna po drugiej, skan kamery,
 * po skanie decyzja autopilota zmienia się na inny znak, a ramka zielenieje.
 */
export function demoAutopilot(host) {
  host.innerHTML = `<span class="pv"><span class="pv-sq pv-apf"><span class="apf-box"><span class="apf-sign"></span><span class="ap-stk k0"></span><span class="ap-stk k1"></span><span class="apf-scan"></span></span></span><span class="pv-pred"><small>Autopilot widzi</small><b class="is-stop">–</b><em>–</em></span></span>`;
  const sq = host.querySelector('.pv-apf');
  const signEl = sq.querySelector('.apf-sign');
  const stk = [...sq.querySelectorAll('.ap-stk')];
  const lab = host.querySelector('.pv-pred b'), pp = host.querySelector('.pv-pred em');
  let ex = AP_EXAMPLES[0], p = ex.p0;
  const loop = apLoop(sq, (c) => {
    ex = AP_EXAMPLES[c % AP_EXAMPLES.length];
    signEl.innerHTML = signSvg(ex.sign);
    ex.stk.forEach((s, j) => { stk[j].style.left = `${9 + s.x * 82}%`; stk[j].style.top = `${9 + s.y * 82}%`; });
    p = ex.p0;
  }, (local, phase) => {
    stk.forEach((s, j) => s.classList.toggle('on', phase >= j + 1));
    sq.classList.toggle('is-scan', phase === 3);
    sq.classList.toggle('is-done', phase >= 4);
    const hacked = phase >= 4;
    lab.textContent = hacked ? ex.tgt : ex.src;
    lab.className = hacked ? 'is-go' : 'is-stop';
    p = lerp(p, hacked ? ex.p2 : ex.p0, 0.12);
    pp.textContent = pct(p);
  });
  return { frame: loop };
}
