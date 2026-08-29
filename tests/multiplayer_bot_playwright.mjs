import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const root = process.cwd();
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function assertStatic(condition, message) {
  if (!condition) throw new Error(`Static check failed: ${message}`);
}

assertStatic(html.includes('data-mp-bot-seat'), 'bot controls are present in the lobby');
assertStatic(html.includes('isBotControlled(player)'), 'game has a hybrid bot controller');
assertStatic(html.includes("candidate!==mp.botSeat"), 'WebRTC guest allocation reserves the bot seat');
assertStatic(html.includes("[1,2].every(seatReady)"), 'hybrid readiness accepts a bot seat');
assertStatic(html.includes('isBotSeat,debug:()=>mp'), 'multiplayer exposes bot-seat routing');

const executableCandidates = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const executablePath = executableCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error(`Chrome/Chromium not found. Checked: ${executableCandidates.join(', ')}`);

const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
const url = pathToFileURL(htmlPath).href;

async function createPage(viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.Skat?.game?.state && !!window.Skat?.multiplayer);
  return { context, page, errors };
}

async function configureHybrid(page, botSeat, difficulty, { start = true } = {}) {
  const result = await page.evaluate(({ botSeat, difficulty, start }) => {
    const mp = window.Skat.multiplayer.debug();
    const humanSeat = botSeat === 1 ? 2 : 1;
    mp.role = 'host';
    mp.room = 'TEST-BOT';
    mp.auth = 'test';
    mp.seat = 0;
    mp.nick = 'Host';
    mp.names = ['Host', '', ''];
    mp.inGame = false;
    mp.peers.clear();
    mp.botSeat = null;
    mp.botDifficulty = 'normal';
    const channel = { readyState: 'open', send() {}, close() {} };
    mp.peers.set(humanSeat, { connected: true, pending: false, channel, pc: { close() {} } });
    mp.names[humanSeat] = 'Remote';
    const ok = window.Skat.multiplayer.debugSetBotSeat(botSeat, difficulty);
    window.Skat.multiplayer.debugRenderLobby();
    if (start) {
      const state = window.Skat.game.state;
      state.settings.animations = false;
      state.settings.soundEffects = false;
      state.settings.pauseAuction = false;
      state.settings.auctionSpeed = 'fast';
      const nativeTimeout = window.setTimeout.bind(window);
      window.setTimeout = (fn, ms = 0, ...args) => nativeTimeout(fn, Math.min(Number(ms) || 0, 2), ...args);
      window.Skat.multiplayer.debugStartGame();
    }
    return { ok, humanSeat, botName: mp.names[botSeat], inGame: mp.inGame };
  }, { botSeat, difficulty, start });
  if (!result.ok) throw new Error(`Could not configure bot seat ${botSeat} (${difficulty})`);
  if (start && !result.inGame) throw new Error(`Hybrid game did not start for bot seat ${botSeat}`);
  return result;
}

