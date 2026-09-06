import fs from 'node:fs';

const path = 'multiplayer-server.js';
let src = fs.readFileSync(path, 'utf8');
let changed = false;

function replaceOnce(before, after, label) {
  if (src.includes(after)) return;
  if (!src.includes(before)) throw new Error(`Missing marker: ${label}`);
  src = src.replace(before, after);
  changed = true;
}

replaceOnce(
  "    graceBySeat: {},\n    graceTicker: null,\n",
  "    graceBySeat: {},\n    graceTicker: null,\n    presenceTransientTimer: null,\n",
  'presence timer state',
);

replaceOnce(
  "      if (lang === 'pl') return 'Minęło 60 sekund. Bot przejął miejsce gracza ' + n + ' i gra jego obecną ręką.';\n      if (lang === 'de') return '60 Sekunden sind abgelaufen. Ein Bot übernimmt den Platz von ' + n + ' mit der aktuellen Hand.';\n      if (lang === 'es') return 'Han pasado 60 segundos. Un bot ocupa el lugar de ' + n + ' con su mano actual.';\n      if (lang === 'fr') return '60 secondes se sont écoulées. Un bot prend la place de ' + n + ' avec sa main actuelle.';\n      return '60 seconds elapsed. A bot took ' + n + \"'s seat with the current hand.\";",
  "      if (lang === 'pl') return 'Bot przejął miejsce gracza ' + n + ' i gra jego obecną ręką. Jeśli gracz wróci, przejmie zastany stan.';\n      if (lang === 'de') return 'Ein Bot hat den Platz von ' + n + ' mit der aktuellen Hand übernommen. Bei Rückkehr übernimmt der Spieler den aktuellen Stand.';\n      if (lang === 'es') return 'Un bot ocupó el lugar de ' + n + ' con su mano actual. Si vuelve, recuperará el estado actual.';\n      if (lang === 'fr') return 'Un bot a pris la place de ' + n + ' avec sa main actuelle. À son retour, le joueur reprendra l’état actuel.';\n      return 'A bot took ' + n + \"'s seat with the current hand. If the player returns, they reclaim the current state.\";",
  'bot takeover copy',
);

replaceOnce(
`  function graceCountdownText() {
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
  }`,
`  function ensurePresenceNotice() {
    let node = el('mp-presence-notice');
    if (node) return node;
    node = document.createElement('div');
    node.id = 'mp-presence-notice';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    Object.assign(node.style, {
      position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: '100000',
      width: 'min(560px, calc(100vw - 32px))', padding: '18px 22px', borderRadius: '16px',
      border: '1px solid rgba(216,179,95,.58)', background: 'rgba(7,16,12,.96)', color: '#edf5ef',
      boxShadow: '0 24px 72px rgba(0,0,0,.56)', fontSize: '15px', lineHeight: '1.45', fontWeight: '760',
      textAlign: 'center', opacity: '0', visibility: 'hidden', pointerEvents: 'none',
      transition: 'opacity .16s ease, transform .16s ease'
    });
    document.body.appendChild(node);
    return node;
  }

  function persistentPresenceEntry() {
    const entries = Object.values(mp.graceBySeat || {});
    const waiting = entries.filter((entry) => entry?.phase === 'waiting' && Number.isFinite(entry.deadline));
    if (waiting.length) return waiting.sort((a, b) => a.deadline - b.deadline)[0];
    return entries.find((entry) => entry?.phase === 'bot') || null;
  }

  function renderPresenceNotice() {
    const node = ensurePresenceNotice();
    const entry = persistentPresenceEntry();
    if (!entry) {
      if (mp.presenceTransientTimer) return;
      node.style.opacity = '0';
      node.style.visibility = 'hidden';
      node.style.transform = 'translate(-50%, -46%)';
      return;
    }
    let text = '';
    if (entry.phase === 'waiting') {
      const seconds = Math.max(0, Math.ceil((entry.deadline - Date.now()) / 1000));
      text = graceCopy('lost', entry.nickname || 'Player', seconds);
      node.style.borderColor = 'rgba(255,143,143,.68)';
    } else {
      text = graceCopy('bot', entry.nickname || 'Player', 0);
      node.style.borderColor = 'rgba(216,179,95,.62)';
    }
    node.textContent = text;
    node.style.visibility = 'visible';
    node.style.opacity = '1';
    node.style.transform = 'translate(-50%, -50%)';
  }

  function showPresenceTransient(message, tone = 'success') {
    const node = ensurePresenceNotice();
    if (mp.presenceTransientTimer) window.clearTimeout(mp.presenceTransientTimer);
    node.textContent = message;
    node.style.borderColor = tone === 'success' ? 'rgba(130,220,160,.68)' : 'rgba(216,179,95,.62)';
    node.style.visibility = 'visible';
    node.style.opacity = '1';
    node.style.transform = 'translate(-50%, -50%)';
    mp.presenceTransientTimer = window.setTimeout(() => {
      mp.presenceTransientTimer = null;
      renderPresenceNotice();
    }, 3200);
  }

  function graceCountdownText() {
    const entries = Object.values(mp.graceBySeat || {}).filter((entry) => entry?.phase === 'waiting' && entry?.deadline > Date.now());
    if (!entries.length) return '';
    entries.sort((a, b) => a.deadline - b.deadline);
    const entry = entries[0];
    const seconds = Math.max(0, Math.ceil((entry.deadline - Date.now()) / 1000));
    return language() === 'pl' ? (entry.nickname + ': bot za ' + seconds + ' s') : (entry.nickname + ': bot in ' + seconds + 's');
  }

  function refreshGraceTicker() {
    if (mp.graceTicker) window.clearInterval(mp.graceTicker);
    const tick = () => {
      updateNetworkPill(mp.socket?.readyState === WebSocket.OPEN);
      renderPresenceNotice();
    };
    tick();
    const hasWaiting = Object.values(mp.graceBySeat || {}).some((entry) => entry?.phase === 'waiting');
    if (hasWaiting) mp.graceTicker = window.setInterval(tick, 250);
    else mp.graceTicker = null;
  }`,
  'persistent presence helpers',
);

