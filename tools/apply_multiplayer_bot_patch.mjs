import fs from 'node:fs';

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');

if (html.includes('data-mp-bot-seat')) {
  console.log('Multiplayer bot-seat patch already applied.');
  process.exit(0);
}

function replaceOnce(needle, replacement, label) {
  const at = html.indexOf(needle);
  if (at < 0) throw new Error(`Patch anchor not found: ${label}`);
  if (html.indexOf(needle, at + needle.length) >= 0) throw new Error(`Patch anchor is ambiguous: ${label}`);
  html = html.slice(0, at) + replacement + html.slice(at + needle.length);
}

replaceOnce(
`.lobby-seat.connected small { color:#83c99c; }
.connection-step {`,
`.lobby-seat.connected small { color:#83c99c; }
.lobby-seat.bot { border-color:rgba(216,179,95,.48);box-shadow:inset 0 0 0 1px rgba(216,179,95,.12); }
.lobby-seat.bot small { color:#e0c674; }
.lobby-bot-tools { display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;margin-top:10px; }
.lobby-bot-tools select,.lobby-bot-button { min-height:34px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#0b1711;color:#e8efe9;padding:6px 8px;font-size:9px;font-weight:800; }
.lobby-bot-button { cursor:pointer;white-space:nowrap; }
.lobby-bot-button:hover { background:rgba(216,179,95,.12);border-color:rgba(216,179,95,.32); }
.lobby-bot-button.remove { color:#efb2aa;border-color:rgba(238,145,134,.24); }
@media (max-width:760px) { .lobby-bot-tools{grid-template-columns:1fr auto} }
.connection-step {`,
'bot lobby CSS');

replaceOnce(
`  function resumeAutomation() {
    if (menuOpen) return;
    if (state.multiplayer) return;
    if (state.phase === 'auction') maybeRunBotAuction();`,
`  function isBotControlled(player) {
    if (!Number.isInteger(player) || player < 0 || player > 2) return false;
    if (!state.multiplayer) return player !== 0;
    return !!Skat.multiplayer?.isBotSeat?.(player);
  }

  function resumeAutomation() {
    if (menuOpen) return;
    if (state.phase === 'auction') maybeRunBotAuction();`,
'bot controller helper');

replaceOnce(
`  function maybeRunBotAuction() {
    if (state.multiplayer) return;
    const a = state.auction;
    if (state.phase !== 'auction' || !a || state.auctionPaused || state.botActionRunning || a.actor === 0) return;

    schedule(() => {
      if (state.phase !== 'auction' || state.auctionPaused || !state.auction) return;`,
`  function maybeRunBotAuction() {
    const a = state.auction;
    if (state.phase !== 'auction' || !a || state.auctionPaused || state.botActionRunning || !isBotControlled(a.actor)) return;

    schedule(() => {
      if (state.phase !== 'auction' || state.auctionPaused || !state.auction || !isBotControlled(state.auction.actor)) return;`,
'auction bot routing');

replaceOnce(
`    if (player !== 0 && !state.multiplayer) schedule(botDecideDeclaration, 700);`,
`    if (isBotControlled(player)) schedule(botDecideDeclaration, 700);`,
'bot declaration scheduling');

replaceOnce(
`  function botDecideDeclaration() {
    if (state.phase !== 'pickup-choice' || state.declarer === 0) return;`,
`  function botDecideDeclaration() {
    if (state.phase !== 'pickup-choice' || !isBotControlled(state.declarer)) return;`,
'bot declaration guard');

replaceOnce(
`  function maybeRunBotKontra() {
    if (state.multiplayer) return;
    if (state.phase !== 'kontra' || !state.kontra || state.kontra.actor === 0) return;
    schedule(() => {
      if (state.phase !== 'kontra' || !state.kontra) return;`,
`  function maybeRunBotKontra() {
    if (state.phase !== 'kontra' || !state.kontra || !isBotControlled(state.kontra.actor)) return;
    schedule(() => {
      if (state.phase !== 'kontra' || !state.kontra || !isBotControlled(state.kontra.actor)) return;`,
'kontra bot routing');

