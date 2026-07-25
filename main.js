/* ==================================================================
   0) SONS — synthétisés à la volée (Web Audio), pas de fichiers externes
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
  tab:    () => blip({ freqStart:520, freqEnd:640,  duration:0.07, type:"square",   gain:0.04  }),
  open:   () => blip({ freqStart:300, freqEnd:560,  duration:0.16, type:"triangle", gain:0.05  }),
  close:  () => blip({ freqStart:440, freqEnd:220,  duration:0.14, type:"triangle", gain:0.05  }),
  select: () => blip({ freqStart:820, freqEnd:1040, duration:0.07, type:"sine",     gain:0.04  }),
};


/* ==================================================================
   1) ONGLETS "Projects" / "About me"
      Passer sur "About me" étend la carte (1.5x), "Projects" la
      ramène à sa hauteur normale — géré via une classe sur .card.
================================================================== */
const cardEl = document.getElementById("card");
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel-view");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    if(tab.classList.contains("is-active")) return;
    tabs.forEach(t => t.classList.remove("is-active"));
    panels.forEach(p => p.classList.remove("is-active"));
    tab.classList.add("is-active");
    document.querySelector(`.panel-view[data-panel="${tab.dataset.tab}"]`).classList.add("is-active");
    cardEl.classList.toggle("is-about", tab.dataset.tab === "about");
    sfx.tab();
  });
});


/* ==================================================================
   2) PROJETS — machine d'état simple pour éviter que deux tiroirs
      s'ouvrent en même temps si on clique vite plusieurs fois de
      suite : pendant qu'une transition tourne, les clics ne font
      que mettre à jour "la dernière destination demandée", qui est
      traitée dès que l'animation en cours se termine.
================================================================== */
const CLOSE_DURATION = 380; // doit être ≥ à la transition CSS d'opacité du tiroir

const pills   = document.querySelectorAll(".pill");
const drawers = document.querySelectorAll(".project-drawer");
const stageFrame = document.getElementById("projectsStage");

let openId = null;        // id du tiroir actuellement ouvert (ou null)
let isAnimating = false;  // une transition est en cours
let pendingId = undefined; // prochaine destination demandée pendant l'animation ("close" = fermer)

function setPillActive(id){
  pills.forEach(p => p.classList.toggle("is-active", p.dataset.project === id));
}

function showDrawer(id){
  drawers.forEach(d => d.classList.toggle("is-open", d.dataset.drawer === id));
  stageFrame.classList.add("has-open");
  const api = document.querySelector(`.project-drawer[data-drawer="${id}"]`)?._scrollApi;
  if(api) api.reset();
}

function hideAllDrawers(){
  drawers.forEach(d => d.classList.remove("is-open"));
  stageFrame.classList.remove("has-open");
}

function runTransition(nextId){
  isAnimating = true;
  const needsClose = openId !== null;

  if(needsClose){
    hideAllDrawers();
    window.setTimeout(() => {
      openId = null;
      setPillActive(null);
      resolveTransition(nextId);
    }, CLOSE_DURATION);
  }else{
    resolveTransition(nextId);
  }
}

function resolveTransition(nextId){
  // si une nouvelle destination a été demandée pendant qu'on animait,
  // c'est elle qui gagne — on ignore les clics intermédiaires
  if(pendingId !== undefined){
    const target = pendingId;
    pendingId = undefined;
    isAnimating = false;
    goTo(target);
    return;
  }
  if(nextId === null){
    isAnimating = false;
    return;
  }
  openId = nextId;
  setPillActive(nextId);
  showDrawer(nextId);
  sfx.open();
  isAnimating = false;
}

function goTo(nextId){
  if(isAnimating){
    // on ne fait qu'enregistrer la dernière intention, traitée à la fin de l'animation en cours
    pendingId = nextId;
    return;
  }
  if(nextId === openId) return;
  runTransition(nextId);
}

pills.forEach(pill => {
  pill.addEventListener("click", () => {
    const id = pill.dataset.project;
    const somethingWasOpen = openId !== null || pendingId !== undefined;
    if(id === openId){
      sfx.close();
      goTo(null);
    }else{
      if(somethingWasOpen) sfx.close();
      goTo(id);
    }
  });
});

// Chaque tiroir gère sa propre barre : clic pour sauter, glisser pour lerp entre les pages
drawers.forEach(drawer => {
  const scrollWrap = drawer.querySelector(".drawer__scroll");
  const track       = drawer.querySelector(".scrollbar-track");
  const thumb       = drawer.querySelector(".scrollbar-thumb");

  let target = 0;
  let current = 0;
  let rafId = null;
  let dragging = false;

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
      target = 0; current = 0;
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
   3) ABOUT ME — panneaux diagonaux, un seul zoomé à la fois
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
