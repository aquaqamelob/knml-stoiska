// Gra 3: "Oszukaj autopilot" - tryb "w ciemno": gracz układa naklejki (1 lub 2, tyle ile naprawdę trzeba) bez podpowiedzi,
// a wynik (i mapę uwagi AI) widzi dopiero po kliknięciu "SPRAWDŹ KAMERĘ AI". 1 skan na znak.
// Karta po prawej pokazuje pełny rozkład softmax (znak, cel, inne znaki), zaokrąglony tak, by suma = 100%.
import { el, resultScreen, esc, pcts, plural } from '../ui.js';
import { SCENARIOS, evaluate, drawHeat } from '../ml/attention.js';
import { signSvg } from './signs.js';
import { camLayers, camFx } from './apcam.js';
import { cardMarkup } from './apcard.js';

const WIN_P = 0.8;
const TRIES = 1;   // jeden skan na znak - trzeba dobrze pomyśleć przed sprawdzeniem
const CAM = { w: 1208, h: 800 };
const SIGN = { x: 250, y: 170, size: 440 };
const PAD = 0.16;                       // margines płótna mapy uwagi wokół znaku
const RING = 4;                          // biała obwódka naklejki (px), liczona do jej widocznego boku
/** miejsca startowe n naklejek w panelu "Naklejki" (jedna pod drugą, wyśrodkowane przy znaku) */
const nakl = (n) => `${n} ${plural(n, 'naklejkę', 'naklejki', 'naklejek')}`;
const homes = (n, side) => Array.from({ length: n }, (_, j) => ({ x: 1000, y: Math.round(SIGN.y + SIGN.size / 2 + (j - (n - 1) / 2) * (side + 36)) }));
const SCAN_MS = 600;
const HEAT_MS = 2000;
const SIGN_NAME = { limit30: '30 km/h', priorityend: 'końca drogi z pierwszeństwem', limit50: '50 km/h', nostopping: 'zakazu zatrzymywania się', limit20: '20 km/h' };
const NEED_WINS = 3;   // człowiek wygrywa grę przy 3 z 5 zhakowanych znaków, inaczej wygrywa AI

export function mount(stage, ctx) {
  (async () => {
    while (!ctx.signal.aborted) {
      const res = await play(stage, ctx);
      if (!res || ctx.signal.aborted) return;
      ctx.setHud(''); ctx.setGoal(null);
      const act = await resultScreen(stage, res);
      if (act === 'home') return ctx.home();
    }
  })();
}

function paintSticker(cv, seed) {
  const n = 12;
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const pal = [[255, 45, 160], [0, 220, 255], [255, 230, 0], [20, 20, 20], [130, 60, 255], [255, 120, 30], [240, 240, 240]];
  const img = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) img.data.set([...pal[Math.floor(rnd() * pal.length)], 255], i * 4);
  g.putImageData(img, 0, 0);
}

const hudTotal = (r, res, n) => `<div class="dots">${Array.from({ length: n }, (_, i) => `<span class="dot ${res[i] === true ? 'ok' : res[i] === false ? 'bad' : i === r ? 'cur' : ''}"></span>`).join('')}</div><div class="pts"><b>${Math.min(r + 1, n)}</b><span>/ ${n}</span></div>`;

async function play(stage, ctx) {
  const results = [];
  for (let r = 0; r < SCENARIOS.length; r++) {
    ctx.setHud(hudTotal(r, results, SCENARIOS.length));
    const sc = SCENARIOS[r];
    ctx.setGoal(`Przyklej ${nakl(sc.n)} na znaku <b class="src">${esc(SIGN_NAME[sc.sign])}</b>, aby zmylić kamerę!`);
    const ok = await round(stage, ctx, sc, r === SCENARIOS.length - 1);
    if (ok == null || ctx.signal.aborted) return null;
    results.push(ok);
  }
  const won = results.filter(Boolean).length;
  const human = won >= NEED_WINS;
  ctx.report('autopilot', won / SCENARIOS.length, { won });
  return {
    score: `${won}/${SCENARIOS.length}`,
    scoreLabel: 'znaki zhakowane',
    headline: won === SCENARIOS.length ? 'Autopilot całkowicie oszukany!' : human ? 'Autopilot oszukany!' : 'Autopilot się obronił',
    body: el(`<p class="lesson__note lesson__note--big">Gdy naklejki zasłonią to, czym dwa znaki się różnią, sieć nie mówi „nie wiem”, tylko pewnie wybiera zły znak. Dlatego pojazdy autonomiczne, tak jak robot obok, łączą kamerę z innymi czujnikami i mapą.</p>`),
    tone: human ? 'go' : 'stop',
  };
}

