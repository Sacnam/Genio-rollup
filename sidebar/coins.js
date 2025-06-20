// File: sidebar/coins.js (Sintassi compat)

// --- Configurazione Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyB733UNF8wJYRszdIw4H3XoS7Bmn7yvLig",
    authDomain: "genio-f9386.firebaseapp.com",
    projectId: "genio-f9386",
    storageBucket: "genio-f9386.firebasestorage.app",
    messagingSenderId: "759357192037",
    appId: "1:759357192037:web:b0004722e8f1d4c9e5138c",
    measurementId: "G-B18GK4VB1G"
};

// --- Inizializzazione Firebase ---
let app, db, auth;
try {
    if (!firebase.apps.length) {
        app = firebase.initializeApp(firebaseConfig);
    } else {
        app = firebase.app();
    }
    db = firebase.firestore();
    auth = firebase.auth();
    console.log("Firebase (App, Firestore, Auth) initialized in coins.js");
} catch (error) {
    console.error("Error initializing Firebase in coins.js:", error);
    alert("Critical Error: Cannot initialize services.");
}

// --- Elementi del DOM ---
let coinsBalanceElement;
let backButton;
let logoutButton;
let purchaseButtons = [];
let paymentMessageElement;

// --- Variabili Globali ---
let currentUser = null;
let isDomReady = false;
let isUserReady = false;

// --- Funzione per tentare l'inizializzazione finale ---
function attemptFinalInitialization() {
    const allReady = isDomReady && isUserReady;
    console.log(`Initialization status: DOM=${isDomReady}, User=${isUserReady}. All Ready: ${allReady}`);

    if (allReady) {
        console.log("Conditions met: Performing final setup.");

        coinsBalanceElement = document.getElementById('coinsBalance');
        backButton = document.getElementById('backButton');
        logoutButton = document.getElementById('logoutButton');
        purchaseButtons = document.querySelectorAll('.purchase-button[data-price-id]');
        paymentMessageElement = document.getElementById('payment-message');

        if (backButton) {
            backButton.addEventListener('click', (e) => { e.preventDefault(); window.location.href = 'index.html'; });
        } else { console.warn("'Back' button not found."); }

        if (logoutButton) {
            logoutButton.addEventListener('click', handleLogout);
        } else { console.warn("'Logout' button not found."); }

        clearMessage();
        loadUserData();
        setupPurchaseButtons();

    } else {
        console.log("Still waiting...");
    }
}

// --- Autenticazione Firebase ---
if (auth) {
    auth.onAuthStateChanged(async (user) => {
        const userChanged = (!currentUser && user) || (currentUser && !user) || (currentUser && user && currentUser.uid !== user.uid);

        if (user) {
            currentUser = user;
            if (!isUserReady) {
                console.log("User logged in:", currentUser.uid);
                isUserReady = true;
                if (userChanged) attemptFinalInitialization();
            }
        } else {
            currentUser = null;
            if (isUserReady) {
                isUserReady = false;
                console.log("No user logged in, redirecting to login.html");
                if (window.location.pathname && !window.location.pathname.endsWith('login.html')) {
                    window.location.href = 'login.html';
                }
            }
        }
    });
} else {
    console.error("Firebase Authentication service not available.");
    document.addEventListener('DOMContentLoaded', () => {
         const body = document.querySelector('body');
         if(body) body.innerHTML = '<p style="color:red; padding:10px;">Error: Authentication service unavailable.</p>';
    });
}

// --- Funzioni Principali ---
async function loadUserData() {
    if (!currentUser || !db) {
        console.warn("loadUserData called without user or db.");
        return;
    }
    if (!coinsBalanceElement) {
        console.warn("loadUserData: coinsBalanceElement not ready yet.");
        return;
    }
    console.log("Loading user data from Firestore...");
    try {
        const userRef = db.collection('users').doc(currentUser.uid);
        userRef.onSnapshot((doc) => {
             if (doc.exists) {
                const userData = doc.data();
                const currentCoins = userData.coins || 0;
                console.log("Coin balance updated (onSnapshot):", currentCoins);
                if (coinsBalanceElement) {
                    coinsBalanceElement.textContent = currentCoins;
                }
             } else {
                console.warn("User document not found (onSnapshot):", currentUser.uid);
                if (coinsBalanceElement) coinsBalanceElement.textContent = '0';
             }
        }, (error) => {
             console.error("Error listening to user data:", error);
             setMessage("Error reading balance.", true);
             if (coinsBalanceElement) coinsBalanceElement.textContent = '?';
        });
    } catch (error) {
        console.error("Initial data loading error:", error);
        setMessage("Error loading balance.", true);
        if (coinsBalanceElement) coinsBalanceElement.textContent = '?';
    }
}

