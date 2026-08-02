/* ==================================================================
   ÉDITEUR VISUEL v3 — reconstruit en plus simple.

   Principe : PLUS DE MODES. Chaque action a son propre petit badge,
   visible au survol de l'élément concerné :
     ✎  renommer (tabs, pills — prompt())
     🖼  changer l'image (avatar, projets, hobbies)
     🔗  changer l'URL (itch, resume, réseaux)
     ✕  supprimer (tags, liens, réseaux, projets)
   Le texte "de contenu" (bio, descriptions, tags...) reste éditable
   directement au clic, sans badge — comme avant.

   L'undo (Ctrl+Z) restaure directement la valeur précédente sur le
   même élément, SANS jamais recharger la page — sauf pour
   ajouter/supprimer un projet, qui a besoin que main.js redémarre
   pour reconnaître les nouveaux éléments (donc non couvert par
   Ctrl+Z, mais protégé par une confirmation).

   ⚠️ Doit tourner sur http(s):// — pas en double-clic sur le fichier.
================================================================== */

const DRAFT_KEY = "portfolio_editor_draft_v3";

const frame        = document.getElementById("siteFrame");
const btnDownload   = document.getElementById("btnDownload");
const btnReset       = document.getElementById("btnReset");
const btnUndo        = document.getElementById("btnUndo");
const btnAddProject  = document.getElementById("btnAddProject");
const saveStatus     = document.getElementById("saveStatus");
const fileInput      = document.getElementById("fileInput");
const toastEl        = document.getElementById("toast");

const colorInputs = {
  "--red":   document.getElementById("colorRed"),
  "--ink":   document.getElementById("colorInk"),
  "--yellow":document.getElementById("colorYellow"),
  "--paper": document.getElementById("colorPaper"),
};

let currentImageTarget = null;
let saveTimer = null;
let undoStack = [];
const MAX_UNDO = 60;

const TEXT_SELECTOR = [
  ".card__brand", ".role", ".about-bio",
  ".page__text p", ".page__list li", ".page__tags span",
  ".stat", ".occupation__label", ".occupation__info h3", ".occupation__info p",
  ".occupation__stat", ".stack-tag", ".itch-link",
].join(", ");

function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("is-visible");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("is-visible"), 2600);
}

// ---------------------------------------------------------------
// Undo — pile d'opérations inverses, jamais de rechargement de page
// ---------------------------------------------------------------
function recordUndo(fn){
  undoStack.push(fn);
  if(undoStack.length > MAX_UNDO) undoStack.shift();
  btnUndo.disabled = false;
}
function undo(){
  const fn = undoStack.pop();
  if(!fn){ toast("Rien à annuler"); return; }
  fn();
  btnUndo.disabled = undoStack.length === 0;
  saveDraft();
  toast("Annulé");
}
btnUndo.addEventListener("click", undo);
btnUndo.disabled = true;

document.addEventListener("keydown", (e) => {
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z"){ e.preventDefault(); undo(); }
});

// ---------------------------------------------------------------
// Aide — repliée par défaut, affichée seulement au clic
// ---------------------------------------------------------------
const btnHelp = document.getElementById("btnHelp");
const helpPopover = document.getElementById("helpPopover");
btnHelp.addEventListener("click", (e) => {
  e.stopPropagation();
  helpPopover.hidden = !helpPopover.hidden;
});
document.addEventListener("click", (e) => {
  if(!helpPopover.hidden && !helpPopover.contains(e.target) && e.target !== btnHelp){
    helpPopover.hidden = true;
  }
});

