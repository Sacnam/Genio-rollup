// File: sidebar/manage_prompts.js (Sintassi compat)

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
let app, db, auth;
try {
    if (!firebase.apps.length) { app = firebase.initializeApp(firebaseConfig); }
    else { app = firebase.app(); }
    db = firebase.firestore();
    auth = firebase.auth();
    console.log("Firebase initialized in manage_prompts.js");
} catch (error) {
    console.error("Error initializing Firebase in manage_prompts.js:", error);
    document.addEventListener('DOMContentLoaded', () => {
         const container = document.querySelector('.manage-container');
         if (container) {
            container.innerHTML = '<p style="color:red; padding: 20px; text-align: center;">Critical error initializing services. Cannot load prompt management.</p>';
         }
     });
}

// --- DOM Elements ---
let backButton, promptList, addPromptBtn, promptForm, formTitle, promptIdInput,
    promptTitleInput, promptTextInput, selectedIconNameInput, promptColorInput,
    savePromptBtn, cancelPromptBtn, iconPicker;

function initializeDOMElements() {
    backButton = document.getElementById('backButton');
    promptList = document.getElementById('promptList');
    addPromptBtn = document.getElementById('addPromptBtn');
    promptForm = document.getElementById('promptForm');
    formTitle = document.getElementById('formTitle');
    promptIdInput = document.getElementById('promptId');
    promptTitleInput = document.getElementById('promptTitle');
    promptTextInput = document.getElementById('promptText');
    selectedIconNameInput = document.getElementById('selectedIconName');
    promptColorInput = document.getElementById('promptColor');
    savePromptBtn = document.getElementById('savePromptBtn');
    cancelPromptBtn = document.getElementById('cancelPromptBtn');
    iconPicker = document.getElementById('iconPicker');
}

// --- Global Variables ---
let currentUser = null;
let promptsListener = null;
let sortableInstance = null;
let isSortableInitialized = false;

