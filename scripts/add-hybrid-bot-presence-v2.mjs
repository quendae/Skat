import fs from 'node:fs';

const clientPath = 'multiplayer-server.js';
let client = fs.readFileSync(clientPath, 'utf8');
let changed = false;

function replaceRequired(before, after, label) {
  if (client.includes(after)) return;
  if (!client.includes(before)) throw new Error(`Could not find hybrid migration marker: ${label}`);
  client = client.replace(before, after);
  changed = true;
}

replaceRequired(
  "    quickPlay: false,\n    rooms: [],\n    lastError: '',",
  "    quickPlay: false,\n    botSeats: [],\n    fillBot: false,\n    rooms: [],\n    lastError: '',",
  'multiplayer bot state',
);

replaceRequired(
  "  const copy = () => COPY[language()] || COPY.pl;\n",
  `  const copy = () => COPY[language()] || COPY.pl;\n\n  const HYBRID_COPY = {\n    pl: { botName: 'Bot', addBot: 'Dodaj bota', removeBot: 'Usuń bota', botStatus: 'Bot · sterowany przez gospodarza', twoHumans: 'Dwóch graczy jest gotowych. Możesz poczekać na trzecią osobę albo dodać bota.', hybridReady: '2 graczy + bot. Można rozpocząć grę.', connectionLost: (name) => 'Utracono połączenie z graczem ' + name + '. Czekamy na jego powrót.', connectionRestored: (name) => 'Połączenie gracza ' + name + ' zostało wznowione.', leftGame: (name) => 'Gracz ' + name + ' opuścił grę.' },\n    en: { botName: 'Bot', addBot: 'Add bot', removeBot: 'Remove bot', botStatus: 'Bot · controlled by host', twoHumans: 'Two players are ready. Wait for a third player or add a bot.', hybridReady: '2 players + bot. Ready to start.', connectionLost: (name) => 'Connection to ' + name + ' was lost. Waiting for them to return.', connectionRestored: (name) => name + ' reconnected.', leftGame: (name) => name + ' left the game.' },\n    de: { botName: 'Bot', addBot: 'Bot hinzufügen', removeBot: 'Bot entfernen', botStatus: 'Bot · vom Gastgeber gesteuert', twoHumans: 'Zwei Spieler sind bereit. Warte auf einen dritten Spieler oder füge einen Bot hinzu.', hybridReady: '2 Spieler + Bot. Spiel kann gestartet werden.', connectionLost: (name) => 'Verbindung zu ' + name + ' verloren. Wir warten auf die Rückkehr.', connectionRestored: (name) => name + ' ist wieder verbunden.', leftGame: (name) => name + ' hat das Spiel verlassen.' },\n    es: { botName: 'Bot', addBot: 'Añadir bot', removeBot: 'Quitar bot', botStatus: 'Bot · controlado por el anfitrión', twoHumans: 'Hay dos jugadores listos. Espera al tercero o añade un bot.', hybridReady: '2 jugadores + bot. Listos para empezar.', connectionLost: (name) => 'Se perdió la conexión con ' + name + '. Esperando su regreso.', connectionRestored: (name) => name + ' se ha reconectado.', leftGame: (name) => name + ' abandonó la partida.' },\n    fr: { botName: 'Bot', addBot: 'Ajouter un bot', removeBot: 'Retirer le bot', botStatus: 'Bot · contrôlé par l’hôte', twoHumans: 'Deux joueurs sont prêts. Attendez un troisième joueur ou ajoutez un bot.', hybridReady: '2 joueurs + bot. Prêt à démarrer.', connectionLost: (name) => 'Connexion avec ' + name + ' perdue. En attente de son retour.', connectionRestored: (name) => name + ' est reconnecté.', leftGame: (name) => name + ' a quitté la partie.' },\n  };\n  const hybridCopy = () => HYBRID_COPY[language()] || HYBRID_COPY.pl;\n\n  let eventToastTimer = null;\n  function showEventToast(message, tone = 'info') {\n    if (!message) return;\n    let node = el('mp-event-toast');\n    if (!node) {\n      node = document.createElement('div');\n      node.id = 'mp-event-toast';\n      node.setAttribute('role', 'status');\n      node.setAttribute('aria-live', 'polite');\n      Object.assign(node.style, { position: 'fixed', top: '18px', left: '50%', transform: 'translateX(-50%) translateY(-8px)', zIndex: '99999', maxWidth: 'min(620px, calc(100vw - 28px))', padding: '11px 16px', borderRadius: '12px', border: '1px solid rgba(216,179,95,.45)', background: 'rgba(8,17,13,.96)', color: '#edf5ef', boxShadow: '0 14px 38px rgba(0,0,0,.42)', fontSize: '13px', fontWeight: '750', textAlign: 'center', opacity: '0', pointerEvents: 'none', transition: 'opacity .18s ease, transform .18s ease' });\n      document.body.appendChild(node);\n    }\n    node.textContent = message;\n    node.style.borderColor = tone === 'danger' ? 'rgba(255,143,143,.68)' : tone === 'success' ? 'rgba(130,220,160,.58)' : 'rgba(216,179,95,.45)';\n    node.style.opacity = '1';\n    node.style.transform = 'translateX(-50%) translateY(0)';\n    if (eventToastTimer) window.clearTimeout(eventToastTimer);\n    eventToastTimer = window.setTimeout(() => {\n      node.style.opacity = '0';\n      node.style.transform = 'translateX(-50%) translateY(-8px)';\n    }, 4500);\n  }\n`,
  'hybrid translations and event toast',
);

