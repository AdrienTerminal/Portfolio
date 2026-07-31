/* ==================================================================
   0) SONS — retravaillés en plus sourd / plus "signal radio parasité"
      pour coller à l'ambiance, toujours synthétisés à la volée.
================================================================== */
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let actx = null;

function getAudioContext(){
  if(!actx) actx = new AudioCtx();
  if(actx.state === "suspended") actx.resume();
  return actx;
}

function blip({ freqStart, freqEnd = freqStart, duration = 0.09, type = "square", gain = 0.045 }){
  try{
    const c = getAudioContext();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, c.currentTime);
    if(freqEnd !== freqStart){
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), c.currentTime + duration);
    }
    g.gain.setValueAtTime(gain, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + duration + 0.02);
  }catch(err){ /* audio non disponible, on ignore silencieusement */ }
}

const sfx = {
  tab:    () => blip({ freqStart:180, freqEnd:120,  duration:0.09, type:"sawtooth", gain:0.035 }),
  open:   () => blip({ freqStart:90,  freqEnd:260,  duration:0.28, type:"sawtooth", gain:0.05  }),
  close:  () => blip({ freqStart:260, freqEnd:70,   duration:0.22, type:"sawtooth", gain:0.05  }),
  select: () => blip({ freqStart:520, freqEnd:180,  duration:0.12, type:"square",   gain:0.04  }),
  scroll: () => blip({ freqStart:340, freqEnd:300,  duration:0.03, type:"square",   gain:0.02  }),
};


/* ==================================================================
   1) ONGLETS "Projects" / "About me"
================================================================== */
const cardEl = document.getElementById("card");
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel-view");

let aboutPeekPlayed = false;

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    if(tab.classList.contains("is-active")) return;
    tabs.forEach(t => t.classList.remove("is-active"));
    panels.forEach(p => p.classList.remove("is-active"));
    tab.classList.add("is-active");
    document.querySelector(`.panel-view[data-panel="${tab.dataset.tab}"]`).classList.add("is-active");
    cardEl.classList.toggle("is-about", tab.dataset.tab === "about");
    sfx.tab();

    if(tab.dataset.tab === "about" && !aboutPeekPlayed){
      aboutPeekPlayed = true;
      window.setTimeout(playAboutPeekSequence, 500);
    }
  });
});


/* ==================================================================
   2) PROJETS — la fermeture/ouverture d'un tiroir passe par un
      balayage d'éclats façon kaléidoscope : l'écran se couvre
      d'éclats rouges, le contenu change pendant qu'il est masqué,
      puis les éclats se retirent pour révéler le nouveau projet.
      La protection anti-spam reste la même : pendant le balayage,
      un clic ne fait que mettre à jour la destination visée.
================================================================== */
const COVER_MS   = 260;
const UNCOVER_MS = 340;
const SHARD_COUNT = 10;

const pills   = document.querySelectorAll(".pill");
const drawers = document.querySelectorAll(".project-drawer");
const stageFrame = document.getElementById("projectsStage");

let openId = null;
let isAnimating = false;
let pendingId = undefined;

function setPillActive(id){
  pills.forEach(p => p.classList.toggle("is-active", p.dataset.project === id));
}

function resetDrawerScroll(id){
  const drawer = document.querySelector(`.project-drawer[data-drawer="${id}"]`);
  drawer?._scrollApi?.reset();
}

function swapVisibleDrawer(nextId){
  drawers.forEach(d => d.classList.remove("is-open"));
  if(nextId === null){
    stageFrame.classList.remove("has-open");
    setPillActive(null);
    return;
  }
  resetDrawerScroll(nextId);
  stageFrame.classList.add("has-open");
  setPillActive(nextId);
  document.querySelector(`.project-drawer[data-drawer="${nextId}"]`)?.classList.add("is-open");
}

function spawnKaleido(){
  const overlay = document.createElement("div");
  overlay.className = "kaleido-overlay";
  for(let i = 0; i < SHARD_COUNT; i++){
    const shard = document.createElement("div");
    shard.className = "kaleido-shard";
    shard.style.setProperty("--angle", (360 / SHARD_COUNT) * i + "deg");
    shard.style.setProperty("--delay", (i * 14) + "ms");
    overlay.appendChild(shard);
  }
  stageFrame.appendChild(overlay);
  return overlay;
}

function runTransition(nextId){
  isAnimating = true;
  const overlay = spawnKaleido();

  requestAnimationFrame(() => overlay.classList.add("is-covering"));

  window.setTimeout(() => {
    swapVisibleDrawer(nextId);
    openId = nextId;
    if(nextId !== null) sfx.open();
    overlay.classList.remove("is-covering");
    overlay.classList.add("is-uncovering");
  }, COVER_MS);

  window.setTimeout(() => {
    overlay.remove();
    isAnimating = false;
    if(pendingId !== undefined){
      const target = pendingId;
      pendingId = undefined;
      goTo(target);
    }
  }, COVER_MS + UNCOVER_MS);
}