const AVAILABLE_ICONS_PNG = [
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

// --- Functions ---
function loadPrompts() {
    if (!currentUser || !db) {
        console.warn("loadPrompts called without user or db.");
        if (promptList) promptList.innerHTML = '<li>Login required to load prompts.</li>';
        return;
    }
    if (promptList && !isSortableInitialized && !promptList.querySelector('li')) {
         promptList.innerHTML = '<li class="loading-placeholder">Loading prompts...</li>';
    }

    const promptsRef = db.collection('users').doc(currentUser.uid).collection('customPrompts')
                         .orderBy('order', 'asc');

    if (promptsListener) {
        try { promptsListener(); } catch(e) { console.warn("Error detaching previous prompts listener:", e); }
    }

    promptsListener = promptsRef.onSnapshot(snapshot => {
        if (!promptList) return;
        const currentScroll = promptList.scrollTop;
        promptList.innerHTML = '';

        if (snapshot.empty) {
            promptList.innerHTML = '<li>No custom prompts yet. Click "Add New Prompt" to create one!</li>';
             if (sortableInstance) {
                 try { sortableInstance.destroy(); } catch(e) { console.warn("Error destroying sortable instance on empty list:", e); }
                 sortableInstance = null;
                 isSortableInitialized = false;
             }
        } else {
            snapshot.docs.forEach(doc => {
                renderPromptItem(doc.id, doc.data());
            });
            if (!isSortableInitialized && snapshot.docs.length > 0) {
                initializeDragAndDrop();
            } else if (isSortableInitialized && snapshot.docs.length === 0 && sortableInstance) {
                try { sortableInstance.destroy(); } catch(e) { console.warn("Error destroying sortable instance when list became empty:", e); }
                sortableInstance = null;
                isSortableInitialized = false;
            }
        }
        promptList.scrollTop = currentScroll;
    }, error => {
        console.error("Error loading prompts:", error);
        if (promptList) promptList.innerHTML = `<li>Error loading prompts: ${error.message}</li>`;
        if (sortableInstance) {
            try { sortableInstance.destroy(); } catch(e) { console.warn("Error destroying sortable instance on error:", e); }
            sortableInstance = null;
            isSortableInitialized = false;
        }
    });
}

function renderPromptItem(id, data) {
    if (!promptList) return;

    const li = document.createElement('li');
    li.setAttribute('data-id', id);

    let iconHtml = '<span class="prompt-list-icon-placeholder"></span>';
    if (data.iconName && AVAILABLE_ICONS_PNG.includes(data.iconName)) {
        iconHtml = `<img src="${chrome.runtime.getURL(`icons/img/${data.iconName}.png`)}" alt="${escapeHtml(data.iconName)}" class="custom-list-icon">`;
    } else if (data.iconName) {
        console.warn(`Icon name "${data.iconName}" for prompt "${data.title}" is not in AVAILABLE_ICONS_PNG or is invalid. Using placeholder.`);
    }

    li.innerHTML = `
        <span class="drag-handle" title="Drag to reorder">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
        </span>
        ${iconHtml}
        <div class="prompt-info">
            <div class="prompt-title">${escapeHtml(data.title || 'No Title')}</div>
            <div class="prompt-text-preview">${escapeHtml(data.prompt ? (data.prompt.length > 80 ? data.prompt.substring(0, 80) + '...' : data.prompt) : 'No Text')}</div>
        </div>
        <div class="prompt-actions">
            <button class="edit-btn" title="Edit"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button>
            <button class="delete-btn" title="Delete"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>
        </div>
    `;
    if (data.color && data.color.match(/^#[0-9A-F]{6}$/i) && data.color !== '#ffffff' && data.color !== '#000000') {
        li.style.borderLeft = `5px solid ${data.color}`;
    } else {
        li.style.borderLeft = `5px solid transparent`;
    }
    promptList.appendChild(li);
}

function initializeDragAndDrop() {
    if (typeof Sortable === 'undefined') {
        console.error("Cannot initialize Sortable: Sortable library not loaded.");
        return;
    }

    if (isSortableInitialized || !promptList || promptList.children.length === 0) {
        return;
    }

    try {
        sortableInstance = new Sortable(promptList, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            onEnd: function (evt) {
                if (evt.oldIndex !== evt.newIndex) {
                    updatePromptOrder();
                }
            },
        });
        isSortableInitialized = true;
    } catch (error) {
        console.error("Error during Sortable initialization:", error);
        isSortableInitialized = false;
    }
}

async function updatePromptOrder() {
    if (!currentUser || !db || !promptList) return;

    const items = promptList.querySelectorAll('li[data-id]');
    if (items.length === 0) return;

    if (sortableInstance) {
        try { sortableInstance.option("disabled", true); } catch (e) { console.warn("Failed to disable sortable instance", e); }
    }

    const batch = db.batch();
    let updatesCount = 0;
    items.forEach((item, index) => {
        const docId = item.getAttribute('data-id');
        if (docId) {
            try {
                const docRef = db.collection('users').doc(currentUser.uid).collection('customPrompts').doc(docId);
                batch.update(docRef, { order: index });
                updatesCount++;
            } catch(e) {
                console.error(`Error creating reference or adding update for docId ${docId}`, e);
            }
        }
    });

    if (updatesCount === 0) {
         if (sortableInstance) {
             try { sortableInstance.option("disabled", false); } catch (e) { console.warn("Failed to re-enable sortable instance", e); }
         }
         return;
    }

    try {
        await batch.commit();
    } catch (error) {
        console.error("Error committing batch:", error);
        alert("Error saving the new prompt order. Please check console for details.");
    } finally {
        if (sortableInstance) {
             try { sortableInstance.option("disabled", false); } catch (e) { console.warn("Failed to re-enable sortable instance", e); }
        }
    }
}

function populateIconPicker() {
    if (!iconPicker || !selectedIconNameInput) return;
    iconPicker.innerHTML = '';

    AVAILABLE_ICONS_PNG.forEach(iconName => {
        const item = document.createElement('div');
        item.classList.add('icon-picker-item');
        item.setAttribute('data-icon-name', iconName);
        item.title = iconName;

        const img = document.createElement('img');
        img.src = chrome.runtime.getURL(`icons/img/${iconName}.png`);
        img.alt = iconName;
        img.classList.add('custom-picker-icon');

        item.appendChild(img);
        iconPicker.appendChild(item);
    });
}

function handleIconSelection(iconName) {
    if (!selectedIconNameInput || !iconPicker) return;

    const previouslySelected = iconPicker.querySelector('.icon-picker-item.selected');
    if (previouslySelected) {
        previouslySelected.classList.remove('selected');
    }

    if (selectedIconNameInput.value === iconName) {
        selectedIconNameInput.value = '';
    } else {
        selectedIconNameInput.value = iconName;
        const currentItem = iconPicker.querySelector(`.icon-picker-item[data-icon-name="${iconName}"]`);
        if (currentItem) {
            currentItem.classList.add('selected');
        }
    }
}

function showForm(mode = 'add', promptData = {}, id = null) {
    if (!promptForm || !promptIdInput || !promptTitleInput || !promptTextInput || !selectedIconNameInput || !promptColorInput || !formTitle || !iconPicker) return;
    
    promptIdInput.value = id || '';
    promptTitleInput.value = promptData.title || '';
    promptTextInput.value = promptData.prompt || '';
    selectedIconNameInput.value = promptData.iconName || '';
    promptColorInput.value = promptData.color || '#000000';

    const currentSelectedIcon = iconPicker.querySelector('.icon-picker-item.selected');
    if (currentSelectedIcon) {
        currentSelectedIcon.classList.remove('selected');
    }
    if (promptData.iconName) {
        const iconToSelect = iconPicker.querySelector(`.icon-picker-item[data-icon-name="${promptData.iconName}"]`);
        if (iconToSelect) {
            iconToSelect.classList.add('selected');
        }
    }

    promptTitleInput.style.borderColor = '';
    promptTextInput.style.borderColor = '';
    formTitle.textContent = (mode === 'edit') ? 'Edit Prompt' : 'Add New Prompt';
    formTitle.style.color = '';

    promptForm.style.display = 'block';
    iconPicker.style.display = 'grid';
    if(promptList) promptList.style.display = 'none';
    if(addPromptBtn) addPromptBtn.style.display = 'none';
    promptTitleInput.focus();
}

function hideForm() {
    if (!promptForm || !iconPicker || !selectedIconNameInput) return;
    promptForm.style.display = 'none';
    iconPicker.style.display = 'none';
    if(promptList) promptList.style.display = '';
    if(addPromptBtn) addPromptBtn.style.display = '';
    promptForm.reset();
    promptIdInput.value = '';
    selectedIconNameInput.value = '';

    const currentSelectedIcon = iconPicker.querySelector('.icon-picker-item.selected');
    if (currentSelectedIcon) {
        currentSelectedIcon.classList.remove('selected');
    }
}

async function savePrompt(event) {
    event.preventDefault();
    if (!currentUser || !db) { alert("User not logged in or database not available. Cannot save prompt."); return; }
    if (!promptTitleInput || !promptTextInput || !selectedIconNameInput || !promptColorInput || !promptIdInput || !formTitle || !savePromptBtn || !cancelPromptBtn) {
        alert("Error: Form elements are missing. Cannot save."); return;
    }

    const id = promptIdInput.value;
    const title = promptTitleInput.value.trim();
    const promptText = promptTextInput.value.trim();
    const iconName = selectedIconNameInput.value.trim();
    const color = promptColorInput.value;

    let isValid = true;
    if (!title) { promptTitleInput.style.borderColor = 'red'; isValid = false; }
    else { promptTitleInput.style.borderColor = ''; }
    if (!promptText) { promptTextInput.style.borderColor = 'red'; isValid = false; }
    else { promptTextInput.style.borderColor = ''; }

    if (!isValid) {
        const originalFormTitle = formTitle.textContent;
        formTitle.textContent = "Please fill required fields"; formTitle.style.color = 'red';
        setTimeout(() => { formTitle.textContent = originalFormTitle; formTitle.style.color = ''; }, 3000);
        return;
    }

    const promptData = {
        title: title, prompt: promptText, iconName: iconName || null, color: color,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    };

    savePromptBtn.disabled = true; cancelPromptBtn.disabled = true;
    try {
        const collectionRef = db.collection('users').doc(currentUser.uid).collection('customPrompts');
        if (id) { await collectionRef.doc(id).update(promptData); }
        else {
            const snapshot = await collectionRef.orderBy('order', 'desc').limit(1).get();
            let nextOrder = 0;
            if (!snapshot.empty) {
                const lastOrder = snapshot.docs[0].data().order;
                if (typeof lastOrder === 'number' && !isNaN(lastOrder)) nextOrder = lastOrder + 1;
            }
            promptData.order = nextOrder;
            await collectionRef.add(promptData);
        }
        hideForm();
    } catch (error) {
        alert(`Error saving prompt: ${error.message}. Please try again.`);
        formTitle.textContent = "Error saving!"; formTitle.style.color = 'red';
    } finally {
         savePromptBtn.disabled = false; cancelPromptBtn.disabled = false;
    }
}

async function deletePrompt(id) {
    if (!currentUser || !db || !id) { alert("Cannot delete prompt: User not logged in, database unavailable, or ID missing."); return; }
    try { await db.collection('users').doc(currentUser.uid).collection('customPrompts').doc(id).delete(); }
    catch (error) { alert(`Error deleting prompt: ${error.message}. Please try again.`); }
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') { unsafe = String(unsafe || ''); }
    if (!unsafe) return '';
    return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "").replace(/'/g, "'");
}

function setupEventListeners() {
    if (backButton) backButton.addEventListener('click', () => { if (window.location) window.location.href = 'index.html'; });
    if (addPromptBtn) addPromptBtn.addEventListener('click', () => showForm('add'));
    if (promptForm) promptForm.addEventListener('submit', savePrompt);
    if (cancelPromptBtn) cancelPromptBtn.addEventListener('click', hideForm);

    if (promptList) {
        promptList.addEventListener('click', (event) => {
            const listItem = event.target.closest('li[data-id]');
            if (!listItem) return;
            const promptId = listItem.getAttribute('data-id');
            if (!promptId) return;
            if (event.target.closest('.edit-btn')) {
                if (!currentUser || !db) { alert("Cannot edit: User or DB not available."); return; }
                db.collection('users').doc(currentUser.uid).collection('customPrompts').doc(promptId).get()
                    .then(doc => { if (doc.exists) showForm('edit', doc.data(), promptId); else alert("Could not find the prompt to edit."); })
                    .catch(error => alert(`Error retrieving prompt details: ${error.message}.`));
            } else if (event.target.closest('.delete-btn')) deletePrompt(promptId);
        });
    }

    if (iconPicker) {
        iconPicker.addEventListener('click', (event) => {
            const selectedItem = event.target.closest('.icon-picker-item');
            if (selectedItem) {
                const iconName = selectedItem.getAttribute('data-icon-name');
                handleIconSelection(iconName);
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    setupEventListeners();
    if (auth) {
        auth.onAuthStateChanged(user => {
            if (user) {
                currentUser = user;
                loadPrompts();
            } else {
                currentUser = null;
                if (window.location && window.location.pathname && !window.location.pathname.endsWith('login.html')) {
                    window.location.href = 'login.html';
                }
            }
        });
    }
    populateIconPicker();
});