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
  ".hud__home-empty", ".hud__about-text",
  ".hud__card-title", ".hud__card-role", ".hud__card-text", ".hud__card-link",
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
// Couleurs — le site de Colin est SOMBRE par défaut (aucun attribut
// data-theme), et [data-theme="light"] est l'exception. C'est
// l'inverse de la convention du site d'Adrien : on adapte donc le
// scoping CSS des couleurs perso en conséquence.
// ---------------------------------------------------------------
let colorOverrides = { light:{}, dark:{} };

function currentTheme(doc){
  return doc && doc.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
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
    (darkVars  ? `html:not([data-theme="light"]){ ${darkVars} }\n` : "") +
    (lightVars ? `html[data-theme="light"]{ ${lightVars} }` : "");
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

function watchThemeChanges(doc){
  if(doc._themeObserverBound) return;
  doc._themeObserverBound = true;
  const observer = new MutationObserver(() => syncColorInputsFromFrame(doc));
  observer.observe(doc.documentElement, { attributes:true, attributeFilter:["data-theme"] });
}

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
function buildProjectCard(doc){
  const card = doc.createElement("article");
  card.className = "hud__card";

  const img = doc.createElement("img");
  img.className = "hud__card-img";
  img.src = "https://placehold.co/400x220/0F2124/2DD4C8?text=Projet";
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

  const link = doc.createElement("a");
  link.className = "hud__card-link";
  link.href = "#"; link.target = "_blank"; link.rel = "noopener";
  link.textContent = "Voir le projet ↗";
  link.dataset.fr = "Voir le projet ↗"; link.dataset.en = "View project ↗";

  card.appendChild(img); card.appendChild(title); card.appendChild(role);
  card.appendChild(text); card.appendChild(link);
  return card;
}

function wireProjectCard(card){
  card.querySelectorAll(TEXT_SELECTOR).forEach(wireTextElement);
  const img = card.querySelector(".hud__card-img");
  if(img){
    const wrap = wrapImageForBadge(img);
    addBadges(wrap, [{ icon:"image", title:"Changer l'image", onClick:() => openImagePicker(img) }]);
  }
  const link = card.querySelector(".hud__card-link");
  if(link) addBadges(link, [{ icon:"link", title:"Modifier le lien", onClick:() => editLink(link) }]);
  addBadges(card, [{ icon:"delete", title:"Supprimer ce projet", danger:true, onClick:() => removeSimple(card) }]);
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
    const card = buildProjectCard(doc);
    grid.insertBefore(card, btn);
    wireProjectCard(card);
    card.scrollIntoView({ behavior:"smooth", block:"nearest" });
    recordUndo(() => card.remove());
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
// Injection des capacités d'édition
// ---------------------------------------------------------------
function injectEditing(){
  const doc = frame.contentDocument;
  if(!doc) return;
  try{
    injectEditingInner(doc);
  }catch(err){
    console.error("injectEditing() a rencontré une erreur :", err);
    toast("⚠ Un problème est survenu pendant le branchement de l'éditeur — regarde la console (F12) si des contrôles ne répondent plus");
  }
}

function injectEditingInner(doc){
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
      ${TEXT_SELECTOR}:hover{ outline-color:#2DD4C8; background-color:rgba(45,212,200,.08); }
      ${TEXT_SELECTOR}:focus{ outline-color:#E8B34C; background-color:rgba(232,179,76,.1); }

      .editor-badges{
        position:absolute; top:6px; right:6px; z-index:40;
        display:flex; gap:4px;
        opacity:0; transition:opacity .15s ease;
      }
      :hover > .editor-badges{ opacity:1; }
      .editor-badge{
        width:22px; height:22px; border-radius:50%;
        background:rgba(10,19,22,.88); border:1.5px solid #2DD4C8;
        color:#fff; display:flex; align-items:center; justify-content:center;
        cursor:pointer; padding:0;
      }
      .editor-badge:hover{ background:#2DD4C8; color:#0A1316; }
      .editor-badge--danger{ border-color:#E85D5D; }
      .editor-badge--danger:hover{ background:#E85D5D; color:#fff; }
      .editor-img-wrap{ position:relative; width:100%; height:100%; }

      .editor-add-social{
        width:30px; height:30px; border-radius:50%;
        border:1.5px dashed #2DD4C8; background:transparent; color:#2DD4C8;
        font-size:16px; font-weight:700; cursor:pointer; opacity:.7;
      }
      .editor-add-social:hover{ opacity:1; background:rgba(45,212,200,.12); }

      .editor-add-card{
        min-height:180px;
        display:flex; align-items:center; justify-content:center;
        font-family:'JetBrains Mono',monospace; font-size:13px; font-weight:700;
        color:#2DD4C8; background:transparent; border:2px dashed rgba(45,212,200,.4);
        border-radius:4px; cursor:pointer; opacity:.75;
        transition:opacity .15s ease, background .15s ease;
      }
      .editor-add-card:hover{ opacity:1; background:rgba(45,212,200,.08); }
    `;
    doc.head.appendChild(style);
  }

  doc.querySelectorAll(TEXT_SELECTOR).forEach(wireTextElement);

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
  clone.querySelectorAll(".editor-add-social, .editor-add-card, .editor-badges").forEach(el => el.remove());
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
  colorOverrides = { light:{}, dark:{} };
  frame.addEventListener("load", () => { injectEditing(); toast("Repartie de zéro"); }, { once: true });
  frame.src = "../index.html?_=" + Date.now();
});
