# Wdrożenie gry i multiplayera

Ta instrukcja dotyczy domeny `skat.qqnd.fyi`. Gra oraz jej niewielka usługa multiplayera są wdrażane oddzielnie:

| Element | Gdzie trafia |
| --- | --- |
| `index.html` | Serwer WWW za NPMplus/Synology |
| `cloudflare-signaling/` | Cloudflare Workers |

## Wymagania

- domena `qqnd.fyi` jest w Cloudflare;
- DNS `skat.qqnd.fyi` prowadzi na serwer Synology i ma włączone proxy Cloudflare (pomarańczowa chmurka);
- NPMplus ma działający certyfikat TLS dla `skat.qqnd.fyi`;
- na komputerze administracyjnym jest Node.js 20+ i npm.

## 1. Wgranie gry na serwer WWW

1. W NPMplus utwórz lub otwórz Proxy Host dla `skat.qqnd.fyi`.
2. Proxy powinno prowadzić do serwera WWW Synology na jego **wewnętrzny adres i port HTTP** (np. `http://192.168.1.31:83`). NPMplus kończy połączenie HTTPS i przekazuje ruch do HTTP; nie wybieraj HTTPS, jeżeli serwer źródłowy nie ma własnego HTTPS na tym porcie.
3. W zakładce **TLS** wybierz certyfikat `skat.qqnd.fyi` i włącz **Force HTTPS**.
4. Wgraj plik z repozytorium: `index.html` do katalogu głównego witryny przypisanej do `skat.qqnd.fyi` (DocumentRoot). To jedyny plik gry wymagany przez serwer WWW.
5. Wejdź na `https://skat.qqnd.fyi` i sprawdź, czy strona się otwiera.

## 2. Pierwszy deploy sygnalizacji multiplayera

Cloudflare Worker służy wyłącznie do znalezienia drugiego gracza i wymiany danych potrzebnych do WebRTC. Po zestawieniu połączenia sama rozgrywka idzie P2P.

W terminalu przejdź do katalogu `cloudflare-signaling` w pobranej kopii repozytorium i wykonaj:

```powershell
npm install
npx wrangler login
npm run deploy
```

Podczas logowania wybierz konto Cloudflare mające dostęp do strefy `qqnd.fyi`.

Konfiguracja `wrangler.jsonc` tworzy Worker `skat-p2p` z Durable Object i przypisuje tylko trasę:

```text
skat.qqnd.fyi/api/*
```

Zwykłe adresy strony — między innymi `/` i `/index.html` — nadal obsługuje Synology/NPMplus. Tylko wywołania zaczynające się od `/api/` obsługuje Cloudflare.

> Jeśli Wrangler wyświetli komunikat o braku subdomeny `workers.dev`, otwórz panel Cloudflare → **Workers & Pages**. Pierwsze wejście utworzy subdomenę automatycznie. Nie trzeba później korzystać z adresu `workers.dev`, ponieważ gra używa własnej trasy domenowej.

## 3. Test po deployu

Otwórz:

```text
https://skat.qqnd.fyi/api/health
```

Poprawna odpowiedź ma postać:

```json
{"ok":true,"service":"skat-signaling"}
```

Następnie otwórz grę na dwóch urządzeniach albo w dwóch niezależnych przeglądarkach. Utwórz prywatny pokój i wpisz u drugiego gracza wyłącznie wygenerowany ośmioznakowy kod pokoju.

## 4. Późniejsze aktualizacje

### Zmiana wyglądu lub zasad gry

1. Zmień i wgraj tylko `index.html` na serwer WWW.
2. Jeżeli widzisz starszą wersję, odśwież stronę bez cache lub użyj tymczasowo adresu `https://skat.qqnd.fyi/?v=kolejny-numer`.

### Zmiana kodu multiplayera

1. Zmień pliki w `cloudflare-signaling/`.
2. W tym katalogu uruchom:

```powershell
npm run deploy
```

3. Ponownie sprawdź `https://skat.qqnd.fyi/api/health`.

## 5. Diagnostyka

| Objaw | Co sprawdzić |
| --- | --- |
| `https://skat.qqnd.fyi` nie działa, a HTTP działa | Certyfikat w NPMplus, włączone **Force HTTPS**, oraz czy NPMplus kieruje na właściwy schemat portu origin. |
| `/api/health` zwraca 404 lub stronę Synology | Deploy Workera oraz wpis `skat.qqnd.fyi/api/*` w `wrangler.jsonc`; rekord domeny musi być proxied w Cloudflare. |
| Deploy mówi o `workers.dev` | Jednorazowo otwórz **Workers & Pages** w panelu Cloudflare, a potem uruchom deploy ponownie. |
| Gracze nie mogą połączyć się P2P | Sprawdź `/api/health` i sieć. WebRTC używa STUN; restrykcyjne sieci mogą w przyszłości wymagać serwera TURN. |
