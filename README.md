# ♠ Skat

<p align="center">
  A browser-based Skat game for solo play with bots and private peer-to-peer multiplayer.
</p>

<p align="center">
  <a href="https://skat.qqnd.fyi/"><strong>▶ Play online</strong></a>
  &nbsp;·&nbsp;
  <a href="DEPLOY_MULTIPLAYER.md">Multiplayer deployment</a>
</p>

<p align="center">
  <img alt="HTML" src="https://img.shields.io/badge/HTML5-single--file_game-E34F26?logo=html5&logoColor=white">
  <img alt="WebRTC" src="https://img.shields.io/badge/Multiplayer-WebRTC_P2P-2F8D46">
  <img alt="Playwright tested" src="https://img.shields.io/badge/tested_with-Playwright-2EAD33?logo=playwright&logoColor=white">
  <img alt="Languages" src="https://img.shields.io/badge/languages-5-4B5563">
</p>

<p align="center">
  <a href="#english">English</a> ·
  <a href="#polski">Polski</a> ·
  <a href="#deutsch">Deutsch</a> ·
  <a href="#español">Español</a> ·
  <a href="#français">Français</a>
</p>

---

<a id="english"></a>

## 🇬🇧 English

Skat is a three-player trick-taking card game with a wonderfully unusual mix of bidding, deduction and tactical play. This project aims to make it easy to play in a browser without accounts, installers or a complicated setup.

The game can be played **offline against two bots**, or in a **private P2P room** with other players. A multiplayer table may contain three human players or **two human players and one configurable bot**.

### Highlights

- 🃏 **Complete browser game** — the game client lives in a single `index.html` file.
- 🤖 **Four bot levels** — Easy, Normal, Hard and Expert.
- 🌐 **Private multiplayer** — direct WebRTC peer-to-peer play using a short room code.
- 👥 **Hybrid tables** — the host can replace one empty multiplayer seat with a bot and choose its difficulty.
- 🎓 **Interactive tutorial** — guided hands explain bidding, legal plays and basic strategy.
- 🧮 **Built-in Skat calculator** — useful during bidding and while learning contract values.
- 💾 **Local saves** — single-player progress and preferences stay in the browser.
- 📱 **Responsive interface** — designed for desktop, tablet and phones in portrait and landscape.
- 🌍 **Five interface languages** — English, Polish, German, Spanish and French.

### Game modes and rules

The game includes the standard core of Skat:

- Suit games
- Grand
- Null
- Hand games
- Advanced contracts and announcements, including Null Ouvert and Schneider/Schwarz announcements

Optional club/house rules are available as separate settings:

- **Ramsch** after everybody passes
- **Kontra / Re**

Several ready-made rule presets are included, while custom settings allow individual rules to be enabled or disabled.

### Multiplayer

Multiplayer uses a small signaling service only to help browsers find each other. Once the connection is established, game traffic is sent directly between players through **WebRTC data channels**.

The host is authoritative: it shuffles the deck, validates actions and sends each guest only the information that player is allowed to see.

A room can be played as:

- **3 human players**, or
- **2 human players + 1 bot** controlled by the host.

The bot may occupy either free guest seat and can use any of the four difficulty levels.

### Testing

Hybrid multiplayer has an automated Playwright regression test in GitHub Actions. The test covers:

- both possible multiplayer bot seats,
- all four difficulty levels,
- complete hands from bidding to scoring,
- card conservation and legal game progression,
- desktop, tablet, phone portrait and phone landscape lobby layouts.

### Project structure

```text
Skat/
├── index.html                  # Complete game client
├── cloudflare-signaling/       # WebRTC signaling service
├── DEPLOY_MULTIPLAYER.md       # Multiplayer deployment guide
├── tests/                      # Browser regression tests
└── .github/workflows/          # CI
```

### Running locally

For offline play, opening `index.html` in a modern browser is enough.

