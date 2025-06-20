// File: script.js (Sintassi compat, per funzionare con i file -compat.js)

// --- Color Helper Functions ---
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
function getContrastYIQ(hexcolor){
    if (!hexcolor) return '#333';
    hexcolor = hexcolor.replace("#", "");
    if (hexcolor.length !== 6) return '#333';
    try {
        const r = parseInt(hexcolor.substr(0,2),16);
        const g = parseInt(hexcolor.substr(2,2),16);
        const b = parseInt(hexcolor.substr(4,2),16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return '#333';
        const yiq = ((r*299)+(g*587)+(b*114))/1000;
        return (yiq >= 128) ? '#333' : '#fff';
    } catch (e) {
        console.error("Error in getContrastYIQ for color:", hexcolor, e);
        return '#333';
    }
}
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') { unsafe = String(unsafe || ''); }
    if (!unsafe) return '';
    return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/'/g, "'");
}

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyB733UNF8wJYRszdIw4H3XoS7Bmn7yvLig",
    authDomain: "genio-f9386.firebaseapp.com",
    projectId: "genio-f9386",
    storageBucket: "genio-f9386.firebasestorage.app",
    messagingSenderId: "759357192037",
    appId: "1:759357192037:web:b0004722e8f1d4c9e5138c",
    measurementId: "G-B18GK4VB1G"
};

// --- Firebase Initialization ---
let app;
let db;
let auth;
try {
    if (!firebase.apps.length) {
        app = firebase.initializeApp(firebaseConfig);
    } else {
        app = firebase.app();
    }
    db = firebase.firestore();
    auth = firebase.auth();
    console.log("Firebase (App, Firestore, Auth) initialized successfully in sidebar.");
} catch (error) {
    console.error("CRITICAL: Error initializing Firebase in sidebar:", error);
    document.addEventListener('DOMContentLoaded', () => {
        const body = document.querySelector('body');
        if(body) body.innerHTML = '<p style="color:red; padding:20px; text-align:center; font-size:1.2em;">Critical Error: Could not connect to essential services. Please check your connection or contact support.</p>';
    });
}

// --- Constants ---
const COST_PER_MESSAGE = 1;
const STORAGE_KEY_CUSTOM_PROMPTS = 'userCustomPrompts';

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

// --- Global Variables ---
let currentUser = null;
let userCoinsListener = null;
let currentCoinBalance = 0;
let customPromptsListener = null;

// --- Authentication Management ---
if (auth) {
    auth.onAuthStateChanged(user => {
        if (!user) {
            console.log("Sidebar: No user logged in. Showing login wall.");
            // Pulisci i listener se l'utente fa logout
            if (userCoinsListener) { userCoinsListener(); userCoinsListener = null; }
            if (customPromptsListener) { customPromptsListener(); customPromptsListener = null; }
            
            currentUser = null;
            currentCoinBalance = 0;
            
            // Mostra il muro di login e nascondi la chat
            if(mainChatContainer) mainChatContainer.style.display = 'none';
            if(loginWall) loginWall.style.display = 'flex';

            clearCustomPrompts();
            clearCustomPromptsFromStorage();

        } else {
            console.log("Sidebar: User logged in:", user.uid);
            currentUser = user;

            // Mostra la chat e nascondi il muro di login
            if(mainChatContainer) mainChatContainer.style.display = 'flex';
            if(loginWall) loginWall.style.display = 'none';

            // Rimuovi eventuali listener precedenti prima di crearne di nuovi
            if (userCoinsListener) userCoinsListener();
            if (customPromptsListener) customPromptsListener();
            
            // Avvia le funzioni per l'utente loggato
            loadChatHistory();
            listenToCoinBalance();
            loadCustomPrompts();
        }
    });
} else {
     console.error("Firebase Authentication service is not available. Chat functionality disabled.");
     document.addEventListener('DOMContentLoaded', () => {
         const body = document.querySelector('body');
         if(body) body.innerHTML = '<p style="color:red; padding:20px; text-align:center;">Error: Authentication service unavailable. Cannot load chat.</p>';
         setSendButtonState(false);
     });
}

