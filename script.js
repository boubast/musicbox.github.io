document.addEventListener('DOMContentLoaded', async () => {

  
/* ---------- CONFIG ---------- */
const FILES=[ "Bass_1.wav","Bass_2.wav","Bass_3.wav","Bass_4.wav","Bass_5.wav",
              "Drum_1.wav","Drum_2.wav","Drum_3.wav","Drum_4.wav","Drum_5.wav",
              "Melo_1.wav","Melo_2.wav","Melo_3.wav","Melo_4.wav","Melo_5.wav" ];
const ICON_SVG={
  bass:`<svg viewBox="0 0 24 24" width="28"><path fill="currentColor" d="M4 12h16v2H4z"/></svg>`,
  drum:`<svg viewBox="0 0 24 24" width="28"><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>`,
  melo:`<svg viewBox="0 0 24 24" width="28"><rect x="6" y="4" width="2" height="16" fill="currentColor"/><rect x="16" y="4" width="2" height="16" fill="currentColor"/></svg>`
};
const DISPLAY_CAT={bass:"Bass",drum:"Drum",melo:"Keys"};

/* ---------- DOM ---------- */
const overlay=document.getElementById('startOverlay');
const loader=document.getElementById('loader');
const playBtn=document.getElementById('playBtn');
const loadRing=document.getElementById('loadRing');
const loadTxt=document.getElementById('loadTxt');
const catDiv=document.getElementById('categories');
const hud=document.getElementById('cycleHUD');
const themeBtn=document.getElementById('themeBtn');

/* ---------- THEME toggle ---------- */
const root=document.documentElement;
if(matchMedia('(prefers-color-scheme: light)').matches) root.classList.add('light');
themeBtn.onclick=()=>root.classList.toggle('light');

/* ---------- Helpers ---------- */
const ctx=Tone.getContext().rawContext;
function trimTail(buf,thr=.01){
  const sr=buf.sampleRate,ch=buf.numberOfChannels;let end=buf.length-1;
  search:for(;end>0;end--){for(let c=0;c<ch;c++){if(Math.abs(buf.getChannelData(c)[end])>thr)break search;}}
  const out=ctx.createBuffer(ch,end+1,sr);
  for(let c=0;c<ch;c++)out.copyToChannel(buf.getChannelData(c).subarray(0,end+1),c);
  return out;
}

/* ---------- Load buffers ---------- */
const buffers={},tracks=[];let loaded=0,longest=0;
for(const f of FILES){
  buffers[f]=await new Promise(res=>new Tone.Buffer(`samples/${f}`,b=>res(b)));
  buffers[f]=trimTail(buffers[f]);
  longest=Math.max(longest,buffers[f].duration);
  loaded++; const pct=Math.round(loaded/FILES.length*100);
  loadRing.style.transform=`rotate(${pct*3.6}deg)`;loadTxt.textContent=`Chargement… ${pct} %`;
}
loader.remove(); playBtn.disabled=false; playBtn.textContent='▶ Start';

/* ---------- Build interface & players ---------- */
const meter=new Tone.Meter({channels:1,smoothing:0.8});
Tone.getDestination().connect(meter);

const sections={},current={};
FILES.forEach(f=>{
  const cat=f.split('_')[0].toLowerCase();

  /* section */
  if(!sections[cat]){
    const s=document.createElement('section');s.className='category';
    s.innerHTML=`<h2 class="catTitle">${DISPLAY_CAT[cat]}</h2><div class="pads"></div>`;
    sections[cat]=s.querySelector('.pads');catDiv.appendChild(s);
  }

  /* pad */
  const pad=document.createElement('div');pad.className='pad';
  const label=f.replace('.wav','').replace('_',' ');
  pad.innerHTML=`<div class="emoji">${ICON_SVG[cat]}</div><div class="lab">${label}</div>`;
  sections[cat].appendChild(pad);

  /* ---- Effet tilt suivant la souris ---- */
  pad.addEventListener('mousemove', e=>{
    const r = pad.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - .5;   // -0.5 → 0.5
    const y = (e.clientY - r.top)  / r.height - .5;
    const rotateX = (-y * 10).toFixed(2);  // amplitude 10°
    const rotateY = ( x * 10).toFixed(2);
    pad.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
  });
  pad.addEventListener('mouseleave', ()=>{
    pad.style.transform = '';              // remet à plat
  });

  /* buffer aligné */
  const src=buffers[f],ch=src.numberOfChannels,sr=src.sampleRate;
  const len=Math.round(longest*sr);
  const buf=(src.length===len)?src:(()=>{const b=ctx.createBuffer(ch,len,sr);for(let c=0;c<ch;c++)b.copyToChannel(src.getChannelData(c),c);return b;})();
  const gain=new Tone.Gain(0).toDestination();
  const player=new Tone.Player(buf).connect(gain);
  player.loop=true;player.sync().start(0);

  tracks.push({cat,pad,gain});
});

/* ---------- Pad toggle ---------- */
tracks.forEach(t=>t.pad.onclick=()=>toggle(t));
function toggle(t){
  const cat=t.cat,now=Tone.now();
  if(current[cat]===t){
    t.gain.gain.linearRampTo(0,.05,now);t.pad.classList.remove('active');current[cat]=null;
  }else{
    if(current[cat]){current[cat].gain.gain.linearRampTo(0,.05,now);current[cat].pad.classList.remove('active');}
    t.gain.gain.linearRampTo(1,.05,now);t.pad.classList.add('active');current[cat]=t;
  }
}

/* ---------- Audio-reactive glow (Meter) ---------- */
function reactiveGlow(){
  const lvl=meter.getValue();      // RMS ≈ -∞ … 0
  const norm=Math.max(0,(lvl+60)/60); // 0..1
  tracks.forEach(t=>{
    if(t.pad.classList.contains('active')){
      t.pad.style.setProperty('--lvl',norm.toFixed(2));
    }
  });
  requestAnimationFrame(reactiveGlow);
}

/* ---------- HUD cycle anim ---------- */
function loopHUD(){
  const deg=(Tone.Transport.seconds%longest)/longest*360;
  hud.style.background=`conic-gradient(var(--accent) ${deg}deg,transparent 0deg)`;
  requestAnimationFrame(loopHUD);
}

/* ---------- Start ---------- */
playBtn.onclick=async()=>{
  await Tone.start();
  Tone.Transport.start();
  overlay.remove();
  requestAnimationFrame(loopHUD);
  requestAnimationFrame(reactiveGlow);
};

/* ---------- Master volume ---------- */
document.getElementById('masterVol').addEventListener('input',e=>{
  Tone.getDestination().volume.value=e.target.value;
});

});
