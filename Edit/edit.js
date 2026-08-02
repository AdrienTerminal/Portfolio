/* ==================================================================
   ÉDITEUR VISUEL v4

   - Badges d'action (icônes SVG, pas d'emoji) sur les éléments
     simples : images, liens, réseaux, tabs, pills.
   - Les pages de projet (tags, listes, stats, blocs, images, liens)
     s'éditent dans un panneau dédié, spacieux — plus d'entassement
     de badges sur des petits tags.
   - Couleurs conscientes du thème clair/sombre : personnaliser en
     sombre ne touche jamais le clair, et inversement. 10 palettes
     prêtes à l'emploi par thème.
   - Ctrl+Z restaure directement la valeur précédente, sans jamais
     recharger la page — sauf ajout/suppression de projet (protégé
     par confirmation à la place).

   ⚠️ Doit tourner sur http(s):// — pas en double-clic sur le fichier.
================================================================== */

const DRAFT_KEY = "portfolio_editor_draft_v4";

const frame          = document.getElementById("siteFrame");
const btnDownload     = document.getElementById("btnDownload");
const btnReset         = document.getElementById("btnReset");
const btnUndo          = document.getElementById("btnUndo");
const btnAddProject    = document.getElementById("btnAddProject");
const saveStatus       = document.getElementById("saveStatus");
const fileInput        = document.getElementById("fileInput");
const toastEl          = document.getElementById("toast");

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

// ---------------------------------------------------------------
// Icônes — SVG monochromes, jamais d'emoji
// ---------------------------------------------------------------
const ICONS = {
  image:  `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="3" width="13" height="10" rx="1.2"/><circle cx="5.5" cy="6.8" r="1.1"/><path d="M2 11.5l3.2-3.2 2.6 2.6 2-2 3.2 3.2"/></svg>`,
  link:   `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.3 9.7l3.4-3.4M6 5.6 7.3 4.3a2.3 2.3 0 0 1 3.3 3.3L9.3 8.9M10 10.4l-1.3 1.3a2.3 2.3 0 0 1-3.3-3.3L6.7 7.1"/></svg>`,
  delete: `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
  rename: `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M10.5 2.5l3 3-7.6 7.6H3v-2.9l7.5-7.7Z"/></svg>`,
  edit:   `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"><path d="M10.5 2.5l3 3-7.6 7.6H3v-2.9l7.5-7.7Z"/></svg>`,
};

function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("is-visible");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("is-visible"), 2600);
}

// ---------------------------------------------------------------
// Undo
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
// Popovers (aide + palettes) — se ferment au clic dehors, MÊME si
// ce clic a lieu à l'intérieur de l'iframe, et via un bouton ✕ direct.
// ---------------------------------------------------------------
const btnHelp = document.getElementById("btnHelp");
const helpPopover = document.getElementById("helpPopover");
const helpClose = document.getElementById("helpClose");

function toggleHelp(){ helpPopover.hidden = !helpPopover.hidden; }
function closeHelp(){ helpPopover.hidden = true; }
btnHelp.addEventListener("click", (e) => { e.stopPropagation(); toggleHelp(); });
helpClose.addEventListener("click", closeHelp);

const btnPalettes = document.getElementById("btnPalettes");
const palettePopover = document.getElementById("palettePopover");
const paletteGrid = document.getElementById("paletteGrid");
const paletteContext = document.getElementById("paletteContext");
const paletteClose = document.getElementById("paletteClose");

function togglePalettes(){
  palettePopover.hidden = !palettePopover.hidden;
  if(!palettePopover.hidden) buildPalettePopover();
}
function closePalettes(){ palettePopover.hidden = true; }
btnPalettes.addEventListener("click", (e) => { e.stopPropagation(); togglePalettes(); });
paletteClose.addEventListener("click", closePalettes);

document.addEventListener("click", (e) => {
  if(!helpPopover.hidden && !helpPopover.contains(e.target) && e.target !== btnHelp) closeHelp();
  if(!palettePopover.hidden && !palettePopover.contains(e.target) && !btnPalettes.contains(e.target)) closePalettes();
});

// ---------------------------------------------------------------
// Couleurs — conscientes du thème clair/sombre du site. Chaque
// thème a son propre jeu de 4 variables, appliqué via une règle CSS
// scopée (jamais de style inline qui écraserait l'autre thème).
// ---------------------------------------------------------------
let colorOverrides = { light:{}, dark:{} };

