// src/background.js (Versione Finale Stabile con FIX per Offscreen/DOMParser)

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
// Readability non è più usato direttamente qui, ma nell'offscreen document.
import { Readability } from './libs/Readability.js';

console.log("BG DEBUG 1: Moduli importati.");

// =================================================
// SEZIONE 2: VARIABILI GLOBALI
// =================================================
let fbApp, fbAuth, fbDb, fbFunctions;
let currentFirebaseUser = null;
let userSnapshotUnsubscribe = null;
let chatListenerUnsubscribe = null;

// =================================================
// SEZIONE 3: LISTENER DEI MESSAGGI (A PROVA DI BOMBA)
// =================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(`BG DEBUG 3: Messaggio ricevuto - Comando: ${request.command}`);

    (async () => {
        let response;

        // --- GESTIONE COMANDI PUBBLICI (non richiedono login) ---
        if (request.command === 'getAuthState') {
            response = { isLoggedIn: !!currentFirebaseUser, user: currentFirebaseUser };
            sendResponse(response);
            return;
        }

        if (request.command === 'fetchWithReadability') {
            const result = await fetchAndParseWithReadability(request.url);
            sendResponse(result);
            return;
        }

        // --- GESTIONE DATI INIZIALI ---
        if (request.command === 'getInitialData' || request.command === 'getReaderInitialData' || request.command === 'getSidebarInitialData') {
            if (!currentFirebaseUser) {
                response = { success: true, data: { isLoggedIn: false, user: null, articles: [], subscriptions: {}, prompts: [], feedItems: [] } };
                sendResponse(response);
                return;
            }
            try {
                const userId = currentFirebaseUser.uid;
                const articlesQuery = query(collection(fbDb, 'users', userId, 'savedArticles'), orderBy("dateAdded", "desc"));
                const subscriptionsQuery = query(collection(fbDb, 'users', userId, 'feedSubscriptions'), orderBy("title", "asc"));
                const promptsQuery = query(collection(fbDb, 'users', userId, 'customPrompts'), orderBy('order', 'asc'));
                
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

                response = { success: true, data: { isLoggedIn: true, user: currentFirebaseUser, articles, subscriptions, prompts, feedItems: storageData[STORAGE_KEY_RSS_FEED_ITEMS_CACHE] || [] } };

                if (request.command === 'getSidebarInitialData') {
                    if (chatListenerUnsubscribe) chatListenerUnsubscribe();
                    const chatQuery = query(collection(fbDb, 'chats'), where('userId', '==', userId), orderBy('createTime', 'asc'));
                    chatListenerUnsubscribe = onSnapshot(chatQuery, (snapshot) => {
                        const history = snapshot.docs.map(doc => doc.data());
                        const isPending = snapshot.metadata.hasPendingWrites;
                        chrome.runtime.sendMessage({ command: 'chatHistoryUpdate', payload: { history, isPending } }).catch(e => {});
                    }, (error) => { console.error("BG: Errore nel listener della chat:", error); });
                }
                sendResponse(response);
            } catch (error) {
                console.error(`BG: Errore in ${request.command}`, error);
                sendResponse({ success: false, error: { message: error.message } });
            }
            return;
        }

        // --- GESTIONE LOGIN/SIGNUP ---
        if (request.command === 'login' || request.command === 'signup') {
            try {
                if (request.command === 'login') {
                    await signInWithEmailAndPassword(fbAuth, request.payload.email, request.payload.password);
                } else {
                    const userCredential = await createUserWithEmailAndPassword(fbAuth, request.payload.email, request.payload.password);
                    const user = userCredential.user;
                    await updateProfile(user, { displayName: request.payload.name });
                    const userRef = doc(fbDb, 'users', user.uid);
                    await setDoc(userRef, { name: request.payload.name, email: user.email, coins: 50, createdAt: serverTimestamp(), status: 'active', lastLogin: serverTimestamp() });
                }
                response = { success: true };
            } catch (error) {
                console.error(`BG: ${request.command} failed`, error);
                response = { success: false, error: { code: error.code, message: mapAuthError(error.code) } };
            }
            sendResponse(response);
            return;
        }

        // --- Da qui in poi, tutti i comandi richiedono un utente loggato ---
        if (!currentFirebaseUser) {
            sendResponse({ success: false, error: { message: "User not authenticated." } });
            return;
        }

        const userId = currentFirebaseUser.uid;
        let operationSuccessful = false;
        let responseData = {};

        try {
            switch (request.command) {
                // --- AUTH ---
                case 'logout':
                    await signOut(fbAuth);
                    operationSuccessful = true;
                    break;
                
                case 'getUserData':
                    operationSuccessful = true;
                    responseData.isLoggedIn = true;
                    responseData.user = currentFirebaseUser;
                    break;

                // --- ARTICOLI ---
                case 'saveArticle': {
                    const articleData = request.payload;
                    const articlesRef = collection(fbDb, 'users', userId, 'savedArticles');
                    const q = query(articlesRef, where("url", "==", articleData.url), limit(1));
                    const querySnapshot = await getDocs(q);
                    const dataToSave = { ...articleData, dateAdded: serverTimestamp() };
                    if (!querySnapshot.empty) {
                        await updateDoc(querySnapshot.docs[0].ref, dataToSave);
                        responseData.operationType = 'updated';
                    } else {
                        await setDoc(doc(articlesRef, articleData.id), dataToSave);
                        responseData.operationType = 'added';
                    }
                    operationSuccessful = true;
                    break;
                }
                case 'deleteArticle':
                    await deleteDoc(doc(fbDb, 'users', userId, 'savedArticles', request.payload.articleId));
                    operationSuccessful = true;
                    break;
                case 'updateArticle':
                    await updateDoc(doc(fbDb, 'users', userId, 'savedArticles', request.payload.articleId), request.payload.updates);
                    operationSuccessful = true;
                    break;
                case 'markItemAsRead': // Usato da Reader
                    if (request.payload.itemType === 'article') {
                        await updateDoc(doc(fbDb, 'users', userId, 'savedArticles', request.payload.itemId), { isRead: true });
                    } else if (request.payload.itemType === 'feedItem') {
                        // Logica per marcare un feed item come letto (potrebbe essere solo in local storage)
                    }
                    operationSuccessful = true;
                    break;

                // --- CHAT ---
                case 'sendChatMessage':
                    await addDoc(collection(fbDb, 'chats'), { prompt: request.payload.prompt, userId: userId, createTime: serverTimestamp() });
                    operationSuccessful = true;
                    break;

                // --- FEED ---
                case 'subscribeToFeed': {
                    const { url, title } = request.payload;
                    const subsRef = collection(fbDb, 'users', userId, 'feedSubscriptions');
                    const q_sub = query(subsRef, where("url", "==", url), limit(1));
                    const existing = await getDocs(q_sub);
                    if (existing.empty) {
                        await addDoc(subsRef, { url, title, subscribedAt: serverTimestamp() });
                        fetchAllFeedsInBackground(true);
                        operationSuccessful = true;
                    } else {
                        responseData.error = { message: "Already subscribed." };
                    }
                    break;
                }
                case 'unsubscribeFromFeed': {
                    const { feedUrl } = request.payload;
                    const unsubRef = collection(fbDb, 'users', userId, 'feedSubscriptions');
                    const q_unsub = query(unsubRef, where("url", "==", feedUrl), limit(1));
                    const snapshot = await getDocs(q_unsub);
                    if (!snapshot.empty) {
                        await deleteDoc(snapshot.docs[0].ref);
                    }
                    operationSuccessful = true;
                    break;
                }
                case 'renameFeed': {
                    const { feedUrl, newName } = request.payload;
                    const feedRef = collection(fbDb, 'users', userId, 'feedSubscriptions');
                    const q = query(feedRef, where("url", "==", feedUrl), limit(1));
                    const snapshot = await getDocs(q);
                    if (!snapshot.empty) {
                        await updateDoc(snapshot.docs[0].ref, { title: newName });
                    }
                    operationSuccessful = true;
                    break;
                }
                case 'fetchAllFeeds':
                    await fetchAllFeedsInBackground(request.forceRefresh);
                    operationSuccessful = true;
                    break;

                // --- STRIPE ---
                case 'startStripeCheckout': {
                    const checkoutSessionRef = await addDoc(collection(fbDb, "customers", userId, "checkout_sessions"), {
                        mode: "payment", price: request.payload.priceId,
                        success_url: "https://genio-f9386.web.app/payment_success.html",
                        cancel_url: "https://genio-f9386.web.app/payment_cancel.html",
                        client_reference_id: userId,
                    });
                    onSnapshot(checkoutSessionRef, (snap) => {
                        const { error, url } = snap.data();
                        if (error) { console.error(`Stripe Error: ${error.message}`); }
                        if (url) { chrome.tabs.create({ url }); }
                    });
                    operationSuccessful = true;
                    break;
                }

                // --- PROMPTS ---
                case 'getCustomPrompts': {
                    const promptsQuery = query(collection(fbDb, 'users', userId, 'customPrompts'), orderBy('order', 'asc'));
                    const snapshot = await getDocs(promptsQuery);
                    responseData.prompts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    operationSuccessful = true;
                    break;
                }
                case 'savePrompt': {
                    const promptData = request.payload;
                    const promptsRef = collection(fbDb, 'users', userId, 'customPrompts');
                    if (promptData.id) {
                        await updateDoc(doc(promptsRef, promptData.id), { ...promptData, lastUpdated: serverTimestamp() });
                    } else {
                        const q = query(promptsRef, orderBy('order', 'desc'), limit(1));
                        const lastDoc = await getDocs(q);
                        const nextOrder = lastDoc.empty ? 0 : (lastDoc.docs[0].data().order || 0) + 1;
                        await addDoc(promptsRef, { ...promptData, order: nextOrder, lastUpdated: serverTimestamp() });
                    }
                    operationSuccessful = true;
                    break;
                }
                case 'deletePrompt': {
                    await deleteDoc(doc(fbDb, 'users', userId, 'customPrompts', request.payload.id));
                    operationSuccessful = true;
                    break;
                }
                case 'updatePromptOrder': {
                    const { orderedIds } = request.payload;
                    const batch = writeBatch(fbDb);
                    orderedIds.forEach((id, index) => {
                        const docRef = doc(fbDb, 'users', userId, 'customPrompts', id);
                        batch.update(docRef, { order: index });
                    });
                    await batch.commit();
                    operationSuccessful = true;
                    break;
                }
                
                // --- UI FLUTTUANTE ---
                case 'getFloatingUiData': {
                    const prompts = (await getDocs(query(collection(fbDb, 'users', userId, 'customPrompts'), orderBy('order', 'asc')))).docs.map(d => ({id: d.id, ...d.data()}));
                    const uiWidth = await getStorageValue(STORAGE_KEY_FLOATING_UI_WIDTH, DEFAULT_UI_WIDTH);
                    const preferredLanguage = await getStorageValue('preferredLanguage', 'en');
                    responseData.data = { isLoggedIn: true, prompts, uiWidth, preferredLanguage };
                    operationSuccessful = true;
                    break;
                }
                case 'setFloatingUIWidth':
                    await chrome.storage.local.set({ [STORAGE_KEY_FLOATING_UI_WIDTH]: request.payload.width });
                    operationSuccessful = true;
                    break;

                // --- TTS ---
                case 'generateSpeech':
                    const generateSpeechCallable = httpsCallable(fbFunctions, 'generateSpeech');
                    const result = await generateSpeechCallable({ text: request.payload.text, voice: request.payload.voice });
                    responseData.audioUrl = result.data.audioUrl;
                    operationSuccessful = true;
                    break;

                // --- BADGE & VARIE ---
                case 'pageFeedsStatusUpdate':
                case 'clearReaderBadge':
                case 'updateBadgeCount':
                    await updateExtensionBadge();
                    operationSuccessful = true;
                    responseData.updated = true;
                    break;

                default:
                    console.log(`BG: Received unhandled authenticated command ${request.command}`);
                    responseData.error = { message: `Unhandled command: ${request.command}` };
                    break;
            }
            if (operationSuccessful) {
                response = { success: true, ...responseData };
            } else {
                response = { success: false, ...responseData };
            }
        } catch (error) {
            console.error(`BG: Errore durante il comando '${request.command}':`, error);
            response = { success: false, error: { message: error.message } };
        }
        
        sendResponse(response);

    })();

    return true;
});

