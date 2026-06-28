// ═══════════════════════════════════════════
//  NINJADASH ∞  — v4.1  BLACK SCREEN FIX
//
//  ROOT CAUSE: The original code ran animBg() on pCanvas (z-index:98)
//  which sat on top of gameCanvas. When game started, animBg() detected
//  active===true and exited — leaving pCanvas full of stale pixels
//  covering the entire game view.
//
//  FIX: pCanvas is now strictly a home-screen-only background layer
//  (z-index:1, BELOW gameCanvas at z-index:2). A dedicated bgAnimLoop
//  runs only when !active. When startGame() is called, stopBgAnimation()
//  cancels it and clears pCanvas. The game draw() handles all rendering
//  on gameCanvas, including stars and background.
// ═══════════════════════════════════════════

const canvas=document.getElementById('gameCanvas'),ctx=canvas.getContext('2d');
const pCanvas=document.getElementById('partCanvas'),pCtx=pCanvas.getContext('2d');

// STATE
let active=false,paused=false,score=0,level=1,armor=0,frame=0,startTime=0;
let obstacles=[],powerUps=[],particles=[],floatScores=[];
let coins=0,maxCombo=0,combo=0,sessionCoins=0;
let currentMode='NORMAL',ctrlMode='tap',currentSkin='default';
let invTimer=0,slowTimer=0,magnetTimer=0,shieldCharges=0,boostTimer=0;
let holdingJump=false,swipeStartY=0;
let gameTime=0,bestScore=0,lastFrameTime=0;
let targetLevel=0,won=false;
let settings={scanlines:false,screenShake:true,showControls:true,particles:true,bgStars:true,music:true};
let upgrades={},upgradeData=[],missions=[],leaderboard=[],selectedSkin='default';
let loopId=null,bgLoopId=null;

const PIPE_COLORS=['#ff2d55','#ff6b00','#ffd700','#39ff14','#00f2ff','#bf5fff','#ff80ab','#69f0ae'];
const BG_THEMES=[
  {sky:'#030308',h1:'rgba(0,242,255,0.06)'},
  {sky:'#08030a',h1:'rgba(191,95,255,0.07)'},
  {sky:'#030a04',h1:'rgba(57,255,20,0.06)'},
  {sky:'#0a0603',h1:'rgba(255,107,0,0.07)'},
  {sky:'#0a0308',h1:'rgba(255,45,85,0.07)'},
  {sky:'#030808',h1:'rgba(0,255,180,0.06)'},
];
let bgThemeIdx=0,bgThemeTick=0;

// BOT
let botMode=false,botStats={runs:0,best:0,total:0,fails:0};
const BOT_QUIPS=['CALCULATING...','NICE TRY!','PANIC MODE!','OH NO...','SO CLOSE!','UNLUCKY!','ENGAGE!','WATCH THIS!','SMOOTH!','OOPS!','GOT THIS!','PHEW!'];
let botQuipText='',botQuipTimer=0,botReactDelay=0,botTargetY=0,botPanic=false;

const player={x:0,y:0,w:30,h:30,dy:0,trail:[]};

const skinList=[
  {id:'default',name:'NANO',  color:'#00f2ff',shape:'square'},
  {id:'fire',   name:'FIRE',  color:'#ff6b00',shape:'square'},
  {id:'ghost',  name:'GHOST', color:'#bf5fff',shape:'square'},
  {id:'gold',   name:'GOLD',  color:'#ffd700',shape:'diamond'},
  {id:'stealth',name:'VOID',  color:'#e0e0e0',shape:'square'},
  {id:'star',   name:'STAR',  color:'#ff2d55',shape:'star'},
  {id:'alien',  name:'XENO',  color:'#39ff14',shape:'round'},
  {id:'cyber',  name:'CYBER', color:'#00f2ff',shape:'square'},
];

const modes={
  BABY:  {speed:3.8, gap:310, arm:99, grav:.20,  j:-5.2,  label:'BABY',  col:'#39ff14'},
  NORMAL:{speed:5.2, gap:205, arm:2,  grav:.265,  j:-6.0,  label:'NORMAL',col:'#00f2ff'},
  HARD:  {speed:7.2, gap:170, arm:0,  grav:.33,   j:-6.6,  label:'HARD',  col:'#ff2d55'},
  PRO:   {speed:9.5, gap:145, arm:0,  grav:.42,   j:-7.2,  label:'PRO',   col:'#ffd700'},
  ZEN:   {speed:4.2, gap:999, arm:99, grav:.22,   j:-5.5,  label:'ZEN',   col:'#bf5fff'},
  BOT:   {speed:5.2, gap:205, arm:2,  grav:.265,  j:-6.0,  label:'BOT',   col:'#bf5fff'},
};

// AUDIO
let audioCtx=null,masterGain=null,muted=false;
function getAC(){
  if(!audioCtx){try{audioCtx=new(window.AudioContext||window.webkitAudioContext)();masterGain=audioCtx.createGain();masterGain.gain.value=0.38;masterGain.connect(audioCtx.destination);}catch(e){audioCtx=null;}}
  return audioCtx;
}
function tone(freq,dur,type='sine',vol=0.28,delay=0){
  if(muted)return;const ac=getAC();if(!ac)return;
  try{const o=ac.createOscillator(),g=ac.createGain();o.connect(g);g.connect(masterGain);o.type=type;o.frequency.setValueAtTime(freq,ac.currentTime+delay);g.gain.setValueAtTime(vol,ac.currentTime+delay);g.gain.exponentialRampToValueAtTime(0.001,ac.currentTime+delay+dur);o.start(ac.currentTime+delay);o.stop(ac.currentTime+delay+dur+0.01);}catch(e){}
}
function sndJump(){tone(300,0.1,'sine',0.22);tone(450,0.07,'sine',0.14,0.05);}
function sndScore(){tone(660,0.06,'sine',0.16);tone(880,0.06,'sine',0.16,0.06);}
function sndHit(){tone(160,0.14,'sawtooth',0.32);tone(90,0.18,'sawtooth',0.28,0.04);}
function sndDie(){[380,320,260,200,140].forEach((f,i)=>tone(f,0.1,'sawtooth',0.28,i*0.07));}
function sndLevelUp(){[523,659,784,1047].forEach((f,i)=>tone(f,0.1,'sine',0.18,i*0.08));}
function sndPowerUp(){tone(880,0.07,'sine',0.18);tone(1100,0.09,'sine',0.22,0.05);tone(1320,0.11,'sine',0.18,0.12);}
function sndCombo(){tone(440+Math.min(combo*35,400),0.09,'sine',0.2);}

