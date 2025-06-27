// File: src/sidebar/script.js (Refactored for Smarter Chat Loader)

// --- Color Helper Functions ---
import { marked } from 'marked';

function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}
function rgbToHex(r, g, b) {
    r = Math.max(0, Math.min(255, Math.round(r)));
    g = Math.max(0, Math.min(255, Math.round(g)));
    b = Math.max(0, Math.min(255, Math.round(b)));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}
function lightenHexColor(hex, percent) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const newR = rgb.r + (255 - rgb.r) * percent;
    const newG = rgb.g + (255 - rgb.g) * percent;
    const newB = rgb.b + (255 - rgb.b) * percent;
    return rgbToHex(newR, newG, newB);
}
function darkenHexColor(hex, percent) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const newR = rgb.r * (1 - percent);
    const newG = rgb.g * (1 - percent);
    const newB = rgb.b * (1 - percent);
    return rgbToHex(newR, newG, newB);
}
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') { unsafe = String(unsafe || ''); }
    if (!unsafe) return '';
    return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/'/g, "'");
}

// --- Constants ---
const COST_PER_MESSAGE = 1;

// --- DOM Elements ---
const mainChatContainer = document.getElementById('main-chat-container');
const loginWall = document.getElementById('login-wall');
const loginWallButton = document.getElementById('login-wall-button');
const messagesContainer = document.getElementById('messages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const accountButton = document.getElementById('accountButton');
const managePromptsButton = document.getElementById('managePromptsButton');
const customPromptsContainer = document.getElementById('customPromptsContainer');
const addNewPromptBtnInline = document.getElementById('addNewPromptBtnInline');

// --- Global State ---
let currentUser = null;
let currentCoinBalance = 0;

// --- UI & State Management ---
function updateUIForAuthState(isLoggedIn, userData) {
    if (isLoggedIn && userData) {
        currentUser = userData;
        currentCoinBalance = userData.coins || 0;
        mainChatContainer.style.display = 'flex';
        loginWall.style.display = 'none';
        setSendButtonState(true);
        // Richiedi la cronologia della chat, il listener onMessage la gestirà
        chrome.runtime.sendMessage({ command: 'getSidebarInitialData' });
    } else {
        currentUser = null;
        currentCoinBalance = 0;
        mainChatContainer.style.display = 'none';
        loginWall.style.display = 'flex';
        clearCustomPrompts();
        if (messagesContainer) messagesContainer.innerHTML = '';
    }
}

function setSendButtonState(enabled) {
    if (!sendBtn || !userInput) return;

    const canAfford = currentCoinBalance >= COST_PER_MESSAGE;
    const shouldBeEnabled = enabled && !!currentUser && canAfford;

    sendBtn.disabled = !shouldBeEnabled;
    userInput.disabled = !shouldBeEnabled;
    userInput.readOnly = !shouldBeEnabled;

    if (shouldBeEnabled) {
        userInput.placeholder = "Write a message...";
        sendBtn.style.opacity = '1';
        sendBtn.style.cursor = 'pointer';
        userInput.style.backgroundColor = '';
    } else {
        userInput.placeholder = !currentUser ? "Please log in to chat" : (canAfford ? "Processing..." : `Insufficient coins (need ${COST_PER_MESSAGE})`);
        sendBtn.style.opacity = '0.6';
        sendBtn.style.cursor = 'not-allowed';
        userInput.style.backgroundColor = '#f0f0f0';
    }
}

// --- Chat Functions ---
function createMessageElement(content, type, isHtml = false, id = null) {
    if (!messagesContainer) return;

    const existingLoader = messagesContainer.querySelector('.loading');
    if (existingLoader) {
        existingLoader.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    if (id) {
        messageDiv.id = id;
    }
    if (isHtml) {
        messageDiv.innerHTML = content;
    } else {
        messageDiv.textContent = content;
    }
    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
    return messageDiv;
}

function showLoadingIndicator() {
    if (messagesContainer.querySelector('.loading')) return;
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message incoming loading';
    loadingDiv.innerHTML = `<div class="loading-dots"><span></span><span></span><span></span></div>`;
    messagesContainer.appendChild(loadingDiv);
    scrollToBottom();
}

function scrollToBottom() {
    setTimeout(() => {
        if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }, 50);
}

function sendMessage() {
    if (!currentUser) {
        alert("You must be logged in to send messages.");
        return;
    }
    if (currentCoinBalance < COST_PER_MESSAGE) {
        alert(`You do not have enough coins to send a message. You need ${COST_PER_MESSAGE}.`);
        return;
    }

    const messageText = userInput.value.trim();
    if (!messageText) return;

    // Aggiornamento ottimistico della UI
    createMessageElement(escapeHtml(messageText), 'outgoing');
    showLoadingIndicator();

    const originalPlaceholder = userInput.placeholder;
    userInput.value = '';
    resetTextareaHeight();
    setSendButtonState(false);
    userInput.placeholder = "Processing...";

    // Invia il messaggio al background
    chrome.runtime.sendMessage({
        command: 'sendChatMessage',
        payload: { prompt: messageText }
    }, (response) => {
        userInput.placeholder = originalPlaceholder;
        setSendButtonState(true);
        
        if (!response || !response.success) {
            console.error('Error sending message:', response?.error);
            alert("An error occurred while sending your message. Please try again.");
            
            const messages = messagesContainer.querySelectorAll('.message');
            if(messages.length > 0) messages[messages.length - 1].remove();
            if(messages.length > 1) messages[messages.length - 2].remove();
        }
    });
}

// --- Custom Prompts Functions ---
function loadCustomPrompts(prompts) {
    clearCustomPrompts();
    if (prompts && prompts.length > 0) {
        prompts.forEach(createPromptButton);
    }
    if (addNewPromptBtnInline && customPromptsContainer && !customPromptsContainer.contains(addNewPromptBtnInline)) {
        customPromptsContainer.appendChild(addNewPromptBtnInline);
    }
}

function createPromptButton(data) {
    if (!customPromptsContainer) return;

    const button = document.createElement('button');
    button.className = 'prompt-button';
    button.setAttribute('data-prompt', data.prompt || '');
    button.title = data.prompt || data.title || 'Click to use prompt';

    const iconHtml = data.iconName ? `<span class="material-symbols-outlined">${escapeHtml(data.iconName)}</span>` : '';
    const textHtml = `<span>${escapeHtml(data.title || 'Untitled Prompt')}</span>`;
    button.innerHTML = iconHtml + textHtml;

    const vibrantColor = data.color || '#1a73e8';
    const lightBg = lightenHexColor(vibrantColor, 0.80) || '#e8f0fe';
    const hoverBgColor = darkenHexColor(lightBg, 0.1);
    const hoverBorderColor = darkenHexColor(vibrantColor, 0.15);
    const hoverTextColor = hoverBorderColor;

    button.style.color = vibrantColor;
    button.style.borderColor = vibrantColor;
    button.style.backgroundColor = lightBg;

    button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = hoverBgColor;
        button.style.borderColor = hoverBorderColor;
        button.style.color = hoverTextColor;
    });
    button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = lightBg;
        button.style.borderColor = vibrantColor;
        button.style.color = vibrantColor;
    });

    if (addNewPromptBtnInline) {
        customPromptsContainer.insertBefore(button, addNewPromptBtnInline);
    } else {
        customPromptsContainer.appendChild(button);
    }
}

