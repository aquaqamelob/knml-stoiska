// Widok kamery przedniej w grze "Oszukaj Autopilot" - "oczami sieci":
// scena drogi o zmierzchu w odcieniach szarości z siatką pikseli i kotwicami detektora,
// w kolorze zostaje tylko obszar znaku (to, na co patrzy sieć). U góry podpis kamery i zegar
// jak na monitorze robota, z prawej panel z naklejkami do przeciągnięcia.
// (Warianty v1/v3/v4 z etapu wyboru wyglądu zostały usunięte - wybrano ten widok.)

const W = 1208, H = 800, HZ = 450, VX = 780;          // kadr, linia horyzontu, punkt zbiegu
const UL = -260, UR = 660, UC = 200;                   // krawędzie i oś drogi (przesunięcie na dole kadru)
const pt = (t, u) => [VX + u * t, HZ + (H - HZ) * t];  // t: 1 = dół kadru, → 0 przy horyzoncie
const poly = (ps) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function treeLine(seed, amp, color) {
  const r = rng(seed);
  let d = `M0 ${HZ + 1}`;
  for (let x = 0; x <= W; x += 9) {
    const crown = r() > 0.8 ? amp * 1.3 * r() : 0;
    d += ` L${x} ${(HZ - 3 - r() * amp * 0.6 - crown).toFixed(1)}`;
  }
  return `<path d="${d} L${W} ${HZ + 1} Z" fill="${color}"/>`;
}

// prerywana oś jezdni w perspektywie: kreski 3 m co 9 m, dół kadru = 4 m przed autem
function dashes(fill) {
  let out = '';
  for (let k = 0; k < 18; k++) {
    const ta = 4 / (5 + 9 * k), tb = 4 / (8 + 9 * k);
    out += `<polygon points="${poly([pt(ta, UC - 9), pt(ta, UC + 9), pt(tb, UC + 9), pt(tb, UC - 9)])}" fill="${fill}"/>`;
  }
  return out;
}
const edgeLine = (u, fill) => `<polygon points="${poly([pt(0.004, u - 11), pt(0.004, u + 11), pt(1, u + 11), pt(1, u - 11)])}" fill="${fill}"/>`;
const roadPts = poly([pt(0.003, UL), pt(0.003, UR), pt(1, UR), pt(1, UL)]);