For full multiplayer functionality, serve the game over HTTPS and deploy the signaling worker described in [`DEPLOY_MULTIPLAYER.md`](DEPLOY_MULTIPLAYER.md).

The public instance is available at **https://skat.qqnd.fyi/**.

---

<a id="polski"></a>

## 🇵🇱 Polski

Skat to trzyosobowa gra lewowa, w której równie ważne jak same karty są licytacja, przewidywanie i umiejętne zarządzanie ryzykiem. Celem tego projektu jest wygodna wersja przeglądarkowa — bez instalowania programu i bez zakładania konta.

Możesz grać **offline przeciwko dwóm botom** albo utworzyć **prywatny pokój P2P**. W multiplayerze stół może składać się z trzech ludzi albo z **dwóch graczy i jednego bota** o wybranym poziomie trudności.

### Najważniejsze funkcje

- 🃏 **Cała gra w przeglądarce** — klient znajduje się w jednym pliku `index.html`.
- 🤖 **4 poziomy botów** — Łatwy, Normalny, Trudny i Ekspert.
- 🌐 **Prywatny multiplayer P2P** — połączenie WebRTC przy użyciu krótkiego kodu pokoju.
- 👥 **Gra hybrydowa** — gospodarz może zastąpić jedno wolne miejsce botem.
- 🎓 **Interaktywny samouczek** — prowadzone rozdania wyjaśniają licytację, legalne ruchy i podstawy strategii.
- 🧮 **Kalkulator Skata** — pomoc przy nauce wartości gier i licytacji.
- 💾 **Lokalny zapis** — ustawienia i gra offline są zapisywane w przeglądarce.
- 📱 **Responsywny interfejs** — komputer, tablet oraz telefon pionowo i poziomo.
- 🌍 **5 języków** — polski, angielski, niemiecki, hiszpański i francuski.

### Zasady i warianty

Dostępne są podstawowe gry Skata:

- gry kolorowe,
- Grand,
- Null,
- Hand,
- kontrakty zaawansowane i zapowiedzi, m.in. Null Ouvert oraz Schneider/Schwarz angesagt.

Opcjonalnie można włączyć zasady klubowe/domowe:

- **Ramsch** po pełnym pasie,
- **Kontra / Re**.

Gra posiada gotowe zestawy zasad oraz tryb własnej konfiguracji.

### Multiplayer

Usługa sygnalizacyjna służy tylko do zestawienia połączenia. Po połączeniu przeglądarek dane rozgrywki przesyłane są bezpośrednio pomiędzy graczami przez **WebRTC**.

Gospodarz pokoju jest stroną autorytatywną: tasuje, sprawdza poprawność ruchów i wysyła każdemu graczowi wyłącznie informacje, które powinien widzieć.

Możliwe układy stołu:

- **3 graczy**,
- **2 graczy + 1 bot**.

Bot może zająć dowolne wolne miejsce gościa, a gospodarz wybiera jego poziom trudności.

### Testy

Multiplayer z botem jest objęty automatycznym testem Playwright uruchamianym przez GitHub Actions. Test sprawdza obie pozycje bota, wszystkie cztery poziomy trudności, pełne rozdania, zachowanie 32 kart oraz lobby na komputerze, tablecie i telefonach w obu orientacjach.

### Struktura projektu

```text
Skat/
├── index.html                  # Cała gra
├── cloudflare-signaling/       # Sygnalizacja WebRTC
├── DEPLOY_MULTIPLAYER.md       # Instrukcja wdrożenia multiplayera
├── tests/                      # Testy przeglądarkowe
└── .github/workflows/          # CI
```

Grę można uruchomić publicznie pod adresem **https://skat.qqnd.fyi/**. Szczegóły wdrożenia multiplayera znajdują się w [`DEPLOY_MULTIPLAYER.md`](DEPLOY_MULTIPLAYER.md).

---

<a id="deutsch"></a>

## 🇩🇪 Deutsch

