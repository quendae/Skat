/* Skat multiplayer: server-authoritative rules and shared QQND WebSocket transport.
 * The server owns shuffle, deal, seats, action validation, gameplay state, bots and scoring.
 */
(function () {
  'use strict';

  const Skat = (window.Skat = window.Skat || {});
  const GAME_ID = 'skat';
  const WS_URL = 'wss://api.qqnd.fyi/api/v1/ws';
  const SESSION_STORAGE_KEY = 'skat.qqnd.server-session.v1';
  const REQUEST_TIMEOUT_MS = 12000;
  const GAME_ACTIONS = new Set([
    'auction-bid','auction-accept','auction-pass','forehand-play','forehand-pass','pickup-skat','play-hand',
    'confirm-discard','declare-grand','declare-null','declare-null-ouvert','declare-null-hand','declare-null-ouvert-hand',
    'select-hand-grand','announce-none','announce-schneider','announce-schwarz','announce-ouvert',
    'kontra-pass','kontra-call','re-pass','re-call','next-hand'
  ]);

  const mp = {
    socket: null,
    socketPromise: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    intentionalClose: false,
    waiters: [],
    session: null,
    resumeToken: '',
    roomObj: null,
    room: '',
    role: null,
    seat: null,
    names: ['', '', ''],
    hostSessionId: '',
    inGame: false,
    authoritative: false,
    stateSeq: 0,
    queued: false,
    quickPlay: false,
    botSeats: [],
    fillBot: false,
    rooms: [],
    lastError: '',
    graceBySeat: {},
    graceTicker: null,
  };

  const el = (id) => document.getElementById(id);
  const escapeHtml = (value) => {
    const node = document.createElement('span');
    node.textContent = String(value ?? '');
    return node.innerHTML;
  };
  const setStatus = (id, message, error = false) => {
    const node = el(id);
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('error', !!error);
  };

  function language() {
    return Skat.i18n?.language || 'pl';
  }

  const COPY = {
    pl: {
      eyebrow: 'MULTIPLAYER ONLINE',
      lead: 'Utwórz pokój, dołącz kodem albo użyj Quick Play. Połączenie prowadzi przez wspólny serwer QQND.',
      notice: 'Serwer tasuje, rozdaje, pilnuje zasad, wykonuje boty i liczy wynik. Każdy gracz otrzymuje wyłącznie swój widok stanu gry.',
      createTitle: 'Utwórz pokój',
      joinTitle: 'Dołącz kodem',
      create: 'Utwórz pokój',
      join: 'Dołącz',
      roomCode: 'Kod pokoju',
      host: 'Gospodarz',
      waiting: 'Wolne miejsce',
      connected: 'Połączono',
      offline: 'Rozłączony',
      copyRoom: 'Kopiuj kod',
      leave: 'Opuść pokój',
      start: 'Rozpocznij grę',
      publicRoom: 'Publiczny',
      privateRoom: 'Prywatny',
      browser: 'Publiczne pokoje',
      refresh: 'Odśwież',
      quick: 'Quick Play',
      searching: 'Szukamy dwóch graczy…',
      noRooms: 'Brak otwartych publicznych pokojów.',
      joinRoom: 'Dołącz',
      serverOffline: 'Brak połączenia z serwerem.',
      reconnecting: 'Ponowne łączenie z serwerem…',
      roomReady: 'Pokój gotowy. Czekamy na komplet graczy.',
      roomFull: 'Komplet graczy. Gospodarz może rozpocząć grę.',
      visibility: 'Widoczność',
      visibilityHelp: 'Publiczny pokój pojawi się na liście. Prywatny wymaga kodu.',
    },
    en: {
      eyebrow: 'ONLINE MULTIPLAYER', lead: 'Create a room, join by code or use Quick Play. Connections use the shared QQND server.',
      notice: 'The server shuffles, deals, validates the rules, runs bots and scores the game. Each player receives only their own state view.',
      createTitle: 'Create room', joinTitle: 'Join by code', create: 'Create room', join: 'Join', roomCode: 'Room code', host: 'Host', waiting: 'Open seat', connected: 'Connected', offline: 'Offline', copyRoom: 'Copy code', leave: 'Leave room', start: 'Start game', publicRoom: 'Public', privateRoom: 'Private', browser: 'Public rooms', refresh: 'Refresh', quick: 'Quick Play', searching: 'Looking for two players…', noRooms: 'No open public rooms.', joinRoom: 'Join', serverOffline: 'Server connection unavailable.', reconnecting: 'Reconnecting to server…', roomReady: 'Room ready. Waiting for all players.', roomFull: 'All players connected. Host can start.', visibility: 'Visibility', visibilityHelp: 'Public rooms appear in the browser. Private rooms require the code.'
    },
    de: {
      eyebrow: 'ONLINE-MEHRPSPIELER', lead: 'Erstelle einen Raum, tritt per Code bei oder nutze Quick Play. Die Verbindung läuft über den gemeinsamen QQND-Server.', notice: 'Der Server mischt, gibt, prüft die Regeln, steuert Bots und zählt die Punkte. Jeder Spieler erhält nur seine eigene Zustandsansicht.', createTitle: 'Raum erstellen', joinTitle: 'Per Code beitreten', create: 'Raum erstellen', join: 'Beitreten', roomCode: 'Raumcode', host: 'Gastgeber', waiting: 'Freier Platz', connected: 'Verbunden', offline: 'Offline', copyRoom: 'Code kopieren', leave: 'Raum verlassen', start: 'Spiel starten', publicRoom: 'Öffentlich', privateRoom: 'Privat', browser: 'Öffentliche Räume', refresh: 'Aktualisieren', quick: 'Quick Play', searching: 'Suche zwei Spieler…', noRooms: 'Keine offenen öffentlichen Räume.', joinRoom: 'Beitreten', serverOffline: 'Keine Verbindung zum Server.', reconnecting: 'Verbindung zum Server wird wiederhergestellt…', roomReady: 'Raum bereit. Warte auf alle Spieler.', roomFull: 'Alle Spieler verbunden. Der Gastgeber kann starten.', visibility: 'Sichtbarkeit', visibilityHelp: 'Öffentliche Räume erscheinen in der Liste. Private Räume benötigen den Code.'
    },
    es: {
      eyebrow: 'MULTIJUGADOR ONLINE', lead: 'Crea una sala, únete por código o usa Quick Play. La conexión utiliza el servidor compartido QQND.', notice: 'El servidor baraja, reparte, valida las reglas, controla los bots y calcula la puntuación. Cada jugador recibe solo su propia vista del estado.', createTitle: 'Crear sala', joinTitle: 'Unirse por código', create: 'Crear sala', join: 'Unirse', roomCode: 'Código de sala', host: 'Anfitrión', waiting: 'Plaza libre', connected: 'Conectado', offline: 'Sin conexión', copyRoom: 'Copiar código', leave: 'Salir', start: 'Iniciar partida', publicRoom: 'Pública', privateRoom: 'Privada', browser: 'Salas públicas', refresh: 'Actualizar', quick: 'Quick Play', searching: 'Buscando dos jugadores…', noRooms: 'No hay salas públicas abiertas.', joinRoom: 'Unirse', serverOffline: 'Sin conexión con el servidor.', reconnecting: 'Reconectando con el servidor…', roomReady: 'Sala preparada. Esperando a todos.', roomFull: 'Todos conectados. El anfitrión puede iniciar.', visibility: 'Visibilidad', visibilityHelp: 'Las salas públicas aparecen en la lista. Las privadas requieren el código.'
    },
    fr: {
      eyebrow: 'MULTIJOUEUR EN LIGNE', lead: 'Créez une salle, rejoignez-la par code ou utilisez Quick Play. La connexion passe par le serveur QQND partagé.', notice: 'Le serveur mélange, distribue, valide les règles, joue les bots et calcule le score. Chaque joueur ne reçoit que sa propre vue de l’état.', createTitle: 'Créer une salle', joinTitle: 'Rejoindre par code', create: 'Créer la salle', join: 'Rejoindre', roomCode: 'Code de salle', host: 'Hôte', waiting: 'Place libre', connected: 'Connecté', offline: 'Hors ligne', copyRoom: 'Copier le code', leave: 'Quitter', start: 'Lancer la partie', publicRoom: 'Publique', privateRoom: 'Privée', browser: 'Salles publiques', refresh: 'Actualiser', quick: 'Quick Play', searching: 'Recherche de deux joueurs…', noRooms: 'Aucune salle publique ouverte.', joinRoom: 'Rejoindre', serverOffline: 'Connexion au serveur indisponible.', reconnecting: 'Reconnexion au serveur…', roomReady: 'Salle prête. En attente de tous les joueurs.', roomFull: 'Tous les joueurs sont connectés. L’hôte peut lancer.', visibility: 'Visibilité', visibilityHelp: 'Les salles publiques apparaissent dans la liste. Les salles privées nécessitent le code.'
    }
  };
  const copy = () => COPY[language()] || COPY.pl;

  const HYBRID_COPY = {
    pl: { botName: 'Bot', addBot: 'Dodaj bota', removeBot: 'Usuń bota', botStatus: 'Bot · sterowany przez gospodarza', twoHumans: 'Dwóch graczy jest gotowych. Możesz poczekać na trzecią osobę albo dodać bota.', hybridReady: '2 graczy + bot. Można rozpocząć grę.', connectionLost: (name) => 'Utracono połączenie z graczem ' + name + '. Czekamy na jego powrót.', connectionRestored: (name) => 'Połączenie gracza ' + name + ' zostało wznowione.', leftGame: (name) => 'Gracz ' + name + ' opuścił grę.' },
    en: { botName: 'Bot', addBot: 'Add bot', removeBot: 'Remove bot', botStatus: 'Bot · controlled by host', twoHumans: 'Two players are ready. Wait for a third player or add a bot.', hybridReady: '2 players + bot. Ready to start.', connectionLost: (name) => 'Connection to ' + name + ' was lost. Waiting for them to return.', connectionRestored: (name) => name + ' reconnected.', leftGame: (name) => name + ' left the game.' },
    de: { botName: 'Bot', addBot: 'Bot hinzufügen', removeBot: 'Bot entfernen', botStatus: 'Bot · vom Gastgeber gesteuert', twoHumans: 'Zwei Spieler sind bereit. Warte auf einen dritten Spieler oder füge einen Bot hinzu.', hybridReady: '2 Spieler + Bot. Spiel kann gestartet werden.', connectionLost: (name) => 'Verbindung zu ' + name + ' verloren. Wir warten auf die Rückkehr.', connectionRestored: (name) => name + ' ist wieder verbunden.', leftGame: (name) => name + ' hat das Spiel verlassen.' },
    es: { botName: 'Bot', addBot: 'Añadir bot', removeBot: 'Quitar bot', botStatus: 'Bot · controlado por el anfitrión', twoHumans: 'Hay dos jugadores listos. Espera al tercero o añade un bot.', hybridReady: '2 jugadores + bot. Listos para empezar.', connectionLost: (name) => 'Se perdió la conexión con ' + name + '. Esperando su regreso.', connectionRestored: (name) => name + ' se ha reconectado.', leftGame: (name) => name + ' abandonó la partida.' },
    fr: { botName: 'Bot', addBot: 'Ajouter un bot', removeBot: 'Retirer le bot', botStatus: 'Bot · contrôlé par l’hôte', twoHumans: 'Deux joueurs sont prêts. Attendez un troisième joueur ou ajoutez un bot.', hybridReady: '2 joueurs + bot. Prêt à démarrer.', connectionLost: (name) => 'Connexion avec ' + name + ' perdue. En attente de son retour.', connectionRestored: (name) => name + ' est reconnecté.', leftGame: (name) => name + ' a quitté la partie.' },
  };
  const hybridCopy = () => HYBRID_COPY[language()] || HYBRID_COPY.pl;

  let eventToastTimer = null;
  function showEventToast(message, tone = 'info') {
    if (!message) return;
    let node = el('mp-event-toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'mp-event-toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      Object.assign(node.style, { position: 'fixed', top: '18px', left: '50%', transform: 'translateX(-50%) translateY(-8px)', zIndex: '99999', maxWidth: 'min(620px, calc(100vw - 28px))', padding: '11px 16px', borderRadius: '12px', border: '1px solid rgba(216,179,95,.45)', background: 'rgba(8,17,13,.96)', color: '#edf5ef', boxShadow: '0 14px 38px rgba(0,0,0,.42)', fontSize: '13px', fontWeight: '750', textAlign: 'center', opacity: '0', pointerEvents: 'none', transition: 'opacity .18s ease, transform .18s ease' });
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.style.borderColor = tone === 'danger' ? 'rgba(255,143,143,.68)' : tone === 'success' ? 'rgba(130,220,160,.58)' : 'rgba(216,179,95,.45)';
    node.style.opacity = '1';
    node.style.transform = 'translateX(-50%) translateY(0)';
    if (eventToastTimer) window.clearTimeout(eventToastTimer);
    eventToastTimer = window.setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateX(-50%) translateY(-8px)';
    }, 4500);
  }

  function graceCopy(kind, name, seconds) {
    const lang = language();
    const n = name || (lang === 'pl' ? 'graczem' : 'player');
    if (kind === 'lost') {
      if (lang === 'pl') return 'Utracono połączenie z graczem ' + n + '. Bot przejmie jego miejsce za ' + seconds + ' s.';
      if (lang === 'de') return 'Verbindung zu ' + n + ' verloren. Ein Bot übernimmt in ' + seconds + ' s.';
      if (lang === 'es') return 'Se perdió la conexión con ' + n + '. Un bot ocupará su lugar en ' + seconds + ' s.';
      if (lang === 'fr') return 'Connexion avec ' + n + ' perdue. Un bot prendra sa place dans ' + seconds + ' s.';
      return 'Connection to ' + n + ' was lost. A bot will take the seat in ' + seconds + ' s.';
    }
    if (kind === 'bot') {
      if (lang === 'pl') return 'Minęło 60 sekund. Bot przejął miejsce gracza ' + n + ' i gra jego obecną ręką.';
      if (lang === 'de') return '60 Sekunden sind abgelaufen. Ein Bot übernimmt den Platz von ' + n + ' mit der aktuellen Hand.';
      if (lang === 'es') return 'Han pasado 60 segundos. Un bot ocupa el lugar de ' + n + ' con su mano actual.';
      if (lang === 'fr') return '60 secondes se sont écoulées. Un bot prend la place de ' + n + ' avec sa main actuelle.';
      return '60 seconds elapsed. A bot took ' + n + "'s seat with the current hand.";
    }
    if (kind === 'reclaimed') {
      if (lang === 'pl') return 'Gracz ' + n + ' wrócił i przejął miejsce bota z zastaną ręką.';
      if (lang === 'de') return n + ' ist zurück und übernimmt den Bot-Platz mit der aktuellen Hand.';
      if (lang === 'es') return n + ' volvió y recuperó el lugar del bot con la mano actual.';
      if (lang === 'fr') return n + ' est revenu et reprend la place du bot avec la main actuelle.';
      return n + ' returned and reclaimed the bot seat with the current hand.';
    }
    return hybridCopy().connectionRestored(n);
  }

  function graceCountdownText() {
    const entries = Object.values(mp.graceBySeat || {}).filter((entry) => entry?.deadline > Date.now());
    if (!entries.length) return '';
    entries.sort((a, b) => a.deadline - b.deadline);
    const entry = entries[0];
    const seconds = Math.max(0, Math.ceil((entry.deadline - Date.now()) / 1000));
    return language() === 'pl' ? (entry.nickname + ': bot za ' + seconds + ' s') : (entry.nickname + ': bot in ' + seconds + 's');
  }

  function refreshGraceTicker() {
    if (mp.graceTicker) window.clearInterval(mp.graceTicker);
    const tick = () => updateNetworkPill(mp.socket?.readyState === WebSocket.OPEN);
    tick();
    if (Object.keys(mp.graceBySeat || {}).length) mp.graceTicker = window.setInterval(tick, 250);
    else mp.graceTicker = null;
  }

  function normalizeNick(value) {
    return String(value || '').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
  }

  function validateNick(value) {
    const nickname = normalizeNick(value);
    const length = Array.from(nickname).length;
    if (length < 3 || length > 20) return { ok: false, message: 'Nick musi mieć od 3 do 20 znaków.' };
    if (/https?:|www\.|[<>@]/iu.test(nickname) || /[^\p{L}\p{N} _-]/u.test(nickname)) return { ok: false, message: 'Nick zawiera niedozwolone znaki lub wygląda jak link.' };
    return { ok: true, nickname };
  }

  function loadStoredSession() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) || 'null');
      if (!value?.sessionId || !value?.resumeToken || !value?.nickname) return null;
      return value;
    } catch (_) {
      return null;
    }
  }

  function storeSession() {
    if (!mp.session?.id || !mp.resumeToken) return;
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        sessionId: mp.session.id,
        resumeToken: mp.resumeToken,
        nickname: mp.session.nickname,
      }));
    } catch (_) {}
  }

  function clearStoredSession() {
    try { localStorage.removeItem(SESSION_STORAGE_KEY); } catch (_) {}
  }

  function socketSend(payload) {
    if (mp.socket?.readyState !== WebSocket.OPEN) throw new Error('server_not_connected');
    mp.socket.send(JSON.stringify(payload));
  }

  function addWaiter(successTypes, predicate = () => true, timeout = REQUEST_TIMEOUT_MS) {
    const types = new Set(Array.isArray(successTypes) ? successTypes : [successTypes]);
    return new Promise((resolve, reject) => {
      const waiter = { types, predicate, resolve, reject, timer: null };
      waiter.timer = window.setTimeout(() => {
        mp.waiters = mp.waiters.filter((item) => item !== waiter);
        reject(new Error('timeout'));
      }, timeout);
      mp.waiters.push(waiter);
    });
  }

  function settleWaiters(message) {
    const waiters = [...mp.waiters];
    for (const waiter of waiters) {
      if (message.type === 'error') {
        window.clearTimeout(waiter.timer);
        mp.waiters = mp.waiters.filter((item) => item !== waiter);
        waiter.reject(new Error(message.code || 'server_error'));
        continue;
      }
      if (!waiter.types.has(message.type) || !waiter.predicate(message)) continue;
      window.clearTimeout(waiter.timer);
      mp.waiters = mp.waiters.filter((item) => item !== waiter);
      waiter.resolve(message);
    }
  }

  async function request(payload, successTypes, predicate) {
    await ensureSocket();
    const waiting = addWaiter(successTypes, predicate);
    socketSend(payload);
    return waiting;
  }

  function ensureSocket() {
    if (mp.socket?.readyState === WebSocket.OPEN) return Promise.resolve(mp.socket);
    if (mp.socketPromise) return mp.socketPromise;

    mp.intentionalClose = false;
    mp.socketPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(WS_URL);
      mp.socket = socket;
      let opened = false;
      const timer = window.setTimeout(() => {
        if (!opened) {
          try { socket.close(); } catch (_) {}
          reject(new Error('timeout'));
        }
      }, REQUEST_TIMEOUT_MS);

      socket.onopen = () => { opened = true; };
      socket.onmessage = (event) => {
        let message;
        try { message = JSON.parse(event.data); } catch (_) { return; }
        if (message.type === 'hello') {
          window.clearTimeout(timer);
          mp.reconnectAttempt = 0;
          resolve(socket);
        }
        settleWaiters(message);
        handleServerMessage(message);
      };
      socket.onerror = () => {
        if (!opened) {
          window.clearTimeout(timer);
          reject(new Error('websocket_error'));
        }
      };
      socket.onclose = () => {
        window.clearTimeout(timer);
        if (mp.socket === socket) mp.socket = null;
        mp.socketPromise = null;
        // A new WebSocket must authenticate again with the stored resume token.
        mp.session = null;
        mp.resumeToken = '';
        for (const waiter of mp.waiters.splice(0)) {
          window.clearTimeout(waiter.timer);
          waiter.reject(new Error('connection_closed'));
        }
        updateNetworkPill(false);
        if (mp.inGame) networkInterrupted();
        if (!mp.intentionalClose && (mp.session || loadStoredSession())) scheduleReconnect();
      };
    }).finally(() => { mp.socketPromise = null; });
    return mp.socketPromise;
  }

  function scheduleReconnect() {
    if (mp.reconnectTimer) return;
    const delay = Math.min(10000, 700 * Math.pow(1.7, mp.reconnectAttempt++));
    mp.reconnectTimer = window.setTimeout(async () => {
      mp.reconnectTimer = null;
      try {
        setStatus('mp-lobby-status', copy().reconnecting);
        await ensureSocket();
        await resumeStoredSession(true);
      } catch (_) {
        scheduleReconnect();
      }
    }, delay);
  }

  async function resumeStoredSession(silent = false) {
    if (mp.session) return mp.session;
    const stored = loadStoredSession();
    if (!stored) return null;
    try {
      const message = await request({ type: 'session.resume', sessionId: stored.sessionId, resumeToken: stored.resumeToken }, 'session.resumed');
      mp.session = message.session;
      mp.resumeToken = stored.resumeToken;
      const skatRoom = (message.rooms || []).find((room) => room.game === GAME_ID);
      if (skatRoom) {
        syncRoom(skatRoom);
        renderLobby();
      }
      if (!silent) prefillNickname();
      return mp.session;
    } catch (error) {
      if (/invalid_session_credentials|session_expired/.test(String(error?.message || error))) {
        clearStoredSession();
        mp.session = null;
        mp.resumeToken = '';
        return null;
      }
      throw error;
    }
  }

  async function ensureSession(nickname) {
    const checked = validateNick(nickname);
    if (!checked.ok) throw new Error(checked.message);
    nickname = checked.nickname;

    await ensureSocket();
    if (!mp.session) await resumeStoredSession(true);
    if (mp.session?.nickname === nickname) return mp.session;
    if (mp.session && mp.roomObj) throw new Error('Opuść bieżący pokój przed zmianą nicku.');

    if (mp.session && mp.session.nickname !== nickname) {
      mp.session = null;
      mp.resumeToken = '';
      clearStoredSession();
    }
    const message = await request({ type: 'session.create', nickname }, 'session.created');
    mp.session = message.session;
    mp.resumeToken = message.resumeToken;
    storeSession();
    prefillNickname();
    return mp.session;
  }

  function prefillNickname() {
    const nickname = mp.session?.nickname || loadStoredSession()?.nickname || '';
    if (!nickname) return;
    ['mp-host-nick', 'mp-guest-nick'].forEach((id) => {
      const input = el(id);
      if (input && !input.value) input.value = nickname;
    });
  }

  function currentNickname(preferred = 'host') {
    const first = preferred === 'guest' ? el('mp-guest-nick') : el('mp-host-nick');
    const second = preferred === 'guest' ? el('mp-host-nick') : el('mp-guest-nick');
    return normalizeNick(first?.value || second?.value || mp.session?.nickname || loadStoredSession()?.nickname || '');
  }

  function syncNickInputs(source) {
    const other = source.id === 'mp-host-nick' ? el('mp-guest-nick') : el('mp-host-nick');
    if (other && document.activeElement !== other) other.value = source.value;
  }

  function seatForSession(sessionId) {
    return mp.roomObj?.players?.findIndex((player) => player.id === sessionId) ?? -1;
  }

  function syncRoom(room) {
    if (!room || room.game !== GAME_ID) return;
    mp.roomObj = room;
    mp.room = room.id;
    if (!mp.inGame || !mp.hostSessionId) mp.hostSessionId = room.ownerSessionId;
    mp.seat = mp.session ? seatForSession(mp.session.id) : null;
    mp.role = mp.session?.id === mp.hostSessionId ? 'host' : 'guest';
    if (room.status === 'in_game' && room.players.length < 3 && mp.botSeats.length === 0) {
      mp.botSeats = Array.from({ length: 3 - room.players.length }, (_, index) => room.players.length + index);
      mp.fillBot = mp.botSeats.length > 0;
    }
    if (room.status !== 'in_game' && room.players.length >= 3) {
      mp.fillBot = false;
      mp.botSeats = [];
    }
    mp.names = [0, 1, 2].map((seat) => room.players?.[seat]?.nickname || (mp.botSeats.includes(seat) ? hybridCopy().botName : ''));


    renderLobby();
    if (mp.role === 'host') {
      if (mp.inGame) broadcastState();
      else broadcastLobby();
      if (mp.quickPlay && room.players.length === 3 && room.players.every((player) => player.connected)) {
        window.setTimeout(() => startGame(), 250);
      }
    }
  }

  function roomSend(payload, toSessionId) {
    if (!mp.room || !mp.session) return;
    const message = { type: 'room.send', roomId: mp.room, payload };
    if (toSessionId) message.toSessionId = toSessionId;
    socketSend(message);
  }

  function broadcastLobby() {
    if (mp.role !== 'host' || !mp.roomObj) return;
    roomSend({ type: 'skat.lobby', names: mp.names, fillBot: mp.fillBot });
  }

  function handleRoomMessage(message) {
    if (!mp.roomObj || message.roomId !== mp.roomObj.id || !message.payload) return;
    const payload = message.payload;
    if (payload.type === 'skat.lobby' && mp.role === 'guest' && !mp.inGame) {
      if (Array.isArray(payload.names)) mp.names = payload.names.slice(0, 3);
      mp.fillBot = !!payload.fillBot;
      renderLobby();
      return;
    }

  }

  function handleServerMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'session.created') {
      mp.session = message.session;
      mp.resumeToken = message.resumeToken;
      storeSession();
      prefillNickname();
      return;
    }
    if (message.type === 'session.resumed') {
      mp.session = message.session;
      const skatRoom = (message.rooms || []).find((room) => room.game === GAME_ID);
      if (skatRoom) {
        syncRoom(skatRoom);
        if (skatRoom.status === 'in_game') socketSend({ type: 'game.state.get', roomId: skatRoom.id });
      }
      return;
    }
    if (message.type === 'room.created' || message.type === 'room.joined' || message.type === 'room.updated') {
      if (message.room?.game === GAME_ID) syncRoom(message.room);
      return;
    }
    if (message.type === 'room.left') {
      if (message.roomId === mp.room) clearRoomState();
      return;
    }
    if (message.type === 'room.closed') {
      if (message.roomId === mp.room) {
        networkInterrupted('Pokój został zamknięty.');
        clearRoomState();
      }
      return;
    }
    if (message.type === 'rooms.list') {
      mp.rooms = Array.isArray(message.rooms) ? message.rooms : [];
      renderRoomBrowser();
      return;
    }
    if (message.type === 'queue.joined') {
      mp.queued = true;
      setStatus('mp-host-status', `${copy().searching}${Number.isInteger(message.position) ? ` (#${message.position})` : ''}`);
      setStatus('mp-guest-status', '');
      renderRoomBrowser();
      return;
    }
    if (message.type === 'queue.left') {
      mp.queued = false;
      renderRoomBrowser();
      return;
    }
    if (message.type === 'match.found' && message.game === GAME_ID) {
      mp.queued = false;
      mp.quickPlay = true;
      syncRoom(message.room);
      setStatus('mp-lobby-status', copy().roomFull);
      return;
    }
    if (message.type === 'room.message') {
      handleRoomMessage(message);
      return;
    }
    if (message.type === 'game.started') {
      mp.botSeats = Array.isArray(message.botSeats) ? message.botSeats.filter(Number.isInteger) : [];
      mp.fillBot = mp.botSeats.length > 0;
      mp.authoritative = !!message.authoritative;
      mp.inGame = true;
      if (message.hostSessionId) mp.hostSessionId = message.hostSessionId;
      if (message.room?.game === GAME_ID) syncRoom(message.room);
      mp.role = mp.session?.id === mp.hostSessionId ? 'host' : 'guest';
      Skat.game?.hideMainMenu?.();
      el('multiplayer-modal')?.classList.add('hidden');
      updateNetworkPill(true);
      return;
    }
    if (message.type === 'game.action') {
      if (!mp.authoritative && mp.role === 'host' && mp.inGame && message.roomId === mp.room && Number.isInteger(message.seat)) {
        Skat.game?.executePlayerAction?.(message.seat, message.action, message.payload || {});
      }
      return;
    }
    if (message.type === 'game.state') {
      if (message.authoritative != null) mp.authoritative = !!message.authoritative;
      if (Array.isArray(message.botSeats)) {
        mp.botSeats = message.botSeats.filter(Number.isInteger);
        mp.fillBot = mp.botSeats.length > 0;
      }
      if (message.hostSessionId) {
        mp.hostSessionId = message.hostSessionId;
        mp.role = mp.session?.id === mp.hostSessionId ? 'host' : 'guest';
      }
      if (message.roomId === mp.room) applyRemoteState(message.state, message.revision);
      return;
    }
    if (message.type === 'game.player.connection' && message.roomId === mp.room) {
      if (Array.isArray(message.botSeats)) {
        mp.botSeats = message.botSeats.filter(Number.isInteger);
        mp.fillBot = mp.botSeats.length > 0;
      }
      if (message.hostSessionId) {
        mp.hostSessionId = message.hostSessionId;
        mp.role = mp.session?.id === mp.hostSessionId ? 'host' : 'guest';
      }
      if (Number.isInteger(message.seat)) {
        if (message.connected) delete mp.graceBySeat[message.seat];
        else if (Number.isFinite(message.graceDeadline)) mp.graceBySeat[message.seat] = { deadline: message.graceDeadline, nickname: message.nickname || 'Player' };
        refreshGraceTicker();
      }
      if (message.sessionId !== mp.session?.id) {
        const seconds = Math.max(0, Math.ceil(((message.graceDeadline || Date.now()) - Date.now()) / 1000));
        const text = message.connected
          ? graceCopy(message.reclaimedFromBot ? 'reclaimed' : 'restored', message.nickname || 'Player', seconds)
          : graceCopy('lost', message.nickname || 'Player', seconds || 60);
        showEventToast(text, message.connected ? 'success' : 'danger');
      }
      if (message.connected && !mp.authoritative && mp.role === 'host' && mp.inGame) window.setTimeout(broadcastState, 0);
      return;
    }
    if (message.type === 'game.player.bot_takeover' && message.roomId === mp.room) {
      if (Array.isArray(message.botSeats)) {
        mp.botSeats = message.botSeats.filter(Number.isInteger);
        mp.fillBot = mp.botSeats.length > 0;
      }
      if (message.hostSessionId) {
        mp.hostSessionId = message.hostSessionId;
        mp.role = mp.session?.id === mp.hostSessionId ? 'host' : 'guest';
      }
      if (Number.isInteger(message.seat)) delete mp.graceBySeat[message.seat];
      refreshGraceTicker();
      showEventToast(graceCopy('bot', message.nickname || 'Player', 0), 'info');
      if (!mp.authoritative && mp.role === 'host' && mp.inGame) {
        window.setTimeout(() => {
          Skat.game?.resumeAutomation?.();
          broadcastState();
        }, 0);
      }
      return;
    }
    if (message.type === 'game.host.changed' && message.roomId === mp.room) {
      mp.hostSessionId = message.hostSessionId || mp.hostSessionId;
      mp.role = mp.session?.id === mp.hostSessionId ? 'host' : 'guest';
      if (Array.isArray(message.botSeats)) mp.botSeats = message.botSeats.filter(Number.isInteger);
      if (!mp.authoritative && mp.role === 'host' && mp.socket?.readyState === WebSocket.OPEN) socketSend({ type: 'game.state.get', roomId: mp.room });
      return;
    }
    if (message.type === 'game.player.left' && message.roomId === mp.room && message.sessionId !== mp.session?.id) {
      showEventToast(hybridCopy().leftGame(message.nickname || 'gracz'), 'danger');
      return;
    }
    if (message.type === 'game.ended') {
      if (message.roomId === mp.room) networkInterrupted('Gra została zakończona, ponieważ gracz opuścił stół.');
      return;
    }
    if (message.type === 'error') {
      mp.lastError = message.code || 'server_error';
      const text = serverErrorText(message.code);
      if (!mp.roomObj) {
        setStatus('mp-host-status', text, true);
        setStatus('mp-guest-status', text, true);
      } else setStatus('mp-lobby-status', text, true);
    }
  }

  function serverErrorText(code) {
    const map = {
      room_not_found: 'Pokój nie istnieje albo już wygasł.',
      room_full: 'Pokój ma już trzech graczy.',
      room_not_joinable: 'Do tego pokoju nie można już dołączyć.',
      already_in_room: 'Ta sesja jest już w innym pokoju.',
      authentication_required: 'Sesja wygasła. Połącz się ponownie.',
      invalid_session_credentials: 'Nie udało się wznowić poprzedniej sesji.',
      unknown_game: 'Serwer nie rozpoznaje tej gry.',
      target_not_in_room: 'Gracz nie jest już w pokoju.',
      not_in_room: 'Nie należysz już do tego pokoju.',
      invalid_message: 'Serwer odrzucił nieprawidłową wiadomość.',
    };
    return map[code] || `Błąd serwera: ${code || 'unknown'}`;
  }

  function prepareModalUI() {
    const c = copy();
    const setText = (id, text) => { const node = el(id); if (node) node.textContent = text; };
    setText('multiplayer-eyebrow', c.eyebrow);
    setText('multiplayer-lead', c.lead);
    setText('multiplayer-notice', c.notice);
    setText('mp-create-title', c.createTitle);
    setText('mp-join-title', c.joinTitle);
    setText('mp-create-button', c.create);
    setText('mp-offer-button', c.join);
    setText('mp-room-code-label', c.roomCode);
    setText('mp-copy-room', c.copyRoom);
    setText('mp-leave-button', c.leave);
    setText('mp-start-button', c.start);
    const footer = el('mp-start-button')?.parentElement;
    if (footer && !el('mp-toggle-bot')) {
      const botButton = document.createElement('button');
      botButton.type = 'button';
      botButton.id = 'mp-toggle-bot';
      botButton.className = 'action secondary';
      botButton.dataset.action = 'mp-toggle-bot';
      botButton.textContent = hybridCopy().addBot;
      botButton.style.display = 'none';
      footer.insertBefore(botButton, el('mp-start-button'));
    }

    ['mp-host-password', 'mp-guest-password'].forEach((id) => {
      const input = el(id);
      if (!input) return;
      const field = input.closest('.multiplayer-field') || input.parentElement;
      if (field) field.style.display = 'none';
    });

    const createSection = el('mp-create-title')?.closest('.multiplayer-section');
    if (createSection && !el('mp-room-visibility')) {
      const label = document.createElement('label');
      label.className = 'multiplayer-field';
      label.innerHTML = `<span>${escapeHtml(c.visibility)}</span><select id="mp-room-visibility" style="width:100%;padding:11px 12px;border:1px solid rgba(255,255,255,.13);border-radius:10px;color:#edf5ef;background:#0b1711"><option value="public">${escapeHtml(c.publicRoom)}</option><option value="private">${escapeHtml(c.privateRoom)}</option></select><small style="text-transform:none;letter-spacing:0;font-weight:500;color:#82948a">${escapeHtml(c.visibilityHelp)}</small>`;
      const button = el('mp-create-button');
      if (button) createSection.insertBefore(label, button.closest('.multiplayer-actions') || button);
      else createSection.appendChild(label);
    }

    const setup = el('multiplayer-setup');
    if (setup && !el('mp-server-browser')) {
      const section = document.createElement('section');
      section.id = 'mp-server-browser';
      section.className = 'multiplayer-section';
      section.style.gridColumn = '1 / -1';
      section.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <h3 id="mp-browser-title" style="margin:0">${escapeHtml(c.browser)}</h3>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="action" data-action="mp-refresh-rooms" id="mp-refresh-rooms">${escapeHtml(c.refresh)}</button>
            <button type="button" class="action primary" data-action="mp-quick-play" id="mp-quick-play">${escapeHtml(c.quick)}</button>
          </div>
        </div>
        <div id="mp-room-list" style="display:grid;gap:8px;margin-top:12px"></div>`;
      setup.appendChild(section);
    } else {
      setText('mp-browser-title', c.browser);
      setText('mp-refresh-rooms', c.refresh);
      setText('mp-quick-play', mp.queued ? 'Anuluj Quick Play' : c.quick);
    }
    prefillNickname();
    renderRoomBrowser();
  }

  function renderRoomBrowser() {
    const list = el('mp-room-list');
    if (!list) return;
    const c = copy();
    const rooms = (mp.rooms || []).filter((room) => room.game === GAME_ID && room.visibility === 'public');
    if (!rooms.length) {
      list.innerHTML = `<div style="padding:12px;border:1px dashed rgba(255,255,255,.12);border-radius:10px;color:#82948a;font-size:11px">${escapeHtml(c.noRooms)}</div>`;
    } else {
      list.innerHTML = rooms.map((room) => {
        const count = room.players?.length || 0;
        const disabled = count >= room.maxPlayers;
        return `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid rgba(255,255,255,.1);border-radius:11px;background:rgba(255,255,255,.025)"><div style="min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(room.name || 'Skat')}</b><small style="color:#82948a">${escapeHtml(room.id)}</small></div><span style="font-size:11px;color:#b4c2ba">${count}/${room.maxPlayers}</span><button type="button" class="action" data-mp-join-room="${escapeHtml(room.id)}" ${disabled ? 'disabled' : ''}>${escapeHtml(c.joinRoom)}</button></div>`;
      }).join('');
    }
    const quick = el('mp-quick-play');
    if (quick) quick.textContent = mp.queued ? 'Anuluj Quick Play' : c.quick;
  }

  async function refreshRooms() {
    try {
      await ensureSocket();
      socketSend({ type: 'rooms.list', game: GAME_ID });
    } catch (_) {
      setStatus('mp-host-status', copy().serverOffline, true);
    }
  }

  async function openModal() {
    prepareModalUI();
    el('multiplayer-modal')?.classList.remove('hidden');
    if (!mp.roomObj) {
      el('multiplayer-setup')?.classList.remove('hidden');
      el('multiplayer-lobby')?.classList.add('hidden');
    } else renderLobby();
    setStatus('mp-host-status', '');
    setStatus('mp-guest-status', '');
    try {
      await ensureSocket();
      await resumeStoredSession(true);
      prepareModalUI();
      if (mp.roomObj) renderLobby();
      else refreshRooms();
    } catch (_) {
      setStatus('mp-host-status', copy().serverOffline, true);
    }
  }

  function renderLobby() {
    prepareModalUI();
    el('multiplayer-setup')?.classList.add('hidden');
    el('multiplayer-lobby')?.classList.remove('hidden');
    if (el('mp-room-display')) el('mp-room-display').textContent = mp.room || '—';
    if (el('mp-room-meta')) {
      const visibility = mp.roomObj?.visibility === 'public' ? copy().publicRoom : copy().privateRoom;
      el('mp-room-meta').textContent = `${visibility} · QQND Server`;
    }
    const seats = el('mp-lobby-seats');
    if (seats) {
      seats.innerHTML = [0, 1, 2].map((seat) => {
        const humanCount = mp.roomObj?.players?.length || 0;
        const isBot = mp.botSeats.includes(seat) || (mp.fillBot && humanCount === 2 && seat === 2);
        const player = isBot ? null : mp.roomObj?.players?.[seat];
        const isSelf = player?.id === mp.session?.id;
        const isHost = player?.id === mp.hostSessionId || (seat === 0 && !isBot);
        const name = isBot ? hybridCopy().botName : (player?.nickname || copy().waiting);
        const connected = isBot || !!player?.connected;
        const status = isBot ? hybridCopy().botStatus : (isHost ? `${copy().host}${connected ? '' : ` · ${copy().offline}`}` : (connected ? copy().connected : (player ? copy().offline : copy().waiting)));
        return `<div class="lobby-seat ${connected ? 'connected' : ''}"><b>${escapeHtml(name)}${isSelf ? ' · Ty' : ''}</b><small>${escapeHtml(status)}</small></div>`;
      }).join('');
    }
    const humans = mp.roomObj?.players || [];
    const allHumansConnected = humans.length > 0 && humans.every((player) => player.connected);
    const fullHumanReady = humans.length === 3 && allHumansConnected;
    const hybridReady = humans.length === 2 && mp.fillBot && allHumansConnected;
    const ready = mp.role === 'host' && (fullHumanReady || hybridReady);
    const start = el('mp-start-button');
    if (start) {
      start.disabled = !ready;
      start.classList.toggle('disabled', !ready);
      start.classList.toggle('primary', ready);
    }
    const botButton = el('mp-toggle-bot');
    if (botButton) {
      const show = mp.role === 'host' && !mp.inGame && humans.length === 2;
      botButton.style.display = show ? '' : 'none';
      botButton.textContent = mp.fillBot ? hybridCopy().removeBot : hybridCopy().addBot;
      botButton.classList.toggle('primary', !!mp.fillBot);
    }
    const lobbyText = ready ? (hybridReady ? hybridCopy().hybridReady : copy().roomFull) : (humans.length === 2 && !mp.fillBot ? hybridCopy().twoHumans : copy().roomReady);
    setStatus('mp-lobby-status', lobbyText);
  }

  async function createRoom() {
    const nick = currentNickname('host');
    const checked = validateNick(nick);
    if (!checked.ok) { setStatus('mp-host-status', checked.message, true); return; }
    try {
      await leaveCurrentRoom(false);
      await ensureSession(checked.nickname);
      const visibility = el('mp-room-visibility')?.value === 'private' ? 'private' : 'public';
      setStatus('mp-host-status', 'Tworzenie pokoju…');
      const message = await request({ type: 'room.create', game: GAME_ID, name: `${checked.nickname} · Skat`, visibility }, 'room.created');
      mp.quickPlay = false;
      syncRoom(message.room);
      renderLobby();
    } catch (error) {
      setStatus('mp-host-status', friendlyError(error), true);
    }
  }

  function normalizeRoomCode(value) {
    const raw = String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
    return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : '';
  }

  async function joinRoom(roomId) {
    const nick = currentNickname('guest');
    const checked = validateNick(nick);
    if (!checked.ok) { setStatus('mp-guest-status', checked.message, true); return; }
    const room = normalizeRoomCode(roomId || el('mp-room-code')?.value);
    if (!room) { setStatus('mp-guest-status', 'Wpisz pełny ośmioznakowy kod pokoju.', true); return; }
    try {
      await leaveCurrentRoom(false);
      await ensureSession(checked.nickname);
      setStatus('mp-guest-status', 'Dołączanie…');
      const message = await request({ type: 'room.join', roomId: room }, 'room.joined', (item) => item.room?.id === room);
      mp.quickPlay = false;
      syncRoom(message.room);
      renderLobby();
    } catch (error) {
      setStatus('mp-guest-status', friendlyError(error), true);
    }
  }

  async function toggleQuickPlay() {
    try {
      await ensureSocket();
      if (mp.queued) {
        socketSend({ type: 'queue.leave', game: GAME_ID });
        mp.queued = false;
        renderRoomBrowser();
        setStatus('mp-host-status', 'Quick Play anulowany.');
        return;
      }
      const nick = currentNickname('host');
      const checked = validateNick(nick);
      if (!checked.ok) { setStatus('mp-host-status', checked.message, true); return; }
      await leaveCurrentRoom(false);
      await ensureSession(checked.nickname);
      mp.quickPlay = true;
      socketSend({ type: 'queue.join', game: GAME_ID });
      setStatus('mp-host-status', copy().searching);
    } catch (error) {
      setStatus('mp-host-status', friendlyError(error), true);
    }
  }

  function friendlyError(error) {
    const message = String(error?.message || error || '');
    if (message === 'timeout') return 'Serwer nie odpowiedział na czas.';
    if (message === 'connection_closed' || message === 'websocket_error' || message === 'server_not_connected') return copy().serverOffline;
    if (/^[a-z_]+$/.test(message)) return serverErrorText(message);
    return message || copy().serverOffline;
  }

  async function copyText(value, statusId) {
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const area = document.createElement('textarea');
        area.value = value;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      setStatus(statusId, language() === 'pl' ? 'Skopiowano.' : 'Copied.');
    } catch (_) {
      setStatus(statusId, 'Nie udało się skopiować automatycznie.', true);
    }
  }

  async function leaveCurrentRoom(renderSetup = true) {
    try {
      if (mp.queued && mp.socket?.readyState === WebSocket.OPEN) socketSend({ type: 'queue.leave', game: GAME_ID });
      if (mp.room && mp.session && mp.socket?.readyState === WebSocket.OPEN) socketSend({ type: 'room.leave', roomId: mp.room });
    } catch (_) {}
    clearRoomState();
    if (renderSetup) {
      el('multiplayer-lobby')?.classList.add('hidden');
      el('multiplayer-setup')?.classList.remove('hidden');
      refreshRooms();
    }
  }

  function clearRoomState() {
    mp.roomObj = null;
    mp.room = '';
    mp.role = null;
    mp.seat = null;
    mp.names = ['', '', ''];
    mp.hostSessionId = '';
    mp.inGame = false;
    mp.authoritative = false;
    mp.stateSeq = 0;
    mp.queued = false;
    mp.quickPlay = false;
    mp.botSeats = [];
    mp.fillBot = false;
    mp.graceBySeat = {};
    if (mp.graceTicker) window.clearInterval(mp.graceTicker);
    mp.graceTicker = null;
    const state = Skat.game?.state;
    if (state) {
      state.multiplayer = false;
      state.playerNames = null;
    }
    updateNetworkPill(false);
  }

  function mapPlayer(value, order) { return Number.isInteger(value) ? order.indexOf(value) : value; }
  function hiddenHand(player, count) { return Array.from({ length: count }, (_, index) => ({ id: `hidden-${player}-${index}`, suit: 'C', rank: '7' })); }

  function cloneGameState(state) {
    return JSON.parse(JSON.stringify(state, (key, value) => value instanceof Set ? [...value] : (key === 'botTimer' || key === 'cardFlight' ? null : value)));
  }

  function stateForSeat(state, seat) {
    const order = [seat, (seat + 1) % 3, (seat + 2) % 3];
    const clone = cloneGameState(state);
    const visibleHands = state.hands.map((hand, player) => {
      const openlyShown = state.contract?.ouvert && state.declarer === player && ['kontra', 'play', 'hand-end'].includes(state.phase);
      return player === seat || openlyShown ? hand.map((card) => ({ ...card })) : hiddenHand(player, hand.length);
    });
    clone.hands = order.map((player) => visibleHands[player]);
    clone.scores = order.map((player) => state.scores[player]);
    clone.captured = order.map((player) => state.captured[player]);
    clone.voids = order.map((player) => [...(state.voids[player] || [])]);
    clone.auctionSpeech = order.map((player) => state.auctionSpeech[player]);
    clone.playerNames = order.map((player) => state.playerNames?.[player] || Skat.PLAYER_NAMES[player]);
    ['dealer','declarer','currentPlayer','lastTrickWinner','collectingWinner'].forEach((key) => { clone[key] = mapPlayer(state[key], order); });
    if (clone.auction) ['actor','caller','listener','survivor'].forEach((key) => { clone.auction[key] = mapPlayer(clone.auction[key], order); });
    if (clone.auctionFlash) clone.auctionFlash.player = mapPlayer(clone.auctionFlash.player, order);
    if (clone.trick) {
      clone.trick.leader = mapPlayer(clone.trick.leader, order);
      clone.trick.cards = (clone.trick.cards || []).map((entry) => ({ ...entry, player: mapPlayer(entry.player, order) }));
    }
    if (clone.kontra) {
      clone.kontra.actor = mapPlayer(clone.kontra.actor, order);
      clone.kontra.contraBy = mapPlayer(clone.kontra.contraBy, order);
      clone.kontra.queue = (clone.kontra.queue || []).map((player) => mapPlayer(player, order));
    }
    const declarerMayKnowSkat = seat === state.declarer && !state.handGame && ['declare','announce','kontra','play','hand-end'].includes(state.phase);
    clone.skat = declarerMayKnowSkat ? state.skat.map((card) => ({ ...card })) : hiddenHand('skat', state.skat.length);
    clone.declarerPossession = [];
    clone.selectedDiscard = [];
    clone.multiplayer = true;
    clone.tutorialMode = false;
    clone.tutorialShowcase = null;
    return clone;
  }

  function broadcastState() {
    if (mp.authoritative) return;
    if (mp.role !== 'host' || !mp.inGame || !mp.roomObj || mp.socket?.readyState !== WebSocket.OPEN) return;
    const state = Skat.game?.state;
    if (!state) return;
    mp.stateSeq += 1;
    socketSend({ type: 'game.state.commit', roomId: mp.room, revision: mp.stateSeq, state: cloneGameState(state) });
    mp.roomObj.players.forEach((player, seat) => {
      if (player.id === mp.session?.id || seat < 1 || seat > 2 || !player.connected) return;
      socketSend({ type: 'game.state.publish', roomId: mp.room, revision: mp.stateSeq, toSessionId: player.id, state: stateForSeat(state, seat) });
    });
  }

  function applyRemoteState(snapshot, seq) {
    if (!snapshot || !Number.isFinite(seq) || seq <= mp.stateSeq) return;
    mp.stateSeq = seq;
    mp.inGame = true;
    const state = Skat.game?.state;
    if (!state) return;
    const localSettings = { ...(state.settings || {}) };
    const languageCode = localSettings.language || 'pl';
    const soundEffects = localSettings.soundEffects;
    const animations = localSettings.animations;
    const selected = snapshot.phase === 'discard' ? new Set(snapshot.selectedDiscard || []) : new Set();
    Object.assign(state, snapshot, {
      selectedDiscard: selected,
      voids: (snapshot.voids || [[], [], []]).map((items) => new Set(items || [])),
      botTimer: null,
      botActionRunning: false,
      cardFlight: null,
      multiplayer: true,
    });
    state.settings = { ...localSettings, ...(snapshot.settings || {}), language: languageCode, soundEffects, animations };
    Skat.game?.hideMainMenu?.();
    el('multiplayer-modal')?.classList.add('hidden');
    Skat.ui?.render?.(state);
    updateNetworkPill(true);
  }

  async function startGame() {
    const humans = mp.roomObj?.players || [];
    const botCount = humans.length === 2 && mp.fillBot ? 1 : 0;
    const ready = mp.role === 'host' && humans.every((player) => player.connected) && humans.length + botCount === 3;
    if (!ready || mp.inGame) return;
    try {
      const local = Skat.game?.state?.settings || {};
      const settings = {
        advancedContracts: !!local.advancedContracts,
        ramsch: !!local.ramsch,
        kontraRe: !!local.kontraRe,
        botDifficulty: ['easy','normal','hard','expert'].includes(local.botDifficulty) ? local.botDifficulty : 'normal',
      };
      const started = await request({ type: 'game.start', roomId: mp.room, botCount, settings }, 'game.started', (message) => message.room?.id === mp.room);
      mp.botSeats = Array.isArray(started.botSeats) ? started.botSeats.filter(Number.isInteger) : [];
      mp.fillBot = mp.botSeats.length > 0;
      mp.authoritative = !!started.authoritative;
      mp.names = [0, 1, 2].map((seat) => humans[seat]?.nickname || (mp.botSeats.includes(seat) ? hybridCopy().botName : ''));
      mp.inGame = true;
      mp.quickPlay = false;
      const state = Skat.game?.state;
      if (!state) return;
      state.multiplayer = true;
      state.playerNames = [...mp.names];
      state.tutorialMode = false;
      Skat.game.hideMainMenu();
      el('multiplayer-modal')?.classList.add('hidden');
      updateNetworkPill(true);
      if (mp.authoritative) {
        socketSend({ type: 'game.state.get', roomId: mp.room });
      } else {
        Skat.game.resetMatch();
        window.setTimeout(broadcastState, 0);
      }
    } catch (error) {
      setStatus('mp-lobby-status', friendlyError(error), true);
    }
  }

  function networkInterrupted(customMessage) {
    const state = Skat.game?.state;
    if (mp.inGame && state) {
      state.statusText = customMessage || 'Połączenie z serwerem zostało przerwane. Trwa próba automatycznego wznowienia sesji.';
      Skat.ui?.render?.(state);
    }
    updateNetworkPill(false);
  }

  function updateNetworkPill(connected = true) {
    const pill = el('network-pill');
    if (!pill) return;
    pill.classList.toggle('visible', !!mp.inGame);
    pill.classList.toggle('offline', !connected);
    if (el('network-pill-text')) {
      const countdown = graceCountdownText();
      el('network-pill-text').textContent = mp.room ? `SERVER · ${mp.room}${countdown ? ` · ${countdown}` : ''}` : 'SERVER';
    }
    const brand = document.querySelector('.brand-block .eyebrow');
    if (brand && mp.inGame) brand.textContent = `MULTIPLAYER · ${mp.room}`;
  }

  function sendGameAction(action, payload = {}) {
    if (!mp.inGame || !mp.room || mp.socket?.readyState !== WebSocket.OPEN) return;
    socketSend({ type: 'game.action', roomId: mp.room, action, payload, actionId: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
  }

  function handleGameAction(action, state) {
    if (action === 'open-main-menu' && mp.inGame) {
      leaveCurrentRoom(false);
      return false;
    }
    const modalActions = new Set([
      'menu-multiplayer','close-multiplayer','mp-create-room','mp-make-offer','mp-copy-room','mp-leave','mp-start-game',
      'mp-refresh-rooms','mp-quick-play','mp-toggle-bot'
    ]);
    if (modalActions.has(action)) {
      if (action === 'menu-multiplayer') openModal();
      else if (action === 'close-multiplayer') el('multiplayer-modal')?.classList.add('hidden');
      else if (action === 'mp-leave') leaveCurrentRoom(true);
      else if (action === 'mp-create-room') createRoom();
      else if (action === 'mp-make-offer') joinRoom();
      else if (action === 'mp-copy-room') copyText(mp.room, 'mp-lobby-status');
      else if (action === 'mp-start-game') startGame();
      else if (action === 'mp-refresh-rooms') refreshRooms();
      else if (action === 'mp-quick-play') toggleQuickPlay();
      else if (action === 'mp-toggle-bot') {
        if (mp.role === 'host' && !mp.inGame && mp.roomObj?.players?.length === 2) {
          mp.fillBot = !mp.fillBot;
          mp.botSeats = [];
          renderLobby();
          broadcastLobby();
        }
      }
      return true;
    }
    const routed = GAME_ACTIONS.has(action) || action.startsWith('declare-') || action.startsWith('select-hand-');
    if (!mp.inGame || !routed) return false;
    if (action === 'confirm-discard') {
      sendGameAction(action, { cardIds: [...(state.selectedDiscard || [])] });
      return true;
    }
    sendGameAction(action);
    return true;
  }

  function handleCardPlay(cardId) {
    if (!mp.inGame) return false;
    sendGameAction('play-card', { cardId });
    return true;
  }

  function afterRender(state) {
    prepareModalUI();
    const connected = mp.socket?.readyState === WebSocket.OPEN && (!mp.roomObj || mp.roomObj.players.some((player) => player.id === mp.session?.id && player.connected));
    updateNetworkPill(connected);
    if (!mp.authoritative && mp.role === 'host' && mp.inGame && state.multiplayer) broadcastState();
  }

  document.addEventListener('click', (event) => {
    const join = event.target.closest('[data-mp-join-room]');
    if (join) {
      event.preventDefault();
      joinRoom(join.dataset.mpJoinRoom);
    }
  });
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'mp-host-nick' || event.target?.id === 'mp-guest-nick') syncNickInputs(event.target);
  });
  window.addEventListener('online', () => { if (!mp.socket || mp.socket.readyState !== WebSocket.OPEN) scheduleReconnect(); });

  Skat.multiplayer = {
    handleGameAction,
    handleCardPlay,
    afterRender,
    isGameActive: () => mp.inGame,
    isBotSeat: (seat) => mp.botSeats.includes(seat),
    debug: () => mp,
    debugRenderLobby: renderLobby,
    debugStartGame: startGame,
    refreshRooms,
  };

  window.addEventListener('DOMContentLoaded', () => {
    prepareModalUI();
    ensureSocket().then(() => resumeStoredSession(true)).catch(() => {});
  });
})();