function goTo(nextId){
  if(isAnimating){
    pendingId = nextId;
    return;
  }
  if(nextId === openId) return;
  runTransition(nextId);
}

pills.forEach(pill => {
  pill.addEventListener("click", () => {
    const id = pill.dataset.project;
    if(id === openId){
      sfx.close();
      goTo(null);
    }else{
      if(openId !== null) sfx.close();
      goTo(id);
    }
  });
});

// Chaque tiroir gère sa propre barre : clic pour sauter, glisser pour lerp entre
// les pages. Un petit son marque chaque changement de page pendant le glissement.
drawers.forEach(drawer => {
  const scrollWrap = drawer.querySelector(".drawer__scroll");
  const track       = drawer.querySelector(".scrollbar-track");
  const thumb       = drawer.querySelector(".scrollbar-thumb");
  const pageCount   = drawer.querySelectorAll(".page").length;

  let target = 0;
  let current = 0;
  let rafId = null;
  let dragging = false;
  let lastPageIndex = 0;

  function maxScroll(){ return scrollWrap.scrollWidth - scrollWrap.clientWidth; }

  function applyThumb(ratio){
    const thumbWidth = Math.max(18, (scrollWrap.clientWidth / scrollWrap.scrollWidth) * 100);
    thumb.style.width = thumbWidth + "%";
    thumb.style.left = ratio * (100 - thumbWidth) + "%";
  }

  function tick(){
    current += (target - current) * 0.18;
    if(Math.abs(target - current) < 0.001){ current = target; }
    scrollWrap.scrollLeft = current * maxScroll();
    applyThumb(current);

    if(pageCount > 1){
      const idx = Math.round(current * (pageCount - 1));
      if(idx !== lastPageIndex){
        lastPageIndex = idx;
        sfx.scroll();
      }
    }

    if(current !== target){
      rafId = requestAnimationFrame(tick);
    }else{
      rafId = null;
    }
  }

  function goToRatio(ratio){
    target = Math.min(1, Math.max(0, ratio));
    if(!rafId) rafId = requestAnimationFrame(tick);
  }

  drawer._scrollApi = {
    reset(){
      target = 0; current = 0; lastPageIndex = 0;
      scrollWrap.scrollLeft = 0;
      applyThumb(0);
    }
  };

  track.addEventListener("click", (e) => {
    if(e.target === thumb) return;
    const rect = track.getBoundingClientRect();
    goToRatio((e.clientX - rect.left) / rect.width);
  });

  thumb.addEventListener("pointerdown", (e) => {
    dragging = true;
    thumb.classList.add("is-dragging");
    thumb.setPointerCapture(e.pointerId);
  });
  thumb.addEventListener("pointermove", (e) => {
    if(!dragging) return;
    const rect = track.getBoundingClientRect();
    goToRatio((e.clientX - rect.left) / rect.width);
  });
  function stopDrag(){ dragging = false; thumb.classList.remove("is-dragging"); }
  thumb.addEventListener("pointerup", stopDrag);
  thumb.addEventListener("pointercancel", stopDrag);

  window.addEventListener("resize", () => applyThumb(current));
  applyThumb(0);
});


/* ==================================================================
   3) ABOUT ME — panneaux droits, un seul zoomé à la fois
================================================================== */
const occupations = document.querySelectorAll(".occupation");

occupations.forEach(occ => {
  occ.addEventListener("click", () => {
    if(occ.classList.contains("is-active")) return;
    occupations.forEach(o => o.classList.remove("is-active"));
    occ.classList.add("is-active");
    sfx.select();
  });
});

function playAboutPeekSequence(){
  const inactiveOnes = [...occupations].filter(o => !o.classList.contains("is-active"));
  let i = 0;
  function step(){
    if(i > 0) inactiveOnes[i - 1].classList.remove("is-peeking");
    if(i >= inactiveOnes.length) return;
    inactiveOnes[i].classList.add("is-peeking");
    i++;
    window.setTimeout(step, 280);
  }
  step();
}


/* ==================================================================
   4) SWITCH DE LANGUE
================================================================== */
const langButtons = document.querySelectorAll(".lang-switch__btn");
const i18nEls = document.querySelectorAll("[data-fr][data-en]");

langButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    if(btn.classList.contains("is-active")) return;
    const lang = btn.dataset.lang;
    langButtons.forEach(b => b.classList.toggle("is-active", b === btn));
    i18nEls.forEach(el => { el.innerHTML = el.dataset[lang]; });
    document.documentElement.lang = lang;
    sfx.tab();
  });
});