Skat ist ein traditionsreiches Stichspiel für drei Personen, bei dem Reizen, Kartenlesen und taktische Entscheidungen eine ebenso große Rolle spielen wie das eigentliche Ausspielen. Dieses Projekt bringt Skat ohne Installation und ohne Benutzerkonto direkt in den Browser.

Du kannst **offline gegen zwei Bots** spielen oder einen **privaten P2P-Raum** eröffnen. Im Mehrspielermodus sind drei menschliche Spieler oder **zwei Spieler plus ein Bot** möglich.

### Funktionen

- 🃏 Vollständiges Browserspiel in einer einzigen `index.html`
- 🤖 Vier Bot-Stufen: Leicht, Normal, Schwer und Experte
- 🌐 Privater WebRTC-P2P-Mehrspielermodus mit kurzem Raumcode
- 👥 Ein freier Mehrspielerplatz kann durch einen Bot ersetzt werden
- 🎓 Interaktives Tutorial mit geführten Spielen
- 🧮 Eingebauter Skat-Rechner für Reizen und Spielwerte
- 💾 Lokale Speicherung für Einzelspieler und Einstellungen
- 📱 Responsive Oberfläche für Desktop, Tablet und Smartphones
- 🌍 Deutsch, Englisch, Polnisch, Spanisch und Französisch

### Spiele und Regeln

Enthalten sind Farbspiele, Grand, Null, Hand sowie erweiterte Spiele und Ansagen wie Null Ouvert und Schneider/Schwarz angesagt.

Zusätzlich können optionale Club- bzw. Hausregeln aktiviert werden:

- **Ramsch** nach dreifachem Pass
- **Kontra / Re**

Vordefinierte Regelsets erleichtern den Einstieg; alternativ lässt sich die Partie frei konfigurieren.

### Mehrspieler

Der Signalisierungsdienst wird nur zum Aufbau der Verbindung benötigt. Danach läuft der Spielverkehr direkt zwischen den Browsern über **WebRTC-Datenkanäle**.

Der Gastgeber ist autoritativ: Er mischt, prüft Spielzüge und sendet jedem Mitspieler nur die Informationen, die dieser sehen darf.

Mögliche Tische:

- **3 menschliche Spieler**
- **2 menschliche Spieler + 1 Bot**

Die Bot-Stärke wird vom Gastgeber gewählt.

### Tests

Ein Playwright-Test in GitHub Actions prüft beide möglichen Bot-Sitzplätze, alle vier Schwierigkeitsgrade, vollständige Spiele, Kartenkonsistenz sowie die Lobby auf Desktop, Tablet und Smartphones im Hoch- und Querformat.

Öffentliche Version: **https://skat.qqnd.fyi/**  
Mehrspieler-Deployment: [`DEPLOY_MULTIPLAYER.md`](DEPLOY_MULTIPLAYER.md)

---

<a id="español"></a>

## 🇪🇸 Español

Skat es un juego de bazas para tres jugadores en el que la subasta, la deducción y la estrategia son tan importantes como las cartas que recibes. Este proyecto ofrece una versión completa para navegador, sin instalaciones ni cuentas.

Puedes jugar **sin conexión contra dos bots** o crear una **sala P2P privada**. El multijugador admite tres personas o **dos personas y un bot configurable**.

### Características

- 🃏 Juego completo en navegador dentro de un único `index.html`
- 🤖 Cuatro niveles de bot: Fácil, Normal, Difícil y Experto
- 🌐 Multijugador privado WebRTC P2P con código de sala
- 👥 Un asiento libre puede ser ocupado por un bot
- 🎓 Tutorial interactivo con manos guiadas
- 🧮 Calculadora de Skat integrada
- 💾 Partida individual y ajustes guardados localmente
- 📱 Interfaz adaptable a ordenador, tableta y teléfono
- 🌍 Inglés, polaco, alemán, español y francés

### Modalidades y reglas

El juego incluye partidas de palo, Grand, Null, Hand y contratos avanzados con anuncios como Null Ouvert y Schneider/Schwarz anunciado.

