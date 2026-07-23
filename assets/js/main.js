/* ==================================================================
   1) ONGLETS "Projects" / "About me"
================================================================== */
const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel-view");

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("is-active"));
    panels.forEach(p => p.classList.remove("is-active"));
    tab.classList.add("is-active");
    document.querySelector(`.panel-view[data-panel="${tab.dataset.tab}"]`).classList.add("is-active");
  });
});


/* ==================================================================
   2) PROJETS — un tiroir indépendant par projet, chacun avec sa
      propre barre qui fait défiler SES pages (pas les autres projets)
================================================================== */
const pills   = document.querySelectorAll(".pill");
const drawers = document.querySelectorAll(".project-drawer");

function closeAllDrawers(){
  drawers.forEach(d => d.classList.remove("is-open"));
  pills.forEach(p => p.classList.remove("is-active"));
}

pills.forEach(pill => {
  pill.addEventListener("click", () => {
    const id = pill.dataset.project;
    const targetDrawer = document.querySelector(`.project-drawer[data-drawer="${id}"]`);
    const alreadyOpen = pill.classList.contains("is-active");

    closeAllDrawers();

    if(!alreadyOpen){
      pill.classList.add("is-active");
      targetDrawer.classList.add("is-open");
    }
  });
});

// Chaque tiroir gère sa propre barre de scroll + son propre bouton "rabattre"
drawers.forEach(drawer => {
  const scrollWrap  = drawer.querySelector(".drawer__scroll");
  const track        = drawer.querySelector(".scrollbar-track");
  const thumb        = drawer.querySelector(".scrollbar-thumb");
  const foldCorner   = drawer.querySelector(".fold-corner");

  function syncScrollbar(){
    const max = scrollWrap.scrollWidth - scrollWrap.clientWidth;
    const ratio = max > 0 ? scrollWrap.scrollLeft / max : 0;
    const thumbWidth = Math.max(18, (scrollWrap.clientWidth / scrollWrap.scrollWidth) * 100);
    thumb.style.width = thumbWidth + "%";
    thumb.style.left = ratio * (100 - thumbWidth) + "%";
  }

  scrollWrap.addEventListener("scroll", syncScrollbar);
  window.addEventListener("resize", syncScrollbar);
  syncScrollbar();

  track.addEventListener("click", (e) => {
    const rect = track.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const max = scrollWrap.scrollWidth - scrollWrap.clientWidth;
    scrollWrap.scrollTo({ left: ratio * max, behavior: "smooth" });
  });

  foldCorner.addEventListener("click", () => {
    drawer.classList.remove("is-open");
    document.querySelector(`.pill[data-project="${drawer.dataset.drawer}"]`)?.classList.remove("is-active");
  });
});


/* ==================================================================
   3) ABOUT ME — panneaux diagonaux, un seul zoomé à la fois
================================================================== */
const occupations = document.querySelectorAll(".occupation");

occupations.forEach(occ => {
  occ.addEventListener("click", () => {
    occupations.forEach(o => o.classList.remove("is-active"));
    occ.classList.add("is-active");
  });
});