let bgMusicInterval=null;
const SCALE=[261,294,329,349,392,440,494,523];
let musicStep=0;
function startMusic(){
  if(muted||bgMusicInterval)return;
  const ac=getAC();if(!ac)return;
  bgMusicInterval=setInterval(()=>{
    if(!active&&!botMode){stopMusic();return;}
    if(muted)return;
    try{const f=SCALE[musicStep%SCALE.length]*(level>5?2:1);tone(Math.min(f,900),0.22,'triangle',0.055);if(musicStep%4===0)tone(f/2,0.35,'sine',0.04);musicStep++;}catch(e){}
  },280);
}
function stopMusic(){clearInterval(bgMusicInterval);bgMusicInterval=null;}
function toggleMute(){
  muted=!muted;document.getElementById('vol-btn').textContent=muted?'🔇':'🔊';settings.music=!muted;
  if(muted)stopMusic();else if(active||botMode)startMusic();save();
}

function buildUpgrades(){
  upgradeData=[
    {id:'armor',  name:'NANO ARMOR',  icon:'🛡️',desc:'Start with +1 armor',   maxLvl:5,cost:[80,150,250,400,600]},
    {id:'gravity',name:'LOW GRAV',    icon:'🌙',desc:'Lighter fall',           maxLvl:4,cost:[100,200,350,600]},
    {id:'gap',    name:'WIDE PIPES',  icon:'📏',desc:'Wider gaps (+8px)',      maxLvl:4,cost:[120,220,380,700]},
    {id:'speed',  name:'SLOW SURGE',  icon:'⏪',desc:'Slower pipes',           maxLvl:3,cost:[150,300,500]},
    {id:'coins',  name:'COIN 2X',     icon:'🧲',desc:'Earn 2x coins',          maxLvl:1,cost:[500]},
    {id:'shield', name:'FORCE SHIELD',icon:'💠',desc:'Start with shield',      maxLvl:3,cost:[200,400,700]},
    {id:'trail',  name:'NEON TRAIL',  icon:'✨',desc:'Epic trail FX',          maxLvl:1,cost:[80]},
    {id:'slow',   name:'BULLET TIME', icon:'⏱️',desc:'More slow-time drops',   maxLvl:2,cost:[200,450]},
  ];
  upgradeData.forEach(u=>{if(upgrades[u.id]===undefined)upgrades[u.id]=0;});
}

function buildMissions(){
  if(missions.length)return;
  missions=[
    {id:'m1', name:'FIRST BLOOD',  icon:'🩸',desc:'Complete first run',    goal:1,  type:'runs', reward:50, prog:0,done:false},
    {id:'m2', name:'CENTURY',      icon:'💯',desc:'Score over 100',         goal:100, type:'score',reward:80, prog:0,done:false},
    {id:'m3', name:'FIVE HUNDRED', icon:'🌟',desc:'Score over 500',         goal:500, type:'score',reward:200,prog:0,done:false},
    {id:'m4', name:'LEVEL 5',      icon:'🏅',desc:'Reach level 5',          goal:5,  type:'level',reward:150,prog:0,done:false},
    {id:'m5', name:'COMBO MASTER', icon:'⚡',desc:'Get a 10x combo',        goal:10, type:'combo',reward:120,prog:0,done:false},
    {id:'m6', name:'SURVIVOR',     icon:'⏳',desc:'Survive 60s',            goal:60, type:'time', reward:100,prog:0,done:false},
    {id:'m7', name:'COIN HOARDER', icon:'💰',desc:'Collect 500 coins',      goal:500,type:'coins',reward:300,prog:0,done:false},
    {id:'m8', name:'SPEED DEMON',  icon:'🔥',desc:'Play PRO mode',          goal:1,  type:'pro',  reward:400,prog:0,done:false},
    {id:'m9', name:'BOT WATCHER',  icon:'🤖',desc:'Watch bot play 3 times', goal:3,  type:'bot',  reward:200,prog:0,done:false},
    {id:'m10',name:'ZEN MASTER',   icon:'🌊',desc:'Score 300 in Zen mode',  goal:300,type:'zen',  reward:250,prog:0,done:false},
  ];
}

function save(){try{localStorage.setItem('nn_save',JSON.stringify({coins,upgrades,missions,leaderboard,settings,selectedSkin,botStats}));}catch(e){}}
function load(){
  try{
    const raw=localStorage.getItem('nn_save');
    if(raw){const d=JSON.parse(raw);coins=d.coins||0;upgrades=d.upgrades||{};if(d.missions)missions=d.missions;if(d.leaderboard)leaderboard=d.leaderboard;if(d.settings)Object.assign(settings,d.settings);if(d.selectedSkin)selectedSkin=d.selectedSkin;if(d.botStats)Object.assign(botStats,d.botStats);}
    bestScore=parseInt(localStorage.getItem('nn_best')||0);
  }catch(e){}
}
function clearAllData(){
  if(!confirm('⚠️ Delete ALL data?'))return;
  try{localStorage.clear();}catch(e){}
  coins=0;upgrades={};missions=[];leaderboard=[];bestScore=0;selectedSkin='default';botStats={runs:0,best:0,total:0,fails:0};
  buildUpgrades();buildMissions();renderSkinGrid();renderSettings();renderLeaderboard();renderMissions();renderShop();renderBotStats();
  showNotif('ALL DATA CLEARED 🗑');
}

function init(){
  load();buildUpgrades();buildMissions();
  renderSkinGrid();renderSettings();
  resizeAll();
  renderLeaderboard();renderMissions();renderShop();renderBotStats();
  setupTouchZone();
  registerSW();
  applySettings();
  startBgAnimation();
}
let swReg=null;
let waitingSW=null;
function registerSW(){
  if(!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('./sw.js').then(reg=>{
    swReg=reg;
    if(reg.waiting)showUpdateBanner(reg.waiting);
    reg.addEventListener('updatefound',()=>{
      const newSW=reg.installing;
      newSW.addEventListener('statechange',()=>{
        if(newSW.state==='installed'&&navigator.serviceWorker.controller){
          showUpdateBanner(newSW);
        }
      });
    });
  }).catch(()=>{});
  navigator.serviceWorker.addEventListener('controllerchange',()=>{window.location.reload();});
}
function showUpdateBanner(sw){waitingSW=sw;document.getElementById('update-banner').classList.add('show');}
function applyUpdate(){if(waitingSW)waitingSW.postMessage({type:'SKIP_WAITING'});document.getElementById('update-banner').classList.remove('show');}
function checkForUpdates(){
  if(!swReg){showNotif('SW NOT READY');return;}
  showNotif('CHECKING FOR UPDATES...');
  swReg.update().then(()=>{
    if(!waitingSW)showNotif('YOU ARE UP TO DATE');
  }).catch(()=>{showNotif('UPDATE CHECK FAILED');});
}

let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;document.getElementById('install-banner').style.display='flex';});
window.addEventListener('appinstalled',()=>{document.getElementById('install-banner').style.display='none';deferredPrompt=null;});
function installPWA(){if(!deferredPrompt)return;deferredPrompt.prompt();deferredPrompt.userChoice.then(c=>{if(c.outcome==='accepted')document.getElementById('install-banner').style.display='none';deferredPrompt=null;});}
function dismissInstall(){document.getElementById('install-banner').style.display='none';}

