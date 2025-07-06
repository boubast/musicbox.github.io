document.addEventListener('DOMContentLoaded', () => {

/* ---------- CONFIG ---------- */
// Détecter la musique active depuis l'URL ou l'état de navigation
let currentMusic = 'music1';
const activeNavItem = document.querySelector('.nav-item.active');
if (activeNavItem) {
  currentMusic = activeNavItem.dataset.music;
}

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
const catDiv=document.getElementById('categories');
const hud=document.getElementById('cycleHUD');
const themeBtn=document.getElementById('themeBtn');
const navItems=document.querySelectorAll('.nav-item');

/* ---------- THEME toggle ---------- */
const root=document.documentElement;
if(matchMedia('(prefers-color-scheme: light)').matches) root.classList.add('light');
themeBtn.onclick=()=>root.classList.toggle('light');

/* ---------- NAVIGATION ---------- */
navItems.forEach(item=>{
  item.onclick=()=>{
    if(item.classList.contains('disabled')) return;
    const newMusic=item.dataset.music;
    if(newMusic!==currentMusic){
      // Stocker la sélection avant de recharger
      sessionStorage.setItem('selectedMusic', newMusic);
      location.reload();
    }
  };
});

// Restaurer la sélection après rechargement
const savedMusic = sessionStorage.getItem('selectedMusic');
if (savedMusic) {
  currentMusic = savedMusic;
  navItems.forEach(n=>n.classList.remove('active'));
  const targetItem = document.querySelector(`[data-music="${savedMusic}"]`);
  if (targetItem) targetItem.classList.add('active');
  sessionStorage.removeItem('selectedMusic');
}

/* ---------- Global vars ---------- */
let ctx,buffers={},tracks=[],meter,current={},longest=0;
let recorder,recordedBlob,isRecording=false;
let meloCounter=0; // Pour Music 2

/* ---------- Show ready state ---------- */
loader.remove(); playBtn.disabled=false; playBtn.textContent='▶ Start';

/* ---------- Build interface (visual only) ---------- */
const sections={};
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
    const x = (e.clientX - r.left) / r.width  - .5;
    const y = (e.clientY - r.top)  / r.height - .5;
    const rotateX = (-y * 10).toFixed(2);
    const rotateY = ( x * 10).toFixed(2);
    pad.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
  });
  pad.addEventListener('mouseleave', ()=>{
    pad.style.transform = '';
  });

  tracks.push({cat,pad,file:f});
});

/* ---------- Charger Tone.js dynamiquement ---------- */
function loadTone(){
  return new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/tone@14.8.39/build/Tone.min.js';
    script.onload=resolve;
    script.onerror=reject;
    document.head.appendChild(script);
  });
}

