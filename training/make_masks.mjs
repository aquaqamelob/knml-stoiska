// Generator masek ataków dla gry 3 ("Oszukaj autopilot") -> frontend/js/ml/masks.js
//
// Dla każdej pary "znak -> cel" renderuje oba znaki w Chrome (te same SVG co w grze) i liczy maskę
// różnicy, która ZDRADZA znak: elementy, których cel nie ma (czarny pas, cyfra), i "dziury" tam, gdzie
// cel ma linię (otwarte boki "3" zamiast "8"). Różnica jest pomijana, gdy ten sam kolor leży w drugim znaku
// najwyżej SHIFT jednostek dalej (kontur cyfry przesunięty o 1-2 jednostki, np. dolny łuk "3" i "8") - taki
// fragment wygląda jak część celu, więc nie zdradza znaku. Pojedyncze okruchy usuwa otwarcie morfologiczne.
// Potem szuka najmniejszych naklejek (zaokrąglone kwadraty z obrotem jak w grze), które zakrywają całą
// maskę, i dobiera ich liczbę tak, żeby każda była potrzebna (o jedną mniej, tej samej wielkości, nie wystarczy).
//
// Uruchomienie (kiosk musi działać na http://localhost:8080, potrzebny Chrome):
//   node training/make_masks.mjs
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.KIOSK || 'http://localhost:8080/';

// gra: [znak, cel]; liczba naklejek dobierana automatycznie (preferowane 2), bok = minimum + MARGIN (luz)
const GAME = [['limit30', 'limit80'], ['priorityend', 'priority'], ['limit50', 'closed'], ['nostopping', 'noparking'], ['limit20', 'limit70']];
const MARGIN = 5;
const SHIFT = 1;           // tolerancja przesunięcia konturu (jednostki znaku)
const OPEN_R = 1;          // promień otwarcia morfologicznego: usuwa okruchy węższe niż ok. 3 jednostki
const NEEDED = 0.92;       // o jedną naklejkę mniej może zakryć najwyżej tyle maski (próg wygranej w grze to ok. 96,5%)
// podgląd na stronie głównej: 2 naklejki o stałym boku (21% ramki = 25,6% znaku)
const PREVIEW = [['limit60', 'limit80'], ['limit100', 'limit120'], ['limit70', 'limit20']];
const PREVIEW_SIDE = 25.6;
// obrót naklejek (stopnie) - musi się zgadzać z CSS (.stk__img) i z attention.js
const TILT_GAME = [-5, 4, -2], TILT_PREVIEW = [-6, 5];
const RADIUS = 3.2;       // promień narożnika naklejki (14 px na znaku 440 px)

const S = 300, GAP = 320;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodePng(buf) {
  let pos = 8, w = 0, h = 0, type = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), name = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; }
    if (name === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = type === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), out = Buffer.alloc(w * h * bpp), stride = w * bpp;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x], a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y > 0 ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let r = v;
      if (f === 1) r = v + a; else if (f === 2) r = v + b; else if (f === 3) r = v + ((a + b) >> 1);
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[y * stride + x] = r & 255;
    }
  }
  return { w, h, bpp, px: out };
}

/** Renderuje pary znaków w headless Chrome i zwraca zrzut ekranu (zdekodowany PNG). */
async function renderPairs(pairs) {
  const prof = mkdtempSync(join(tmpdir(), 'masks-'));
  const port = 9399;
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1400,1800', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  try {
    let targets = null;
    for (let k = 0; k < 50 && !targets; k++) { await sleep(200); try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { /* start */ } }
    const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
    const send = (method, params = {}) => new Promise((res, rej) => { const mid = ++id; pending.set(mid, (msg) => (msg.error ? rej(new Error(msg.error.message)) : res(msg.result))); ws.send(JSON.stringify({ id: mid, method, params })); });
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1800, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: URL });
    await sleep(1500);
    const expr = `(async () => { await document.fonts.ready; const { signSvg } = await import('/js/games/signs.js');
      const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:0;top:0;width:1400px;height:1800px;background:#808080;z-index:999';
      d.innerHTML = ${JSON.stringify(pairs)}.flatMap((p, i) => p.slice(0, 2).map((s, k) => '<div style="position:absolute;left:' + (k * ${GAP} + (i % 2) * 700) + 'px;top:' + (Math.floor(i / 2) * ${GAP}) + 'px;width:${S}px;height:${S}px">' + signSvg(s) + '</div>')).join('');
      d.querySelectorAll('svg').forEach((s) => { s.style.cssText = 'width:100%;height:100%;display:block'; });
      document.body.append(d); await new Promise((r) => setTimeout(r, 300)); return 1; })()`;
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    ws.close();
    return decodePng(Buffer.from(shot.data, 'base64'));
  } finally {
    proc.kill();
    await sleep(300);
    try { rmSync(prof, { recursive: true, force: true }); } catch { /* Chrome jeszcze trzyma pliki */ }
  }
}

