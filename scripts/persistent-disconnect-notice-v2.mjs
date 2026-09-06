import fs from 'node:fs';

const clientPath = 'multiplayer-server.js';
let client = fs.readFileSync(clientPath, 'utf8');
let changed = false;

function replaceClient(before, after, label) {
  if (client.includes(after)) return;
  if (!client.includes(before)) throw new Error(`Missing client marker: ${label}`);
  client = client.replace(before, after);
  changed = true;
}

replaceClient(
  "  function graceCopy(kind, name, seconds) {",
  "  function graceCopy(kind, name, seconds, reason = 'disconnect') {",
  'graceCopy signature',
);

replaceClient(
`    if (kind === 'lost') {
      if (lang === 'pl') return 'Utracono połączenie z graczem ' + n + '. Bot przejmie jego miejsce za ' + seconds + ' s.';
      if (lang === 'de') return 'Verbindung zu ' + n + ' verloren. Ein Bot übernimmt in ' + seconds + ' s.';
      if (lang === 'es') return 'Se perdió la conexión con ' + n + '. Un bot ocupará su lugar en ' + seconds + ' s.';
      if (lang === 'fr') return 'Connexion avec ' + n + ' perdue. Un bot prendra sa place dans ' + seconds + ' s.';
      return 'Connection to ' + n + ' was lost. A bot will take the seat in ' + seconds + ' s.';
    }`,
`    if (kind === 'lost') {
      if (reason === 'leave') {
        if (lang === 'pl') return 'Gracz ' + n + ' opuścił grę. Czekamy ' + seconds + ' s. na jego powrót, potem miejsce przejmie bot.';
        if (lang === 'de') return n + ' hat das Spiel verlassen. Wir warten ' + seconds + ' s.; danach übernimmt ein Bot.';
        if (lang === 'es') return n + ' salió de la partida. Esperamos ' + seconds + ' s.; después ocupará su lugar un bot.';
        if (lang === 'fr') return n + ' a quitté la partie. Nous attendons ' + seconds + ' s.; ensuite un bot prendra sa place.';
        return n + ' left the game. Waiting ' + seconds + ' s. for a return; then a bot takes the seat.';
      }
      if (lang === 'pl') return 'Utracono połączenie z graczem ' + n + '. Bot przejmie jego miejsce za ' + seconds + ' s.';
      if (lang === 'de') return 'Verbindung zu ' + n + ' verloren. Ein Bot übernimmt in ' + seconds + ' s.';
      if (lang === 'es') return 'Se perdió la conexión con ' + n + '. Un bot ocupará su lugar en ' + seconds + ' s.';
      if (lang === 'fr') return 'Connexion avec ' + n + ' perdue. Un bot prendra sa place dans ' + seconds + ' s.';
      return 'Connection to ' + n + ' was lost. A bot will take the seat in ' + seconds + ' s.';
    }`,
  'leave-specific lost copy',
);

replaceClient(
  "      text = graceCopy('lost', entry.nickname || 'Player', seconds);",
  "      text = graceCopy('lost', entry.nickname || 'Player', seconds, entry.reason || 'disconnect');",
  'render reason-aware notice',
);

replaceClient(
  "        else if (Number.isFinite(message.graceDeadline)) mp.graceBySeat[message.seat] = { phase: 'waiting', deadline: message.graceDeadline, nickname: message.nickname || 'Player' };",
  "        else if (Number.isFinite(message.graceDeadline)) mp.graceBySeat[message.seat] = { phase: 'waiting', deadline: message.graceDeadline, nickname: message.nickname || 'Player', reason: message.reason || 'disconnect' };",
  'store leave/disconnect reason',
);

if (changed) fs.writeFileSync(clientPath, client);

const testPath = 'tests/multiplayer_server_smoke.mjs';
let test = fs.readFileSync(testPath, 'utf8');
const oldBlock = `// Presence events must be visible during an active game without ending it on a transient disconnect.
await page.evaluate(() => {
  const { OTHER_1 } = window.__smokeIds;
  window.__emitServer({ type: 'game.player.connection', roomId: 'BOT-ROOM', sessionId: OTHER_1, seat: 1, nickname: 'Alice', connected: false });
});
await page.waitForFunction(() => /Alice/i.test(document.getElementById('mp-event-toast')?.textContent || '') && /połączenie|connection/i.test(document.getElementById('mp-event-toast')?.textContent || ''));
const lostToast = await page.locator('#mp-event-toast').textContent();

await page.evaluate(() => {
  const { OTHER_1 } = window.__smokeIds;
  window.__emitServer({ type: 'game.player.connection', roomId: 'BOT-ROOM', sessionId: OTHER_1, seat: 1, nickname: 'Alice', connected: true });
});
await page.waitForFunction(() => /Alice/i.test(document.getElementById('mp-event-toast')?.textContent || '') && /wznowione|reconnected/i.test(document.getElementById('mp-event-toast')?.textContent || ''));
const restoredToast = await page.locator('#mp-event-toast').textContent();

await page.evaluate(() => {
  const { OTHER_1 } = window.__smokeIds;
  window.__emitServer({ type: 'game.player.left', roomId: 'BOT-ROOM', sessionId: OTHER_1, seat: 1, nickname: 'Alice' });
});
await page.waitForFunction(() => /Alice/i.test(document.getElementById('mp-event-toast')?.textContent || '') && /opuścił|left/i.test(document.getElementById('mp-event-toast')?.textContent || ''));
const leftToast = await page.locator('#mp-event-toast').textContent();
`;
const newBlock = `// Presence events use one centered persistent notice: countdown -> bot takeover -> reconnect.
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
if (!window) {}

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
`;

if (!test.includes(newBlock)) {
  if (!test.includes(oldBlock)) throw new Error('Missing smoke-test presence block');
  test = test.replace(oldBlock, newBlock);
  test = test.replace(
    "console.log({ quickPlayResult, hybridResult, lostToast, restoredToast, leftToast });",
    "console.log({ quickPlayResult, hybridResult, lostNotice, botNotice, restoredNotice, leftNotice });",
  );
  // Remove a harmless placeholder that only exists to keep the replacement block visually separated.
  test = test.replace("if (!window) {}\n\n", "");
  fs.writeFileSync(testPath, test);
  changed = true;
}

console.log(changed ? 'Persistent disconnect notice v2 migration applied.' : 'Persistent disconnect notice v2 migration already applied.');