/* ---------- Start ---------- */
playBtn.onclick=async()=>{
  playBtn.disabled=true;
  playBtn.textContent='Loading Tone.js...';
  
  // Charger Tone.js APRÈS l'interaction utilisateur
  await loadTone();
  await Tone.start();
  ctx=Tone.getContext().rawContext;
  
  playBtn.textContent='Loading samples...';
  
  /* Helpers */
  function trimTail(buf,thr=.01){
    const sr=buf.sampleRate,ch=buf.numberOfChannels;let end=buf.length-1;
    search:for(;end>0;end--){for(let c=0;c<ch;c++){if(Math.abs(buf.getChannelData(c)[end])>thr)break search;}}
    const out=ctx.createBuffer(ch,end+1,sr);
    for(let c=0;c<ch;c++)out.copyToChannel(buf.getChannelData(c).subarray(0,end+1),c);
    return out;
  }
  
  /* Load buffers */
  for(const f of FILES){
    buffers[f]=await new Promise(res=>new Tone.Buffer(`samples/${currentMusic}/${f}`,b=>res(b)));
    buffers[f]=trimTail(buffers[f]);
    longest=Math.max(longest,buffers[f].duration);
  }
  
  /* Setup audio */
  meter=new Tone.Meter({channels:1,smoothing:0.8});
  Tone.getDestination().connect(meter);
  
  /* Create players */
  tracks.forEach(t=>{
    const src=buffers[t.file],ch=src.numberOfChannels,sr=src.sampleRate;
    const len=Math.round(longest*sr);
    const buf=(src.length===len)?src:(()=>{const b=ctx.createBuffer(ch,len,sr);for(let c=0;c<ch;c++)b.copyToChannel(src.getChannelData(c),c);return b;})();
    const gain=new Tone.Gain(0).toDestination();
    const player=new Tone.Player(buf).connect(gain);
    player.loop=true;player.sync().start(0);
    t.gain=gain;
  });
  
  /* Pad toggle */
  function toggle(t){
    const cat=t.cat,now=Tone.now();
    
    // Règles spéciales pour Music 2 (2 melo max)
    if(currentMusic==='music2' && cat==='melo'){
      const trackKey='melo_'+t.file;
      const activeMelos=Object.keys(current).filter(key=>key.startsWith('melo_')).length;
      
      if(current[trackKey]){
        // Désactiver ce pad
        t.gain.gain.linearRampTo(0,.05,now);
        t.pad.classList.remove('active');
        delete current[trackKey];
      }else if(activeMelos<2){
        // Activer ce pad si moins de 2 melos actifs
        t.gain.gain.linearRampTo(1,.05,now);
        t.pad.classList.add('active');
        current[trackKey]=t;
      }
      return;
    }
    
    // Règles normales pour les autres catégories
    if(current[cat]===t){
      t.gain.gain.linearRampTo(0,.05,now);
      t.pad.classList.remove('active');
      current[cat]=null;
    }else{
      if(current[cat]){
        current[cat].gain.gain.linearRampTo(0,.05,now);
        current[cat].pad.classList.remove('active');
      }
      t.gain.gain.linearRampTo(1,.05,now);
      t.pad.classList.add('active');
      current[cat]=t;
    }
  }
  tracks.forEach(t=>t.pad.onclick=()=>toggle(t));
  
  /* Animations */
  function reactiveGlow(){
    const lvl=meter.getValue();
    const norm=Math.max(0,(lvl+60)/60);
    tracks.forEach(t=>{
      if(t.pad.classList.contains('active')){
        t.pad.style.setProperty('--lvl',norm.toFixed(2));
      }
    });
    requestAnimationFrame(reactiveGlow);
  }
  
  function loopHUD(){
    const deg=(Tone.Transport.seconds%longest)/longest*360;
    hud.style.background=`conic-gradient(var(--accent) ${deg}deg,transparent 0deg)`;
    requestAnimationFrame(loopHUD);
  }
  
  /* Master volume */
  document.getElementById('masterVol').addEventListener('input',e=>{
    Tone.getDestination().volume.value=e.target.value;
  });
  
  /* Recording setup */
  recorder=new Tone.Recorder();
  Tone.getDestination().connect(recorder);
  
  const recordBtn=document.getElementById('recordBtn');
  const audioPlayer=document.getElementById('audioPlayer');
  const saveBtn=document.getElementById('saveBtn');
  
  // Fonction pour désactiver tous les pads
  function stopAllPads(){
    tracks.forEach(t=>{
      if(t.pad.classList.contains('active')){
        t.gain.gain.linearRampTo(0,.05,Tone.now());
        t.pad.classList.remove('active');
      }
    });
    current={};
    meloCounter=0;
  }
  
  recordBtn.onclick=async()=>{
    if(!isRecording){
      await recorder.start();
      isRecording=true;
      recordBtn.textContent='⏹ Stop';
      recordBtn.classList.add('recording');
      audioPlayer.style.display='none';
      saveBtn.disabled=true;
    }else{
      recordedBlob=await recorder.stop();
      isRecording=false;
      recordBtn.textContent='🔴 Record';
      recordBtn.classList.remove('recording');
      
      const url=URL.createObjectURL(recordedBlob);
      audioPlayer.src=url;
      audioPlayer.style.display='block';
      audioPlayer.disabled=false;
      saveBtn.disabled=false;
    }
  };
  
  // Désactiver les pads quand on joue l'enregistrement
  audioPlayer.onplay=()=>stopAllPads();
  
  saveBtn.onclick=async()=>{
    if(recordedBlob){
      // Convertir WAV en MP3 (simulation - en réalité on garde le WAV)
      const url=URL.createObjectURL(recordedBlob);
      const a=document.createElement('a');
      a.href=url;
      a.download=`musicbox-${Date.now()}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };
  
  Tone.Transport.start();
  overlay.remove();
  requestAnimationFrame(loopHUD);
  requestAnimationFrame(reactiveGlow);
};

});