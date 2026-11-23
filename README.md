# Człowiek kontra AI – kiosk targowy KN Machine Learning

Drugi monitor stoiska, obok ekranu robota ADAS (`../Robot`). Ma ten sam język wizualny: kolory, krój Barlow, scenę 1920×1080 skalowaną do monitora i identyczną stopkę z logotypami.

## Uruchomienie

Wymagany jest Docker (na Windows/macOS: Docker Desktop, uruchomiony).

```bash
git clone https://github.com/Gien3k/knml-stoiska.git
cd knml-stoiska
docker compose up --build -d
```

Aplikacja działa pod adresem **http://localhost:8080**. Otwórz ją w przeglądarce na pełnym ekranie (`F11` albo klawisz `F` na ekranie głównym).

Pierwsze zbudowanie obrazu potrzebuje internetu (obraz `python:3.12-slim` i dwa pakiety pip). Potem wszystko działa offline: modele, wagi sieci, poziomy gier i fonty są w obrazie, a w czasie gry nic nie jest pobierane z sieci. Przed targami zbuduj obraz raz na docelowym laptopie.

Aktualizacja na innym komputerze: `git pull` i ponownie `docker compose up --build -d`.

Zatrzymanie: `docker compose down`. Statystyki dnia i wspólna pamięć n-gramów zostają w wolumenie `kiosk-data`. Polecenie `docker compose down -v` je usuwa.

## Wersja online (Vercel + Upstash Redis)

Ta sama strona może działać w internecie bez Dockera: frontend jest statyczny, a API z `backend/main.py` ma odpowiednik w funkcjach Vercela (`api/*.js`), które trzymają statystyki dnia, rekordy dnia, n-gramy i ustawienia w Upstash Redis zamiast SQLite.

