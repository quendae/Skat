import fs from 'node:fs';

const path = 'multiplayer-server.js';
let src = fs.readFileSync(path, 'utf8');
let changed = false;

function replace(before, after, label) {
  if (src.includes(after)) return;
  if (!src.includes(before)) throw new Error(`Missing marker: ${label}`);
  src = src.replace(before, after);
  changed = true;
}

replace(
  '/* Skat multiplayer Phase 1: shared QQND WebSocket server transport.\n * The browser host remains game-authoritative for now; the server owns sessions,\n * rooms, presence, matchmaking and authenticated message relay.\n */',
  '/* Skat multiplayer: server-authoritative rules and shared QQND WebSocket transport.\n * The server owns shuffle, deal, seats, action validation, gameplay state, bots and scoring.\n */',
  'header',
);

replace(
  "    inGame: false,\n    stateSeq: 0,",
  "    inGame: false,\n    authoritative: false,\n    stateSeq: 0,",
  'authoritative state flag',
);

src = src.replaceAll(
  'W tej fazie gospodarz nadal tasuje i pilnuje zasad. Serwer obsługuje sesje, pokoje, obecność i bezpieczne przekazywanie wiadomości; każdy gracz otrzymuje tylko swój widok stanu gry.',
  'Serwer tasuje, rozdaje, pilnuje zasad, wykonuje boty i liczy wynik. Każdy gracz otrzymuje wyłącznie swój widok stanu gry.',
);
src = src.replaceAll(
  'For this phase the browser host still shuffles and enforces the rules. The server handles sessions, rooms, presence and authenticated relay; each player receives only their own game view.',
  'The server shuffles, deals, validates the rules, runs bots and scores the game. Each player receives only their own state view.',
);
src = src.replaceAll(
  'In dieser Phase mischt und prüft der Browser-Gastgeber weiterhin die Regeln. Der Server verwaltet Sitzungen, Räume, Anwesenheit und authentifizierte Nachrichten.',
  'Der Server mischt, gibt, prüft die Regeln, steuert Bots und zählt die Punkte. Jeder Spieler erhält nur seine eigene Zustandsansicht.',
);
src = src.replaceAll(
  'En esta fase el anfitrión del navegador sigue barajando y aplicando las reglas. El servidor gestiona sesiones, salas, presencia y retransmisión autenticada.',
  'El servidor baraja, reparte, valida las reglas, controla los bots y calcula la puntuación. Cada jugador recibe solo su propia vista del estado.',
);
src = src.replaceAll(
  'À cette étape, le navigateur hôte mélange encore et applique les règles. Le serveur gère les sessions, salles, présence et relais authentifié.',
  'Le serveur mélange, distribue, valide les règles, joue les bots et calcule le score. Chaque joueur ne reçoit que sa propre vue de l’état.',
);

replace(
  "    if (message.type === 'game.started') {\n      mp.botSeats = Array.isArray(message.botSeats) ? message.botSeats.filter(Number.isInteger) : [];\n      mp.fillBot = mp.botSeats.length > 0;\n      if (message.hostSessionId) mp.hostSessionId = message.hostSessionId;\n      if (message.room?.game === GAME_ID) syncRoom(message.room);\n      mp.role = mp.session?.id === mp.hostSessionId ? 'host' : 'guest';\n      return;\n    }",
  "    if (message.type === 'game.started') {\n      mp.botSeats = Array.isArray(message.botSeats) ? message.botSeats.filter(Number.isInteger) : [];\n      mp.fillBot = mp.botSeats.length > 0;\n      mp.authoritative = !!message.authoritative;\n      mp.inGame = true;\n      if (message.hostSessionId) mp.hostSessionId = message.hostSessionId;\n      if (message.room?.game === GAME_ID) syncRoom(message.room);\n      mp.role = mp.session?.id === mp.hostSessionId ? 'host' : 'guest';\n      Skat.game?.hideMainMenu?.();\n      el('multiplayer-modal')?.classList.add('hidden');\n      updateNetworkPill(true);\n      return;\n    }",
  'game.started authoritative flag',
);

replace(
  "    if (message.type === 'game.action') {\n      if (mp.role === 'host' && mp.inGame && message.roomId === mp.room && Number.isInteger(message.seat)) {\n        Skat.game?.executePlayerAction?.(message.seat, message.action, message.payload || {});\n      }\n      return;\n    }",
  "    if (message.type === 'game.action') {\n      if (!mp.authoritative && mp.role === 'host' && mp.inGame && message.roomId === mp.room && Number.isInteger(message.seat)) {\n        Skat.game?.executePlayerAction?.(message.seat, message.action, message.payload || {});\n      }\n      return;\n    }",
  'disable browser reducer in authoritative mode',
);

replace(
  "    if (message.type === 'game.state') {\n      if (Array.isArray(message.botSeats)) {",
  "    if (message.type === 'game.state') {\n      if (message.authoritative != null) mp.authoritative = !!message.authoritative;\n      if (Array.isArray(message.botSeats)) {",
  'state authoritative flag',
);

replace(
  "      if (message.connected && mp.role === 'host' && mp.inGame) window.setTimeout(broadcastState, 0);",
  "      if (message.connected && !mp.authoritative && mp.role === 'host' && mp.inGame) window.setTimeout(broadcastState, 0);",
  'no browser publish after authoritative reconnect',
);

