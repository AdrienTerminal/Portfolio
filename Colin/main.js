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


/* ---- 2) LANGUE ------------------------------------------------------ */
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


/* ---- 3) NAVIGATION CARROUSEL — 3 sections, ordre circulaire -------- */
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

function renderNav(direction){
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

  // le carrousel "tourne" vers le côté cliqué (ou un simple pop si on
  // ne sait pas d'où vient le changement, ex : juste la langue)
  const titleClass = direction === "prev" ? "is-animating-prev" : "is-animating-next";
  const otherTitleClass = direction === "prev" ? "is-animating-next" : "is-animating-prev";
  navTitle.classList.remove(titleClass, otherTitleClass);
  navPrevLabel.classList.remove(titleClass, otherTitleClass);
  navNextLabel.classList.remove(titleClass, otherTitleClass);
  void navTitle.offsetWidth; // force le navigateur à "oublier" l'état précédent
  navTitle.classList.add(titleClass);
  navPrevLabel.classList.add(titleClass);
  navNextLabel.classList.add(titleClass);

  panels.forEach(p => p.classList.toggle("is-active", p.dataset.panel === cur.id));
}

function goToIndex(i, direction){
  const newIndex = (i + SECTIONS.length) % SECTIONS.length;
  if(!direction){
    const diff = (newIndex - currentIndex + SECTIONS.length) % SECTIONS.length;
    direction = diff === 1 ? "next" : "prev";
  }
  currentIndex = newIndex;
  closeProjectDetail();
  renderNav(direction);
}
function goToId(id, direction){
  const idx = SECTIONS.findIndex(s => s.id === id);
  if(idx !== -1) goToIndex(idx, direction);
}

navPrevBtn.addEventListener("click", () => goToIndex(currentIndex - 1, "prev"));
navNextBtn.addEventListener("click", () => goToIndex(currentIndex + 1, "next"));
navPrevLabel.addEventListener("click", () => goToId(navPrevLabel.dataset.target, "prev"));
navNextLabel.addEventListener("click", () => goToId(navNextLabel.dataset.target, "next"));

// clavier : flèches gauche/droite pour naviguer (pratique, discret)
document.addEventListener("keydown", (e) => {
  if(e.target.closest("input, textarea, [contenteditable='true']")) return;
  if(e.key === "ArrowLeft") goToIndex(currentIndex - 1, "prev");
  if(e.key === "ArrowRight") goToIndex(currentIndex + 1, "next");
});


/* ---- 4) PAGES DE DÉTAIL PROJET — grille <-> grande page dédiée ----- */
const projectsGrid = document.getElementById("projectsGrid");
const projectDetail = document.getElementById("projectDetail");
const detailBackBtn = document.getElementById("detailBackBtn");
const detailBodies = document.querySelectorAll(".hud__detail-body");

function openProjectDetail(projectId){
  projectsGrid.classList.add("is-hidden");
  projectDetail.hidden = false;
  detailBodies.forEach(b => b.classList.toggle("is-active", b.dataset.projectId === projectId));
  const panel = document.querySelector('.hud__panel[data-panel="projects"]');
  if(panel) panel.scrollTop = 0;
}
function closeProjectDetail(){
  if(!projectDetail || projectDetail.hidden) return;
  projectDetail.hidden = true;
  projectsGrid.classList.remove("is-hidden");
  detailBodies.forEach(b => b.classList.remove("is-active"));
}
document.querySelectorAll("[data-project-target]").forEach(btn => {
  btn.addEventListener("click", () => openProjectDetail(btn.dataset.projectTarget));
});
if(detailBackBtn) detailBackBtn.addEventListener("click", closeProjectDetail);

renderNav();