console.log("BG DEBUG 2: Listener onMessage registrato.");


// =================================================
// SEZIONE 4: INIZIALIZZAZIONE E LOGICA DI BACKGROUND
// =================================================

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

    onAuthStateChanged(fbAuth, (user) => {
        if (userSnapshotUnsubscribe) userSnapshotUnsubscribe();
        if (chatListenerUnsubscribe) chatListenerUnsubscribe();
        userSnapshotUnsubscribe = null;
        chatListenerUnsubscribe = null;

        if (user) {
            const userDocRef = doc(fbDb, 'users', user.uid);
            userSnapshotUnsubscribe = onSnapshot(userDocRef, (doc) => {
                currentFirebaseUser = doc.exists() ? { uid: user.uid, email: user.email, displayName: user.displayName, ...doc.data() } : { uid: user.uid, email: user.email, displayName: user.displayName };
                chrome.runtime.sendMessage({ command: 'userDataUpdated', payload: { user: currentFirebaseUser } }).catch(e => {});
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
    };
    return errorMap[errorCode] || 'An unknown error occurred.';
}

// --- Offscreen Document & Parsing (FIXED FOR MV3) ---
const OFFSCREEN_DOCUMENT_PATH = 'offscreen_parser.html';
let creatingOffscreenPromise = null;

async function hasOffscreenDocument() {
    if (chrome.runtime.getContexts) {
        const contexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT']
        });
        return contexts.length > 0;
    } else {
        const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
        const allClients = await clients.matchAll({ includeUncontrolled: true });
        return allClients.some(client => client.url === offscreenUrl);
    }
}

async function createOffscreenDocumentIfNeeded() {
    if (await hasOffscreenDocument()) {
        return;
    }
    if (creatingOffscreenPromise) {
        return creatingOffscreenPromise;
    }
    creatingOffscreenPromise = chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.DOM_PARSER],
        justification: 'Parsing XML and HTML content',
    }).finally(() => {
        creatingOffscreenPromise = null;
    });
    return creatingOffscreenPromise;
}