replace(
  "      if (mp.role === 'host' && mp.inGame) {\n        window.setTimeout(() => {\n          Skat.game?.resumeAutomation?.();\n          broadcastState();\n        }, 0);\n      }",
  "      if (!mp.authoritative && mp.role === 'host' && mp.inGame) {\n        window.setTimeout(() => {\n          Skat.game?.resumeAutomation?.();\n          broadcastState();\n        }, 0);\n      }",
  'no browser takeover bot in authoritative mode',
);

replace(
  "      if (mp.role === 'host' && mp.socket?.readyState === WebSocket.OPEN) socketSend({ type: 'game.state.get', roomId: mp.room });",
  "      if (!mp.authoritative && mp.role === 'host' && mp.socket?.readyState === WebSocket.OPEN) socketSend({ type: 'game.state.get', roomId: mp.room });",
  'host failover only bridge mode',
);

replace(
  "    mp.inGame = false;\n    mp.stateSeq = 0;",
  "    mp.inGame = false;\n    mp.authoritative = false;\n    mp.stateSeq = 0;",
  'clear authoritative state',
);

replace(
  "  function broadcastState() {\n    if (mp.role !== 'host' || !mp.inGame || !mp.roomObj || mp.socket?.readyState !== WebSocket.OPEN) return;",
  "  function broadcastState() {\n    if (mp.authoritative) return;\n    if (mp.role !== 'host' || !mp.inGame || !mp.roomObj || mp.socket?.readyState !== WebSocket.OPEN) return;",
  'disable bridge snapshots',
);

replace(
  "    const languageCode = state.settings?.language || 'pl';\n    const soundEffects = state.settings?.soundEffects;\n    const animations = state.settings?.animations;\n    const selected = state.phase === 'discard' ? new Set(state.selectedDiscard || []) : new Set();",
  "    const localSettings = { ...(state.settings || {}) };\n    const languageCode = localSettings.language || 'pl';\n    const soundEffects = localSettings.soundEffects;\n    const animations = localSettings.animations;\n    const selected = snapshot.phase === 'discard' ? new Set(snapshot.selectedDiscard || []) : new Set();",
  'preserve local UI settings',
);

replace(
  "    state.settings = { ...(snapshot.settings || {}), language: languageCode, soundEffects, animations };",
  "    state.settings = { ...localSettings, ...(snapshot.settings || {}), language: languageCode, soundEffects, animations };",
  'merge server rule settings',
);

replace(
  "      const started = await request({ type: 'game.start', roomId: mp.room, botCount }, 'game.started', (message) => message.room?.id === mp.room);",
  "      const local = Skat.game?.state?.settings || {};\n      const settings = {\n        advancedContracts: !!local.advancedContracts,\n        ramsch: !!local.ramsch,\n        kontraRe: !!local.kontraRe,\n        botDifficulty: ['easy','normal','hard','expert'].includes(local.botDifficulty) ? local.botDifficulty : 'normal',\n      };\n      const started = await request({ type: 'game.start', roomId: mp.room, botCount, settings }, 'game.started', (message) => message.room?.id === mp.room);",
  'send server rule settings',
);

replace(
  "      mp.botSeats = Array.isArray(started.botSeats) ? started.botSeats.filter(Number.isInteger) : [];\n      mp.fillBot = mp.botSeats.length > 0;\n      mp.names = [0, 1, 2].map((seat) => humans[seat]?.nickname || (mp.botSeats.includes(seat) ? hybridCopy().botName : ''));\n      mp.inGame = true;",
  "      mp.botSeats = Array.isArray(started.botSeats) ? started.botSeats.filter(Number.isInteger) : [];\n      mp.fillBot = mp.botSeats.length > 0;\n      mp.authoritative = !!started.authoritative;\n      mp.names = [0, 1, 2].map((seat) => humans[seat]?.nickname || (mp.botSeats.includes(seat) ? hybridCopy().botName : ''));\n      mp.inGame = true;",
  'start authoritative flag',
);

replace(
  "      state.multiplayer = true;\n      state.playerNames = [...mp.names];\n      state.tutorialMode = false;\n      Skat.game.hideMainMenu();\n      el('multiplayer-modal')?.classList.add('hidden');\n      Skat.game.resetMatch();\n      updateNetworkPill(true);\n      window.setTimeout(broadcastState, 0);",
  "      state.multiplayer = true;\n      state.playerNames = [...mp.names];\n      state.tutorialMode = false;\n      Skat.game.hideMainMenu();\n      el('multiplayer-modal')?.classList.add('hidden');\n      updateNetworkPill(true);\n      if (mp.authoritative) {\n        socketSend({ type: 'game.state.get', roomId: mp.room });\n      } else {\n        Skat.game.resetMatch();\n        window.setTimeout(broadcastState, 0);\n      }",
  'wait for server initial deal',
);

replace(
  "    if (mp.role === 'host' && mp.inGame && state.multiplayer) broadcastState();",
  "    if (!mp.authoritative && mp.role === 'host' && mp.inGame && state.multiplayer) broadcastState();",
  'afterRender bridge only',
);

if (changed) fs.writeFileSync(path, src);
console.log(changed ? 'Server-authoritative Skat client migration applied.' : 'Server-authoritative Skat client migration already applied.');
