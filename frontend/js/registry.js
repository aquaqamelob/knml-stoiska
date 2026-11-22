import * as mind from './games/mind.js';
import * as illusion from './games/illusion.js';
import * as autopilot from './games/autopilot.js';

// title: tryb rozkazujący (spójne nazwy gier), tech: technika ML (nazwa własna "Markowa" wielką literą),
// line: dwa krótkie zdania na kafelku (co robisz / co robi AI) - zawsze dwie równe linie.
// intro: wstęp przed grą (frontend/js/intro.js): co robisz Ty, co robi AI i 3 liczby (ostatnia = warunek wygranej).
export const GAMES = [
  {
    id: 'mind', title: 'Przechytrz algorytm', tech: 'Łańcuch Markowa',
    line: ['Klikaj 0 i 1 losowo.', 'AI zgaduje twój ruch.'],
    intro: {
      you: 'Klikasz 0 albo 1 tak, żeby nie dało się cię przewidzieć',
      ai: 'Uczy się twoich nawyków i obstawia następny ruch',
      stats: [['8', 'kliknięć rozgrzewki: AI tylko patrzy'], ['20', 'rund: AI zgaduje przed kliknięciem'], ['< 50%', 'trafień AI i wygrywasz']],
    },
    module: mind,
  },
  {
    id: 'illusion', title: 'Zhakuj pismo ręczne', tech: 'Sieć neuronowa · MNIST',
    line: ['Zmień kilka kropek.', 'AI zobaczy inną cyfrę.'],
    intro: {
      you: 'Dokładasz (+) albo zabierasz (−) kropki w odręcznej cyfrze',
      ai: 'Rozpoznaje cyfrę. Tylko 4 świecące kropki naprawdę ją mylą',
      stats: [['5', 'ruchów na cyfrę, bez cofania'], ['3', 'trafione kropki zmieniają decyzję AI'], ['3 / 5', 'zhakowanych cyfr i wygrywasz']],
    },
    module: illusion,
  },
  {
    id: 'autopilot', title: 'Oszukaj autopilot', tech: 'Ataki adwersarialne',
    line: ['Zaklej część znaku.', 'AI zobaczy inny znak.'],
    intro: {
      you: 'Zaklejasz naklejkami to, czym znak różni się od innego',
      ai: 'Kamera auta rozpoznaje znak i decyduje, co zrobić',
      stats: [['1', 'skan kamery na znak, bez poprawek'], ['80%', 'pewności celu i znak zhakowany'], ['3 / 5', 'zhakowanych znaków i wygrywasz']],
    },
    module: autopilot,
  },
];

export const byId = Object.fromEntries(GAMES.map((g) => [g.id, g]));
