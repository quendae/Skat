import fs from 'node:fs';

const path = 'multiplayer-server.js';
let src = fs.readFileSync(path, 'utf8');
let changed = false;

function replaceOnce(before, after, label) {
  if (src.includes(after)) return;
  if (!src.includes(before)) throw new Error(`Missing migration marker: ${label}`);
  src = src.replace(before, after);
  changed = true;
}

replaceOnce(
  "    rooms: [],\n    lastError: '',\n",
  "    rooms: [],\n    lastError: '',\n    graceBySeat: {},\n    graceTicker: null,\n",
  'grace state',
);

replaceOnce(
  "        if (mp.socket === socket) mp.socket = null;\n        mp.socketPromise = null;",
  "        if (mp.socket === socket) mp.socket = null;\n        mp.socketPromise = null;\n        // A new WebSocket must authenticate again with the stored resume token.\n        mp.session = null;\n        mp.resumeToken = '';",
  'reauthenticate reconnect socket',
);

replaceOnce(
  "  function normalizeNick(value) {",
  `  function graceCopy(kind, name, seconds) {
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

  function normalizeNick(value) {`,
  'countdown helpers',
);

replaceOnce(
  "    const previousHost = mp.hostSessionId;\n    mp.roomObj = room;\n    mp.room = room.id;\n    mp.hostSessionId = room.ownerSessionId;\n    mp.seat = mp.session ? seatForSession(mp.session.id) : null;\n    mp.role = mp.session?.id === room.ownerSessionId ? 'host' : 'guest';",
  "    mp.roomObj = room;\n    mp.room = room.id;\n    if (!mp.inGame || !mp.hostSessionId) mp.hostSessionId = room.ownerSessionId;\n    mp.seat = mp.session ? seatForSession(mp.session.id) : null;\n    mp.role = mp.session?.id === mp.hostSessionId ? 'host' : 'guest';",
  'runtime host identity',
);

replaceOnce(
  "\n    if (mp.inGame && previousHost && previousHost !== room.ownerSessionId) {\n      networkInterrupted('Gospodarz opuścił grę. To rozdanie nie może być bezpiecznie kontynuowane.');\n      return;\n    }\n",
  "\n",
  'remove old host-abort behavior',
);

replaceOnce(
  "    if (message.type === 'game.started') {\n      mp.botSeats = Array.isArray(message.botSeats) ? message.botSeats.filter(Number.isInteger) : [];\n      mp.fillBot = mp.botSeats.length > 0;\n      if (message.room?.game === GAME_ID) syncRoom(message.room);\n      return;\n    }",
  "    if (message.type === 'game.started') {\n      mp.botSeats = Array.isArray(message.botSeats) ? message.botSeats.filter(Number.isInteger) : [];\n      mp.fillBot = mp.botSeats.length > 0;\n      if (message.hostSessionId) mp.hostSessionId = message.hostSessionId;\n      if (message.room?.game === GAME_ID) syncRoom(message.room);\n      mp.role = mp.session?.id === mp.hostSessionId ? 'host' : 'guest';\n      return;\n    }",
  'game start host identity',
);

replaceOnce(
  "    if (message.type === 'game.state') {\n      if (Array.isArray(message.botSeats)) {\n        mp.botSeats = message.botSeats.filter(Number.isInteger);\n        mp.fillBot = mp.botSeats.length > 0;\n      }\n      if (message.roomId === mp.room) applyRemoteState(message.state, message.revision);\n      return;\n    }",
  "    if (message.type === 'game.state') {\n      if (Array.isArray(message.botSeats)) {\n        mp.botSeats = message.botSeats.filter(Number.isInteger);\n        mp.fillBot = mp.botSeats.length > 0;\n      }\n      if (message.hostSessionId) {\n        mp.hostSessionId = message.hostSessionId;\n        mp.role = mp.session?.id === mp.hostSessionId ? 'host' : 'guest';\n      }\n      if (message.roomId === mp.room) applyRemoteState(message.state, message.revision);\n      return;\n    }",
  'state host identity',
);

replaceOnce(
  "    if (message.type === 'game.player.connection' && message.roomId === mp.room && message.sessionId !== mp.session?.id) {\n      const text = message.connected ? hybridCopy().connectionRestored(message.nickname || 'gracz') : hybridCopy().connectionLost(message.nickname || 'gracz');\n      showEventToast(text, message.connected ? 'success' : 'danger');\n      return;\n    }",
  `    if (message.type === 'game.player.connection' && message.roomId === mp.room) {
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
      if (message.connected && mp.role === 'host' && mp.inGame) window.setTimeout(broadcastState, 0);
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
      if (mp.role === 'host' && mp.inGame) {
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
      if (mp.role === 'host' && mp.socket?.readyState === WebSocket.OPEN) socketSend({ type: 'game.state.get', roomId: mp.room });
      return;
    }`,
  'presence takeover events',
);

replaceOnce(
  "    mp.quickPlay = false;\n    mp.botSeats = [];\n    mp.fillBot = false;",
  "    mp.quickPlay = false;\n    mp.botSeats = [];\n    mp.fillBot = false;\n    mp.graceBySeat = {};\n    if (mp.graceTicker) window.clearInterval(mp.graceTicker);\n    mp.graceTicker = null;",
  'clear grace state',
);

replaceOnce(
  "    if (el('network-pill-text')) el('network-pill-text').textContent = mp.room ? `SERVER · ${mp.room}` : 'SERVER';",
  "    if (el('network-pill-text')) {\n      const countdown = graceCountdownText();\n      el('network-pill-text').textContent = mp.room ? `SERVER · ${mp.room}${countdown ? ` · ${countdown}` : ''}` : 'SERVER';\n    }",
  'network pill countdown',
);

const indexPath = 'index.html';
let index = fs.readFileSync(indexPath, 'utf8');
const exportBefore = '    executePlayerAction, hideMainMenu,\n';
const exportAfter = '    executePlayerAction, hideMainMenu, resumeAutomation,\n';
if (!index.includes(exportAfter)) {
  if (!index.includes(exportBefore)) throw new Error('Missing migration marker: resumeAutomation export');
  index = index.replace(exportBefore, exportAfter);
  fs.writeFileSync(indexPath, index);
  changed = true;
}

if (changed) fs.writeFileSync(path, src);
console.log(changed ? 'Reconnect/bot takeover migration applied.' : 'Reconnect/bot takeover migration already applied.');
