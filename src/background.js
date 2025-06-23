// src/background.js (Versione con LOG DI DEBUG e gestione getInitialData per non loggati)
// File completo e riorganizzato per robustezza.

// =================================================
// SEZIONE 1: IMPORT
// =================================================
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    signOut
} from 'firebase/auth';
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    collection,
    writeBatch,
    serverTimestamp,
    Timestamp,
    query,
    where,
    getDocs,
    orderBy,
    limit,
    onSnapshot
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Readability } from './libs/Readability.js';

console.log("BG DEBUG 1: Moduli importati.");

// =================================================
// SEZIONE 2: VARIABILI GLOBALI
// =================================================
let fbApp, fbAuth, fbDb, fbFunctions;
let currentFirebaseUser = null;
let userSnapshotUnsubscribe = null;

// =================================================
// SEZIONE 3: LISTENER DEI MESSAGGI (A PROVA DI BOMBA)
// =================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`BG DEBUG 3: Messaggio ricevuto - Comando: ${request.command}`);

    (async () => {
        // Gestiamo i comandi che NON richiedono Firebase o un utente loggato
        if (request.command === 'getAuthState') {
            const response = { isLoggedIn: !!currentFirebaseUser, user: currentFirebaseUser };
            console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
            sendResponse(response);
            return;
        }

        // --- NUOVA LOGICA PER getInitialData, getReaderInitialData, getSidebarInitialData ---
        if (request.command === 'getInitialData' || request.command === 'getReaderInitialData' || request.command === 'getSidebarInitialData') {
            // Se l'utente non è loggato, rispondiamo subito con successo ma isLoggedIn: false
            if (!currentFirebaseUser) {
                const response = {
                    success: true, // La richiesta ha avuto successo
                    data: {
                        isLoggedIn: false, // Ma l'utente non è loggato
                        user: null,
                        articles: [],
                        subscriptions: {},
                        prompts: [], // Aggiunto per getSidebarInitialData
                        feedItems: []
                    }
                };
                console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command} (utente non loggato)`);
                sendResponse(response);
                return; // Usciamo
            }

            // Se l'utente è loggato, procediamo come prima
            try {
                // Assicurati che Firebase sia inizializzato prima di procedere con query Firestore
                if (!fbAuth || !fbDb) {
                    console.error("BG: onMessage - Firebase service not initialized for getInitialData (user logged in).");
                    const response = { success: false, error: { message: "Firebase service not initialized. Check background logs." } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                    return;
                }

                const userId = currentFirebaseUser.uid;
                const articlesQuery = query(collection(fbDb, 'users', userId, 'savedArticles'), orderBy("dateAdded", "desc"));
                const subscriptionsQuery = query(collection(fbDb, 'users', userId, 'feedSubscriptions'), orderBy("title", "asc"));
                const promptsQuery = query(collection(fbDb, 'users', userId, 'customPrompts'), orderBy('order', 'asc')); // Necessario per getSidebarInitialData

                const [articlesSnapshot, subscriptionsSnapshot, promptsSnapshot, storageData] = await Promise.all([
                    getDocs(articlesQuery),
                    getDocs(subscriptionsQuery),
                    getDocs(promptsQuery),
                    chrome.storage.local.get(STORAGE_KEY_RSS_FEED_ITEMS_CACHE)
                ]);

                const articles = articlesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                const subscriptions = {};
                subscriptionsSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.url) subscriptions[data.url] = { id: doc.id, ...data };
                });
                const prompts = promptsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                const response = {
                    success: true,
                    data: {
                        isLoggedIn: true,
                        user: currentFirebaseUser,
                        articles,
                        subscriptions,
                        prompts,
                        feedItems: storageData[STORAGE_KEY_RSS_FEED_ITEMS_CACHE] || []
                    }
                };
                console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command} (utente loggato)`);
                sendResponse(response);
            } catch (error) {
                console.error(`BG: Errore in ${request.command} per l'utente ${currentFirebaseUser.uid}`, error);
                const response = { success: false, error: { message: error.message } };
                console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command} (errore loggato)`);
                sendResponse(response);
            }
            return; // Usciamo dopo aver gestito questi comandi
        }
        // --- FINE NUOVA LOGICA ---


        // Per tutti gli altri comandi, prima ci assicuriamo che Firebase sia pronto.
        if (!fbAuth || !fbDb) {
            console.error("BG: onMessage - Firebase service not initialized. Cannot process command:", request.command);
            const response = { success: false, error: { message: "Firebase service not initialized. Check background logs." } };
            console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
            sendResponse(response);
            return;
        }

        // Gestione login/signup (non richiedono un utente *già* loggato)
        if (request.command === 'login' || request.command === 'signup') {
            try {
                if (request.command === 'login') {
                    const { email, password } = request.payload;
                    await signInWithEmailAndPassword(fbAuth, email, password);
                } else { // signup
                    const { name, email, password } = request.payload;
                    const userCredential = await createUserWithEmailAndPassword(fbAuth, email, password);
                    const user = userCredential.user;
                    await updateProfile(user, { displayName: name });
                    const userRef = doc(fbDb, 'users', user.uid);
                    const transactionRef = doc(collection(userRef, 'transactions'));
                    const batch = writeBatch(fbDb);
                    batch.set(userRef, { name, email, coins: 50, createdAt: serverTimestamp(), status: 'active', lastLogin: serverTimestamp() });
                    batch.set(transactionRef, { amount: 50, type: 'credit', description: 'Welcome bonus', timestamp: serverTimestamp() });
                    await batch.commit();
                }
                const response = { success: true };
                console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                sendResponse(response);
            } catch (error) {
                console.error(`BG: ${request.command} failed`, error);
                const response = { success: false, error: { code: error.code, message: mapAuthError(error.code) } };
                console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                sendResponse(response);
            }
            return;
        }

        // --- Da qui in poi, tutti i comandi richiedono un utente loggato ---
        if (!currentFirebaseUser) {
            const response = { success: false, error: { message: "User not authenticated." } };
            console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
            sendResponse(response);
            return;
        }

        const userId = currentFirebaseUser.uid;

        // Switch per tutti gli altri comandi che richiedono autenticazione
        switch (request.command) {
            // --- Auth & User Data ---
            case 'logout':
                try {
                    await signOut(fbAuth);
                    const response = { success: true };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { code: error.code, message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;
            case 'getUserData':
                {
                    const response = { success: true, isLoggedIn: true, user: currentFirebaseUser };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;
            
            case 'saveArticle':
                try {
                    const articleData = request.payload;
                    const articlesRef = collection(fbDb, 'users', userId, 'savedArticles');
                    const q = query(articlesRef, where("url", "==", articleData.url), limit(1));
                    const querySnapshot = await getDocs(q);

                    let operationType = '';
                    const dataToSave = { ...articleData, dateAdded: serverTimestamp() };

                    if (!querySnapshot.empty) {
                        const docRef = querySnapshot.docs[0].ref;
                        await updateDoc(docRef, dataToSave);
                        operationType = 'updated';
                    } else {
                        await setDoc(doc(articlesRef, articleData.id), dataToSave);
                        operationType = 'added';
                    }
                    const response = { success: true, operationType };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            case 'updateArticle':
                try {
                    const { articleId, updates } = request.payload;
                    const articleRef = doc(fbDb, 'users', userId, 'savedArticles', articleId);
                    await updateDoc(articleRef, updates);
                    const response = { success: true };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            case 'deleteArticle':
                try {
                    await deleteDoc(doc(fbDb, 'users', userId, 'savedArticles', request.payload.articleId));
                    const response = { success: true };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            // --- Feed Subscription Commands ---
            case 'getSubscriptions':
                try {
                    const subsSnapshot = await getDocs(collection(fbDb, 'users', userId, 'feedSubscriptions'));
                    const subscriptions = {};
                    subsSnapshot.forEach(doc => {
                        const data = doc.data();
                        if (data.url) subscriptions[data.url] = { id: doc.id, ...data };
                    });
                    const response = { success: true, subscriptions };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            case 'subscribeToFeed':
                try {
                    const { url, title } = request.payload;
                    const subsRef = collection(fbDb, 'users', userId, 'feedSubscriptions');
                    const q = query(subsRef, where("url", "==", url), limit(1));
                    const existing = await getDocs(q);
                    if (!existing.empty) {
                        const response = { success: false, error: { message: "Already subscribed." } };
                        console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                        sendResponse(response);
                        return;
                    }
                    await addDoc(subsRef, { url, title, subscribedAt: serverTimestamp() });
                    fetchAllFeedsInBackground(true); // Trigger a refresh
                    const response = { success: true };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;
            
            case 'unsubscribeFromFeed':
                try {
                    const { feedUrl } = request.payload;
                    const subsRef = collection(fbDb, 'users', userId, 'feedSubscriptions');
                    const q = query(subsRef, where("url", "==", feedUrl), limit(1));
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        await deleteDoc(snapshot.docs[0].ref);
                    }
                    const response = { success: true };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            case 'renameFeed':
                try {
                    const { feedUrl, newName } = request.payload;
                    const subsRef = collection(fbDb, 'users', userId, 'feedSubscriptions');
                    const q = query(subsRef, where("url", "==", feedUrl), limit(1));
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        await updateDoc(snapshot.docs[0].ref, { title: newName });
                    }
                    const response = { success: true };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            // --- Prompt Management Commands ---
            case 'getCustomPrompts':
                try {
                    const promptsQuery = query(collection(fbDb, 'users', userId, 'customPrompts'), orderBy('order', 'asc'));
                    const snapshot = await getDocs(promptsQuery);
                    const prompts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    const response = { success: true, prompts };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;
            
            case 'getPromptDetails':
                try {
                    const docRef = doc(fbDb, 'users', userId, 'customPrompts', request.payload.id);
                    const docSnap = await getDoc(docRef);
                    if (docSnap.exists()) {
                        const response = { success: true, prompt: docSnap.data() };
                        console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                        sendResponse(response);
                    } else {
                        const response = { success: false, error: { message: "Prompt not found." } };
                        console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                        sendResponse(response);
                    }
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            case 'savePrompt':
                try {
                    const promptData = request.payload;
                    const promptsRef = collection(fbDb, 'users', userId, 'customPrompts');
                    if (promptData.id) { // Update
                        const docRef = doc(promptsRef, promptData.id);
                        await updateDoc(docRef, { ...promptData, lastUpdated: serverTimestamp() });
                    } else { // Add
                        const q = query(promptsRef, orderBy('order', 'desc'), limit(1));
                        const lastDoc = await getDocs(q);
                        const nextOrder = lastDoc.empty ? 0 : (lastDoc.docs[0].data().order || 0) + 1;
                        await addDoc(promptsRef, { ...promptData, order: nextOrder, lastUpdated: serverTimestamp() });
                    }
                    const response = { success: true };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            case 'deletePrompt':
                try {
                    await deleteDoc(doc(fbDb, 'users', userId, 'customPrompts', request.payload.id));
                    const response = { success: true };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            case 'updatePromptOrder':
                try {
                    const { orderedIds } = request.payload;
                    const batch = writeBatch(fbDb);
                    orderedIds.forEach((id, index) => {
                        const docRef = doc(fbDb, 'users', userId, 'customPrompts', id);
                        batch.update(docRef, { order: index });
                    });
                    await batch.commit();
                    const response = { success: true };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            case 'sendChatMessage':
                try {
                    await addDoc(collection(fbDb, 'chats'), {
                        prompt: request.payload.prompt,
                        userId: userId,
                        createTime: serverTimestamp()
                    });
                    const response = { success: true };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            // --- Stripe & TTS Commands ---
            case 'startStripeCheckout':
                try {
                    const checkoutSessionRef = await addDoc(collection(fbDb, "customers", userId, "checkout_sessions"), {
                        mode: "payment",
                        price: request.payload.priceId,
                        success_url: "https://genio-f9386.web.app/payment_success.html",
                        cancel_url: "https://genio-f9386.web.app/payment_cancel.html",
                        client_reference_id: userId,
                    });

                    onSnapshot(checkoutSessionRef, (snap) => {
                        const { error, url } = snap.data();
                        if (error) { console.error(`Stripe Error: ${error.message}`); }
                        if (url) { chrome.tabs.create({ url }); }
                    });
                    const response = { success: true };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            case 'generateSpeech':
                try {
                    const generateSpeechCallable = httpsCallable(fbFunctions, 'generateSpeech');
                    const result = await generateSpeechCallable({ text: request.payload.text, voice: request.payload.voice });
                    const response = { success: true, audioUrl: result.data.audioUrl };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                } catch (error) {
                    const response = { success: false, error: { message: error.message } };
                    console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                    sendResponse(response);
                }
                break;

            // --- Altri comandi ---
            case 'fetchAllFeeds':
                const responseData = await fetchAllFeedsInBackground(request.forceRefresh);
                const response = { success: responseData.success, newItemsCount: responseData.newItemsCount, newlyPromotedCount: responseData.newlyPromotedCount };
                console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                sendResponse(response);
                break;
            
            case 'updateBadgeCount':
            case 'clearReaderBadge':
                await updateExtensionBadge();
                const badgeResponse = {updated: true};
                console.log(`BG DEBUG 4: Inviando risposta per il comando: ${request.command}`);
                sendResponse(badgeResponse);
                break;

            default:
                console.log("BG: Received unhandled authenticated command", request.command);
                // Non inviare risposta per comandi non gestiti per evitare errori
                break;
        }
    })();

    return true; // Fondamentale per le risposte asincrone
});

console.log("BG DEBUG 2: Listener onMessage registrato.");


// =================================================
// SEZIONE 4: INIZIALIZZAZIONE E LOGICA DI BACKGROUND
// =================================================

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyB733UNF8wJYRszdIw4H3XoS7Bmn7yvLig",
    authDomain: "genio-f9386.firebaseapp.com",
    projectId: "genio-f9386",
    storageBucket: "genio-f9386.appspot.com",
    messagingSenderId: "759357192037",
    appId: "1:759357192037:web:b0004722e8f1d4c9e5138c",
    measurementId: "G-B18GK4VB1G"
};

try {
    fbApp = initializeApp(firebaseConfig);
    fbAuth = getAuth(fbApp);
    fbDb = getFirestore(fbApp);
    fbFunctions = getFunctions(fbApp);
    console.log("BG: Firebase initialized with modular syntax.");

    // --- Auth State Observer ---
    onAuthStateChanged(fbAuth, (user) => {
        if (userSnapshotUnsubscribe) {
            userSnapshotUnsubscribe();
            userSnapshotUnsubscribe = null;
        }

        if (user) {
            const userDocRef = doc(fbDb, 'users', user.uid);
            userSnapshotUnsubscribe = onSnapshot(userDocRef, (doc) => {
                if (doc.exists()) {
                    currentFirebaseUser = {
                        uid: user.uid,
                        email: user.email,
                        displayName: user.displayName,
                        ...doc.data()
                    };
                    chrome.runtime.sendMessage({ command: 'userDataUpdated', payload: { user: currentFirebaseUser } }).catch(e => {});
                } else {
                    currentFirebaseUser = { uid: user.uid, email: user.email, displayName: user.displayName };
                }
                console.log("BG: Auth state changed, user data updated:", currentFirebaseUser?.uid);
            });
            fetchAllFeedsInBackground(true);
        } else {
            currentFirebaseUser = null;
            console.log("BG: Auth state changed, no user.");
            chrome.storage.local.set({ [STORAGE_KEY_RSS_FEED_ITEMS_CACHE]: [] });
            updateExtensionBadge();
            chrome.runtime.sendMessage({ command: 'userDataUpdated', payload: { user: null } }).catch(e => {});
        }
    });

} catch (e) {
    console.error("CRITICAL: Firebase initialization failed!", e);
}


// --- Funzioni Helper ---
function mapAuthError(errorCode) {
    const errorMap = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password. Please try again.',
        'auth/invalid-email': 'The email address is not valid.',
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/too-many-requests': 'Access temporarily disabled due to too many failed login attempts. Please try again later.',
        'auth/network-request-failed': 'Network error. Please check your connection.',
        'auth/email-already-in-use': 'This email address is already registered.',
        'auth/weak-password': 'Password is too weak. Please choose a stronger password.',
        'permission-denied': 'Database error. Could not save user data.',
        'unavailable': 'Database service is temporarily unavailable. Please try again.'
    };
    return errorMap[errorCode] || 'An unknown error occurred. Please try again.';
}

// --- Offscreen Document Setup ---
const OFFSCREEN_DOCUMENT_PATH = 'offscreen_parser.html';
let creatingOffscreenPromise = null;

async function hasOffscreenDocument() {
    if (typeof clients === 'undefined' || typeof clients.matchAll !== 'function') {
        return false;
    }
    const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
    try {
        const allClients = await clients.matchAll();
        for (const client of allClients) {
            if (client.url === offscreenUrl) {
                return true;
            }
        }
    } catch (e) {
        console.error("BG: Errore durante clients.matchAll() in hasOffscreenDocument:", e);
    }
    return false;
}

async function createOffscreenDocumentIfNeeded() {
    if (await hasOffscreenDocument()) {
        return;
    }
    if (creatingOffscreenPromise) {
        await creatingOffscreenPromise;
        return;
    }

    creatingOffscreenPromise = chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.DOM_PARSER],
        justification: 'Necessario per il parsing di XML dei feed RSS',
    }).catch(err => {
        console.error("BG: Errore durante la creazione del documento offscreen:", err);
    }).finally(() => {
        creatingOffscreenPromise = null;
    });
    try {
        await creatingOffscreenPromise;
    } catch(e) {
        // Error already logged
    }
}

async function parseFeedXmlViaOffscreen(feedText, feedUrl, feedInfoTitle) {
    await createOffscreenDocumentIfNeeded();

    return new Promise((resolve, reject) => {
        const timeoutDuration = 20000;
        const timeoutId = setTimeout(() => {
            console.warn(`BG: Timeout parsing feed via offscreen: ${feedInfoTitle} (${feedUrl})`);
            reject(new Error(`Timeout parsing feed: ${feedInfoTitle} (${feedUrl})`));
        }, timeoutDuration);

        chrome.runtime.sendMessage(
            {
                target: 'offscreen_document_rss_parser',
                action: "parseXmlFeed",
                xmlString: feedText,
                feedUrl: feedUrl
            },
            (response) => {
                clearTimeout(timeoutId);
                if (chrome.runtime.lastError) {
                    console.error(`BG: Errore sendMessage a offscreen per ${feedInfoTitle}:`, chrome.runtime.lastError.message);
                    reject(chrome.runtime.lastError.message);
                    return;
                }
                if (response && response.success && Array.isArray(response.items)) {
                    resolve(response.items.map(item => ({
                        ...item,
                        feedUrl: feedUrl,
                        feedTitle: feedInfoTitle,
                        isRead: false,
                        type: 'feedItem',
                        dateFetched: Date.now()
                    })));
                } else {
                    const errorMsg = response ? response.error : "Errore sconosciuto o risposta non valida dal parser offscreen";
                    console.error(`BG: Errore parsing feed ${feedInfoTitle} via offscreen:`, errorMsg);
                    reject(errorMsg);
                }
            }
        );
    });
}

// --- Storage Keys & Constants ---
const STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL = 'rssFeeds';
const STORAGE_KEY_RSS_FEED_ITEMS_CACHE = 'rssFeedItemsCache';
const STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL = 'feedSubscriptionDates';
const STORAGE_KEY_LAST_FETCHED_TIMES = 'rssLastFetchedTimes';
const FETCH_ALARM_NAME = 'fetchRssFeedsAlarm';
const FETCH_INTERVAL_MINUTES = 30;
const SESSION_KEY_ACTIVE_TAB_FEED_STATUS = 'sessionActiveTabFeedStatus';
const SESSION_KEY_CURRENT_ACTIVE_TAB_ID = 'sessionCurrentActiveTabId';

function generateUUID() {
    var d = new Date().getTime();
    var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16;
        if(d > 0){
            r = (d + r)%16 | 0;
            d = Math.floor(d/16);
        } else {
            r = (d2 + r)%16 | 0;
            d2 = Math.floor(d2/16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

async function updateExtensionBadge() {
    let showNewFeedsToSubscribeBadge = false;

    const sessionData = await chrome.storage.session.get([SESSION_KEY_CURRENT_ACTIVE_TAB_ID, SESSION_KEY_ACTIVE_TAB_FEED_STATUS]);
    const currentActiveTabId = sessionData[SESSION_KEY_CURRENT_ACTIVE_TAB_ID];
    const activeTabFeedStatus = sessionData[SESSION_KEY_ACTIVE_TAB_FEED_STATUS] || {};
    const currentTabFeeds = (currentActiveTabId && activeTabFeedStatus[currentActiveTabId]) ? activeTabFeedStatus[currentActiveTabId] : [];

    if (currentActiveTabId && Array.isArray(currentTabFeeds) && currentTabFeeds.length > 0) {
        try {
            let subscriptions = {};
            if (currentFirebaseUser) {
                const subsSnapshot = await getDocs(collection(fbDb, 'users', currentFirebaseUser.uid, 'feedSubscriptions'));
                subsSnapshot.forEach(doc => {
                    const subData = doc.data();
                    if (subData.url) subscriptions[subData.url] = { title: subData.title };
                });
            } else {
                const localSubsData = await chrome.storage.local.get(STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL);
                subscriptions = localSubsData[STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL] || {};
            }

            const newFeeds = currentTabFeeds.filter(feed => feed.url && !subscriptions[feed.url]);
            if (newFeeds.length > 0) {
                showNewFeedsToSubscribeBadge = true;
            }
        } catch (e) {
            console.warn("BG: Errore nel leggere le sottoscrizioni per il badge dei nuovi feed", e);
        }
    }

    if (showNewFeedsToSubscribeBadge) {
        await chrome.action.setBadgeText({ text: '●' });
        await chrome.action.setBadgeBackgroundColor({ color: '#FF8C00' });
    } else {
        let unreadPromotedCount = 0;
        if (currentFirebaseUser) {
            try {
                const articlesRef = collection(fbDb, 'users', currentFirebaseUser.uid, 'savedArticles');
                const q = query(articlesRef, where('isRead', '==', false), where('source', '==', 'feed'));
                const snapshot = await getDocs(q);
                unreadPromotedCount = snapshot.size;
            } catch (e) {
                console.warn("BG: Errore nel leggere articoli non letti da Firestore per il badge:", e);
            }
        }

        if (unreadPromotedCount > 0) {
            await chrome.action.setBadgeText({ text: String(unreadPromotedCount) });
            await chrome.action.setBadgeBackgroundColor({ color: '#3498db' });
        } else {
            await chrome.action.setBadgeText({ text: '' });
        }
    }
}

async function fetchAndParseWithReadability(url) {
    try {
        const response = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw new Error(`HTTP error ${response.status} for ${url}`);
        const htmlContent = await response.text();

        let parsedDocForReadability;
        try {
            parsedDocForReadability = new DOMParser().parseFromString(htmlContent, "text/html");
        } catch (e) {
            console.error("BG: DOMParser failed:", e);
            return { success: false, error: "DOMParser failed in Service Worker." };
        }

        let baseEl = parsedDocForReadability.querySelector('base[href]');
        if (!baseEl) { baseEl = parsedDocForReadability.createElement('base'); baseEl.setAttribute('href', url); parsedDocForReadability.head.appendChild(baseEl); }

        if (typeof Readability === 'undefined') {
            console.error("BG: Readability library not loaded!");
            throw new Error("Readability library not available in background.");
        }

        const readerArticle = new Readability(parsedDocForReadability.cloneNode(true), { charThreshold: 250, nTopCandidates: 5 }).parse();
        if (readerArticle && readerArticle.content) {
            return {
                success: true,
                article: {
                    title: readerArticle.title || "Untitled",
                    content: readerArticle.content,
                    textContent: readerArticle.textContent,
                    length: readerArticle.length,
                    excerpt: readerArticle.excerpt,
                    byline: readerArticle.byline,
                    siteName: readerArticle.siteName,
                    image: readerArticle.image,
                    banner: readerArticle.banner
                }
            };
        } else {
            return { success: false, error: "Readability could not parse content for promotion." };
        }
    } catch (error) {
        console.error(`BG: (Readability) Error during promotion fetch for ${url}:`, error);
        return { success: false, error: error.message };
    }
}

async function fetchAllFeedsInBackground(forceRefreshAll = false) {
    let subscriptions = {};
    let feedSubscriptionDates = {};

    if (currentFirebaseUser) {
        try {
            const subsSnapshot = await getDocs(collection(fbDb, 'users', currentFirebaseUser.uid, 'feedSubscriptions'));
            subsSnapshot.forEach(doc => {
                const subData = doc.data();
                if (subData.url) {
                    subscriptions[subData.url] = { title: subData.title || new URL(subData.url).hostname };
                    if (subData.subscribedAt && subData.subscribedAt.toDate) {
                        feedSubscriptionDates[subData.url] = subData.subscribedAt.toDate().getTime();
                    } else {
                        feedSubscriptionDates[subData.url] = 0;
                    }
                }
            });
        } catch (e) {
            console.error("BG: Errore caricamento sottoscrizioni da Firestore:", e);
        }
    } else {
        const localSubsData = await chrome.storage.local.get([STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL, STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL]);
        subscriptions = localSubsData[STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL] || {};
        feedSubscriptionDates = localSubsData[STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL] || {};
    }

    const storageData = await chrome.storage.local.get([
        STORAGE_KEY_RSS_FEED_ITEMS_CACHE,
        STORAGE_KEY_LAST_FETCHED_TIMES,
    ]);

    let feedItemsCache = storageData[STORAGE_KEY_RSS_FEED_ITEMS_CACHE] || [];
    const lastFetchedTimes = storageData[STORAGE_KEY_LAST_FETCHED_TIMES] || {};

    const feedEntries = Object.entries(subscriptions);
    if (feedEntries.length === 0) {
        chrome.runtime.sendMessage({ command: 'feedsUpdated', feedItems: [], subscriptions: {}, newlyPromotedArticles: [] }).catch(e => {});
        await updateExtensionBadge();
        return { success: true, feedItems: [], subscriptions, newItemsCount: 0, newlyPromotedCount: 0 };
    }

    let newRawItemsCount = 0;
    let newlyPromotedArticlesForFirestore = [];
    const fetchInterval = (FETCH_INTERVAL_MINUTES / 2) * 60 * 1000;

    for (const [feedUrl, feedInfo] of feedEntries) {
        if (!forceRefreshAll && lastFetchedTimes[feedUrl] && (Date.now() - lastFetchedTimes[feedUrl] < fetchInterval)) {
            continue;
        }
        try {
            const urlToFetch = feedUrl + (feedUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
            const response = await fetch(urlToFetch, { mode: 'cors', cache: 'no-cache', signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw new Error(`HTTP ${response.status} for ${feedUrl}`);
            const text = await response.text();

            const parsedItems = await parseFeedXmlViaOffscreen(text, feedUrl, feedInfo.title);

            const subscriptionDate = feedSubscriptionDates[feedUrl] || 0;

            for (const parsedItem of parsedItems) {
                const existingRawIndex = feedItemsCache.findIndex(existing => existing.id === parsedItem.id && existing.feedUrl === feedUrl);
                const feedItemForCache = {
                    ...parsedItem,
                    feedUrl: feedUrl,
                    feedTitle: feedInfo.title,
                    isRead: false,
                    type: 'feedItem',
                    dateFetched: Date.now(),
                    contentFromReadability: ''
                };

                if (existingRawIndex === -1) {
                    feedItemsCache.push(feedItemForCache);
                    newRawItemsCount++;
                } else {
                    feedItemsCache[existingRawIndex] = {
                        ...feedItemForCache,
                        isRead: feedItemsCache[existingRawIndex].isRead,
                        contentFromReadability: feedItemsCache[existingRawIndex].contentFromReadability || ''
                    };
                }

                const pubDateTime = new Date(parsedItem.pubDate).getTime();
                const isPostSubscription = pubDateTime >= subscriptionDate;

                let isAlreadyProcessedInFirestore = false;
                if (currentFirebaseUser && parsedItem.link && parsedItem.link !== '#') {
                    const articlesRef = collection(fbDb, 'users', currentFirebaseUser.uid, 'savedArticles');
                    const q = query(articlesRef, where("url", "==", parsedItem.link));
                    const querySnapshot = await getDocs(q);
                    isAlreadyProcessedInFirestore = !querySnapshot.empty;
                }

                if (isPostSubscription && !isAlreadyProcessedInFirestore && currentFirebaseUser) {
                    let promotedContent = parsedItem.fullContentHTML || parsedItem.description;
                    let readabilitySuccess = false;
                    let readabilityResult = null;

                    if (parsedItem.link && parsedItem.link.startsWith('http') && (!parsedItem.fullContentHTML || parsedItem.fullContentHTML.length < 200)) {
                        readabilityResult = await fetchAndParseWithReadability(parsedItem.link);
                        if (readabilityResult.success && readabilityResult.article && readabilityResult.article.content) {
                            promotedContent = readabilityResult.article.content;
                            readabilitySuccess = true;
                        }
                    } else if (!promotedContent) {
                        promotedContent = `<p>${parsedItem.description}</p><p><a href="${parsedItem.link}" target="_blank" rel="noopener">Leggi l'originale</a></p>`;
                    }

                    let imageUrlForArticle = '';
                    let baseLinkForImageResolution = parsedItem.link;

                    if (readabilitySuccess && readabilityResult && readabilityResult.article) {
                        if (readabilityResult.article.image) {
                            try { imageUrlForArticle = new URL(readabilityResult.article.image, baseLinkForImageResolution).href; } catch (e) {}
                        }
                        if (!imageUrlForArticle && readabilityResult.article.banner) {
                            try { imageUrlForArticle = new URL(readabilityResult.article.banner, baseLinkForImageResolution).href; } catch (e) {}
                        }
                    }
                    
                    let articleTitle = (readabilitySuccess && readabilityResult?.article?.title) ? readabilityResult.article.title : (parsedItem.title || "Untitled Feed Item");
                    let articleExcerpt = (readabilitySuccess && readabilityResult?.article?.excerpt) ? readabilityResult.article.excerpt :
                                        (readabilitySuccess && readabilityResult?.article?.textContent) ? readabilityResult.article.textContent.substring(0, 250) :
                                        parsedItem.description ? parsedItem.description.substring(0, 200) : "";

                    const newArticleForFirestore = {
                        title: articleTitle,
                        url: parsedItem.link,
                        content: promotedContent,
                        imageUrl: imageUrlForArticle,
                        excerpt: articleExcerpt,
                        dateAdded: serverTimestamp(),
                        pubDate: parsedItem.pubDate ? Timestamp.fromDate(new Date(parsedItem.pubDate)) : null,
                        isFavorite: false,
                        isReadLater: false,
                        isRead: false,
                        tags: [],
                        type: 'article',
                        feedUrl: feedUrl,
                        feedTitle: feedInfo.title,
                        source: 'feed'
                    };
                    newlyPromotedArticlesForFirestore.push(newArticleForFirestore);
                }
            }
            lastFetchedTimes[feedUrl] = Date.now();
        } catch (error) {
            console.error(`BG: Errore fetch/parse/promote feed ${feedInfo.title} (${feedUrl}):`, error);
        }
    }

    if (newRawItemsCount > 0 || forceRefreshAll) {
        feedItemsCache.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
        await chrome.storage.local.set({ [STORAGE_KEY_RSS_FEED_ITEMS_CACHE]: feedItemsCache });
    }

    if (newlyPromotedArticlesForFirestore.length > 0 && currentFirebaseUser) {
        const batch = writeBatch(fbDb);
        const articlesRef = collection(fbDb, 'users', currentFirebaseUser.uid, 'savedArticles');
        for (const articleData of newlyPromotedArticlesForFirestore) {
            const newArticleDocRef = doc(articlesRef, generateUUID());
            batch.set(newArticleDocRef, { ...articleData, id: newArticleDocRef.id });
        }
        try {
            await batch.commit();
        } catch (e) {
            console.error("BG: Errore salvataggio batch articoli da feed su Firestore:", e);
        }
    }

    await chrome.storage.local.set({ [STORAGE_KEY_LAST_FETCHED_TIMES]: lastFetchedTimes });

    chrome.runtime.sendMessage({
        command: 'feedsUpdated',
        feedItems: feedItemsCache,
        subscriptions: subscriptions,
        newlyPromotedArticles: newlyPromotedArticlesForFirestore
    }).catch(e => {});

    await updateExtensionBadge();
    return {
        success: true, feedItems: feedItemsCache, subscriptions,
        newItemsCount: newRawItemsCount, newlyPromotedCount: newlyPromotedArticlesForFirestore.length
    };
}