const SCREENS=['home-page','profile-page','death-screen','pause-screen','shop-screen','lb-screen','missions-screen','settings-screen','bot-screen'];
function hideAllScreens(){SCREENS.forEach(s=>document.getElementById(s).style.display='none');}
function showScreen(id){hideAllScreens();const el=document.getElementById(id);if(el)el.style.display='flex';}
function closeShop(){if(active&&paused)showScreen('pause-screen');else showScreen('home-page');}

function renderSkinGrid(){
  document.getElementById('skin-grid').innerHTML=skinList.map(s=>`
    <div class="skin-card ${selectedSkin===s.id?'active':''}" onclick="pickSkin('${s.id}')">
      <div class="skin-preview" style="background:${s.color};border-radius:${s.shape==='round'?'50%':s.shape==='diamond'?'0':'3px'};transform:${s.shape==='diamond'?'rotate(45deg)':'none'};"></div>
      <span>${s.name}</span></div>`).join('');
}
function pickSkin(id){selectedSkin=id;currentSkin=id;renderSkinGrid();save();}

function renderSettings(){
  const rows=[{key:'scanlines',label:'Scanlines FX'},{key:'screenShake',label:'Screen Shake'},{key:'showControls',label:'Mobile Buttons'},{key:'particles',label:'Particles'},{key:'bgStars',label:'Background Stars'},{key:'music',label:'Background Music'}];
  document.getElementById('settings-rows').innerHTML=rows.map(r=>`<div class="setting-row"><span class="setting-label">${r.label}</span><button class="toggle ${settings[r.key]?'on':''}" id="tog-${r.key}" onclick="toggleSetting('${r.key}')"></button></div>`).join('');
}
function toggleSetting(k){
  settings[k]=!settings[k];document.getElementById('tog-'+k).className='toggle '+(settings[k]?'on':'');
  if(k==='music'){muted=!settings.music;document.getElementById('vol-btn').textContent=muted?'🔇':'🔊';if(muted)stopMusic();else if(active||botMode)startMusic();}
  applySettings();save();
}
function applySettings(){document.getElementById('scanlines').style.display=settings.scanlines?'block':'none';}

function renderShop(){
  document.getElementById('shop-coins').textContent=coins;
  document.getElementById('upgrade-grid').innerHTML=upgradeData.map(u=>{
    const lvl=upgrades[u.id]||0,maxed=lvl>=u.maxLvl,cost=maxed?0:u.cost[lvl],ok=coins>=cost;
    return `<div class="upg-card ${maxed?'maxed':(!ok?'locked':'')}" onclick="buyUpgrade('${u.id}')"><div class="upg-lvl">${maxed?'MAX':lvl+'/'+u.maxLvl}</div><div class="upg-icon">${u.icon}</div><div class="upg-name">${u.name}</div><div class="upg-desc">${u.desc}</div><div class="upg-cost">${maxed?'✓ MAXED':'💰 '+cost}</div></div>`;
  }).join('');
}
function buyUpgrade(id){
  const u=upgradeData.find(x=>x.id===id),lvl=upgrades[id]||0;
  if(lvl>=u.maxLvl)return;const cost=u.cost[lvl];
  if(coins<cost){showNotif('NOT ENOUGH COINS');return;}
  coins-=cost;upgrades[id]=(upgrades[id]||0)+1;save();renderShop();showNotif(u.name+' UPGRADED! ✨');
}
function renderLeaderboard(){
  const el=document.getElementById('lb-list');
  if(!leaderboard.length){el.innerHTML='<div style="text-align:center;opacity:.3;padding:28px;font-size:.8rem;letter-spacing:2px;">NO RECORDS YET</div>';return;}
  const sorted=[...leaderboard].sort((a,b)=>b.score-a.score).slice(0,10);
  const ranks=['🥇','🥈','🥉'],cls=['gold','silver','bronze'];
  el.innerHTML=sorted.map((r,i)=>`<div class="lb-row"><div class="lb-rank ${cls[i]||''}">${ranks[i]||i+1}</div><div class="lb-info"><div class="lb-name">${r.name}</div><div class="lb-meta">${r.mode} • LVL ${r.level} • ${r.time}s</div></div><div class="lb-score">${Math.floor(r.score)}</div></div>`).join('');
}
function renderMissions(){
  document.getElementById('mission-list').innerHTML=missions.map(m=>{
    const pct=Math.min(100,Math.floor(m.prog/m.goal*100));
    return `<div class="mission-row ${m.done?'done':''}"><div class="m-icon">${m.icon}</div><div class="m-info"><div class="m-name">${m.name} ${m.done?'✓':''}</div><div class="m-desc">${m.desc}</div><div class="m-prog"><div class="m-bar" style="width:${pct}%"></div></div></div><div class="m-reward">💰${m.reward}</div></div>`;
  }).join('');
}
function updateMissions(){
  let changed=false;
  missions.forEach(m=>{
    if(m.done)return;let p=m.prog;
    if(m.type==='score')p=Math.max(m.prog,score);
    if(m.type==='level')p=Math.max(m.prog,level);
    if(m.type==='combo')p=Math.max(m.prog,combo);
    if(m.type==='time') p=Math.max(m.prog,gameTime);
    if(m.type==='coins')p=coins+sessionCoins;
    if(m.type==='pro'&&currentMode==='PRO')p=1;
    if(m.type==='zen'&&currentMode==='ZEN')p=Math.max(m.prog,score);
    if(p!==m.prog){m.prog=p;changed=true;}
    if(m.prog>=m.goal&&!m.done){m.done=true;coins+=m.reward;sessionCoins+=m.reward;showNotif('✅ MISSION: +'+m.reward+' 💰');changed=true;}
  });
  if(changed)save();
}
function renderBotStats(){
  document.getElementById('bs-runs').textContent=botStats.runs;
  document.getElementById('bs-best').textContent=Math.floor(botStats.best);
  document.getElementById('bs-avg').textContent=botStats.runs?Math.floor(botStats.total/botStats.runs):0;
  document.getElementById('bs-fails').textContent=botStats.fails;
}

