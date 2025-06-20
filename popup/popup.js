// popup.js (Sintassi compat, per funzionare con i file -compat.js)

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

// --- Storage Keys ---
const STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL = 'rssFeeds';
const STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL = 'feedSubscriptionDates';
const MARKDOWN_DRAWER_STATE_KEY = 'popupMarkdownDrawerOpen';
const RSS_MANUAL_DRAWER_STATE_KEY = 'popupRssManualDrawerOpen';
const RSSHUB_RADAR_RULES_KEY = 'rsshubRadarRules';
const RSSHUB_RADAR_RULES_TIMESTAMP_KEY = 'rsshubRadarRulesTimestamp';

// --- RSSHub Config ---
const RSSHUB_INSTANCE_URL = 'https://rsshub.app';
const RSSHUB_RULES_SOURCE_URL = 'https://cdn.jsdelivr.net/gh/DIYgod/RSSHub-Radar@master/rules.js';

// --- Funzione UUID ---
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


// --- Setup Authenticated Popup ---
async function setupAuthenticatedPopup() {
    const pageTitleElement = document.getElementById('page-title');
    const pageUrlElement = document.getElementById('page-url');
    const markdownContentElement = document.getElementById('markdown-content');
    const saveReaderButton = document.getElementById('save-reader-button');
    const downloadMdButton = document.getElementById('download-md-button');
    const openManagerBtn = document.getElementById('open-manager-btn');
    const markdownDrawer = document.getElementById('markdown-drawer');
    const detectedRssOutsideDiv = document.getElementById('detected-rss-outside');
    const rssManualDrawer = document.getElementById('rss-manual-drawer');
    const addCustomFeedBtn = document.getElementById('add-custom-feed');
    const customFeedUrlInput = document.getElementById('custom-feed-url');

    if (markdownDrawer && rssManualDrawer) {
        chrome.storage.local.get([MARKDOWN_DRAWER_STATE_KEY, RSS_MANUAL_DRAWER_STATE_KEY], (result) => {
            if (chrome.runtime.lastError) console.warn("Error getting drawer states:", chrome.runtime.lastError);
            else {
                if (typeof result[MARKDOWN_DRAWER_STATE_KEY] === 'boolean') markdownDrawer.open = result[MARKDOWN_DRAWER_STATE_KEY];
                if (typeof result[RSS_MANUAL_DRAWER_STATE_KEY] === 'boolean') rssManualDrawer.open = result[RSS_MANUAL_DRAWER_STATE_KEY];
            }
        });
        markdownDrawer.addEventListener('toggle', () => chrome.storage.local.set({ [MARKDOWN_DRAWER_STATE_KEY]: markdownDrawer.open }));
        rssManualDrawer.addEventListener('toggle', () => chrome.storage.local.set({ [RSS_MANUAL_DRAWER_STATE_KEY]: rssManualDrawer.open }));
    }

    if (openManagerBtn) openManagerBtn.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('reader/reader.html') }));

    if (addCustomFeedBtn && customFeedUrlInput) {
        addCustomFeedBtn.disabled = false; customFeedUrlInput.disabled = false;
        addCustomFeedBtn.addEventListener('click', async () => {
            const feedUrl = customFeedUrlInput.value.trim();
            if (feedUrl) await handleManualFeedSubscription(feedUrl);
            else showToastNotification('Please enter a feed URL.', 'warning', 2500);
        });
    }

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
            if (pageTitleElement) pageTitleElement.textContent = "No active tab";
            if (pageUrlElement) pageUrlElement.textContent = "Open a tab to get started.";
            if (markdownContentElement) { markdownContentElement.value = ''; markdownContentElement.placeholder = "No preview available."; markdownContentElement.readOnly = true; }
            if (saveReaderButton) saveReaderButton.disabled = true;
            if (downloadMdButton) downloadMdButton.disabled = true;
            if (detectedRssOutsideDiv) detectedRssOutsideDiv.innerHTML = '<p class="info">No active tab. RSS detection unavailable.</p>';
            return;
        }
        const tab = tabs[0];
        const title = tab.title || 'No Title';
        const url = tab.url;

        if (!url || !url.startsWith('http')) {
            if (pageTitleElement) pageTitleElement.textContent = title || "Unsupported Page";
            if (pageUrlElement) pageUrlElement.textContent = url || "Invalid URL";
            if (markdownContentElement) { markdownContentElement.value = ''; markdownContentElement.placeholder = "Preview not available for this page."; markdownContentElement.readOnly = true; }
            if (saveReaderButton) saveReaderButton.disabled = true;
            if (downloadMdButton) downloadMdButton.disabled = true;
            if (detectedRssOutsideDiv) detectedRssOutsideDiv.innerHTML = '<p class="info">Automatic RSS detection not available for this page type.</p>';
            return;
        }

        if (pageTitleElement) pageTitleElement.textContent = title;
        if (pageUrlElement) pageUrlElement.textContent = url;
        if (markdownContentElement) markdownContentElement.readOnly = false;
        
        if (saveReaderButton) saveReaderButton.disabled = !fbAuth.currentUser;


        let fullHtmlContent = '';
        let parsedFullHtmlDoc;
        try {
            const injectionResults = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => document.documentElement.outerHTML
            });
            if (injectionResults && injectionResults[0] && injectionResults[0].result) {
                fullHtmlContent = injectionResults[0].result;
                if (fullHtmlContent) parsedFullHtmlDoc = new DOMParser().parseFromString(fullHtmlContent, "text/html");
            } else {
                console.warn("Failed to get full HTML: No result from script execution.");
                fullHtmlContent = '';
            }
        } catch (scriptError) {
            console.warn("Failed to get full HTML (catch):", scriptError.message);
            fullHtmlContent = '';
        }


        if (fullHtmlContent && typeof convertHtmlToMarkdownGlobal === 'function') {
            const markdownForDownload = convertHtmlToMarkdownGlobal(fullHtmlContent, url);
            markdownContentElement.value = `# ${title}\n\n**URL:** [${url}](${url})\n\n${markdownForDownload}`;
            if (downloadMdButton) downloadMdButton.disabled = false;
        } else if (typeof convertHtmlToMarkdownGlobal !== 'function') {
            console.error("convertHtmlToMarkdownGlobal is not defined!");
            markdownContentElement.value = "Error: Conversion function missing.";
            if (downloadMdButton) downloadMdButton.disabled = true;
            if (saveReaderButton && fbAuth.currentUser) saveReaderButton.disabled = true;
        } else {
            markdownContentElement.value = `# ${title}\n\n**URL:** [${url}](${url})\n\n${fullHtmlContent ? '_Markdown preview unavailable._' : '_Could not retrieve page content for preview._'}`;
            if (downloadMdButton) downloadMdButton.disabled = !fullHtmlContent;
            if (saveReaderButton && fbAuth.currentUser) saveReaderButton.disabled = !fullHtmlContent;
        }


        if (downloadMdButton) {
            downloadMdButton.addEventListener('click', () => {
                const currentTitle = pageTitleElement.textContent;
                const contentForDownload = markdownContentElement.value;
                const safeTitle = currentTitle.replace(/[\\/:*?"<>|]/g, '_').substring(0, 100);
                let finalFilename = safeTitle + '.md';
                const blob = new Blob([contentForDownload], { type: 'text/markdown;charset=utf-8' });
                const objectUrl = URL.createObjectURL(blob);
                chrome.downloads.download({
                    url: objectUrl,
                    filename: finalFilename,
                    saveAs: true
                }, (downloadId) => {
                    if (chrome.runtime.lastError) showToastNotification(`Download error: ${chrome.runtime.lastError.message}`, 'error', 3000);
                    URL.revokeObjectURL(objectUrl);
                });
            });
        }
        if (saveReaderButton) {
            saveReaderButton.addEventListener('click', async () => {
                if (!fbAuth.currentUser) {
                    showToastNotification("Please log in to save articles.", 'warning', 3000);
                    return;
                }

                saveReaderButton.disabled = true; saveReaderButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
                const currentTitleForReader = pageTitleElement.textContent;
                const currentUrlForReader = pageUrlElement.textContent;
                let articleMarkdownContent = ''; let finalTitle = currentTitleForReader; let extractedImageUrl = '';

                if (markdownContentElement.value && markdownContentElement.value.length > (currentTitleForReader.length + currentUrlForReader.length + 20)) {
                    articleMarkdownContent = markdownContentElement.value;
                    finalTitle = currentTitleForReader;
                } else {
                    articleMarkdownContent = `# ${currentTitleForReader}\n\n**URL:** [${currentUrlForReader}](${currentUrlForReader})\n\n_(Content preview was not available.)_`;
                    finalTitle = currentTitleForReader;
                }
                extractedImageUrl = parsedFullHtmlDoc ? extractBestImage(parsedFullHtmlDoc, fullHtmlContent, currentUrlForReader) : '';


                if (!articleMarkdownContent.trim()) {
                    showToastNotification("No content to save.", 'warning', 2500);
                    saveReaderButton.disabled = false; saveReaderButton.innerHTML = '<i class="fas fa-bookmark"></i> Save'; return;
                }

                try {
                    const userId = fbAuth.currentUser.uid;
                    const articlesRef = fbDb.collection('users').doc(userId).collection('savedArticles');
                    const q = articlesRef.where("url", "==", currentUrlForReader).limit(1);
                    const querySnapshot = await q.get();

                    let operationType = '';
                    const articleData = {
                        title: finalTitle,
                        url: currentUrlForReader,
                        content: articleMarkdownContent,
                        imageUrl: extractedImageUrl,
                        isFavorite: false,
                        isReadLater: false,
                        isRead: false,
                        tags: [],
                        source: 'manual',
                    };

                    if (!querySnapshot.empty) {
                        const docId = querySnapshot.docs[0].id;
                        await articlesRef.doc(docId).update({
                            ...articleData,
                            dateAdded: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        operationType = 'updated';
                    } else {
                        const newArticleId = generateUUID();
                        await articlesRef.doc(newArticleId).set({
                            ...articleData,
                            id: newArticleId,
                            dateAdded: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        operationType = 'added';
                    }
                    showToastNotification(`"${finalTitle.substring(0,30)}..." ${operationType} to your synced articles!`, 'info', 2500);

                } catch (error) {
                    console.error("Error saving article to Firestore:", error);
                    showToastNotification('Save error: ' + error.message, 'error', 3000);
                }
                finally {
                    saveReaderButton.disabled = false; saveReaderButton.innerHTML = '<i class="fas fa-bookmark"></i> Save';
                }
            });
        }
        await checkForRSSFeeds();
    } catch (error) {
        console.error("Popup error (setupAuthenticatedPopup):", error);
        if (pageTitleElement) pageTitleElement.textContent = "Error";
        if (pageUrlElement) pageUrlElement.textContent = "Could not load data.";
        if (markdownContentElement) markdownContentElement.value = `ERROR: ${error.message}`;
        if (saveReaderButton) saveReaderButton.disabled = true;
        if (downloadMdButton) downloadMdButton.disabled = true;
        if (detectedRssOutsideDiv) detectedRssOutsideDiv.innerHTML = '<p class="info error-text">Error loading feeds.</p>';
    }
}

let toastTimeout;
function showToastNotification(message, type = 'success', duration = 2500) {
    let toast = document.getElementById('toast-notification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-notification';
        Object.assign(toast.style, {
            position: 'fixed', bottom: '-60px', left: '50%', transform: 'translateX(-50%)',
            padding: type === 'info' || type === 'success' ? '8px 15px' : '10px 20px',
            borderRadius: '5px', color: 'white',
            fontSize: type === 'info' || type === 'success' ? '0.8em' : '0.9em',
            fontWeight: '500', zIndex: '10000', opacity: '0',
            transition: 'opacity 0.25s ease-out, bottom 0.25s ease-out',
            boxShadow: '0 3px 8px rgba(0,0,0,0.15)', textAlign: 'center',
            minWidth: '180px', maxWidth: '85%'
        });
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    if (type === 'info') toast.style.backgroundColor = '#3498db';
    else if (type === 'success') toast.style.backgroundColor = '#2ecc71';
    else if (type === 'error') toast.style.backgroundColor = '#e74c3c';
    else if (type === 'warning') toast.style.backgroundColor = '#f39c12';
    else toast.style.backgroundColor = '#34495e';

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.bottom = '15px';
    });
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.bottom = '-60px';
    }, duration);
}

function extractBestImage(htmlDoc, articleHtmlContent, baseUrl) {
    let imageUrl = '';
    try {
        if (!htmlDoc && !articleHtmlContent) return '';
        const docToParse = htmlDoc || new DOMParser().parseFromString(articleHtmlContent || "", "text/html");

        const normalizeUrl = (urlCandidate) => {
            if (!urlCandidate) return '';
            try { return new URL(urlCandidate, baseUrl).href; }
            catch (e) { console.warn(`extractBestImage: Could not normalize URL "${urlCandidate}" with base "${baseUrl}"`, e); return ''; }
        };
        const isValidImage = (src, imgElement) => {
            if (!src || (src.startsWith('data:image') && !src.startsWith('data:image/svg+xml') && src.length < 1024 )) return false;
            if (imgElement) {
                const width = parseInt(imgElement.getAttribute('width') || imgElement.offsetWidth || '0');
                const height = parseInt(imgElement.getAttribute('height') || imgElement.offsetHeight || '0');
                if ((width > 0 && width < 100) || (height > 0 && height < 100)) return false;
            }
            return true;
        };

        const ogImage = docToParse.querySelector('meta[property="og:image"]');
        if (ogImage && ogImage.content) { imageUrl = normalizeUrl(ogImage.content); if (isValidImage(imageUrl)) return imageUrl; }
        const twitterImage = docToParse.querySelector('meta[name="twitter:image"]');
        if (twitterImage && twitterImage.content) { imageUrl = normalizeUrl(twitterImage.content); if (isValidImage(imageUrl)) return imageUrl; }

        const images = Array.from(docToParse.getElementsByTagName('img'));
        for (const img of images) { if (img.src) { imageUrl = normalizeUrl(img.src); if (isValidImage(imageUrl, img)) return imageUrl; } }

    } catch (e) { console.warn("Image extraction error:", e); }
    return '';
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "").replace(/'/g, "'");
}

const socialMediaHandlers = {
    'youtube.com': handleYoutubeUrl, 'x.com': handleTwitterUrl, 'twitter.com': handleTwitterUrl,
    'instagram.com': handleInstagramUrl, 'tiktok.com': handleTiktokUrl, 'bsky.app': handleBlueskyUrl,
    'weibo.com': handleWeiboUrl, 'bilibili.com': handleBilibiliUrl, 'zhihu.com': handleZhihuUrl,
    'threads.net': handleThreadsUrl
};
function handleYoutubeUrl(urlObject) {
    const pathname = urlObject.pathname;
    let match = pathname.match(/^\/(@[\w.-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/youtube/user/${match[1]}`;
    match = pathname.match(/^\/channel\/([\w-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/youtube/channel/${match[1]}`;
    match = pathname.match(/^\/user\/([\w-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/youtube/user/@${match[1]}`;
    if (pathname === '/playlist' && urlObject.searchParams.has('list')) return `${RSSHUB_INSTANCE_URL}/youtube/playlist/${urlObject.searchParams.get('list')}`;
    return null;
}
function handleTwitterUrl(urlObject) {
    const match = urlObject.pathname.match(/^\/([\w_]{1,15})(?:\/|$)/);
    if (match && match[1]) {
        const username = match[1];
        const systemPaths = ['home', 'explore', 'notifications', 'messages', 'search', 'i', 'settings', 'tos', 'privacy', 'intent', 'who_to_follow', 'connect_people', 'communities', 'jobs', 'compose', 'bookmarks'];
        if (!systemPaths.includes(username.toLowerCase()) && username.toLowerCase() !== 'hashtag' && username.toLowerCase() !== 'lists') {
            return `${RSSHUB_INSTANCE_URL}/twitter/user/${username}`;
        }
    }
    return null;
}
function handleInstagramUrl(urlObject) {
    const match = urlObject.pathname.match(/^\/([\w.]+)\/?(?:p\/|reels\/|stories\/)?/);
    if (match && match[1]) {
        const username = match[1];
        const systemPaths = ['explore', 'accounts', 'direct', 'reels', 'p', 'stories', 'guides', 'igtv'];
        if (!systemPaths.includes(username.toLowerCase()) && !username.includes('/') && username !== 'www') {
            return `${RSSHUB_INSTANCE_URL}/instagram/user/${username}`;
        }
    }
    return null;
}
function handleTiktokUrl(urlObject) {
    const match = urlObject.pathname.match(/^\/(@[\w.-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/tiktok/user/${match[1].substring(1)}`;
    return null;
}
function handleBlueskyUrl(urlObject) {
    let match = urlObject.pathname.match(/^\/profile\/([\w.-]+)\/feed\/([\w:]+)/);
    if (match && match[1] && match[2]) return `${RSSHUB_INSTANCE_URL}/bsky/profile/${match[1]}/feed/${match[2]}`;
    match = urlObject.pathname.match(/^\/profile\/([\w.-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/bsky/profile/${match[1]}`;
    return null;
}
function handleWeiboUrl(urlObject) {
    let match = urlObject.pathname.match(/^\/u\/(\d+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/weibo/user/${match[1]}`;
    match = urlObject.pathname.match(/^\/n\/([\S]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/weibo/user/${match[1]}`;
    match = urlObject.pathname.match(/^\/(\d+)$/);
    if (match && match[1] && urlObject.pathname.split('/').filter(p => p).length === 1) return `${RSSHUB_INSTANCE_URL}/weibo/user/${match[1]}`;
    return null;
}
function handleBilibiliUrl(urlObject) {
    let uid;
    if (urlObject.hostname === 'space.bilibili.com') {
        const matchSpace = urlObject.pathname.match(/^\/(\d+)/);
        if (matchSpace && matchSpace[1]) uid = matchSpace[1];
    } else if (urlObject.hostname === 'www.bilibili.com' || urlObject.hostname === 'bilibili.com') {
        const matchWwwUser = urlObject.pathname.match(/^\/(?:space\/)?(\d+)(?:\/(?:dynamic|video|audio|article|favlist))?/);
        if (matchWwwUser && matchWwwUser[1]) uid = matchWwwUser[1];
    }
    if (uid) return `${RSSHUB_INSTANCE_URL}/bilibili/user/video/${uid}`;
    const matchBangumi = urlObject.pathname.match(/^\/(?:bangumi\/media\/md(\d+)|play\/ss(\d+))/);
    if (matchBangumi) {
        const mediaId = matchBangumi[1] || matchBangumi[2];
        if (mediaId) return `${RSSHUB_INSTANCE_URL}/bilibili/bangumi/media/${mediaId}`;
    }
    return null;
}
function handleZhihuUrl(urlObject) {
    let match = urlObject.pathname.match(/^\/people\/([\w-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/zhihu/people/activities/${match[1]}`;
    match = urlObject.pathname.match(/^\/org\/([\w-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/zhihu/posts/org/${match[1]}`;
    match = urlObject.pathname.match(/^\/column\/([\w.-]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/zhihu/zhuanlan/${match[1]}`;
    match = urlObject.pathname.match(/^\/question\/(\d+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/zhihu/question/${match[1]}`;
    return null;
}
function handleThreadsUrl(urlObject) {
    const match = urlObject.pathname.match(/^\/(@[\w._]+)/);
    if (match && match[1]) return `${RSSHUB_INSTANCE_URL}/threads/${match[1].substring(1)}`;
    return null;
}

function attemptSocialMediaConversion(pageUrlString) {
    try {
        const urlObject = new URL(pageUrlString);
        const hostname = urlObject.hostname;
        for (const domainKey in socialMediaHandlers) {
            if (hostname.endsWith(domainKey) || hostname === domainKey) {
                const handler = socialMediaHandlers[domainKey];
                const rssHubUrl = handler(urlObject);
                if (rssHubUrl) {
                    return [{ title: `RSSHub: ${new URL(rssHubUrl).pathname.split('/')[1] || domainKey} (handled)`, url: rssHubUrl, type: 'rsshub-handled' }];
                }
            }
        }
    } catch (error) {
        console.warn("Popup (attemptSocialMediaConversion): Errore durante la conversione social:", error);
    }
    return [];
}

async function checkForRSSFeeds() {
    const detectedRssDiv = document.getElementById('detected-rss-outside');
    if (!detectedRssDiv) return;
    detectedRssDiv.innerHTML = '<p class="info">Searching for feeds on this page...</p>';
    let foundFeeds = [];

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs && tabs.length > 0) {
            const tab = tabs[0];
            if (tab.url && tab.url.startsWith('http')) {
                let standardFeedsFromPage = [];
                try {
                    const injectionResults = await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: () => {
                            return Array.from(document.querySelectorAll('link[rel="alternate"][type="application/rss+xml"], link[rel="alternate"][type="application/atom+xml"]'))
                                .map(link => {
                                    try { return { title: link.title || document.title || 'Untitled Feed', url: new URL(link.href, document.baseURI || document.URL).href }; }
                                    catch (e) { return null; }
                                }).filter(feed => feed !== null);
                        }
                    });
                    if (injectionResults && injectionResults[0] && injectionResults[0].result) {
                        standardFeedsFromPage = injectionResults[0].result;
                    }
                } catch (e) { console.warn("Error executing script for standard RSS feeds:", e.message); }

                if (standardFeedsFromPage && standardFeedsFromPage.length > 0) {
                    foundFeeds = standardFeedsFromPage.map(feed => ({ title: feed.title || tab.title, url: feed.url, type: 'standard' }));
                }

                let socialRssHubFeeds = attemptSocialMediaConversion(tab.url);
                if (socialRssHubFeeds.length > 0) {
                    foundFeeds = foundFeeds.concat(socialRssHubFeeds);
                } else {
                    const radarFeeds = await findRSSHubFeedsForUrl(tab.url);
                    foundFeeds = foundFeeds.concat(radarFeeds);
                }
            } else {
                 detectedRssDiv.innerHTML = '<p class="info">Automatic RSS detection not available for this page type.</p>'; return;
            }
        } else {
            detectedRssDiv.innerHTML = '<p class="info">No active tab for RSS detection.</p>'; return;
        }
    } catch (error) {
        console.warn("Error searching for RSS feeds:", error);
        detectedRssDiv.innerHTML = `<p class="info error-text">Error searching for feeds: ${escapeHtml(error.message)}</p>`; return;
    }

    const uniqueFeedsMap = new Map();
    foundFeeds.forEach(feed => { if (feed.url && !uniqueFeedsMap.has(feed.url)) uniqueFeedsMap.set(feed.url, feed); });
    const uniqueFeeds = Array.from(uniqueFeedsMap.values());

    if (uniqueFeeds.length > 0) {
        let currentSubscriptions = {};
        if (fbAuth.currentUser && fbDb) {
            try {
                const subsSnapshot = await fbDb.collection('users').doc(fbAuth.currentUser.uid).collection('feedSubscriptions').get();
                subsSnapshot.forEach(doc => {
                    const subData = doc.data();
                    if (subData.url) currentSubscriptions[subData.url] = { title: subData.title };
                });
            } catch (e) { console.warn("Popup: Errore caricamento sottoscrizioni da Firestore per UI:", e); }
        } else {
            const localSubsData = await chrome.storage.local.get(STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL);
            currentSubscriptions = localSubsData[STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL] || {};
        }

        detectedRssDiv.innerHTML = uniqueFeeds.map(feed => {
            const isSubscribed = !!currentSubscriptions[feed.url];
            const isNewToSubscribe = !isSubscribed;
            return `
            <div class="rss-feed-item ${isNewToSubscribe ? 'new-to-subscribe' : ''}">
                <span title="${escapeHtml(feed.title)} (${escapeHtml(feed.url)})">
                    ${(feed.type === 'rsshub' || feed.type === 'rsshub-handled') ? '<i class="fas fa-cogs rsshub-icon" title="RSSHub Feed"></i> ' : ''}
                    ${escapeHtml(feed.title)}
                    ${isNewToSubscribe ? '<span class="new-feed-tag">NEW</span>' : ''}
                </span>
                <button class="subscribe-btn" data-feed-url="${escapeHtml(feed.url)}" data-feed-title="${escapeHtml(feed.title)}" ${isSubscribed ? 'disabled' : ''}>
                    ${isSubscribed ? 'Subscribed' : 'Subscribe'}
                </button>
            </div>`;
        }).join('');

        detectedRssDiv.querySelectorAll('.subscribe-btn').forEach(button => {
            if (!button.disabled) {
                button.addEventListener('click', async (e) => {
                    const url = e.target.dataset.feedUrl;
                    const title = e.target.dataset.feedTitle;
                    button.disabled = true; button.textContent = '...';
                    try {
                        await subscribeTo(url, title);
                        button.textContent = 'Subscribed';
                        const parentItem = button.closest('.rss-feed-item');
                        if (parentItem) {
                            parentItem.classList.remove('new-to-subscribe');
                            const newTag = parentItem.querySelector('.new-feed-tag');
                            if (newTag) newTag.remove();
                        }
                    } catch (err) {
                        showToastNotification(`Subscription error: ${err.message}`, 'error', 3000);
                        button.disabled = false; button.textContent = 'Subscribe';
                    }
                });
            }
        });
    } else {
        detectedRssDiv.innerHTML = '<p class="info">No RSS feeds detected for this page.</p>';
    }

    try {
        chrome.runtime.sendMessage({ command: "pageFeedsStatusUpdate", detectedFeeds: uniqueFeeds.map(f => ({ url: f.url, title: f.title })) });
    } catch(e) { /* Ignore */ }
}

async function handleManualFeedSubscription(pageUrl) {
    const addCustomFeedBtn = document.getElementById('add-custom-feed');
    const customFeedUrlInput = document.getElementById('custom-feed-url');
    const originalButtonText = addCustomFeedBtn.textContent;
    addCustomFeedBtn.disabled = true;
    addCustomFeedBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

    try {
        if (!pageUrl.startsWith('http://') && !pageUrl.startsWith('https://')) throw new Error("Invalid URL. Must start with http:// or https://");
        new URL(pageUrl);

        const socialRssHubFeeds = attemptSocialMediaConversion(pageUrl);
        if (socialRssHubFeeds.length > 0) {
            const hubFeed = socialRssHubFeeds[0];
            showToastNotification(`Found via custom handler: ${hubFeed.title.substring(0,30)}...`, 'info', 1500);
            await subscribeTo(hubFeed.url, hubFeed.title);
            if(customFeedUrlInput) customFeedUrlInput.value = '';
            return;
        }

        let isDirectFeed = false;
        let feedTitleFromDirectCheck = new URL(pageUrl).hostname;
        try {
            showToastNotification(`Validating as direct feed: ${pageUrl.substring(0, 30)}...`, 'info', 1500);
            const response = await fetch(pageUrl, { mode: 'cors', signal: AbortSignal.timeout(10000) });
            if (response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && (contentType.includes('application/rss+xml') || contentType.includes('application/atom+xml') || contentType.includes('xml'))) {
                    isDirectFeed = true;
                } else {
                    const text = await response.text();
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(text.substring(0, 50000), "text/xml");
                    const errorNode = xmlDoc.querySelector('parsererror');
                    if (!errorNode && (xmlDoc.documentElement.nodeName.toLowerCase() === 'rss' || xmlDoc.documentElement.nodeName.toLowerCase() === 'feed')) {
                        isDirectFeed = true;
                        feedTitleFromDirectCheck = xmlDoc.querySelector('channel > title, feed > title')?.textContent?.trim() || feedTitleFromDirectCheck;
                    }
                }
            }
        } catch (e) { console.warn("Popup (handleManualFeedSubscription): Direct feed check failed:", e.message); }

        if (isDirectFeed) {
            showToastNotification(`Subscribing to direct feed...`, 'info', 1500);
            await subscribeTo(pageUrl, feedTitleFromDirectCheck);
            if(customFeedUrlInput) customFeedUrlInput.value = '';
            return;
        }

        showToastNotification(`Trying RSSHub Radar for ${pageUrl.substring(0,30)}...`, 'info', 2000);
        const rssHubFeedsFromRadar = await findRSSHubFeedsForUrl(pageUrl);

        if (rssHubFeedsFromRadar && rssHubFeedsFromRadar.length > 0) {
            const hubFeed = rssHubFeedsFromRadar[0];
            if (!hubFeed.url || !hubFeed.url.startsWith('https://')) throw new Error(`RSSHub Radar returned an invalid URL: ${hubFeed.url}`);
            showToastNotification(`Found via RSSHub Radar: ${hubFeed.title.substring(0,30)}...`, 'info', 1500);
            await subscribeTo(hubFeed.url, hubFeed.title);
            if(customFeedUrlInput) customFeedUrlInput.value = '';
            return;
        }

        throw new Error("Could not find or generate an RSS feed for this URL.");

    } catch (error) {
        console.error("Popup (handleManualFeedSubscription) error:", error);
        showToastNotification(`Error: ${error.message}`, 'error', 4000);
    } finally {
        addCustomFeedBtn.disabled = false;
        addCustomFeedBtn.textContent = originalButtonText;
    }
}

async function subscribeTo(feedUrl, feedTitle = '') {
    if (!feedUrl || !(feedUrl.startsWith('http://') || feedUrl.startsWith('https://'))) {
        console.error("Popup (subscribeTo): URL feed non valido o non HTTP(S):", feedUrl);
        throw new Error("Invalid or non-HTTP(S) Feed URL.");
    }

    const titleToSave = feedTitle || new URL(feedUrl).hostname;
    const subscriptionTimestamp = firebase.firestore.Timestamp.now();

    if (fbAuth.currentUser && fbDb) {
        const userId = fbAuth.currentUser.uid;
        const feedSubscriptionsRef = fbDb.collection('users').doc(userId).collection('feedSubscriptions');
        const docId = generateUUID();

        try {
            const q = feedSubscriptionsRef.where("url", "==", feedUrl).limit(1);
            const querySnapshot = await q.get();

            if (!querySnapshot.empty) {
                showToastNotification(`Already subscribed to ${titleToSave}.`, 'warning', 2500);
                return;
            }

            await feedSubscriptionsRef.doc(docId).set({
                url: feedUrl,
                title: titleToSave,
                subscribedAt: subscriptionTimestamp,
            });
            showToastNotification(`Subscribed to: ${titleToSave.substring(0,30)}... (Synced)`, 'info', 2000);
            chrome.runtime.sendMessage({ command: 'fetchSingleFeed', feedUrl: feedUrl });
        } catch (error) {
            console.error("Popup (subscribeTo Firestore): Error subscribing:", feedUrl, error);
            throw error;
        }
    } else {
        try {
            const storageData = await chrome.storage.local.get([STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL, STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL]);
            let rssFeeds = storageData[STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL] || {};
            let feedSubDates = storageData[STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL] || {};

            if (rssFeeds[feedUrl]) {
                showToastNotification(`Already subscribed to ${titleToSave}.`, 'warning', 2500);
                return;
            }
            rssFeeds[feedUrl] = { title: titleToSave, lastFetched: null };
            feedSubDates[feedUrl] = subscriptionTimestamp.toMillis();

            await chrome.storage.local.set({
                [STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL]: rssFeeds,
                [STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL]: feedSubDates
            });
            showToastNotification(`Subscribed to: ${titleToSave.substring(0,30)}... (Local)`, 'info', 2000);
            chrome.runtime.sendMessage({ command: 'feedSubscribed', feedUrl: feedUrl, subscriptionDate: subscriptionTimestamp.toMillis() });
            chrome.runtime.sendMessage({ command: 'fetchSingleFeed', feedUrl: feedUrl });
        } catch (error) {
            console.error("Popup (subscribeTo Local): Error subscribing:", feedUrl, error);
            throw error;
        }
    }
}

async function getRadarRules() {
    const result = await chrome.storage.local.get([RSSHUB_RADAR_RULES_KEY, RSSHUB_RADAR_RULES_TIMESTAMP_KEY]);
    if (result[RSSHUB_RADAR_RULES_KEY] && result[RSSHUB_RADAR_RULES_TIMESTAMP_KEY] && (Date.now() - result[RSSHUB_RADAR_RULES_TIMESTAMP_KEY] < (24 * 60 * 60 * 1000))) {
        return result[RSSHUB_RADAR_RULES_KEY];
    } else {
        try {
            const response = await fetch(RSSHUB_RULES_SOURCE_URL, { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP error fetching rules! Status: ${response.status}`);
            let rulesText = await response.text();
            rulesText = rulesText.replace(/^export\s+default\s*/, '').replace(/;\s*$/, '');
            const rules = (new Function(`return ${rulesText}`))();
            if (rules && typeof rules === 'object' && Object.keys(rules).length > 0) {
                await chrome.storage.local.set({ [RSSHUB_RADAR_RULES_KEY]: rules, [RSSHUB_RADAR_RULES_TIMESTAMP_KEY]: Date.now() });
                return rules;
            } else {
                console.error("Popup (getRadarRules): Formato regole RSSHub Radar non valido o vuoto.");
                return null;
            }
        } catch (error) {
            console.error('Popup (getRadarRules): Errore fetch/processamento regole RSSHub Radar:', error);
            return null;
        }
    }
}

async function findRSSHubFeedsForUrl(pageUrlString) {
    if (!pageUrlString || !(pageUrlString.startsWith('http://') || pageUrlString.startsWith('https://'))) return [];
    const allRules = await getRadarRules();
    if (!allRules) {
        console.warn("Popup (findRSSHubFeedsForUrl - RADAR): Impossibile caricare le regole RSSHub Radar globali.");
        return [];
    }
    let pageUrlObject;
    try { pageUrlObject = new URL(pageUrlString); }
    catch (e) { console.warn("Popup (findRSSHubFeedsForUrl - RADAR): Impossibile creare oggetto URL da:", pageUrlString, e); return []; }

    const originalHostname = pageUrlObject.hostname;
    const domainWithoutWww = originalHostname.replace(/^www\./, '');
    let domainRules = allRules[domainWithoutWww] || allRules[originalHostname];

    if (!domainRules) {
        const domainParts = domainWithoutWww.split('.');
        for (let i = 0; i < domainParts.length - 1; i++) {
            const higherLevelDomain = domainParts.slice(i).join('.');
            if (allRules[higherLevelDomain]) { domainRules = allRules[higherLevelDomain]; break; }
        }
    }
    if (!domainRules) return [];

    const feeds = [];
    const fullPathForMatch = pageUrlObject.pathname + pageUrlObject.search + pageUrlObject.hash;

    for (const ruleKey in domainRules) {
        const ruleDefinitions = Array.isArray(domainRules[ruleKey]) ? domainRules[ruleKey] : [domainRules[ruleKey]];
        for (const rule of ruleDefinitions) {
            if (!rule || !rule.target || !rule.source) continue;
            const ruleSources = Array.isArray(rule.source) ? rule.source : [String(rule.source)];
            for (const singleRuleSource of ruleSources) {
                let tempFeedPath = typeof rule.target === 'function' ? rule.target({}) : (typeof rule.target === 'string' ? rule.target : null);
                if (!tempFeedPath) continue;

                const paramRegex = /:(\w+)(\??)/g;
                let regexMatchResult;
                const paramsInRuleSource = [];
                let lastIndex = 0;
                const sourceParts = [];
                paramRegex.lastIndex = 0;
                while ((regexMatchResult = paramRegex.exec(singleRuleSource)) !== null) {
                    sourceParts.push(singleRuleSource.substring(lastIndex, regexMatchResult.index).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                    paramsInRuleSource.push({ name: regexMatchResult[1], optional: regexMatchResult[2] === '?' });
                    sourceParts.push(regexMatchResult[2] === '?' ? '([^/?#]*)' : '([^/?#]+)');
                    lastIndex = paramRegex.lastIndex;
                }
                sourceParts.push(singleRuleSource.substring(lastIndex).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
                let currentRegexStringForMatch = sourceParts.join('');
                currentRegexStringForMatch = currentRegexStringForMatch.replace(/\\\/\*$/, '(?:\\/.*)?');

                let ruleMatched = false; const paramValues = {};
                let finalRegexStr = "";
                try {
                    finalRegexStr = (singleRuleSource.startsWith('/') ? '^' : '^\\/') + currentRegexStringForMatch + '$';
                    if (currentRegexStringForMatch === "\\*") finalRegexStr = "^.*$";
                    else if (singleRuleSource === "" && rule.target) {
                         finalRegexStr = "^[/]?$";
                         if (fullPathForMatch === "" || fullPathForMatch === "/") ruleMatched = true;
                    }
                    if (!ruleMatched) {
                        const ruleRegex = new RegExp(finalRegexStr, 'i');
                        const urlPathMatch = fullPathForMatch.match(ruleRegex);
                        if (urlPathMatch) {
                            paramsInRuleSource.forEach((p, i) => { if (urlPathMatch[i + 1] !== undefined) paramValues[p.name] = decodeURIComponent(urlPathMatch[i + 1]); });
                            ruleMatched = true;
                        }
                    }
                } catch (e) { console.warn("Popup (findRSSHubFeedsForUrl - RADAR): Regex error:", singleRuleSource, "Regex:",finalRegexStr, e); continue; }

                if (ruleMatched) {
                    if (typeof rule.target === 'function') {
                        try { tempFeedPath = rule.target(paramValues, pageUrlObject, singleRuleSource); }
                        catch (e) { console.warn("Popup (findRSSHubFeedsForUrl - RADAR): Errore funzione target:", rule.title, e); continue; }
                    } else {
                        Object.keys(paramValues).forEach(paramName => { if (paramValues[paramName] !== undefined) tempFeedPath = tempFeedPath.replace(new RegExp(`:${paramName}\\??`, 'g'), paramValues[paramName]); });
                    }
                    tempFeedPath = tempFeedPath.replace(/:\w+\??/g, '').replace(/\/$/, '');
                    if (tempFeedPath && !tempFeedPath.includes(':')) {
                        const finalFeedUrl = `${RSSHUB_INSTANCE_URL}${tempFeedPath.startsWith('/') ? '' : '/'}${tempFeedPath}`;
                        if (finalFeedUrl.startsWith('https://') && !feeds.some(f => f.url === finalFeedUrl)) {
                            feeds.push({ title: rule.title || `RSSHub Radar: ${ruleKey}`, url: finalFeedUrl, type: 'rsshub' });
                        }
                    }
                }
            }
        }
    }
    return feeds;
}

document.addEventListener('DOMContentLoaded', () => {
    const authBlock = document.getElementById('auth-block');
    const controlsContainer = document.getElementById('controls-container');
    const openAuthPageBtn = document.getElementById('open-auth-page-btn');
    const saveReaderButton = document.getElementById('save-reader-button');

    try {
        if (typeof firebase === 'undefined' || !firebase.app) {
            throw new Error("Firebase global object not found. Scripts may not have loaded.");
        }
        if (!firebase.apps.length) {
            fbApp = firebase.initializeApp(firebaseConfig);
        } else {
            fbApp = firebase.app();
        }
        fbAuth = firebase.auth();
        fbDb = firebase.firestore();
    } catch (error) {
        console.error("CRITICAL (Popup): Error initializing Firebase:", error);
        if (authBlock) { authBlock.innerHTML = `<p style='color:red;'>Auth service error.</p>`; authBlock.style.display = 'block'; }
        if (controlsContainer) controlsContainer.style.display = 'none';
        if (saveReaderButton) saveReaderButton.disabled = true;
        return;
    }

    fbAuth.onAuthStateChanged(async (user) => {
        if (user) {
            if (authBlock) authBlock.style.display = 'none';
            if (controlsContainer) controlsContainer.style.display = 'flex';
            if (saveReaderButton) saveReaderButton.disabled = false;
            await setupAuthenticatedPopup();
        } else {
            if (authBlock) authBlock.style.display = 'block';
            if (controlsContainer) controlsContainer.style.display = 'none';
            if (saveReaderButton) saveReaderButton.disabled = true;
            const pageTitleElement = document.getElementById('page-title');
            const pageUrlElement = document.getElementById('page-url');
            if (pageTitleElement) pageTitleElement.textContent = "Login Required";
            if (pageUrlElement) pageUrlElement.textContent = "Please log in to use features.";
            await checkForRSSFeeds();
        }
    });

    if (openAuthPageBtn) {
        openAuthPageBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') });
            window.close(); // Chiude il popup immediatamente
        });
    }
    const port = chrome.runtime.connect({name: "readerPopupChannel"});
});