1. Na [vercel.com](https://vercel.com) zaimportuj to repozytorium (New Project). Ustawienia budowania są w `vercel.json`, nic nie zmieniaj.
2. Redis: w projekcie Vercel → Storage → Upstash (Redis) → utwórz bazę i podłącz do projektu. Zmienne ustawią się same.
   Albo ręcznie (Settings → Environment Variables), z zakładki REST API bazy w konsoli Upstash:
   - `UPSTASH_REDIS_REST_URL` (np. `https://xxx.upstash.io`)
   - `UPSTASH_REDIS_REST_TOKEN`
3. Opcjonalnie `ADMIN_PASS` – hasło obsługi sprawdzane przez serwer przy zerowaniu statystyk i zmianie ustawień (domyślnie `KNML`). Jeśli je zmienisz, zmień też `ADMIN_PASS` w `frontend/js/main.js`.
4. Redeploy. Sprawdzenie: `https://<twoja-domena>/api/health`.

Klucze w Redisie mają prefiks `kiosk:`; dane dnia wygasają po 400 dniach (schemat w `api/_lib.js`). Gdy Redis jest niedostępny, frontend jak dotąd liczy statystyki lokalnie i dosyła wyniki później.
Logotypy na Vercelu są brane z `assets/` w czasie budowania – podmiana wymaga nowego deploya.

## Gry

Zasada projektu: zero suwaków i instrukcji, wszystko samą myszką w 1–2 sekundy po podejściu do monitora.

### 1. Przechytrz algorytm
Najpierw 8 kliknięć rozgrzewki: AI tylko obserwuje i uczy się stylu gracza, nic nie obstawia. Potem pojedynek: gracz klika 20 razy 0 albo 1 (dwa duże przyciski, tylko mysz), starając się być losowy. Przed każdym kliknięciem AI obstawia jego ruch: mieszanka n-gramów rzędu 1–4 (łańcuchy Markowa) uczonych na żywo, pamięci poprzednich odwiedzających i dwóch ludzkich nawyków, ważona bayesowsko. Na ekranie: wynik TY : AI i pasek „Przewidywalność Twojego mózgu". Po każdym kliknięciu środkowy kafelek odsłania zakład AI. Na końcu jedno zdanie o wykrytym nawyku.

### 2. Zhakuj pismo ręczne
Sieć MLP (196 → 96 → 48 → 10) wytrenowana na odręcznych cyfrach MNIST pokazanych jako piksele 14×14 (95,5% trafności na zbiorze testowym). 5 poziomów: 7→9, 9→8, 5→6, 3→8, 0→8. Na cyfrze pulsuje 8–10 punktów, ale tylko 4 naprawdę działają, reszta to wabiki. Gracz ma 5 ruchów na cyfrę **bez cofania** i bez resetu. Poziom jest wygrany, gdy najwyższa odpowiedź sieci (jej decyzja, argmax) to cyfra-cel; po 5 ruchach bez tego wygrywa AI, a zielone kółka pokazują punkty, które działały. Człowiek wygrywa grę przy 3 z 5 cyfr.

Poziomy generuje `training/make_levels.py` i sprawdza je wyczerpująco na prawdziwej sieci: dowolne 3 dobre punkty wygrywają (nawet z 2 wabikami), mniej niż 3 nigdy. Temperatura softmaxu (tylko do wyświetlania pewności) jest dobrana tak, żeby każdy dobry punkt sam podnosił pasek celu o co najmniej 3,5 pkt proc., a wabik prawie go nie ruszał; po kliknięciu przy pasku pojawia się zmiana („+6%”). Losowe klikanie wygrywa poziom 1 w ok. 50% (4 dobre z 8), kolejne w ok. 26% (4 z 10), całą grę w ok. 17%. Weryfikacja na sieci JS z gry: 13 878 stanów, 0 błędów. Świecące punkty mają znak „+” (dołożenie kropki) albo „−” (zabranie kropki z cyfry); oba rodzaje bywają dobre i bywają wabikami. Najechanie na punkt niczego nie zdradza. Karta po prawej (`frontend/js/games/ilcard.js`) to ranking odpowiedzi sieci: zawsze 4 wiersze (top 3 i Twój cel, jeśli jest dalej), wiersze płynnie zamieniają się miejscami, a pod spodem jedna linia „9 jest na 4. miejscu, ma być na 1.” ze zmianą po ostatnim kliknięciu.

### 3. Oszukaj autopilot
Widok kamery auta w stylu ADAS, 5 znaków. Każdy atak jest uczciwy: znak i cel mają ten sam kształt i kolory, a różnią się jednym elementem, który naklejki mogą w całości zakryć. Po zakryciu widoczna reszta znaku jest piksel w piksel taka jak cel, więc nikt nie powie, że „przecież dalej widać kreski”. Kolejno: 30 → 80 km/h (1 naklejka na górnej i lewej części „3”, jak w prawdziwym ataku 35 → 85 na kamerę Tesli), koniec drogi z pierwszeństwem → droga z pierwszeństwem (2 naklejki na czarnym pasie), 50 km/h → zakaz ruchu (1 duża naklejka na obu cyfrach), zakaz zatrzymywania się → zakaz postoju (2 naklejki na ramieniu „/” krzyżyka), 20 → 70 km/h (2 naklejki: zaokrąglony koniec „2” u góry i dolna kreska). Liczba i wielkość naklejek są dobrane do znaku tak, żeby każda była potrzebna: o jedną mniej tej samej wielkości nie wystarczy. Wspólne fragmenty (np. dolny łuk „3”, który ma też „8”) mogą zostać widoczne, bo niczego nie zdradzają. Cyfry stoją w stałych miejscach jak na prawdziwych znakach, więc zmiana jednej nie przesuwa drugiej. Człowiek wygrywa grę przy 3 z 5 zhakowanych znaków, w przeciwnym razie wygrywa AI. Tryb „w ciemno": gracz układa naklejki bez podpowiedzi. Karta HUD pokazuje decyzję auta (ikona znaku + manewr) i pełny rozkład pewności: znak, cel ataku i inne znaki, razem zawsze 100%. Jeden przycisk zmienia stan: „Przeciągnij 2 naklejki na znak (n/2)" → „SPRAWDŹ KAMERĘ AI" → „Następny znak →". Po sprawdzeniu paski skaczą do wyniku, a mapa uwagi zapala się na 2 s tam, gdzie różnica jest jeszcze widoczna. Próg zaliczenia to 80%. Gracz ma 1 skan na znak, a po nieudanym skanie przerywane obrysy pokazują, gdzie naklejki zakryłyby całą różnicę.

Widok kamery (`frontend/js/games/apcam.js`) pokazuje scenę „oczami sieci”: droga o zmierzchu w odcieniach szarości z siatką pikseli i kotwicami detektora, a w kolorze zostaje tylko obszar znaku. U góry podpis kamery i zegar jak na monitorze robota, naklejki startują z panelu „Naklejki”. Karta po prawej (`frontend/js/games/apcard.js`) pokazuje decyzję autopilota i „wyjście sieci”: jeden pasek 100% podzielony na cel, znak i inne znaki, z progiem 80% i legendą. Nieudany atak podświetla kamerę na czerwono.

Zgodnie ze specyfikacją jest to deterministyczny model (`frontend/js/ml/attention.js`), a nie wytrenowana sieć. Sieć odróżnia znak od celu po masce różnicy pikseli (`frontend/js/ml/masks.js`). Dopóki widać choć kawałek różnicy, widzi prawdziwy znak; gdy naklejki zakryją co najmniej ok. 96,5% różnicy, z pewnością wybiera cel (nie mówi „nie wiem”). Naklejki są w modelu zaokrąglonymi kwadratami z takim samym obrotem jak na ekranie. Sprawdzone symulacją: przemyślane naklejenie wygrywa także z rozrzutem ręki ±11 px, o jedną naklejkę mniej nie wygrywa (najlepsza z 20 000 prób daje 5–14% pewności celu), a losowe naklejenie wygrywa w 0,02–1% przypadków.

Maski, wielkość i liczbę naklejek liczy `training/make_masks.mjs`: renderuje każdą parę znaków w Chrome i liczy różnicę, która zdradza znak (różnica jest pomijana, gdy ten sam kolor leży w drugim znaku najwyżej 1 jednostkę dalej, czyli to tylko przesunięty kontur cyfry). Potem szuka najmniejszych naklejek, które zakrywają ją całą (bok w grze = minimum + 5 jednostek luzu), i wybiera liczbę naklejek (najchętniej 2), przy której o jedną mniej tej samej wielkości zakryłoby najwyżej 92% maski. Po każdej zmianie rysunku znaków trzeba go uruchomić ponownie (`node training/make_masks.mjs`, kiosk musi działać na porcie 8080), a potem przebudować obraz.

## Wstęp przed grą
Po kliknięciu „Zagraj” pokazuje się krótki wstęp (`frontend/js/intro.js`, treści w `frontend/js/registry.js`): po lewej podgląd gry na żywo (ta sama animacja co na kafelku), po prawej technika ML, nazwa gry, pojedynek „TY” kontra „AI” (kto co robi), 3 kluczowe liczby (ostatnia, zielona, to warunek wygranej) i przyciski „Zaczynamy” oraz „Menu”. Na czas wstępu górny pasek jest schowany.

Podgląd gry 3: znak w ramce detekcji (jak w grze), naklejki wskakują, skan kamery, potem decyzja autopilota zmienia się i ramka zielenieje. Podgląd pokazuje przykłady SPOZA gry (60 → 80, 100 → 120, 70 → 20 km/h), a jego naklejki też zakrywają całą różnicę (położenia z generatora masek). Wszystkie liczby są wyśrodkowane (sprawdzone pomiarem pikseli: odchyłka najwyżej 0,3 jednostki na 100).

## Ekran główny
Nazwy gier są w trybie rozkazującym (Przechytrz algorytm, Zhakuj pismo ręczne, Oszukaj autopilot), a opisy na kafelkach to zawsze dwa krótkie zdania: co robisz i co robi AI. Podgląd gry 1: 16 pustych pól zapełnia się po kolei, potem płynnie się opróżnia (procent zostaje). Podgląd gry 2 ma na świecących kropkach „+” i „−” jak w grze i zmienia cyfrę, gdy jest wygaszony. Kafelki nie są linkami (przeglądarka nie pokazuje adresu w rogu), a przycisk „Zagraj” ma własny wiersz pod opisem. Pasek „Ludzie vs AI” pokazuje udział gier wygranych przez ludzi: wynik gry powyżej 50% to wygrana człowieka, poniżej 50% wygrana AI, równo 50% to remis (pół punktu dla każdej strony).
Wszystkie trzy kafelki animują się jednocześnie, płynnie, w jednej pętli `requestAnimationFrame`. W grach 2 i 3 górny pasek ma jedną linię: powrót, cel rundy i postęp.

## Obsługa stoiska
5 razy kliknij logo koła naukowego w stopce (w ciągu 3 s) i wpisz hasło `KNML` (wielkość liter nie ma znaczenia; `ADMIN_PASS` w `frontend/js/main.js`). Otwiera się panel obsługi: ukrycie/pokazanie statystyk na stronie głównej (ustawienie zapisane na serwerze, `GET/POST /api/settings`; bez statystyk kafelki są wyższe, a podglądy większe) i wyzerowanie dzisiejszych statystyk (z potwierdzeniem). Okno zamyka się tylko przyciskiem. Klawisz F na ekranie głównym włącza pełny ekran, Esc wraca do menu.

## Logotypy

Pliki w folderze `assets/` są montowane do kontenera na żywo:

- `assets/logo-kolo.png` – logo Koła Naukowego
- `assets/logo-rzeszow.png` – logo Miasta Rzeszów

To te same jasne wersje co przy robocie. Podmiana pliku o tej samej nazwie (PNG, SVG, WEBP, JPG) pojawi się na ekranie w ciągu ok. 20 s, bez przebudowy.

## Obsługa stoiska

- `Esc` – powrót do menu z dowolnej gry. Po 75 s bez dotyku gra sama wraca do menu.
- `F` na ekranie głównym – pełny ekran.
- Przytrzymanie licznika gier na ekranie głównym przez 3 s otwiera panel obsługi (pełny ekran, zerowanie dzisiejszych statystyk).

## Struktura

```
backend/main.py            FastAPI: strona, logotypy, statystyki i n-gramy w SQLite
frontend/                  strona (czysty JS, bez kroku budowania)
  js/games/                mind.js, illusion.js, autopilot.js, signs.js (znaki wektorowe)
  js/ml/                   markov.js (n-gramy), mlp.js (sieć MLP), attention.js (model uwagi), models.js
  model/                   digits-mlp.json (wagi sieci + poziomy)
api/                       to samo API jako funkcje Vercel (Upstash Redis)
vercel.json                konfiguracja Vercel (statyczny frontend + rewrite logotypów)
assets/                    logotypy (montowane do kontenera)
training/                  skrypty, którymi przygotowano modele (niepotrzebne do działania)
```

## Odtworzenie modeli (opcjonalnie)

```bash
# sieć MLP na MNIST (~1 min), potem poziomy gry (zachłanny atak, kilka sekund)
docker run --rm -v "$PWD:/work" -w /work/training python:3.12-slim bash -c   "pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install numpy && python train_digits.py && python make_levels.py"
```

Źródła: zbiór MNIST (LeCun i in.).

## Ponowne trenowanie sieci (opcjonalne)

Do działania stoiska nic nie trzeba trenować: wagi sieci i poziomy gry 2 są w `frontend/model/digits-mlp.json`. Skrypty w `training/` potrzebują zbioru MNIST w `training/data/mnist/` (pliki `train-images-idx3-ubyte.gz`, `train-labels-idx1-ubyte.gz`, `t10k-images-idx3-ubyte.gz`, `t10k-labels-idx1-ubyte.gz`), który nie jest w repozytorium ze względu na rozmiar.