function currentTheme(doc){
  return doc && doc.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function applyColorsToFrame(){
  const doc = frame.contentDocument;
  if(!doc) return;
  const theme = currentTheme(doc);
  Object.entries(colorInputs).forEach(([varName, input]) => {
    colorOverrides[theme][varName] = input.value;
  });
  renderColorOverrideStyle(doc);
}

function renderColorOverrideStyle(doc){
  let styleEl = doc.getElementById("editor-color-override");
  if(!styleEl){
    styleEl = doc.createElement("style");
    styleEl.id = "editor-color-override";
    doc.head.appendChild(styleEl);
  }
  const lightVars = Object.entries(colorOverrides.light).map(([k,v]) => `${k}:${v};`).join("");
  const darkVars  = Object.entries(colorOverrides.dark).map(([k,v]) => `${k}:${v};`).join("");
  styleEl.textContent =
    (lightVars ? `html:not([data-theme="dark"]){ ${lightVars} }\n` : "") +
    (darkVars  ? `html[data-theme="dark"]{ ${darkVars} }` : "");
}

function syncColorInputsFromFrame(doc){
  const theme = currentTheme(doc);
  const computed = doc.defaultView.getComputedStyle(doc.documentElement);
  Object.entries(colorInputs).forEach(([varName, input]) => {
    const stored = colorOverrides[theme][varName];
    if(stored){ input.value = stored; return; }
    const val = computed.getPropertyValue(varName).trim();
    if(/^#[0-9a-f]{6}$/i.test(val)) input.value = val;
  });
}

Object.values(colorInputs).forEach(input => {
  input.addEventListener("input", () => { applyColorsToFrame(); scheduleSave(); });
});

// Regarde si le site bascule de thème (clic sur le switch à l'intérieur
// de l'iframe) pour re-synchroniser pastilles + liste de palettes.
function watchThemeChanges(doc){
  if(doc._themeObserverBound) return;
  doc._themeObserverBound = true;
  const observer = new MutationObserver(() => {
    syncColorInputsFromFrame(doc);
    if(!palettePopover.hidden) buildPalettePopover();
  });
  observer.observe(doc.documentElement, { attributes:true, attributeFilter:["data-theme"] });
}

// ---------------------------------------------------------------
// Palettes prêtes à l'emploi — 10 en clair, 10 en sombre, choisies
// en couleurs complémentaires avec assez de contraste texte/fond.
// ---------------------------------------------------------------
const LIGHT_PALETTES = [
  { name:"Corail & Nuit",   red:"#e4483f", ink:"#1b2a4a", yellow:"#f2c94c", paper:"#f2e9d8" },
  { name:"Émeraude Chaude", red:"#e07a3f", ink:"#123524", yellow:"#d4a24c", paper:"#eef2e6" },
  { name:"Violet Doux",     red:"#8b5cf6", ink:"#1e1b3a", yellow:"#f2c94c", paper:"#f3efff" },
  { name:"Corail Estival",  red:"#ff6b4a", ink:"#2b1b17", yellow:"#ffb84d", paper:"#fff3e8" },
  { name:"Bleu Glacier",    red:"#3b82f6", ink:"#0f2942", yellow:"#e8965a", paper:"#eaf3fa" },
  { name:"Rose Poudré",     red:"#d1495b", ink:"#2e2532", yellow:"#e8b4bc", paper:"#faf1ee" },
  { name:"Forêt Automne",   red:"#c1440e", ink:"#22331b", yellow:"#e0a458", paper:"#f2ede1" },
  { name:"Terracotta",      red:"#c1502e", ink:"#3d2b1f", yellow:"#dba159", paper:"#f5e9d9" },
  { name:"Menthe Fraîche",  red:"#ef6461", ink:"#16302b", yellow:"#e4b363", paper:"#eef7f2" },
  { name:"Prune & Or",      red:"#a44a3f", ink:"#2f1e2e", yellow:"#d4af37", paper:"#f4ece6" },
];

const DARK_PALETTES = [
  { name:"Corail & Nuit",   red:"#ff6259", ink:"#f0eee6", yellow:"#ffd166", paper:"#12141c" },
  { name:"Émeraude Sombre", red:"#4fd1a5", ink:"#eaf5ee", yellow:"#e8c468", paper:"#0f1a15" },
  { name:"Violet Cyber",    red:"#a78bfa", ink:"#f1edff", yellow:"#fbbf24", paper:"#161226" },
  { name:"Braise",          red:"#ff7a59", ink:"#fbe9e0", yellow:"#ffb454", paper:"#1a1210" },
  { name:"Glacier Nuit",    red:"#60a5fa", ink:"#e8f1fb", yellow:"#f0b45e", paper:"#0d1520" },
  { name:"Rose Nuit",       red:"#f472b6", ink:"#fbe8f0", yellow:"#f3d17a", paper:"#1c1218" },
  { name:"Automne Sombre",  red:"#e8874a", ink:"#f2e9db", yellow:"#e0b464", paper:"#191410" },
  { name:"Terracotta Nuit", red:"#e0784f", ink:"#f5e6d8", yellow:"#e4b56a", paper:"#1b1410" },
  { name:"Menthe Nuit",     red:"#ef8477", ink:"#e3f5ec", yellow:"#e8c26e", paper:"#0e1815" },
  { name:"Prune & Or Nuit", red:"#d17a6a", ink:"#f2e6ec", yellow:"#e8c458", paper:"#1a1420" },
];

function buildPalettePopover(){
  const doc = frame.contentDocument;
  const theme = currentTheme(doc);
  const list = theme === "dark" ? DARK_PALETTES : LIGHT_PALETTES;
  paletteContext.textContent = "Palettes — " + (theme === "dark" ? "sombre" : "clair");
  paletteGrid.innerHTML = "";
  list.forEach(p => {
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
      closePalettes();
      toast(`Palette "${p.name}" appliquée`);
    });
    paletteGrid.appendChild(btn);
  });
}