/** Maska różnicy zdradzającej znak (siatka 50x50, komórka = 2 jednostki znaku, indeks = wiersz * 50 + kolumna). */
function diffMask(img, i) {
  const ox = (i % 2) * 700, oy = Math.floor(i / 2) * GAP;
  const px = (x, y) => { const k = (y * img.w + x) * img.bpp; return [img.px[k], img.px[k + 1], img.px[k + 2]]; };
  // drobna siatka 100x100 (komórka 3 px = 1 jednostka): średni kolor komórki w znaku i w celu
  const col = (bx) => { const C = new Float32Array(100 * 100 * 3); for (let gy = 0; gy < 100; gy++) for (let gx = 0; gx < 100; gx++) { const a = [0, 0, 0]; for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) { const p = px(bx + gx * 3 + xx, oy + gy * 3 + yy); a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; } C.set(a.map((v) => v / 9), (gy * 100 + gx) * 3); } return C; };
  const SRC = col(ox), TGT = col(ox + GAP);
  const same = (A, i, B, j) => Math.abs(A[i * 3] - B[j * 3]) + Math.abs(A[i * 3 + 1] - B[j * 3 + 1]) + Math.abs(A[i * 3 + 2] - B[j * 3 + 2]) < 90;
  // czy kolor A w komórce (x, y) występuje w B w promieniu SHIFT
  const near = (A, B, x, y) => { for (let dy = -SHIFT; dy <= SHIFT; dy++) for (let dx = -SHIFT; dx <= SHIFT; dx++) { if (dx * dx + dy * dy > SHIFT * SHIFT) continue; const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < 100 && yy < 100 && same(A, y * 100 + x, B, yy * 100 + xx)) return true; } return false; };
  const F = new Uint8Array(100 * 100);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
    const i = y * 100 + x;
    if (same(SRC, i, TGT, i)) continue;
    // różnica zdradza znak, chyba że to tylko przesunięty kontur (oba kolory są obok w drugim znaku)
    F[i] = near(SRC, TGT, x, y) && near(TGT, SRC, x, y) ? 0 : 1;
  }
  // otwarcie morfologiczne dyskiem o promieniu OPEN_R: najpierw erozja, potem dylatacja
  const disk = [];
  for (let dy = -OPEN_R; dy <= OPEN_R; dy++) for (let dx = -OPEN_R; dx <= OPEN_R; dx++) if (dx * dx + dy * dy <= OPEN_R * OPEN_R) disk.push([dx, dy]);
  const at = (A, x, y) => (x >= 0 && y >= 0 && x < 100 && y < 100 ? A[y * 100 + x] : 0);
  const E = new Uint8Array(100 * 100), O = new Uint8Array(100 * 100);
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) E[y * 100 + x] = disk.every(([dx, dy]) => at(F, x + dx, y + dy)) ? 1 : 0;
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) O[y * 100 + x] = disk.some(([dx, dy]) => at(E, x + dx, y + dy)) ? 1 : 0;
  // siatka 50x50: komórka należy do maski, gdy co najmniej 2 z jej 4 drobnych komórek
  const cells = [];
  for (let gy = 0; gy < 50; gy++) for (let gx = 0; gx < 50; gx++) {
    const n = O[(2 * gy) * 100 + 2 * gx] + O[(2 * gy) * 100 + 2 * gx + 1] + O[(2 * gy + 1) * 100 + 2 * gx] + O[(2 * gy + 1) * 100 + 2 * gx + 1];
    if (n >= 2) cells.push(gy * 50 + gx);
  }
  return cells;
}

const inside = (x, y, c, s, deg) => {
  const th = (-deg * Math.PI) / 180, dx = x - c[0], dy = y - c[1];
  const u = Math.abs(dx * Math.cos(th) - dy * Math.sin(th)), v = Math.abs(dx * Math.sin(th) + dy * Math.cos(th)), h = s / 2;
  if (u > h || v > h) return false;
  if (u > h - RADIUS && v > h - RADIUS) return (u - (h - RADIUS)) ** 2 + (v - (h - RADIUS)) ** 2 <= RADIUS * RADIUS;
  return true;
};
const cover = (pts, cs, s, tilt) => pts.filter(([x, y]) => cs.some((c, j) => inside(x, y, c, s, tilt[j]))).length / pts.length;

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
function kmeans(pts, k) {
  let cs = [pts[Math.floor(rnd() * pts.length)].slice()];
  while (cs.length < k) {
    const d = pts.map((p) => Math.min(...cs.map((c) => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2)));
    let r = rnd() * d.reduce((a, b) => a + b), j = 0;
    while ((r -= d[j]) > 0) j++;
    cs.push(pts[j].slice());
  }
  for (let it = 0; it < 12; it++) {
    const g = cs.map(() => [0, 0, 0]);
    for (const p of pts) { let bj = 0, bd = 1e9; cs.forEach((c, j) => { const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2; if (dd < bd) { bd = dd; bj = j; } }); g[bj][0] += p[0]; g[bj][1] += p[1]; g[bj][2]++; }
    cs = cs.map((c, j) => (g[j][2] ? [g[j][0] / g[j][2], g[j][1] / g[j][2]] : c));
  }
  return cs;
}
/** Najlepsze położenie n naklejek o boku s (wielokrotny start z k-means + lokalne przesuwanie). */
function place(pts, n, s, tilt) {
  let top = { f: -1 };
  for (let rs = 0; rs < 24; rs++) {
    let cs = kmeans(pts, n), f = cover(pts, cs, s, tilt);
    for (let step = 4; step >= 0.25; step /= 2) {
      let imp = true;
      while (imp) {
        imp = false;
        for (let j = 0; j < n; j++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const t = cs.map((c) => c.slice()); t[j][0] += dx * step; t[j][1] += dy * step;
          const ft = cover(pts, t, s, tilt);
          if (ft > f + 1e-9) { f = ft; cs = t; imp = true; }
        }
      }
    }
    if (f > top.f) top = { f, cs };
  }
  return top;
}
function minimal(pts, n, tilt) {
  let lo = 8, hi = 70, sol = null;
  while (hi - lo > 0.25) { const m = (lo + hi) / 2, r = place(pts, n, m, tilt); if (r.f >= 0.999) { hi = m; sol = r.cs; } else lo = m; }
  return { s: hi, sol };
}
const r1 = (v) => Math.round(v * 10) / 10;