async function parseFeedXmlViaOffscreen(feedText, feedUrl, feedInfoTitle) {
    await createOffscreenDocumentIfNeeded();
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => reject(new Error(`Timeout parsing feed: ${feedInfoTitle}`)), 20000);
        chrome.runtime.sendMessage({ target: 'offscreen_document_rss_parser', action: "parseXmlFeed", xmlString: feedText, feedUrl }, (response) => {
            clearTimeout(timeoutId);
            if (chrome.runtime.lastError || !response || !response.success) {
                reject(new Error(response?.error || chrome.runtime.lastError?.message || "Unknown offscreen parser error"));
            } else {
                resolve(response.items.map(item => ({ ...item, feedUrl, feedTitle: feedInfoTitle, isRead: false, type: 'feedItem', dateFetched: Date.now() })));
            }
        });
    });
}

// --- Storage Keys & Constants ---
const STORAGE_KEY_RSS_FEED_ITEMS_CACHE = 'rssFeedItemsCache';
const STORAGE_KEY_LAST_FETCHED_TIMES = 'rssLastFetchedTimes';
const FETCH_ALARM_NAME = 'fetchRssFeedsAlarm';
const FETCH_INTERVAL_MINUTES = 30;
const STORAGE_KEY_FLOATING_UI_WIDTH = 'floatingUIWidth';
const DEFAULT_UI_WIDTH = 225;

