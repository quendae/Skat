import fs from 'node:fs';

function patch(path, edits) {
  let src = fs.readFileSync(path, 'utf8');
  let changed = false;
  for (const edit of edits) {
    const { before, after, label } = edit;
    if (src.includes(after)) continue;
    if (!src.includes(before)) throw new Error(`Missing marker ${label} in ${path}`);
    src = src.replace(before, after);
    changed = true;
  }
  if (changed) fs.writeFileSync(path, src);
  return changed;
}

let changed = false;

changed = patch('index.html', [
  {
    before: '<script src="./multiplayer-server.js"></script>',
    after: '<script src="./multiplayer-server.js?v=20260906-b2p3"></script>',
    label: 'multiplayer cache buster',
  },
]) || changed;

changed = patch('multiplayer-server.js', [
  {
    before: "  const GAME_ID = 'skat';\n  const WS_URL = 'wss://api.qqnd.fyi/api/v1/ws';",
    after: "  const GAME_ID = 'skat';\n  const CLIENT_BUILD = '20260906-b2p3';\n  const WS_URL = 'wss://api.qqnd.fyi/api/v1/ws';",
    label: 'client build id',
  },
  {
    before: `  function seatForSession(sessionId) {\n    return mp.roomObj?.players?.findIndex((player) => player.id === sessionId) ?? -1;\n  }\n\n  function syncRoom(room) {`,
    after: `  function seatForSession(sessionId) {\n    return mp.roomObj?.players?.findIndex((player) => player.id === sessionId) ?? -1;\n  }\n\n  function localSeat(serverSeat) {\n    if (!Number.isInteger(serverSeat)) return serverSeat;\n    const viewer = Number.isInteger(mp.seat) && mp.seat >= 0 ? mp.seat : 0;\n    return ((serverSeat - viewer) % 3 + 3) % 3;\n  }\n\n  function localBotSeats(serverSeats) {\n    if (!Array.isArray(serverSeats)) return [];\n    return [...new Set(serverSeats.filter(Number.isInteger).map(localSeat))].sort((a, b) => a - b);\n  }\n\n  function applyBotLabels(render = false) {\n    const state = Skat.game?.state;\n    if (!state || !Array.isArray(state.playerNames)) return;\n    const botWord = String(hybridCopy().botName || 'Bot');\n    state.playerNames = state.playerNames.map((name, seat) => {\n      const base = String(name || '').replace(/\\s*·\\s*BOT$/iu, '');\n      if (!mp.botSeats.includes(seat) || base.toLocaleLowerCase() === botWord.toLocaleLowerCase()) return base;\n      return base + ' · BOT';\n    });\n    if (render) Skat.ui?.render?.(state);\n  }\n\n  function applyPresenceSnapshot(entries) {\n    if (!Array.isArray(entries)) return;\n    const next = {};\n    for (const entry of entries) {\n      if (!entry || !Number.isInteger(entry.seat) || entry.sessionId === mp.session?.id) continue;\n      const seat = localSeat(entry.seat);\n      const previous = mp.graceBySeat?.[seat];\n      if (!entry.connected && entry.botActive) {\n        next[seat] = { phase: 'bot', deadline: 0, nickname: entry.nickname || previous?.nickname || 'Player', reason: previous?.reason || 'disconnect' };\n      } else if (!entry.connected && Number.isFinite(entry.graceDeadline)) {\n        next[seat] = { phase: 'waiting', deadline: entry.graceDeadline, nickname: entry.nickname || previous?.nickname || 'Player', reason: previous?.reason || 'disconnect' };\n      }\n    }\n    mp.graceBySeat = next;\n    refreshGraceTicker();\n  }\n\n  function syncRoom(room) {`,
    label: 'seat projection helpers',
  },
  {
    before: `    if (room.status === 'in_game' && room.players.length < 3 && mp.botSeats.length === 0) {`,
    after: `    if (room.status === 'in_game') mp.authoritative = true;\n    if (room.status === 'in_game' && room.players.length < 3 && mp.botSeats.length === 0) {`,
    label: 'authoritative room mode',
  },
  {
    before: `    if (mp.role === 'host') {\n      if (mp.inGame) broadcastState();\n      else broadcastLobby();`,
    after: `    if (mp.role === 'host') {\n      if (!mp.inGame) broadcastLobby();`,
    label: 'remove in-game host state broadcast',
  },
  {
    before: `    if (message.type === 'game.started') {\n      mp.botSeats = Array.isArray(message.botSeats) ? message.botSeats.filter(Number.isInteger) : [];\n      mp.fillBot = mp.botSeats.length > 0;\n      mp.authoritative = !!message.authoritative;`,
    after: `    if (message.type === 'game.started') {\n      if (Number.isInteger(message.seat)) mp.seat = message.seat;\n      mp.botSeats = localBotSeats(message.botSeats);\n      mp.fillBot = mp.botSeats.length > 0;\n      mp.authoritative = true;\n      applyPresenceSnapshot(message.presence);`,
    label: 'authoritative game started',
  },
  {
    before: `    if (message.type === 'game.state') {\n      if (message.authoritative != null) mp.authoritative = !!message.authoritative;\n      if (Array.isArray(message.botSeats)) {\n        mp.botSeats = message.botSeats.filter(Number.isInteger);\n        mp.fillBot = mp.botSeats.length > 0;\n      }`,
    after: `    if (message.type === 'game.state') {\n      if (Number.isInteger(message.viewerSeat)) mp.seat = message.viewerSeat;\n      mp.authoritative = true;\n      if (Array.isArray(message.botSeats)) {\n        mp.botSeats = localBotSeats(message.botSeats);\n        mp.fillBot = mp.botSeats.length > 0;\n      }\n      applyPresenceSnapshot(message.presence);`,
    label: 'authoritative state metadata',
  },
  {
    before: `    if (message.type === 'game.player.connection' && message.roomId === mp.room) {\n      if (Array.isArray(message.botSeats)) {\n        mp.botSeats = message.botSeats.filter(Number.isInteger);\n        mp.fillBot = mp.botSeats.length > 0;\n      }`,
    after: `    if (message.type === 'game.presence' && message.roomId === mp.room) {\n      mp.authoritative = true;\n      if (Array.isArray(message.botSeats)) {\n        mp.botSeats = localBotSeats(message.botSeats);\n        mp.fillBot = mp.botSeats.length > 0;\n      }\n      applyPresenceSnapshot(message.presence);\n      applyBotLabels(true);\n      return;\n    }\n    if (message.type === 'game.player.connection' && message.roomId === mp.room) {\n      if (Array.isArray(message.botSeats)) {\n        mp.botSeats = localBotSeats(message.botSeats);\n        mp.fillBot = mp.botSeats.length > 0;\n      }`,
    label: 'presence snapshot handler',
  },
  {
    before: `      if (Number.isInteger(message.seat)) {\n        if (message.connected) delete mp.graceBySeat[message.seat];\n        else if (Number.isFinite(message.graceDeadline)) mp.graceBySeat[message.seat] = { phase: 'waiting', deadline: message.graceDeadline, nickname: message.nickname || 'Player', reason: message.reason || 'disconnect' };\n        refreshGraceTicker();\n      }`,
    after: `      if (Number.isInteger(message.seat)) {\n        const seat = localSeat(message.seat);\n        if (message.connected) delete mp.graceBySeat[seat];\n        else if (Number.isFinite(message.graceDeadline)) mp.graceBySeat[seat] = { phase: 'waiting', deadline: message.graceDeadline, nickname: message.nickname || 'Player', reason: message.reason || 'disconnect' };\n        refreshGraceTicker();\n        applyBotLabels(true);\n      }`,
    label: 'connection seat projection',
  },
  {
    before: `      if (message.connected && !mp.authoritative && mp.role === 'host' && mp.inGame) window.setTimeout(broadcastState, 0);\n      return;`,
    after: `      return;`,
    label: 'remove reconnect legacy broadcast',
  },
  {
    before: `    if (message.type === 'game.player.bot_takeover' && message.roomId === mp.room) {\n      if (Array.isArray(message.botSeats)) {\n        mp.botSeats = message.botSeats.filter(Number.isInteger);\n        mp.fillBot = mp.botSeats.length > 0;\n      }`,
    after: `    if (message.type === 'game.player.bot_takeover' && message.roomId === mp.room) {\n      mp.authoritative = true;\n      if (Array.isArray(message.botSeats)) {\n        mp.botSeats = localBotSeats(message.botSeats);\n        mp.fillBot = mp.botSeats.length > 0;\n      }`,
    label: 'takeover bot seat projection',
  },
  {
    before: `      if (Number.isInteger(message.seat)) mp.graceBySeat[message.seat] = { phase: 'bot', deadline: 0, nickname: message.nickname || 'Player' };\n      refreshGraceTicker();\n      if (!mp.authoritative && mp.role === 'host' && mp.inGame) {\n        window.setTimeout(() => {\n          Skat.game?.resumeAutomation?.();\n          broadcastState();\n        }, 0);\n      }\n      return;`,
    after: `      if (Number.isInteger(message.seat)) mp.graceBySeat[localSeat(message.seat)] = { phase: 'bot', deadline: 0, nickname: message.nickname || 'Player' };\n      refreshGraceTicker();\n      applyBotLabels(true);\n      return;`,
    label: 'takeover persistent state',
  },
  {
    before: `  function broadcastState() {\n    if (mp.authoritative) return;\n    if (mp.role !== 'host' || !mp.inGame || !mp.roomObj || mp.socket?.readyState !== WebSocket.OPEN) return;\n    const state = Skat.game?.state;\n    if (!state) return;\n    mp.stateSeq += 1;\n    socketSend({ type: 'game.state.commit', roomId: mp.room, revision: mp.stateSeq, state: cloneGameState(state) });\n    mp.roomObj.players.forEach((player, seat) => {\n      if (player.id === mp.session?.id || seat < 1 || seat > 2 || !player.connected) return;\n      socketSend({ type: 'game.state.publish', roomId: mp.room, revision: mp.stateSeq, toSessionId: player.id, state: stateForSeat(state, seat) });\n    });\n  }`,
    after: `  function broadcastState() {\n    // Skat B2 is always server-authoritative. Browser state must never be committed upstream.\n    return;\n  }`,
    label: 'disable legacy browser authority',
  },
  {
    before: `    Object.assign(state, snapshot, {\n      selectedDiscard: selected,`,
    after: `    Object.assign(state, snapshot, {\n      selectedDiscard: selected,`,
    label: 'remote state anchor',
  },
  {
    before: `    state.settings = { ...localSettings, ...(snapshot.settings || {}), language: languageCode, soundEffects, animations };\n    Skat.game?.hideMainMenu?.();`,
    after: `    state.settings = { ...localSettings, ...(snapshot.settings || {}), language: languageCode, soundEffects, animations };\n    applyBotLabels(false);\n    Skat.game?.hideMainMenu?.();`,
    label: 'remote bot labels',
  },
  {
    before: `      mp.authoritative = !!started.authoritative;`,
    after: `      mp.authoritative = true;`,
    label: 'start authoritative invariant',
  },
  {
    before: `    if (!mp.authoritative && mp.role === 'host' && mp.inGame && state.multiplayer) broadcastState();\n  }`,
    after: `  }`,
    label: 'remove after render legacy broadcast',
  },
  {
    before: `    refreshRooms,\n  };`,
    after: `    refreshRooms,\n    clientBuild: CLIENT_BUILD,\n  };`,
    label: 'expose client build',
  },
]) || changed;

