// Model rozpoznawania znaków dla gry "Oszukaj autopilot" (deterministyczny, zgodnie ze specyfikacją).
//
// Sieć odróżnia znak od celu ataku po tym, czym te znaki się różnią: maska różnicy pikseli z masks.js
// (generator: training/make_masks.mjs). Każda para ma ten sam kształt i kolory, a różni się jednym
// elementem (cyfra, czarny pas, ramię X). Uczciwa zasada, do której nie da się przyczepić:
//   - dopóki widać choć kawałek różnicy, sieć widzi prawdziwy znak,
//   - gdy naklejki zakryją różnicę (prawie) całą, widoczna reszta jest piksel w piksel taka jak cel,
//     a sieć nie mówi "nie wiem": z dużą pewnością wybiera cel ataku.
// C = zakryta część różnicy (0-1). Logity (softmax z 3 pozostałymi klasami detektora):
//   z_znak = A - 2,6·C² - 1,8·C³⁰,   z_cel = B + 1,0·C² + 4,6·C³⁰
// Próg 80% pewności celu wypada przy C ≈ 96,5%, czyli zostać mogą najwyżej pojedyncze piksele brzegu.
import { ATTACKS, TILT, RADIUS } from './masks.js';

const A = 4.6, B = 0.7;
const OTHER = [0, -0.5, -1];            // pozostałe klasy detektora (pokazywane razem jako "inne znaki")

const BASE = [
  {
    // klasyczny atak na auta autonomiczne (35 → 85): zakryta pierwsza cyfra, reszta jak na "80"
    id: 'limit30', sign: 'limit30', tgtSign: 'limit80',
    src: { name: 'OGRANICZENIE 30 km/h', act: 'JADĘ 30 km/h', tag: '30 km/h' },
    tgt: { name: 'OGRANICZENIE 80 km/h', act: 'PRZYSPIESZAM DO 80', tag: '80 km/h' },
  },
  {
    // D-2 → D-1: zakryty czarny pas, auto myśli, że nadal ma pierwszeństwo
    id: 'priority', sign: 'priorityend', tgtSign: 'priority',
    src: { name: 'KONIEC PIERWSZEŃSTWA', act: 'ZWALNIAM', tag: 'KONIEC PIERWSZEŃSTWA' },
    tgt: { name: 'DROGA Z PIERWSZEŃSTWEM', act: 'JADĘ BEZ ZWALNIANIA', tag: 'PIERWSZEŃSTWO' },
  },
  {
    // B-33 → B-1: zakryte obie cyfry, zostaje pusty znak zakazu ruchu
    id: 'limit50', sign: 'limit50', tgtSign: 'closed',
    src: { name: 'OGRANICZENIE 50 km/h', act: 'JADĘ 50 km/h', tag: '50 km/h' },
    tgt: { name: 'ZAKAZ RUCHU', act: 'HAMOWANIE AWARYJNE', tag: 'ZAKAZ RUCHU' },
  },
  {
    // B-36 → B-35: zakryte ramię "/" krzyżyka, zostaje jeden pas jak na zakazie postoju
    id: 'nostopping', sign: 'nostopping', tgtSign: 'noparking',
    src: { name: 'ZAKAZ ZATRZYMYWANIA SIĘ', act: 'NIE ZATRZYMUJĘ SIĘ', tag: 'ZAKAZ ZATRZYMYWANIA' },
    tgt: { name: 'ZAKAZ POSTOJU', act: 'STAJĘ NA CHWILĘ', tag: 'ZAKAZ POSTOJU' },
  },
  {
    // 20 → 70: zakryta pierwsza cyfra (np. strefa przy szkole)
    id: 'limit20', sign: 'limit20', tgtSign: 'limit70',
    src: { name: 'OGRANICZENIE 20 km/h', act: 'JADĘ 20 km/h', tag: '20 km/h' },
    tgt: { name: 'OGRANICZENIE 70 km/h', act: 'PRZYSPIESZAM DO 70', tag: '70 km/h' },
  },
];

const u = (v) => v / 100;   // jednostki znaku (0-100) → ułamek boku znaku (0-1)
export const SCENARIOS = BASE.map((sc) => {
  const m = ATTACKS[`${sc.sign}>${sc.tgtSign}`];
  const pts = m.cells.map((c) => [u((c % 50) * 2 + 1), u(Math.floor(c / 50) * 2 + 1)]);
  const blobs = m.blobs.map(([x, y, r]) => ({ x: u(x), y: u(y), r: u(r) }));
  // każdy punkt maski należy do najbliższej strefy mapy uwagi
  const owner = pts.map(([x, y]) => blobs.reduce((bi, b, i) => (Math.hypot(x - b.x, y - b.y) < Math.hypot(x - blobs[bi].x, y - blobs[bi].y) ? i : bi), 0));
  return { ...sc, n: m.n, stk: u(m.side), sol: m.sol.map(([x, y]) => ({ x: u(x), y: u(y) })), blobs, pts, owner };
});