replaceOnce(
`  function maybeRunBotPlay() {
    if (state.multiplayer) return;
    if (state.phase !== 'play' || state.currentPlayer === null || state.currentPlayer === 0) return;
    schedule(() => {
      if (state.phase !== 'play' || state.currentPlayer == null || state.currentPlayer === 0) return;`,
`  function maybeRunBotPlay() {
    if (state.phase !== 'play' || state.currentPlayer === null || !isBotControlled(state.currentPlayer)) return;
    schedule(() => {
      if (state.phase !== 'play' || state.currentPlayer == null || !isBotControlled(state.currentPlayer)) return;`,
'play bot routing');

replaceOnce(
`    if (key === 'auctionSpeed' && state.phase === 'auction' && state.auction && state.auction.actor !== 0 && !state.auctionPaused) {`,
`    if (key === 'auctionSpeed' && state.phase === 'auction' && state.auction && isBotControlled(state.auction.actor) && !state.auctionPaused) {`,
'bot speed reschedule');

replaceOnce(
`  const mp = {
    role:null, room:'', auth:'', nick:'', seat:null, peers:new Map(), guestPc:null, guestChannel:null,
    names:['','',''], inGame:false, seq:0, lastStateSignature:'', passwordProtected:false,
    signalSocket:null, signalClosing:false, signalGuestId:'', hostToken:'', signalToSeat:new Map()
  };`,
`  const mp = {
    role:null, room:'', auth:'', nick:'', seat:null, peers:new Map(), guestPc:null, guestChannel:null,
    names:['','',''], inGame:false, seq:0, lastStateSignature:'', passwordProtected:false,
    botSeat:null, botDifficulty:'normal',
    signalSocket:null, signalClosing:false, signalGuestId:'', hostToken:'', signalToSeat:new Map()
  };`,
'multiplayer bot state');

replaceOnce(
`  const safeClose = (target) => { try { target?.close(); } catch (_) {} };

  function applyCopy() {`,
`  const safeClose = (target) => { try { target?.close(); } catch (_) {} };
  const BOT_DIFFICULTIES = ['easy','normal','hard','expert'];
  const BOT_COPY = {
    pl:{add:'Dodaj bota',remove:'Usuń bota',bot:'Bot',level:'Poziom bota'},
    en:{add:'Add bot',remove:'Remove bot',bot:'Bot',level:'Bot level'},
    de:{add:'Bot hinzufügen',remove:'Bot entfernen',bot:'Bot',level:'Bot-Stärke'},
    es:{add:'Añadir bot',remove:'Quitar bot',bot:'Bot',level:'Nivel del bot'},
    fr:{add:'Ajouter un bot',remove:'Retirer le bot',bot:'Bot',level:'Niveau du bot'}
  };
  const botCopy = () => BOT_COPY[Skat.i18n?.language] || BOT_COPY.pl;
  const difficultyLabel = (difficulty) => Skat.i18n?.get?.(\`difficulty.\${difficulty}\`) || difficulty;
  const seatReady = (seat) => mp.botSeat === seat || !!mp.peers.get(seat)?.connected;
  const isBotSeat = (player) => mp.role === 'host' && mp.inGame && mp.botSeat === player;

  function syncBotName() {
    if (!Number.isInteger(mp.botSeat)) return;
    mp.names[mp.botSeat] = \`\${botCopy().bot} · \${difficultyLabel(mp.botDifficulty)}\`;
  }

  function broadcastLobby() {
    if (mp.role !== 'host') return;
    [1,2].forEach((seat) => {
      const peer = mp.peers.get(seat);
      if (peer?.connected) channelSend(peer.channel,{type:'lobby',names:mp.names,botSeat:mp.botSeat,botDifficulty:mp.botDifficulty});
    });
  }

  function setBotSeat(seat, difficulty = mp.botDifficulty) {
    if (mp.role !== 'host' || mp.inGame || ![1,2].includes(seat)) return false;
    const peer = mp.peers.get(seat);
    if (peer?.connected || peer?.pending) return false;
    if (!BOT_DIFFICULTIES.includes(difficulty)) difficulty = 'normal';
    if (mp.botSeat === seat) {
      mp.names[seat] = '';
      mp.botSeat = null;
    } else {
      if (Number.isInteger(mp.botSeat)) mp.names[mp.botSeat] = '';
      mp.botSeat = seat;
      mp.botDifficulty = difficulty;
      syncBotName();
    }
    renderLobby();
    broadcastLobby();
    return true;
  }

  function applyCopy() {`,
'multiplayer bot helpers');

