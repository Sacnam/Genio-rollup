// File: content.js
// Version: Floating UI ... (v14),
//          Translate Undefined Debug, Prompt Button CSS Fixes, '+' Navigates, 3 Default Prompts Width (v15).
// AGGIORNAMENTO: Corretta la funzione getStorageValue per usare callback con Manifest V2
// MODIFICHE v22:
// - UI Fluttuante: Scorrimento orizzontale per i bottoni confermato.
// - Bottone Sidebar: Altezza ridotta, forma orizzontale "(<| |)" ripristinata come da versione originale v15 ma con altezza ridotta.
// MODIFICHE PER ICONE LOCALI:
// - Sostituite le icone 'search', 'content_copy', 'translate' con immagini PNG da 'icons/img/'.
// - Gestito il cambio icona per 'copia' mostrando/nascondendo l'immagine e un'icona di feedback Material Symbol.
// - Icone PNG locali per i bottoni dei Custom Prompt, colorabili con mask-image.
// MODIFICHE v22.4 (Fix Sidebar Tab Click/Drag & Resize):
// - Ripristinata la logica per il click e il trascinamento verticale del tab della sidebar.
// - Ripristinata la logica per il trascinamento orizzontale del handle di ridimensionamento della sidebar.
// MODIFICHE PER MANIFEST V3:
// - Aggiornate getStorageValue e setStorageValue per usare direttamente le Promise delle API chrome.storage.

let floatingUI = null;
let currentSelection = '';
let isUIInteraction = false;
let isResizingFloatingUI = false;

let currentButtonsContainerMousedownListener = null;
let currentButtonsContainerMouseOverListener = null;
let currentButtonsContainerMouseOutListener = null;
let currentButtonsContainerMouseUpListener = null;

const STORAGE_KEY_CUSTOM_PROMPTS = 'userCustomPrompts';
const STORAGE_KEY_FLOATING_UI_WIDTH = 'floatingUIWidth';

// Dimensioni UI fluttuante (Floating UI)
const DEFAULT_UI_WIDTH = 225;
const ACTION_TOOLBAR_HEIGHT = 38;
const CUSTOM_PROMPT_BUTTON_HEIGHT = 30;
const PANEL_VERTICAL_PADDING = 5;

const CUSTOM_PROMPT_AREA_HEIGHT = CUSTOM_PROMPT_BUTTON_HEIGHT + (PANEL_VERTICAL_PADDING * 2); // 40px
const BASE_UI_HEIGHT = ACTION_TOOLBAR_HEIGHT + CUSTOM_PROMPT_AREA_HEIGHT; // 78px

const MIN_FLOATING_UI_WIDTH = 150;
const MAX_FLOATING_UI_WIDTH = 400;
const TRANSLATE_MODE_UI_HEIGHT = 180;

// Dimensioni Sidebar
const TAB_HEIGHT_PX = 30;
const TAB_RADIUS_PX = TAB_HEIGHT_PX / 2;
const RECT_WIDTH_PX = 16;
const ARROW_PADDING_LEFT_PX = 5;
const NEW_TOTAL_TAB_WIDTH_PX = TAB_RADIUS_PX + RECT_WIDTH_PX; // 15 + 16 = 31px
const ARROW_ICON_WIDTH_PX = 20;
const MIN_SIDEBAR_WIDTH_PX = 280;
const MAX_SIDEBAR_WIDTH_PERCENT = 80;
const HANDLE_WIDTH_PX = 8;
const HANDLE_OFFSET_PX = Math.floor(HANDLE_WIDTH_PX / 2); // 4px

const AVAILABLE_PROMPT_ICONS_PNG = [
    'auto_stories', 'brightness_2', 'brightness_5', 'brush', 'colorize',
    'content_copy', 'dropper_eye', 'filter_center_focus', 'filter_drama',
    'flare', 'gamepad', 'genres', 'grain', 'group_search', 'hourglass_pause',
    'hourglass_top', 'hourglass', 'landscape_2', 'landscape', 'motion_mode',
    'mp', 'nature', 'network_intel_node', 'network_intelligence_history',
    'network_intelligence', 'palette', 'perm_phone_msg', 'photo_prints',
    'picture_in_picture_mobile', 'rocket_launch', 'search', 'sports_esports',
    'stacked_email', 'tactic', 'timer_play', 'timer', 'tonality_2',
    'trail_length', 'translate', 'wand_stars', 'wb_incandescent'
];

function ensureMaterialSymbolsFont() {
    const fontUrl = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";
    const fontId = "material-symbols-outlined-font-link";
    if (!document.getElementById(fontId) && document.head) {
        const link = document.createElement('link');
        link.id = fontId; link.rel = 'stylesheet'; link.href = fontUrl;
        document.head.appendChild(link);
    }
}
ensureMaterialSymbolsFont();

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') { unsafe = String(unsafe || ''); }
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, "")
         .replace(/'/g, "'");
}

function hexToRgb(hex) { if (!hex || typeof hex !== 'string') return null; const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i; hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b); const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null; }
function rgbToHex(r, g, b) { r = Math.max(0, Math.min(255, Math.round(r))); g = Math.max(0, Math.min(255, Math.round(g))); b = Math.max(0, Math.min(255, Math.round(b))); return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase(); }
function lightenHexColor(hex, percent) { const rgb = hexToRgb(hex); if (!rgb) return hex; const newR = rgb.r + (255 - rgb.r) * percent; const newG = rgb.g + (255 - rgb.g) * percent; const newB = rgb.b + (255 - rgb.b) * percent; return rgbToHex(newR, newG, newB); }
function darkenHexColor(hex, percent) { const rgb = hexToRgb(hex); if (!rgb) return hex; const newR = rgb.r * (1 - percent); const newG = rgb.g * (1 - percent); const newB = rgb.b * (1 - percent); return rgbToHex(newR, newG, newB); }

const getStorageValue = async (key, defaultValue) => {
    try {
        const result = await chrome.storage.local.get([key]);
        if (chrome.runtime.lastError) {
            console.error(`Error retrieving ${key}:`, chrome.runtime.lastError.message);
            return defaultValue;
        }
        return result && result[key] !== undefined ? result[key] : defaultValue;
    } catch (error) {
        console.error(`Error retrieving ${key} (catch):`, error.message);
        return defaultValue;
    }
};

const setStorageValue = async (key, value) => {
    try {
        await chrome.storage.local.set({ [key]: value });
        if (chrome.runtime.lastError) {
            console.error(`Error saving ${key}:`, chrome.runtime.lastError.message);
            throw chrome.runtime.lastError;
        }
    } catch (error) {
        console.error(`Error saving ${key} (catch):`, error.message);
        throw error;
    }
};

const getPreferredLanguage = () => getStorageValue('preferredLanguage', 'en');
const setPreferredLanguage = (lang) => setStorageValue('preferredLanguage', lang);
const getSidebarTabTop = () => getStorageValue('sidebarTabTop', '15%');
const setSidebarTabTop = (topValue) => setStorageValue('sidebarTabTop', topValue);
const getSidebarWidth = () => getStorageValue('sidebarWidth', 360);
const setSidebarWidth = (widthPx) => setStorageValue('sidebarWidth', widthPx);
const getFloatingUIWidth = () => getStorageValue(STORAGE_KEY_FLOATING_UI_WIDTH, DEFAULT_UI_WIDTH);
const setFloatingUIWidth = (widthPx) => setStorageValue(STORAGE_KEY_FLOATING_UI_WIDTH, widthPx);


