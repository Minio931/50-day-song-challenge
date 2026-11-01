# 50 Days Song – bot Discord + Spotify

Codzienny temat, uczestnicy wrzucają linki ze Spotify przez Discorda, bot układa jedną wspólną playlistę:

```
[Day 1] piosenki dnia 1 … [Day 2] piosenki dnia 2 … [Day 50] …
```

Kolejność jest zawsze przebudowywana ze stanu bota, więc zaległe dni dodane po czasie trafiają na właściwe miejsce.

## Konfiguracja (jednorazowo)

1. **Discord**: utwórz aplikację → Bot → skopiuj token. Zaproś bota z zakresami `bot` + `applications.commands` i uprawnieniami: Send Messages, Embed Links, Attach Files.
2. **Spotify**: w Developer Dashboard utwórz aplikację (Web API), Redirect URI `http://127.0.0.1:8888/callback`.
   Konto, które jest właścicielem aplikacji i playlisty, **musi mieć Premium** (wymóg Spotify od lutego 2026).
   Uczestnicy nie logują się do Spotify – wszystko idzie przez to jedno konto, więc limit 5 użytkowników Dev Mode nie przeszkadza.
3. `cp .env.example .env` i uzupełnij.
4. ```bash
   npm install
   npm run spotify:auth   # zaloguj się, wklej SPOTIFY_REFRESH_TOKEN do .env
   npm run register       # rejestruje komendy na serwerze
   npm start
   ```

## Start challenge'u (na Discordzie)

```
/admin setup start_date:2026-11-03 channel:#50-days time:09:00
/admin themes file:tematy.txt        ← 1 linia = 1 dzień (przykład: themes.example.txt)
/admin playlist                       ← tworzy playlistę (albo url: istniejąca, należąca do konta bota)
/admin marker auto                    ← szuka utworów o tytule „Day N”; braki → /admin marker set
```

## Komendy uczestników

| Komenda | Co robi |
|---|---|
| `/add link` | dodaje piosenkę na dziś (opcjonalnie `day` = zaległy dzień); ponowne dodanie podmienia |
| `/bulk` | okno z podpowiedzią brakujących dni – dopisz linki obok numerów; albo `/bulk file:` z .txt |
| `/me` | twój postęp i brakujące dni |
| `/today`, `/playlist`, `/graphic`, `/stats`, `/remove day` | jak w nazwie |

Format masowy (każdy z tych działa): `1 link`, `dzień 2: link`, `Day 3 - link`, `4) link`.

Admin: `/admin add-for` (w czyimś imieniu, także przyszłe dni), `/admin sync`, `/admin remind`, `/admin theme`.

Po każdym dodaniu bot wysyła embed (kto, utwór, wykonawca, okładka, album, data wydania, długość, dzień i temat). `/bulk` z więcej niż 5 piosenkami → jedno zbiorcze podsumowanie.
Kanał: domyślnie ten od przypomnień; zmiana `/admin feed channel:#kanał`, wyłączenie `/admin feed off:true`.

## Działanie

- Przypomnienie z tematem i grafiką (podświetlony bieżący dzień) codziennie o ustawionej godzinie. Po restarcie bota zaległe przypomnienie wysyła się samo.
- Dzień 51 → wiadomość końcowa z linkiem do playlisty.
- Stan trzymany w `data/state.json` (zrób backup / podmontuj wolumen).
- Hosting: dowolny VPS / Raspberry Pi / Railway / Fly.io z Node 20+. Uruchamiaj np. przez `pm2 start "npm start" --name song50`.

## Deploy na Optiplexa (GitHub Actions + self-hosted runner)

Push na `main` → runner kopiuje kod do `/home/minio/web/song50`, buduje obraz Dockera, rejestruje komendy i restartuje bota.
`.env` i `data/` w tym katalogu nie są ruszane przy deployu. Ścieżkę zmienisz w `APP_DIR` w `.github/workflows/deploy.yml`.

Na serwerze, jako `minio` (jednorazowo):

```bash
sudo apt install -y rsync
sudo usermod -aG docker minio      # jeśli jeszcze nie jest w grupie docker (potem wyloguj/zaloguj)
mkdir -p ~/web/song50/data
nano ~/web/song50/.env             # ta sama zawartość co lokalny .env
```

Runner: GitHub → repo → Settings → Actions → Runners → **New self-hosted runner** → Linux x64.
Komendy z tej strony wykonaj jako `minio` (np. w `~/actions-runner`), w `./config.sh` dodaj `--labels optiplex`, potem:
`sudo ./svc.sh install minio && sudo ./svc.sh start`

Logi bota: `docker logs -f song50-bot`. Ręczny deploy: zakładka Actions → Deploy → Run workflow.