async function playHands(page, targetHands, botSeat, difficulty) {
  const humanSeat = botSeat === 1 ? 2 : 1;
  const stats = { completed: 0, botPlayLogs: 0, maxSteps: 0, phases: new Set() };
  let stepsThisHand = 0;
  let lastLogLength = 0;
  const maxTotalSteps = targetHands * 600;

  for (let totalSteps = 0; stats.completed < targetHands; totalSteps += 1) {
    if (totalSteps > maxTotalSteps) throw new Error(`Stress run stalled: ${stats.completed}/${targetHands} hands, bot seat ${botSeat}, ${difficulty}`);
    const snapshot = await page.evaluate(({ botSeat, humanSeat }) => {
      const S = window.Skat;
      const s = S.game.state;
      const B = S.bot;
      const humanSeats = new Set([0, humanSeat]);

      const capturedIds = new Set(s.captured.flat().map((card) => card?.id).filter(Boolean));
      const unsettledTrickCards = (s.trick?.cards || []).map((entry) => entry.card).filter((card) => !capturedIds.has(card?.id));
      const zones = [
        ...s.hands.flat(),
        ...s.skat,
        ...s.captured.flat(),
        ...unsettledTrickCards,
      ];
      const ids = zones.map((card) => card?.id).filter(Boolean);
      if (ids.length !== 32 || new Set(ids).size !== 32) {
        throw new Error(`Card conservation failed in phase ${s.phase}: total=${ids.length}, unique=${new Set(ids).size}`);
      }

      let acted = false;
      const act = (player, action, payload = {}) => {
        const ok = S.game.executePlayerAction(player, action, payload);
        if (!ok) throw new Error(`Rejected human-agent action ${action} for seat ${player} in ${s.phase}`);
        acted = true;
      };

      if (s.phase === 'auction' && s.auction && humanSeats.has(s.auction.actor)) {
        const p = s.auction.actor;
        const maxBid = B.estimateMaxBid(s.hands[p], 'expert');
        if (s.auction.mode === 'forehand-choice') act(p, maxBid >= 18 ? 'forehand-play' : 'forehand-pass');
        else if (s.auction.mode === 'caller') act(p, s.auction.nextBid && s.auction.nextBid <= maxBid ? 'auction-bid' : 'auction-pass');
        else act(p, s.auction.currentValue <= maxBid ? 'auction-accept' : 'auction-pass');
      } else if (s.phase === 'pickup-choice' && humanSeats.has(s.declarer)) {
        act(s.declarer, 'pickup-skat');
      } else if (s.phase === 'discard' && humanSeats.has(s.declarer)) {
        const p = s.declarer;
        const provisional = B.chooseContract(s.hands[p], s.bidValue, false, 'expert', s.settings.advancedContracts);
        const discarded = B.chooseDiscard(s.hands[p], provisional, 'expert');
        act(p, 'confirm-discard', { cardIds: discarded.map((card) => card.id) });
      } else if (s.phase === 'declare' && humanSeats.has(s.declarer)) {
        const p = s.declarer;
        const contract = B.chooseContract(s.hands[p], s.bidValue, false, 'expert', s.settings.advancedContracts);
        if (contract.type === 'grand') act(p, 'declare-grand');
        else if (contract.type === 'null') act(p, contract.ouvert ? 'declare-null-ouvert' : 'declare-null');
        else act(p, `declare-${contract.suit}`);
      } else if (s.phase === 'announce' && humanSeats.has(s.declarer)) {
        act(s.declarer, 'announce-none');
      } else if (s.phase === 'kontra' && s.kontra && humanSeats.has(s.kontra.actor)) {
        act(s.kontra.actor, s.kontra.stage === 're' ? 're-pass' : 'kontra-pass');
      } else if (s.phase === 'play' && Number.isInteger(s.currentPlayer) && humanSeats.has(s.currentPlayer)) {
        const p = s.currentPlayer;
        const card = B.choosePlay({ hand:s.hands[p], trickCards:s.trick.cards, contract:s.contract, declarer:s.declarer, player:p, difficulty:'expert', voids:s.voids });
        act(p, 'play-card', { cardId: card.id });
      }

      return {
        phase: s.phase,
        acted,
        handNo: s.handNo,
        logLength: s.log.length,
        logTail: s.log.slice(-8),
        botName: s.playerNames?.[botSeat] || '',
      };
    }, { botSeat, humanSeat });

    stats.phases.add(snapshot.phase);
    stepsThisHand += 1;
    if (snapshot.logLength > lastLogLength) {
      stats.botPlayLogs += snapshot.logTail.filter((line) => snapshot.botName && String(line).startsWith(snapshot.botName)).length;
      lastLogLength = snapshot.logLength;
    }

    if (snapshot.phase === 'hand-end') {
      stats.completed += 1;
      stats.maxSteps = Math.max(stats.maxSteps, stepsThisHand);
      stepsThisHand = 0;
      await page.evaluate(() => window.Skat.game.newHand());
    }

    if (!snapshot.acted) await page.waitForTimeout(3);
  }

  if (stats.botPlayLogs < targetHands) throw new Error(`Bot activity too low: only ${stats.botPlayLogs} logged bot actions in ${targetHands} hands`);
  for (const required of ['auction', 'play', 'hand-end']) {
    if (!stats.phases.has(required)) throw new Error(`Stress run never reached required phase: ${required}`);
  }
  return { ...stats, phases: [...stats.phases] };
}

