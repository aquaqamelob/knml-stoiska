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

Poziomy generuje `training/make_levels.py` i sprawdza je wyczerpująco na prawdziwej sieci: dowolne 3 dobre punkty wygrywają (nawet z 2 wabikami), mniej niż 3 nigdy. Temperatura softmaxu (tylko do wyświetlania pewności) jest dobrana tak, żeby każdy dobry punkt sam podnosił pasek celu o co najmniej 3,5 pkt proc., a wabik prawie go nie ruszał; po kliknięciu przy pasku pojawia się zmiana („+6%”). Losowe klikanie wygrywa poziom 1 w ok. 50% (4 dobre z 8), kolejne w ok. 26% (4 z 10), całą grę w ok. 17%. Weryfikacja na sieci JS z gry: 13 878 stanów, 0 błędów. Świecące punkty mają znak „+” (dołożenie kropki) albo „−” (zabranie kropki z cyfry); oba rodzaje bywają dobre i bywają wabikami. Najechanie na punkt niczego nie zdradza. Karta po prawej (`frontend/js/games/ilcard.js`) to ranking odpowiedzi sieci: zawsze 4 wiersze (top 3 i Twój cel, jeśli jest dalej), wiersze płynnie zamieniają się miejscami, a pod spodem jedna linia „Cel 9 na 4. miejscu” ze zmianą po ostatnim kliknięciu.

### 3. Oszukaj autopilot
Widok kamery auta w stylu ADAS, 5 znaków (STOP, 50 km/h, 30 km/h, przejście dla pieszych, nakaz jazdy w prawo; cele ataku: 100 km/h, zakaz wjazdu, 80 km/h, parking, nakaz jazdy w lewo; 30 → 80 to klasyczny atak: zakrycie lewych otworów „3” robi z niej „8”). Człowiek wygrywa grę przy 3 z 5 zhakowanych znaków, w przeciwnym razie wygrywa AI. Tryb „w ciemno": gracz układa 2 naklejki bez podpowiedzi. Karta HUD pokazuje decyzję auta (ikona znaku + manewr) i pełny rozkład pewności: znak, cel ataku i inne znaki, razem zawsze 100%. Jeden przycisk zmienia stan: „Przeciągnij 2 naklejki na znak (n/2)" → „SPRAWDŹ KAMERĘ AI" → „Następny znak →". Po sprawdzeniu paski skaczą do wyniku, a mapa uwagi zapala się na 2 s. Próg zaliczenia to 80%. Gracz ma 1 skan na znak, a po nieudanym skanie mapa uwagi pokazuje rozwiązanie.

Widok kamery (`frontend/js/games/apcam.js`) pokazuje scenę „oczami sieci”: droga o zmierzchu w odcieniach szarości z siatką pikseli i kotwicami detektora, a w kolorze zostaje tylko obszar znaku. U góry podpis kamery i zegar jak na monitorze robota, naklejki startują z panelu „Naklejki”. Karta po prawej (`frontend/js/games/apcard.js`) pokazuje decyzję autopilota i „wyjście sieci”: jeden pasek 100% podzielony na cel, znak i inne znaki, z progiem 80% i legendą. Nieudany atak podświetla kamerę na czerwono.

Zgodnie ze specyfikacją jest to deterministyczny model uwagi (`frontend/js/ml/attention.js`), a nie wytrenowana sieć. Każdy znak ma 2 kluczowe strefy (litery S i P, cyfry 5 i 0, lewe otwory cyfry 3, postać i pasy, grot i trzon strzałki) i 2 poboczne. Naklejka tłumi strefę gaussowsko, a logity zależą od tłumienia i od nieliniowej interakcji obu naklejek.

## Wstęp przed grą
Po kliknięciu „Zagraj” pokazuje się krótki wstęp (`frontend/js/intro.js`, treści w `frontend/js/registry.js`): po lewej podgląd gry na żywo (ta sama animacja co na kafelku), po prawej technika ML, nazwa gry, pojedynek „TY” kontra „AI” (kto co robi), 3 kluczowe liczby (ostatnia, zielona, to warunek wygranej) i przyciski „Zaczynamy” oraz „Menu”. Na czas wstępu górny pasek jest schowany.

Podgląd gry 3: znak w ramce detekcji (jak w grze), naklejki wskakują, skan kamery, potem decyzja autopilota zmienia się i ramka zielenieje. Podgląd pokazuje przykłady SPOZA gry (60 → 80 km/h, ustąp → STOP, prosto → w lewo), żeby nie zdradzać, gdzie naklejać w grze. Wszystkie znaki są wyśrodkowane (sprawdzone pomiarem pikseli: odchyłka napisów i strzałek najwyżej 0,3 jednostki na 100).

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