let notifT=null;
function showNotif(msg){const el=document.getElementById('notif');el.textContent=msg;el.style.opacity='1';clearTimeout(notifT);notifT=setTimeout(()=>el.style.opacity='0',2500);}

function sel(m){currentMode=m;document.getElementById('mode-title').textContent='// '+m+' MODE //';showScreen('profile-page');}

function startBotMode(){
  botMode=true;currentMode='BOT';currentSkin=selectedSkin;targetLevel=0;
  const name='🤖 BOT-'+Math.floor(Math.random()*900+100);
  document.getElementById('hud-name').textContent=name;
  document.getElementById('ui-mode').textContent='BOT WATCH';
  document.getElementById('bot-badge').style.display='block';
  hideAllScreens();
  document.getElementById('hud').style.display='flex';
  document.getElementById('p-btn').style.display='block';
  document.getElementById('vol-btn').style.display='block';
  document.getElementById('powerup-list').style.display='flex';
  document.getElementById('ctrl-overlay').style.display='none';
  document.getElementById('touch-jump-zone').classList.remove('active');
  ctrlMode='bot';applySettings();
  const m9=missions.find(m=>m.id==='m9');
  if(m9&&!m9.done){m9.prog=Math.min(m9.goal,(m9.prog||0)+1);if(m9.prog>=m9.goal){m9.done=true;coins+=m9.reward;showNotif('✅ BOT WATCHER: +'+m9.reward+' 💰');}}
  save();startGame(name);
}

function launch(){
  const name=document.getElementById('p-name').value||'NINJA';
  ctrlMode=document.getElementById('ctrl-select').value;
  const tSel=document.getElementById('target-select').value;
  targetLevel=tSel==='custom'?Math.max(2,parseInt(document.getElementById('target-custom').value)||10):parseInt(tSel)||0;
  currentSkin=selectedSkin;botMode=false;
  document.getElementById('hud-name').textContent=name.toUpperCase();
  document.getElementById('ui-mode').textContent=currentMode;
  document.getElementById('bot-badge').style.display='none';
  hideAllScreens();
  document.getElementById('hud').style.display='flex';
  document.getElementById('p-btn').style.display='block';
  document.getElementById('vol-btn').style.display='block';
  document.getElementById('powerup-list').style.display='flex';
  const mob='ontouchstart' in window;
  if(mob&&settings.showControls)document.getElementById('ctrl-overlay').style.display='block';
  document.getElementById('touch-jump-zone').classList.add('active');
  applySettings();startGame(name);
}

function startGame(nm){
  // ── THE FIX: stop home bg loop and clear pCanvas so it can't obscure gameplay ──
  stopBgAnimation();
  pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);

  const s=modes[currentMode]||modes.NORMAL;
  score=0;level=1;frame=0;combo=0;maxCombo=0;sessionCoins=0;gameTime=0;won=false;
  obstacles=[];powerUps=[];particles=[];floatScores=[];
  invTimer=0;slowTimer=0;magnetTimer=0;boostTimer=0;holdingJump=false;
  armor=(s.arm>=99)?99:Math.min(s.arm+(upgrades.armor||0),20);
  shieldCharges=upgrades.shield||0;
  player.x=canvas.width*0.20;player.y=canvas.height/2;player.dy=0;player.trail=[];
  bgThemeIdx=0;bgThemeTick=0;
  startTime=Date.now();lastFrameTime=performance.now();
  active=true;paused=false;
  muted=!settings.music;
  document.getElementById('vol-btn').textContent=muted?'🔇':'🔊';
  updateArmorPips();
  if(botMode){botStats.runs++;renderBotStats();save();}
  stopMusic();setTimeout(()=>startMusic(),200);
  if(loopId)cancelAnimationFrame(loopId);
  loop();
}

function relaunch(){
  const wasBotMode=botMode;
  hideAllScreens();
  document.getElementById('hud').style.display='flex';
  document.getElementById('p-btn').style.display='block';
  document.getElementById('vol-btn').style.display='block';
  document.getElementById('powerup-list').style.display='flex';
  if(wasBotMode){
    document.getElementById('ctrl-overlay').style.display='none';
    document.getElementById('touch-jump-zone').classList.remove('active');
    document.getElementById('bot-badge').style.display='block';
    botMode=true;ctrlMode='bot';
    const m9=missions.find(m=>m.id==='m9');
    if(m9&&!m9.done){m9.prog=Math.min(m9.goal,(m9.prog||0)+1);if(m9.prog>=m9.goal){m9.done=true;coins+=m9.reward;}}
    save();
  } else {
    const mob='ontouchstart' in window;
    if(mob&&settings.showControls)document.getElementById('ctrl-overlay').style.display='block';
    document.getElementById('touch-jump-zone').classList.add('active');
  }
  startGame(document.getElementById('hud-name').textContent||'NINJA');
}

function resetAll(){
  active=false;paused=false;botMode=false;
  document.getElementById('hud').style.display='none';
  document.getElementById('p-btn').style.display='none';
  document.getElementById('vol-btn').style.display='none';
  document.getElementById('ctrl-overlay').style.display='none';
  document.getElementById('powerup-list').style.display='none';
  document.getElementById('touch-jump-zone').classList.remove('active');
  document.getElementById('bot-badge').style.display='none';
  stopMusic();
  startBgAnimation(); // resume home screen bg
}

function togglePause(){
  if(!active)return;paused=!paused;
  if(paused){stopMusic();document.getElementById('pause-info').textContent=`SCORE: ${Math.floor(score)} | LEVEL: ${level}`;showScreen('pause-screen');}
  else{hideAllScreens();lastFrameTime=performance.now();if(!muted)startMusic();loop();}
}
function confirmQuit(){if(confirm('Quit current run?'))die(true);}

function setupTouchZone(){
  const z=document.getElementById('touch-jump-zone');
  z.addEventListener('touchstart',e=>{
    if(!active||paused||botMode)return;
    if(e.target.closest('.ctrl-btn')||e.target.id==='p-btn'||e.target.id==='vol-btn')return;
    e.preventDefault();
    if(ctrlMode==='tap')doJump();
    else if(ctrlMode==='swipe')swipeStartY=e.touches[0].clientY;
    else if(ctrlMode==='hold')holdingJump=true;
  },{passive:false});
  z.addEventListener('touchend',e=>{
    if(ctrlMode==='hold')holdingJump=false;
    if(ctrlMode==='swipe'&&e.changedTouches[0].clientY<swipeStartY-25)doJump();
  });
  z.addEventListener('pointerdown',e=>{if(!active||paused||botMode||e.pointerType!=='mouse')return;doJump();});
}