replaceOnce(
  "        if (message.connected) delete mp.graceBySeat[message.seat];\n        else if (Number.isFinite(message.graceDeadline)) mp.graceBySeat[message.seat] = { deadline: message.graceDeadline, nickname: message.nickname || 'Player' };\n        refreshGraceTicker();",
  "        if (message.connected) delete mp.graceBySeat[message.seat];\n        else if (Number.isFinite(message.graceDeadline)) mp.graceBySeat[message.seat] = { phase: 'waiting', deadline: message.graceDeadline, nickname: message.nickname || 'Player' };\n        refreshGraceTicker();",
  'waiting presence state',
);

replaceOnce(
`      if (message.sessionId !== mp.session?.id) {
        const seconds = Math.max(0, Math.ceil(((message.graceDeadline || Date.now()) - Date.now()) / 1000));
        const text = message.connected
          ? graceCopy(message.reclaimedFromBot ? 'reclaimed' : 'restored', message.nickname || 'Player', seconds)
          : graceCopy('lost', message.nickname || 'Player', seconds || 60);
        showEventToast(text, message.connected ? 'success' : 'danger');
      }`,
`      if (message.sessionId !== mp.session?.id && message.connected) {
        const text = graceCopy(message.reclaimedFromBot ? 'reclaimed' : 'restored', message.nickname || 'Player', 0);
        showPresenceTransient(text, 'success');
      }`,
  'center reconnect event',
);

replaceOnce(
  "      if (Number.isInteger(message.seat)) delete mp.graceBySeat[message.seat];\n      refreshGraceTicker();\n      showEventToast(graceCopy('bot', message.nickname || 'Player', 0), 'info');",
  "      if (Number.isInteger(message.seat)) mp.graceBySeat[message.seat] = { phase: 'bot', deadline: 0, nickname: message.nickname || 'Player' };\n      refreshGraceTicker();",
  'persistent bot takeover event',
);

replaceOnce(
  "    mp.graceBySeat = {};\n    if (mp.graceTicker) window.clearInterval(mp.graceTicker);\n    mp.graceTicker = null;",
  "    mp.graceBySeat = {};\n    if (mp.graceTicker) window.clearInterval(mp.graceTicker);\n    mp.graceTicker = null;\n    if (mp.presenceTransientTimer) window.clearTimeout(mp.presenceTransientTimer);\n    mp.presenceTransientTimer = null;\n    const notice = el('mp-presence-notice');\n    if (notice) { notice.style.opacity = '0'; notice.style.visibility = 'hidden'; }",
  'clear persistent notice',
);

replaceOnce(
  "  window.addEventListener('online', () => { if (!mp.socket || mp.socket.readyState !== WebSocket.OPEN) scheduleReconnect(); });",
  "  window.addEventListener('online', () => { if (!mp.socket || mp.socket.readyState !== WebSocket.OPEN) scheduleReconnect(); });\n  window.addEventListener('pagehide', () => {\n    if (!mp.inGame || !mp.room || mp.socket?.readyState !== WebSocket.OPEN) return;\n    try { mp.socket.send(JSON.stringify({ type: 'room.leave', roomId: mp.room })); } catch (_) {}\n  });",
  'pagehide disconnect hint',
);

if (changed) fs.writeFileSync(path, src);
console.log(changed ? 'Persistent disconnect notice migration applied.' : 'Persistent disconnect notice migration already applied.');
