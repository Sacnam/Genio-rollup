// File: sidebar/manage_prompts.js (Refactored for Manifest V3 - Message Passing)

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
    if (promptList && !isSortableInitialized && !promptList.querySelector('li')) {
         promptList.innerHTML = '<li class="loading-placeholder">Loading prompts...</li>';
    }
    // Richiedi i prompt al background
    chrome.runtime.sendMessage({ command: 'getCustomPrompts' }, (response) => {
        if (response && response.success) {
            renderPromptList(response.prompts);
        } else {
            console.error("Error loading prompts:", response.error);
            if (promptList) promptList.innerHTML = `<li>Error loading prompts: ${response.error.message}</li>`;
        }
    });
}

function renderPromptList(prompts) {
    if (!promptList) return;
    const currentScroll = promptList.scrollTop;
    promptList.innerHTML = '';

    if (!prompts || prompts.length === 0) {
        promptList.innerHTML = '<li>No custom prompts yet. Click "Add New Prompt" to create one!</li>';
        if (sortableInstance) {
            try { sortableInstance.destroy(); } catch(e) { console.warn("Error destroying sortable instance:", e); }
            sortableInstance = null;
            isSortableInitialized = false;
        }
    } else {
        prompts.forEach(prompt => renderPromptItem(prompt.id, prompt));
        if (!isSortableInitialized) {
            initializeDragAndDrop();
        }
    }
    promptList.scrollTop = currentScroll;
}