// --- Chat Functions ---
function loadChatHistory() {
    if (!currentUser || !db) {
        console.warn("loadChatHistory called without user or db.");
        if (messagesContainer) {
            messagesContainer.innerHTML = '<div class="message incoming">Please log in to see the chat history.</div>';
        }
        return;
    }
    if (messagesContainer) {
        messagesContainer.innerHTML = '<div class="message incoming">Loading messages...</div>';
    } else {
        console.error("messagesContainer not found in loadChatHistory");
        return;
    }
    db.collection('chats')
        .where('userId', '==', currentUser.uid)
        .orderBy('createTime', 'asc')
        .onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
            if (snapshot.metadata.hasPendingWrites) {
                console.log("Local snapshot ignored (pending writes)");
                return;
            }
            if (!messagesContainer) {
                 console.error("messagesContainer not found during snapshot update");
                 return;
            }
            messagesContainer.innerHTML = '';
            let hasMessages = false;
            const pendingDocs = [];

            snapshot.forEach(doc => {
                hasMessages = true;
                const data = doc.data();

                if (data.prompt) {
                    createMessageElement(escapeHtml(data.prompt), 'outgoing', false);
                }

                if (data.response) {
                    try {
                        const dirtyHtml = (typeof marked !== 'undefined') ? marked.parse(data.response) : escapeHtml(data.response);
                        const sanitizedHtml = dirtyHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
                        createMessageElement(sanitizedHtml, 'incoming', true);
                    } catch (parseError) {
                        console.error("Error parsing Markdown or escaping response:", parseError);
                        createMessageElement(escapeHtml(data.response), 'incoming', false);
                    }
                } else if (data.prompt && !data.response && !data.chargeFailedReason) {
                     pendingDocs.push(doc.id);
                } else if (data.chargeFailedReason === 'insufficient_funds') {
                    createMessageElement("<i>Sending failed: Insufficient coin balance at the time of request.</i>", 'incoming', true);
                } else if (data.chargeFailedReason) {
                     createMessageElement("<i>Error processing the request. Please try again later.</i>", 'incoming', true);
                }
            });

            pendingDocs.forEach(() => {
                const loadingDiv = document.createElement('div');
                loadingDiv.className = 'message incoming loading';
                loadingDiv.innerHTML = `<div class="loading-dots"><span></span><span></span><span></span></div>`;
                messagesContainer.appendChild(loadingDiv);
            });

            if (!hasMessages && !pendingDocs.length) {
                 messagesContainer.innerHTML = '<div class="message incoming">Start chatting by typing a message below!</div>';
            }

            scrollToBottom();
        }, (error) => {
            console.error("Error listening to chat history:", error);
             if (messagesContainer) {
                messagesContainer.innerHTML = '<div class="message incoming error">Error loading chat history. Please refresh or try again later.</div>';
             }
        });
}

function createMessageElement(content, type, isHtml = false) {
    if (!messagesContainer) {
        console.error("messagesContainer not found in createMessageElement");
        return;
    }
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    if (isHtml) {
        messageDiv.innerHTML = content;
    } else {
        messageDiv.textContent = content;
    }
    messagesContainer.appendChild(messageDiv);
}

function scrollToBottom() {
    setTimeout(() => {
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }, 50);
}

function listenToCoinBalance() {
    if (!currentUser || !db) {
        console.warn("listenToCoinBalance called without user or db.");
        setSendButtonState(false);
        return;
    }
    const userRef = db.collection('users').doc(currentUser.uid);

    if (userCoinsListener) {
        console.log("[Balance Listener] Removing previous listener.");
        userCoinsListener();
    }

    console.log(`[Balance Listener] Starting listener for user ${currentUser.uid}`);
    userCoinsListener = userRef.onSnapshot((doc) => {
        if (doc.exists) {
            const userData = doc.data();
            currentCoinBalance = userData.coins || 0;
            console.log("[Balance Listener] Balance updated:", currentCoinBalance);
            setSendButtonState(currentUser && currentCoinBalance >= COST_PER_MESSAGE);
        } else {
            console.warn("[Balance Listener] User document not found:", currentUser.uid);
            currentCoinBalance = 0;
            setSendButtonState(false);
        }
    }, (error) => {
        console.error("[Balance Listener] Error listening to coin balance:", error);
        currentCoinBalance = 0;
        setSendButtonState(false);
        userCoinsListener = null;
    });
}