// --- Funzioni Principali di Background ---
async function getStorageValue(key, defaultValue) {
    const result = await chrome.storage.local.get([key]);
    return result[key] ?? defaultValue;
}

async function updateExtensionBadge() { /* ... la tua logica per il badge ... */ }

// MODIFICATO: Ora delega il parsing HTML all'offscreen document
async function fetchAndParseWithReadability(url) {
    try {
        const response = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw new Error(`HTTP error ${response.status} for ${url}`);
        const htmlContent = await response.text();
        
        await createOffscreenDocumentIfNeeded();
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => reject(new Error(`Timeout parsing HTML with Readability for: ${url}`)), 20000);
            // CORRETTO: Usa l'azione 'extractArticleWithReadability' che il tuo offscreen_parser si aspetta
            chrome.runtime.sendMessage({
                target: 'offscreen_document_rss_parser',
                action: "extractArticleWithReadability", 
                htmlContent: htmlContent,
                pageUrl: url
            }, (response) => {
                clearTimeout(timeoutId);
                if (chrome.runtime.lastError || !response) {
                    reject(new Error(chrome.runtime.lastError?.message || "Unknown error from offscreen document during HTML parsing."));
                } else {
                    resolve(response);
                }
            });
        });

    } catch (error) {
        console.error(`BG: (Readability) Error during fetch for ${url}:`, error);
        return { success: false, error: error.message };
    }
}

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

