import fs from 'node:fs';

const indexPath = 'index.html';
let html = fs.readFileSync(indexPath, 'utf8');
let changed = false;

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Could not find migration marker: ${label}`);
  changed = true;
  return source.replace(before, after);
}

if (!html.includes('<script src="./multiplayer-server.js"></script>')) {
  const rtcMarker = "  const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };";
  const markerIndex = html.indexOf(rtcMarker);
  if (markerIndex < 0) throw new Error('Could not find legacy WebRTC multiplayer marker');

  const scriptStart = html.lastIndexOf('<script>', markerIndex);
  const bodyEnd = html.lastIndexOf('</body>');
  const scriptEnd = html.lastIndexOf('</script>', bodyEnd);
  if (scriptStart < 0 || scriptEnd < scriptStart) throw new Error('Could not isolate legacy multiplayer script');

  html = html.slice(0, scriptStart)
    + '<script src="./multiplayer-server.js"></script>\n\n'
    + html.slice(scriptEnd + '</script>'.length);
  changed = true;
}

const normalized = html
  .replace('<meta name="skat-signaling-url" content="" />', '<meta name="skat-api-url" content="https://api.qqnd.fyi" />')
  .replace('/* === v16 experimental peer-to-peer multiplayer === */', '/* === multiplayer lobby / shared QQND server === */')
  .replace(/>P2P<\/span>/g, '>SERVER</span>');
if (normalized !== html) {
  html = normalized;
  changed = true;
}
if (changed) fs.writeFileSync(indexPath, html);

const clientPath = 'multiplayer-server.js';
let client = fs.readFileSync(clientPath, 'utf8');

const brokenInsert = "if (button) createSection.insertBefore(label, button);";
const fixedInsert = "if (button) createSection.insertBefore(label, button.closest('.multiplayer-actions') || button);";
if (client.includes(brokenInsert)) {
  client = client.replace(brokenInsert, fixedInsert);
  changed = true;
}

client = replaceRequired(
  client,
  "  function stateForSeat(state, seat) {\n    const order = [seat, (seat + 1) % 3, (seat + 2) % 3];\n    const clone = JSON.parse(JSON.stringify(state, (key, value) => value instanceof Set ? [...value] : (key === 'botTimer' || key === 'cardFlight' ? null : value)));",
  "  function cloneGameState(state) {\n    return JSON.parse(JSON.stringify(state, (key, value) => value instanceof Set ? [...value] : (key === 'botTimer' || key === 'cardFlight' ? null : value)));\n  }\n\n  function stateForSeat(state, seat) {\n    const order = [seat, (seat + 1) % 3, (seat + 2) % 3];\n    const clone = cloneGameState(state);",
  'serializable full-state helper',
);

client = replaceRequired(
  client,
  "  function broadcastState() {\n    if (mp.role !== 'host' || !mp.inGame || !mp.roomObj || mp.socket?.readyState !== WebSocket.OPEN) return;\n    const state = Skat.game?.state;\n    if (!state) return;\n    mp.stateSeq += 1;\n    mp.roomObj.players.forEach((player, seat) => {\n      if (player.id === mp.session?.id || seat < 1 || seat > 2 || !player.connected) return;\n      roomSend({ type: 'skat.state', seq: mp.stateSeq, state: stateForSeat(state, seat) }, player.id);\n    });\n  }",
  "  function broadcastState() {\n    if (mp.role !== 'host' || !mp.inGame || !mp.roomObj || mp.socket?.readyState !== WebSocket.OPEN) return;\n    const state = Skat.game?.state;\n    if (!state) return;\n    mp.stateSeq += 1;\n    socketSend({ type: 'game.state.commit', roomId: mp.room, revision: mp.stateSeq, state: cloneGameState(state) });\n    mp.roomObj.players.forEach((player, seat) => {\n      if (player.id === mp.session?.id || seat < 1 || seat > 2 || !player.connected) return;\n      socketSend({ type: 'game.state.publish', roomId: mp.room, revision: mp.stateSeq, toSessionId: player.id, state: stateForSeat(state, seat) });\n    });\n  }",
  'server snapshot publishing',
);

const oldActionRoomBranch = "    if (payload.type === 'skat.action' && mp.role === 'host' && mp.inGame) {\n      const seat = seatForSession(message.fromSessionId);\n      if (seat <= 0 || seat > 2) return;\n      Skat.game?.executePlayerAction?.(seat, payload.action, payload.payload || {});\n      return;\n    }\n";
if (client.includes(oldActionRoomBranch)) {
  client = client.replace(oldActionRoomBranch, '');
  changed = true;
}
const oldStateRoomBranch = "    if (payload.type === 'skat.state' && mp.role === 'guest') {\n      applyRemoteState(payload.state, payload.seq);\n    }";
if (client.includes(oldStateRoomBranch)) {
  client = client.replace(oldStateRoomBranch, '');
  changed = true;
}

client = replaceRequired(
  client,
  "  function applyRemoteState(snapshot, seq) {\n    if (mp.role !== 'guest' || !snapshot || !Number.isFinite(seq) || seq <= mp.stateSeq) return;",
  "  function applyRemoteState(snapshot, seq) {\n    if (!snapshot || !Number.isFinite(seq) || seq <= mp.stateSeq) return;",
  'host reconnect state restore',
);

client = replaceRequired(
  client,
  "  function sendGuestAction(action, payload = {}) {\n    if (mp.role !== 'guest' || !mp.hostSessionId || mp.socket?.readyState !== WebSocket.OPEN) return;\n    roomSend({ type: 'skat.action', action, payload, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` }, mp.hostSessionId);\n  }",
  "  function sendGameAction(action, payload = {}) {\n    if (!mp.inGame || !mp.room || mp.socket?.readyState !== WebSocket.OPEN) return;\n    socketSend({ type: 'game.action', roomId: mp.room, action, payload, actionId: `${Date.now()}-${Math.random().toString(36).slice(2)}` });\n  }",
  'server action routing',
);