async function startCheckoutViaExtension(event) {
    if (!currentUser || !db) { setMessage("Error: You must be logged in.", true); return; }

    const purchaseButton = event.currentTarget;
    const priceId = purchaseButton.getAttribute('data-price-id');
    if (!priceId) { setMessage("Error: Missing product ID.", true); return; }

    console.log(`[Extension] Starting Firestore checkout for priceId: ${priceId}`);
    setLoading(purchaseButton, true);
    setMessage("Creating payment session...");

    let unsubscribe = null;

    try {
        const successUrl = "https://genio-f9386.web.app/payment_success.html";
        const cancelUrl = "https://genio-f9386.web.app/payment_cancel.html";

        const checkoutSessionRef = await db.collection("customers").doc(currentUser.uid).collection("checkout_sessions").add({
            mode: "payment",
            price: priceId,
            success_url: successUrl,
            cancel_url: cancelUrl,
            client_reference_id: currentUser.uid,
        });

        console.log(`[Extension] checkout_sessions document created: ${checkoutSessionRef.id} with client_reference_id: ${currentUser.uid}`);
        setMessage("Waiting for Stripe...");

        unsubscribe = checkoutSessionRef.onSnapshot((snap) => {
            if (!unsubscribe) return;

            const data = snap.data();
            console.log("[Extension] checkout_sessions snapshot received:", data);

            if (data?.error) {
                console.error("[Extension] Error from Stripe extension:", data.error);
                setMessage(`Error: ${data.error.message || 'Unknown error from the extension.'}`, true);
                setLoading(purchaseButton, false);
                if (unsubscribe) { unsubscribe(); unsubscribe = null; }
            }
            else if (data?.url) {
                console.log("[Extension] Checkout URL received:", data.url);
                setMessage("Opening payment page...");
                if (unsubscribe) { unsubscribe(); unsubscribe = null; }

                try {
                    if (typeof chrome !== 'undefined' && chrome.tabs) {
                        chrome.tabs.create({ url: data.url });
                        console.log("New tab opened (chrome.tabs).");
                    } else {
                         window.open(data.url, '_blank');
                         console.log("New tab opened (window.open).");
                    }

                    setTimeout(() => {
                        if (paymentMessageElement && paymentMessageElement.textContent === "Opening payment page...") {
                            clearMessage();
                            console.log("'Opening...' message cleared after timeout.");
                        }
                    }, 5000);

                } catch (tabError) {
                     console.error("Error opening new tab:", tabError);
                     setMessage("Error opening payment page.", true);
                     setLoading(purchaseButton, false);
                }
            }
        }, (error) => {
             console.error("[Extension] Error onSnapshot checkout_sessions:", error);
             setMessage(`Error while waiting for session: ${error.message}`, true);
             setLoading(purchaseButton, false);
             if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        });

    } catch (error) {
        console.error("[Extension] Firestore write error:", error);
        setMessage(`Error starting payment: ${error.message}`, true);
        setLoading(purchaseButton, false);
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    }
}

function handleLogout() {
    if (!auth) return;
    console.log("Logging out...");
    if (coinsBalanceElement) coinsBalanceElement.textContent = '0';
    clearMessage();
    if (purchaseButtons) {
        purchaseButtons.forEach(button => setLoading(button, true));
    }

    auth.signOut().then(() => {
        console.log("Logout successful.");
    }).catch(error => {
        console.error('Error during logout:', error);
        alert('Error during logout.');
    });
}

// --- Funzioni Helper ---
function setMessage(message, isError = false) {
    if (!paymentMessageElement) {
        console.warn("setMessage called before paymentMessageElement is ready:", message);
        return;
    }
    paymentMessageElement.textContent = message;
    paymentMessageElement.style.color = isError ? '#d93025' : '#1e8e3e';
    paymentMessageElement.style.backgroundColor = isError ? '#fce8e6' : '#e6f4ea';
    paymentMessageElement.style.borderColor = isError ? '#f9ab9f' : '#a1d9ae';
    paymentMessageElement.style.borderWidth = '1px';
    paymentMessageElement.style.borderStyle = 'solid';
    paymentMessageElement.style.padding = '10px';
    paymentMessageElement.style.display = 'block';
    paymentMessageElement.style.borderRadius = '5px';
    paymentMessageElement.style.textAlign = 'center';
    paymentMessageElement.style.fontSize = '0.9rem';
    console.log(`User Message (${isError ? 'Error' : 'Info'}): ${message}`);
}

function clearMessage() {
    if (paymentMessageElement) {
        paymentMessageElement.textContent = '';
        paymentMessageElement.style.display = 'none';
        console.log("Message area cleared.");
    }
}

function setLoading(button, isLoading) {
    if (!button) return;
    if (isLoading && !button.hasAttribute('data-original-text')) {
        button.setAttribute('data-original-text', button.textContent);
    }
    if (isLoading) {
        button.disabled = true;
        button.textContent = 'Please wait...';
        button.style.opacity = '0.7';
    } else {
        button.disabled = false;
        button.textContent = button.getAttribute('data-original-text') || 'Buy Coins';
        button.style.opacity = '1';
        button.removeAttribute('data-original-text');
    }
}

// --- Event Listeners ---
function setupPurchaseButtons() {
    if (!purchaseButtons || purchaseButtons.length === 0) {
        console.warn("No purchase buttons found with 'data-price-id' during setupPurchaseButtons.");
        return;
    }
    console.log(`Setting up ${purchaseButtons.length} purchase buttons (Extension mode)...`);
    purchaseButtons.forEach(button => {
        setLoading(button, false);
        button.disabled = !isUserReady;
        button.removeEventListener('click', startCheckoutViaExtension);
        if (isUserReady) {
            button.addEventListener('click', startCheckoutViaExtension);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("coins.js: DOM fully loaded.");
    isDomReady = true;
    attemptFinalInitialization();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log("Page became visible. Attempting UI update.");
    }
});