function setSendButtonState(enabled) {
    if (sendBtn && userInput) {
        const isLoggedIn = !!currentUser;
        const canAfford = currentCoinBalance >= COST_PER_MESSAGE;
        const shouldBeEnabled = enabled && isLoggedIn && canAfford;

        sendBtn.disabled = !shouldBeEnabled;
        userInput.disabled = !shouldBeEnabled;
        userInput.readOnly = !shouldBeEnabled;

        if (shouldBeEnabled) {
            userInput.placeholder = "Write a message...";
            sendBtn.style.opacity = '1';
            sendBtn.style.cursor = 'pointer';
            userInput.style.backgroundColor = '';
        } else {
            if (!isLoggedIn) {
                userInput.placeholder = "Please log in to chat";
            } else if (!canAfford) {
                userInput.placeholder = `Insufficient coins (need ${COST_PER_MESSAGE})`;
            } else {
                userInput.placeholder = "Processing...";
            }
            sendBtn.style.opacity = '0.6';
            sendBtn.style.cursor = 'not-allowed';
            userInput.style.backgroundColor = '#f0f0f0';
        }
    } else {
         console.warn("setSendButtonState: Send button or user input textarea not found.");
    }
}

async function sendMessage() {
    if (!currentUser) {
        console.error("Attempted to send message without logged-in user.");
        alert("You must be logged in to send messages.");
        return;
    }
     if (currentCoinBalance < COST_PER_MESSAGE) {
        console.warn("Attempted to send message with insufficient balance.");
        alert(`You do not have enough coins to send a message. You need ${COST_PER_MESSAGE}.`);
        return;
    }

    const message = userInput.value.trim();
    if (!message) {
        console.log("Empty message, send cancelled.");
        return;
    }

    const wasEnabled = !userInput.disabled;
    setSendButtonState(false);
    const originalPlaceholder = userInput.placeholder;
    userInput.placeholder = "Sending...";

    try {
        console.log(`Sending message: "${message}" from user ${currentUser.uid}`);
        await db.collection('chats').add({
            prompt: message,
            userId: currentUser.uid,
            createTime: firebase.firestore.FieldValue.serverTimestamp()
        });

        userInput.value = '';
        console.log("Message added to Firestore successfully. Waiting for response.");
        userInput.placeholder = originalPlaceholder;

        resetTextareaHeight();
        setSendButtonState(currentCoinBalance >= COST_PER_MESSAGE);

    } catch (error) {
        console.error('Error sending message to Firestore:', error);
        alert("An error occurred while sending your message. Please try again.");
        userInput.placeholder = originalPlaceholder;
         if (wasEnabled) {
            setSendButtonState(true);
            listenToCoinBalance();
         }
    }
}

window.addEventListener('message', receiveContentScriptMessage);
function receiveContentScriptMessage(event) {
    const receivedEventData = event.data;
    if (!receivedEventData || !receivedEventData.payload) return;
    
    if (receivedEventData.type === 'PREFILL_CHAT') {
        let textToPrefill = (typeof receivedEventData.payload.text === 'string') ? receivedEventData.payload.text : '';
        if (!userInput) {
            console.error("Sidebar: User input (textarea) element not found for prefill!");
            return;
        }
        try {
            let currentValue = userInput.value;
            let newValue = (!currentValue || currentValue.trim() === '') ? textToPrefill : currentValue + ' ' + textToPrefill;
            userInput.value = newValue;
            if (newValue.trim()) {
                userInput.focus();
                adjustTextareaHeight();
                userInput.scrollTop = userInput.scrollHeight;
                userInput.selectionStart = userInput.selectionEnd = userInput.value.length;
            } else {
                 resetTextareaHeight();
            }
        } catch (error) {
            console.error("Sidebar: Error occurred during append logic or UI update:", error);
        }
    } else if (receivedEventData.type === 'NAVIGATE_TO') {
        const page = receivedEventData.payload.page;
        if (page && typeof page === 'string') {
            console.log(`Sidebar: Navigating to ${page}`);
            window.location.href = page;
        }
    }
}