// ---------------------------------------------------------------
// Palettes prêtes à l'emploi — chacune pensée en couleurs
// complémentaires, avec assez de contraste pour rester lisible.
// ---------------------------------------------------------------
const PALETTES = [
  { name:"Corail & Nuit",   red:"#e4483f", ink:"#1b2a4a", yellow:"#f2c94c", paper:"#f2e9d8" },
  { name:"Émeraude",        red:"#e07a3f", ink:"#123524", yellow:"#d4a24c", paper:"#eef2e6" },
  { name:"Violet Néon",     red:"#8b5cf6", ink:"#1e1b3a", yellow:"#f2c94c", paper:"#f3efff" },
  { name:"Corail Chaud",    red:"#ff6b4a", ink:"#2b1b17", yellow:"#ffb84d", paper:"#fff3e8" },
  { name:"Bleu Glacier",    red:"#3b82f6", ink:"#0f2942", yellow:"#e8965a", paper:"#eaf3fa" },
  { name:"Rose Poudré",     red:"#d1495b", ink:"#2e2532", yellow:"#e8b4bc", paper:"#faf1ee" },
];

const btnPalettes = document.getElementById("btnPalettes");
const palettePopover = document.getElementById("palettePopover");

function buildPalettePopover(){
  palettePopover.innerHTML = "";
  PALETTES.forEach(p => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "palette-swatch";
    btn.innerHTML = `
      <span class="palette-swatch__preview">
        <span style="background:${p.paper}"></span><span style="background:${p.ink}"></span><span style="background:${p.red}"></span><span style="background:${p.yellow}"></span>
      </span>
      <span class="palette-swatch__name">${p.name}</span>
    `;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      colorInputs["--red"].value = p.red;
      colorInputs["--ink"].value = p.ink;
      colorInputs["--yellow"].value = p.yellow;
      colorInputs["--paper"].value = p.paper;
      applyColorsToFrame();
      scheduleSave();
      palettePopover.hidden = true;
      toast(`Palette "${p.name}" appliquée`);
    });
    palettePopover.appendChild(btn);
  });
}
buildPalettePopover();

btnPalettes.addEventListener("click", (e) => {
  e.stopPropagation();
  palettePopover.hidden = !palettePopover.hidden;
});
document.addEventListener("click", (e) => {
  if(!palettePopover.hidden && !palettePopover.contains(e.target) && e.target !== btnPalettes){
    palettePopover.hidden = true;
  }
});

