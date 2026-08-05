/* ==================================================================
   PORTFOLIO COLIN VIALLE — logique du site
   Structure : une sidebar persistante + 3 sections (Accueil, Qui
   suis-je, Projets) naviguées en carrousel circulaire.
================================================================== */

/* ---- 1) ÉCRAN DE CHARGEMENT ---------------------------------------- */
const siteLoader = document.getElementById("siteLoader");
function hideLoader(){
  siteLoader.classList.add("is-hidden");
  window.setTimeout(() => siteLoader.remove(), 500);
}
window.addEventListener("load", () => window.setTimeout(hideLoader, 250));
window.setTimeout(hideLoader, 4000); // filet de sécurité


/* ---- 2) THÈME (sombre par défaut) ---------------------------------- */
const themeToggle = document.getElementById("themeToggle");
themeToggle.addEventListener("click", () => {
  const isLight = document.documentElement.getAttribute("data-theme") === "light";
  document.documentElement.setAttribute("data-theme", isLight ? "dark" : "light");
});


/* ---- 3) LANGUE ------------------------------------------------------ */
const TRANSLATABLE_SELECTOR = "[data-fr][data-en]";
const langBtns = document.querySelectorAll(".hud__lang-btn");
let currentLang = "fr";

function applyLanguage(lang){
  currentLang = lang;
  document.documentElement.lang = lang;
  document.querySelectorAll(TRANSLATABLE_SELECTOR).forEach(el => {
    const value = el.dataset[lang];
    if(value !== undefined) el.textContent = value;
  });
  langBtns.forEach(b => b.classList.toggle("is-active", b.dataset.lang === lang));
  renderNav();
}

langBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    if(btn.dataset.lang !== currentLang) applyLanguage(btn.dataset.lang);
  });
});


/* ---- 4) NAVIGATION CARROUSEL — 3 sections, ordre circulaire -------- */
const SECTIONS = [
  { id:"home",     fr:"Accueil",       en:"Home" },
  { id:"about",    fr:"Qui suis-je ?", en:"About me" },
  { id:"projects", fr:"Projets",       en:"Projects" },
];

const panels = document.querySelectorAll(".hud__panel");
const navTitle = document.getElementById("navTitle");
const navPrevLabel = document.getElementById("navPrevLabel");
const navNextLabel = document.getElementById("navNextLabel");
const navPrevBtn = document.getElementById("navPrevBtn");
const navNextBtn = document.getElementById("navNextBtn");

let currentIndex = 0;

function renderNav(){
  const prevIdx = (currentIndex - 1 + SECTIONS.length) % SECTIONS.length;
  const nextIdx = (currentIndex + 1) % SECTIONS.length;
  const cur = SECTIONS[currentIndex];
  const prev = SECTIONS[prevIdx];
  const next = SECTIONS[nextIdx];

  navTitle.textContent = cur[currentLang];
  navPrevLabel.textContent = prev[currentLang];
  navNextLabel.textContent = next[currentLang];
  navPrevLabel.dataset.target = prev.id;
  navNextLabel.dataset.target = next.id;

  panels.forEach(p => p.classList.toggle("is-active", p.dataset.panel === cur.id));
}

function goToIndex(i){
  currentIndex = (i + SECTIONS.length) % SECTIONS.length;
  renderNav();
}
function goToId(id){
  const idx = SECTIONS.findIndex(s => s.id === id);
  if(idx !== -1) goToIndex(idx);
}

navPrevBtn.addEventListener("click", () => goToIndex(currentIndex - 1));
navNextBtn.addEventListener("click", () => goToIndex(currentIndex + 1));
navPrevLabel.addEventListener("click", () => goToId(navPrevLabel.dataset.target));
navNextLabel.addEventListener("click", () => goToId(navNextLabel.dataset.target));

// clavier : flèches gauche/droite pour naviguer (pratique, discret)
document.addEventListener("keydown", (e) => {
  if(e.target.closest("input, textarea, [contenteditable='true']")) return;
  if(e.key === "ArrowLeft") goToIndex(currentIndex - 1);
  if(e.key === "ArrowRight") goToIndex(currentIndex + 1);
});

renderNav();