replaceOnce(
`    Object.assign(mp,{role:null,room:'',auth:'',nick:'',seat:null,guestPc:null,guestChannel:null,names:['','',''],inGame:false,seq:0,lastStateSignature:'',passwordProtected:false,signalSocket:null,signalClosing:false,signalGuestId:'',hostToken:'',signalToSeat:new Map()});`,
`    Object.assign(mp,{role:null,room:'',auth:'',nick:'',seat:null,guestPc:null,guestChannel:null,names:['','',''],inGame:false,seq:0,lastStateSignature:'',passwordProtected:false,botSeat:null,botDifficulty:'normal',signalSocket:null,signalClosing:false,signalGuestId:'',hostToken:'',signalToSeat:new Map()});`,
'reset multiplayer bot state');

replaceOnce(
`    const seats=el('mp-lobby-seats');
    if(seats){
      seats.innerHTML=[0,1,2].map((seat)=>{
        const peer=mp.peers.get(seat);
        const isSelf=seat===mp.seat;
        const name=mp.names[seat] || (seat===0 && mp.role==='guest' ? lang().host : lang().waiting);
        const connected=isSelf || seat===0 || peer?.connected || (mp.role==='guest' && mp.guestChannel?.readyState==='open' && seat===mp.seat);
        return \`<div class="lobby-seat \${connected?'connected':''}"><b>\${escapeHtml(name)}</b><small>\${seat===0?lang().host:(connected?lang().connected:(peer?lang().connecting:lang().waiting))}</small></div>\`;
      }).join('');
    }
    const ready=mp.role==='host' && [1,2].every((seat)=>mp.peers.get(seat)?.connected);`,
`    const seats=el('mp-lobby-seats');
    if(seats){
      seats.innerHTML=[0,1,2].map((seat)=>{
        const peer=mp.peers.get(seat);
        const isSelf=seat===mp.seat;
        const isBot=mp.botSeat===seat;
        const name=mp.names[seat] || (seat===0 && mp.role==='guest' ? lang().host : lang().waiting);
        const connected=isBot || isSelf || seat===0 || peer?.connected || (mp.role==='guest' && mp.guestChannel?.readyState==='open' && seat===mp.seat);
        const status=seat===0?lang().host:(isBot?\`\${botCopy().bot} · \${difficultyLabel(mp.botDifficulty)}\`:(connected?lang().connected:(peer?lang().connecting:lang().waiting)));
        const canConfigureBot=mp.role==='host' && seat>0 && !peer?.connected && !peer?.pending;
        const difficultyOptions=BOT_DIFFICULTIES.map((difficulty)=>\`<option value="\${difficulty}" \${difficulty===mp.botDifficulty?'selected':''}>\${escapeHtml(difficultyLabel(difficulty))}</option>\`).join('');
        const botTools=canConfigureBot?\`<div class="lobby-bot-tools"><select aria-label="\${escapeHtml(botCopy().level)}" data-mp-bot-difficulty="\${seat}">\${difficultyOptions}</select><button type="button" class="lobby-bot-button \${isBot?'remove':''}" data-mp-bot-seat="\${seat}">\${escapeHtml(isBot?botCopy().remove:botCopy().add)}</button></div>\`:'';
        return \`<div class="lobby-seat \${connected?'connected':''} \${isBot?'bot':''}"><b>\${escapeHtml(name)}</b><small>\${escapeHtml(status)}</small>\${botTools}</div>\`;
      }).join('');
    }
    const ready=mp.role==='host' && [1,2].every(seatReady);`,
'render bot seats');

replaceOnce(
`        mp.names[seat]=checked.nickname;peer.connected=true;renderLobby();channelSend(channel,{type:'welcome',seat,names:mp.names,room:mp.room});`,
`        mp.names[seat]=checked.nickname;peer.connected=true;renderLobby();channelSend(channel,{type:'welcome',seat,names:mp.names,room:mp.room,botSeat:mp.botSeat,botDifficulty:mp.botDifficulty});`,
'host welcome bot metadata');