replaceRequired(
  "    mp.role = mp.session?.id === room.ownerSessionId ? 'host' : 'guest';\n    mp.names = [0, 1, 2].map((seat) => room.players?.[seat]?.nickname || '');",
  "    mp.role = mp.session?.id === room.ownerSessionId ? 'host' : 'guest';\n    if (room.status === 'in_game' && room.players.length < 3 && mp.botSeats.length === 0) {\n      mp.botSeats = Array.from({ length: 3 - room.players.length }, (_, index) => room.players.length + index);\n      mp.fillBot = mp.botSeats.length > 0;\n    }\n    if (room.status !== 'in_game' && room.players.length >= 3) {\n      mp.fillBot = false;\n      mp.botSeats = [];\n    }\n    mp.names = [0, 1, 2].map((seat) => room.players?.[seat]?.nickname || (mp.botSeats.includes(seat) ? hybridCopy().botName : ''));",
  'room bot-seat sync',
);

replaceRequired(
  "    roomSend({ type: 'skat.lobby', names: mp.names });",
  "    roomSend({ type: 'skat.lobby', names: mp.names, fillBot: mp.fillBot });",
  'bot choice lobby broadcast',
);

replaceRequired(
  "    if (payload.type === 'skat.lobby' && mp.role === 'guest' && !mp.inGame) {\n      if (Array.isArray(payload.names)) mp.names = payload.names.slice(0, 3);\n      renderLobby();\n      return;\n    }",
  "    if (payload.type === 'skat.lobby' && mp.role === 'guest' && !mp.inGame) {\n      if (Array.isArray(payload.names)) mp.names = payload.names.slice(0, 3);\n      mp.fillBot = !!payload.fillBot;\n      renderLobby();\n      return;\n    }",
  'guest bot-choice lobby sync',
);

replaceRequired(
  "    if (message.type === 'game.started') {\n      if (message.room?.game === GAME_ID) syncRoom(message.room);\n      return;\n    }",
  "    if (message.type === 'game.started') {\n      mp.botSeats = Array.isArray(message.botSeats) ? message.botSeats.filter(Number.isInteger) : [];\n      mp.fillBot = mp.botSeats.length > 0;\n      if (message.room?.game === GAME_ID) syncRoom(message.room);\n      return;\n    }",
  'game started bot seats',
);

