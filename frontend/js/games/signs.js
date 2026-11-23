// Wektorowe znaki drogowe (viewBox 0 0 100 100) dla gry "Oszukaj autopilot".
// Każda para "znak → cel ataku" ma ten sam kształt i te same kolory, a różni się drobnym elementem,
// który naklejki mogą w całości zakryć (cyfra, czarny pas, jedno ramię X). Po zakryciu widoczna
// reszta znaku jest piksel w piksel taka jak cel ataku (maski różnic: frontend/js/ml/masks.js).
const RED = '#c8102e', WHITE = '#f6f6f2', BLACK = '#141414', YELLOW = '#f5c400', BLUE = '#0052a0';
const font = 'font-family="Barlow Condensed, Barlow, sans-serif" font-weight="700" text-anchor="middle"';
// linia bazowa tak, by środek cyfr był w środku znaku (wysokość cyfr w Barlow Condensed = 0,706 em)
const ty = (size, cy = 50) => (cy + size * 0.353).toFixed(1);

// znak zakazu: czerwona obwódka, biały środek (B-1 zakaz ruchu; z liczbą: B-33 ograniczenie prędkości)
const ring = (inner = '') => `
  <circle cx="50" cy="50" r="48" fill="${RED}"/>
  <circle cx="50" cy="50" r="37" fill="${WHITE}"/>${inner}`;
// każda cyfra w stałym miejscu (jak na prawdziwym znaku), więc zmiana jednej cyfry nie przesuwa drugiej;
// przy 3 cyfrach wąska "1" z przodu - całość przesunięta o 1,1 w lewo, żeby tusz był na środku
const limit = (n) => {
  const size = n.length > 2 ? 36 : 44, step = n.length > 2 ? 15.6 : 18.4;
  return ring([...n].map((d, i) => `
  <text x="${(50 + (n.length > 2 ? -1.1 : 0) + (i - (n.length - 1) / 2) * step).toFixed(1)}" y="${ty(size)}" ${font} font-size="${size}" fill="${BLACK}">${d}</text>`).join(''));
};

// B-36 zakaz zatrzymywania się (czerwony X na niebieskim) i B-35 zakaz postoju (tylko pas "\")
const noStop = (both) => `
  <circle cx="50" cy="50" r="48" fill="${RED}"/>
  <circle cx="50" cy="50" r="38" fill="${BLUE}"/>
  <line x1="23" y1="23" x2="77" y2="77" stroke="${RED}" stroke-width="8"/>${both ? `
  <line x1="77" y1="23" x2="23" y2="77" stroke="${RED}" stroke-width="8"/>` : ''}`;

// D-1 droga z pierwszeństwem i D-2 koniec drogi z pierwszeństwem: ten sam romb, na D-2 gruby czarny pas
// od lewej dolnej do prawej górnej krawędzi (szerokość pasa 10 jednostek, od obwódki do obwódki)
const priority = (end) => `
  <polygon points="50,3 97,50 50,97 3,50" fill="${WHITE}"/>
  <polygon points="50,21 79,50 50,79 21,50" fill="${YELLOW}"/>${end ? `
  <polygon points="69.96,22.96 77.04,30.04 30.04,77.04 22.96,69.96" fill="${BLACK}"/>` : ''}
  <polygon points="50,3 97,50 50,97 3,50" fill="none" stroke="${BLACK}" stroke-width="2.4" stroke-linejoin="round"/>`;

export const SIGNS = {
  // gra: każda para różni się tylko elementem, który naklejki mogą w całości zakryć
  limit30: limit('30'),           // 30 → 80: zakryta pierwsza cyfra
  limit80: limit('80'),
  priorityend: priority(true),    // D-2 → D-1: zakryty czarny pas
  priority: priority(false),
  limit50: limit('50'),           // B-33 → B-1: zakryte obie cyfry
  closed: ring(),
  nostopping: noStop(true),       // B-36 → B-35: zakryte ramię "/" krzyżyka
  noparking: noStop(false),
  limit20: limit('20'),           // 20 → 70: zakryta pierwsza cyfra
  limit70: limit('70'),
  // tylko podgląd na stronie głównej (przykłady spoza gry)
  limit60: limit('60'),
  limit100: limit('100'),
  limit120: limit('120'),
};

export const signSvg = (id, cls = '') => `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true">${SIGNS[id]}</svg>`;
