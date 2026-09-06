import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';

const html = fs.readFileSync('index.html', 'utf8');
const client = fs.readFileSync('multiplayer-server.js', 'utf8');
for (const [needle, label] of [
  ['<script src="./multiplayer-server.js"></script>', 'shared-server client script'],
  ['meta name="skat-api-url" content="https://api.qqnd.fyi"', 'QQND API metadata'],
]) if (!html.includes(needle)) throw new Error(`Missing ${label}`);
for (const [needle, label] of [
  ['wss://api.qqnd.fyi/api/v1/ws', 'production WebSocket endpoint'],
  ["type: 'session.resume'", 'session resume'],
  ["type: 'room.create'", 'room creation'],
  ["type: 'room.join'", 'room join'],
  ["type: 'rooms.list'", 'room browser'],
  ["type: 'queue.join'", 'Quick Play'],
  ["type: 'room.send'", 'authenticated lobby relay'],
  ["type: 'game.start'", 'server-approved game start'],
  ["type: 'game.action'", 'server action routing'],
  ["type: 'game.state.commit'", 'canonical state commit'],
  ["type: 'game.state.publish'", 'seat-private state publication'],
  ["message.type === 'game.player.connection'", 'connection notifications'],
  ["message.type === 'game.player.left'", 'leave notifications'],
  ["'mp-toggle-bot'", 'hybrid bot toggle'],
  ['botCount', 'hybrid bot game start'],
  ['isBotSeat: (seat) => mp.botSeats.includes(seat)', 'bot seat control hook'],
  ['stateForSeat', 'seat-private state projection'],
  ['cloneGameState', 'serializable canonical state'],
]) if (!client.includes(needle)) throw new Error(`Missing ${label}`);
if (/RTCPeerConnection|stun\.l\.google\.com|\/api\/rooms\//.test(client)) throw new Error('Legacy WebRTC/signaling code is still present in multiplayer-server.js');

const root = process.cwd();
const server = http.createServer((req, res) => {
  const requested = new URL(req.url, 'http://127.0.0.1').pathname;
  const file = requested === '/' ? 'index.html' : requested.replace(/^\//, '');
  const target = path.join(root, file);
  if (!target.startsWith(root) || !fs.existsSync(target)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  res.end(fs.readFileSync(target));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const chrome = [process.env.CHROME_PATH, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium']
  .filter(Boolean).find(fs.existsSync);
if (!chrome) throw new Error('Chrome/Chromium not found');
const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.addInitScript(() => {
  const SESSION_ID = '11111111-1111-4111-8111-111111111111';
  const OTHER_1 = '22222222-2222-4222-8222-222222222222';
  const OTHER_2 = '33333333-3333-4333-8333-333333333333';
  const now = Date.now();
  const player = (id, nickname) => ({ id, nickname, connected: true, createdAt: now, lastSeenAt: now, joinedAt: now });
  const fullRoom = (status = 'ready') => ({
    id: 'TEST-ROOM', game: 'skat', name: 'Smoke Skat', visibility: 'private', source: 'quickplay', status,
    ownerSessionId: SESSION_ID, minPlayers: 3, maxPlayers: 3,
    players: [player(SESSION_ID, 'Tester'), player(OTHER_1, 'Alice'), player(OTHER_2, 'Bob')], createdAt: now, updatedAt: now,
  });
  const hybridRoom = (status = 'waiting') => ({
    id: 'BOT-ROOM', game: 'skat', name: 'Hybrid Skat', visibility: 'private', source: 'manual', status,
    ownerSessionId: SESSION_ID, minPlayers: 3, maxPlayers: 3,
    players: [player(SESSION_ID, 'Tester'), player(OTHER_1, 'Alice')], createdAt: now, updatedAt: now,
  });

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
      window.__wsFrames = window.__wsFrames || [];
      window.__fakeWs = this;
      window.__emitServer = (payload) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(payload) }), 0);
      setTimeout(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.({});
        this.onmessage?.({ data: JSON.stringify({ type: 'hello', protocol: 1, service: 'qqnd-game-server' }) });
      }, 0);
    }
    send(raw) {
      const message = JSON.parse(raw);
      window.__wsFrames.push(message);
      const emit = (payload) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(payload) }), 0);
      if (message.type === 'rooms.list') emit({ type: 'rooms.list', rooms: [{ ...fullRoom('waiting'), id: 'OPEN-ROOM', visibility: 'public', source: 'manual', players: [player(OTHER_1, 'Alice')] }] });
      if (message.type === 'session.create') emit({ type: 'session.created', session: player(SESSION_ID, message.nickname), resumeToken: 'x'.repeat(64) });
      if (message.type === 'queue.join') {
        emit({ type: 'queue.joined', game: 'skat', position: 1 });
        setTimeout(() => emit({ type: 'match.found', game: 'skat', room: fullRoom() }), 20);
      }
      if (message.type === 'queue.leave') emit({ type: 'queue.left', game: 'skat', removed: true });
      if (message.type === 'room.leave') emit({ type: 'room.left', roomId: message.roomId });
      if (message.type === 'game.start') {
        const hybrid = message.roomId === 'BOT-ROOM' && message.botCount === 1;
        emit({
          type: 'game.started',
          game: 'skat',
          room: hybrid ? hybridRoom('in_game') : fullRoom('in_game'),
          seat: 0,
          hostSessionId: SESSION_ID,
          botSeats: hybrid ? [2] : [],
          seatCount: 3,
          revision: 0,
        });
      }
      if (message.type === 'game.action') {
        emit({ type: 'game.action', roomId: message.roomId, game: 'skat', fromSessionId: SESSION_ID, seat: 0, actionSeq: 1, actionId: message.actionId, action: message.action, payload: message.payload || {} });
      }
      if (message.type === 'game.state.commit') {
        emit({ type: 'game.state.committed', roomId: message.roomId, revision: message.revision });
      }
    }
    close() {
      this.readyState = FakeWebSocket.CLOSED;
      this.onclose?.({ code: 1000, reason: '' });
    }
  }
  window.WebSocket = FakeWebSocket;
  window.__smokeIds = { SESSION_ID, OTHER_1, OTHER_2 };
  window.__hybridRoom = hybridRoom;
});