replaceRequired(
  "    if (message.type === 'game.state') {\n      if (message.roomId === mp.room) applyRemoteState(message.state, message.revision);\n      return;\n    }\n    if (message.type === 'game.ended') {",
  "    if (message.type === 'game.state') {\n      if (Array.isArray(message.botSeats)) {\n        mp.botSeats = message.botSeats.filter(Number.isInteger);\n        mp.fillBot = mp.botSeats.length > 0;\n      }\n      if (message.roomId === mp.room) applyRemoteState(message.state, message.revision);\n      return;\n    }\n    if (message.type === 'game.player.connection' && message.roomId === mp.room && message.sessionId !== mp.session?.id) {\n      const text = message.connected ? hybridCopy().connectionRestored(message.nickname || 'gracz') : hybridCopy().connectionLost(message.nickname || 'gracz');\n      showEventToast(text, message.connected ? 'success' : 'danger');\n      return;\n    }\n    if (message.type === 'game.player.left' && message.roomId === mp.room && message.sessionId !== mp.session?.id) {\n      showEventToast(hybridCopy().leftGame(message.nickname || 'gracz'), 'danger');\n      return;\n    }\n    if (message.type === 'game.ended') {",
  'presence and leave events',
);

replaceRequired(
  "    setText('mp-start-button', c.start);\n",
  "    setText('mp-start-button', c.start);\n    const footer = el('mp-start-button')?.parentElement;\n    if (footer && !el('mp-toggle-bot')) {\n      const botButton = document.createElement('button');\n      botButton.type = 'button';\n      botButton.id = 'mp-toggle-bot';\n      botButton.className = 'action secondary';\n      botButton.dataset.action = 'mp-toggle-bot';\n      botButton.textContent = hybridCopy().addBot;\n      botButton.style.display = 'none';\n      footer.insertBefore(botButton, el('mp-start-button'));\n    }\n",
  'bot toggle button',
);

replaceRequired(
  "        const player = mp.roomObj?.players?.[seat];\n        const isSelf = player?.id === mp.session?.id;\n        const isHost = player?.id === mp.hostSessionId || seat === 0;\n        const name = player?.nickname || copy().waiting;\n        const connected = !!player?.connected;\n        const status = isHost ? `${copy().host}${connected ? '' : ` · ${copy().offline}`}` : (connected ? copy().connected : (player ? copy().offline : copy().waiting));\n        return `<div class=\"lobby-seat ${connected ? 'connected' : ''}\"><b>${escapeHtml(name)}${isSelf ? ' · Ty' : ''}</b><small>${escapeHtml(status)}</small></div>`;",
  "        const humanCount = mp.roomObj?.players?.length || 0;\n        const isBot = mp.botSeats.includes(seat) || (mp.fillBot && humanCount === 2 && seat === 2);\n        const player = isBot ? null : mp.roomObj?.players?.[seat];\n        const isSelf = player?.id === mp.session?.id;\n        const isHost = player?.id === mp.hostSessionId || (seat === 0 && !isBot);\n        const name = isBot ? hybridCopy().botName : (player?.nickname || copy().waiting);\n        const connected = isBot || !!player?.connected;\n        const status = isBot ? hybridCopy().botStatus : (isHost ? `${copy().host}${connected ? '' : ` · ${copy().offline}`}` : (connected ? copy().connected : (player ? copy().offline : copy().waiting)));\n        return `<div class=\"lobby-seat ${connected ? 'connected' : ''}\"><b>${escapeHtml(name)}${isSelf ? ' · Ty' : ''}</b><small>${escapeHtml(status)}</small></div>`;",
  'bot lobby seat',
);

