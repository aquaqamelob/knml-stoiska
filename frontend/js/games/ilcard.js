// Karta po prawej w grze "Zhakuj pismo ręczne" - ranking odpowiedzi sieci:
// zawsze 4 wiersze (top 3 + Twój cel, jeśli jest dalej, inaczej 4. miejsce), wiersze płynnie zamieniają
// się miejscami. Cel musi wskoczyć na 1. miejsce. Pod rankingiem "9 jest na 4. miejscu" (obok zmiana "+6%"),
// a linijkę niżej "ma być na 1. miejscu".
// ze zmianą po ostatnim kliknięciu, niżej pozostałe ruchy i przycisk.
// (Warianty v1, v2, v4 z etapu wyboru wyglądu zostały usunięte - wybrano ranking.)
import { barWidth } from '../ui.js';

const digits = Array.from({ length: 10 }, (_, d) => d);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const ROW = 90;          // wysokość wiersza rankingu + odstęp (px)
const GAP = 30;          // dodatkowy odstęp przed celem z dalszego miejsca (linia "…")

export const cardMarkup = ({ moves }) => `<aside class="il__card il-card il-card--3 panel">
  <section class="il__sec r3">
    <span class="il__lbl">Co widzi AI (ranking):</span>
    <div class="r3-list">${digits.map((d) => `<div class="r3-row" data-d="${d}"><span class="r3-rank"></span><b class="r3-glyph">${d}</b><span class="r3-name"></span><b class="r3-v"></b><span class="r3-bar"><i></i></span></div>`).join('')}<span class="r3-gap">…</span></div>
  </section>
  <section class="il__sec r3-goal"><span class="r3-line"><b class="r3-pos"></b><em class="il__delta"></em></span><span class="r3-need">ma być na 1. miejscu</span></section>
  <section class="il__sec il__sec--foot">
    <div class="il__energy"><span class="il__lbl">Pozostałe ruchy:</span><span class="moves">${'<i class="mv"></i>'.repeat(moves)}</span></div>
    <button class="il__action" type="button"></button>
  </section>
</aside>`;

/** s: { p, pr, tgt, over, names } */
export function cardRender(card, s) {
  const rank = digits.slice().sort((a, b) => s.p[b] - s.p[a]);
  const tr = rank.indexOf(s.tgt);
  rank.forEach((d, r) => {
    const row = card.querySelector(`.r3-row[data-d="${d}"]`);
    const shown = r < 3 || d === s.tgt || (r === 3 && tr < 3);
    const slot = r < 3 ? r : 3;
    row.style.transform = `translateY(${slot * ROW + (shown && slot === 3 && tr > 3 ? GAP : 0)}px)`;
    row.className = `r3-row${shown ? '' : ' is-hidden'}${r === 0 ? ' is-top' : ''}${d === s.tgt ? ' is-tgt' : ''}`;
    row.querySelector('.r3-rank').textContent = `${r + 1}.`;
    row.querySelector('.r3-name').textContent = cap(s.names[d]);
    row.querySelector('.r3-v').textContent = `${s.pr[d]}%`;
    const f = row.querySelector('.r3-bar i');
    f.style.width = barWidth(f, s.pr[d]);
  });
  card.querySelector('.r3-gap').classList.toggle('is-on', tr > 3);
  // stan teraz i (linijkę niżej) czego potrzeba; wcześniej "Cel 9 na 5. miejscu" brzmiało, jakby celem było 5. miejsce
  card.querySelector('.r3-pos').textContent = `${s.tgt} jest na ${tr + 1}. miejscu${tr === 0 && s.over ? '!' : ''}`;
  card.querySelector('.r3-goal').classList.toggle('is-first', tr === 0);
}