function clearCustomPrompts() {
    if (!customPromptsContainer) return;
    customPromptsContainer.querySelectorAll('.prompt-button').forEach(btn => btn.remove());
}

// --- Textarea Resize ---
let initialTextareaHeight = 0;
let maxTextareaHeight = 0;
function setupTextareaResize() {
    if (!userInput) return;
    setTimeout(() => {
        initialTextareaHeight = userInput.clientHeight || 20;
        maxTextareaHeight = initialTextareaHeight * 5;
    }, 150);
    userInput.addEventListener('input', adjustTextareaHeight);
}
function adjustTextareaHeight() {
    if (!userInput || initialTextareaHeight === 0) return;
    userInput.style.height = 'auto';
    let scrollHeight = userInput.scrollHeight;
    userInput.style.height = (scrollHeight > maxTextareaHeight ? maxTextareaHeight : scrollHeight) + 'px';
    userInput.style.overflowY = scrollHeight > maxTextareaHeight ? 'auto' : 'hidden';
}
function resetTextareaHeight() {
     if (!userInput || initialTextareaHeight === 0) return;
     userInput.style.height = initialTextareaHeight + 'px';
     userInput.style.overflowY = 'hidden';
}

// --- Event Listeners Setup ---
function setupEventListeners() {
    if (loginWallButton) {
        loginWallButton.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') });
        });
    }

    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (userInput) {
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !userInput.disabled) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    if (accountButton) accountButton.addEventListener('click', () => { window.location.href = 'coins.html'; });
    if (managePromptsButton) managePromptsButton.addEventListener('click', () => { window.location.href = 'manage_prompts.html'; });
    if (addNewPromptBtnInline) addNewPromptBtnInline.addEventListener('click', () => { window.location.href = 'manage_prompts.html'; });

    if (customPromptsContainer) {
        customPromptsContainer.addEventListener('click', (event) => {
            const button = event.target.closest('.prompt-button');
            if (button) {
                const promptText = button.getAttribute('data-prompt');
                if (userInput && promptText) {
                    const currentValue = userInput.value.trim();
                    userInput.value = (currentValue === '') ? promptText : currentValue + ' ' + promptText;
                    userInput.focus();
                    adjustTextareaHeight();
                    userInput.scrollLeft = userInput.scrollWidth;
                }
            }
        });
    }

    window.addEventListener('message', (event) => {
        const { type, payload } = event.data;
        if (type === 'PREFILL_CHAT' && payload && typeof payload.text === 'string') {
            if (userInput) {
                userInput.value = (userInput.value.trim() === '') ? payload.text : `${userInput.value.trim()} ${payload.text}`;
                userInput.focus();
                adjustTextareaHeight();
            }
        } else if (type === 'NAVIGATE_TO' && payload && typeof payload.page === 'string') {
            window.location.href = payload.page;
        }
    });

    // ===============================================
    // --- MODIFICA CHIAVE: Listener onMessage() ---
    // ===============================================
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const { command, payload } = message;
        switch (command) {
            case 'chatHistoryUpdate':
                if (messagesContainer) {
                    messagesContainer.innerHTML = ''; // Pulisci e ridisegna tutto

                    if (payload.history.length === 0) {
                        createMessageElement("Start chatting by typing a message below!", 'incoming');
                    } else {
                        payload.history.forEach(msg => {
                            if (msg.prompt) createMessageElement(escapeHtml(msg.prompt), 'outgoing');
                            if (msg.response) {
                                const sanitizedHtml = (typeof marked !== 'undefined') ? marked.parse(msg.response) : escapeHtml(msg.response);
                                createMessageElement(sanitizedHtml, 'incoming', true);
                            } else if (msg.chargeFailedReason) {
                                createMessageElement("<i>Error processing the request. Please try again later.</i>", 'incoming', true);
                            }
                        });
                    }
                    
                    // --- NUOVA LOGICA PER IL LOADER ---
                    // Controlla se l'ultimo messaggio è in attesa di una risposta.
                    const lastMessage = payload.history[payload.history.length - 1];
                    const isWaitingForResponse = lastMessage && lastMessage.prompt && !lastMessage.response && !lastMessage.chargeFailedReason;
                    
                    if (isWaitingForResponse) {
                        showLoadingIndicator();
                        setSendButtonState(false); // Mantieni disabilitato mentre si attende
                        userInput.placeholder = "Genio is thinking...";
                    } else {
                        setSendButtonState(true); // Riabilita l'input se non si sta aspettando
                        userInput.placeholder = "Write a message...";
                    }

                    scrollToBottom();
                }
                break;
            case 'userDataUpdated':
                if (payload.user) {
                    const wasNotLoggedIn = !currentUser;
                    currentUser = payload.user;
                    currentCoinBalance = payload.user.coins || 0;
                    if(wasNotLoggedIn){
                         updateUIForAuthState(true, currentUser);
                    } else {
                        setSendButtonState(true);
                    }
                } else {
                    updateUIForAuthState(false, null);
                }
                break;
        }
        return true;
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");
    setSendButtonState(false);
    setupEventListeners();
    setupTextareaResize();

    chrome.runtime.sendMessage({ command: 'getSidebarInitialData' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("SIDEBAR ERRORE DI CONNESSIONE:", chrome.runtime.lastError.message);
            document.body.innerHTML = '<p style="color:red; padding:20px; text-align:center;">Error: Connection to background service failed. Please reload the extension.</p>';
            return;
        }
        
        if (response && response.success) {
            const { isLoggedIn, user, prompts } = response.data;
            updateUIForAuthState(isLoggedIn, user);
            if (isLoggedIn) {
                loadCustomPrompts(prompts);
            }
        } else {
            console.error("SIDEBAR ERRORE LOGICO:", response?.error);
            document.body.innerHTML = '<p style="color:red; padding:20px; text-align:center;">Error: Failed to load initial data from background.</p>';
        }
    });
});