function doJump(){
  if(!active||paused||botMode)return;
  const s=modes[currentMode]||modes.NORMAL;
  if(player.dy>s.j*0.55){player.dy=boostTimer>0?s.j*1.25:s.j;sndJump();}
}
function mobileJump(e){e.preventDefault();e.stopPropagation();if(!botMode){doJump();if(ctrlMode==='hold')holdingJump=true;}}
function mobileJumpEnd(){holdingJump=false;}
function useShieldBtn(e){if(e){e.preventDefault();e.stopPropagation();}if(shieldCharges>0&&invTimer===0){shieldCharges--;invTimer=120;showNotif('🛡️ SHIELD!');updateArmorPips();}}
function useBoostBtn(e){if(e){e.preventDefault();e.stopPropagation();}if(boostTimer<=0){boostTimer=300;showNotif('⚡ BOOST!');}}

window.addEventListener('keydown',e=>{
  if(e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW'){e.preventDefault();if(active&&!paused&&!botMode)doJump();}
  if(e.code==='KeyP'||e.code==='Escape')togglePause();
  if(e.code==='KeyS'&&active&&!paused&&!botMode&&shieldCharges>0&&invTimer===0){shieldCharges--;invTimer=120;showNotif('🛡️ SHIELD!');updateArmorPips();}
  if(e.code==='KeyB'&&active&&!paused&&!botMode&&boostTimer<=0){boostTimer=300;showNotif('⚡ BOOST!');}
  if(e.code==='KeyM')toggleMute();
},{passive:false});

function updateBot(){
  if(!botMode||!active)return;
  botReactDelay=Math.max(0,botReactDelay-1);
  let nearX=999999,nearGapY=canvas.height/2;
  const pipes=obstacles.filter(o=>o.type==='pipe'&&o.x>player.x+10);
  if(pipes.length>=2){
    const firstX=Math.min(...pipes.map(o=>o.x));nearX=firstX;
    const top=pipes.find(o=>o.x===firstX&&o.y===0);const bot=pipes.find(o=>o.x===firstX&&o.y>10);
    if(top&&bot)nearGapY=top.h+((bot.y-top.h)/2);
    if(Math.random()<0.005){botPanic=true;nearGapY+=((Math.random()-.5)*140);botQuipText=BOT_QUIPS[Math.floor(Math.random()*BOT_QUIPS.length)];botQuipTimer=100;}else botPanic=false;
  }
  botTargetY=nearGapY;
  if(botReactDelay===0){
    botReactDelay=10+Math.floor(Math.random()*14);
    const dist=Math.max(1,nearX-player.x),spd=(modes.BOT.speed+level*0.07),timeFrames=dist/spd;
    const predY=player.y+player.dy*timeFrames+0.5*modes.BOT.grav*timeFrames*timeFrames;
    if(predY>botTargetY+16&&player.dy>-0.8){player.dy=modes.BOT.j+(botPanic?modes.BOT.j*0.25:0);sndJump();}
  }
  if(player.y<35&&player.dy<0)player.dy=0;
  if(botQuipTimer>0)botQuipTimer--;else if(frame%300===0)botQuipText=BOT_QUIPS[Math.floor(Math.random()*BOT_QUIPS.length)];
}

function renderPowerUpHUD(){
  const items=[];
  if(slowTimer>0)   items.push({icon:'⏱️',color:'#bf5fff',pct:slowTimer/600*100,label:'SLOW'});
  if(magnetTimer>0) items.push({icon:'🧲',color:'#ffd700',pct:magnetTimer/480*100,label:'MAGNET'});
  if(boostTimer>0)  items.push({icon:'⚡',color:'#39ff14',pct:boostTimer/300*100,label:'BOOST'});
  if(invTimer>0)    items.push({icon:'🛡️',color:'#00f2ff',pct:invTimer/120*100,label:'SHIELD'});
  document.getElementById('powerup-list').innerHTML=items.map(i=>`<div class="pu-item"><span>${i.icon}</span><span style="font-size:.46rem;letter-spacing:1px;">${i.label}</span><div class="pu-timer"><div class="pu-bar" style="width:${i.pct}%;background:${i.color};box-shadow:0 0 4px ${i.color};"></div></div></div>`).join('');
}
function updateArmorPips(){
  const el=document.getElementById('armor-pips');
  if(armor>=99||currentMode==='BABY'||currentMode==='ZEN'){el.innerHTML='<span style="font-size:.5rem;opacity:.5;">∞</span>';return;}
  const total=Math.max(3,armor+shieldCharges);
  el.innerHTML=Array.from({length:total},(_,i)=>`<div class="pip ${i<armor?'active':''}" style="${i>=armor&&i<armor+shieldCharges?'background:var(--purple);box-shadow:0 0 4px var(--purple);':''}"></div>`).join('');
}

// ── MAIN LOOP ──
function loop(){
  if(!active||paused)return;
  const now=performance.now();
  const dt=Math.min((now-lastFrameTime)/16.67,2.2);
  lastFrameTime=now;

  const s=modes[currentMode]||modes.NORMAL;
  const sMult=slowTimer>0?.44:(boostTimer>0?1.22:1);
  const effSpeed=(s.speed+level*0.065)*sMult*dt;
  const effGrav=s.grav*(1-(upgrades.gravity||0)*0.05)*dt;
  const effGap=Math.min(s.gap+(upgrades.gap||0)*8,canvas.height-80);

  if(invTimer>0)invTimer-=dt;if(slowTimer>0)slowTimer-=dt;if(magnetTimer>0)magnetTimer-=dt;if(boostTimer>0)boostTimer-=dt;
  bgThemeTick+=dt;if(bgThemeTick>320){bgThemeTick=0;bgThemeIdx=(bgThemeIdx+1)%BG_THEMES.length;}

  if(botMode)updateBot();

  if(ctrlMode==='hold'&&holdingJump&&!botMode)player.dy=Math.max(player.dy-0.32*dt,s.j*0.78);
  player.dy+=effGrav;player.dy=Math.min(player.dy,11);player.y+=player.dy*dt;

  if(upgrades.trail){
    player.trail.push({x:player.x+player.w/2,y:player.y+player.h/2,t:1});
    if(player.trail.length>18)player.trail.shift();
    player.trail.forEach(t=>t.t-=0.055*dt);
  }

  if(armor>=99){
    if(player.y>canvas.height-65){player.dy=s.j*0.85;spawnParticles(player.x,canvas.height-65,5,'#39ff14');}
    if(player.y<18){player.y=18;player.dy=0;}
  } else {
    if(player.y>canvas.height+30||player.y<-30){die();return;}
  }

  score+=0.15*sMult*dt;gameTime=(Date.now()-startTime)/1000;

  const newLvl=Math.floor(score/180)+1;
  if(newLvl>level){
    level=newLvl;
    if(armor<99&&currentMode!=='PRO'&&!botMode)armor++;
    updateArmorPips();showNotif('LEVEL '+level+' 🔥');sndLevelUp();
    spawnParticles(player.x,player.y,22,skinData().color);screenShake(4);
    bgThemeIdx=(bgThemeIdx+1)%BG_THEMES.length;bgThemeTick=0;
    if(targetLevel>0&&level>=targetLevel&&!botMode){winGame();return;}
  }

  const spawnInt=Math.max(56,84-level*2);
  if(frame%spawnInt===0){
    const gap=Math.max(effGap,100);
    const rY=Math.random()*(canvas.height-gap-90)+45;
    const pc=PIPE_COLORS[level%PIPE_COLORS.length];
    obstacles.push(
      {x:canvas.width+8,y:0,     w:50,h:rY,              passed:false,type:'pipe',color:pc},
      {x:canvas.width+8,y:rY+gap,w:50,h:canvas.height,   passed:false,type:'pipe',color:pc}
    );
    if(level>=4&&Math.random()<0.20){
      const bc=PIPE_COLORS[(level+3)%PIPE_COLORS.length];
      obstacles.push({x:canvas.width+8,y:Math.random()*(canvas.height-80)+40,w:34,h:34,dy:(Math.random()-0.5)*2.2,type:'ball',passed:false,color:bc});
    }
    if(Math.random()<0.32)spawnPowerUp(canvas.width+8);
  }

  for(let i=obstacles.length-1;i>=0;i--){
    const o=obstacles[i];o.x-=effSpeed;
    if(o.type==='ball'){o.y+=o.dy*dt;if(o.y<0||o.y>canvas.height-34)o.dy*=-1;}
    if(!o.passed&&o.x+o.w<player.x){
      o.passed=true;
      if(o.type==='pipe'){
        combo++;if(combo>maxCombo)maxCombo=combo;
        const cr=(upgrades.coins?2:1)+Math.floor(combo/5);
        coins+=cr;sessionCoins+=cr;spawnFloatScore('+'+cr+'💰',player.x,player.y-26);sndScore();
        if(combo>=3){showCombo();sndCombo();}
      }
    }
    if(invTimer<=0){
      let hit=false;
      if(o.type==='ball'){const cx=player.x+player.w/2,cy=player.y+player.h/2,ox=o.x+o.w/2,oy=o.y+o.h/2,dx=cx-ox,dy=cy-oy;hit=Math.sqrt(dx*dx+dy*dy)<(player.w/2+o.w/2-3);}
      else{hit=(player.x+3<o.x+o.w)&&(player.x+player.w-3>o.x)&&(player.y+3<o.y+o.h)&&(player.y+player.h-3>o.y);}
      if(hit){
        if(armor>=99){invTimer=55;combo=0;obstacles.length=0;player.dy=s.j*0.7;screenShake(5);spawnParticles(player.x,player.y,12,skinData().color);sndHit();showNotif(currentMode==='ZEN'?'💫 PHASED!':'🍼 BOUNCE!');break;}
        else if(armor>0){invTimer=85;armor--;combo=0;obstacles.length=0;updateArmorPips();screenShake(9);spawnParticles(player.x,player.y,20,skinData().color);sndHit();showNotif('💥 ARMOR LOST!');if(botMode){botQuipText='OUCH!';botQuipTimer=70;}break;}
        else{die();return;}
      }
    }
    if(o.x<-110)obstacles.splice(i,1);
  }

  for(let i=powerUps.length-1;i>=0;i--){
    const p=powerUps[i];p.x-=effSpeed;p.angle=(p.angle||0)+0.05*dt;
    if(magnetTimer>0){const dx=player.x-p.x,dy=player.y-p.y,d=Math.sqrt(dx*dx+dy*dy);if(d<200){p.x+=dx/d*7*dt;p.y+=dy/d*7*dt;}}
    const hit=player.x<p.x+p.r&&player.x+player.w>p.x-p.r&&player.y<p.y+p.r&&player.y+player.h>p.y-p.r;
    if(hit){applyPowerUp(p.kind);spawnParticles(p.x,p.y,13,p.color);powerUps.splice(i,1);sndPowerUp();}
    else if(p.x<-65)powerUps.splice(i,1);
  }

  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=0.11*dt;p.life-=0.022*dt;
    if(p.life<=0)particles.splice(i,1);
  }
  for(let i=floatScores.length-1;i>=0;i--){floatScores[i].life-=0.013*dt;if(floatScores[i].life<=0)floatScores.splice(i,1);}

  updateMissions();renderPowerUpHUD();
  document.getElementById('ui-score').textContent=Math.floor(score);
  document.getElementById('ui-lvl').textContent=targetLevel>0?(level+' / '+targetLevel):level;
  document.getElementById('score-bar').style.width=((score%180)/180*100)+'%';

  draw();frame++;
  loopId=requestAnimationFrame(loop);
}

