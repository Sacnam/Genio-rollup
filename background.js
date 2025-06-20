// background.js (Service Worker for Manifest V3 - SINTASSI COMPAT CORRETTA)

try {
    // USARE I FILE -compat.js
    importScripts(
        'libs/Readability.js',
        'libs/firebase/firebase-app-compat.js',
        'libs/firebase/firebase-auth-compat.js',
        'libs/firebase/firebase-firestore-compat.js'
    );
    console.log("BG: Script Firebase compat e Readability importati con successo.");
} catch (e) {
    console.error("BG: Errore import script:", e);
}

// --- Firebase Config ---
const firebaseConfig = {
    apiKey: "AIzaSyB733UNF8wJYRszdIw4H3XoS7Bmn7yvLig",
    authDomain: "genio-f9386.firebaseapp.com",
    projectId: "genio-f9386",
    storageBucket: "genio-f9386.firebasestorage.app",
    messagingSenderId: "759357192037",
    appId: "1:759357192037:web:b0004722e8f1d4c9e5138c",
    measurementId: "G-B18GK4VB1G"
};

let fbApp;
let fbAuth;
let fbDb;
let currentFirebaseUser = null;

try {
    // USARE LA SINTASSI COMPAT
    if (typeof firebase !== 'undefined') {
        if (!firebase.apps.length) {
            fbApp = firebase.initializeApp(firebaseConfig);
        } else {
            fbApp = firebase.app();
        }
        fbAuth = firebase.auth();
        fbDb = firebase.firestore();
        console.log("BG: Firebase initialized with compat syntax.");

        fbAuth.onAuthStateChanged(user => {
            if (user) {
                currentFirebaseUser = user;
                console.log("BG: Auth state changed, user UID:", user.uid);
                fetchAllFeedsInBackground(true);
            } else {
                currentFirebaseUser = null;
                console.log("BG: Auth state changed, no user.");
            }
        });
    } else {
        console.error("BG: Firebase SDK (compat) non caricato correttamente.");
    }
} catch (e) {
    console.error("BG: Errore inizializzazione Firebase:", e);
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
            if (currentFirebaseUser && fbDb) {
                const subsSnapshot = await fbDb.collection('users').doc(currentFirebaseUser.uid).collection('feedSubscriptions').get();
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
        if (currentFirebaseUser && fbDb) {
            try {
                const articlesRef = fbDb.collection('users').doc(currentFirebaseUser.uid).collection('savedArticles');
                const snapshot = await articlesRef.where('isRead', '==', false).where('source', '==', 'feed').get();
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
            if (e.message.includes("DOMParser is not defined")) {
                 console.warn("BG: DOMParser non disponibile per Readability. Sarebbe necessario l'offscreen document anche qui.");
                 return { success: false, error: "DOMParser not available for HTML parsing in Service Worker." };
            }
            throw e;
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

    if (currentFirebaseUser && fbDb) {
        try {
            const subsSnapshot = await fbDb.collection('users').doc(currentFirebaseUser.uid).collection('feedSubscriptions').get();
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
                if (currentFirebaseUser && fbDb && parsedItem.link && parsedItem.link !== '#') {
                    const articlesRef = fbDb.collection('users').doc(currentFirebaseUser.uid).collection('savedArticles');
                    const q = articlesRef.where("url", "==", parsedItem.link).limit(1);
                    const querySnapshot = await q.get();
                    isAlreadyProcessedInFirestore = !querySnapshot.empty;
                }

                if (isPostSubscription && !isAlreadyProcessedInFirestore && currentFirebaseUser && fbDb) {
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
                        dateAdded: firebase.firestore.FieldValue.serverTimestamp(),
                        pubDate: parsedItem.pubDate ? firebase.firestore.Timestamp.fromDate(new Date(parsedItem.pubDate)) : null,
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

    if (newlyPromotedArticlesForFirestore.length > 0 && currentFirebaseUser && fbDb) {
        const batch = fbDb.batch();
        const articlesRef = fbDb.collection('users').doc(currentFirebaseUser.uid).collection('savedArticles');
        for (const articleData of newlyPromotedArticlesForFirestore) {
            const newArticleDocRef = articlesRef.doc(generateUUID());
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

// Listener per messaggi
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        // NUOVO BLOCCO PER GESTIRE IL LOGIN
        if (request.type === 'auth_success') {
            console.log("BG: Ricevuto messaggio auth_success. Eseguo fetch forzato.");
            await fetchAllFeedsInBackground(true);
            sendResponse({status: "ok, user state updated"});
            return; // Fine del blocco auth
        }

        if (request.command === 'fetchAllFeeds') {
            try {
                const responseWithData = await fetchAllFeedsInBackground(request.forceRefresh);
                sendResponse({
                    success: responseWithData.success,
                    newItemsCount: responseWithData.newItemsCount,
                    newlyPromotedCount: responseWithData.newlyPromotedCount
                });
            } catch (error) {
                console.error("BG: Errore in fetchAllFeeds:", error);
                sendResponse({ success: false, error: error.message });
            }
        } else if (request.command === 'fetchWithReadability') {
            try {
                const result = await fetchAndParseWithReadability(request.url);
                sendResponse(result);
            } catch (error) {
                console.error("BG: Errore in fetchWithReadability:", error);
                sendResponse({ success: false, error: error.message });
            }
        } else if (request.command === 'feedSubscribed' || request.command === 'feedUnsubscribed' || request.command === 'feedRenamed') {
            await fetchAllFeedsInBackground(true);
            sendResponse({status: "ok"});
        } else if (request.command === 'updateBadgeCount' || request.command === 'showUnreadBadge') {
            await updateExtensionBadge();
            sendResponse({updated: true});
        } else if (request.command === "setExtensionBadge") {
            if (request.text !== undefined && request.color !== undefined) {
                await chrome.action.setBadgeText({ text: request.text });
                await chrome.action.setBadgeBackgroundColor({ color: request.color });
            }
            sendResponse({set: true});
        } else if (request.command === "clearReaderBadge") {
            await updateExtensionBadge();
            sendResponse({cleared: true});
        } else if (request.command === 'fetchSingleFeed') {
            const feedUrlToFetch = request.feedUrl;
            if (feedUrlToFetch) {
                try {
                    const response = await fetchAllFeedsInBackground(true);
                    sendResponse({success: response.success, newlyPromotedCount: response.newlyPromotedCount});
                } catch (error) {
                    console.error("BG: Errore in fetchSingleFeed:", error);
                    sendResponse({ success: false, error: error.message });
                }
            } else {
                sendResponse({ success: false, error: "No feedUrl provided for fetchSingleFeed" });
            }
        } else if (request.command === "pageFeedsStatusUpdate") {
            if (sender.tab && sender.tab.id && request.detectedFeeds !== undefined) {
                const sessionData = await chrome.storage.session.get(SESSION_KEY_ACTIVE_TAB_FEED_STATUS);
                let activeTabFeedStatus = sessionData[SESSION_KEY_ACTIVE_TAB_FEED_STATUS] || {};
                activeTabFeedStatus[sender.tab.id] = Array.isArray(request.detectedFeeds) ? request.detectedFeeds : [];
                await chrome.storage.session.set({ [SESSION_KEY_ACTIVE_TAB_FEED_STATUS]: activeTabFeedStatus });

                const currentTab = await chrome.storage.session.get(SESSION_KEY_CURRENT_ACTIVE_TAB_ID);
                if (sender.tab.id === currentTab[SESSION_KEY_CURRENT_ACTIVE_TAB_ID]) {
                    await updateExtensionBadge();
                }
            }
            sendResponse({ received: true });
        }
    })();
    return true; // Mantenere true per le risposte asincrone
});

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

    if (typeof Readability === 'undefined') {
        try { importScripts('libs/Readability.js'); } catch (e) { console.error("BG: Errore import Readability.js onInstalled:", e); }
    }

    if (details.reason === "install") {
        await chrome.storage.local.get([STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL, STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL], async (result) => {
            if (!result[STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL]) {
                await chrome.storage.local.set({ [STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL]: {} });
            }
            if (!result[STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL]) {
                await chrome.storage.local.set({ [STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL]: {} });
            }
        });
    }

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

    if (typeof Readability === 'undefined') {
        try { importScripts('libs/Readability.js'); } catch (e) { console.error("BG: Errore import Readability.js onStartup:", e); }
    }

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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "readerPopupChannel" || port.name === "readerPageChannel") {
    updateExtensionBadge().catch(e => console.warn("BG: Error updating badge onConnect:", e.message));
    port.onDisconnect.addListener(() => {
      updateExtensionBadge().catch(e => console.warn("BG: Error updating badge onDisconnect:", e.message));
    });
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

(async () => {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0) {
            const activeTabId = tabs[0].id;
            await chrome.storage.session.set({ [SESSION_KEY_CURRENT_ACTIVE_TAB_ID]: activeTabId });

            const sessionStatus = await chrome.storage.session.get(SESSION_KEY_ACTIVE_TAB_FEED_STATUS);
            let currentStatuses = sessionStatus[SESSION_KEY_ACTIVE_TAB_FEED_STATUS] || {};
            if (currentStatuses[activeTabId] === undefined) {
                currentStatuses[activeTabId] = [];
                await chrome.storage.session.set({ [SESSION_KEY_ACTIVE_TAB_FEED_STATUS]: currentStatuses });
            }
        }
        await updateExtensionBadge();
    } catch (e) {
        console.warn("BG: Error during initial tab state setup:", e.message);
    }
})();

console.log("Background service worker (V3) caricato e in ascolto.");