// ---------------------------------------------------------------
// Chargement fiable de l'iframe (vraie navigation vers un Blob avec
// <base> explicite, pour que style.css / main.js se chargent toujours)
// ---------------------------------------------------------------
function loadHtmlIntoFrame(html, callback){
  let finalHtml = /^\s*<!doctype/i.test(html) ? html : "<!DOCTYPE html>\n" + html;
  const baseUrl = new URL("../index.html", window.location.href).href;
  finalHtml = finalHtml.replace(/<base[^>]*>/gi, ""); // jamais de doublon
  finalHtml = finalHtml.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n<base href="${baseUrl}">`);

  const blob = new Blob([finalHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  function onLoad(){
    frame.removeEventListener("load", onLoad);
    URL.revokeObjectURL(url);

    // Filet de sécurité : si la structure de base n'est plus là après le
    // chargement, la page serait cassée à l'écran — on prévient plutôt
    // que de l'afficher telle quelle.
    const doc = frame.contentDocument;
    const looksValid = doc && doc.querySelector(".card__topbar") && doc.querySelector(".card__body") && doc.querySelector(".pill-row");
    if(!looksValid){
      toast("⚠ La page semblait cassée après ce changement — annulé automatiquement");
      const lastGood = localStorage.getItem(DRAFT_KEY);
      if(lastGood && lastGood !== finalHtml){
        loadHtmlIntoFrame(lastGood, callback);
      }else{
        frame.addEventListener("load", callback, { once: true });
        frame.src = "../index.html?_=" + Date.now();
      }
      return;
    }
    callback();
  }
  frame.addEventListener("load", onLoad, { once: true });
  frame.src = url;
}

// ---------------------------------------------------------------
// Chargement initial
// ---------------------------------------------------------------
frame.addEventListener("load", onFirstLoad, { once: true });

function onFirstLoad(){
  const draft = localStorage.getItem(DRAFT_KEY);
  if(draft){
    loadHtmlIntoFrame(draft, () => {
      toast("Brouillon précédent restauré");
      injectEditing();
    });
  }else{
    injectEditing();
  }
}

// ---------------------------------------------------------------
// Injection des capacités d'édition — appelée une fois par vrai
// chargement de document (jamais en boucle sur le même document)
// ---------------------------------------------------------------
function injectEditing(){
  const doc = frame.contentDocument;
  if(!doc) return;

  syncColorInputsFromFrame(doc);

  if(!doc.getElementById("editor-injected-style")){
    const style = doc.createElement("style");
    style.id = "editor-injected-style";
    style.textContent = `
      ${TEXT_SELECTOR}{
        outline:2px dashed transparent; outline-offset:2px; cursor:text;
        transition:outline-color .15s ease, background-color .15s ease;
      }
      ${TEXT_SELECTOR}:hover{ outline-color:#5B8DEF; background-color:rgba(91,141,239,.07); }
      ${TEXT_SELECTOR}:focus{ outline-color:#4CAF6D; background-color:rgba(76,175,109,.08); }

      .editor-badges{
        position:absolute; top:6px; right:6px; z-index:40;
        display:flex; gap:4px;
        opacity:0; transition:opacity .15s ease;
      }
      :hover > .editor-badges{ opacity:1; }
      .editor-badge{
        width:24px; height:24px; border-radius:50%;
        background:rgba(20,20,24,.82); border:1.5px solid #5B8DEF;
        color:#fff; font-size:12px; line-height:1;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; padding:0;
      }
      .editor-badge:hover{ background:#5B8DEF; }
      .editor-badge--danger{ border-color:#E4483F; }
      .editor-badge--danger:hover{ background:#E4483F; }

      .editor-add-tag{
        font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700;
        color:#5B8DEF; background:transparent; border:1.5px dashed #5B8DEF;
        border-radius:100px; padding:3px 9px; cursor:pointer; opacity:.7;
      }
      .editor-add-tag:hover{ opacity:1; background:rgba(91,141,239,.12); }
      .editor-img-wrap{ position:relative; width:100%; height:100%; }
    `;
    doc.head.appendChild(style);
  }

  doc.querySelectorAll(TEXT_SELECTOR).forEach(wireTextElement);

  doc.querySelectorAll(".page__tags").forEach(row => addTagButton(row, false));
  doc.querySelectorAll(".stack-row").forEach(row => addTagButton(row, true));

  // Badges image
  const avatarImg = doc.querySelector(".avatar");
  if(avatarImg) addBadges(doc.querySelector(".avatar-frame") || avatarImg, [
    { icon:"🖼", title:"Changer la photo", onClick:() => openImagePicker(avatarImg) },
  ]);
  doc.querySelectorAll(".page__img").forEach(img => {
    const wrap = wrapImageForBadge(img);
    addBadges(wrap, [{ icon:"🖼", title:"Changer l'image", onClick:() => openImagePicker(img) }]);
  });
  doc.querySelectorAll(".occupation").forEach(occ => {
    addBadges(occ, [{ icon:"🖼", title:"Changer l'image de fond", onClick:() => openImagePicker(occ) }]);
  });

  // Badges lien + suppression sur itch-link
  doc.querySelectorAll(".itch-link").forEach(a => {
    addBadges(a, [
      { icon:"🔗", title:"Changer l'URL", onClick:() => editLink(a) },
      { icon:"✕", title:"Supprimer ce bouton", danger:true, onClick:() => removeSimple(a) },
    ]);
  });

  // Bouton Resume : lien seulement (trop important pour l'auto-suppression)
  const resumeBtn = doc.querySelector(".resume-btn");
  if(resumeBtn) addBadges(resumeBtn, [{ icon:"🔗", title:"Changer l'URL", onClick:() => editLink(resumeBtn) }]);

  // Réseaux sociaux : suppression sur le <li>, l'URL s'édite au clic direct sur l'icône
  doc.querySelectorAll(".socials li").forEach(li => {
    addBadges(li, [{ icon:"✕", title:"Retirer ce réseau", danger:true, onClick:() => removeSimple(li) }]);
  });
  doc.querySelectorAll(".socials a").forEach(a => {
    if(a._socialWired) return;
    a._socialWired = true;
    a.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      editLink(a);
    });
  });

  // Tags et stack-tags : suppression seulement (le texte s'édite déjà au clic direct)
  doc.querySelectorAll(".page__tags span, .stack-tag").forEach(tag => {
    addBadges(tag, [{ icon:"✕", title:"Supprimer ce tag", danger:true, onClick:() => removeSimple(tag) }]);
  });

  // Tabs et pills : renommer + (pour les pills) supprimer le projet
  doc.querySelectorAll(".tab").forEach(tab => {
    addBadges(tab, [{ icon:"✎", title:"Renommer", onClick:() => renameSimple(tab) }]);
  });
  doc.querySelectorAll(".pill").forEach(pill => {
    addBadges(pill, [
      { icon:"✎", title:"Renommer", onClick:() => renameSimple(pill) },
      { icon:"✕", title:"Supprimer ce projet", danger:true, onClick:() => removeProject(pill.dataset.project) },
    ]);
  });
}

// <img> ne peut pas avoir d'enfants : on l'enveloppe pour pouvoir y
// positionner un badge, sans changer son rendu (même taille, même place).
function wrapImageForBadge(img){
  if(img.parentElement && img.parentElement.classList.contains("editor-img-wrap")){
    return img.parentElement;
  }
  const doc = img.ownerDocument;
  const wrap = doc.createElement("div");
  wrap.className = "editor-img-wrap";
  img.parentNode.insertBefore(wrap, img);
  wrap.appendChild(img);
  return wrap;
}

// ---------------------------------------------------------------
// Petit badge d'action générique — jamais dupliqué grâce à la garde
// ---------------------------------------------------------------
function addBadges(hostEl, actions){
  if(hostEl.querySelector(":scope > .editor-badges")) return;
  const doc = hostEl.ownerDocument;
  hostEl.style.position = "relative";
  const wrap = doc.createElement("span");
  wrap.className = "editor-badges";
  wrap.setAttribute("contenteditable", "false");
  actions.forEach(a => {
    // volontairement un <span>, pas un <button> : ces badges finissent
    // parfois à l'intérieur d'un <button> ou d'un <a> (pill, tab,
    // itch-link...) et un bouton imbriqué dans un bouton est du HTML
    // invalide — le navigateur "corrige" ça en cassant la page au
    // rechargement. Un <span> avec juste un clic JS reste valide partout.
    const btn = doc.createElement("span");
    btn.className = "editor-badge" + (a.danger ? " editor-badge--danger" : "");
    btn.textContent = a.icon;
    btn.title = a.title;
    btn.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); a.onClick(); });
    wrap.appendChild(btn);
  });
  hostEl.appendChild(wrap);
}

// ---------------------------------------------------------------
// Texte — toujours éditable au clic, undo au blur si modifié
// ---------------------------------------------------------------
function wireTextElement(el){
  if(el._wired) return;
  el._wired = true;
  el.setAttribute("contenteditable", "true");
  const doc = el.ownerDocument;
  let before = null;

  el.addEventListener("focus", () => { before = el.innerHTML; });

  el.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || doc.defaultView.clipboardData).getData("text/plain");
    doc.execCommand("insertText", false, text);
  });

  el.addEventListener("input", scheduleSave);

  el.addEventListener("blur", () => {
    if(before !== null && before !== el.innerHTML){
      const prevHtml = before;
      recordUndo(() => { el.innerHTML = prevHtml; syncLangAttribute(el); });
    }
    syncLangAttribute(el);
    saveDraft();
  });
}

function syncLangAttribute(el){
  if(el.dataset.fr === undefined || el.dataset.en === undefined) return;
  const doc = el.ownerDocument;
  const lang = doc.documentElement.lang === "en" ? "en" : "fr";
  el.dataset[lang] = el.innerHTML;
}

// ---------------------------------------------------------------
// Renommer (tabs, pills) via prompt — simple et robuste
// ---------------------------------------------------------------
function renameSimple(el){
  const prev = el.textContent.trim();
  const next = prompt("Nouveau texte :", prev);
  if(next === null || next.trim() === "") return;
  el.textContent = next.trim();
  recordUndo(() => { el.textContent = prev; });
  saveDraft();
  toast("Renommé");
}

// ---------------------------------------------------------------
// Lien — via prompt
// ---------------------------------------------------------------
function editLink(el){
  const prev = el.getAttribute("href") || "";
  const next = prompt("Nouvelle URL :", prev);
  if(next === null || next.trim() === "") return;
  el.setAttribute("href", next.trim());
  recordUndo(() => el.setAttribute("href", prev));
  saveDraft();
  toast("Lien mis à jour");
}

// ---------------------------------------------------------------
// Suppression simple (tag, lien, réseau) — remise en place possible
// ---------------------------------------------------------------
function removeSimple(el){
  const parent = el.parentNode;
  const nextSibling = el.nextSibling;
  el.remove();
  recordUndo(() => parent.insertBefore(el, nextSibling));
  saveDraft();
  toast("Supprimé");
}

// ---------------------------------------------------------------
// Upload d'image → redimensionnement → data URL, avec undo
// ---------------------------------------------------------------
function openImagePicker(target){
  currentImageTarget = target;
  fileInput.value = "";
  fileInput.click();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if(!file || !currentImageTarget) return;
  const target = currentImageTarget;

  const isImg = target.tagName === "IMG";
  const prevValue = isImg ? target.src : target.style.backgroundImage;

  const img = new Image();
  const reader = new FileReader();
  reader.onload = (e) => {
    img.onload = () => {
      const MAX = 640;
      let { width, height } = img;
      if(width > MAX || height > MAX){
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

      if(isImg) target.src = dataUrl;
      else target.style.backgroundImage = `url('${dataUrl}')`;

      recordUndo(() => {
        if(isImg) target.src = prevValue;
        else target.style.backgroundImage = prevValue;
      });
      saveDraft();
      toast("Image mise à jour");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// ---------------------------------------------------------------
// Ajout d'un tag
// ---------------------------------------------------------------
function addTagButton(row, isStack){
  if(row.querySelector(".editor-add-tag")) return;
  const doc = row.ownerDocument;
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = "editor-add-tag";
  btn.textContent = "+ tag";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const span = doc.createElement("span");
    if(isStack) span.className = "stack-tag";
    span.textContent = "Nouveau";
    span.dataset.fr = "Nouveau";
    span.dataset.en = "New";
    row.insertBefore(span, btn);
    wireTextElement(span);
    addBadges(span, [{ icon:"✕", title:"Supprimer ce tag", danger:true, onClick:() => removeSimple(span) }]);
    span.focus();
    const range = doc.createRange();
    range.selectNodeContents(span);
    const sel = doc.defaultView.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    recordUndo(() => span.remove());
    saveDraft();
  });
  row.appendChild(btn);
}

// ---------------------------------------------------------------
// Ajout / suppression de projets — seul cas qui recharge la page
// (nécessaire pour que main.js reconnaisse les nouveaux éléments).
// Non couvert par Ctrl+Z ; la suppression demande confirmation.
// ---------------------------------------------------------------
function nextProjectId(doc){
  const ids = [...doc.querySelectorAll(".project-drawer")].map(d => d.dataset.drawer);
  let n = 1;
  while(ids.includes("p" + n)) n++;
  return "p" + n;
}

function projectTemplate(){
  return `
    <div class="page">
      <div class="page__text">
        <p class="page__pitch" data-fr="Résumé du projet en une phrase." data-en="One-sentence project summary.">Résumé du projet en une phrase.</p>
        <h3 data-fr="Nom du projet" data-en="Project name">Nom du projet</h3>
        <p class="page__tags"><span data-fr="Tag 1" data-en="Tag 1">Tag 1</span><span data-fr="Tag 2" data-en="Tag 2">Tag 2</span><span data-fr="Année" data-en="Year">Année</span></p>
        <p data-fr="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Décris ici le projet." data-en="Lorem ipsum dolor sit amet, consectetur adipiscing elit. Describe the project here.">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Décris ici le projet.</p>
        <a href="#" class="itch-link" data-fr="Voir sur itch.io ↗" data-en="View on itch.io ↗">Voir sur itch.io ↗</a>
      </div>
      <img class="page__img" src="https://placehold.co/460x300/1B2A4A/F7F3EC?text=Overview" alt="">
    </div>
    <div class="page">
      <div class="page__text">
        <h3 data-fr="Fonctionnalités clés" data-en="Key Features">Fonctionnalités clés</h3>
        <ul class="page__list">
          <li data-fr="<strong>Feature 1 —</strong> description courte." data-en="<strong>Feature 1 —</strong> short description."><strong>Feature 1 —</strong> description courte.</li>
          <li data-fr="<strong>Feature 2 —</strong> description courte." data-en="<strong>Feature 2 —</strong> short description."><strong>Feature 2 —</strong> description courte.</li>
          <li data-fr="<strong>Feature 3 —</strong> description courte." data-en="<strong>Feature 3 —</strong> short description."><strong>Feature 3 —</strong> description courte.</li>
        </ul>
        <a href="#" class="itch-link" data-fr="Voir sur itch.io ↗" data-en="View on itch.io ↗">Voir sur itch.io ↗</a>
      </div>
      <img class="page__img" src="https://placehold.co/460x300/E4483F/1B2A4A?text=Features" alt="">
    </div>
    <div class="page">
      <div class="page__text">
        <h3 data-fr="Mon rôle" data-en="My Role">Mon rôle</h3>
        <p class="page__meta" data-fr="Équipe · durée" data-en="Team · duration">Équipe · durée</p>
        <ul class="page__list">
          <li data-fr="Mission 1" data-en="Task 1">Mission 1</li>
          <li data-fr="Mission 2" data-en="Task 2">Mission 2</li>
        </ul>
        <a href="#" class="itch-link" data-fr="Voir sur itch.io ↗" data-en="View on itch.io ↗">Voir sur itch.io ↗</a>
      </div>
      <img class="page__img" src="https://placehold.co/460x300/F2C94C/1B2A4A?text=Role" alt="">
    </div>
    <div class="page">
      <div class="page__text">
        <h3 data-fr="Résultats" data-en="Results">Résultats</h3>
        <div class="page__stats">
          <div class="stat"><strong>0</strong><span data-fr="métrique" data-en="metric">métrique</span></div>
          <div class="stat"><strong>0</strong><span data-fr="métrique" data-en="metric">métrique</span></div>
        </div>
        <p data-fr="Bilan et enseignements du projet." data-en="Recap and lessons learned.">Bilan et enseignements du projet.</p>
      </div>
      <img class="page__img" src="https://placehold.co/460x300/1B2A4A/F7F3EC?text=Results" alt="">
    </div>
  `;
}

btnAddProject.addEventListener("click", () => {
  const doc = frame.contentDocument;
  const id = nextProjectId(doc);
  const pillRow = doc.querySelector(".pill-row");
  const stage = doc.getElementById("projectsStage");

  const pill = doc.createElement("button");
  pill.className = "pill";
  pill.dataset.project = id;
  pill.textContent = "Nouveau projet";
  pillRow.appendChild(pill);

  const drawer = doc.createElement("div");
  drawer.className = "project-drawer";
  drawer.dataset.drawer = id;
  drawer.innerHTML = `<div class="drawer__scroll">${projectTemplate()}</div><div class="scrollbar-track"><div class="scrollbar-thumb"></div></div>`;
  stage.appendChild(drawer);

  reloadFromCurrentState(() => toast("Nouveau projet ajouté — clique dessus pour le remplir"));
});

function removeProject(id){
  if(!confirm("Supprimer ce projet et ses 4 pages ? Cette action n'est pas annulable avec Ctrl+Z.")) return;
  const doc = frame.contentDocument;
  doc.querySelector(`.pill[data-project="${id}"]`)?.remove();
  doc.querySelector(`.project-drawer[data-drawer="${id}"]`)?.remove();
  reloadFromCurrentState(() => toast("Projet supprimé"));
}

function reloadFromCurrentState(afterCallback){
  const doc = frame.contentDocument;
  const html = doc.documentElement.outerHTML;
  loadHtmlIntoFrame(html, () => {
    injectEditing();
    saveDraft();
    afterCallback && afterCallback();
  });
}

// ---------------------------------------------------------------
// Couleurs
// ---------------------------------------------------------------
function applyColorsToFrame(){
  const doc = frame.contentDocument;
  if(!doc) return;
  Object.entries(colorInputs).forEach(([varName, input]) => {
    doc.documentElement.style.setProperty(varName, input.value);
  });
}
function syncColorInputsFromFrame(doc){
  const computed = doc.defaultView.getComputedStyle(doc.documentElement);
  Object.entries(colorInputs).forEach(([varName, input]) => {
    const val = computed.getPropertyValue(varName).trim();
    if(/^#[0-9a-f]{6}$/i.test(val)) input.value = val;
  });
}
Object.values(colorInputs).forEach(input => {
  input.addEventListener("input", () => { applyColorsToFrame(); scheduleSave(); });
});

// ---------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------
function scheduleSave(){
  saveStatus.textContent = "Sauvegarde…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 500);
}
function saveDraft(){
  try{
    const doc = frame.contentDocument;
    const html = doc.documentElement.outerHTML;
    localStorage.setItem(DRAFT_KEY, html);
    saveStatus.textContent = "Brouillon à jour";
  }catch(err){
    saveStatus.textContent = "⚠ Sauvegarde impossible (quota)";
    toast("Trop de modifications pour la sauvegarde auto — télécharge le site pour ne rien perdre");
  }
}

// ---------------------------------------------------------------
// Téléchargement — nettoyage complet des artefacts de l'éditeur
// ---------------------------------------------------------------
btnDownload.addEventListener("click", () => {
  const doc = frame.contentDocument;
  const clone = doc.documentElement.cloneNode(true);

  clone.querySelectorAll("[contenteditable]").forEach(el => el.removeAttribute("contenteditable"));
  clone.querySelectorAll(".editor-add-tag, .editor-badges").forEach(el => el.remove());
  clone.querySelectorAll(".editor-img-wrap").forEach(wrap => wrap.replaceWith(...wrap.childNodes));
  clone.querySelector("#editor-injected-style")?.remove();
  clone.querySelector("base[href]")?.remove();

  const html = "<!DOCTYPE html>\n" + clone.outerHTML;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "index.html";
  a.click();
  URL.revokeObjectURL(url);
  toast("Téléchargé — remplace ton index.html sur GitHub avec ce fichier");
});

// ---------------------------------------------------------------
// Repartir de zéro
// ---------------------------------------------------------------
btnReset.addEventListener("click", () => {
  if(!confirm("Effacer toutes les modifications en cours et repartir du site actuel ?")) return;
  localStorage.removeItem(DRAFT_KEY);
  undoStack = [];
  btnUndo.disabled = true;
  frame.addEventListener("load", () => { injectEditing(); toast("Repartie de zéro"); }, { once: true });
  frame.src = "../index.html?_=" + Date.now();
});