También se pueden activar reglas opcionales de club o caseras:

- **Ramsch** cuando todos pasan
- **Kontra / Re**

Hay configuraciones predeterminadas y un modo personalizado para elegir cada regla por separado.

### Multijugador

El servicio de señalización solo ayuda a establecer la conexión. Después, los datos de la partida viajan directamente entre los navegadores mediante **WebRTC**.

El anfitrión controla el estado oficial de la partida: baraja, valida las acciones y envía a cada jugador únicamente la información que debe conocer.

La mesa puede tener:

- **3 jugadores humanos**
- **2 jugadores humanos + 1 bot**

El anfitrión puede elegir el asiento y la dificultad del bot.

### Pruebas

GitHub Actions ejecuta una prueba de regresión con Playwright que comprueba ambos asientos posibles del bot, los cuatro niveles de dificultad, manos completas, conservación de las 32 cartas y la interfaz en ordenador, tableta y teléfono en vertical y horizontal.

Jugar: **https://skat.qqnd.fyi/**  
Despliegue multijugador: [`DEPLOY_MULTIPLAYER.md`](DEPLOY_MULTIPLAYER.md)

---

<a id="français"></a>

## 🇫🇷 Français

Le Skat est un jeu de plis à trois joueurs où les enchères, la déduction et la gestion du risque comptent autant que les cartes elles-mêmes. Ce projet propose une version complète dans le navigateur, sans installation ni compte utilisateur.

Vous pouvez jouer **hors ligne contre deux bots** ou créer une **partie P2P privée**. Le multijoueur accepte trois joueurs humains ou **deux joueurs et un bot configurable**.

### Fonctionnalités

- 🃏 Jeu complet dans un unique fichier `index.html`
- 🤖 Quatre niveaux de bot : Facile, Normal, Difficile et Expert
- 🌐 Multijoueur privé WebRTC P2P avec code de salon
- 👥 Un siège libre peut être remplacé par un bot
- 🎓 Tutoriel interactif avec parties guidées
- 🧮 Calculateur de Skat intégré
- 💾 Sauvegarde locale des parties solo et des préférences
- 📱 Interface adaptée aux ordinateurs, tablettes et téléphones
- 🌍 Anglais, polonais, allemand, espagnol et français

### Jeux et règles

Le jeu comprend les jeux à la couleur, Grand, Null, Hand ainsi que les contrats et annonces avancés, notamment Null Ouvert et Schneider/Schwarz annoncé.

Des règles de club ou règles maison peuvent être activées séparément :

- **Ramsch** lorsque tout le monde passe
- **Kontra / Re**

Plusieurs ensembles de règles sont fournis, avec également une configuration entièrement personnalisable.

### Multijoueur

Le service de signalisation sert uniquement à établir la connexion. Ensuite, les données de jeu circulent directement entre les navigateurs via **WebRTC**.

L'hôte fait autorité : il mélange les cartes, valide les actions et ne transmet à chaque joueur que les informations qu'il est autorisé à voir.

Configurations possibles :

- **3 joueurs humains**
- **2 joueurs humains + 1 bot**

L'hôte choisit le siège et le niveau de difficulté du bot.

### Tests

Un test Playwright exécuté par GitHub Actions couvre les deux sièges possibles du bot, les quatre niveaux de difficulté, des parties complètes, la conservation des 32 cartes et l'affichage du salon sur ordinateur, tablette et téléphone en portrait comme en paysage.

Jouer : **https://skat.qqnd.fyi/**  
Déploiement multijoueur : [`DEPLOY_MULTIPLAYER.md`](DEPLOY_MULTIPLAYER.md)

---

## Notes for contributors

The project intentionally keeps the game client self-contained. When changing game logic, please keep the multiplayer host/guest information boundary in mind and run the browser regression tests before merging.

If you find a rules discrepancy, multiplayer issue or UI problem, opening a GitHub issue with the exact situation, contract and cards involved makes it much easier to reproduce.