async function saveCustomPromptsToStorage(prompts) {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.error("chrome.storage.local API is not available.");
        return;
    }
    try {
        await chrome.storage.local.set({ [STORAGE_KEY_CUSTOM_PROMPTS]: prompts });
        console.log(`Saved ${prompts.length} custom prompts to local storage under key '${STORAGE_KEY_CUSTOM_PROMPTS}'.`);
    } catch (error) {
        console.error("Error saving custom prompts to local storage:", error);
    }
}

async function clearCustomPromptsFromStorage() {
    if (!chrome || !chrome.storage || !chrome.storage.local) {
        console.error("chrome.storage.local API is not available.");
        return;
    }
    try {
        await chrome.storage.local.remove(STORAGE_KEY_CUSTOM_PROMPTS);
        console.log(`Cleared custom prompts from local storage (key: '${STORAGE_KEY_CUSTOM_PROMPTS}').`);
    } catch (error) {
        console.error("Error clearing custom prompts from local storage:", error);
    }
}

function loadCustomPrompts() {
    if (!currentUser || !db || !customPromptsContainer) {
        console.warn("loadCustomPrompts called without user, db, or container.");
        clearCustomPrompts();
        clearCustomPromptsFromStorage();
        return;
    }
    console.log("Loading custom prompts for user:", currentUser.uid);

    if (customPromptsListener) {
        console.log("Detaching previous custom prompts listener.");
        customPromptsListener();
    }

    const promptsRef = db.collection('users').doc(currentUser.uid).collection('customPrompts')
                           .orderBy('order', 'asc');

    customPromptsListener = promptsRef.onSnapshot(snapshot => {
        console.log("Custom prompts snapshot received. Size:", snapshot.size);
        clearCustomPrompts();
        const promptsForStorage = [];

        if (snapshot.empty) {
            console.log("No custom prompts found for this user.");
        } else {
            snapshot.forEach(doc => {
                const promptData = doc.data();
                createPromptButton(promptData);
                promptsForStorage.push({
                    id: doc.id,
                    title: promptData.title || 'Untitled Prompt',
                    prompt: promptData.prompt || '',
                    iconName: promptData.iconName || null,
                    color: promptData.color || null
                });
            });
        }

        saveCustomPromptsToStorage(promptsForStorage);

        if (addNewPromptBtnInline && customPromptsContainer) {
             if (!customPromptsContainer.contains(addNewPromptBtnInline)) {
                 customPromptsContainer.appendChild(addNewPromptBtnInline);
             }
        }

    }, error => {
        console.error("Error loading custom prompts:", error);
        clearCustomPrompts();
        clearCustomPromptsFromStorage();
         if (addNewPromptBtnInline && customPromptsContainer) {
             if (!customPromptsContainer.contains(addNewPromptBtnInline)) {
                 customPromptsContainer.appendChild(addNewPromptBtnInline);
             }
         }
    });
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

    const vibrantColor = data.color;
    const defaultVibrant = '#1a73e8';
    const defaultLight = '#e8f0fe';
    let finalVibrant = defaultVibrant;
    let finalLight = defaultLight;
    let hoverBgColor = '#d6e4ff';
    let hoverBorderColor = '#1557b0';
    let hoverTextColor = '#1557b0';

    if (vibrantColor && vibrantColor.match(/^#[0-9A-F]{6}$/i) && vibrantColor !== '#ffffff' && vibrantColor !== '#000000') {
        try {
            const lightBg = lightenHexColor(vibrantColor, 0.80);
            if (lightBg) {
                finalVibrant = vibrantColor;
                finalLight = lightBg;
                hoverBgColor = darkenHexColor(finalLight, 0.1);
                hoverBorderColor = darkenHexColor(finalVibrant, 0.15);
                hoverTextColor = hoverBorderColor;
            } else {
                 console.warn("Could not lighten color:", vibrantColor, "Falling back to default prompt button colors.");
            }
        } catch (e) {
            console.error("Error processing dynamic colors for prompt:", data.title, e);
        }
    }

    button.style.color = finalVibrant;
    button.style.borderColor = finalVibrant;
    button.style.backgroundColor = finalLight;

    button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = hoverBgColor;
        button.style.borderColor = hoverBorderColor;
        button.style.color = hoverTextColor;
    });
    button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = finalLight;
        button.style.borderColor = finalVibrant;
        button.style.color = finalVibrant;
    });

    if (addNewPromptBtnInline) {
        customPromptsContainer.insertBefore(button, addNewPromptBtnInline);
    } else {
        customPromptsContainer.appendChild(button);
    }
}

