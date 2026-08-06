/* ==================================================================
   ÉDITEUR VISUEL — Portfolio Colin Vialle, v1

   Mêmes mécanismes que l'éditeur d'Adrien Terminal : badges d'action
   sur images/liens, texte directement cliquable et bilingue (FR/EN),
   sauvegarde automatique via IndexedDB, Ctrl+Z, couleurs conscientes
   du thème clair/sombre, téléchargement d'un index.html propre.

   Différence structurelle : pas de panneau de projet à onglets — les
   projets de Colin sont de simples cartes, éditées directement sur
   place comme le reste du site.

   ⚠️ Doit tourner sur http(s):// — pas en double-clic sur le fichier.
================================================================== */

const DRAFT_KEY = "colin_portfolio_editor_draft_v1";

// ---------------------------------------------------------------
// Stockage du brouillon via IndexedDB (grande marge, y compris pour
// plusieurs images).
// ---------------------------------------------------------------
const IDB_NAME = "colin_portfolio_editor_store";
const IDB_STORE = "drafts";
let idbPromise = null;

function openIDB(){
  if(idbPromise) return idbPromise;
  idbPromise = new Promise((resolve, reject) => {
    if(!window.indexedDB){ reject(new Error("IndexedDB indisponible")); return; }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return idbPromise;
}
async function idbSet(key, value){
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet(key){
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbDelete(key){
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const frame        = document.getElementById("siteFrame");
const btnDownload   = document.getElementById("btnDownload");
const btnReset      = document.getElementById("btnReset");
const btnUndo       = document.getElementById("btnUndo");
const btnAddCard    = document.getElementById("btnAddCard");
const saveStatus    = document.getElementById("saveStatus");
const fileInput     = document.getElementById("fileInput");
const videoFileInput = document.getElementById("videoFileInput");
const toastEl       = document.getElementById("toast");

const colorInputs = {
  "--cyan": document.getElementById("colorCyan"),
  "--gold": document.getElementById("colorGold"),
  "--ink":  document.getElementById("colorInk"),
  "--bg":   document.getElementById("colorBg"),
};

let currentImageTarget = null;
let saveTimer = null;
let undoStack = [];
const MAX_UNDO = 60;

const TEXT_SELECTOR = [
  ".hud__name", ".hud__role", ".hud__status span[data-fr]",
  ".hud__card-title", ".hud__card-role", ".hud__card-text", ".hud__card-more",
  ".hud__detail-back",
  ".mod__title", ".mod__text", ".mod__tags span", ".mod__list li",
  ".mod__stat strong", ".mod__stat span", ".mod__link",
].join(", ");

// ---------------------------------------------------------------
// Icônes — SVG monochromes, jamais d'emoji
// ---------------------------------------------------------------
const ICONS = {
  image:  `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="3" width="13" height="10" rx="1.2"/><circle cx="5.5" cy="6.8" r="1.1"/><path d="M2 11.5l3.2-3.2 2.6 2.6 2-2 3.2 3.2"/></svg>`,
  link:   `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6.3 9.7l3.4-3.4M6 5.6 7.3 4.3a2.3 2.3 0 0 1 3.3 3.3L9.3 8.9M10 10.4l-1.3 1.3a2.3 2.3 0 0 1-3.3-3.3L6.7 7.1"/></svg>`,
  delete: `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
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
// Popover d'aide
// ---------------------------------------------------------------
const btnHelp = document.getElementById("btnHelp");
const helpPopover = document.getElementById("helpPopover");
const helpClose = document.getElementById("helpClose");
function toggleHelp(){ helpPopover.hidden = !helpPopover.hidden; }
function closeHelp(){ helpPopover.hidden = true; }
btnHelp.addEventListener("click", (e) => { e.stopPropagation(); toggleHelp(); });
helpClose.addEventListener("click", closeHelp);
document.addEventListener("click", (e) => {
  if(!helpPopover.hidden && !helpPopover.contains(e.target) && e.target !== btnHelp) closeHelp();
});

// ---------------------------------------------------------------
// Couleurs — un seul thème (le site de Colin n'a plus de mode clair),
// donc plus besoin de séparer les réglages par thème comme chez Adrien.
// ---------------------------------------------------------------
let colorOverrides = {};

function applyColorsToFrame(){
  const doc = frame.contentDocument;
  if(!doc) return;
  Object.entries(colorInputs).forEach(([varName, input]) => {
    colorOverrides[varName] = input.value;
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
  const vars = Object.entries(colorOverrides).map(([k,v]) => `${k}:${v};`).join("");
  styleEl.textContent = vars ? `:root{ ${vars} }` : "";
}

function syncColorInputsFromFrame(doc){
  const computed = doc.defaultView.getComputedStyle(doc.documentElement);
  Object.entries(colorInputs).forEach(([varName, input]) => {
    const stored = colorOverrides[varName];
    if(stored){ input.value = stored; return; }
    const val = computed.getPropertyValue(varName).trim();
    if(/^#[0-9a-f]{6}$/i.test(val)) input.value = val;
  });
}

Object.values(colorInputs).forEach(input => {
  input.addEventListener("input", () => { applyColorsToFrame(); scheduleSave(); });
});

// ---------------------------------------------------------------
// Texte — contenteditable direct, bilingue (data-fr / data-en)
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

// ---------------------------------------------------------------
// Liens — édition via une invite simple (pas de panneau dédié ici)
// ---------------------------------------------------------------
function editLink(el){
  const prev = el.getAttribute("href") || "";
  const next = prompt("Lien (URL) :", prev === "#" ? "https://" : prev);
  if(next === null || next.trim() === "") return;
  el.setAttribute("href", next.trim());
  recordUndo(() => el.setAttribute("href", prev));
  saveDraft();
  toast("Lien mis à jour");
}

function removeSimple(el){
  const parent = el.parentElement;
  const next = el.nextSibling;
  el.remove();
  recordUndo(() => { if(next) parent.insertBefore(el, next); else parent.appendChild(el); });
  saveDraft();
  toast("Supprimé");
}

// ---------------------------------------------------------------
// Images — même logique qu'Adrien : GIF conservé tel quel (animation
// préservée), les autres formats recompressés en JPEG (max 640px)
// ---------------------------------------------------------------
function wrapImageForBadge(img){
  if(img.parentElement && img.parentElement.classList.contains("editor-img-wrap")) return img.parentElement;
  const doc = img.ownerDocument;
  const wrap = doc.createElement("div");
  wrap.className = "editor-img-wrap";
  img.parentNode.insertBefore(wrap, img);
  wrap.appendChild(img);
  return wrap;
}

function openImagePicker(target){
  currentImageTarget = target;
  fileInput.value = "";
  fileInput.click();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if(!file || !currentImageTarget) return;
  const target = currentImageTarget;
  const prevValue = target.src;
  const isGif = file.type === "image/gif";

  const finish = (dataUrl) => {
    target.src = dataUrl;
    recordUndo(() => { target.src = prevValue; });
    saveDraft();
    toast(isGif ? "GIF mis à jour (animation conservée)" : "Image mise à jour");
  };

  const reader = new FileReader();
  if(isGif){
    reader.onload = (e) => finish(e.target.result);
    reader.readAsDataURL(file);
    return;
  }

  const img = new Image();
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
      finish(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// ---------------------------------------------------------------
// Badge d'action générique — des <span>, jamais des <button> (un
// badge peut finir dans un <a>, et un bouton imbriqué dans un lien
// est invalide, ce que le navigateur "corrige" en cassant la page).
// ---------------------------------------------------------------
function addBadges(hostEl, actions){
  if(hostEl.querySelector(":scope > .editor-badges")) return;
  const doc = hostEl.ownerDocument;
  const currentPosition = doc.defaultView.getComputedStyle(hostEl).position;
  if(currentPosition === "static") hostEl.style.position = "relative";
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
// Réseaux sociaux — ajout/suppression
// ---------------------------------------------------------------
function addSocialButton(list){
  if(list.querySelector(".editor-add-social")) return;
  const doc = list.ownerDocument;
  const li = doc.createElement("li");
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = "editor-add-social";
  btn.textContent = "+";
  btn.title = "Ajouter un réseau";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const newLi = doc.createElement("li");
    const a = doc.createElement("a");
    a.href = "#"; a.target = "_blank"; a.rel = "noopener";
    a.innerHTML = ICONS.link;
    newLi.appendChild(a);
    list.insertBefore(newLi, li);
    wireSocialLink(a);
    editLink(a);
    saveDraft();
    recordUndo(() => newLi.remove());
  });
  li.appendChild(btn);
  list.appendChild(li);
}
function wireSocialLink(a){
  addBadges(a, [
    { icon:"link", title:"Modifier le lien", onClick:() => editLink(a) },
    { icon:"delete", title:"Supprimer ce réseau", danger:true, onClick:() => removeSimple(a.closest("li")) },
  ]);
}

// ---------------------------------------------------------------
// Cartes projet — construction, câblage, ajout/suppression
// ---------------------------------------------------------------
function nextProjectId(doc){
  const existing = [...doc.querySelectorAll("[data-project-card]")].map(el => el.dataset.projectCard);
  let n = existing.length + 1;
  while(existing.includes("p" + n)) n++;
  return "p" + n;
}

function buildProjectCard(doc, projectId){
  const card = doc.createElement("article");
  card.className = "hud__card";
  card.dataset.projectCard = projectId;

  const img = doc.createElement("img");
  img.className = "hud__card-img";
  img.src = "https://placehold.co/400x220/0F2124/C8AA6E?text=Projet";
  img.alt = "";

  const title = doc.createElement("h3");
  title.className = "hud__card-title";
  title.textContent = "Titre du projet"; title.dataset.fr = "Titre du projet"; title.dataset.en = "Project title";

  const role = doc.createElement("span");
  role.className = "hud__card-role";
  role.textContent = "Corps de métier"; role.dataset.fr = "Corps de métier"; role.dataset.en = "Field/role";

  const text = doc.createElement("p");
  text.className = "hud__card-text";
  text.textContent = "Décris ce projet ici.";
  text.dataset.fr = "Décris ce projet ici."; text.dataset.en = "Describe this project here.";

  const more = doc.createElement("button");
  more.type = "button";
  more.className = "hud__card-more";
  more.dataset.projectTarget = projectId;
  more.textContent = "Voir plus →"; more.dataset.fr = "Voir plus →"; more.dataset.en = "See more →";

  card.appendChild(img); card.appendChild(title); card.appendChild(role);
  card.appendChild(text); card.appendChild(more);
  return card;
}

// La page de détail associée à une carte : même structure que les
// pages Accueil / Qui suis-je (un simple conteneur .hud__modules),
// pour bénéficier automatiquement du même système de modules.
function buildDetailBody(doc, projectId, seedTitle){
  const body = doc.createElement("div");
  body.className = "hud__detail-body";
  body.dataset.projectId = projectId;

  const modules = doc.createElement("div");
  modules.className = "hud__modules";
  modules.id = "projectModules-" + projectId;

  const title = doc.createElement("h3");
  title.className = "mod__title mod-block";
  title.textContent = seedTitle; title.dataset.fr = seedTitle; title.dataset.en = seedTitle;
  modules.appendChild(title);

  body.appendChild(modules);
  return body;
}

function wireProjectCard(card){
  card.querySelectorAll(TEXT_SELECTOR).forEach(wireTextElement);
  const img = card.querySelector(".hud__card-img");
  if(img){
    const wrap = wrapImageForBadge(img);
    addBadges(wrap, [{ icon:"image", title:"Changer l'image", onClick:() => openImagePicker(img) }]);
  }
  const more = card.querySelector(".hud__card-more");
  const projectId = card.dataset.projectCard;
  if(more && projectId){
    // aperçu immédiat dans l'éditeur : ouvre la page de détail associée
    // (le site lui-même câble ce même bouton à son propre chargement)
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      const doc = card.ownerDocument;
      const grid = doc.getElementById("projectsGrid");
      const detail = doc.getElementById("projectDetail");
      if(!grid || !detail) return;
      grid.classList.add("is-hidden");
      detail.hidden = false;
      detail.querySelectorAll(".hud__detail-body").forEach(b => {
        b.classList.toggle("is-active", b.dataset.projectId === projectId);
      });
    });
  }
  addBadges(card, [{ icon:"delete", title:"Supprimer ce projet", danger:true, onClick:() => {
    const doc = card.ownerDocument;
    const detailBody = projectId ? doc.querySelector(`.hud__detail-body[data-project-id="${projectId}"]`) : null;
    const cardParent = card.parentElement, cardNext = card.nextSibling;
    const detailParent = detailBody ? detailBody.parentElement : null;
    const detailNext = detailBody ? detailBody.nextSibling : null;
    card.remove();
    if(detailBody) detailBody.remove();
    recordUndo(() => {
      if(cardNext && cardNext.parentElement === cardParent) cardParent.insertBefore(card, cardNext);
      else cardParent.appendChild(card);
      if(detailBody){
        if(detailNext && detailNext.parentElement === detailParent) detailParent.insertBefore(detailBody, detailNext);
        else detailParent.appendChild(detailBody);
      }
    });
    saveDraft();
    toast("Projet supprimé");
  } }]);
}

function addProjectCardButton(grid){
  if(grid.querySelector(".editor-add-card")) return;
  const doc = grid.ownerDocument;
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = "editor-add-card";
  btn.textContent = "+ Ajouter un projet";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const projectId = nextProjectId(doc);
    const card = buildProjectCard(doc, projectId);
    grid.insertBefore(card, btn);
    wireProjectCard(card);

    const detail = doc.getElementById("projectDetail");
    if(detail){
      const body = buildDetailBody(doc, projectId, "Titre du projet");
      detail.appendChild(body);
      body.querySelectorAll(".mod-block").forEach(wireModuleBlock);
      renderModulePalette(body.querySelector(".hud__modules"));
    }

    card.scrollIntoView({ behavior:"smooth", block:"nearest" });
    recordUndo(() => { card.remove(); const b = detail && detail.querySelector(`[data-project-id="${projectId}"]`); if(b) b.remove(); });
    saveDraft();
  });
  grid.appendChild(btn);
}
btnAddCard.addEventListener("click", () => {
  const doc = frame.contentDocument;
  const grid = doc && doc.getElementById("projectsGrid");
  if(!grid) return;
  const addBtn = grid.querySelector(".editor-add-card");
  if(addBtn) addBtn.click();
});

// ---------------------------------------------------------------
// Modules — Accueil & Qui suis-je : Titre, Texte, Tags, Liste,
// Stats, Image, Lien, librement ajoutés, supprimés et réordonnés.
// Chaque module porte la classe commune "mod-block" en plus de sa
// classe de style spécifique (mod__title, mod__text, ...).
// ---------------------------------------------------------------
const MODULE_DEFS = {
  title: { label:"Titre", make(doc){
    const el = doc.createElement("h3");
    el.className = "mod__title mod-block";
    el.textContent = "Nouveau titre"; el.dataset.fr = "Nouveau titre"; el.dataset.en = "New title";
    return el;
  }},
  text: { label:"Texte", make(doc){
    const el = doc.createElement("p");
    el.className = "mod__text mod-block";
    const txt = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";
    el.textContent = txt; el.dataset.fr = txt; el.dataset.en = txt;
    return el;
  }},
  tags: { label:"Tags", make(doc){
    const el = doc.createElement("div");
    el.className = "mod__tags mod-block";
    ["Tag", "Tag"].forEach(t => {
      const span = doc.createElement("span");
      span.textContent = t; span.dataset.fr = t; span.dataset.en = t;
      el.appendChild(span);
    });
    return el;
  }},
  list: { label:"Liste", make(doc){
    const el = doc.createElement("ul");
    el.className = "mod__list mod-block";
    ["Élément", "Élément"].forEach(t => {
      const li = doc.createElement("li");
      li.textContent = t; li.dataset.fr = t; li.dataset.en = "Item";
      el.appendChild(li);
    });
    return el;
  }},
  stats: { label:"Stats", make(doc){
    const el = doc.createElement("div");
    el.className = "mod__stats mod-block";
    for(let i = 0; i < 2; i++){
      const stat = doc.createElement("div");
      stat.className = "mod__stat";
      const strong = doc.createElement("strong"); strong.textContent = "0";
      const span = doc.createElement("span"); span.textContent = "Label"; span.dataset.fr = "Label"; span.dataset.en = "Label";
      stat.appendChild(strong); stat.appendChild(span);
      el.appendChild(stat);
    }
    return el;
  }},
  image: { label:"Image", make(doc){
    const el = doc.createElement("img");
    el.className = "mod__image mod-block";
    el.src = "https://placehold.co/420x260/0F1C31/C8AA6E?text=Image";
    el.alt = "";
    return el;
  }},
  link: { label:"Lien", make(doc){
    const el = doc.createElement("a");
    el.className = "mod__link mod-block";
    el.href = "#"; el.target = "_blank"; el.rel = "noopener";
    el.textContent = "Voir ↗"; el.dataset.fr = "Voir ↗"; el.dataset.en = "See ↗";
    return el;
  }},
  video: { label:"Vidéo", make(doc){
    const el = doc.createElement("div");
    el.className = "mod__video mod-block";
    el.dataset.mode = "";
    return el;
  }},
};

function extractYouTubeId(url){
  const m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  return m ? m[1] : "";
}

function renderVideoBlock(block){
  block.innerHTML = "";
  const doc = block.ownerDocument;
  if(block.dataset.mode === "youtube" && block.dataset.youtubeId){
    const ifr = doc.createElement("iframe");
    ifr.src = "https://www.youtube.com/embed/" + block.dataset.youtubeId;
    ifr.title = "Vidéo YouTube";
    ifr.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    ifr.allowFullscreen = true;
    block.appendChild(ifr);
  }else if(block.dataset.mode === "upload" && block.dataset.src){
    const v = doc.createElement("video");
    v.src = block.dataset.src; v.controls = true;
    block.appendChild(v);
  }else{
    const placeholder = doc.createElement("div");
    placeholder.className = "mod__video-placeholder";
    placeholder.textContent = "Aucune vidéo — clique sur le badge pour en ajouter une";
    block.appendChild(placeholder);
  }
}

let currentVideoTarget = null;

function editVideoBlock(block){
  const currentUrl = block.dataset.mode === "youtube" && block.dataset.youtubeId
    ? "https://youtu.be/" + block.dataset.youtubeId : "";
  const url = prompt("Colle un lien YouTube, ou laisse vide et valide pour importer un fichier MP4 :", currentUrl);
  if(url === null) return; // annulé

  if(url.trim() === ""){
    currentVideoTarget = block;
    videoFileInput.value = "";
    videoFileInput.click();
    return;
  }
  const id = extractYouTubeId(url);
  if(!id){ toast("Lien YouTube non reconnu"); return; }

  const prevMode = block.dataset.mode, prevId = block.dataset.youtubeId, prevSrc = block.dataset.src;
  block.dataset.mode = "youtube";
  block.dataset.youtubeId = id;
  delete block.dataset.src;
  renderVideoBlock(block);
  recordUndo(() => {
    block.dataset.mode = prevMode || "";
    if(prevId) block.dataset.youtubeId = prevId; else delete block.dataset.youtubeId;
    if(prevSrc) block.dataset.src = prevSrc; else delete block.dataset.src;
    renderVideoBlock(block);
  });
  saveDraft();
  toast("Vidéo mise à jour");
}

videoFileInput.addEventListener("change", () => {
  const file = videoFileInput.files[0];
  if(!file || !currentVideoTarget) return;
  const block = currentVideoTarget;
  if(file.size > 15 * 1024 * 1024){
    toast("⚠ Vidéo trop lourde (15 Mo max) — héberge-la ailleurs et utilise plutôt un lien YouTube");
    return;
  }
  const prevMode = block.dataset.mode, prevId = block.dataset.youtubeId, prevSrc = block.dataset.src;
  const reader = new FileReader();
  reader.onload = (e) => {
    block.dataset.mode = "upload";
    block.dataset.src = e.target.result;
    delete block.dataset.youtubeId;
    renderVideoBlock(block);
    recordUndo(() => {
      block.dataset.mode = prevMode || "";
      if(prevId) block.dataset.youtubeId = prevId; else delete block.dataset.youtubeId;
      if(prevSrc) block.dataset.src = prevSrc; else delete block.dataset.src;
      renderVideoBlock(block);
    });
    saveDraft();
    toast("Vidéo importée");
  };
  reader.readAsDataURL(file);
});

// Petit bouton "+ X" générique pour ajouter un élément à l'intérieur
// d'un module (une ligne de liste, un tag, une stat...).
function addMiniAddButton(container, label, onAdd){
  if(container.querySelector(":scope > .editor-mini-add")) return;
  const doc = container.ownerDocument;
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.className = "editor-mini-add";
  btn.textContent = label;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onAdd(doc, btn);
    saveDraft();
  });
  container.appendChild(btn);
}

function wireModuleBlock(block){
  block.querySelectorAll(TEXT_SELECTOR).forEach(wireTextElement);
  if(block.matches(TEXT_SELECTOR)) wireTextElement(block);

  if(block.classList.contains("mod__image")){
    const wrap = wrapImageForBadge(block);
    wrap.classList.add("mod-block-wrap");
    addBadges(wrap, [
      { icon:"image", title:"Changer l'image", onClick:() => openImagePicker(block) },
      { icon:"delete", title:"Supprimer ce module", danger:true, onClick:() => removeSimple(wrap) },
    ]);
    addDragHandle(wrap, wrap);
    return;
  }

  if(block.classList.contains("mod__video")){
    if(!block.children.length) renderVideoBlock(block);
    addBadges(block, [
      { icon:"link", title:"Modifier la vidéo (YouTube ou MP4)", onClick:() => editVideoBlock(block) },
      { icon:"delete", title:"Supprimer ce module", danger:true, onClick:() => removeSimple(block) },
    ]);
    addDragHandle(block, block);
    return;
  }

  if(block.classList.contains("mod__link")){
    addBadges(block, [
      { icon:"link", title:"Modifier le lien", onClick:() => editLink(block) },
      { icon:"delete", title:"Supprimer ce module", danger:true, onClick:() => removeSimple(block) },
    ]);
    addDragHandle(block, block);
    return;
  }

  if(block.classList.contains("mod__tags")){
    block.querySelectorAll(":scope > span").forEach(span => {
      addBadges(span, [{ icon:"delete", title:"Supprimer ce tag", danger:true, onClick:() => removeSimple(span) }]);
    });
    addMiniAddButton(block, "+ tag", (doc, btn) => {
      const span = doc.createElement("span");
      span.textContent = "Nouveau"; span.dataset.fr = "Nouveau"; span.dataset.en = "New";
      block.insertBefore(span, btn);
      wireTextElement(span);
      addBadges(span, [{ icon:"delete", title:"Supprimer ce tag", danger:true, onClick:() => removeSimple(span) }]);
      recordUndo(() => span.remove());
    });
    addBadges(block, [{ icon:"delete", title:"Supprimer tout ce module", danger:true, onClick:() => removeSimple(block) }]);
    addDragHandle(block, block);
    return;
  }

  if(block.classList.contains("mod__list")){
    block.querySelectorAll(":scope > li").forEach(li => {
      addBadges(li, [{ icon:"delete", title:"Supprimer cette ligne", danger:true, onClick:() => removeSimple(li) }]);
    });
    addMiniAddButton(block, "+ ligne", (doc, btn) => {
      const li = doc.createElement("li");
      li.textContent = "Nouvel élément"; li.dataset.fr = "Nouvel élément"; li.dataset.en = "New item";
      block.insertBefore(li, btn);
      wireTextElement(li);
      addBadges(li, [{ icon:"delete", title:"Supprimer cette ligne", danger:true, onClick:() => removeSimple(li) }]);
      recordUndo(() => li.remove());
    });
    addBadges(block, [{ icon:"delete", title:"Supprimer tout ce module", danger:true, onClick:() => removeSimple(block) }]);
    addDragHandle(block, block);
    return;
  }

  if(block.classList.contains("mod__stats")){
    block.querySelectorAll(":scope > .mod__stat").forEach(stat => {
      addBadges(stat, [{ icon:"delete", title:"Supprimer cette statistique", danger:true, onClick:() => removeSimple(stat) }]);
    });
    addMiniAddButton(block, "+ stat", (doc, btn) => {
      const stat = doc.createElement("div"); stat.className = "mod__stat";
      const strong = doc.createElement("strong"); strong.textContent = "0";
      const span = doc.createElement("span"); span.textContent = "Label"; span.dataset.fr = "Label"; span.dataset.en = "Label";
      stat.appendChild(strong); stat.appendChild(span);
      block.insertBefore(stat, btn);
      wireTextElement(strong); wireTextElement(span);
      addBadges(stat, [{ icon:"delete", title:"Supprimer cette statistique", danger:true, onClick:() => removeSimple(stat) }]);
      recordUndo(() => stat.remove());
    });
    addBadges(block, [{ icon:"delete", title:"Supprimer tout ce module", danger:true, onClick:() => removeSimple(block) }]);
    addDragHandle(block, block);
    return;
  }

  // titre / texte : juste un badge suppression sur le bloc lui-même
  addBadges(block, [{ icon:"delete", title:"Supprimer ce module", danger:true, onClick:() => removeSimple(block) }]);
  addDragHandle(block, block);
}

function renderModulePalette(modulesContainer){
  if(modulesContainer.querySelector(":scope > .editor-module-palette")) return;
  const doc = modulesContainer.ownerDocument;
  const palette = doc.createElement("div");
  palette.className = "editor-module-palette";
  Object.entries(MODULE_DEFS).forEach(([key, def]) => {
    const chip = doc.createElement("button");
    chip.type = "button";
    chip.className = "editor-module-chip";
    chip.textContent = "+ " + def.label;
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      const block = def.make(doc);
      modulesContainer.insertBefore(block, palette);
      wireModuleBlock(block);
      block.scrollIntoView({ behavior:"smooth", block:"nearest" });
      recordUndo(() => block.remove());
      saveDraft();
    });
    palette.appendChild(chip);
  });
  modulesContainer.appendChild(palette);
}

// ---------------------------------------------------------------
// Glisser-déposer des modules — même mécanique que les blocs de
// projet d'Adrien (clone flottant, réorganisation fluide des autres
// modules autour, défilement auto près des bords, clic droit pour
// annuler) mais sans tableau de données séparé à synchroniser : le
// DOM EST la donnée, donc on réordonne directement dedans.
// ---------------------------------------------------------------
function addDragHandle(hostEl, dragTarget){
  if(hostEl.querySelector(":scope > .editor-drag-handle")) return;
  const doc = hostEl.ownerDocument;
  const currentPosition = doc.defaultView.getComputedStyle(hostEl).position;
  if(currentPosition === "static") hostEl.style.position = "relative";
  const handle = doc.createElement("span");
  handle.className = "editor-drag-handle";
  handle.textContent = "⠿";
  handle.title = "Maintenir pour déplacer (clic droit pendant le déplacement = annuler)";
  handle.setAttribute("contenteditable", "false");
  hostEl.appendChild(handle);
  wireModuleDragReorder(handle, dragTarget);
}

function wireModuleDragReorder(handleEl, containerEl){
  let dragging = false;
  let ghost = null;
  let offsetX = 0, offsetY = 0;
  let lastClientY = 0;
  let originalParent = null, originalNextSibling = null;
  let rafId = null;

  function scrollTarget(){ return containerEl.closest(".hud__panel"); }
  function siblingBlocks(){
    return [...containerEl.parentElement.children].filter(el =>
      (el.classList.contains("mod-block") || el.classList.contains("mod-block-wrap")) && el !== containerEl);
  }
  function capturePositions(){
    const map = new Map();
    siblingBlocks().forEach(el => map.set(el, el.getBoundingClientRect()));
    return map;
  }
  function playFlip(before){
    const after = capturePositions();
    after.forEach((afterRect, el) => {
      const beforeRect = before.get(el);
      if(!beforeRect) return;
      const dx = beforeRect.left - afterRect.left;
      const dy = beforeRect.top - afterRect.top;
      if(Math.abs(dx) > .5 || Math.abs(dy) > .5){
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.getBoundingClientRect();
        requestAnimationFrame(() => {
          el.style.transition = "transform .24s cubic-bezier(.2,.8,.3,1)";
          el.style.transform = "";
        });
      }
    });
  }
  // Ne jamais redéclencher un réordonnancement pendant qu'une
  // animation FLIP précédente est encore en cours : lire la position
  // d'un élément à mi-transition (donc décalée par le transform en
  // train de s'annuler) faussait le calcul et provoquait des
  // réordonnancements en cascade — c'était la cause du bug visuel
  // (formes qui se chevauchent, éléments qui restent bloqués).
  let lastReorderAt = 0;
  const REORDER_COOLDOWN_MS = 260;
  function reorderIfNeeded(clientY){
    const now = performance.now();
    if(now - lastReorderAt < REORDER_COOLDOWN_MS) return;
    const parent = containerEl.parentElement;
    if(!parent) return;
    const others = siblingBlocks();
    let target = null;
    for(const el of others){
      const rect = el.getBoundingClientRect();
      if(clientY < rect.top + rect.height / 2){ target = el; break; }
    }
    if(containerEl.nextElementSibling === target) return;
    const before = capturePositions();
    if(target){
      parent.insertBefore(containerEl, target);
    }else{
      const palette = parent.querySelector(":scope > .editor-module-palette");
      if(palette) parent.insertBefore(containerEl, palette); else parent.appendChild(containerEl);
    }
    lastReorderAt = now;
    playFlip(before);
  }
  function handleAutoScroll(clientY){
    const scrollEl = scrollTarget();
    if(!scrollEl) return;
    const rect = scrollEl.getBoundingClientRect();
    const margin = 60;
    let speed = 0;
    if(clientY < rect.top + margin) speed = -Math.ceil((rect.top + margin - clientY) / 2.5);
    else if(clientY > rect.bottom - margin) speed = Math.ceil((clientY - (rect.bottom - margin)) / 2.5);
    if(speed) scrollEl.scrollTop += speed;
  }
  function tick(){
    if(!dragging){ rafId = null; return; }
    try{
      handleAutoScroll(lastClientY);
      reorderIfNeeded(lastClientY);
    }catch(err){
      console.error("Glisser-déposer : erreur pendant le déplacement, annulation de sécurité.", err);
      endDrag(true);
      return;
    }
    rafId = requestAnimationFrame(tick);
  }
  function onMouseMove(e){
    if(!dragging) return;
    lastClientY = e.clientY;
    if(ghost){
      ghost.style.left = (e.clientX - offsetX) + "px";
      ghost.style.top = (e.clientY - offsetY) + "px";
    }
  }
  function cleanup(){
    if(rafId){ cancelAnimationFrame(rafId); rafId = null; }
    if(ghost){ ghost.remove(); ghost = null; }
    containerEl.style.visibility = "";
    const siteDoc = containerEl.ownerDocument;
    siteDoc.removeEventListener("mousemove", onMouseMove);
    siteDoc.removeEventListener("mouseup", onMouseUp);
    siteDoc.removeEventListener("contextmenu", onRightClick);
    if(siteDoc.body) siteDoc.body.style.userSelect = "";
  }
  function endDrag(cancel){
    if(!dragging) return;
    dragging = false;
    if(cancel){
      const before = capturePositions();
      if(originalNextSibling && originalNextSibling.parentElement === originalParent){
        originalParent.insertBefore(containerEl, originalNextSibling);
      }else if(originalParent){
        originalParent.appendChild(containerEl);
      }
      playFlip(before);
      cleanup();
      saveDraft();
      toast("Déplacement annulé");
    }else{
      cleanup();
      saveDraft();
    }
  }
  function onMouseUp(){ endDrag(false); }
  function onRightClick(e){ e.preventDefault(); e.stopPropagation(); endDrag(true); }

  handleEl.addEventListener("mousedown", (e) => {
    if(e.button !== 0) return;
    if(dragging) return; // sécurité : jamais deux glissers simultanés sur la même poignée
    e.preventDefault();
    dragging = true;
    lastReorderAt = 0;
    originalParent = containerEl.parentElement;
    originalNextSibling = containerEl.nextSibling;
    lastClientY = e.clientY;
    const rect = containerEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    // IMPORTANT : ce script tourne dans la page de l'éditeur, mais
    // containerEl vit DANS L'IFRAME du site — il faut impérativement
    // utiliser son propre document (ownerDocument), jamais le
    // "document" global (qui pointerait vers la page de l'éditeur).
    // C'était le vrai bug : les écouteurs de mousemove/mouseup étaient
    // posés sur le mauvais document, ne captaient donc jamais rien une
    // fois la souris au-dessus du site, et le glisser restait bloqué
    // pour de bon (élément resté invisible, ghost égaré).
    const siteDoc = containerEl.ownerDocument;

    // Le ghost est un clone purement visuel : on retire tout élément
    // d'édition (badges, poignées, boutons "+") pour ne jamais avoir
    // deux jeux de contrôles interactifs superposés.
    ghost = containerEl.cloneNode(true);
    ghost.querySelectorAll(".editor-badges, .editor-drag-handle, .editor-mini-add, .editor-module-palette")
      .forEach(el => el.remove());
    ghost.classList.add("editor-block-ghost");
    ghost.style.width = rect.width + "px";
    ghost.style.left = rect.left + "px";
    ghost.style.top = rect.top + "px";
    siteDoc.body.appendChild(ghost);
    containerEl.style.visibility = "hidden";
    siteDoc.body.style.userSelect = "none";
    siteDoc.addEventListener("mousemove", onMouseMove);
    siteDoc.addEventListener("mouseup", onMouseUp);
    siteDoc.addEventListener("contextmenu", onRightClick);
    rafId = requestAnimationFrame(tick);
  });
  handleEl.addEventListener("contextmenu", (e) => { if(!dragging) e.preventDefault(); });
}

// Filet de sécurité : si un ghost ou un état "en cours de
// déplacement" est resté bloqué suite à un problème (fermeture
// impromptue, erreur), on nettoie tout au (re)chargement de la page.
function clearStaleDragArtifacts(doc){
  doc.querySelectorAll(".editor-block-ghost").forEach(el => el.remove());
  doc.querySelectorAll('[style*="visibility: hidden"]').forEach(el => {
    if(el.classList.contains("mod-block") || el.classList.contains("mod-block-wrap")) el.style.visibility = "";
  });
}

// ---------------------------------------------------------------
// Injection des capacités d'édition
// ---------------------------------------------------------------
function injectEditing(){
  const doc = frame.contentDocument;
  if(!doc) return;
  try{
    clearStaleDragArtifacts(doc);
    injectEditingInner(doc);
  }catch(err){
    console.error("injectEditing() a rencontré une erreur :", err);
    toast("⚠ Un problème est survenu pendant le branchement de l'éditeur — regarde la console (F12) si des contrôles ne répondent plus");
  }
}

function injectEditingInner(doc){
  syncColorInputsFromFrame(doc);
  renderColorOverrideStyle(doc);

  if(!doc.getElementById("editor-injected-style")){
    const style = doc.createElement("style");
    style.id = "editor-injected-style";
    style.textContent = `
      ${TEXT_SELECTOR}{
        outline:2px dashed transparent; outline-offset:2px; cursor:text;
        transition:outline-color .15s ease, background-color .15s ease;
      }
      ${TEXT_SELECTOR}:hover{ outline-color:#C8AA6E; background-color:rgba(200,170,110,.08); }
      ${TEXT_SELECTOR}:focus{ outline-color:#0AC8B9; background-color:rgba(10,200,185,.1); }

      .editor-badges{
        position:absolute; top:6px; right:6px; z-index:40;
        display:flex; gap:4px;
        opacity:0; transition:opacity .15s ease;
      }
      :hover > .editor-badges{ opacity:1; }
      .editor-badge{
        width:22px; height:22px; border-radius:50%;
        background:rgba(10,20,40,.88); border:1.5px solid #C8AA6E;
        color:#fff; display:flex; align-items:center; justify-content:center;
        cursor:pointer; padding:0;
      }
      .editor-badge:hover{ background:#C8AA6E; color:#0A1428; }
      .editor-badge--danger{ border-color:#E45858; }
      .editor-badge--danger:hover{ background:#E45858; color:#fff; }
      .editor-img-wrap{ position:relative; width:100%; height:100%; }

      /* les tags et stats sont trop petits pour un badge "normal" posé
         par-dessus (il débordait n'importe comment) : badge plus petit,
         posé juste à l'extérieur du coin plutôt que par-dessus */
      .mod__tags span > .editor-badges,
      .mod__stat > .editor-badges{
        top:-8px; right:-8px;
      }
      .mod__tags span > .editor-badges .editor-badge,
      .mod__stat > .editor-badges .editor-badge{
        width:16px; height:16px;
      }
      .mod__tags span > .editor-badges .editor-badge svg,
      .mod__stat > .editor-badges .editor-badge svg{
        width:9px; height:9px;
      }

      .editor-add-social{
        width:30px; height:30px; border-radius:50%;
        border:1.5px dashed #C8AA6E; background:transparent; color:#C8AA6E;
        font-size:16px; font-weight:700; cursor:pointer; opacity:.7;
      }
      .editor-add-social:hover{ opacity:1; background:rgba(200,170,110,.12); }

      .editor-add-card{
        min-height:180px;
        display:flex; align-items:center; justify-content:center;
        font-family:'JetBrains Mono',monospace; font-size:13px; font-weight:700;
        color:#C8AA6E; background:transparent; border:2px dashed rgba(200,170,110,.4);
        border-radius:4px; cursor:pointer; opacity:.75;
        transition:opacity .15s ease, background .15s ease;
      }
      .editor-add-card:hover{ opacity:1; background:rgba(200,170,110,.08); }

      .editor-drag-handle{
        position:absolute; top:6px; left:6px; z-index:40;
        width:20px; height:20px; border-radius:4px;
        background:rgba(10,20,40,.85); border:1.5px solid #C8AA6E; color:#C8AA6E;
        display:flex; align-items:center; justify-content:center;
        font-size:12px; line-height:1; cursor:grab;
        opacity:0; transition:opacity .15s ease;
      }
      .mod-block:hover > .editor-drag-handle,
      .mod-block-wrap:hover > .editor-drag-handle{ opacity:1; }

      .editor-mini-add{
        display:inline-block; margin-top:4px;
        font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700;
        color:#C8AA6E; background:transparent; border:1.5px dashed rgba(200,170,110,.5);
        border-radius:100px; padding:3px 10px; cursor:pointer; opacity:.75;
      }
      .editor-mini-add:hover{ opacity:1; background:rgba(200,170,110,.1); }

      .editor-module-palette{
        display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;
        padding-top:14px; border-top:1.5px dashed rgba(200,170,110,.3);
      }
      .editor-module-chip{
        font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700;
        color:#0A1428; background:#C8AA6E; border:none;
        border-radius:100px; padding:6px 13px; cursor:pointer;
        transition:background .15s ease, transform .15s ease;
      }
      .editor-module-chip:hover{ background:#F0E1B0; transform:translateY(-1px); }

      .editor-block-ghost{
        position:fixed; z-index:9999; pointer-events:none;
        opacity:.96; transform:rotate(-1deg) scale(1.02);
        box-shadow:0 16px 32px -8px rgba(0,0,0,.6);
      }
    `;
    doc.head.appendChild(style);
  }

  doc.querySelectorAll(TEXT_SELECTOR).forEach(wireTextElement);

  // Modules — Accueil, Qui suis-je, et chaque page de détail projet :
  // tout conteneur ".hud__modules" bénéficie du même système, où qu'il soit.
  doc.querySelectorAll(".mod-block").forEach(wireModuleBlock);
  doc.querySelectorAll(".hud__modules").forEach(renderModulePalette);

  // Avatar + CV : image modifiable, CV avec en plus son lien
  const avatar = doc.getElementById("avatarImg");
  if(avatar){
    const wrap = wrapImageForBadge(avatar);
    addBadges(wrap, [{ icon:"image", title:"Changer la photo", onClick:() => openImagePicker(avatar) }]);
  }
  const cvImg = doc.getElementById("cvImg");
  const cvLink = doc.getElementById("cvLink");
  if(cvImg){
    const wrap = wrapImageForBadge(cvImg);
    addBadges(wrap, [{ icon:"image", title:"Changer l'aperçu du CV", onClick:() => openImagePicker(cvImg) }]);
  }
  if(cvLink) addBadges(cvLink, [{ icon:"link", title:"Modifier le lien du CV", onClick:() => editLink(cvLink) }]);

  // Réseaux sociaux
  const socialsList = doc.getElementById("socialsList");
  if(socialsList){
    socialsList.querySelectorAll("li > a").forEach(wireSocialLink);
    addSocialButton(socialsList);
  }

  // Cartes projet
  const grid = doc.getElementById("projectsGrid");
  if(grid){
    grid.querySelectorAll(".hud__card").forEach(wireProjectCard);
    addProjectCardButton(grid);
  }
}

// ---------------------------------------------------------------
// Chargement fiable de l'iframe (Blob + <base> explicite) + filet de
// sécurité si la page semble cassée après un rechargement de HTML.
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
    const looksValid = doc && doc.querySelector(".hud__sidebar") && doc.querySelector(".hud__nav") && doc.querySelector(".hud__content");
    if(!looksValid){
      toast("⚠ La page semblait cassée après ce changement — annulé automatiquement");
      idbGet(DRAFT_KEY).then((lastGood) => {
        if(lastGood && lastGood !== finalHtml){
          loadHtmlIntoFrame(lastGood, callback);
        }else{
          frame.addEventListener("load", callback, { once: true });
          frame.src = "../index.html?_=" + Date.now();
        }
      }).catch(() => {
        frame.addEventListener("load", callback, { once: true });
        frame.src = "../index.html?_=" + Date.now();
      });
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
async function onFirstLoad(){
  let draft = null;
  try{ draft = await idbGet(DRAFT_KEY); }catch(err){ /* stockage indisponible : on repart du site tel quel */ }
  if(draft){
    loadHtmlIntoFrame(draft, () => { toast("Brouillon précédent restauré"); injectEditing(); });
  }else{
    injectEditing();
  }
}

// ---------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------
function scheduleSave(){
  saveStatus.textContent = "Sauvegarde…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 500);
}
function formatSize(bytes){
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? mb.toFixed(1) + " Mo" : Math.round(bytes / 1024) + " Ko";
}
async function saveDraft(){
  const doc = frame.contentDocument;
  const html = doc.documentElement.outerHTML;
  const sizeBytes = new Blob([html]).size;
  try{
    await idbSet(DRAFT_KEY, html);
    saveStatus.classList.remove("is-warning", "is-error");
    saveStatus.title = "";
    if(sizeBytes > 30 * 1024 * 1024){
      saveStatus.classList.add("is-warning");
      saveStatus.textContent = `Brouillon à jour (${formatSize(sizeBytes)})`;
      saveStatus.title = "Le brouillon devient très volumineux. Pense à télécharger le site de temps en temps pour ne rien risquer.";
    }else{
      saveStatus.textContent = "Brouillon à jour";
    }
  }catch(err){
    saveStatus.classList.add("is-error");
    saveStatus.textContent = "⚠ Sauvegarde auto impossible";
    saveStatus.title = "Le stockage local du navigateur est indisponible ou plein. Tes DERNIÈRES modifications ne sont plus sauvegardées automatiquement. Clique sur \"Télécharger le site\" maintenant pour ne rien perdre.";
    toast("⚠ Sauvegarde automatique impossible — télécharge le site maintenant pour ne rien perdre.");
  }
}

// ---------------------------------------------------------------
// Téléchargement — nettoyage complet des artefacts de l'éditeur
// ---------------------------------------------------------------
btnDownload.addEventListener("click", () => {
  const doc = frame.contentDocument;
  const clone = doc.documentElement.cloneNode(true);

  clone.querySelectorAll("[contenteditable]").forEach(el => el.removeAttribute("contenteditable"));
  clone.querySelectorAll(".editor-add-social, .editor-add-card, .editor-badges, .editor-drag-handle, .editor-mini-add, .editor-module-palette").forEach(el => el.remove());
  clone.querySelectorAll(".editor-img-wrap").forEach(wrap => wrap.replaceWith(...wrap.childNodes));
  clone.querySelectorAll(".mod-block-wrap").forEach(wrap => wrap.classList.remove("mod-block-wrap"));
  clone.querySelector("#editor-injected-style")?.remove();
  clone.querySelector("#editor-color-override")?.remove();
  clone.querySelector("base[href]")?.remove();

  // toujours repartir sur la grille de projets, jamais sur une page de
  // détail restée ouverte au moment du téléchargement
  clone.querySelector("#projectsGrid")?.classList.remove("is-hidden");
  const clonedDetail = clone.querySelector("#projectDetail");
  if(clonedDetail){
    clonedDetail.hidden = true;
    clonedDetail.querySelectorAll(".hud__detail-body").forEach(b => b.classList.remove("is-active"));
  }

  const html = "<!DOCTYPE html>\n" + clone.outerHTML;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "index.html";
  a.click();
  URL.revokeObjectURL(url);
  toast("Téléchargé — remplace le index.html du dossier Colin sur GitHub avec ce fichier");
});

// ---------------------------------------------------------------
// Repartir de zéro
// ---------------------------------------------------------------
btnReset.addEventListener("click", () => {
  if(!confirm("Effacer toutes les modifications en cours et repartir du site actuel ?")) return;
  idbDelete(DRAFT_KEY).catch(() => {});
  undoStack = [];
  btnUndo.disabled = true;
  colorOverrides = {};
  frame.addEventListener("load", () => { injectEditing(); toast("Repartie de zéro"); }, { once: true });
  frame.src = "../index.html?_=" + Date.now();
});
