/* ==================================================================
   ÉDITEUR VISUEL — charge le vrai site dans l'iframe et le rend
   éditable directement dessus.

   ⚠️ Doit tourner sur http(s):// (GitHub Pages, ou un serveur local
   type `npx serve`). Ouvrir ce fichier en double-clic (file://)
   bloque l'accès à l'iframe pour des raisons de sécurité navigateur.
================================================================== */

const DRAFT_KEY = "portfolio_editor_draft_v1";
const HISTORY_LIMIT = 50;

const frame        = document.getElementById("siteFrame");
const btnDownload   = document.getElementById("btnDownload");
const btnReset       = document.getElementById("btnReset");
const btnUndo        = document.getElementById("btnUndo");
const btnRedo        = document.getElementById("btnRedo");
const btnAddProject  = document.getElementById("btnAddProject");
const saveStatus     = document.getElementById("saveStatus");
const fileInput      = document.getElementById("fileInput");
const toastEl        = document.getElementById("toast");
const modeButtons    = document.querySelectorAll("#modeGroup .tbtn");

const colorInputs = {
  "--red":   document.getElementById("colorRed"),
  "--ink":   document.getElementById("colorInk"),
  "--yellow":document.getElementById("colorYellow"),
  "--paper": document.getElementById("colorPaper"),
};

let activeMode = "text"; // 'text' | 'images' | 'links' | 'delete'
let currentImageTarget = null;
let saveTimer = null;
let isRestoring = false;

let historyStack = [];
let historyIndex = -1;

// Tout ce qui se modifie au clic simple, en mode Texte
const TEXT_SELECTOR = [
  ".card__brand", ".role", ".about-bio",
  ".page__text h3", ".page__text p", ".page__list li", ".page__tags span",
  ".stat", ".occupation__label", ".occupation__info h3", ".occupation__info p",
  ".occupation__stat", ".stack-tag", ".itch-link",
].join(", ");

// Contrôles de navigation : le texte ne s'édite qu'au double-clic,
// le simple clic garde son comportement normal (changer d'onglet, etc.)
const DBLCLICK_TEXT_SELECTOR = ".tab, .pill";

const IMAGE_SELECTOR = "img.avatar, img.page__img";
const OCCUPATION_IMAGE_SELECTOR = ".occupation";
const LINK_SELECTOR  = ".itch-link, .resume-btn, .socials a";
const DELETE_SELECTOR = ".itch-link, .socials li, .page__tags span, .stack-tag, .pill";

function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("is-visible");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("is-visible"), 2600);
}

// ---------------------------------------------------------------
// Modes exclusifs
// ---------------------------------------------------------------
modeButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    activeMode = btn.dataset.mode;
    modeButtons.forEach(b => b.classList.toggle("is-active", b === btn));
    const doc = frame.contentDocument;
    if(doc) updateModeOutlines(doc);
  });
});

function updateModeOutlines(doc){
  doc.body.classList.remove("mode-text", "mode-images", "mode-links", "mode-delete");
  doc.body.classList.add("mode-" + activeMode);
}