changed = patch('tests/multiplayer_server_smoke.mjs', [
  {
    before: `  ['<script src="./multiplayer-server.js"></script>', 'shared-server client script'],`,
    after: `  ['multiplayer-server.js?v=20260906-b2p3', 'versioned shared-server client script'],`,
    label: 'cachebuster smoke marker',
  },
  {
    before: `          revision: 0,\n        });`,
    after: `          revision: 1,\n          authoritative: true,\n          presence: [],\n        });`,
    label: 'authoritative fake start',
  },
  {
    before: `      if (message.type === 'game.state.commit') {\n        emit({ type: 'game.state.committed', roomId: message.roomId, revision: message.revision });\n      }`,
    after: `      if (message.type === 'game.state.get') {\n        emit({ type: 'game.state.empty', roomId: message.roomId, authoritative: true, viewerSeat: 0, botSeats: message.roomId === 'BOT-ROOM' ? [2] : [], presence: [] });\n      }`,
    label: 'authoritative fake state get',
  },
  {
    before: `await page.waitForFunction(() => window.__wsFrames.some((frame) => frame.type === 'game.state.commit'));\nawait page.waitForFunction(() => window.__wsFrames.filter((frame) => frame.type === 'game.state.publish').length >= 2);`,
    after: `await page.waitForFunction(() => window.__wsFrames.some((frame) => frame.type === 'game.state.get'));\nawait page.waitForTimeout(100);\nconst legacyFrames = await page.evaluate(() => window.__wsFrames.filter((frame) => frame.type === 'game.state.commit' || frame.type === 'game.state.publish'));\nif (legacyFrames.length) throw new Error('Authoritative Skat client sent legacy state frames: ' + JSON.stringify(legacyFrames));`,
    label: 'authoritative outbound assertion',
  },
  {
    before: `for (const required of ['session.create', 'queue.join', 'room.send', 'game.start', 'game.state.commit', 'game.state.publish', 'game.action']) {`,
    after: `for (const required of ['session.create', 'queue.join', 'room.send', 'game.start', 'game.state.get', 'game.action']) {`,
    label: 'authoritative required frames',
  },
  {
    before: `const botNotice = await page.locator('#mp-presence-notice').textContent();\nawait page.evaluate(() => {`,
    after: `const botNotice = await page.locator('#mp-presence-notice').textContent();\nawait page.waitForFunction(() => /Alice\\s*·\\s*BOT/i.test((window.Skat.game.state.playerNames || [])[1] || ''));\nawait page.evaluate(() => {`,
    label: 'bot label assertion',
  },
  {
    before: `const restoredNotice = await page.locator('#mp-presence-notice').textContent();\n\n// Intentional leave`,
    after: `const restoredNotice = await page.locator('#mp-presence-notice').textContent();\nawait page.waitForFunction(() => !/BOT/i.test((window.Skat.game.state.playerNames || [])[1] || ''));\n\n// Presence snapshot alone must also reconstruct a persistent bot takeover state.\nawait page.evaluate(() => {\n  const { OTHER_1, SESSION_ID } = window.__smokeIds;\n  window.__emitServer({\n    type: 'game.presence', roomId: 'BOT-ROOM', authoritative: true, hostSessionId: SESSION_ID, botSeats: [1, 2],\n    presence: [\n      { sessionId: SESSION_ID, seat: 0, nickname: 'Tester', connected: true, graceDeadline: null, botActive: false },\n      { sessionId: OTHER_1, seat: 1, nickname: 'Alice', connected: false, graceDeadline: null, botActive: true },\n    ],\n  });\n});\nawait page.waitForFunction(() => /Alice/i.test(document.getElementById('mp-presence-notice')?.textContent || '') && /bot/i.test(document.getElementById('mp-presence-notice')?.textContent || ''));\n\n// Intentional leave`,
    label: 'presence snapshot smoke',
  },
]) || changed;

changed = patch('.github/workflows/multiplayer-bot-seat.yml', [
  {
    before: `          grep -q 'authoritative: false' multiplayer-server.js\n          grep -q 'if (mp.authoritative) return' multiplayer-server.js\n          grep -q "socketSend({ type: 'game.state.get', roomId: mp.room })" multiplayer-server.js`,
    after: `          grep -q "CLIENT_BUILD = '20260906-b2p3'" multiplayer-server.js\n          grep -q "message.type === 'game.presence'" multiplayer-server.js\n          ! grep -q "type: 'game.state.commit'" multiplayer-server.js\n          ! grep -q "type: 'game.state.publish'" multiplayer-server.js\n          grep -q "socketSend({ type: 'game.state.get', roomId: mp.room })" multiplayer-server.js`,
    label: 'authoritative workflow markers',
  },
]) || changed;

console.log(changed ? 'B2 presence client hardening applied.' : 'B2 presence client hardening already applied.');