// ---------------------------------------------------------------
// Chargement fiable de l'iframe (vraie navigation vers un Blob avec
// <base> explicite) + filet de sécurité si la page semble cassée.
// ---------------------------------------------------------------
function loadHtmlIntoFrame(html, callback){
  let finalHtml = /^\s*<!doctype/i.test(html) ? html : "<!DOCTYPE html>\n" + html;
  const baseUrl = new URL("../index.html", window.location.href).href;
  finalHtml = finalHtml.replace(/<base[^>]*>/gi, "");
  finalHtml = finalHtml.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n<base href="${baseUrl}">`);

  const blob = new Blob([finalHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  function onLoad(){
    frame.removeEventListener("load", onLoad);
    URL.revokeObjectURL(url);

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
    loadHtmlIntoFrame(draft, () => { toast("Brouillon précédent restauré"); injectEditing(); });
  }else{
    injectEditing();
  }
}

// ---------------------------------------------------------------
// Injection des capacités d'édition
// ---------------------------------------------------------------
function injectEditing(){
  const doc = frame.contentDocument;
  if(!doc) return;

  syncColorInputsFromFrame(doc);
  renderColorOverrideStyle(doc);
  watchThemeChanges(doc);

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
        width:22px; height:22px; border-radius:50%;
        background:rgba(20,20,24,.82); border:1.5px solid #5B8DEF;
        color:#fff; display:flex; align-items:center; justify-content:center;
        cursor:pointer; padding:0;
      }
      .editor-badge:hover{ background:#5B8DEF; }
      .editor-badge--danger{ border-color:#E4483F; }
      .editor-badge--danger:hover{ background:#E4483F; }
      .editor-img-wrap{ position:relative; width:100%; height:100%; }
      .editor-add-tag{
        font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700;
        color:#5B8DEF; background:transparent; border:1.5px dashed #5B8DEF;
        border-radius:100px; padding:3px 9px; cursor:pointer; opacity:.7;
      }
      .editor-add-tag:hover{ opacity:1; background:rgba(91,141,239,.12); }
    `;
    doc.head.appendChild(style);
  }

  doc.querySelectorAll(TEXT_SELECTOR).forEach(wireTextElement);

  // About me : le stack technique garde son "+ tag" simple, comme avant
  doc.querySelectorAll(".stack-row").forEach(row => addTagButton(row));

  // Images
  const avatarImg = doc.querySelector(".avatar");
  if(avatarImg) addBadges(doc.querySelector(".avatar-frame") || avatarImg, [
    { icon:"image", title:"Changer la photo", onClick:() => openImagePicker(avatarImg) },
  ]);
  doc.querySelectorAll(".page__img").forEach(img => {
    const wrap = wrapImageForBadge(img);
    addBadges(wrap, [{ icon:"image", title:"Changer l'image", onClick:() => openImagePicker(img) }]);
  });
  doc.querySelectorAll(".occupation").forEach(occ => {
    addBadges(occ, [{ icon:"image", title:"Changer l'image de fond", onClick:() => openImagePicker(occ) }]);
  });

  // itch-link : lien seulement — suppression et tags gérés dans le
  // panneau de projet désormais
  doc.querySelectorAll(".itch-link").forEach(a => {
    addBadges(a, [{ icon:"link", title:"Changer l'URL", onClick:() => editLink(a) }]);
  });

  const resumeBtn = doc.querySelector(".resume-btn");
  if(resumeBtn) addBadges(resumeBtn, [{ icon:"link", title:"Changer l'URL", onClick:() => editLink(resumeBtn) }]);

  doc.querySelectorAll(".socials li").forEach(li => {
    addBadges(li, [{ icon:"delete", title:"Retirer ce réseau", danger:true, onClick:() => removeSimple(li) }]);
  });
  doc.querySelectorAll(".socials a").forEach(a => {
    if(a._socialWired) return;
    a._socialWired = true;
    a.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); editLink(a); });
  });

  // Stack technique (About me) : suppression seulement, texte déjà éditable
  doc.querySelectorAll(".stack-tag").forEach(tag => {
    addBadges(tag, [{ icon:"delete", title:"Supprimer ce tag", danger:true, onClick:() => removeSimple(tag) }]);
  });

  // Tabs : renommer seulement
  doc.querySelectorAll(".tab").forEach(tab => {
    addBadges(tab, [{ icon:"rename", title:"Renommer", onClick:() => renameSimple(tab) }]);
  });

  // Pills : ouvre le panneau complet du projet (plus un simple prompt)
  doc.querySelectorAll(".pill").forEach(pill => {
    addBadges(pill, [
      { icon:"edit", title:"Éditer ce projet en détail", onClick:() => openProjectEditor(pill.dataset.project) },
      { icon:"delete", title:"Supprimer ce projet", danger:true, onClick:() => removeProject(pill.dataset.project) },
    ]);
  });

  // Ferme les popovers si on clique dans l'iframe (sinon ils restent
  // ouverts au-dessus pendant qu'on édite, gênant)
  if(!doc._closesPopovers){
    doc._closesPopovers = true;
    doc.addEventListener("click", () => { closeHelp(); closePalettes(); }, true);
  }
}