function spawnPowerUp(x){
  const kinds=[{kind:'slow',color:'#bf5fff',icon:'⏱️'},{kind:'magnet',color:'#ffd700',icon:'🧲'},{kind:'armor',color:'#00f2ff',icon:'🛡️'},{kind:'coin',color:'#ffd700',icon:'💰'},{kind:'boost',color:'#39ff14',icon:'⚡'}];
  const w=[upgrades.slow?2:1,1,armor<99?1:0,(upgrades.coins?2:1),1];
  let pool=[];kinds.forEach((k,i)=>{for(let n=0;n<(w[i]||0);n++)pool.push(k);});
  if(!pool.length)pool=kinds;
  const pick=pool[Math.floor(Math.random()*pool.length)];
  powerUps.push({x,y:Math.random()*(canvas.height-110)+55,r:13,...pick,angle:0});
}
function applyPowerUp(kind){
  if(kind==='slow')  {slowTimer=600+(upgrades.slow||0)*150;showNotif('⏱️ SLOW TIME!');}
  if(kind==='magnet'){magnetTimer=480;showNotif('🧲 MAGNET!');}
  if(kind==='armor') {if(armor<99){armor=Math.min(armor+1,10);updateArmorPips();}showNotif('🛡️ ARMOR +1!');}
  if(kind==='coin')  {const a=20*(upgrades.coins?2:1);coins+=a;sessionCoins+=a;showNotif('💰 +'+a+' COINS!');spawnFloatScore('+'+a+'💰',player.x,player.y-26);}
  if(kind==='boost') {boostTimer=300;showNotif('⚡ BOOST!');}
}