await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.Skat?.game?.state && !!window.Skat?.multiplayer);
await page.evaluate(() => window.Skat.multiplayer.handleGameAction('menu-multiplayer', window.Skat.game.state));
await page.waitForSelector('#mp-server-browser');
await page.waitForFunction(() => document.querySelectorAll('[data-mp-join-room]').length === 1);

const setup = await page.evaluate(() => ({
  eyebrow: document.getElementById('multiplayer-eyebrow')?.textContent,
  browser: !!document.getElementById('mp-server-browser'),
  publicRooms: document.querySelectorAll('[data-mp-join-room]').length,
  passwordHidden: ['mp-host-password', 'mp-guest-password'].every((id) => {
    const input = document.getElementById(id);
    const field = input?.closest('.multiplayer-field') || input?.parentElement;
    return !field || field.style.display === 'none';
  }),
}));
if (!setup.browser || setup.publicRooms !== 1 || !setup.passwordHidden || !/MULTIPLAYER|ONLINE/i.test(setup.eyebrow || '')) {
  throw new Error(`Lobby setup failed: ${JSON.stringify(setup)}`);
}

// Existing 3-human Quick Play path.
await page.fill('#mp-host-nick', 'Tester');
await page.evaluate(() => window.Skat.multiplayer.handleGameAction('mp-quick-play', window.Skat.game.state));
await page.waitForFunction(() => window.Skat.multiplayer.debug().room === 'TEST-ROOM');
await page.waitForFunction(() => window.Skat.game.state.multiplayer === true, null, { timeout: 3000 });
await page.waitForFunction(() => window.__wsFrames.some((frame) => frame.type === 'game.state.commit'));
await page.waitForFunction(() => window.__wsFrames.filter((frame) => frame.type === 'game.state.publish').length >= 2);

await page.evaluate(() => window.Skat.multiplayer.handleGameAction('auction-pass', window.Skat.game.state));
await page.waitForFunction(() => window.__wsFrames.some((frame) => frame.type === 'game.action'));

const quickPlayResult = await page.evaluate(() => ({
  room: window.Skat.multiplayer.debug().room,
  role: window.Skat.multiplayer.debug().role,
  players: window.Skat.multiplayer.debug().roomObj?.players?.length,
  multiplayer: window.Skat.game.state.multiplayer,
  pill: document.getElementById('network-pill-text')?.textContent,
  frames: window.__wsFrames.map((frame) => frame.type),
}));
if (quickPlayResult.room !== 'TEST-ROOM' || quickPlayResult.role !== 'host' || quickPlayResult.players !== 3 || !quickPlayResult.multiplayer || !String(quickPlayResult.pill).includes('SERVER')) {
  throw new Error(`Quick Play flow failed: ${JSON.stringify(quickPlayResult)}`);
}
for (const required of ['session.create', 'queue.join', 'room.send', 'game.start', 'game.state.commit', 'game.state.publish', 'game.action']) {
  if (!quickPlayResult.frames.includes(required)) throw new Error(`Missing outbound ${required}: ${JSON.stringify(quickPlayResult.frames)}`);
}