function scene() {
  const lamps = [0.055, 0.082, 0.125, 0.19, 0.3, 0.52].map((t) => {
    const [bx, by] = pt(t, 800);
    const top = by - 560 * t, hx = bx - 90 * t;
    return `<ellipse cx="${pt(t, 600)[0].toFixed(1)}" cy="${by.toFixed(1)}" rx="${(280 * t).toFixed(1)}" ry="${(50 * t).toFixed(1)}" fill="url(#cam-pool)"/>
      <line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${top.toFixed(1)}" stroke="#202428" stroke-width="${Math.max(1.2, 9 * t).toFixed(1)}"/>
      <line x1="${bx.toFixed(1)}" y1="${top.toFixed(1)}" x2="${hx.toFixed(1)}" y2="${(top + 6 * t).toFixed(1)}" stroke="#202428" stroke-width="${Math.max(1, 6 * t).toFixed(1)}"/>
      <circle cx="${hx.toFixed(1)}" cy="${(top + 9 * t).toFixed(1)}" r="${(130 * t).toFixed(1)}" fill="url(#cam-lamp)"/>`;
  }).join('');
  const r = rng(77);
  const town = Array.from({ length: 26 }, () => `<circle cx="${(r() * W).toFixed(0)}" cy="${(HZ - 2 - r() * 6).toFixed(1)}" r="${(0.8 + r() * 1.2).toFixed(1)}" fill="#ffd69a" opacity="${(0.35 + r() * 0.5).toFixed(2)}"/>`).join('');
  return `<svg class="cam-layer cam-scene" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id="cam-sky" x1="0" y1="0" x2="0" y2="${HZ}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#0a0f16"/><stop offset=".55" stop-color="#151e28"/><stop offset=".9" stop-color="#2a2c2d"/><stop offset="1" stop-color="#3b3229"/>
      </linearGradient>
      <radialGradient id="cam-glow"><stop offset="0" stop-color="#f2b33d" stop-opacity=".34"/><stop offset=".45" stop-color="#e5823a" stop-opacity=".09"/><stop offset="1" stop-color="#e5823a" stop-opacity="0"/></radialGradient>
      <linearGradient id="cam-ground" x1="0" y1="${HZ}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#161b19"/><stop offset="1" stop-color="#0a0d0c"/></linearGradient>
      <linearGradient id="cam-road" x1="0" y1="${HZ}" x2="0" y2="${H}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2d2f30"/><stop offset=".3" stop-color="#1e2022"/><stop offset="1" stop-color="#121416"/></linearGradient>
      <radialGradient id="cam-lamp"><stop offset="0" stop-color="#fff1d6" stop-opacity=".95"/><stop offset=".18" stop-color="#ffc77d" stop-opacity=".5"/><stop offset="1" stop-color="#ff9f40" stop-opacity="0"/></radialGradient>
      <radialGradient id="cam-pool"><stop offset="0" stop-color="#ffc47a" stop-opacity=".2"/><stop offset="1" stop-color="#ffc47a" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${HZ + 2}" fill="url(#cam-sky)"/>
    <ellipse cx="${VX}" cy="${HZ}" rx="760" ry="190" fill="url(#cam-glow)"/>
    <path d="M0 ${HZ} C180 396 360 408 560 424 S930 392 ${W} 414 L${W} ${HZ} Z" fill="#141b22" opacity=".9"/>
    ${treeLine(12345, 26, '#0d1216')}
    ${town}
    <rect y="${HZ}" width="${W}" height="${H - HZ}" fill="url(#cam-ground)"/>
    <polygon points="${roadPts}" fill="url(#cam-road)"/>
    ${edgeLine(UL, 'rgba(243,241,234,.62)')}${edgeLine(UR, 'rgba(243,241,234,.62)')}
    ${dashes('rgba(243,241,234,.55)')}
    ${lamps}
  </svg>`;
}

/**
 * Warstwy kamery: back (scena, pod słupkiem znaku), mid (między słupkiem a znakiem),
 * front (nad znakiem, pod naklejkami) i tray (panel z naklejkami - ich miejsce startowe).
 */
export function camLayers({ SIGN, HOME, side = 104 }) {
  // panel dopasowany do liczby i wielkości naklejek (2 lub 3, różne rozmiary dla różnych znaków)
  const w = Math.max(180, side + 48), top = HOME[0].y - side / 2 - 64, last = HOME[HOME.length - 1].y;
  const trayBox = `left:${HOME[0].x - w / 2}px;top:${top}px;width:${w}px;height:${last - HOME[0].y + side + 64 + 24}px`;
  // okrągłe znaczniki miejsc (wyglądają tak samo przy każdym obrocie naklejki); mniejsze niż naklejka, więc są pod nią schowane
  const slots = HOME.map((p) => `<i class="tray__slot" style="left:${w / 2 - 40}px;top:${p.y - top - 40}px"></i>`).join('');
  return {
    back: scene(),
    mid: `<div class="cam-pix"></div><div class="cam-anchors"></div>
      <div class="cam-roi" style="left:${SIGN.x - 22}px;top:${SIGN.y - 22}px;width:${SIGN.size + 44}px;height:${SIGN.size + 44}px"></div>`,
    front: `<div class="cam-shade"></div>
      <div class="cam-cap"><b>Kamera przednia</b><span>rozpoznawanie znaków</span></div>
      <div class="cam-rec"><i></i><span class="js-clock">00:00:00</span></div>`,
    tray: `<div class="ap__tray tray-bank" style="${trayBox}"><span class="tray__title">Naklejki</span>${slots}</div>`,
  };
}

/** Żywe elementy kamery: zegar w prawym górnym rogu. frame() wołane co klatkę z pętli gry. */
export function camFx(node) {
  const clock = node.querySelector('.js-clock');
  let lastSec = -1;
  return {
    frame() {
      const d = new Date();
      if (clock && d.getSeconds() !== lastSec) { lastSec = d.getSeconds(); clock.textContent = d.toLocaleTimeString('pl-PL'); }
    },
  };
}
