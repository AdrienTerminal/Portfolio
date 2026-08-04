/* ==================================================================
   -1) ÉCRAN DE CHARGEMENT — masqué dès que la page est prête (chargée),
   avec un petit délai minimum pour éviter un flash, et un filet de
   sécurité pour ne jamais bloquer plus de quelques secondes.
================================================================== */
(function(){
  const loader = document.getElementById("siteLoader");
  if(!loader) return;
  let hidden = false;
  function hideLoader(){
    if(hidden) return;
    hidden = true;
    loader.classList.add("is-hidden");
  }
  if(document.readyState === "complete"){
    setTimeout(hideLoader, 250);
  }else{
    window.addEventListener("load", () => setTimeout(hideLoader, 250));
  }
  setTimeout(hideLoader, 4000); // filet de sécurité
})();

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
  scroll: () => blip({ freqStart:680, freqEnd:720,  duration:0.035,type:"square",   gain:0.022 }),
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
  });
});


/* ==================================================================
   2) PROJETS — même machine d'état anti-spam qu'avant : pendant
      qu'une transition tourne, un clic ne fait que mettre à jour
      "la dernière destination demandée", traitée dès la fin de
      l'animation en cours. Ouverture et fermeture utilisent le même
      fondu doux (scale + opacity, défini en CSS) dans les deux sens.
================================================================== */
const TRANSITION_MS = 380; // doit correspondre à la transition CSS de .project-drawer

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

function hideAllDrawers(){
  drawers.forEach(d => d.classList.remove("is-open"));
  stageFrame.classList.remove("has-open");
}

function openDrawer(id){
  resetDrawerScroll(id);
  stageFrame.classList.add("has-open");
  document.querySelector(`.project-drawer[data-drawer="${id}"]`)?.classList.add("is-open");
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
    }, TRANSITION_MS);
  }else{
    resolveTransition(nextId);
  }
}

function resolveTransition(nextId){
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
  openDrawer(nextId);
  sfx.open();
  window.setTimeout(() => { isAnimating = false; }, TRANSITION_MS);
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
   3) ABOUT ME — panneaux diagonaux, un seul zoomé à la fois.
      Pas de texte d'instruction : au premier passage sur l'onglet,
      une petite vague fait "peeker" chaque panneau tour à tour pour
      suggérer l'interaction sans l'écrire.
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

/* ---- "Moi" / "Mes passions" — grandissent au clic, exactement
   comme les cartes passions plus bas (même logique, même familiarité). */
const aboutTabs = document.querySelectorAll(".about-tab");

aboutTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    if(tab.classList.contains("is-active")) return;
    const target = tab.dataset.aboutTab;
    aboutTabs.forEach(t => t.classList.toggle("is-active", t === tab));
    sfx.tab();

    if(target === "passions" && !aboutPeekPlayed){
      aboutPeekPlayed = true;
      window.setTimeout(playAboutPeekSequence, 400);
    }
  });
  tab.addEventListener("keydown", (e) => {
    if(e.key === "Enter" || e.key === " "){
      e.preventDefault();
      tab.click();
    }
  });
});

/* ---- Navigation de la frise (flèches gauche/droite) --------------
   stopPropagation pour ne jamais interférer avec le clic du panneau
   "Moi" qui l'entoure. */
document.querySelectorAll(".timeline__nav").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const timeline = btn.closest(".about-tab__content")?.querySelector(".timeline");
    if(!timeline) return;
    const amount = timeline.clientWidth * 0.7;
    timeline.scrollBy({ left: btn.classList.contains("timeline__nav--prev") ? -amount : amount, behavior:"smooth" });
  });
});


/* ==================================================================
   4) SWITCH DE LANGUE — bascule le texte des éléments porteurs
      d'attributs data-fr / data-en. Pour rendre une de tes propres
      phrases bilingue (ex : dans les pages projets), ajoute
      simplement data-fr="..." data-en="..." sur l'élément.
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


/* ==================================================================
   5) SWITCH CLAIR / SOMBRE — mémorisé d'une visite à l'autre
================================================================== */
const THEME_KEY = "portfolio_theme";
const themeButtons = document.querySelectorAll(".theme-switch__btn");

function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme);
  themeButtons.forEach(b => b.classList.toggle("is-active", b.dataset.theme === theme));
}

const savedTheme = localStorage.getItem(THEME_KEY);
if(savedTheme) applyTheme(savedTheme);

themeButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    if(btn.classList.contains("is-active")) return;
    const theme = btn.dataset.theme;
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
    sfx.tab();
  });
});
