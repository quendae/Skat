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
  ["type: 'room.send'", 'authenticated room relay'],
  ["type: 'skat.state'", 'targeted game state'],
  ['stateForSeat', 'seat-private state projection'],
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
  const fullRoom = () => ({
    id: 'TEST-ROOM', game: 'skat', name: 'Smoke Skat', visibility: 'private', source: 'quickplay', status: 'ready',
    ownerSessionId: SESSION_ID, minPlayers: 3, maxPlayers: 3,
    players: [player(SESSION_ID, 'Tester'), player(OTHER_1, 'Alice'), player(OTHER_2, 'Bob')], createdAt: now, updatedAt: now,
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
      if (message.type === 'rooms.list') emit({ type: 'rooms.list', rooms: [{ ...fullRoom(), id: 'OPEN-ROOM', visibility: 'public', source: 'manual', status: 'waiting', players: [player(OTHER_1, 'Alice')] }] });
      if (message.type === 'session.create') emit({ type: 'session.created', session: player(SESSION_ID, message.nickname), resumeToken: 'x'.repeat(64) });
      if (message.type === 'queue.join') {
        emit({ type: 'queue.joined', game: 'skat', position: 1 });
        setTimeout(() => emit({ type: 'match.found', game: 'skat', room: fullRoom() }), 20);
      }
      if (message.type === 'queue.leave') emit({ type: 'queue.left', game: 'skat', removed: true });
      if (message.type === 'room.leave') emit({ type: 'room.left', roomId: message.roomId });
    }
    close() {
      this.readyState = FakeWebSocket.CLOSED;
      this.onclose?.({ code: 1000, reason: '' });
    }
  }
  window.WebSocket = FakeWebSocket;
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

await page.fill('#mp-host-nick', 'Tester');
await page.evaluate(() => window.Skat.multiplayer.handleGameAction('mp-quick-play', window.Skat.game.state));
await page.waitForFunction(() => window.Skat.multiplayer.debug().room === 'TEST-ROOM');
await page.waitForFunction(() => window.Skat.game.state.multiplayer === true, null, { timeout: 3000 });

const result = await page.evaluate(() => ({
  room: window.Skat.multiplayer.debug().room,
  role: window.Skat.multiplayer.debug().role,
  players: window.Skat.multiplayer.debug().roomObj?.players?.length,
  multiplayer: window.Skat.game.state.multiplayer,
  pill: document.getElementById('network-pill-text')?.textContent,
  frames: window.__wsFrames.map((frame) => frame.type),
}));
if (result.room !== 'TEST-ROOM' || result.role !== 'host' || result.players !== 3 || !result.multiplayer || !String(result.pill).includes('SERVER')) {
  throw new Error(`Quick Play flow failed: ${JSON.stringify(result)}`);
}
for (const required of ['session.create', 'queue.join', 'room.send']) {
  if (!result.frames.includes(required)) throw new Error(`Missing outbound ${required}: ${JSON.stringify(result.frames)}`);
}
if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

await context.close();
await browser.close();
await new Promise((resolve) => server.close(resolve));
console.log('Shared server multiplayer smoke: PASS');
console.log(result);