// --- Event Listeners (onAlarm, onInstalled, etc.) ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === FETCH_ALARM_NAME) {
        try {
            await fetchAllFeedsInBackground(false);
        } catch (error) {
            console.error("BG: Errore durante fetch periodico da allarme:", error);
        }
    }
});

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log("BG: Estensione installata/aggiornata. Creo allarme. Reason:", details.reason);
    await chrome.storage.session.set({ [SESSION_KEY_ACTIVE_TAB_FEED_STATUS]: {}, [SESSION_KEY_CURRENT_ACTIVE_TAB_ID]: null });
    await chrome.alarms.create(FETCH_ALARM_NAME, { delayInMinutes: 1, periodInMinutes: FETCH_INTERVAL_MINUTES });

    if (details.reason === "install" || details.reason === "update") {
        try {
            await fetchAllFeedsInBackground(true);
        } catch (error) {
            console.error("BG: Errore fetch post-install/update:", error);
        }
    } else {
        await updateExtensionBadge();
    }
});

chrome.runtime.onStartup.addListener(async () => {
    console.log("BG: Browser avviato. Verifico allarme e faccio fetch iniziale.");
    await chrome.storage.session.set({ [SESSION_KEY_ACTIVE_TAB_FEED_STATUS]: {}, [SESSION_KEY_CURRENT_ACTIVE_TAB_ID]: null });

    const alarm = await chrome.alarms.get(FETCH_ALARM_NAME);
    if (!alarm) {
        await chrome.alarms.create(FETCH_ALARM_NAME, { delayInMinutes: 1, periodInMinutes: FETCH_INTERVAL_MINUTES });
    }
    try {
        await fetchAllFeedsInBackground(true);
    } catch (error) {
        console.error("BG: Errore fetch onStartup:", error);
    }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await chrome.storage.session.set({ [SESSION_KEY_CURRENT_ACTIVE_TAB_ID]: activeInfo.tabId });
    const sessionData = await chrome.storage.session.get(SESSION_KEY_ACTIVE_TAB_FEED_STATUS);
    let activeTabFeedStatus = sessionData[SESSION_KEY_ACTIVE_TAB_FEED_STATUS] || {};
    if (activeTabFeedStatus[activeInfo.tabId] === undefined) {
        activeTabFeedStatus[activeInfo.tabId] = [];
        await chrome.storage.session.set({ [SESSION_KEY_ACTIVE_TAB_FEED_STATUS]: activeTabFeedStatus });
    }
    await updateExtensionBadge();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    const currentSessionTab = await chrome.storage.session.get(SESSION_KEY_CURRENT_ACTIVE_TAB_ID);
    if (tabId === currentSessionTab[SESSION_KEY_CURRENT_ACTIVE_TAB_ID] && changeInfo.status === 'loading') {
        const sessionData = await chrome.storage.session.get(SESSION_KEY_ACTIVE_TAB_FEED_STATUS);
        let activeTabFeedStatus = sessionData[SESSION_KEY_ACTIVE_TAB_FEED_STATUS] || {};
        activeTabFeedStatus[tabId] = [];
        await chrome.storage.session.set({ [SESSION_KEY_ACTIVE_TAB_FEED_STATUS]: activeTabFeedStatus });
        await updateExtensionBadge();
    }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    const sessionData = await chrome.storage.session.get([SESSION_KEY_ACTIVE_TAB_FEED_STATUS, SESSION_KEY_CURRENT_ACTIVE_TAB_ID]);
    let activeTabFeedStatus = sessionData[SESSION_KEY_ACTIVE_TAB_FEED_STATUS] || {};
    delete activeTabFeedStatus[tabId];
    await chrome.storage.session.set({ [SESSION_KEY_ACTIVE_TAB_FEED_STATUS]: activeTabFeedStatus });

    if (tabId === sessionData[SESSION_KEY_CURRENT_ACTIVE_TAB_ID]) {
        await chrome.storage.session.set({ [SESSION_KEY_CURRENT_ACTIVE_TAB_ID]: null });
        await updateExtensionBadge();
    }
});

console.log("Background service worker (V3) caricato e in ascolto.");