function renderPromptItem(id, data) {
    if (!promptList) return;

    const li = document.createElement('li');
    li.setAttribute('data-id', id);

    let iconHtml = '<span class="prompt-list-icon-placeholder"></span>';
    if (data.iconName && AVAILABLE_ICONS_PNG.includes(data.iconName)) {
        iconHtml = `<img src="${chrome.runtime.getURL(`icons/img/${data.iconName}.png`)}" alt="${escapeHtml(data.iconName)}" class="custom-list-icon">`;
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
    if (typeof Sortable === 'undefined' || isSortableInitialized || !promptList || promptList.children.length === 0) return;
    try {
        sortableInstance = new Sortable(promptList, {
            handle: '.drag-handle',
            animation: 150,
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            onEnd: (evt) => { if (evt.oldIndex !== evt.newIndex) updatePromptOrder(); },
        });
        isSortableInitialized = true;
    } catch (error) {
        console.error("Error during Sortable initialization:", error);
        isSortableInitialized = false;
    }
}

function updatePromptOrder() {
    if (!promptList) return;
    const orderedIds = Array.from(promptList.querySelectorAll('li[data-id]')).map(item => item.getAttribute('data-id'));
    if (orderedIds.length === 0) return;

    if (sortableInstance) sortableInstance.option("disabled", true);

    chrome.runtime.sendMessage({ command: 'updatePromptOrder', payload: { orderedIds } }, (response) => {
        if (!response.success) {
            alert("Error saving the new prompt order. Please check console for details.");
            // Potresti voler ricaricare la lista per ripristinare l'ordine precedente
            loadPrompts();
        }
        if (sortableInstance) sortableInstance.option("disabled", false);
    });
}

function populateIconPicker() {
    if (!iconPicker) return;
    iconPicker.innerHTML = AVAILABLE_ICONS_PNG.map(iconName => `
        <div class="icon-picker-item" data-icon-name="${iconName}" title="${iconName}">
            <img src="${chrome.runtime.getURL(`icons/img/${iconName}.png`)}" alt="${iconName}" class="custom-picker-icon">
        </div>
    `).join('');
}

function handleIconSelection(iconName) {
    if (!selectedIconNameInput || !iconPicker) return;
    const previouslySelected = iconPicker.querySelector('.icon-picker-item.selected');
    if (previouslySelected) previouslySelected.classList.remove('selected');

    if (selectedIconNameInput.value === iconName) {
        selectedIconNameInput.value = '';
    } else {
        selectedIconNameInput.value = iconName;
        const currentItem = iconPicker.querySelector(`.icon-picker-item[data-icon-name="${iconName}"]`);
        if (currentItem) currentItem.classList.add('selected');
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
    if (currentSelectedIcon) currentSelectedIcon.classList.remove('selected');
    if (promptData.iconName) {
        const iconToSelect = iconPicker.querySelector(`.icon-picker-item[data-icon-name="${promptData.iconName}"]`);
        if (iconToSelect) iconToSelect.classList.add('selected');
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
    if (!promptForm || !iconPicker) return;
    promptForm.style.display = 'none';
    iconPicker.style.display = 'none';
    if(promptList) promptList.style.display = '';
    if(addPromptBtn) addPromptBtn.style.display = '';
    promptForm.reset();
    promptIdInput.value = '';
    selectedIconNameInput.value = '';
    const currentSelectedIcon = iconPicker.querySelector('.icon-picker-item.selected');
    if (currentSelectedIcon) currentSelectedIcon.classList.remove('selected');
}

function savePrompt(event) {
    event.preventDefault();
    if (!promptTitleInput || !promptTextInput || !selectedIconNameInput || !promptColorInput || !promptIdInput || !formTitle || !savePromptBtn || !cancelPromptBtn) return;

    const id = promptIdInput.value;
    const title = promptTitleInput.value.trim();
    const promptText = promptTextInput.value.trim();
    const iconName = selectedIconNameInput.value.trim();
    const color = promptColorInput.value;

    if (!title || !promptText) {
        if (!title) promptTitleInput.style.borderColor = 'red';
        if (!promptText) promptTextInput.style.borderColor = 'red';
        const originalFormTitle = formTitle.textContent;
        formTitle.textContent = "Please fill required fields"; formTitle.style.color = 'red';
        setTimeout(() => { formTitle.textContent = originalFormTitle; formTitle.style.color = ''; }, 3000);
        return;
    }

    const promptData = { title, prompt: promptText, iconName: iconName || null, color };
    if (id) promptData.id = id;

    savePromptBtn.disabled = true; cancelPromptBtn.disabled = true;

    chrome.runtime.sendMessage({ command: 'savePrompt', payload: promptData }, (response) => {
        if (response.success) {
            hideForm();
        } else {
            alert(`Error saving prompt: ${response.error.message}. Please try again.`);
            formTitle.textContent = "Error saving!"; formTitle.style.color = 'red';
        }
        savePromptBtn.disabled = false; cancelPromptBtn.disabled = false;
    });
}

function deletePrompt(id) {
    if (!id) return;
    chrome.runtime.sendMessage({ command: 'deletePrompt', payload: { id } }, (response) => {
        if (!response.success) {
            alert(`Error deleting prompt: ${response.error.message}. Please try again.`);
        }
    });
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') { unsafe = String(unsafe || ''); }
    if (!unsafe) return '';
    return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "").replace(/'/g, "'");
}

function setupEventListeners() {
    if (backButton) backButton.addEventListener('click', () => { window.location.href = 'index.html'; });
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
                chrome.runtime.sendMessage({ command: 'getPromptDetails', payload: { id: promptId } }, (response) => {
                    if (response.success) {
                        showForm('edit', response.prompt, promptId);
                    } else {
                        alert(`Error retrieving prompt details: ${response.error.message}.`);
                    }
                });
            } else if (event.target.closest('.delete-btn')) {
                deletePrompt(promptId);
            }
        });
    }

    if (iconPicker) {
        iconPicker.addEventListener('click', (event) => {
            const selectedItem = event.target.closest('.icon-picker-item');
            if (selectedItem) handleIconSelection(selectedItem.getAttribute('data-icon-name'));
        });
    }
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    setupEventListeners();
    populateIconPicker();

    // Listener per aggiornamenti in tempo reale dal background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.command === 'promptsUpdated') {
            renderPromptList(message.payload.prompts);
        }
        return true; // Mantiene il canale aperto per altri listener
    });

    // Carica i prompt iniziali
    loadPrompts();
});