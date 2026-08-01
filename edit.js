/* ==================================================================
   ÉDITEUR VISUEL — charge le vrai site dans l'iframe et le rend
   éditable directement dessus (pas de copie séparée à maintenir).

   ⚠️ Doit tourner sur http(s):// (GitHub Pages, ou un serveur local
   type `npx serve`). Ouvrir ce fichier en double-clic (file://)
   bloque l'accès à l'iframe pour des raisons de sécurité navigateur.
================================================================== */

const DRAFT_KEY = "portfolio_editor_draft_v1";

const frame       = document.getElementById("siteFrame");
const btnText      = document.getElementById("btnText");
const btnImages    = document.getElementById("btnImages");
const btnDownload  = document.getElementById("btnDownload");
const btnReset     = document.getElementById("btnReset");
const saveStatus   = document.getElementById("saveStatus");
const fileInput    = document.getElementById("fileInput");
const toastEl      = document.getElementById("toast");

const colorInputs = {
  "--red":   document.getElementById("colorRed"),
  "--ink":   document.getElementById("colorInk"),
  "--yellow":document.getElementById("colorYellow"),
  "--paper": document.getElementById("colorPaper"),
};

let textModeOn = true;
let imageModeOn = true;
let currentImageTarget = null;
let saveTimer = null;

const TEXT_SELECTOR = [
  ".card__brand", ".role", ".about-bio",
  ".page__text h3", ".page__pitch", ".page__meta", ".page__list li", ".page__tags span",
  ".stat", ".occupation__label", ".occupation__info h3", ".occupation__info p",
  ".occupation__stat", ".stack-tag",
].join(", ");

const IMAGE_SELECTOR = "img.avatar, img.page__img, .occupation";

function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("is-visible");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("is-visible"), 2600);
}

// ---------------------------------------------------------------
// Chargement initial : reprend le brouillon localStorage s'il existe
// ---------------------------------------------------------------
frame.addEventListener("load", onFrameLoad, { once: true });

function onFrameLoad(){
  const draft = localStorage.getItem(DRAFT_KEY);
  if(draft){
    const doc = frame.contentDocument;
    doc.open();
    doc.write(draft);
    doc.close();
    toast("Brouillon précédent restauré");
  }
  injectEditing();
}

// ---------------------------------------------------------------
// Injection des capacités d'édition dans le document de l'iframe
// ---------------------------------------------------------------
function injectEditing(){
  const doc = frame.contentDocument;
  if(!doc) return;

  const style = doc.createElement("style");
  style.id = "editor-injected-style";
  style.textContent = `
    ${TEXT_SELECTOR}{ cursor:text; transition:outline-color .15s ease, background-color .15s ease; outline:2px dashed transparent; outline-offset:2px; }
    ${TEXT_SELECTOR}:hover{ outline-color:#5B8DEF; background-color:rgba(91,141,239,0.08); }
    ${TEXT_SELECTOR}:focus{ outline-color:#4CAF6D; background-color:rgba(76,175,109,0.10); }
    ${IMAGE_SELECTOR}{ cursor:pointer !important; }
    ${IMAGE_SELECTOR}:hover{ outline:3px dashed #5B8DEF; outline-offset:-3px; filter:brightness(.85); }
    .occupation__info, .occupation__info *{ pointer-events:auto !important; }
  `;
  doc.head.appendChild(style);

  doc.querySelectorAll(TEXT_SELECTOR).forEach(el => {
    el.setAttribute("contenteditable", "true");
    el.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || doc.defaultView.clipboardData).getData("text/plain");
      doc.execCommand("insertText", false, text);
    });
    el.addEventListener("input", scheduleSave);
  });

  // Interception en phase de capture : bloque les handlers du site
  // (tabs, pills, occupations...) tant qu'un mode d'édition est actif.
  doc.addEventListener("click", (e) => {
    const textTarget = e.target.closest(TEXT_SELECTOR);
    const imageTarget = e.target.closest(IMAGE_SELECTOR);

    if(textModeOn && textTarget){
      e.stopPropagation();
      textTarget.focus();
      return;
    }
    if(imageModeOn && imageTarget){
      e.stopPropagation();
      e.preventDefault();
      openImagePicker(imageTarget);
    }
  }, true);

  applyColorsToFrame();
}

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
      scheduleSave();
      toast("Image mise à jour");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

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

Object.values(colorInputs).forEach(input => {
  input.addEventListener("input", () => {
    applyColorsToFrame();
    scheduleSave();
  });
});

// ---------------------------------------------------------------
// Autosave (localStorage) — avec garde-fou si le quota est dépassé
// ---------------------------------------------------------------
function scheduleSave(){
  saveStatus.textContent = "Sauvegarde…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 500);
}

function saveDraft(){
  try{
    const doc = frame.contentDocument;
    const html = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
    localStorage.setItem(DRAFT_KEY, html);
    saveStatus.textContent = "Brouillon à jour";
  }catch(err){
    saveStatus.textContent = "⚠ Sauvegarde impossible (quota)";
    toast("Trop de modifications pour la sauvegarde auto — télécharge le site pour ne rien perdre");
  }
}

// ---------------------------------------------------------------
// Toggles des modes
// ---------------------------------------------------------------
btnText.addEventListener("click", () => {
  textModeOn = !textModeOn;
  btnText.classList.toggle("is-active", textModeOn);
});
btnImages.addEventListener("click", () => {
  imageModeOn = !imageModeOn;
  btnImages.classList.toggle("is-active", imageModeOn);
});

// ---------------------------------------------------------------
// Téléchargement du site final (nettoyé des artefacts de l'éditeur)
// ---------------------------------------------------------------
btnDownload.addEventListener("click", () => {
  const doc = frame.contentDocument;
  const clone = doc.documentElement.cloneNode(true);

  clone.querySelectorAll("[contenteditable]").forEach(el => el.removeAttribute("contenteditable"));
  clone.querySelector("#editor-injected-style")?.remove();

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
// ---------------------------------------------------------------
btnReset.addEventListener("click", () => {
  if(!confirm("Effacer toutes les modifications en cours et repartir du site actuel ?")) return;
  localStorage.removeItem(DRAFT_KEY);
  frame.removeEventListener("load", onFrameLoad);
  frame.addEventListener("load", () => injectEditing(), { once: true });
  frame.src = "../index.html?_=" + Date.now();
  toast("Brouillon effacé");
});