function clearCustomPrompts() {
    if (!customPromptsContainer) return;
    const buttons = customPromptsContainer.querySelectorAll('.prompt-button');
    buttons.forEach(btn => {
        btn.remove();
    });
    console.log("Cleared existing custom prompt buttons from UI.");
}

let initialTextareaHeight = 0;
let maxTextareaHeight = 0;
function setupTextareaResize() {
    if (!userInput) {
        console.error("Textarea element not found for resize setup.");
        return;
    }
    setTimeout(() => {
        if (userInput.clientHeight > 0) {
             initialTextareaHeight = userInput.clientHeight;
             maxTextareaHeight = initialTextareaHeight * 5;
             console.log(`Textarea resize initialized. Initial: ${initialTextareaHeight}px, Max: ${maxTextareaHeight}px`);
        } else {
            console.warn("Could not determine initial textarea height accurately, using fallback values.");
            initialTextareaHeight = 20;
            maxTextareaHeight = 120;
        }
    }, 150);
    userInput.addEventListener('input', adjustTextareaHeight);
}
function adjustTextareaHeight() {
    if (!userInput || initialTextareaHeight === 0) return;
    userInput.style.height = 'auto';
    let scrollHeight = userInput.scrollHeight;
    if (scrollHeight > maxTextareaHeight) {
        userInput.style.height = maxTextareaHeight + 'px';
        userInput.style.overflowY = 'auto';
    } else {
        userInput.style.height = scrollHeight + 'px';
        userInput.style.overflowY = 'hidden';
    }
}
function resetTextareaHeight() {
     if (!userInput || initialTextareaHeight === 0) return;
     userInput.style.height = 'auto';
     userInput.style.height = initialTextareaHeight + 'px';
     userInput.style.overflowY = 'hidden';
     console.log("Textarea height reset to initial.");
}

// --- Event Listeners ---
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
if (accountButton) {
    accountButton.addEventListener('click', () => {
        window.location.href = 'coins.html';
    });
}
if (managePromptsButton) {
    managePromptsButton.addEventListener('click', () => {
        window.location.href = 'manage_prompts.html';
    });
}
if (addNewPromptBtnInline) {
    addNewPromptBtnInline.addEventListener('click', () => {
        window.location.href = 'manage_prompts.html';
    });
}
if (customPromptsContainer) {
    customPromptsContainer.addEventListener('click', (event) => {
        const button = event.target.closest('.prompt-button');
        if (button) {
            const promptText = button.getAttribute('data-prompt');
            if (userInput && promptText) {
                const currentValue = userInput.value.trim();
                userInput.value = (currentValue === '') ? promptText : currentValue + ' ' + promptText;
                userInput.focus();
                console.log(`Prompt "${promptText}" appended to textarea.`);
                adjustTextareaHeight();
                userInput.scrollLeft = userInput.scrollWidth;
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed.");
    setSendButtonState(false);
    clearCustomPrompts();
    clearCustomPromptsFromStorage();
    if (customPromptsContainer && addNewPromptBtnInline) {
        if (!customPromptsContainer.contains(addNewPromptBtnInline)) {
             customPromptsContainer.appendChild(addNewPromptBtnInline);
        }
    }
    setupTextareaResize();
    if (typeof marked === 'undefined') {
        console.warn("'marked' library not found. Markdown rendering for responses will be disabled.");
    }
});