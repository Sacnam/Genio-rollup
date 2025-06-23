// File: sidebar/coins.js (Refactored for Manifest V3 - Message Passing)

// --- DOM Elements ---
let coinsBalanceElement;
let backButton;
let logoutButton;
let purchaseButtons = [];
let paymentMessageElement;

// --- Funzioni Principali ---
function initializeUI(userData) {
    if (userData && userData.coins !== undefined) {
        coinsBalanceElement.textContent = userData.coins;
    } else {
        coinsBalanceElement.textContent = '0';
    }
    setLoadingOnAllButtons(false);
}

function startCheckout(event) {
    const purchaseButton = event.currentTarget;
    const priceId = purchaseButton.getAttribute('data-price-id');
    if (!priceId) {
        setMessage("Error: Missing product ID.", true);
        return;
    }

    setLoading(purchaseButton, true);
    setMessage("Creating payment session...");

    chrome.runtime.sendMessage({ command: 'startStripeCheckout', payload: { priceId } }, (response) => {
        if (response && response.success) {
            setMessage("Waiting for Stripe...");
            // Il background gestirà l'apertura della nuova scheda e il monitoraggio.
            // Qui possiamo solo attendere e resettare l'UI dopo un po'.
            setTimeout(() => {
                if (paymentMessageElement && paymentMessageElement.textContent === "Waiting for Stripe...") {
                    clearMessage();
                }
                setLoading(purchaseButton, false);
            }, 8000);
        } else {
            const errorMsg = response ? response.error.message : "Unknown error";
            console.error("Error starting checkout:", errorMsg);
            setMessage(`Error: ${errorMsg}`, true);
            setLoading(purchaseButton, false);
        }
    });
}

function handleLogout() {
    if (logoutButton) logoutButton.disabled = true;
    chrome.runtime.sendMessage({ command: 'logout' }, (response) => {
        if (response.success) {
            // Il background gestirà il cambio di stato, che causerà un aggiornamento dell'UI
            // o un reindirizzamento se necessario.
            window.location.href = 'index.html'; // Reindirizza alla pagina principale della sidebar
        } else {
            alert('Error during logout. Please try again.');
            if (logoutButton) logoutButton.disabled = false;
        }
    });
}

// --- Funzioni Helper ---
function setMessage(message, isError = false) {
    if (!paymentMessageElement) return;
    paymentMessageElement.textContent = message;
    paymentMessageElement.style.color = isError ? '#d93025' : '#1e8e3e';
    paymentMessageElement.style.backgroundColor = isError ? '#fce8e6' : '#e6f4ea';
    paymentMessageElement.style.display = 'block';
}

function clearMessage() {
    if (paymentMessageElement) {
        paymentMessageElement.textContent = '';
        paymentMessageElement.style.display = 'none';
    }
}

function setLoading(button, isLoading) {
    if (!button) return;
    if (isLoading && !button.hasAttribute('data-original-text')) {
        button.setAttribute('data-original-text', button.textContent);
    }
    button.disabled = isLoading;
    button.textContent = isLoading ? 'Please wait...' : (button.getAttribute('data-original-text') || 'Buy');
    button.style.opacity = isLoading ? '0.7' : '1';
}

function setLoadingOnAllButtons(isLoading) {
    purchaseButtons.forEach(button => setLoading(button, isLoading));
}

// --- Event Listeners ---
function setupEventListeners() {
    if (backButton) {
        backButton.addEventListener('click', (e) => { e.preventDefault(); window.location.href = 'index.html'; });
    }
    if (logoutButton) {
        logoutButton.addEventListener('click', handleLogout);
    }
    purchaseButtons.forEach(button => {
        button.addEventListener('click', startCheckout);
    });
}

// --- Inizializzazione ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("coins.js: DOM fully loaded.");

    // Inizializza gli elementi del DOM
    coinsBalanceElement = document.getElementById('coinsBalance');
    backButton = document.getElementById('backButton');
    logoutButton = document.getElementById('logoutButton');
    purchaseButtons = document.querySelectorAll('.purchase-button[data-price-id]');
    paymentMessageElement = document.getElementById('payment-message');

    setupEventListeners();
    setLoadingOnAllButtons(true); // Disabilita i bottoni finché non abbiamo i dati

    // Richiedi i dati utente al background
    chrome.runtime.sendMessage({ command: 'getUserData' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
            console.error("Could not get user data from background:", chrome.runtime.lastError?.message || response?.error);
            document.body.innerHTML = '<p style="color:red; padding:10px;">Error: Could not load user data. Please log in again.</p>';
            return;
        }

        if (response.isLoggedIn) {
            initializeUI(response.user);
        } else {
            // Se l'utente non è loggato, reindirizza
            window.location.href = 'index.html';
        }
    });

    // Listener per aggiornamenti in tempo reale dal background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.command === 'userDataUpdated' && message.payload.user) {
            console.log("Received user data update from background:", message.payload.user);
            initializeUI(message.payload.user);
        }
        return true;
    });
});