replaceRequired(
  "    const ready = mp.role === 'host' && mp.roomObj?.players?.length === 3 && mp.roomObj.players.every((player) => player.connected);\n    const start = el('mp-start-button');\n    if (start) {\n      start.disabled = !ready;\n      start.classList.toggle('disabled', !ready);\n      start.classList.toggle('primary', ready);\n    }\n    setStatus('mp-lobby-status', ready ? copy().roomFull : copy().roomReady);",
  "    const humans = mp.roomObj?.players || [];\n    const allHumansConnected = humans.length > 0 && humans.every((player) => player.connected);\n    const fullHumanReady = humans.length === 3 && allHumansConnected;\n    const hybridReady = humans.length === 2 && mp.fillBot && allHumansConnected;\n    const ready = mp.role === 'host' && (fullHumanReady || hybridReady);\n    const start = el('mp-start-button');\n    if (start) {\n      start.disabled = !ready;\n      start.classList.toggle('disabled', !ready);\n      start.classList.toggle('primary', ready);\n    }\n    const botButton = el('mp-toggle-bot');\n    if (botButton) {\n      const show = mp.role === 'host' && !mp.inGame && humans.length === 2;\n      botButton.style.display = show ? '' : 'none';\n      botButton.textContent = mp.fillBot ? hybridCopy().removeBot : hybridCopy().addBot;\n      botButton.classList.toggle('primary', !!mp.fillBot);\n    }\n    const lobbyText = ready ? (hybridReady ? hybridCopy().hybridReady : copy().roomFull) : (humans.length === 2 && !mp.fillBot ? hybridCopy().twoHumans : copy().roomReady);\n    setStatus('mp-lobby-status', lobbyText);",
  'hybrid ready state',
);

replaceRequired(
  "    mp.quickPlay = false;\n    const state = Skat.game?.state;",
  "    mp.quickPlay = false;\n    mp.botSeats = [];\n    mp.fillBot = false;\n    const state = Skat.game?.state;",
  'clear bot room state',
);

replaceRequired(
  "  async function startGame() {\n    const ready = mp.role === 'host' && mp.roomObj?.players?.length === 3 && mp.roomObj.players.every((player) => player.connected);\n    if (!ready || mp.inGame) return;\n    try {\n      await request({ type: 'game.start', roomId: mp.room }, 'game.started', (message) => message.room?.id === mp.room);\n      mp.inGame = true;\n      mp.quickPlay = false;\n      const state = Skat.game?.state;\n      if (!state) return;\n      state.multiplayer = true;\n      state.playerNames = [...mp.names];",
  "  async function startGame() {\n    const humans = mp.roomObj?.players || [];\n    const botCount = humans.length === 2 && mp.fillBot ? 1 : 0;\n    const ready = mp.role === 'host' && humans.every((player) => player.connected) && humans.length + botCount === 3;\n    if (!ready || mp.inGame) return;\n    try {\n      const started = await request({ type: 'game.start', roomId: mp.room, botCount }, 'game.started', (message) => message.room?.id === mp.room);\n      mp.botSeats = Array.isArray(started.botSeats) ? started.botSeats.filter(Number.isInteger) : [];\n      mp.fillBot = mp.botSeats.length > 0;\n      mp.names = [0, 1, 2].map((seat) => humans[seat]?.nickname || (mp.botSeats.includes(seat) ? hybridCopy().botName : ''));\n      mp.inGame = true;\n      mp.quickPlay = false;\n      const state = Skat.game?.state;\n      if (!state) return;\n      state.multiplayer = true;\n      state.playerNames = [...mp.names];",
  'hybrid game start',
);

replaceRequired(
  "      'mp-refresh-rooms','mp-quick-play'",
  "      'mp-refresh-rooms','mp-quick-play','mp-toggle-bot'",
  'bot modal action routing',
);

replaceRequired(
  "      else if (action === 'mp-quick-play') toggleQuickPlay();\n      return true;",
  "      else if (action === 'mp-quick-play') toggleQuickPlay();\n      else if (action === 'mp-toggle-bot') {\n        if (mp.role === 'host' && !mp.inGame && mp.roomObj?.players?.length === 2) {\n          mp.fillBot = !mp.fillBot;\n          mp.botSeats = [];\n          renderLobby();\n          broadcastLobby();\n        }\n      }\n      return true;",
  'bot action handler',
);

replaceRequired(
  "    isBotSeat: () => false,",
  "    isBotSeat: (seat) => mp.botSeats.includes(seat),",
  'multiplayer bot controller hook',
);

if (changed) fs.writeFileSync(clientPath, client);
console.log(changed ? 'Hybrid bot/presence migration applied.' : 'Hybrid bot/presence migration already up to date.');