// ---------------------------------------------------------------
// Rechargement fiable de l'iframe — remplace document.write(), qui
// casse parfois le chargement de style.css / main.js selon les
// navigateurs. On passe par une vraie navigation (Blob + <base>),
// ce qui garantit que les chemins relatifs se résolvent toujours
// correctement et qu'on attend un vrai évènement "load".
// ---------------------------------------------------------------
function loadHtmlIntoFrame(html, callback){
  let finalHtml = /^\s*<!doctype/i.test(html) ? html : "<!DOCTYPE html>\n" + html;
  const baseUrl = new URL("../index.html", window.location.href).href;
  if(!/<base[\s>]/i.test(finalHtml)){
    finalHtml = finalHtml.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n<base href="${baseUrl}">`);
  }
  const blob = new Blob([finalHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  function onLoad(){
    frame.removeEventListener("load", onLoad);
    URL.revokeObjectURL(url);
    callback();
  }
  frame.addEventListener("load", onLoad);
  frame.src = url;
}

// ---------------------------------------------------------------
// Chargement initial : reprend le brouillon localStorage s'il existe
// ---------------------------------------------------------------
frame.addEventListener("load", onFrameLoad, { once: true });

function onFrameLoad(){
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
// Injection des capacités d'édition dans le document de l'iframe
// ---------------------------------------------------------------
function injectEditing(){
  const doc = frame.contentDocument;
  if(!doc) return;

  syncColorInputsFromFrame(doc);

  if(!doc.getElementById("editor-injected-style")){
    const style = doc.createElement("style");
    style.id = "editor-injected-style";
    style.textContent = `
      ${TEXT_SELECTOR}, ${DBLCLICK_TEXT_SELECTOR}, ${LINK_SELECTOR}, ${DELETE_SELECTOR}{
        transition:outline-color .15s ease, background-color .15s ease, filter .15s ease;
        outline:2px dashed transparent; outline-offset:2px;
      }
      .occupation__info, .occupation__info *{ pointer-events:auto !important; }

      /* --- feedback par mode : seul le mode actif montre quelque chose au survol --- */
      body.mode-text ${TEXT_SELECTOR}:hover{ outline-color:#5B8DEF; background-color:rgba(91,141,239,.08); cursor:text; }
      body.mode-text ${DBLCLICK_TEXT_SELECTOR}:hover{ outline-color:#5B8DEF; outline-style:dashed; cursor:text; }
      body.mode-text ${TEXT_SELECTOR}:hover::before,
      body.mode-text ${DBLCLICK_TEXT_SELECTOR}:hover::before{
        position:absolute; top:-24px; left:0; z-index:60;
        font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:700;
        color:#fff; background:#5B8DEF; padding:3px 8px; border-radius:4px;
        white-space:nowrap; pointer-events:none;
      }
      body.mode-text ${TEXT_SELECTOR}:hover::before{ content:"✎ cliquer pour éditer"; }
      body.mode-text ${DBLCLICK_TEXT_SELECTOR}:hover::before{ content:"✎ double-clic pour éditer"; }

      body.mode-images ${IMAGE_SELECTOR}:hover{ outline:3px dashed #A855F7; outline-offset:-3px; filter:brightness(.82); cursor:pointer; }

      body.mode-links ${LINK_SELECTOR}:hover{ outline-color:#4CAF6D; outline-style:dashed; outline-offset:-2px; cursor:pointer; }
      body.mode-links ${LINK_SELECTOR}:hover::before{
        content:"🔗 changer l'URL"; position:absolute; top:-24px; left:0; z-index:60;
        font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:700;
        color:#08150D; background:#4CAF6D; padding:3px 8px; border-radius:4px;
        white-space:nowrap; pointer-events:none;
      }

      body.mode-delete ${DELETE_SELECTOR}:hover{ outline:3px solid #E4483F; outline-offset:-2px; background-color:rgba(228,72,63,.10); cursor:not-allowed; }
      body.mode-delete ${DELETE_SELECTOR}:hover::before{
        content:"🗑 supprimer"; position:absolute; top:-24px; left:0; z-index:60;
        font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:700;
        color:#fff; background:#E4483F; padding:3px 8px; border-radius:4px;
        white-space:nowrap; pointer-events:none;
      }

      .editor-add-tag{
        font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:700;
        color:#5B8DEF; background:transparent; border:1.5px dashed #5B8DEF;
        border-radius:100px; padding:3px 9px; cursor:pointer; opacity:.75;
      }
      .editor-add-tag:hover{ opacity:1; background:rgba(91,141,239,.12); }
      .editor-img-badge{
        position:absolute; top:8px; right:8px; z-index:20;
        width:28px; height:28px; border-radius:50%;
        background:rgba(20,20,24,.75); border:1.5px solid #A855F7;
        color:#fff; font-size:13px; line-height:1;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; opacity:.85;
      }
      .editor-img-badge:hover{ opacity:1; background:#A855F7; }
    `;
    doc.head.appendChild(style);
  }

  // Garantit un contexte de positionnement pour les badges/étiquettes,
  // sans jamais écraser un positionnement déjà défini par le site lui-même.
  doc.querySelectorAll(`${TEXT_SELECTOR}, ${DBLCLICK_TEXT_SELECTOR}, ${LINK_SELECTOR}, ${DELETE_SELECTOR}`)
    .forEach(el => {
      if(doc.defaultView.getComputedStyle(el).position === "static"){
        el.style.position = "relative";
      }
    });

  doc.querySelectorAll(TEXT_SELECTOR).forEach(wireTextElement);
  doc.querySelectorAll(DBLCLICK_TEXT_SELECTOR).forEach(wireDoubleClickEditable);

  // "+" pour ajouter un tag, injecté une seule fois par conteneur
  doc.querySelectorAll(".page__tags").forEach(row => addTagButton(row, false));
  doc.querySelectorAll(".stack-row").forEach(row => addTagButton(row, true));

  // Badge caméra dédié par hobby : le clic normal sur le panneau continue
  // de changer de hobbie, seul ce badge déclenche l'upload d'image.
  doc.querySelectorAll(OCCUPATION_IMAGE_SELECTOR).forEach(addOccupationImageBadge);

  // Interception en phase de capture, selon le mode actif
  if(!doc._editorClickBound){
    doc._editorClickBound = true;
    doc.addEventListener("click", onFrameClick, true);
    doc.addEventListener("keydown", onFrameKeydown, true);
  }

  applyColorsToFrame();
  updateModeOutlines(doc);
  pushHistory();
  updateUndoRedoButtons();
}

function wireTextElement(el){
  if(el._wired) return;
  el._wired = true;
  el.setAttribute("contenteditable", "true");
  const doc = el.ownerDocument;
  el.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.clipboardData || doc.defaultView.clipboardData).getData("text/plain");
    doc.execCommand("insertText", false, text);
  });
  el.addEventListener("input", () => {
    syncLangAttribute(el);
    scheduleSave();
  });
}

// Garde data-fr / data-en synchronisés avec ce qui est visible et édité
function syncLangAttribute(el){
  if(el.dataset.fr === undefined || el.dataset.en === undefined) return;
  const doc = el.ownerDocument;
  const lang = doc.documentElement.lang === "en" ? "en" : "fr";
  el.dataset[lang] = el.innerHTML;
}

// Badge caméra sur chaque hobby : indépendant des modes, ne bloque jamais
// le clic normal du panneau (qui doit continuer à changer de hobbie).
function addOccupationImageBadge(occEl){
  if(occEl.querySelector(":scope > .editor-img-badge")) return;
  const doc = occEl.ownerDocument;
  const badge = doc.createElement("span");
  badge.className = "editor-img-badge";
  badge.textContent = "🖼";
  badge.title = "Changer l'image de fond";
  badge.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    openImagePicker(occEl);
  });
  occEl.appendChild(badge);
}

// Édition par double-clic pour les éléments qui sont AUSSI des contrôles de
// navigation (tabs, pills) : le simple clic garde son comportement normal.
function wireDoubleClickEditable(el){
  if(el._dblWired) return;
  el._dblWired = true;
  const doc = el.ownerDocument;

  el.addEventListener("dblclick", (e) => {
    e.stopPropagation();
    e.preventDefault();
    el.setAttribute("contenteditable", "true");
    el.focus();
    const range = doc.createRange();
    range.selectNodeContents(el);
    const sel = doc.defaultView.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });

  el.addEventListener("blur", () => {
    if(el.getAttribute("contenteditable") !== "true") return;
    el.removeAttribute("contenteditable");
    syncLangAttribute(el);
    pushHistory(); saveDraft();
  });

  el.addEventListener("paste", (e) => {
    if(el.getAttribute("contenteditable") !== "true") return;
    e.preventDefault();
    const text = (e.clipboardData || doc.defaultView.clipboardData).getData("text/plain");
    doc.execCommand("insertText", false, text);
  });
}

// ---------------------------------------------------------------
// Clic dans l'iframe, selon le mode actif
// ---------------------------------------------------------------
function onFrameClick(e){
  if(activeMode === "text"){
    const t = e.target.closest(TEXT_SELECTOR);
    if(t){ e.stopPropagation(); t.focus(); }
    return;
  }

  if(activeMode === "images"){
    const t = e.target.closest(IMAGE_SELECTOR);
    if(t){ e.stopPropagation(); e.preventDefault(); openImagePicker(t); }
    return;
  }

  if(activeMode === "links"){
    const t = e.target.closest(LINK_SELECTOR);
    if(t){
      e.stopPropagation(); e.preventDefault();
      const current = t.getAttribute("href") || "";
      const next = prompt("Nouvelle URL pour ce bouton :", current);
      if(next !== null && next.trim() !== ""){
        t.setAttribute("href", next.trim());
        pushHistory(); saveDraft();
        toast("Lien mis à jour");
      }
    }
    return;
  }

  if(activeMode === "delete"){
    const t = e.target.closest(DELETE_SELECTOR);
    if(t){
      e.stopPropagation(); e.preventDefault();
      if(t.classList.contains("pill")){
        removeProject(t.dataset.project);
      }else{
        t.remove();
        pushHistory(); saveDraft();
        toast("Élément supprimé");
      }
    }
    return;
  }
}

function onFrameKeydown(e){
  const key = e.key.toLowerCase();
  if((e.ctrlKey || e.metaKey) && key === "z"){
    e.preventDefault();
    if(e.shiftKey) redo(); else undo();
  }
  if((e.ctrlKey || e.metaKey) && key === "y"){
    e.preventDefault();
    redo();
  }
}
document.addEventListener("keydown", onFrameKeydown);

// ---------------------------------------------------------------
// Upload d'image → redimensionnement → data URL
// ---------------------------------------------------------------
function openImagePicker(target){
  currentImageTarget = target;
  fileInput.value = "";
  fileInput.click();
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if(!file || !currentImageTarget) return;

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

      if(currentImageTarget.tagName === "IMG"){
        currentImageTarget.src = dataUrl;
      }else{
        currentImageTarget.style.backgroundImage = `url('${dataUrl}')`;
      }
      pushHistory(); saveDraft();
      toast("Image mise à jour");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// ---------------------------------------------------------------
// Ajout d'un tag (page__tags ou stack-row)
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
    span.focus();
    const range = doc.createRange();
    range.selectNodeContents(span);
    const sel = doc.defaultView.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    pushHistory(); saveDraft();
  });
  row.appendChild(btn);
}

// ---------------------------------------------------------------
// Ajout / suppression de projets (pill + tiroir de 4 pages)
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
        <p class="page__tags">
          <span data-fr="Tag 1" data-en="Tag 1">Tag 1</span><span data-fr="Tag 2" data-en="Tag 2">Tag 2</span><span data-fr="Année" data-en="Year">Année</span>
        </p>
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
  if(!confirm("Supprimer ce projet et ses 4 pages ? C'est irréversible (sauf Ctrl+Z).")) return;
  const doc = frame.contentDocument;
  doc.querySelector(`.pill[data-project="${id}"]`)?.remove();
  doc.querySelector(`.project-drawer[data-drawer="${id}"]`)?.remove();
  reloadFromCurrentState(() => toast("Projet supprimé"));
}

// Recharge le document depuis son état courant : nécessaire après une
// modification de structure pour que main.js re-détecte les éléments
// (nouveaux tiroirs, pills...) et rebranche ses propres écouteurs.
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
// Couleurs — appliquées en direct sur :root de l'iframe
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
  input.addEventListener("input", () => {
    applyColorsToFrame();
    scheduleSave();
  });
});

// ---------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------
function pushHistory(){
  if(isRestoring) return;
  const doc = frame.contentDocument;
  if(!doc) return;
  const html = doc.documentElement.outerHTML;
  if(historyStack[historyIndex] === html) return;
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(html);
  if(historyStack.length > HISTORY_LIMIT) historyStack.shift();
  historyIndex = historyStack.length - 1;
  updateUndoRedoButtons();
}

function restoreSnapshot(html){
  isRestoring = true;
  loadHtmlIntoFrame(html, () => {
    injectEditing();
    isRestoring = false;
    saveDraft();
    updateUndoRedoButtons();
  });
}

function undo(){
  if(historyIndex <= 0){ toast("Rien à annuler"); return; }
  historyIndex--;
  restoreSnapshot(historyStack[historyIndex]);
}
function redo(){
  if(historyIndex >= historyStack.length - 1){ toast("Rien à rétablir"); return; }
  historyIndex++;
  restoreSnapshot(historyStack[historyIndex]);
}
function updateUndoRedoButtons(){
  btnUndo.disabled = historyIndex <= 0;
  btnRedo.disabled = historyIndex >= historyStack.length - 1;
}
btnUndo.addEventListener("click", undo);
btnRedo.addEventListener("click", redo);

// ---------------------------------------------------------------
// Autosave (localStorage) — avec garde-fou si le quota est dépassé
// ---------------------------------------------------------------
function scheduleSave(){
  saveStatus.textContent = "Sauvegarde…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { pushHistory(); saveDraft(); }, 500);
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
// Téléchargement du site final (nettoyé des artefacts de l'éditeur)
// ---------------------------------------------------------------
btnDownload.addEventListener("click", () => {
  const doc = frame.contentDocument;
  const clone = doc.documentElement.cloneNode(true);

  clone.querySelectorAll("[contenteditable]").forEach(el => el.removeAttribute("contenteditable"));
  clone.querySelectorAll(".editor-add-tag").forEach(el => el.remove());
  clone.querySelectorAll(".editor-img-badge").forEach(el => el.remove());
  clone.querySelector("#editor-injected-style")?.remove();
  clone.querySelector("base[href]")?.remove();
  // retire les position:relative que l'éditeur a pu ajouter en style inline
  clone.querySelectorAll('[style*="position: relative"]').forEach(el => {
    if(el.getAttribute("style").trim() === "position: relative;") el.removeAttribute("style");
  });

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
// Réinitialiser : efface le brouillon et recharge le vrai site
// (vraie navigation vers le fichier réel, pas de reconstruction)
// ---------------------------------------------------------------
btnReset.addEventListener("click", () => {
  if(!confirm("Effacer toutes les modifications en cours et repartir du site actuel ?")) return;
  localStorage.removeItem(DRAFT_KEY);
  historyStack = []; historyIndex = -1;
  const onLoad = () => { injectEditing(); toast("Brouillon effacé"); };
  frame.addEventListener("load", onLoad, { once: true });
  frame.src = "../index.html?_=" + Date.now();
});
