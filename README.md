# SKAT

Jednoplikowa gra w Skata z grą lokalną i prywatnym multiplayerem P2P.

## Zawartość

- `index.html` — cała aplikacja gry. Ten plik wgrywasz na serwer WWW dla `skat.qqnd.fyi`.
- `cloudflare-signaling/` — mały Cloudflare Worker do automatycznej sygnalizacji WebRTC. Nie wgrywa się go na serwer WWW.
- `DEPLOY_MULTIPLAYER.md` — pełna instrukcja pierwszego wdrożenia i późniejszych aktualizacji.

## Szybka aktualizacja gry

1. Zmień `index.html`.
2. Wgraj go jako plik startowy strony `skat.qqnd.fyi` w NPMplus/Synology.
3. Otwórz stronę z nowym parametrem, np. `https://skat.qqnd.fyi/?v=5`, jeżeli przeglądarka lub Cloudflare trzyma poprzednią wersję w cache.

Instrukcja multiplayera: [DEPLOY_MULTIPLAYER.md](DEPLOY_MULTIPLAYER.md).