async function fetchAllFeedsInBackground(forceRefreshAll = false) {
    let subscriptions = {};
    let feedSubscriptionDates = {};

    if (!currentFirebaseUser) {
        return { success: true, newItemsCount: 0, newlyPromotedCount: 0 };
    }

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
        return { success: false, error: e };
    }

    const storageData = await chrome.storage.local.get([
        STORAGE_KEY_RSS_FEED_ITEMS_CACHE,
        STORAGE_KEY_LAST_FETCHED_TIMES,
    ]);

    let feedItemsCache = storageData[STORAGE_KEY_RSS_FEED_ITEMS_CACHE] || [];
    const lastFetchedTimes = storageData[STORAGE_KEY_LAST_FETCHED_TIMES] || {};

    const feedEntries = Object.entries(subscriptions);
    if (feedEntries.length === 0) {
        chrome.runtime.sendMessage({ command: 'feedsUpdated', payload: { feedItems: [], subscriptions: {}, newlyPromotedArticles: [] } }).catch(e => {});
        await updateExtensionBadge();
        return { success: true, newItemsCount: 0, newlyPromotedCount: 0 };
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
                        id: generateUUID(),
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
            const newArticleDocRef = doc(articlesRef, articleData.id);
            batch.set(newArticleDocRef, articleData);
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
        payload: { feedItems: feedItemsCache, subscriptions, newlyPromotedArticles: newlyPromotedArticlesForFirestore }
    }).catch(e => {});

    await updateExtensionBadge();
    return {
        success: true,
        newItemsCount: newRawItemsCount,
        newlyPromotedCount: newlyPromotedArticlesForFirestore.length
    };
}


// --- Event Listeners del Ciclo di Vita dell'Estensione ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === FETCH_ALARM_NAME) await fetchAllFeedsInBackground(false);
});

chrome.runtime.onInstalled.addListener(async (details) => {
    console.log(`BG: Estensione ${details.reason}. Creo allarme.`);
    await chrome.alarms.create(FETCH_ALARM_NAME, { delayInMinutes: 1, periodInMinutes: FETCH_INTERVAL_MINUTES });
    if (details.reason === "install" || details.reason === "update") {
        await fetchAllFeedsInBackground(true);
    }
});

chrome.runtime.onStartup.addListener(async () => {
    console.log("BG: Browser avviato. Fetch iniziale.");
    await fetchAllFeedsInBackground(true);
});

console.log("Background service worker (V3) caricato e in ascolto.");