// Reset only the client-side room/game state, then exercise 2 humans + bot.
await page.evaluate(() => {
  const mp = window.Skat.multiplayer.debug();
  const room = window.__hybridRoom('waiting');
  mp.roomObj = room;
  mp.room = room.id;
  mp.hostSessionId = room.ownerSessionId;
  mp.role = 'host';
  mp.seat = 0;
  mp.names = ['Tester', 'Alice', ''];
  mp.inGame = false;
  mp.stateSeq = 0;
  mp.quickPlay = false;
  mp.botSeats = [];
  mp.fillBot = false;
  window.Skat.game.state.multiplayer = false;
  window.Skat.multiplayer.debugRenderLobby();
});
await page.waitForFunction(() => {
  const button = document.getElementById('mp-toggle-bot');
  return button && button.style.display !== 'none' && /bot/i.test(button.textContent || '');
});
await page.evaluate(() => window.Skat.multiplayer.handleGameAction('mp-toggle-bot', window.Skat.game.state));
await page.waitForFunction(() => window.Skat.multiplayer.debug().fillBot === true);
await page.waitForFunction(() => !document.getElementById('mp-start-button')?.disabled);
await page.evaluate(() => window.Skat.multiplayer.handleGameAction('mp-start-game', window.Skat.game.state));
await page.waitForFunction(() => window.Skat.multiplayer.debug().room === 'BOT-ROOM' && window.Skat.multiplayer.debug().inGame === true, null, { timeout: 3000 });
await page.waitForFunction(() => window.Skat.multiplayer.isBotSeat(2) === true);
await page.waitForFunction(() => window.__wsFrames.some((frame) => frame.type === 'game.start' && frame.roomId === 'BOT-ROOM' && frame.botCount === 1));

const hybridResult = await page.evaluate(() => ({
  botSeats: [...window.Skat.multiplayer.debug().botSeats],
  isBotSeat2: window.Skat.multiplayer.isBotSeat(2),
  names: [...(window.Skat.game.state.playerNames || [])],
  start: window.__wsFrames.findLast((frame) => frame.type === 'game.start' && frame.roomId === 'BOT-ROOM'),
}));
if (!hybridResult.isBotSeat2 || hybridResult.botSeats.length !== 1 || hybridResult.botSeats[0] !== 2 || hybridResult.start?.botCount !== 1 || hybridResult.names[2] !== 'Bot') {
  throw new Error(`Hybrid bot flow failed: ${JSON.stringify(hybridResult)}`);
}

// Presence events use one centered persistent notice: countdown -> bot takeover -> reconnect.
await page.evaluate(() => {
  const { OTHER_1 } = window.__smokeIds;
  window.__emitServer({
    type: 'game.player.connection', roomId: 'BOT-ROOM', sessionId: OTHER_1, seat: 1,
    nickname: 'Alice', connected: false, reason: 'disconnect', graceMs: 60000, graceDeadline: Date.now() + 60000,
  });
});
await page.waitForFunction(() => {
  const node = document.getElementById('mp-presence-notice');
  return node && node.style.visibility === 'visible' && /Alice/i.test(node.textContent || '') && /połączenie|connection/i.test(node.textContent || '') && /bot/i.test(node.textContent || '');
});
const lostNotice = await page.locator('#mp-presence-notice').textContent();

await page.evaluate(() => {
  const { OTHER_1, SESSION_ID } = window.__smokeIds;
  window.__emitServer({
    type: 'game.player.bot_takeover', roomId: 'BOT-ROOM', sessionId: OTHER_1, seat: 1,
    nickname: 'Alice', botSeats: [1, 2], hostSessionId: SESSION_ID, authoritative: true,
  });
});
await page.waitForFunction(() => {
  const node = document.getElementById('mp-presence-notice');
  return node && node.style.visibility === 'visible' && /Alice/i.test(node.textContent || '') && /bot/i.test(node.textContent || '') && /przejął|took|übernommen|ocupó|pris/i.test(node.textContent || '');
});
const botNotice = await page.locator('#mp-presence-notice').textContent();
await page.evaluate(() => {
  const { OTHER_1, SESSION_ID } = window.__smokeIds;
  window.__emitServer({
    type: 'game.player.connection', roomId: 'BOT-ROOM', sessionId: OTHER_1, seat: 1,
    nickname: 'Alice', connected: true, reclaimedFromBot: true, botSeats: [2], hostSessionId: SESSION_ID, authoritative: true,
  });
});
await page.waitForFunction(() => {
  const node = document.getElementById('mp-presence-notice');
  return node && /Alice/i.test(node.textContent || '') && /wrócił|returned|zurück|volvió|revenu/i.test(node.textContent || '');
});
const restoredNotice = await page.locator('#mp-presence-notice').textContent();

// Intentional leave uses the same centered countdown, but with leave-specific copy.
await page.evaluate(() => {
  const { OTHER_1 } = window.__smokeIds;
  window.__emitServer({
    type: 'game.player.connection', roomId: 'BOT-ROOM', sessionId: OTHER_1, seat: 1,
    nickname: 'Alice', connected: false, reason: 'leave', graceMs: 60000, graceDeadline: Date.now() + 60000,
  });
});
await page.waitForFunction(() => {
  const node = document.getElementById('mp-presence-notice');
  return node && node.style.visibility === 'visible' && /Alice/i.test(node.textContent || '') && /opuścił|left|verlassen|salió|quitté/i.test(node.textContent || '');
});
const leftNotice = await page.locator('#mp-presence-notice').textContent();

if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

await context.close();
await browser.close();
await new Promise((resolve) => server.close(resolve));
console.log('Shared server multiplayer smoke: PASS');
console.log({ quickPlayResult, hybridResult, lostNotice, botNotice, restoredNotice, leftNotice });