function spawnParticles(x,y,n,color){
  if(!settings.particles)return;
  for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,sp=Math.random()*4+.8;particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,color,life:1,size:Math.random()*3+.8});}
}
function spawnFloatScore(text,x,y){floatScores.push({text,x,y,life:1});}
function showCombo(){const el=document.getElementById('combo-display');el.textContent=combo+'x COMBO!';el.style.opacity='1';setTimeout(()=>el.style.opacity='0',900);}

let shakeAmt=0;
function screenShake(a){if(settings.screenShake)shakeAmt=a;}
function skinData(){return skinList.find(s=>s.id===currentSkin)||skinList[0];}

// ── DRAW (all on gameCanvas) ──
function draw(){
  ctx.save();
  if(shakeAmt>0){ctx.translate((Math.random()-.5)*shakeAmt,(Math.random()-.5)*shakeAmt);shakeAmt*=0.8;if(shakeAmt<0.4)shakeAmt=0;}

  const th=BG_THEMES[bgThemeIdx];
  ctx.fillStyle=th.sky;ctx.fillRect(0,0,canvas.width,canvas.height);
  const g=ctx.createRadialGradient(canvas.width*.5,canvas.height*.5,0,canvas.width*.5,canvas.height*.5,canvas.width*.75);
  g.addColorStop(0,th.h1);g.addColorStop(1,'transparent');
  ctx.fillStyle=g;ctx.fillRect(0,0,canvas.width,canvas.height);

  if(settings.bgStars&&bgStars.length){
    bgStars.forEach(s=>{
      s.x-=s.speed*(slowTimer>0?.28:1);if(s.x<0)s.x=canvas.width;
      ctx.globalAlpha=s.a*(0.55+Math.sin(bgFrame*.016+s.y*.01)*0.45);
      ctx.fillStyle=s.color||'#fff';ctx.fillRect(s.x,s.y,s.size,s.size);
    });ctx.globalAlpha=1;
  }

  particles.forEach(p=>{
    ctx.globalAlpha=Math.max(0,p.life);ctx.shadowBlur=6;ctx.shadowColor=p.color;ctx.fillStyle=p.color;
    ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();
  });ctx.globalAlpha=1;ctx.shadowBlur=0;

  const skin=skinData(),c=skin.color;
  if(upgrades.trail&&player.trail.length){
    player.trail.forEach((t,i)=>{
      ctx.globalAlpha=Math.max(0,t.t*0.5);ctx.shadowBlur=9;ctx.shadowColor=c;ctx.fillStyle=c;
      const sz=(i/player.trail.length)*player.w;ctx.fillRect(t.x-sz/2,t.y-sz/2,sz,sz);
    });ctx.globalAlpha=1;ctx.shadowBlur=0;
  }

  obstacles.forEach(o=>{
    const oc=o.color||'#ff2d55';ctx.shadowBlur=16;ctx.shadowColor=oc;ctx.fillStyle=oc;
    if(o.type==='ball'){
      ctx.beginPath();ctx.arc(o.x+o.w/2,o.y+o.w/2,o.w/2,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.globalAlpha=.3;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(o.x+o.w*.32,o.y+o.h*.28,o.w*.15,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    } else {
      ctx.fillRect(o.x,o.y,o.w,o.h);ctx.fillRect(o.x-4,o.y+(o.h<canvas.height/2?o.h-8:-8),o.w+8,10);
      ctx.shadowBlur=0;ctx.globalAlpha=.12;ctx.fillStyle='#fff';
      for(let ss=0;ss<o.h;ss+=18)ctx.fillRect(o.x+2,o.y+ss,o.w-4,7);ctx.globalAlpha=1;
    }
    ctx.shadowBlur=0;
  });

  powerUps.forEach(p=>{
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
    ctx.shadowBlur=16;ctx.shadowColor=p.color;ctx.fillStyle=p.color+'44';ctx.strokeStyle=p.color;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(0,0,p.r,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.font=(p.r*1.12)+'px serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(p.icon,0,0);
    ctx.restore();
  });

  floatScores.forEach(f=>{
    ctx.globalAlpha=Math.max(0,f.life);ctx.font="bold 12px 'Orbitron',sans-serif";ctx.fillStyle='#ffd700';ctx.textAlign='center';
    ctx.fillText(f.text,f.x,f.y-(1-f.life)*42);
  });ctx.globalAlpha=1;ctx.textAlign='left';

  ctx.globalAlpha=.07;ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,2);ctx.fillRect(0,canvas.height-2,canvas.width,2);ctx.globalAlpha=1;

  ctx.shadowBlur=invTimer>0?26:16;ctx.shadowColor=invTimer>0?'#fff':c;
  const flicker=invTimer>0&&Math.floor(frame/4)%2===0;
  if(!flicker){
    ctx.fillStyle=c;
    if(skin.shape==='round'){ctx.beginPath();ctx.arc(player.x+player.w/2,player.y+player.h/2,player.w/2,0,Math.PI*2);ctx.fill();}
    else if(skin.shape==='diamond'){ctx.save();ctx.translate(player.x+player.w/2,player.y+player.h/2);ctx.rotate(Math.PI/4);ctx.fillRect(-player.w/2,-player.h/2,player.w,player.h);ctx.restore();}
    else if(skin.shape==='star'){drawStar(ctx,player.x+player.w/2,player.y+player.h/2,5,player.w/2,player.w/4);}
    else ctx.fillRect(player.x,player.y,player.w,player.h);
    ctx.shadowBlur=0;ctx.globalAlpha=.28;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(player.x+player.w*.28,player.y+player.h*.24,player.w*.12,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  }
  ctx.shadowBlur=0;

  if(botMode&&botQuipText&&botQuipTimer>0){
    ctx.save();ctx.globalAlpha=Math.min(1,botQuipTimer/20);ctx.font="bold 11px 'Orbitron',sans-serif";
    ctx.fillStyle='#bf5fff';ctx.textAlign='center';ctx.shadowBlur=8;ctx.shadowColor='#bf5fff';
    ctx.fillText(botQuipText,player.x+player.w/2,player.y-22);ctx.restore();
  }
  ctx.restore();
}

function drawStar(ctx,cx,cy,pts,or,ir){
  ctx.beginPath();
  for(let i=0;i<pts*2;i++){const r=i%2===0?or:ir,a=Math.PI/pts*i-Math.PI/2;i===0?ctx.moveTo(cx+r*Math.cos(a),cy+r*Math.sin(a)):ctx.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));}
  ctx.closePath();ctx.fill();
}

function winGame(){
  if(!active)return;active=false;won=true;cancelAnimationFrame(loopId);loopId=null;stopMusic();
  const fs=Math.floor(score),isNew=fs>bestScore;
  if(isNew){bestScore=fs;localStorage.setItem('nn_best',bestScore);}
  document.getElementById('death-title-txt').textContent='🏆 GOAL REACHED!';
  const nm=document.getElementById('hud-name').textContent;
  leaderboard.push({name:nm,score:fs,level,mode:currentMode,time:Math.floor(gameTime)});
  leaderboard.sort((a,b)=>b.score-a.score);if(leaderboard.length>20)leaderboard.length=20;
  coins+=sessionCoins;
  const m1=missions.find(m=>m.id==='m1');if(m1&&!m1.done){m1.prog=1;m1.done=true;coins+=m1.reward;}
  document.getElementById('death-msg').textContent=nm+' CLEARED LEVEL '+targetLevel+'!';
  save();
  sndLevelUp();spawnParticles(player.x,player.y,40,skinData().color);screenShake(6);
  document.getElementById('d-score').textContent=fs;document.getElementById('d-level').textContent=level;
  document.getElementById('d-best').textContent=bestScore;
  document.getElementById('d-coins').textContent=sessionCoins;
  document.getElementById('d-time').textContent=Math.floor(gameTime)+'s';document.getElementById('d-combo').textContent=maxCombo+'x';
  document.getElementById('new-best-badge').style.display=isNew?'block':'none';
  showScreen('death-screen');renderLeaderboard();renderMissions();renderShop();
}

function die(quit=false){
  if(!active)return;active=false;cancelAnimationFrame(loopId);loopId=null;stopMusic();
  const fs=Math.floor(score),isNew=fs>bestScore;
  if(isNew&&!botMode){bestScore=fs;localStorage.setItem('nn_best',bestScore);}
  if(botMode){
    botStats.fails++;botStats.total+=fs;if(fs>botStats.best)botStats.best=fs;renderBotStats();save();
    document.getElementById('death-title-txt').textContent='BOT CRASHED! 🤖';
    document.getElementById('death-msg').textContent='"I\'ll do better next time..." — Bot';
  } else {
    document.getElementById('death-title-txt').textContent='MISSION FAILED';
    const nm=document.getElementById('hud-name').textContent;
    leaderboard.push({name:nm,score:fs,level,mode:currentMode,time:Math.floor(gameTime)});
    leaderboard.sort((a,b)=>b.score-a.score);if(leaderboard.length>20)leaderboard.length=20;
    coins+=sessionCoins;
    const m1=missions.find(m=>m.id==='m1');if(m1&&!m1.done){m1.prog=1;m1.done=true;coins+=m1.reward;}
    document.getElementById('death-msg').textContent=document.getElementById('hud-name').textContent+' REACHED LEVEL '+level;
    save();
  }
  sndDie();
  document.getElementById('d-score').textContent=fs;document.getElementById('d-level').textContent=level;
  document.getElementById('d-best').textContent=botMode?Math.floor(botStats.best):bestScore;
  document.getElementById('d-coins').textContent=sessionCoins;
  document.getElementById('d-time').textContent=Math.floor(gameTime)+'s';document.getElementById('d-combo').textContent=maxCombo+'x';
  document.getElementById('new-best-badge').style.display=(isNew&&!botMode)?'block':'none';
  showScreen('death-screen');renderLeaderboard();renderMissions();renderShop();
  if(botMode)setTimeout(()=>{if(!active)relaunch();},3200);
}

// BG STARS
let bgStars=[],bgFrame=0;
const STAR_COLORS=['#fff','#00f2ff','#ff2d55','#ffd700','#bf5fff','#39ff14','#ff6b00'];
function initStars(){
  bgStars=Array.from({length:130},()=>({
    x:Math.random()*window.innerWidth,y:Math.random()*window.innerHeight,
    size:Math.random()*2+.4,a:Math.random()*.5+.08,speed:Math.random()*1.3+.25,
    color:STAR_COLORS[Math.floor(Math.random()*STAR_COLORS.length)]
  }));
}

// HOME SCREEN BG ANIMATION — runs ONLY when game is not active
function startBgAnimation(){
  if(bgLoopId)return;
  bgLoopId=requestAnimationFrame(bgAnimLoop);
}
function stopBgAnimation(){
  if(bgLoopId){cancelAnimationFrame(bgLoopId);bgLoopId=null;}
}
function bgAnimLoop(){
  if(active){bgLoopId=null;return;}
  pCtx.clearRect(0,0,pCanvas.width,pCanvas.height);
  pCtx.fillStyle=BG_THEMES[0].sky;pCtx.fillRect(0,0,pCanvas.width,pCanvas.height);
  const gg=pCtx.createRadialGradient(pCanvas.width*.5,pCanvas.height*.5,0,pCanvas.width*.5,pCanvas.height*.5,pCanvas.width*.7);
  gg.addColorStop(0,BG_THEMES[0].h1);gg.addColorStop(1,'transparent');
  pCtx.fillStyle=gg;pCtx.fillRect(0,0,pCanvas.width,pCanvas.height);
  if(settings.bgStars){
    bgStars.forEach(s=>{
      s.x-=s.speed*.4;if(s.x<0)s.x=pCanvas.width;
      pCtx.globalAlpha=s.a*(0.55+Math.sin(bgFrame*.016)*0.45);
      pCtx.fillStyle=s.color;pCtx.fillRect(s.x,s.y,s.size,s.size);
    });pCtx.globalAlpha=1;
  }
  bgFrame++;bgLoopId=requestAnimationFrame(bgAnimLoop);
}

function resizeAll(){
  canvas.width=window.innerWidth;canvas.height=window.innerHeight;
  pCanvas.width=window.innerWidth;pCanvas.height=window.innerHeight;
  if(active&&player.y>canvas.height)player.y=canvas.height*.5;
  initStars();
}
window.addEventListener('resize',resizeAll);
screen.orientation&&screen.orientation.addEventListener('change',()=>setTimeout(resizeAll,120));

window.onload=init;