const stressResults = [];
for (const botSeat of [1, 2]) {
  for (const difficulty of ['easy', 'normal', 'hard', 'expert']) {
    const { context, page, errors } = await createPage();
    await configureHybrid(page, botSeat, difficulty);
    const result = await playHands(page, 40, botSeat, difficulty);
    if (errors.length) throw new Error(`Browser errors during stress test (${botSeat}/${difficulty}): ${errors.join(' | ')}`);
    stressResults.push({ botSeat, difficulty, completed: result.completed, botActions: result.botPlayLogs, maxSteps: result.maxSteps, phases: result.phases });
    await context.close();
  }
}

const viewports = [
  { name:'desktop', width:1440, height:900 },
  { name:'tablet', width:1024, height:768 },
  { name:'phone-portrait', width:390, height:844 },
  { name:'phone-landscape', width:844, height:390 },
];
const layoutResults = [];
for (const viewport of viewports) {
  const { context, page, errors } = await createPage({ width:viewport.width, height:viewport.height });
  await page.evaluate(() => {
    document.getElementById('main-menu')?.classList.add('hidden');
    document.getElementById('multiplayer-modal')?.classList.remove('hidden');
    document.getElementById('multiplayer-setup')?.classList.add('hidden');
    document.getElementById('multiplayer-lobby')?.classList.remove('hidden');
  });
  await configureHybrid(page, 2, 'hard', { start:false });
  const checks = await page.evaluate(() => {
    const start = document.getElementById('mp-start-button');
    const modal = document.querySelector('.multiplayer-card');
    const botButton = document.querySelector('[data-mp-bot-seat="2"]');
    const botSelect = document.querySelector('[data-mp-bot-difficulty="2"]');
    const seat = botButton?.closest('.lobby-seat');
    const rects = [modal,botButton,botSelect,seat].filter(Boolean).map((node)=>({name:node.tagName, ...node.getBoundingClientRect().toJSON()}));
    const horizontalOverflow = rects.some((rect)=>rect.left < -1 || rect.right > innerWidth + 1);
    return {
      startEnabled: !!start && !start.disabled && !start.classList.contains('disabled'),
      botButtonVisible: !!botButton && botButton.getBoundingClientRect().width > 0 && botButton.getBoundingClientRect().height > 0,
      botSelectVisible: !!botSelect && botSelect.getBoundingClientRect().width > 0 && botSelect.getBoundingClientRect().height > 0,
      botSeatMarked: !!seat?.classList.contains('bot'),
      horizontalOverflow,
      modalScrollWidth: modal?.scrollWidth || 0,
      modalClientWidth: modal?.clientWidth || 0,
    };
  });
  if (!checks.startEnabled) throw new Error(`${viewport.name}: start button is not enabled for 1 human + 1 bot`);
  if (!checks.botButtonVisible || !checks.botSelectVisible || !checks.botSeatMarked) throw new Error(`${viewport.name}: bot controls/seat are not visible`);
  if (checks.horizontalOverflow || checks.modalScrollWidth > checks.modalClientWidth + 2) throw new Error(`${viewport.name}: multiplayer lobby has horizontal overflow`);
  if (errors.length) throw new Error(`Browser errors during ${viewport.name} layout test: ${errors.join(' | ')}`);
  layoutResults.push({ viewport:viewport.name, ...checks });
  await context.close();
}

await browser.close();

console.log('\nHybrid multiplayer stress results:');
console.table(stressResults);
console.log(`Total completed hands: ${stressResults.reduce((sum, item) => sum + item.completed, 0)}`);
console.log('\nLobby viewport results:');
console.table(layoutResults);