// [znak, cel, inne] w pełnych procentach, suma = 100. Softmax nigdy nie daje dokładnie 0%,
// więc każda klasa pokazuje min. 1% (brakujący punkt oddaje klasa najpewniejsza).
const dist = (r) => {
  const v = pcts([r.pSrc, r.pTgt, Math.max(0, 1 - r.pSrc - r.pTgt)]);
  for (let k = 0; k < v.length; k++) {
    if (v[k] < 1) { const m = v.indexOf(Math.max(...v)); v[m] -= 1 - v[k]; v[k] = 1; }
  }
  return v;
};

function round(stage, ctx, sc, last) {
  return new Promise((resolve) => {
    const p0 = dist(evaluate(sc, []));
    const N = sc.n;
    const SIDE = Math.round(sc.stk * SIGN.size);          // widoczny bok naklejki (z obwódką)
    const STK = SIDE - 2 * RING;
    const HOME = homes(N, SIDE);
    const L = camLayers({ SIGN, HOME, side: SIDE });
    const node = el(`
      <div class="ap ap--v5 ap--net enter">
        <div class="ap__main">
          <figure class="ap__cam panel" style="width:${CAM.w}px;height:${CAM.h}px">
            ${L.back}
            <div class="ap__pole" style="left:${SIGN.x + SIGN.size / 2 - 9}px;top:${SIGN.y + SIGN.size - 10}px;height:${CAM.h - SIGN.y - SIGN.size + 10}px"></div>
            ${L.mid}
            <div class="ap__sign" style="left:${SIGN.x}px;top:${SIGN.y}px;width:${SIGN.size}px;height:${SIGN.size}px">
              ${signSvg(sc.sign, 'ap__signsvg')}
              <canvas class="ap__heat" style="left:${-PAD * 100}%;top:${-PAD * 100}%;width:${100 + 200 * PAD}%;height:${100 + 200 * PAD}%"></canvas>
              <div class="ap__sweep"></div>
              <div class="ap__box"><span class="ap__tag">${esc(sc.src.tag)} · ${p0[0]}%</span></div>
            </div>
            ${L.front}
            ${L.tray}
            ${HOME.map((_, j) => `<div class="stk" data-j="${j}" style="width:${STK}px;height:${STK}px"><canvas class="stk__img"></canvas></div>`).join('')}
            <span class="cam-frame"></span>
          </figure>
          ${cardMarkup(sc, p0)}
        </div>
      </div>`);
    stage.replaceChildren(node);
    const $ = (s) => node.querySelector(s);
    const cam = $('.ap__cam');
    const heat = $('.ap__heat');
    const hg = heat.getContext('2d');
    const btn = $('.ap__btn');
    const stks = [...node.querySelectorAll('.stk')];
    stks.forEach((s, j) => paintSticker(s.querySelector('.stk__img'), 7 + j * 13 + sc.id.length));

    const pos = HOME.map((p) => ({ ...p }));
    let drag = -1, off = { x: 0, y: 0 };
    let phase = 'place';            // place | scan | won | lost
    let tries = TRIES;
    let heatUntil = 0, heatState = null, raf = 0, solution = false;
    const toSign = (p) => ({ x: (p.x - SIGN.x) / SIGN.size, y: (p.y - SIGN.y) / SIGN.size });
    const onSign = (p) => { const s = toSign(p); return s.x > 0.04 && s.x < 0.96 && s.y > 0.04 && s.y < 0.96; };
    const placeStk = () => stks.forEach((s, j) => { s.style.transform = `translate(${pos[j].x - STK / 2}px, ${pos[j].y - STK / 2}px)`; });
    const fx = camFx(node);

    // jeden przycisk akcji, którego stan wynika z sytuacji w grze
    const updateBtn = () => {
      const placed = pos.filter(onSign).length;
      btn.className = 'ap__btn';
      btn.disabled = false;
      if (phase === 'won') { btn.classList.add('is-next'); btn.textContent = last ? 'Zobacz wynik →' : 'Następny znak →'; return; }
      if (phase === 'lost') { btn.classList.add('is-lost'); btn.textContent = last ? 'Zobacz wynik →' : 'Następny znak →'; return; }
      if (phase === 'scan') { btn.classList.add('is-scan'); btn.disabled = true; btn.textContent = 'SKANOWANIE…'; return; }
      if (placed < N) { btn.classList.add('is-idle'); btn.disabled = true; btn.textContent = `Przeciągnij ${nakl(N)} na znak (${placed}/${N})`; return; }
      btn.classList.add('is-ready');
      btn.textContent = 'SPRAWDŹ KAMERĘ AI';
    };
    placeStk(); updateBtn();

    // mapa uwagi: widoczna tylko po skanowaniu (2 s) i po przegranej rundzie jako rozwiązanie
    const drawFrame = (now) => {
      const k = cam.getBoundingClientRect().width / cam.offsetWidth;
      const size = Math.round(SIGN.size * k * Math.min(2, devicePixelRatio || 1));
      const full = Math.round(size * (1 + 2 * PAD));
      if (heat.width !== full) { heat.width = full; heat.height = full; }
      if (heatState && (now < heatUntil || phase === 'lost' || phase === 'won')) {
        drawHeat(hg, sc, heatState.st, size, now, heatState.S, { hint: solution ? 1 : 0, pad: PAD });
        heat.classList.add('is-on');
      } else {
        heat.classList.remove('is-on');
      }
      fx.frame(now);
      raf = requestAnimationFrame(drawFrame);
    };
    raf = requestAnimationFrame(drawFrame);

    const camPoint = (e) => {
      const r = cam.getBoundingClientRect();
      const k = r.width / cam.offsetWidth;
      return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
    };
    stks.forEach((s, j) => {
      s.addEventListener('pointerdown', (e) => {
        if (phase !== 'place') return;
        e.preventDefault();
        try { s.setPointerCapture(e.pointerId); } catch { /* */ }
        const p = camPoint(e);
        drag = j; off = { x: p.x - pos[j].x, y: p.y - pos[j].y };
        heatUntil = 0;
        s.classList.add('is-drag');
      });
      s.addEventListener('pointermove', (e) => {
        if (drag !== j) return;
        const p = camPoint(e);
        pos[j].x = Math.max(STK / 2, Math.min(CAM.w - STK / 2, p.x - off.x));
        pos[j].y = Math.max(STK / 2, Math.min(CAM.h - STK / 2, p.y - off.y));
        placeStk(); updateBtn();
      });
      const end = () => { if (drag === j) { drag = -1; s.classList.remove('is-drag'); updateBtn(); } };
      s.addEventListener('pointerup', end);
      s.addEventListener('pointercancel', end);
    });

    // pasek i liczby: [znak, cel, inne] w pełnych procentach, suma zawsze 100
    const VALS = ['.v-src', '.v-tgt', '.v-oth'];
    let shown = p0.slice();
    const card = $('.ap__card');
    const setBars = (v) => ['--ps', '--pt', '--po'].forEach((n, k) => card.style.setProperty(n, v[k]));   // pasek "wyjście sieci" (CSS)
    const animateTo = (to) => {
      const from = shown.slice();
      shown = to.slice();
      setBars(to);
      const t0 = performance.now();
      const step = (now) => {
        const u = Math.min(1, (now - t0) / 700);
        const e = 1 - (1 - u) ** 3;
        VALS.forEach((v, k) => {
          node.querySelector(v).textContent = `${u < 1 ? Math.round(from[k] + (to[k] - from[k]) * e) : to[k]}%`;
        });
        if (u < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    requestAnimationFrame(() => setBars(p0));

    btn.addEventListener('click', () => {
      if (phase === 'won' || phase === 'lost') { cancelAnimationFrame(raf); resolve(phase === 'won'); return; }
      if (btn.disabled || phase !== 'place') return;
      phase = 'scan';
      updateBtn();
      node.classList.add('is-scanning');
      setTimeout(() => {
        node.classList.remove('is-scanning');
        const st = pos.map((p) => (onSign(p) ? toSign(p) : null));
        const r = evaluate(sc, st);
        heatState = { st, S: r.S };
        heatUntil = performance.now() + HEAT_MS;
        tries -= 1;
        const pr = dist(r);
        animateTo(pr);
        const tgtLead = pr[1] > pr[0];
        $('.ap__now').dataset.state = tgtLead ? 'tgt' : 'src';
        const box = $('.ap__box');
        box.classList.toggle('is-tgt', tgtLead);
        if (pr[1] >= WIN_P * 100) {
          phase = 'won';
          $('.ap__tag').textContent = `AUTOPILOT ZHAKOWANY · ${sc.tgt.tag} ${pr[1]}%`;
          node.classList.add('is-hacked');
        } else if (tries <= 0) {
          phase = 'lost';
          solution = true;
          $('.ap__tag').textContent = tgtLead
            ? `ZA SŁABO · ${sc.tgt.tag} ${pr[1]}% (cel 80%)`
            : `AUTOPILOT SIĘ OBRONIŁ · ${sc.src.tag} ${pr[0]}%`;
          node.classList.add('is-defended');
        } else {
          phase = 'place';
          $('.ap__tag').textContent = `${tgtLead ? sc.tgt.tag : sc.src.tag} · ${Math.max(pr[0], pr[1])}%`;
        }
        updateBtn();
      }, SCAN_MS);
    });

    ctx.signal.addEventListener('abort', () => { cancelAnimationFrame(raf); resolve(null); }, { once: true });
  });
}