function generateCustomPromptsAreaHtml(customPrompts) {
    let areaHtml = '';
    let useCustomPrompts = Array.isArray(customPrompts) && customPrompts.length > 0;

    if (useCustomPrompts) {
        let buttonsHtml = '';
        const defaultVibrant = '#1a73e8'; const defaultLight = '#e8f0fe';
        const defaultHoverBg = '#d6e4ff'; const defaultHoverBorder = '#1557b0'; const defaultHoverText = '#1557b0';
        const defaultActiveBg = '#c2d7ff'; const defaultActiveBorder = '#124a99'; const defaultActiveText = defaultActiveBorder;

        customPrompts.forEach(prompt => {
            let finalVibrant = defaultVibrant; let finalLight = defaultLight;
            let hoverBgColor = defaultHoverBg; let hoverBorderColor = defaultHoverBorder; let hoverTextColor = defaultHoverText;
            let activeBgColor = defaultActiveBg; let activeBorderColor = defaultActiveBorder; let activeTextColor = activeBorderColor;
            const userColor = prompt.color;

            if (userColor && userColor.match(/^#[0-9A-F]{6}$/i) && userColor !== '#ffffff' && userColor !== '#000000') {
                try {
                    const lightBg = lightenHexColor(userColor, 0.85);
                    if (lightBg) {
                        finalVibrant = userColor; finalLight = lightBg;
                        hoverBgColor = darkenHexColor(finalLight, 0.1); hoverBorderColor = darkenHexColor(finalVibrant, 0.15); hoverTextColor = hoverBorderColor;
                        activeBgColor = darkenHexColor(finalLight, 0.2); activeBorderColor = darkenHexColor(finalVibrant, 0.25); activeTextColor = activeBorderColor;
                    }
                } catch (e) { console.error("Error processing dynamic colors for prompt:", prompt.title, e); }
            }

            let iconHtml = '';
            if (prompt.iconName && typeof prompt.iconName === 'string' && prompt.iconName.trim() !== '') {
                const iconUrl = chrome.runtime.getURL(`icons/img/${prompt.iconName}.png`);
                iconHtml = `<span class="custom-prompt-icon-mask" style="--icon-url: url('${iconUrl}'); background-color: ${finalVibrant};"></span>`;
            }

            buttonsHtml += `
                <button class="action-btn custom-prompt-btn" data-prompt="${escapeHtml(prompt.prompt)}" title="${escapeHtml(prompt.title)}"
                        style="background-color: ${finalLight}; border-color: ${finalVibrant}; color: ${finalVibrant};"
                        data-base-bg="${finalLight}" data-base-border="${finalVibrant}" data-base-text="${finalVibrant}"
                        data-hover-bg="${hoverBgColor}" data-hover-border="${hoverBorderColor}" data-hover-text="${hoverTextColor}"
                        data-active-bg="${activeBgColor}" data-active-border="${activeBorderColor}" data-active-text="${activeTextColor}">
                    ${iconHtml}
                    <span>${escapeHtml(prompt.title)}</span>
                </button>
            `;
        });
        buttonsHtml += `
            <button class="action-btn add-new-prompt-inline-btn" title="Gestisci Prompt">
                <span class="material-symbols-outlined">add</span>
            </button>
        `;
        areaHtml = `<div class="buttons-container">${buttonsHtml}</div>`;
    } else {
        areaHtml = `
            <button class="action-btn add-prompts-placeholder-btn" title="Crea i tuoi prompt personalizzati">
                <span class="material-symbols-outlined">construction</span>
                <span>Build your prompt</span>
            </button>
        `;
    }
    return { html: areaHtml, useCustom: useCustomPrompts };
}

function attachButtonListeners(shadowRoot, useCustomPrompts) {
    const mainPanel = shadowRoot.querySelector('.main-panel');
    if (!mainPanel) return;

    const buttonsContainer = shadowRoot.querySelector('.buttons-container');
    if (buttonsContainer) {
        if (currentButtonsContainerMousedownListener) buttonsContainer.removeEventListener('mousedown', currentButtonsContainerMousedownListener);
        if (currentButtonsContainerMouseOverListener) buttonsContainer.removeEventListener('mouseover', currentButtonsContainerMouseOverListener);
        if (currentButtonsContainerMouseOutListener) buttonsContainer.removeEventListener('mouseout', currentButtonsContainerMouseOutListener);
        if (currentButtonsContainerMouseUpListener) buttonsContainer.removeEventListener('mouseup', currentButtonsContainerMouseUpListener);
    }

    if (useCustomPrompts && buttonsContainer) {
        const defaultVibrant = '#1a73e8'; const defaultLight = '#e8f0fe';
        const defaultHoverBg = '#d6e4ff'; const defaultHoverBorder = '#1557b0'; const defaultHoverText = '#1557b0';
        const defaultActiveBg = '#c2d7ff'; const defaultActiveBorder = '#124a99'; const defaultActiveText = '#124a99';

        currentButtonsContainerMousedownListener = (e) => {
            if (e.button !== 0) return;
            const clickedButton = e.target.closest('.custom-prompt-btn');
            if (!clickedButton) return;
            clickedButton.classList.add('active-state');
            clickedButton.style.backgroundColor = clickedButton.dataset.activeBg || defaultActiveBg;
            clickedButton.style.borderColor = clickedButton.dataset.activeBorder || defaultActiveBorder;
            clickedButton.style.color = clickedButton.dataset.activeText || defaultActiveText;
            const iconMask = clickedButton.querySelector('.custom-prompt-icon-mask');
            if (iconMask) iconMask.style.backgroundColor = clickedButton.dataset.activeText || defaultActiveText;
            clickedButton.style.transform = 'scale(0.97)';
        };
        currentButtonsContainerMouseOverListener = (e) => {
            const btn = e.target.closest('.custom-prompt-btn');
            if (btn && !btn.classList.contains('active-state')) {
                btn.style.backgroundColor = btn.dataset.hoverBg || defaultHoverBg;
                btn.style.borderColor = btn.dataset.hoverBorder || defaultHoverBorder;
                btn.style.color = btn.dataset.hoverText || defaultHoverText;
                const iconMask = btn.querySelector('.custom-prompt-icon-mask');
                if (iconMask) iconMask.style.backgroundColor = btn.dataset.hoverText || defaultHoverText;
            }
        };
        currentButtonsContainerMouseOutListener = (e) => {
            const btn = e.target.closest('.custom-prompt-btn');
            if (btn && !btn.contains(e.relatedTarget) && !btn.classList.contains('active-state')) {
                btn.style.transform = 'scale(1)';
                btn.style.backgroundColor = btn.dataset.baseBg || defaultLight;
                btn.style.borderColor = btn.dataset.baseBorder || defaultVibrant;
                btn.style.color = btn.dataset.baseText || defaultVibrant;
                const iconMask = btn.querySelector('.custom-prompt-icon-mask');
                if (iconMask) iconMask.style.backgroundColor = btn.dataset.baseText || defaultVibrant;
            }
        };
         currentButtonsContainerMouseUpListener = (e) => {
            const clickedButton = e.target.closest('.custom-prompt-btn');
            const activeBtn = buttonsContainer.querySelector('.custom-prompt-btn.active-state');

            if (activeBtn) {
                 activeBtn.classList.remove('active-state');
                 activeBtn.style.transform = 'scale(1)';
                 const iconMask = activeBtn.querySelector('.custom-prompt-icon-mask');
                 if (activeBtn.matches(':hover')) {
                     activeBtn.style.backgroundColor = activeBtn.dataset.hoverBg || defaultHoverBg;
                     activeBtn.style.borderColor = activeBtn.dataset.hoverBorder || defaultHoverBorder;
                     activeBtn.style.color = activeBtn.dataset.hoverText || defaultHoverText;
                     if (iconMask) iconMask.style.backgroundColor = activeBtn.dataset.hoverText || defaultHoverText;
                 } else {
                     activeBtn.style.backgroundColor = activeBtn.dataset.baseBg || defaultLight;
                     activeBtn.style.borderColor = activeBtn.dataset.baseBorder || defaultVibrant;
                     activeBtn.style.color = activeBtn.dataset.baseText || defaultVibrant;
                     if (iconMask) iconMask.style.backgroundColor = activeBtn.dataset.baseText || defaultVibrant;
                 }
                 if (clickedButton === activeBtn) {
                     handleCustomPromptClick({ currentTarget: clickedButton });
                 }
            }
            setTimeout(() => { isUIInteraction = false; }, 50);
            e.stopPropagation();
        };

        buttonsContainer.addEventListener('mousedown', currentButtonsContainerMousedownListener);
        buttonsContainer.addEventListener('mouseover', currentButtonsContainerMouseOverListener);
        buttonsContainer.addEventListener('mouseout', currentButtonsContainerMouseOutListener);
        buttonsContainer.addEventListener('mouseup', currentButtonsContainerMouseUpListener);

        const addNewPromptInlineBtn = shadowRoot.querySelector('.add-new-prompt-inline-btn');
        if (addNewPromptInlineBtn) {
            addNewPromptInlineBtn.addEventListener('click', openManagePromptsSidebar);
        }
    }

    const searchBtn = shadowRoot.querySelector('.search-btn');
    const copyTextBtn = shadowRoot.querySelector('.copy-text-btn');
    const translateActionBtn = shadowRoot.querySelector('.translate-action-btn');
    const addPromptsPlaceholderBtn = shadowRoot.querySelector('.add-prompts-placeholder-btn');
    const targetLangSelect = shadowRoot.querySelector('.target-lang');

    if (searchBtn) searchBtn.addEventListener('click', handleSearchClick);
    if (copyTextBtn) copyTextBtn.addEventListener('click', handleCopySelectionClick);
    if (translateActionBtn) {
        translateActionBtn.addEventListener('click', async (e) => {
            await toggleTranslateMode(shadowRoot, e);
        });
    }
    if (targetLangSelect) {
        targetLangSelect.addEventListener('change', async () => {
            const translationBox = shadowRoot.querySelector('.translation-box');
            if (translationBox.style.display === 'flex' && currentSelection) {
                await executeTranslation(shadowRoot, currentSelection, targetLangSelect.value);
                await setPreferredLanguage(targetLangSelect.value);
            }
        });
    }
    if (addPromptsPlaceholderBtn) {
        addPromptsPlaceholderBtn.addEventListener('click', openManagePromptsSidebar);
    }
}

function openManagePromptsSidebar() {
    openChatbot();
    sendToSidebar('NAVIGATE_TO', { page: 'manage_prompts.html' });
    if (floatingUI && document.body.contains(floatingUI)) {
        document.body.removeChild(floatingUI);
        floatingUI = null;
    }
}

async function toggleTranslateMode(shadowRoot, event) {
    const translationBox = shadowRoot.querySelector('.translation-box');
    const actionsToolbar = shadowRoot.querySelector('.actions-toolbar');
    const customPromptsArea = shadowRoot.querySelector('.custom-prompts-area');
    const resizeHandle = shadowRoot.querySelector('.floating-ui-resize-handle');

    const isTranslating = translationBox.style.display === 'flex';

    if (isTranslating) {
        translationBox.style.display = 'none';
        if (actionsToolbar) actionsToolbar.style.display = 'flex';
        if (customPromptsArea) customPromptsArea.style.display = 'flex';
        if (floatingUI) floatingUI.style.height = `${BASE_UI_HEIGHT}px`;
        if (resizeHandle) resizeHandle.style.display = 'block';
    } else {
        translationBox.style.display = 'flex';
        if (actionsToolbar) actionsToolbar.style.display = 'none';
        if (customPromptsArea) customPromptsArea.style.display = 'none';

        if (floatingUI) floatingUI.style.height = `${TRANSLATE_MODE_UI_HEIGHT}px`;
        if (resizeHandle) resizeHandle.style.display = 'none';
        if (event && currentSelection) {
            const targetLangSelect = shadowRoot.querySelector('.target-lang');
            await executeTranslation(shadowRoot, currentSelection, targetLangSelect.value);
            await setPreferredLanguage(targetLangSelect.value);
        }
    }
    setTimeout(() => { isUIInteraction = false; }, 50);
}

async function executeTranslation(shadowRoot, text, targetLang) {
    const translationResult = shadowRoot.querySelector('.translation-result');
    if (!translationResult) return;
    translationResult.value = 'Translating...';
    if (!text) {
        translationResult.value = 'No text selected.';
        return;
    }
    try {
        const translatedText = await translateText(text, targetLang);
        translationResult.value = translatedText;
    } catch (error) {
        console.error("Translation API error in executeTranslation:", error);
        translationResult.value = `Error: ${error.message || 'Translation failed'}`;
    }
}

function handleCustomPromptClick(event) {
    const targetButton = event.currentTarget;
    if (targetButton) {
        const promptText = targetButton.dataset.prompt;
        const selectedText = currentSelection;
        if (promptText) {
            const textToSend = `${promptText}: ${selectedText}`;
            openChatbot();
            setTimeout(() => {
                sendToSidebar('PREFILL_CHAT', { text: textToSend });
                if (floatingUI && document.body.contains(floatingUI)) {
                    document.body.removeChild(floatingUI);
                    floatingUI = null;
                }
            }, 150);
        } else { console.warn("Floating UI: Custom prompt button clicked, but data-prompt attribute was missing or empty."); }
    }
}

function handleSearchClick() {
    const selectedText = currentSelection;
    if (selectedText) {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(selectedText)}`;
        window.open(searchUrl, '_blank');
        if (floatingUI && document.body.contains(floatingUI)) {
            document.body.removeChild(floatingUI);
            floatingUI = null;
        }
    } else {
        console.warn("Floating UI: Search clicked, but no text selected.");
    }
    setTimeout(() => { isUIInteraction = false; }, 50);
}

async function handleCopySelectionClick() {
    const selectedText = currentSelection;
    if (selectedText) {
        try {
            await navigator.clipboard.writeText(selectedText);
            const copyBtnContainer = floatingUI.shadowRoot.querySelector('.copy-text-btn');
            if (copyBtnContainer) {
                const imgIcon = copyBtnContainer.querySelector('.copy-icon-img');
                const feedbackIcon = copyBtnContainer.querySelector('.copy-feedback-icon');

                if (imgIcon && feedbackIcon) {
                    imgIcon.style.display = 'none';
                    feedbackIcon.style.display = 'inline-block';
                    setTimeout(() => {
                        imgIcon.style.display = 'inline-block';
                        feedbackIcon.style.display = 'none';
                    }, 1500);
                }
            }
        } catch (err) { console.error('Floating UI: Failed to copy text: ', err); }
    } else { console.warn("Floating UI: Copy clicked, but no text selected."); }
    setTimeout(() => { isUIInteraction = false; }, 50);
}

function updateFloatingUIButtons(newPrompts) {
    if (!floatingUI || !floatingUI.shadowRoot) { console.warn("updateFloatingUIButtons called but floatingUI or shadowRoot is missing."); return; }
    const shadow = floatingUI.shadowRoot;
    const customPromptsArea = shadow.querySelector('.custom-prompts-area');
    if (!customPromptsArea) { console.error("Floating UI (update): Custom prompts area not found in existing UI."); return; }
    const { html: newPromptsAreaHtml, useCustom: newUseCustom } = generateCustomPromptsAreaHtml(newPrompts);
    customPromptsArea.innerHTML = newPromptsAreaHtml;
    attachButtonListeners(shadow, newUseCustom);
}

const handleSelection = (e) => {
    const isImage = e.target.tagName === 'IMG';
    if (isImage) {
        if (floatingUI && document.body.contains(floatingUI)) {
            document.body.removeChild(floatingUI); floatingUI = null;
        }
        currentSelection = ''; return;
    }
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    if (!selectedText) {
        if (floatingUI && document.body.contains(floatingUI) && !isUIInteraction && !isResizingFloatingUI) {
             const path = e.composedPath();
             if (!path.some(el => el === floatingUI)) {
                 document.body.removeChild(floatingUI); floatingUI = null; currentSelection = '';
             }
        }
        return;
    }
    try {
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const selectionRect = range.getBoundingClientRect();
            if (selectionRect && (selectionRect.width > 0 || selectionRect.height > 0)) {
                if (!floatingUI || selectedText !== currentSelection) {
                    currentSelection = selectedText;
                    if (floatingUI && document.body.contains(floatingUI)) {
                        document.body.removeChild(floatingUI); floatingUI = null;
                    }
                    createFloatingUI(selectionRect);
                }
            } else if (floatingUI && document.body.contains(floatingUI) && !isUIInteraction && !isResizingFloatingUI) {
                 const path = e.composedPath();
                 if (!path.some(el => el === floatingUI)) {
                    document.body.removeChild(floatingUI); floatingUI = null; currentSelection = '';
                 }
            }
        }
    } catch (error) {
        console.error("Error getting selection position:", error);
        if (floatingUI && document.body.contains(floatingUI)) {
            document.body.removeChild(floatingUI); floatingUI = null;
        }
        currentSelection = '';
    }
};

const createFloatingUI = async (selectionRect) => {
    if (floatingUI && document.body.contains(floatingUI)) {
        document.body.removeChild(floatingUI);
        floatingUI = null;
    }

    floatingUI = document.createElement('div');
    floatingUI.style.position = 'absolute';
    floatingUI.style.opacity = '0';
    floatingUI.style.zIndex = '2147483647';
    floatingUI.style.overflow = 'hidden';

    const savedWidth = await getFloatingUIWidth();
    floatingUI.style.width = `${savedWidth}px`;
    floatingUI.style.height = `${BASE_UI_HEIGHT}px`;

    const shadow = floatingUI.attachShadow({ mode: 'open' });
    let initialPrompts = await getStorageValue(STORAGE_KEY_CUSTOM_PROMPTS, []);
    const { html: customPromptsAreaHtml, useCustom: initialUseCustomPrompts } = generateCustomPromptsAreaHtml(initialPrompts);

    shadow.innerHTML = `
      <style>
        :host { display: block; }
        .material-symbols-outlined { font-family: 'Material Symbols Outlined'; font-weight: normal; font-style: normal; font-size: 20px; line-height: 1; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; font-feature-settings: 'liga'; }

        .custom-icon {
          vertical-align: middle;
          display: inline-block;
          filter: invert(1);
        }
        .actions-toolbar .action-icon-btn .custom-icon {
          width: 20px;
          height: 20px;
        }
        .actions-toolbar .action-icon-btn .copy-feedback-icon {
           font-size: 20px;
        }
        .translation-box .copy-translation-btn .custom-icon {
          width: 18px;
          height: 18px;
        }
        .translation-box .copy-translation-btn .copy-feedback-icon {
          font-size: 18px;
        }

        .custom-prompt-icon-mask {
          display: inline-block;
          width: 14px;
          height: 14px;
          margin-bottom: 2px;
          -webkit-mask-image: var(--icon-url);
          mask-image: var(--icon-url);
          -webkit-mask-size: contain;
          mask-size: contain;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-position: center;
        }

        .main-panel { display: flex; flex-direction: column; width: 100%; height: 100%; background: #ffffff; border-radius: 7px; box-shadow: 0 5px 15px rgba(0,0,0,0.12), 0 3px 6px rgba(0,0,0,0.08); border: 1px solid #d1d1d1; box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; user-select: none; -webkit-user-select: none; transition: opacity 0.15s ease-in-out, width 0.2s ease-out, height 0.2s ease-out; overflow: hidden; position: relative; }

        .actions-toolbar { display: flex; justify-content: space-around; align-items: center; padding: 0 5px; height: ${ACTION_TOOLBAR_HEIGHT}px; border-bottom: 1px solid #e0e0e0; flex-shrink: 0; background-color: #f8f9fa; }
        .action-icon-btn { background: transparent; border: none; color: #5f6368; cursor: pointer; padding: 6px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: background-color 0.2s ease, color 0.2s ease; }
        .action-icon-btn:hover { background-color: #e8eaed; color: #202124; }

        .translation-box { padding: 8px 10px; border-bottom: 1px solid #e0e0e0; display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; background-color: #f8f9fa; box-sizing: border-box; overflow-y: auto; height: 100%; flex-grow: 1; }
        .target-lang { width: 100%; padding: 4px 6px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 6px; flex-shrink: 0; }
        .translation-result-container { position: relative; flex-grow: 1; display: flex; }
        .translation-result { width: 100%; min-height: 80px; padding: 6px 28px 6px 6px; border: 1px solid #ccc; border-radius: 4px; resize: none; font-size: 12px; box-sizing: border-box; user-select: text; -webkit-user-select: text; flex-grow: 1; }
        .copy-translation-btn { position: absolute; right: 2px; top: 2px; border: none; background: transparent; color: #5f6368; cursor: pointer; padding: 3px; border-radius: 50%; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; }
        .copy-translation-btn:hover { background: #e0e0e0; }

        .custom-prompts-area { height: ${CUSTOM_PROMPT_AREA_HEIGHT}px; padding: ${PANEL_VERTICAL_PADDING}px 8px; display: flex; align-items: flex-start; flex-shrink: 0; box-sizing: border-box; }
        .buttons-container {
            display: flex;
            gap: 5px;
            overflow-x: auto;
            overflow-y: hidden;
            white-space: nowrap;
            align-items: center;
            width: 100%;
            height: 100%;
            padding-bottom: 5px;
            scrollbar-width: thin;
            scrollbar-color: #cccccc #f0f0f0;
        }
        .buttons-container::-webkit-scrollbar { height: 5px; }
        .buttons-container::-webkit-scrollbar-track { background: #f0f0f0; border-radius: 3px; }
        .buttons-container::-webkit-scrollbar-thumb { background: #cccccc; border-radius: 3px; }
        .buttons-container::-webkit-scrollbar-thumb:hover { background: #aaaaaa; }

        .action-btn { flex-shrink: 0; }
        .action-btn.custom-prompt-btn {
            padding: 2px 5px;
            font-size: 9px;
            min-width: 45px;
            height: ${CUSTOM_PROMPT_BUTTON_HEIGHT}px;
            max-height: ${CUSTOM_PROMPT_BUTTON_HEIGHT}px;
            border-radius: 4px;
            border-width: 1px;
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            line-height: 1;
        }
        .action-btn.custom-prompt-btn span {
            font-size: 8px;
            line-height: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 40px;
        }

        .add-new-prompt-inline-btn { background: #f0f0f0; border: 1px solid #ccc; color: #555; border-radius: 50%; width: 24px; height: 24px; padding: 0; margin-left: 4px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .add-new-prompt-inline-btn:hover { background: #e0e0e0; }
        .add-new-prompt-inline-btn .material-symbols-outlined { font-size: 18px; }

        .add-prompts-placeholder-btn { display: flex; flex-direction: row; align-items: center; justify-content: center; padding: 8px 10px; font-size: 11px; font-weight: 500; color: #1a73e8; background-color: #e8f0fe; border: 1px dashed #1a73e8; border-radius: 6px; cursor: pointer; transition: background-color 0.2s; width: 100%; height: 100%; box-sizing: border-box; }
        .add-prompts-placeholder-btn:hover { background-color: #d6e4ff; }
        .add-prompts-placeholder-btn .material-symbols-outlined { font-size: 16px; margin-right: 5px; }

        .floating-ui-resize-handle {
            position: absolute;
            bottom: 0;
            right: 0;
            width: 15px;
            height: 100%;
            cursor: e-resize;
            z-index: 100;
        }
      </style>
      <div class="main-panel">
        <div class="actions-toolbar" style="display: flex;">
          <button class="action-icon-btn search-btn" title="Cerca selezione su Google">
            <img src="${chrome.runtime.getURL('icons/img/search.png')}" alt="Search" class="custom-icon">
          </button>
          <button class="action-icon-btn copy-text-btn" title="Copia testo selezionato">
            <img src="${chrome.runtime.getURL('icons/img/content_copy.png')}" alt="Copy" class="custom-icon copy-icon-img" style="display: inline-block;">
            <span class="material-symbols-outlined copy-feedback-icon" style="display: none;">check_circle</span>
          </button>
          <button class="action-icon-btn translate-action-btn" title="Traduci testo selezionato">
            <img src="${chrome.runtime.getURL('icons/img/translate.png')}" alt="Translate" class="custom-icon">
          </button>
        </div>
        <div class="translation-box" style="display: none;">
          <select class="target-lang">
           ${['it', 'en', 'es', 'fr', 'de', 'pt', 'ru', 'zh', 'ja', 'ar', 'hi', 'nl', 'sv', 'pl', 'ko'].map(lang => { let dn = lang; try { dn = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang); dn = dn.charAt(0).toUpperCase() + dn.slice(1); } catch (e) {} return `<option value="${lang}">${dn}</option>`; }).join('')}
          </select>
          <div class="translation-result-container">
            <textarea class="translation-result" readonly placeholder="Translation result..."></textarea>
            <button class="copy-translation-btn" title="Copy translation">
                <img src="${chrome.runtime.getURL('icons/img/content_copy.png')}" alt="Copy translation" class="custom-icon copy-icon-img" style="display: inline-block;">
                <span class="material-symbols-outlined copy-feedback-icon" style="display: none;">check</span>
            </button>
          </div>
        </div>
        <div class="custom-prompts-area" style="display: flex;">
          ${customPromptsAreaHtml}
        </div>
        <div class="floating-ui-resize-handle"></div>
      </div>
    `;

    if (document.body) { document.body.appendChild(floatingUI); }
    else { console.error("Cannot add floating UI: document.body not found."); floatingUI = null; return; }

    const margin = 10;
    let targetX, targetY;
    let centerX = selectionRect.left + selectionRect.width / 2;
    targetX = centerX - savedWidth / 2;
    targetX = Math.max(window.scrollX + margin, Math.min(targetX, window.scrollX + window.innerWidth - savedWidth - margin));
    const spaceBelow = window.innerHeight - selectionRect.bottom - margin;
    const spaceAbove = selectionRect.top - margin;
    if (spaceBelow >= BASE_UI_HEIGHT || spaceBelow >= spaceAbove) {
        targetY = selectionRect.bottom + window.scrollY + margin;
    } else {
        targetY = selectionRect.top + window.scrollY - BASE_UI_HEIGHT - margin;
    }
    targetY = Math.max(window.scrollY + margin, Math.min(targetY, window.scrollY + window.innerHeight - BASE_UI_HEIGHT - margin));
    floatingUI.style.left = `${targetX}px`;
    floatingUI.style.top = `${targetY}px`;

    requestAnimationFrame(() => {
        floatingUI.style.transition = 'opacity 0.15s ease-in-out';
        floatingUI.style.opacity = '1';
    });

    const savedLang = await getPreferredLanguage();
    const langSelect = shadow.querySelector('.target-lang');
    if (langSelect) langSelect.value = savedLang;

    const copyTranslationBtn = shadow.querySelector('.copy-translation-btn');
    const translationResultArea = shadow.querySelector('.translation-result');
    if (copyTranslationBtn && translationResultArea) {
        copyTranslationBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await navigator.clipboard.writeText(translationResultArea.value);
                const imgIcon = copyTranslationBtn.querySelector('.copy-icon-img');
                const feedbackIcon = copyTranslationBtn.querySelector('.copy-feedback-icon');

                if (imgIcon && feedbackIcon) {
                    imgIcon.style.display = 'none';
                    feedbackIcon.style.display = 'inline-block';
                    setTimeout(() => {
                        imgIcon.style.display = 'inline-block';
                        feedbackIcon.style.display = 'none';
                    }, 1500);
                }
            } catch (err) { console.error('Failed to copy translation: ', err); }
        });
    }

    shadow.addEventListener('mousedown', (e) => {
        isUIInteraction = true;
        const buttonsContainer = shadow.querySelector('.buttons-container');
        if (buttonsContainer && buttonsContainer.contains(e.target)) {
        } else {
             e.stopPropagation();
        }
    });
    shadow.addEventListener('mouseup', (e) => {
        setTimeout(() => { isUIInteraction = false; }, 0);
        e.stopPropagation();
    });
    shadow.addEventListener('click', (e) => {
        const buttonsContainer = shadow.querySelector('.buttons-container');
        if (buttonsContainer && buttonsContainer.contains(e.target)) {
             return;
        }
        e.stopPropagation();
    });

    attachButtonListeners(shadow, initialUseCustomPrompts);

    const resizeHandle = shadow.querySelector('.floating-ui-resize-handle');
    let startXResizeHandle, initialWidthResizeHandle; // Rinominato per evitare conflitti
    let currentDragOverlayResizeHandle = null; // Rinominato

    const onFloatingUIMouseDown = (e) => {
        if (e.button !== 0) return;
        isResizingFloatingUI = true;
        startXResizeHandle = e.clientX; // Usa variabile rinominata
        initialWidthResizeHandle = floatingUI.offsetWidth; // Usa variabile rinominata

        currentDragOverlayResizeHandle = document.createElement('div'); // Usa variabile rinominata
        currentDragOverlayResizeHandle.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: transparent; cursor: e-resize; z-index: 2147483648;
            user-select: none; -webkit-user-select: none;
        `;
        document.body.appendChild(currentDragOverlayResizeHandle); // Usa variabile rinominata
        floatingUI.style.transition = 'none';
        currentDragOverlayResizeHandle.addEventListener('mousemove', onFloatingUIMouseMove); // Usa variabile rinominata
        currentDragOverlayResizeHandle.addEventListener('mouseup', onFloatingUIMouseUp); // Usa variabile rinominata
        currentDragOverlayResizeHandle.addEventListener('mouseleave', onFloatingUIMouseUp); // Usa variabile rinominata
        e.preventDefault();
        e.stopPropagation();
    };

    const onFloatingUIMouseMove = (e) => {
        if (!isResizingFloatingUI) return;
        const deltaX = e.clientX - startXResizeHandle; // Usa variabile rinominata
        let newWidth = initialWidthResizeHandle + deltaX; // Usa variabile rinominata
        newWidth = Math.max(MIN_FLOATING_UI_WIDTH, Math.min(newWidth, MAX_FLOATING_UI_WIDTH));
        floatingUI.style.width = `${newWidth}px`;
        const currentRect = floatingUI.getBoundingClientRect();
        const margin = 10;
        if (currentRect.right > window.innerWidth - margin) {
             const newLeft = window.scrollX + window.innerWidth - newWidth - margin;
             floatingUI.style.left = `${newLeft}px`;
        }
    };

    const onFloatingUIMouseUp = async (e) => {
        if (!isResizingFloatingUI) return;
        isResizingFloatingUI = false;

        if (currentDragOverlayResizeHandle && currentDragOverlayResizeHandle.parentNode) { // Usa variabile rinominata
            currentDragOverlayResizeHandle.removeEventListener('mousemove', onFloatingUIMouseMove); // Usa variabile rinominata
            currentDragOverlayResizeHandle.removeEventListener('mouseup', onFloatingUIMouseUp); // Usa variabile rinominata
            currentDragOverlayResizeHandle.removeEventListener('mouseleave', onFloatingUIMouseUp); // Usa variabile rinominata
            currentDragOverlayResizeHandle.parentNode.removeChild(currentDragOverlayResizeHandle); // Usa variabile rinominata
            currentDragOverlayResizeHandle = null; // Usa variabile rinominata
        }
        floatingUI.style.transition = 'opacity 0.15s ease-in-out, width 0.2s ease-out, height 0.2s ease-out';
        await setFloatingUIWidth(floatingUI.offsetWidth);
        setTimeout(() => { isUIInteraction = false; }, 0);
        e.stopPropagation();
    };

    if (resizeHandle) {
        resizeHandle.addEventListener('mousedown', onFloatingUIMouseDown);
    }
};

async function createChatbotSidebar() {
    const sidebarId = 'chatbot-sidebar';
    const tabId = 'sidebar-tab-container';
    const resizeHandleId = 'sidebar-resize-handle';
    const overlayId = 'sidebar-drag-overlay';

    if (window.sidebarController && document.getElementById(sidebarId)) {
         return window.sidebarController;
    }

    const initialWidthPx = await getSidebarWidth();
    const initialTop = await getSidebarTabTop();

    let tabContainer = document.getElementById(tabId);
    if (!tabContainer) {
        tabContainer = document.createElement('div'); tabContainer.id = tabId;
        if (document.body) document.body.appendChild(tabContainer); else { console.error("No body for tab"); return null;}
    }
    tabContainer.style.cssText = `position: fixed; top: ${initialTop}; right: 0; transform: translateY(-50%); width: ${NEW_TOTAL_TAB_WIDTH_PX}px; height: ${TAB_HEIGHT_PX}px; background-color: #1a73e8; border-radius: ${TAB_RADIUS_PX}px 0 0 ${TAB_RADIUS_PX}px; box-shadow: -3px 2px 8px rgba(0,0,0,0.18); cursor: grab; z-index: 2147483646; display: flex; align-items: center; justify-content: flex-start; padding-left: ${ARROW_PADDING_LEFT_PX}px; box-sizing: border-box; transition: right 0.35s cubic-bezier(0.4, 0, 0.2, 1); user-select: none; -webkit-user-select: none;`;
    tabContainer.innerHTML = `<svg id="sidebar-arrow" width="${ARROW_ICON_WIDTH_PX}" height="${ARROW_ICON_WIDTH_PX}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.3s ease; flex-shrink: 0; pointer-events: none;"><polyline points="15 18 9 12 15 6"></polyline></svg>`;

    let sidebarContainer = document.getElementById(sidebarId);
    if(!sidebarContainer) {
        sidebarContainer = document.createElement('div'); sidebarContainer.id = sidebarId;
        if (document.body) document.body.appendChild(sidebarContainer); else { console.error("No body for sidebar"); return null;}
    }
    sidebarContainer.style.cssText = `position: fixed; top: 0; right: -${initialWidthPx}px; width: ${initialWidthPx}px; height: 100vh; background-color: #f7f7f7; box-shadow: -6px 0 18px rgba(0,0,0,0.15); z-index: 2147483647; transition: right 0.35s cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column; overflow: hidden;`;

    if (!sidebarContainer.querySelector(`#sidebar-iframe`)) {
         sidebarContainer.innerHTML = `<div id="${resizeHandleId}" style="position: absolute; left: -${HANDLE_OFFSET_PX}px; top: 0; bottom: 0; width: ${HANDLE_WIDTH_PX}px; cursor: col-resize; z-index: 10; background-color: transparent;"></div> <div style="height: 100%; width: 100%; flex-grow: 1; display: flex; position: relative; z-index: 1;"> <iframe id="sidebar-iframe" src="${chrome.runtime.getURL('sidebar/index.html')}" style="flex-grow: 1; border: none; display: block;"></iframe> </div>`;
    }

    if (document.body && !document.body.style.transition.includes('margin-right')) {
        if (document.body.style.transition) {
             document.body.style.transition += ', margin-right 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
        } else {
             document.body.style.transition = 'margin-right 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
        }
    }

    let sidebarOpen = (sidebarContainer.style.right === '0px' || sidebarContainer.style.right === '0');
    let currentSidebarWidth = parseFloat(sidebarContainer.style.width) || initialWidthPx;

    if (sidebarOpen) {
        tabContainer.style.right = `${currentSidebarWidth}px`;
        if (document.body) document.body.style.marginRight = `${currentSidebarWidth}px`;
        const arrowSvg = tabContainer.querySelector('#sidebar-arrow');
        if (arrowSvg) arrowSvg.style.transform = 'rotate(180deg)';
    }

    function toggleSidebar() {
        sidebarOpen = !sidebarOpen;
        const arrowSvg = tabContainer.querySelector('#sidebar-arrow');
        const widthCss = `${currentSidebarWidth}px`;

        const originalBodyTransition = document.body.style.transition;
        document.body.style.transition = 'none';
        sidebarContainer.style.transition = 'none';
        tabContainer.style.transition = 'none';

        if (sidebarOpen) {
            sidebarContainer.style.right = '0';
            tabContainer.style.right = widthCss;
            if (document.body) document.body.style.marginRight = widthCss;
            if (arrowSvg) arrowSvg.style.transform = 'rotate(180deg)';
        } else {
            sidebarContainer.style.right = `-${widthCss}`;
            tabContainer.style.right = '0';
            if (document.body) document.body.style.marginRight = '0';
            if (arrowSvg) arrowSvg.style.transform = 'rotate(0deg)';
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.body.style.transition = originalBodyTransition || 'margin-right 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
                sidebarContainer.style.transition = 'right 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
                tabContainer.style.transition = 'right 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
            });
        });
    }

    let isDraggingTab = false, startYTab = 0, initialTopPercentTab = parseFloat(initialTop), wasTabDragged = false;
    if (tabContainer._onTabMouseDown) tabContainer.removeEventListener('mousedown', tabContainer._onTabMouseDown);
    const onTabMouseDown = (e) => {
        if (e.button !== 0) return;
        isDraggingTab = true;
        wasTabDragged = false;
        startYTab = e.clientY;
        initialTopPercentTab = parseFloat(tabContainer.style.top) || parseFloat(initialTop);
        tabContainer.style.cursor = 'grabbing';
        document.addEventListener('mousemove', onTabMouseMove);
        document.addEventListener('mouseup', onTabMouseUp);
        e.preventDefault();
    };
    tabContainer._onTabMouseDown = onTabMouseDown;
    tabContainer.addEventListener('mousedown', onTabMouseDown);

    const onTabMouseMove = (e) => {
        if (!isDraggingTab) return;
        wasTabDragged = true;
        const deltaY = e.clientY - startYTab;
        let newTopPx = (initialTopPercentTab / 100 * window.innerHeight) + deltaY;
        const tabHeightPx = TAB_HEIGHT_PX;
        const minTopPx = tabHeightPx / 2;
        const maxTopPx = window.innerHeight - (tabHeightPx / 2);
        newTopPx = Math.max(minTopPx, newTopPx);
        newTopPx = Math.min(maxTopPx, newTopPx);
        const newTopPercent = (newTopPx / window.innerHeight) * 100;
        tabContainer.style.top = `${newTopPercent}%`;
    };

    const onTabMouseUp = async () => {
        if (!isDraggingTab) return;
        isDraggingTab = false;
        tabContainer.style.cursor = 'grab';
        document.removeEventListener('mousemove', onTabMouseMove);
        document.removeEventListener('mouseup', onTabMouseUp);
        if (!wasTabDragged) {
             toggleSidebar();
        } else {
            await setSidebarTabTop(tabContainer.style.top);
        }
    };

    const resizeHandle = sidebarContainer.querySelector(`#${resizeHandleId}`);
    const sidebarIframe = sidebarContainer.querySelector('#sidebar-iframe');
    let dragOverlay = null, isResizing = false, startXResize = 0, initialWidthResize = 0;
    if (resizeHandle && resizeHandle._onResizeMouseDown) resizeHandle.removeEventListener('mousedown', resizeHandle._onResizeMouseDown);

    const onResizeMouseDown = (e) => {
        if (e.button !== 0) return;
        isResizing = true;
        startXResize = e.clientX;
        initialWidthResize = sidebarContainer.offsetWidth;
        dragOverlay = document.createElement('div');
        dragOverlay.id = overlayId;
        dragOverlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: transparent; cursor: col-resize; z-index: 2147483648;
            user-select: none; -webkit-user-select: none;
        `;
        if (document.body) document.body.appendChild(dragOverlay);
        if (sidebarIframe) sidebarIframe.style.pointerEvents = 'none';
        sidebarContainer.style.transition = 'none';
        tabContainer.style.transition = 'none';
        if (document.body) document.body.style.transition = 'none';
        dragOverlay.addEventListener('mousemove', onResizeMouseMove);
        dragOverlay.addEventListener('mouseup', onResizeMouseUp);
        dragOverlay.addEventListener('mouseleave', onResizeMouseUp);
        e.preventDefault();
    };
    if (resizeHandle) {
        resizeHandle._onResizeMouseDown = onResizeMouseDown;
        resizeHandle.addEventListener('mousedown', onResizeMouseDown);
    }

    const onResizeMouseMove = (e) => {
        if (!isResizing) return;
        const deltaX = e.clientX - startXResize;
        let newWidth = initialWidthResize - deltaX;
        const maxAllowedWidth = window.innerWidth * (MAX_SIDEBAR_WIDTH_PERCENT / 100);
        newWidth = Math.max(MIN_SIDEBAR_WIDTH_PX, Math.min(newWidth, maxAllowedWidth));
        sidebarContainer.style.width = `${newWidth}px`;
        currentSidebarWidth = newWidth;
        if (sidebarOpen) {
            tabContainer.style.right = `${newWidth}px`;
            if (document.body) document.body.style.marginRight = `${newWidth}px`;
        }
    };

    const onResizeMouseUp = async () => {
        if (!isResizing) return;
        isResizing = false;
        if (dragOverlay && dragOverlay.parentNode) {
            dragOverlay.removeEventListener('mousemove', onResizeMouseMove);
            dragOverlay.removeEventListener('mouseup', onResizeMouseUp);
            dragOverlay.removeEventListener('mouseleave', onResizeMouseUp);
            dragOverlay.parentNode.removeChild(dragOverlay);
            dragOverlay = null;
        }
        if (sidebarIframe) sidebarIframe.style.pointerEvents = 'auto';
        sidebarContainer.style.transition = 'right 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
        tabContainer.style.transition = 'right 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
        if (document.body) {
             const currentBodyTransition = document.body.style.transition;
             if (!currentBodyTransition.includes('margin-right')) {
                 document.body.style.transition += ', margin-right 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
             }
             if (currentBodyTransition === 'none') {
                 document.body.style.transition = 'margin-right 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
             }
        }
        await setSidebarWidth(currentSidebarWidth);
    };

    window.sidebarController = { toggle: toggleSidebar, isOpen: () => sidebarOpen, open: () => { if (!sidebarOpen) toggleSidebar(); }, close: () => { if (sidebarOpen) toggleSidebar(); } };
    return window.sidebarController;
}

async function translateText(text, targetLang) {
    const sourceLang = 'auto';
    try {
        const response = await fetch( `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}` );
        if (!response.ok) throw new Error(`MyMemory API error: ${response.status}`);
        const data = await response.json();
        if (data.responseStatus === 200 && data.responseData?.translatedText?.trim()) {
            return data.responseData.translatedText.replace(/<br\s*\/?>/gi, '\n');
        }
        const googleResponse = await fetch( `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}` );
        if (!googleResponse.ok) throw new Error(`Google Translate API error: ${googleResponse.status}`);
        const googleData = await googleResponse.json();
        if (googleData?.[0]?.[0]?.[0]?.trim()) {
            return googleData[0].map(item => item[0]).join('');
        }
        throw new Error("Translation failed from both services.");
    } catch (error) {
        console.error('[translateText] Error:', error);
        return `Error: ${error.message || 'Translation service unavailable'}`;
    }
}

document.addEventListener('mousedown', (e) => {
    const path = e.composedPath();
    const isClickOnFloatingUI = floatingUI && path.some(el => el === floatingUI);
    const isClickOnSidebarRelated = path.some(el => el && (el.id === 'sidebar-tab-container' || el.id === 'chatbot-sidebar' || el.id === 'sidebar-resize-handle' || el.id === 'sidebar-drag-overlay'));

    if (isClickOnFloatingUI || isClickOnSidebarRelated || isUIInteraction || isResizingFloatingUI) {
        if (e.target.id === 'sidebar-tab-container' || e.target.id === 'sidebar-resize-handle') {
             return;
        }
        e.stopPropagation();
        return;
    }
    if (floatingUI && document.body.contains(floatingUI)) {
        document.body.removeChild(floatingUI);
        floatingUI = null;
        currentSelection = '';
    }
});

document.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') {
        if (floatingUI && document.body.contains(floatingUI)) {
            document.body.removeChild(floatingUI);
            floatingUI = null;
        }
        currentSelection = '';
    }
});

document.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    setTimeout(() => {
        if (isUIInteraction || isResizingFloatingUI || e.target.tagName === 'IMG') return;
        const path = e.composedPath();
        const isMouseUpOnSidebarRelated = path.some(el => el && (el.id === 'sidebar-tab-container' || el.id === 'chatbot-sidebar' || el.id === 'sidebar-resize-handle' || el.id === 'sidebar-drag-overlay'));
        if (isMouseUpOnSidebarRelated) {
            return;
        }
        handleSelection(e);
    }, 50);
});

function openChatbot() {
    if (!window.sidebarController || !document.getElementById('chatbot-sidebar')) {
        initializeSidebar().then(() => {
            if (window.sidebarController && !window.sidebarController.isOpen()) {
                 window.sidebarController.toggle();
            }
        }).catch(err => console.error("Error during fallback initializeSidebar:", err));
    } else {
        if (!window.sidebarController.isOpen()) {
            window.sidebarController.toggle();
        }
    }
}

function sendToSidebar(command, data) {
    const iframe = document.getElementById('sidebar-iframe');
    if (iframe?.contentWindow) {
        try {
            iframe.contentWindow.postMessage({ type: command, payload: data }, chrome.runtime.getURL('sidebar/index.html').substring(0, chrome.runtime.getURL('').length -1) );
        } catch (error) { console.error("Error sending postMessage to sidebar:", error); }
    } else {
        console.warn("Sidebar iframe not ready. Retrying message...");
        setTimeout(() => {
            const iframeRetry = document.getElementById('sidebar-iframe');
            if (iframeRetry?.contentWindow) {
                try { iframeRetry.contentWindow.postMessage({ type: command, payload: data }, chrome.runtime.getURL('sidebar/index.html').substring(0, chrome.runtime.getURL('').length -1)); }
                catch (error) { console.error("Error sending postMessage (retry):", error); }
            } else console.error("Sidebar iframe still not ready after retry. Message lost:", command, data);
        }, 500);
    }
}

if (chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes[STORAGE_KEY_CUSTOM_PROMPTS]) {
            if (floatingUI && document.body.contains(floatingUI)) {
                updateFloatingUIButtons(changes[STORAGE_KEY_CUSTOM_PROMPTS].newValue);
            }
        }
    });
} else {
    console.warn("chrome.storage.onChanged API not available.");
}

async function initializeSidebar() {
    if (!window.sidebarController || !document.getElementById('chatbot-sidebar')) {
        try {
            await createChatbotSidebar();
        } catch (error) {
            console.error("Error during createChatbotSidebar in initializeSidebar:", error);
        }
    }
}

function detectStandardRSSFeeds() {
    const feedLinks = Array.from(document.querySelectorAll(
        'link[rel="alternate"][type="application/rss+xml"], link[rel="alternate"][type="application/atom+xml"]'
    ));
    return feedLinks.map(link => {
        let title = link.title || document.title || 'Untitled Feed';
        let url = link.href;
        try {
            url = new URL(url, document.baseURI || document.URL).href;
        } catch (e) {
            console.warn('Content.js: Invalid feed URL, cannot resolve:', link.href, e);
            return null;
        }
        return { title, url };
    }).filter(feed => feed && feed.url);
}

function reportFeedStatusToBackground() {
    const detectedStandardFeeds = detectStandardRSSFeeds();
    try {
        chrome.runtime.sendMessage({
            command: "pageFeedsStatusUpdate",
            detectedFeeds: detectedStandardFeeds
        }, response => {
            if (chrome.runtime.lastError) {
                // console.warn("Content.js: Error sending pageFeedsStatusUpdate:", chrome.runtime.lastError.message);
            }
        });
    } catch (e) {
        // console.warn("Content.js: Failed to send message to background. Extension context might be invalidated.", e);
    }
}

if (document.readyState === "complete" || document.readyState === "interactive") {
    reportFeedStatusToBackground();
} else {
    document.addEventListener("DOMContentLoaded", reportFeedStatusToBackground);
}

const observerCallback = (mutationsList, observer) => {
    for(const mutation of mutationsList) {
        if (mutation.type === 'childList') {
            if (mutation.target === document.head || (mutation.target === document.body && mutation.addedNodes.length > 0)) {
                reportFeedStatusToBackground();
                break;
            }
        }
    }
};
const observer = new MutationObserver(observerCallback);
observer.observe(document.documentElement, { childList: true, subtree: true });


if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSidebar);
} else {
    initializeSidebar();
}

// console.log("Floating UI content script loaded (with RSS detection for badge).");