const all = [...GAME, ...PREVIEW];
const img = await renderPairs(all);
const out = { game: {}, preview: {} };
all.forEach(([a, b], i) => {
  const cells = diffMask(img, i), pts = cells.map((c) => [(c % 50) * 2 + 1, Math.floor(c / 50) * 2 + 1]);
  if (b && GAME.some((g) => g[0] === a)) {
    // dla n = 1..3: najmniejszy bok, bok w grze = minimum + luz, i czy o jedną naklejkę mniej nie wystarczy
    const opts = [];
    for (let n = 1; n <= 3; n++) {   // w grze najwyżej 3 naklejki (3 kąty obrotu w CSS)
      const { s, sol } = minimal(pts, n, TILT_GAME);
      const side = Math.ceil(s + MARGIN);
      const fewer = n > 1 ? place(pts, n - 1, side, TILT_GAME).f : 0;
      opts.push({ n, s, side, sol, fewer, ok: fewer < NEEDED && side <= 42 });
      console.log(`  ${a} -> ${b}: ${n} nakl. bok min ${r1(s)} -> ${side}; ${n - 1} nakl. tej wielkości zakryłyby ${(fewer * 100).toFixed(0)}% ${fewer < NEEDED ? '' : '(za dużo - któraś byłaby zbędna)'}`);
    }
    // preferowane 2 naklejki; jeśli się nie da, najbliższa liczba (przy remisie mniejsze naklejki)
    const pick = opts.filter((o) => o.ok).sort((x, y) => Math.abs(x.n - 2) - Math.abs(y.n - 2) || x.side - y.side)[0];
    const k = Math.max(3, Math.min(10, Math.round(cells.length / 20)));
    const blobs = kmeans(pts, k).map((c) => {
      const mine = pts.filter((p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < 14);
      const rr = Math.sqrt(mine.reduce((acc, p) => acc + (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2, 0) / Math.max(1, mine.length));
      return [r1(c[0]), r1(c[1]), r1(rr + 4)];
    });
    out.game[`${a}>${b}`] = { n: pick.n, side: pick.side, min: r1(pick.s), sol: pick.sol.map((c) => c.map(r1)), blobs, cells };
    console.log(`${a} -> ${b}: ${cells.length} komórek maski -> ${pick.n} naklejki, bok ${pick.side}`);
  } else {
    const r = place(pts, 2, PREVIEW_SIDE, TILT_PREVIEW);
    out.preview[`${a}>${b}`] = r.cs.map((c) => c.map((v) => r1(v)));
    console.log(`podgląd ${a} -> ${b}: ${cells.length} komórek, zakryte ${(r.f * 100).toFixed(1)}%`);
  }
});

const file = join(ROOT, 'frontend', 'js', 'ml', 'masks.js');
writeFileSync(file, `// WYGENEROWANE przez training/make_masks.mjs - nie edytuj ręcznie (po zmianie znaków uruchom generator ponownie).
// game[para]: n naklejek, side = bok naklejki (jednostki znaku 0-100, z luzem ${MARGIN}), min = najmniejszy bok,
// który jeszcze zakrywa całą różnicę, sol = przykładowe położenie naklejek (środki), blobs = strefy mapy uwagi [x, y, r],
// cells = komórki maski różnicy (siatka 50x50, indeks = wiersz * 50 + kolumna).
// preview[para]: środki 2 naklejek w podglądzie na stronie głównej (zakrywają całą różnicę).
export const TILT = ${JSON.stringify(TILT_GAME)};
export const TILT_PREVIEW = ${JSON.stringify(TILT_PREVIEW)};
export const RADIUS = ${RADIUS};
export const ATTACKS = ${JSON.stringify(out.game)};
export const PREVIEW = ${JSON.stringify(out.preview)};
`);
console.log('zapisano', file);
