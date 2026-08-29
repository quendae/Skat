import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const htmlPath = path.resolve('index.html');
const source = fs.readFileSync(htmlPath, 'utf8');
for (const [needle,label] of [
  ['data-mp-bot-seat','lobby bot control'],
  ['isBotControlled(player)','hybrid bot routing'],
  ['candidate!==mp.botSeat','reserved P2P bot seat'],
  ['[1,2].every(seatReady)','hybrid lobby readiness'],
]) if (!source.includes(needle)) throw new Error(`Missing ${label}`);

const chrome = [process.env.CHROME_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium']
  .filter(Boolean).find(fs.existsSync);
if (!chrome) throw new Error('Chrome/Chromium not found');
const browser = await chromium.launch({headless:true,executablePath:chrome,args:['--no-sandbox']});
const url = pathToFileURL(htmlPath).href;

async function pageFor(viewport={width:1280,height:800}) {
  const context = await browser.newContext({viewport});
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction(()=>!!window.Skat?.game?.state && !!window.Skat?.multiplayer);
  return {context,page,errors};
}

async function setup(page,botSeat,difficulty,start=true) {
  return page.evaluate(({botSeat,difficulty,start})=>{
    const S=window.Skat, mp=S.multiplayer.debug();
    const humanSeat=botSeat===1?2:1;
    mp.role='host';mp.room='TEST-BOT';mp.auth='test';mp.seat=0;mp.nick='Host';mp.names=['Host','',''];mp.inGame=false;mp.peers.clear();mp.botSeat=null;mp.botDifficulty='normal';
    mp.peers.set(humanSeat,{connected:true,pending:false,channel:{readyState:'open',send(){},close(){}},pc:{close(){}}});
    mp.names[humanSeat]='Remote';
    if(!S.multiplayer.debugSetBotSeat(botSeat,difficulty)) throw new Error('debugSetBotSeat rejected setup');
    S.multiplayer.debugRenderLobby();
    if(start){
      const s=S.game.state;s.settings.animations=false;s.settings.soundEffects=false;s.settings.pauseAuction=false;s.settings.auctionSpeed='fast';
      const native=window.setTimeout.bind(window);window.setTimeout=(fn,ms=0,...args)=>native(fn,Math.min(Number(ms)||0,1),...args);
      S.multiplayer.debugStartGame();
      if(!mp.inGame||!S.multiplayer.isBotSeat(botSeat)) throw new Error('Hybrid game did not activate bot seat');
    }
    return {humanSeat,botName:mp.names[botSeat]};
  },{botSeat,difficulty,start});
}

async function driveOneHand(page,botSeat,humanSeat) {
  for(let step=0;step<800;step++) {
    const snap=await page.evaluate(({botSeat,humanSeat})=>{
      const S=window.Skat,s=S.game.state,B=S.bot,human=new Set([0,humanSeat]);
      const capturedIds=new Set(s.captured.flat().map(c=>c?.id).filter(Boolean));
      const trick=(s.trick?.cards||[]).map(e=>e.card).filter(c=>!capturedIds.has(c?.id));
      const ids=[...s.hands.flat(),...s.skat,...s.captured.flat(),...trick].map(c=>c?.id).filter(Boolean);
      if(ids.length!==32||new Set(ids).size!==32) throw new Error(`Card conservation ${s.phase}: ${ids.length}/${new Set(ids).size}`);
      let acted=false;
      const act=(p,a,payload={})=>{if(!S.game.executePlayerAction(p,a,payload))throw new Error(`Rejected ${a} p${p} in ${s.phase}`);acted=true;};
      if(s.phase==='auction'&&s.auction&&human.has(s.auction.actor)){
        const p=s.auction.actor,max=B.estimateMaxBid(s.hands[p],'expert');
        if(s.auction.mode==='forehand-choice')act(p,max>=18?'forehand-play':'forehand-pass');
        else if(s.auction.mode==='caller')act(p,s.auction.nextBid&&s.auction.nextBid<=max?'auction-bid':'auction-pass');
        else act(p,s.auction.currentValue<=max?'auction-accept':'auction-pass');
      } else if(s.phase==='pickup-choice'&&human.has(s.declarer)) act(s.declarer,'pickup-skat');
      else if(s.phase==='discard'&&human.has(s.declarer)){
        const p=s.declarer,c=B.chooseContract(s.hands[p],s.bidValue,false,'expert',s.settings.advancedContracts),d=B.chooseDiscard(s.hands[p],c,'expert');
        act(p,'confirm-discard',{cardIds:d.map(x=>x.id)});
      } else if(s.phase==='declare'&&human.has(s.declarer)){
        const p=s.declarer,c=B.chooseContract(s.hands[p],s.bidValue,false,'expert',s.settings.advancedContracts);
        act(p,c.type==='grand'?'declare-grand':c.type==='null'?(c.ouvert?'declare-null-ouvert':'declare-null'):`declare-${c.suit}`);
      } else if(s.phase==='announce'&&human.has(s.declarer)) act(s.declarer,'announce-none');
      else if(s.phase==='kontra'&&s.kontra&&human.has(s.kontra.actor)) act(s.kontra.actor,s.kontra.stage==='re'?'re-pass':'kontra-pass');
      else if(s.phase==='play'&&Number.isInteger(s.currentPlayer)&&human.has(s.currentPlayer)){
        const p=s.currentPlayer,c=B.choosePlay({hand:s.hands[p],trickCards:s.trick.cards,contract:s.contract,declarer:s.declarer,player:p,difficulty:'expert',voids:s.voids});act(p,'play-card',{cardId:c.id});
      }
      return {phase:s.phase,acted,botName:s.playerNames?.[botSeat]||'',log:s.log.slice(-12)};
    },{botSeat,humanSeat});
    if(snap.phase==='hand-end'){
      if(!snap.log.some(line=>snap.botName&&String(line).startsWith(snap.botName))) throw new Error('No bot activity found in completed hand');
      return;
    }
    if(!snap.acted) await page.waitForTimeout(2);
  }
  throw new Error(`Hand stalled for bot seat ${botSeat}`);
}

const games=[];
for(const botSeat of [1,2]) for(const difficulty of ['easy','normal','hard','expert']){
  const {context,page,errors}=await pageFor();
  const {humanSeat}=await setup(page,botSeat,difficulty,true);
  for(let hand=0;hand<3;hand++){
    await driveOneHand(page,botSeat,humanSeat);
    if(hand<2) await page.evaluate(()=>window.Skat.game.newHand());
  }
  if(errors.length)throw new Error(`${botSeat}/${difficulty}: ${errors.join(' | ')}`);
  games.push({botSeat,difficulty,hands:3});
  await context.close();
}

const layouts=[];
for(const vp of [
  {name:'desktop',width:1440,height:900},{name:'tablet',width:1024,height:768},
  {name:'phone portrait',width:390,height:844},{name:'phone landscape',width:844,height:390},
]){
  const {context,page,errors}=await pageFor(vp);
  await page.evaluate(()=>{document.getElementById('main-menu')?.classList.add('hidden');document.getElementById('multiplayer-modal')?.classList.remove('hidden');document.getElementById('multiplayer-setup')?.classList.add('hidden');document.getElementById('multiplayer-lobby')?.classList.remove('hidden');});
  await setup(page,2,'hard',false);
  const check=await page.evaluate(()=>{
    const start=document.getElementById('mp-start-button'),modal=document.querySelector('.multiplayer-card'),button=document.querySelector('[data-mp-bot-seat="2"]'),select=document.querySelector('[data-mp-bot-difficulty="2"]'),seat=button?.closest('.lobby-seat');
    const visible=n=>!!n&&n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0;
    const nodes=[modal,button,select,seat].filter(Boolean),overflow=nodes.some(n=>{const r=n.getBoundingClientRect();return r.left<-1||r.right>innerWidth+1;});
    return {start:!!start&&!start.disabled,button:visible(button),select:visible(select),bot:!!seat?.classList.contains('bot'),overflow,modalOverflow:(modal?.scrollWidth||0)>(modal?.clientWidth||0)+2};
  });
  if(!check.start||!check.button||!check.select||!check.bot||check.overflow||check.modalOverflow) throw new Error(`${vp.name} lobby check failed: ${JSON.stringify(check)}`);
  if(errors.length)throw new Error(`${vp.name}: ${errors.join(' | ')}`);
  layouts.push({viewport:vp.name,ok:true});
  await context.close();
}

await browser.close();
console.log('Hybrid smoke agent: PASS');
console.table(games);
console.log(`Completed ${games.reduce((n,x)=>n+x.hands,0)} hybrid hands across all bot positions/difficulties.`);
console.table(layouts);