/** Czy punkt (x, y) leży pod naklejką: zaokrąglony kwadrat o boku s, obrócony o deg stopni. */
function under(x, y, c, s, deg) {
  const th = (-deg * Math.PI) / 180, dx = x - c.x, dy = y - c.y;
  const a = Math.abs(dx * Math.cos(th) - dy * Math.sin(th)), b = Math.abs(dx * Math.sin(th) + dy * Math.cos(th));
  const h = s / 2, r = u(RADIUS);
  if (a > h || b > h) return false;
  if (a > h - r && b > h - r) return (a - (h - r)) ** 2 + (b - (h - r)) ** 2 <= r * r;
  return true;
}

/** stickers: [{x, y} | null] we współrzędnych znaku (0..1), w kolejności naklejek (obrót wg TILT). */
export function evaluate(sc, stickers) {
  const hit = sc.pts.map(([x, y]) => stickers.some((s, j) => s && under(x, y, s, sc.stk, TILT[j % TILT.length])));
  const C = hit.filter(Boolean).length / hit.length;
  // zakryta część każdej strefy mapy uwagi
  const tot = sc.blobs.map(() => 0), cov = sc.blobs.map(() => 0);
  sc.owner.forEach((b, i) => { tot[b] += 1; if (hit[i]) cov[b] += 1; });
  const S = sc.blobs.map((_, b) => (tot[b] ? cov[b] / tot[b] : 1));
  const zs = A - 2.6 * C * C - 1.8 * C ** 30;
  const zt = B + 1.0 * C * C + 4.6 * C ** 30;
  const z = [zs, zt, ...OTHER];
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return { pSrc: e[0] / sum, pTgt: e[1] / sum, C, S };
}

/**
 * Pulsująca mapa uwagi (w stylu Grad-CAM): świeci tam, gdzie sieć nadal widzi różnicę między znakiem
 * a celem (części niezakryte naklejkami). size = bok znaku w pikselach płótna, pad = margines płótna.
 * hint = po przegranej: przerywane obrysy pokazują, gdzie naklejki zakryłyby całą różnicę.
 */
export function drawHeat(g, sc, stickers, size, t, S, { hint = 0, pad = 0 } = {}) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, g.canvas.width, g.canvas.height);
  g.translate(pad * size, pad * size);
  g.globalCompositeOperation = 'lighter';
  const pulse = 0.82 + 0.18 * Math.sin(t / 380);
  sc.blobs.forEach((h, k) => {
    const inten = (1 - S[k]) * pulse;
    if (inten < 0.03) return;
    const r = size * h.r * 1.5;
    const gr = g.createRadialGradient(h.x * size, h.y * size, 0, h.x * size, h.y * size, r);
    gr.addColorStop(0, `rgba(255,245,150,${(0.9 * inten).toFixed(3)})`);
    gr.addColorStop(0.3, `rgba(255,170,40,${(0.75 * inten).toFixed(3)})`);
    gr.addColorStop(0.65, `rgba(255,70,30,${(0.35 * inten).toFixed(3)})`);
    gr.addColorStop(1, 'rgba(255,40,20,0)');
    g.fillStyle = gr;
    g.beginPath(); g.arc(h.x * size, h.y * size, r, 0, Math.PI * 2); g.fill();
  });
  g.globalCompositeOperation = 'source-over';
  if (hint) {
    const s = sc.stk * size, rr = size * u(RADIUS);
    g.strokeStyle = `rgba(243,241,234,${(0.45 + 0.35 * Math.sin(t / 200)) * hint})`;
    g.lineWidth = Math.max(2, size * 0.007);
    g.setLineDash([size * 0.022, size * 0.016]);
    sc.sol.forEach((c, j) => {
      g.save();
      g.translate(c.x * size, c.y * size);
      g.rotate((TILT[j % TILT.length] * Math.PI) / 180);
      g.beginPath();
      if (g.roundRect) g.roundRect(-s / 2, -s / 2, s, s, rr); else g.rect(-s / 2, -s / 2, s, s);
      g.stroke();
      g.restore();
    });
    g.setLineDash([]);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}