// <img> ne peut pas avoir d'enfants : on l'enveloppe pour positionner un badge
function wrapImageForBadge(img){
  if(img.parentElement && img.parentElement.classList.contains("editor-img-wrap")) return img.parentElement;
  const doc = img.ownerDocument;
  const wrap = doc.createElement("div");
  wrap.className = "editor-img-wrap";
  img.parentNode.insertBefore(wrap, img);
  wrap.appendChild(img);
  return wrap;
}

// Badge d'action générique — des <span>, jamais des <button> : ces
// badges finissent parfois à l'intérieur d'un <button> ou d'un <a>
// (pill, tab, itch-link...) et un bouton imbriqué dans un bouton est
// du HTML invalide, ce que le navigateur "corrige" en cassant la
// page au rechargement. Un <span> avec juste un clic JS reste
// valide partout, sans ce risque.
function addBadges(hostEl, actions){
  if(hostEl.querySelector(":scope > .editor-badges")) return;
  const doc = hostEl.ownerDocument;
  hostEl.style.position = "relative";
  const wrap = doc.createElement("span");
  wrap.className = "editor-badges";
  wrap.setAttribute("contenteditable", "false");
  actions.forEach(a => {
    const btn = doc.createElement("span");
    btn.className = "editor-badge" + (a.danger ? " editor-badge--danger" : "");
    btn.innerHTML = ICONS[a.icon] || "";
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

function renameSimple(el){
  const prev = el.textContent.trim();
  const next = prompt("Nouveau texte :", prev);
  if(next === null || next.trim() === "") return;
  el.textContent = next.trim();
  recordUndo(() => { el.textContent = prev; });
  saveDraft();
  toast("Renommé");
}

function editLink(el){
  const prev = el.getAttribute("href") || "";
  const next = prompt("Nouvelle URL :", prev);
  if(next === null || next.trim() === "") return;
  el.setAttribute("href", next.trim());
  recordUndo(() => el.setAttribute("href", prev));
  saveDraft();
  toast("Lien mis à jour");
}

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
  peImageTargetPage = null;
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
        width = Math.round(width * ratio); height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

      if(isImg) target.src = dataUrl; else target.style.backgroundImage = `url('${dataUrl}')`;
      recordUndo(() => { if(isImg) target.src = prevValue; else target.style.backgroundImage = prevValue; });
      saveDraft();
      toast("Image mise à jour");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// ---------------------------------------------------------------
// "+ tag" simple, gardé pour le stack technique d'About me
// ---------------------------------------------------------------
function addTagButton(row){
  if(row.querySelector(".editor-add-tag")) return;
  const doc = row.ownerDocument;
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = "editor-add-tag";
  btn.textContent = "+ tag";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const span = doc.createElement("span");
    span.className = "stack-tag";
    span.textContent = "Nouveau";
    span.dataset.fr = "Nouveau"; span.dataset.en = "New";
    row.insertBefore(span, btn);
    wireTextElement(span);
    addBadges(span, [{ icon:"delete", title:"Supprimer ce tag", danger:true, onClick:() => removeSimple(span) }]);
    span.focus();
    const range = doc.createRange(); range.selectNodeContents(span);
    const sel = doc.defaultView.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    recordUndo(() => span.remove());
    saveDraft();
  });
  row.appendChild(btn);
}

/* ==================================================================
   PANNEAU D'ÉDITION DE PROJET — liberté complète sur les pages :
   ajouter/supprimer/réordonner des pages et des blocs (titre, texte,
   tags, liste, stats, lien, image). On lit l'état actuel depuis le
   DOM à l'ouverture, on travaille sur une copie JS dans le panneau,
   et "Appliquer" réécrit le tiroir du projet en une fois.
================================================================== */
const projectEditor   = document.getElementById("projectEditor");
const peBackdrop       = document.getElementById("peBackdrop");
const peCloseBtn        = document.getElementById("peCloseBtn");
const pePagesList        = document.getElementById("pePagesList");
const peAddPage           = document.getElementById("peAddPage");
const peApply              = document.getElementById("peApply");
const peProjectLabel        = document.getElementById("peProjectLabel");

let peState = null;        // { projectId, pillLabel, pages:[{imgSrc, blocks:[...]}] }
let peCurrentPillEl = null;

const BLOCK_DEFS = {
  title:  { label:"Titre",        make:() => ({ type:"title", fr:"Titre", en:"Title" }) },
  text:   { label:"Texte",        make:() => ({ type:"text", fr:"Lorem ipsum dolor sit amet.", en:"Lorem ipsum dolor sit amet." }) },
  pitch:  { label:"Accroche",     make:() => ({ type:"pitch", fr:"Résumé en une phrase.", en:"One-sentence summary." }) },
  meta:   { label:"Ligne meta",   make:() => ({ type:"meta", fr:"Équipe · durée", en:"Team · duration" }) },
  tags:   { label:"Tags",         make:() => ({ type:"tags", items:[{fr:"Tag", en:"Tag"}] }) },
  list:   { label:"Liste",        make:() => ({ type:"list", items:[{fr:"Élément", en:"Item"}] }) },
  stats:  { label:"Statistiques", make:() => ({ type:"stats", items:[{number:"0", fr:"métrique", en:"metric"}] }) },
  link:   { label:"Lien itch.io", make:() => ({ type:"link", href:"#", fr:"Voir sur itch.io ↗", en:"View on itch.io ↗" }) },
};

// ---- Lecture du DOM vers l'état JS du panneau ----
function readProjectState(projectId){
  const doc = frame.contentDocument;
  const pill = doc.querySelector(`.pill[data-project="${projectId}"]`);
  const drawer = doc.querySelector(`.project-drawer[data-drawer="${projectId}"]`);
  const pages = [...drawer.querySelectorAll(".page")].map(page => {
    const img = page.querySelector(".page__img");
    const textEl = page.querySelector(".page__text");
    const blocks = [];
    [...textEl.children].forEach(child => {
      if(child.classList.contains("editor-badges")) return;
      if(child.tagName === "H3"){
        blocks.push({ type:"title", fr:child.dataset.fr || child.textContent, en:child.dataset.en || child.textContent });
      }else if(child.classList.contains("page__pitch")){
        blocks.push({ type:"pitch", fr:child.dataset.fr || child.textContent, en:child.dataset.en || child.textContent });
      }else if(child.classList.contains("page__meta")){
        blocks.push({ type:"meta", fr:child.dataset.fr || child.textContent, en:child.dataset.en || child.textContent });
      }else if(child.classList.contains("page__tags")){
        blocks.push({ type:"tags", items:[...child.children].filter(c=>!c.classList.contains("editor-badges")).map(s => ({ fr:s.dataset.fr || s.textContent, en:s.dataset.en || s.textContent })) });
      }else if(child.classList.contains("page__list")){
        blocks.push({ type:"list", items:[...child.children].map(li => ({ fr:(li.dataset.fr || li.textContent).replace(/<\/?strong>/g,""), en:(li.dataset.en || li.textContent).replace(/<\/?strong>/g,"") })) });
      }else if(child.classList.contains("page__stats")){
        blocks.push({ type:"stats", items:[...child.children].map(s => ({ number:s.querySelector("strong")?.textContent || "", fr:s.querySelector("span")?.dataset.fr || s.querySelector("span")?.textContent || "", en:s.querySelector("span")?.dataset.en || s.querySelector("span")?.textContent || "" })) });
      }else if(child.classList.contains("itch-link")){
        blocks.push({ type:"link", href:child.getAttribute("href") || "#", fr:child.dataset.fr || child.textContent, en:child.dataset.en || child.textContent });
      }else if(child.tagName === "P"){
        blocks.push({ type:"text", fr:child.dataset.fr || child.textContent, en:child.dataset.en || child.textContent });
      }
    });
    return { imgSrc: img ? img.src : "", blocks };
  });
  return { projectId, pillLabel: pill.textContent.trim(), pages };
}

// ---- Construction d'éléments DOM depuis l'état (jamais de HTML texte : pas de risque d'échappement) ----
function buildPageElement(doc, pageData){
  const page = doc.createElement("div");
  page.className = "page";
  const textWrap = doc.createElement("div");
  textWrap.className = "page__text";

  pageData.blocks.forEach(b => {
    let el = null;
    if(b.type === "title"){ el = doc.createElement("h3"); el.textContent = b.fr; el.dataset.fr = b.fr; el.dataset.en = b.en; }
    else if(b.type === "pitch"){ el = doc.createElement("p"); el.className = "page__pitch"; el.textContent = b.fr; el.dataset.fr = b.fr; el.dataset.en = b.en; }
    else if(b.type === "meta"){ el = doc.createElement("p"); el.className = "page__meta"; el.textContent = b.fr; el.dataset.fr = b.fr; el.dataset.en = b.en; }
    else if(b.type === "text"){ el = doc.createElement("p"); el.textContent = b.fr; el.dataset.fr = b.fr; el.dataset.en = b.en; }
    else if(b.type === "tags"){
      el = doc.createElement("p"); el.className = "page__tags";
      b.items.forEach(t => { const s = doc.createElement("span"); s.textContent = t.fr; s.dataset.fr = t.fr; s.dataset.en = t.en; el.appendChild(s); });
    }
    else if(b.type === "list"){
      el = doc.createElement("ul"); el.className = "page__list";
      b.items.forEach(li => { const l = doc.createElement("li"); l.textContent = li.fr; l.dataset.fr = li.fr; l.dataset.en = li.en; el.appendChild(l); });
    }
    else if(b.type === "stats"){
      el = doc.createElement("div"); el.className = "page__stats";
      b.items.forEach(s => {
        const d = doc.createElement("div"); d.className = "stat";
        const strong = doc.createElement("strong"); strong.textContent = s.number;
        const span = doc.createElement("span"); span.textContent = s.fr; span.dataset.fr = s.fr; span.dataset.en = s.en;
        d.appendChild(strong); d.appendChild(span); el.appendChild(d);
      });
    }
    else if(b.type === "link"){
      el = doc.createElement("a"); el.className = "itch-link"; el.href = b.href || "#";
      el.textContent = b.fr; el.dataset.fr = b.fr; el.dataset.en = b.en;
    }
    if(el) textWrap.appendChild(el);
  });

  page.appendChild(textWrap);
  const img = doc.createElement("img");
  img.className = "page__img";
  img.src = pageData.imgSrc || "https://placehold.co/460x300/1B2A4A/F7F3EC?text=Image";
  img.alt = "";
  page.appendChild(img);
  return page;
}

// ---- Ouverture / fermeture ----
function openProjectEditor(projectId){
  peState = readProjectState(projectId);
  peCurrentPillEl = frame.contentDocument.querySelector(`.pill[data-project="${projectId}"]`);
  peProjectLabel.value = peState.pillLabel;
  renderPanel();
  projectEditor.hidden = false;
}
function closeProjectEditor(){ projectEditor.hidden = true; peState = null; }
peCloseBtn.addEventListener("click", closeProjectEditor);
peBackdrop.addEventListener("click", closeProjectEditor);

// ---- Rendu du panneau depuis peState ----
function renderPanel(){
  pePagesList.innerHTML = "";
  peState.pages.forEach((page, pageIndex) => {
    pePagesList.appendChild(renderPageCard(page, pageIndex));
  });
}

function renderPageCard(page, pageIndex){
  const doc = document;
  const card = doc.createElement("div");
  card.className = "pe-page";

  // en-tête : n° de page + réordonner + supprimer la page
  const head = doc.createElement("div");
  head.className = "pe-page__head";
  head.innerHTML = `<span>Page ${pageIndex + 1} / ${peState.pages.length}</span>`;
  const actions = doc.createElement("div");
  actions.className = "pe-page__actions";
  actions.appendChild(peIconBtn("↑", "Monter", pageIndex === 0, () => movePage(pageIndex, -1)));
  actions.appendChild(peIconBtn("↓", "Descendre", pageIndex === peState.pages.length - 1, () => movePage(pageIndex, 1)));
  actions.appendChild(peIconBtn("✕", "Supprimer la page", peState.pages.length <= 1, () => removePage(pageIndex), true));
  head.appendChild(actions);
  card.appendChild(head);

  // image de la page
  const imgRow = doc.createElement("div");
  imgRow.className = "pe-page__image";
  const thumb = doc.createElement("img");
  thumb.src = page.imgSrc || "https://placehold.co/80x56/1B2A4A/F7F3EC?text=%20";
  const changeBtn = doc.createElement("button");
  changeBtn.type = "button"; changeBtn.className = "tbtn"; changeBtn.textContent = "Changer l'image";
  changeBtn.addEventListener("click", () => {
    currentImageTarget = null;
    peImageTargetPage = page;
    peImageTargetThumb = thumb;
    fileInput.value = "";
    fileInput.click();
  });
  imgRow.appendChild(thumb); imgRow.appendChild(changeBtn);
  card.appendChild(imgRow);

  // blocs
  const blocksWrap = doc.createElement("div");
  blocksWrap.className = "pe-blocks";
  page.blocks.forEach((block, blockIndex) => {
    blocksWrap.appendChild(renderBlock(page, block, blockIndex));
  });
  card.appendChild(blocksWrap);

  // + ajouter un bloc
  const addRow = doc.createElement("div");
  addRow.className = "pe-add-block-row";
  Object.entries(BLOCK_DEFS).forEach(([key, def]) => {
    const b = doc.createElement("button");
    b.type = "button"; b.className = "tbtn"; b.textContent = "+ " + def.label;
    b.addEventListener("click", () => {
      page.blocks.push(def.make());
      renderPanel();
    });
    addRow.appendChild(b);
  });
  card.appendChild(addRow);

  return card;
}

let peImageTargetPage = null;
let peImageTargetThumb = null;

function peIconBtn(label, title, disabled, onClick, danger){
  const b = document.createElement("button");
  b.type = "button";
  b.className = "pe-icon" + (danger ? " pe-icon--danger" : "");
  b.textContent = label;
  b.title = title;
  b.disabled = !!disabled;
  if(!disabled) b.addEventListener("click", onClick);
  return b;
}

function movePage(index, dir){
  const target = index + dir;
  if(target < 0 || target >= peState.pages.length) return;
  const [p] = peState.pages.splice(index, 1);
  peState.pages.splice(target, 0, p);
  renderPanel();
}
function removePage(index){
  if(peState.pages.length <= 1) return;
  peState.pages.splice(index, 1);
  renderPanel();
}

function renderBlock(page, block, blockIndex){
  const doc = document;
  const wrap = doc.createElement("div");
  wrap.className = "pe-block";

  const head = doc.createElement("div");
  head.className = "pe-block__head";
  const label = doc.createElement("span");
  label.className = "pe-block__label";
  label.textContent = BLOCK_DEFS[block.type]?.label || block.type;
  const actions = doc.createElement("div");
  actions.className = "pe-page__actions";
  actions.appendChild(peIconBtn("↑", "Monter", blockIndex === 0, () => { swapBlocks(page, blockIndex, blockIndex - 1); }));
  actions.appendChild(peIconBtn("↓", "Descendre", blockIndex === page.blocks.length - 1, () => { swapBlocks(page, blockIndex, blockIndex + 1); }));
  actions.appendChild(peIconBtn("✕", "Supprimer ce bloc", false, () => { page.blocks.splice(blockIndex, 1); renderPanel(); }, true));
  head.appendChild(label); head.appendChild(actions);
  wrap.appendChild(head);

  wrap.appendChild(renderBlockBody(block));
  return wrap;
}

function swapBlocks(page, i, j){
  if(j < 0 || j >= page.blocks.length) return;
  [page.blocks[i], page.blocks[j]] = [page.blocks[j], page.blocks[i]];
  renderPanel();
}

function renderBlockBody(block){
  const doc = document;
  const body = doc.createElement("div");

  if(["title","text","pitch","meta"].includes(block.type)){
    const input = block.type === "text" ? doc.createElement("textarea") : doc.createElement("input");
    input.className = block.type === "text" ? "pe-textarea" : "pe-input";
    if(input.tagName === "INPUT") input.type = "text";
    input.value = block.fr;
    input.addEventListener("input", () => { block.fr = input.value; block.en = block.en === undefined ? input.value : block.en; });
    body.appendChild(input);
    return body;
  }

  if(block.type === "link"){
    const labelInput = doc.createElement("input");
    labelInput.className = "pe-input"; labelInput.type = "text"; labelInput.value = block.fr;
    labelInput.placeholder = "Texte du bouton";
    labelInput.addEventListener("input", () => { block.fr = labelInput.value; });
    const hrefInput = doc.createElement("input");
    hrefInput.className = "pe-input"; hrefInput.type = "text"; hrefInput.value = block.href;
    hrefInput.placeholder = "https://...";
    hrefInput.addEventListener("input", () => { block.href = hrefInput.value; });
    body.appendChild(labelInput); body.appendChild(hrefInput);
    return body;
  }

  if(block.type === "tags"){
    const editor = doc.createElement("div");
    editor.className = "pe-tag-editor";
    function renderTags(){
      editor.innerHTML = "";
      block.items.forEach((t, i) => {
        const chip = doc.createElement("span");
        chip.className = "pe-tag";
        chip.appendChild(doc.createTextNode(t.fr + " "));
        const x = doc.createElement("button");
        x.type = "button"; x.textContent = "✕";
        x.addEventListener("click", () => { block.items.splice(i, 1); renderTags(); });
        chip.appendChild(x);
        editor.appendChild(chip);
      });
      const input = doc.createElement("input");
      input.className = "pe-tag-input"; input.placeholder = "+ tag, Entrée";
      input.addEventListener("keydown", (e) => {
        if(e.key === "Enter" && input.value.trim()){
          block.items.push({ fr:input.value.trim(), en:input.value.trim() });
          renderTags();
        }
      });
      editor.appendChild(input);
    }
    renderTags();
    body.appendChild(editor);
    return body;
  }

  if(block.type === "list"){
    const editor = doc.createElement("div");
    function renderItems(){
      editor.innerHTML = "";
      block.items.forEach((li, i) => {
        const row = doc.createElement("div"); row.className = "pe-list-item";
        const input = doc.createElement("input"); input.className = "pe-input"; input.type = "text"; input.value = li.fr;
        input.addEventListener("input", () => { li.fr = input.value; li.en = input.value; });
        row.appendChild(input);
        row.appendChild(peIconBtn("✕", "Retirer", false, () => { block.items.splice(i, 1); renderItems(); }, true));
        editor.appendChild(row);
      });
      const addBtn = doc.createElement("button");
      addBtn.type = "button"; addBtn.className = "pe-add-small"; addBtn.textContent = "+ ligne";
      addBtn.addEventListener("click", () => { block.items.push({ fr:"Nouvel élément", en:"New item" }); renderItems(); });
      editor.appendChild(addBtn);
    }
    renderItems();
    body.appendChild(editor);
    return body;
  }

  if(block.type === "stats"){
    const editor = doc.createElement("div");
    function renderStats(){
      editor.innerHTML = "";
      block.items.forEach((s, i) => {
        const row = doc.createElement("div"); row.className = "pe-stat-item";
        const num = doc.createElement("input"); num.className = "pe-input"; num.type = "text"; num.value = s.number; num.placeholder = "1.2K";
        num.addEventListener("input", () => { s.number = num.value; });
        const lbl = doc.createElement("input"); lbl.className = "pe-input"; lbl.type = "text"; lbl.value = s.fr; lbl.placeholder = "libellé";
        lbl.addEventListener("input", () => { s.fr = lbl.value; s.en = lbl.value; });
        row.appendChild(num); row.appendChild(lbl);
        row.appendChild(peIconBtn("✕", "Retirer", false, () => { block.items.splice(i, 1); renderStats(); }, true));
        editor.appendChild(row);
      });
      const addBtn = doc.createElement("button");
      addBtn.type = "button"; addBtn.className = "pe-add-small"; addBtn.textContent = "+ statistique";
      addBtn.addEventListener("click", () => { block.items.push({ number:"0", fr:"métrique", en:"metric" }); renderStats(); });
      editor.appendChild(addBtn);
    }
    renderStats();
    body.appendChild(editor);
    return body;
  }

  return body;
}

// upload d'image ciblé sur une page du panneau (distinct de l'upload
// "rapide" sur le site en direct — même logique de redimensionnement)
fileInput.addEventListener("change", () => {
  if(!peImageTargetPage) return;
  const file = fileInput.files[0];
  if(!file) return;
  const img = new Image();
  const reader = new FileReader();
  reader.onload = (e) => {
    img.onload = () => {
      const MAX = 640;
      let { width, height } = img;
      if(width > MAX || height > MAX){
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio); height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      peImageTargetPage.imgSrc = dataUrl;
      if(peImageTargetThumb) peImageTargetThumb.src = dataUrl;
      peImageTargetPage = null; peImageTargetThumb = null;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

peAddPage.addEventListener("click", () => {
  peState.pages.push({ imgSrc:"", blocks:[BLOCK_DEFS.title.make(), BLOCK_DEFS.text.make()] });
  renderPanel();
});

peApply.addEventListener("click", () => {
  const doc = frame.contentDocument;
  const drawer = doc.querySelector(`.project-drawer[data-drawer="${peState.projectId}"]`);
  const scrollWrap = drawer.querySelector(".drawer__scroll");
  const prevHtml = scrollWrap.innerHTML;
  const prevLabel = peCurrentPillEl.textContent;

  scrollWrap.innerHTML = "";
  peState.pages.forEach(p => scrollWrap.appendChild(buildPageElement(doc, p)));

  const newLabel = peProjectLabel.value.trim() || prevLabel;
  peCurrentPillEl.textContent = newLabel;

  recordUndo(() => {
    scrollWrap.innerHTML = prevHtml;
    peCurrentPillEl.textContent = prevLabel;
    injectEditing();
  });

  injectEditing();
  saveDraft();
  closeProjectEditor();
  toast("Projet mis à jour");
});

/* ==================================================================
   AJOUT / SUPPRESSION DE PROJETS — seul cas qui recharge la page
   (nécessaire pour que main.js reconnaisse les nouveaux éléments).
   Non couvert par Ctrl+Z ; la suppression demande confirmation.
================================================================== */
function nextProjectId(doc){
  const ids = [...doc.querySelectorAll(".project-drawer")].map(d => d.dataset.drawer);
  let n = 1;
  while(ids.includes("p" + n)) n++;
  return "p" + n;
}

function defaultProjectPages(){
  return [
    { imgSrc:"https://placehold.co/460x300/1B2A4A/F7F3EC?text=Overview", blocks:[
      BLOCK_DEFS.pitch.make(), BLOCK_DEFS.title.make(), BLOCK_DEFS.tags.make(), BLOCK_DEFS.text.make(), BLOCK_DEFS.link.make(),
    ]},
    { imgSrc:"https://placehold.co/460x300/E4483F/1B2A4A?text=Features", blocks:[
      { type:"title", fr:"Fonctionnalités clés", en:"Key Features" }, BLOCK_DEFS.list.make(), BLOCK_DEFS.link.make(),
    ]},
    { imgSrc:"https://placehold.co/460x300/F2C94C/1B2A4A?text=Role", blocks:[
      { type:"title", fr:"Mon rôle", en:"My Role" }, BLOCK_DEFS.meta.make(), BLOCK_DEFS.list.make(), BLOCK_DEFS.link.make(),
    ]},
    { imgSrc:"https://placehold.co/460x300/1B2A4A/F7F3EC?text=Results", blocks:[
      { type:"title", fr:"Résultats", en:"Results" }, BLOCK_DEFS.stats.make(), BLOCK_DEFS.text.make(),
    ]},
  ];
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
  const scrollWrap = doc.createElement("div");
  scrollWrap.className = "drawer__scroll";
  defaultProjectPages().forEach(p => scrollWrap.appendChild(buildPageElement(doc, p)));
  drawer.appendChild(scrollWrap);

  const track = doc.createElement("div");
  track.className = "scrollbar-track";
  const thumb = doc.createElement("div");
  thumb.className = "scrollbar-thumb";
  track.appendChild(thumb);
  drawer.appendChild(track);

  stage.appendChild(drawer);

  reloadFromCurrentState(() => toast("Nouveau projet ajouté — clique sur son icône ✎ pour le remplir"));
});

function removeProject(id){
  if(!confirm("Supprimer ce projet et toutes ses pages ? Cette action n'est pas annulable avec Ctrl+Z.")) return;
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
  clone.querySelector("#editor-color-override")?.remove();
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
  colorOverrides = { light:{}, dark:{} };
  frame.addEventListener("load", () => { injectEditing(); toast("Repartie de zéro"); }, { once: true });
  frame.src = "../index.html?_=" + Date.now();
});