replaceOnce(
`      if(message.type==='welcome'){
        mp.seat=message.seat;mp.names=Array.isArray(message.names)?message.names:mp.names;renderLobby();
      } else if(message.type==='state') applyRemoteState(message.state,message.seq);`,
`      if(message.type==='welcome'){
        mp.seat=message.seat;mp.names=Array.isArray(message.names)?message.names:mp.names;mp.botSeat=Number.isInteger(message.botSeat)?message.botSeat:null;mp.botDifficulty=BOT_DIFFICULTIES.includes(message.botDifficulty)?message.botDifficulty:'normal';renderLobby();
      } else if(message.type==='lobby') {
        mp.names=Array.isArray(message.names)?message.names:mp.names;mp.botSeat=Number.isInteger(message.botSeat)?message.botSeat:null;mp.botDifficulty=BOT_DIFFICULTIES.includes(message.botDifficulty)?message.botDifficulty:mp.botDifficulty;renderLobby();
      } else if(message.type==='state') applyRemoteState(message.state,message.seq);`,
'guest lobby sync');

replaceOnce(
`    const seat=[1,2].find((candidate)=>!mp.peers.get(candidate)?.connected&&!mp.peers.get(candidate)?.pending);`,
`    const seat=[1,2].find((candidate)=>candidate!==mp.botSeat&&!mp.peers.get(candidate)?.connected&&!mp.peers.get(candidate)?.pending);`,
'bot seat reservation');

replaceOnce(
`  function startGame() {
    if(mp.role!=='host'||![1,2].every((seat)=>mp.peers.get(seat)?.connected))return;
    mp.signalClosing=true;signalSend({type:'close-room'});
    mp.inGame=true;const state=Skat.game.state;state.multiplayer=true;state.playerNames=[...mp.names];state.tutorialMode=false;
    Skat.game.hideMainMenu();el('multiplayer-modal')?.classList.add('hidden');Skat.game.resetMatch();updateNetworkPill(true);
  }`,
`  function startGame() {
    if(mp.role!=='host'||![1,2].every(seatReady))return;
    mp.signalClosing=true;signalSend({type:'close-room'});
    mp.inGame=true;syncBotName();const state=Skat.game.state;state.multiplayer=true;state.playerNames=[...mp.names];state.tutorialMode=false;
    if(Number.isInteger(mp.botSeat)) state.settings.botDifficulty=mp.botDifficulty;
    Skat.game.hideMainMenu();el('multiplayer-modal')?.classList.add('hidden');Skat.game.resetMatch();updateNetworkPill(true);
  }`,
'hybrid game start');

replaceOnce(
`    applyCopy();updateNetworkPill(mp.role==='host'?[1,2].every((seat)=>mp.peers.get(seat)?.connected):mp.guestChannel?.readyState==='open');`,
`    applyCopy();updateNetworkPill(mp.role==='host'?[1,2].every(seatReady):mp.guestChannel?.readyState==='open');`,
'hybrid connection indicator');

replaceOnce(
`  Skat.multiplayer={handleGameAction,handleCardPlay,afterRender,isGameActive:()=>mp.inGame,debug:()=>mp};`,
`  document.addEventListener('click',(event)=>{
    const button=event.target.closest('[data-mp-bot-seat]');
    if(!button)return;
    const seat=Number(button.dataset.mpBotSeat);
    const select=document.querySelector(\`[data-mp-bot-difficulty="\${seat}"]\`);
    setBotSeat(seat,select?.value||mp.botDifficulty);
  });
  document.addEventListener('change',(event)=>{
    const select=event.target.closest('[data-mp-bot-difficulty]');
    if(!select)return;
    const seat=Number(select.dataset.mpBotDifficulty);
    if(mp.role!=='host'||mp.inGame||mp.botSeat!==seat||!BOT_DIFFICULTIES.includes(select.value))return;
    mp.botDifficulty=select.value;syncBotName();renderLobby();broadcastLobby();
  });

  Skat.multiplayer={handleGameAction,handleCardPlay,afterRender,isGameActive:()=>mp.inGame,isBotSeat,debug:()=>mp,debugRenderLobby:renderLobby,debugStartGame:startGame,debugSetBotSeat:setBotSeat};`,
'multiplayer bot events and debug hooks');

fs.writeFileSync(file, html);
console.log('Applied multiplayer bot-seat support to index.html');
