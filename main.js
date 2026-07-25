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
================================================================== */
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel-view");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    if(tab.classList.contains("is-active")) return;
    tabs.forEach(t => t.classList.remove("is-active"));
    panels.forEach(p => p.classList.remove("is-active"));
    tab.classList.add("is-active");
    document.querySelector(`.panel-view[data-panel="${tab.dataset.tab}"]`).classList.add("is-active");
    sfx.tab();
  });
});


/* ==================================================================
   2) PROJETS — un seul tiroir ouvert à la fois.
      Changer de projet referme d'abord l'actuel, puis déplie le nouveau
      (au lieu de jouer les deux animations en même temps).
================================================================== */
const CLOSE_DURATION = 500; // doit correspondre à la transition CSS du tiroir

const pills   = document.querySelectorAll(".pill");
const drawers = document.querySelectorAll(".project-drawer");

function resetDrawerScroll(drawer){
  const api = drawer._scrollApi;
  if(api) api.reset();
}

pills.forEach(pill => {
  pill.addEventListener("click", () => {
    const id = pill.dataset.project;
    const targetDrawer = document.querySelector(`.project-drawer[data-drawer="${id}"]`);
    const currentDrawer = document.querySelector(".project-drawer.is-open");
    const isAlreadyOpen = targetDrawer.classList.contains("is-open");

    if(isAlreadyOpen){
      // reclic sur le projet actif : on referme, c'est tout
      pill.classList.remove("is-active");
      targetDrawer.classList.remove("is-open");
      sfx.close();
      return;
    }

    pills.forEach(p => p.classList.remove("is-active"));
    pill.classList.add("is-active");

    if(currentDrawer && currentDrawer !== targetDrawer){
      // on referme le tiroir actuel, PUIS on déplie le nouveau une fois fermé
      currentDrawer.classList.remove("is-open");
      sfx.close();
      setTimeout(() => {
        targetDrawer.classList.add("is-open");
        resetDrawerScroll(targetDrawer);
        sfx.open();
      }, CLOSE_DURATION);
    } else {
      targetDrawer.classList.add("is-open");
      resetDrawerScroll(targetDrawer);
      sfx.open();
    }
  });
});

// Chaque tiroir gère sa propre barre : clic pour sauter, glisser pour lerp entre les pages
drawers.forEach(drawer => {
  const scrollWrap = drawer.querySelector(".drawer__scroll");
  const track       = drawer.querySelector(".scrollbar-track");
  const thumb       = drawer.querySelector(".scrollbar-thumb");

  let target = 0;     // 0..1, position visée
  let current = 0;    // 0..1, position réellement appliquée (suit "target" avec du lerp)
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

  function goTo(ratio){
    target = Math.min(1, Math.max(0, ratio));
    if(!rafId) rafId = requestAnimationFrame(tick);
  }

  // Remise à zéro propre à l'ouverture d'un tiroir
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
    goTo((e.clientX - rect.left) / rect.width);
  });

  thumb.addEventListener("pointerdown", (e) => {
    dragging = true;
    thumb.classList.add("is-dragging");
    thumb.setPointerCapture(e.pointerId);
  });

  thumb.addEventListener("pointermove", (e) => {
    if(!dragging) return;
    const rect = track.getBoundingClientRect();
    goTo((e.clientX - rect.left) / rect.width);
  });

  function stopDrag(){
    dragging = false;
    thumb.classList.remove("is-dragging");
  }
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