if (client.includes("if (mp.role !== 'guest' || !mp.inGame || !routed) return false;")) {
  client = client.replace("if (mp.role !== 'guest' || !mp.inGame || !routed) return false;", "if (!mp.inGame || !routed) return false;");
  changed = true;
}
if (client.includes("if (mp.role !== 'guest' || !mp.inGame) return false;")) {
  client = client.replace("if (mp.role !== 'guest' || !mp.inGame) return false;", "if (!mp.inGame) return false;");
  changed = true;
}
if (client.includes('sendGuestAction(')) {
  client = client.replaceAll('sendGuestAction(', 'sendGameAction(');
  changed = true;
}

client = replaceRequired(
  client,
  "  function startGame() {\n    const ready = mp.role === 'host' && mp.roomObj?.players?.length === 3 && mp.roomObj.players.every((player) => player.connected);\n    if (!ready || mp.inGame) return;\n    mp.inGame = true;\n    mp.quickPlay = false;\n    const state = Skat.game?.state;\n    if (!state) return;\n    state.multiplayer = true;\n    state.playerNames = [...mp.names];\n    state.tutorialMode = false;\n    Skat.game.hideMainMenu();\n    el('multiplayer-modal')?.classList.add('hidden');\n    Skat.game.resetMatch();\n    updateNetworkPill(true);\n    window.setTimeout(broadcastState, 0);\n  }",
  "  async function startGame() {\n    const ready = mp.role === 'host' && mp.roomObj?.players?.length === 3 && mp.roomObj.players.every((player) => player.connected);\n    if (!ready || mp.inGame) return;\n    try {\n      await request({ type: 'game.start', roomId: mp.room }, 'game.started', (message) => message.room?.id === mp.room);\n      mp.inGame = true;\n      mp.quickPlay = false;\n      const state = Skat.game?.state;\n      if (!state) return;\n      state.multiplayer = true;\n      state.playerNames = [...mp.names];\n      state.tutorialMode = false;\n      Skat.game.hideMainMenu();\n      el('multiplayer-modal')?.classList.add('hidden');\n      Skat.game.resetMatch();\n      updateNetworkPill(true);\n      window.setTimeout(broadcastState, 0);\n    } catch (error) {\n      setStatus('mp-lobby-status', friendlyError(error), true);\n    }\n  }",
  'server-approved game start',
);

client = replaceRequired(
  client,
  "    if (message.type === 'session.resumed') {\n      mp.session = message.session;\n      const skatRoom = (message.rooms || []).find((room) => room.game === GAME_ID);\n      if (skatRoom) syncRoom(skatRoom);\n      return;\n    }",
  "    if (message.type === 'session.resumed') {\n      mp.session = message.session;\n      const skatRoom = (message.rooms || []).find((room) => room.game === GAME_ID);\n      if (skatRoom) {\n        syncRoom(skatRoom);\n        if (skatRoom.status === 'in_game') socketSend({ type: 'game.state.get', roomId: skatRoom.id });\n      }\n      return;\n    }",
  'reconnect snapshot request',
);

client = replaceRequired(
  client,
  "    if (message.type === 'room.message') {\n      handleRoomMessage(message);\n      return;\n    }\n    if (message.type === 'error') {",
  "    if (message.type === 'room.message') {\n      handleRoomMessage(message);\n      return;\n    }\n    if (message.type === 'game.started') {\n      if (message.room?.game === GAME_ID) syncRoom(message.room);\n      return;\n    }\n    if (message.type === 'game.action') {\n      if (mp.role === 'host' && mp.inGame && message.roomId === mp.room && Number.isInteger(message.seat)) {\n        Skat.game?.executePlayerAction?.(message.seat, message.action, message.payload || {});\n      }\n      return;\n    }\n    if (message.type === 'game.state') {\n      if (message.roomId === mp.room) applyRemoteState(message.state, message.revision);\n      return;\n    }\n    if (message.type === 'game.ended') {\n      if (message.roomId === mp.room) networkInterrupted('Gra została zakończona, ponieważ gracz opuścił stół.');\n      return;\n    }\n    if (message.type === 'error') {",
  'game runtime server events',
);

if (changed) fs.writeFileSync(clientPath, client);
console.log(changed ? 'Multiplayer migration/update applied.' : 'Multiplayer migration already up to date.');
