import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

// popup.js (Refactored for Manifest V3 - Message Passing Architecture)

// --- Storage Keys ---
const MARKDOWN_DRAWER_STATE_KEY = 'popupMarkdownDrawerOpen';
const RSS_MANUAL_DRAWER_STATE_KEY = 'popupRssManualDrawerOpen';
const RSSHUB_RADAR_RULES_KEY = 'rsshubRadarRules';
const RSSHUB_RADAR_RULES_TIMESTAMP_KEY = 'rsshubRadarRulesTimestamp';

// --- RSSHub Config ---
const RSSHUB_INSTANCE_URL = 'https://rsshub.app';
const RSSHUB_RULES_SOURCE_URL = 'https://cdn.jsdelivr.net/gh/DIYgod/RSSHub-Radar@master/rules.js';

// --- Variabili di stato globali del popup ---
let currentUser = null;
let currentSubscriptions = {};

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

// --- Funzioni UI ---
function updateUIVisibility(isLoggedIn) {
    const authBlock = document.getElementById('auth-block');
    const controlsContainer = document.getElementById('controls-container');
    const saveReaderButton = document.getElementById('save-reader-button');

    if (isLoggedIn) {
        if (authBlock) authBlock.style.display = 'none';
        if (controlsContainer) controlsContainer.style.display = 'flex';
        if (saveReaderButton) saveReaderButton.disabled = false;
    } else {
        if (authBlock) authBlock.style.display = 'block';
        if (controlsContainer) controlsContainer.style.display = 'none';
        if (saveReaderButton) saveReaderButton.disabled = true;
        const pageTitleElement = document.getElementById('page-title');
        const pageUrlElement = document.getElementById('page-url');
        if (pageTitleElement) pageTitleElement.textContent = "Login Required";
        if (pageUrlElement) pageUrlElement.textContent = "Please log in to use features.";
    }
}

// --- Setup Popup ---
async function initializePopup(isLoggedIn) {
    updateUIVisibility(isLoggedIn);

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

    // Gestione stato drawers
    if (markdownDrawer && rssManualDrawer) {
        const result = await chrome.storage.local.get([MARKDOWN_DRAWER_STATE_KEY, RSS_MANUAL_DRAWER_STATE_KEY]);
        if (typeof result[MARKDOWN_DRAWER_STATE_KEY] === 'boolean') markdownDrawer.open = result[MARKDOWN_DRAWER_STATE_KEY];
        if (typeof result[RSS_MANUAL_DRAWER_STATE_KEY] === 'boolean') rssManualDrawer.open = result[RSS_MANUAL_DRAWER_STATE_KEY];
        markdownDrawer.addEventListener('toggle', () => chrome.storage.local.set({ [MARKDOWN_DRAWER_STATE_KEY]: markdownDrawer.open }));
        rssManualDrawer.addEventListener('toggle', () => chrome.storage.local.set({ [RSS_MANUAL_DRAWER_STATE_KEY]: rssManualDrawer.open }));
    }

    if (openManagerBtn) openManagerBtn.addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('reader/reader.html') }));

    if (addCustomFeedBtn && customFeedUrlInput) {
        addCustomFeedBtn.disabled = false;
        customFeedUrlInput.disabled = false;
        addCustomFeedBtn.addEventListener('click', () => {
            const feedUrl = customFeedUrlInput.value.trim();
            if (feedUrl) {
                handleManualFeedSubscription(feedUrl);
            } else {
                showToastNotification('Please enter a feed URL.', 'warning', 2500);
            }
        });
    }

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs || tabs.length === 0) {
            pageTitleElement.textContent = "No active tab";
            pageUrlElement.textContent = "Open a tab to get started.";
            markdownContentElement.value = '';
            markdownContentElement.placeholder = "No preview available.";
            markdownContentElement.readOnly = true;
            saveReaderButton.disabled = true;
            downloadMdButton.disabled = true;
            detectedRssOutsideDiv.innerHTML = '<p class="info">No active tab. RSS detection unavailable.</p>';
            return;
        }
        const tab = tabs[0];
        const title = tab.title || 'No Title';
        const url = tab.url;

        if (!url || !url.startsWith('http')) {
            pageTitleElement.textContent = title || "Unsupported Page";
            pageUrlElement.textContent = url || "Invalid URL";
            markdownContentElement.value = '';
            markdownContentElement.placeholder = "Preview not available for this page.";
            markdownContentElement.readOnly = true;
            saveReaderButton.disabled = true;
            downloadMdButton.disabled = true;
            detectedRssOutsideDiv.innerHTML = '<p class="info">Automatic RSS detection not available for this page type.</p>';
            return;
        }

        pageTitleElement.textContent = title;
        pageUrlElement.textContent = url;
        markdownContentElement.readOnly = false;
        saveReaderButton.disabled = !isLoggedIn;

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
            }
        } catch (scriptError) {
            console.warn("Failed to get full HTML (catch):", scriptError.message);
        }

        if (fullHtmlContent) {
            const turndownService = new TurndownService();
            turndownService.use(gfm);
            const markdownForDownload = turndownService.turndown(fullHtmlContent);

            markdownContentElement.value = `# ${title}\n\n**URL:** [${url}](${url})\n\n${markdownForDownload}`;
            downloadMdButton.disabled = false;
        } else {
            markdownContentElement.value = `# ${title}\n\n**URL:** [${url}](${url})\n\n${fullHtmlContent ? '_Markdown preview unavailable._' : '_Could not retrieve page content for preview._'}`;
            downloadMdButton.disabled = !fullHtmlContent;
            saveReaderButton.disabled = !fullHtmlContent || !isLoggedIn;
        }

        if (downloadMdButton) {
            downloadMdButton.addEventListener('click', () => {
                const blob = new Blob([markdownContentElement.value], { type: 'text/markdown;charset=utf-8' });
                const objectUrl = URL.createObjectURL(blob);
                chrome.downloads.download({
                    url: objectUrl,
                    filename: `${title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 100)}.md`,
                    saveAs: true
                }, () => URL.revokeObjectURL(objectUrl));
            });
        }
        
        if (saveReaderButton) {
            saveReaderButton.addEventListener('click', () => {
                if (!currentUser) {
                    showToastNotification("Please log in to save articles.", 'warning', 3000);
                    return;
                }
                saveReaderButton.disabled = true;
                saveReaderButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

                const articleData = {
                    title: title,
                    url: url,
                    content: markdownContentElement.value,
                    imageUrl: parsedFullHtmlDoc ? extractBestImage(parsedFullHtmlDoc, fullHtmlContent, url) : '',
                    source: 'manual',
                    id: generateUUID() // Genera un ID unico lato client
                };

                chrome.runtime.sendMessage({ command: 'saveArticle', payload: articleData }, (response) => {
                    if (response && response.success) {
                        showToastNotification(`"${articleData.title.substring(0,30)}..." ${response.operationType} to your articles!`, 'info', 2500);
                    } else {
                        const errorMsg = response ? response.error.message : "Unknown error";
                        console.error("Error saving article:", errorMsg);
                        showToastNotification(`Save error: ${errorMsg}`, 'error', 3000);
                    }
                    saveReaderButton.disabled = false;
                    saveReaderButton.innerHTML = '<i class="fas fa-bookmark"></i> Save';
                });
            });
        }
        await checkForRSSFeeds();
    } catch (error) {
        console.error("Popup error:", error);
        pageTitleElement.textContent = "Error";
        pageUrlElement.textContent = "Could not load data.";
        markdownContentElement.value = `ERROR: ${error.message}`;
        saveReaderButton.disabled = true;
        downloadMdButton.disabled = true;
        detectedRssOutsideDiv.innerHTML = '<p class="info error-text">Error loading feeds.</p>';
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
                button.addEventListener('click', (e) => {
                    const url = e.target.dataset.feedUrl;
                    const title = e.target.dataset.feedTitle;
                    subscribeTo(url, title, button);
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

function subscribeTo(feedUrl, feedTitle = '', buttonElement = null) {
    if (!feedUrl || !(feedUrl.startsWith('http://') || feedUrl.startsWith('https://'))) {
        showToastNotification("Invalid or non-HTTP(S) Feed URL.", 'error', 3000);
        return;
    }
    if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.textContent = '...';
    }

    const titleToSave = feedTitle || new URL(feedUrl).hostname;

    chrome.runtime.sendMessage({ command: 'subscribeToFeed', payload: { url: feedUrl, title: titleToSave } }, (response) => {
        if (response && response.success) {
            showToastNotification(`Subscribed to: ${titleToSave.substring(0,30)}...`, 'info', 2000);
            if (buttonElement) {
                buttonElement.textContent = 'Subscribed';
                const parentItem = buttonElement.closest('.rss-feed-item');
                if (parentItem) {
                    parentItem.classList.remove('new-to-subscribe');
                    const newTag = parentItem.querySelector('.new-feed-tag');
                    if (newTag) newTag.remove();
                }
            }
            // Aggiorna lo stato locale delle sottoscrizioni
            currentSubscriptions[feedUrl] = { title: titleToSave };
        } else {
            const errorMsg = response ? response.error.message : "Unknown error";
            showToastNotification(`Subscription error: ${errorMsg}`, 'error', 3000);
            if (buttonElement) {
                buttonElement.disabled = false;
                buttonElement.textContent = 'Subscribe';
            }
        }
    });
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

// --- Inizializzazione del Popup ---
document.addEventListener('DOMContentLoaded', () => {
    const openAuthPageBtn = document.getElementById('open-auth-page-btn');
    if (openAuthPageBtn) {
        openAuthPageBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') });
            window.close();
        });
    }

    console.log("POPUP DEBUG 1: DOMContentLoaded, sto per inviare il messaggio.");
    
    // 1. Chiedi al background lo stato di autenticazione e le sottoscrizioni
    chrome.runtime.sendMessage({ command: 'getInitialData' }, (response) => {
        // Rimuoviamo i log di debug o li commentiamo
        // console.log("POPUP DEBUG 2: Callback di sendMessage eseguita.");

        if (chrome.runtime.lastError) {
            console.error("POPUP ERRORE DI CONNESSIONE:", chrome.runtime.lastError.message);
            document.body.innerHTML = "<p style='color:red; padding: 20px;'>Error: Connection to background service failed. Please reload the extension.</p>";
            return;
        }

        // console.log("POPUP DEBUG 4: Risposta ricevuta dal background:", response); // Mantenuto per vedere la risposta completa

        if (response && response.success) {
            // La richiesta è andata a buon fine, ora controlliamo i dati
            const { isLoggedIn, user, subscriptions } = response.data;
            
            currentUser = user;
            currentSubscriptions = subscriptions || {};
            
            // Inizializziamo l'UI con lo stato corretto
            initializePopup(isLoggedIn); 
        } else {
            // Questo blocco ora gestisce solo errori imprevisti dal background
            console.error("POPUP ERRORE LOGICO:", response?.error);
            document.body.innerHTML = "<p style='color:red; padding: 20px;'>Error: Failed to load initial data from background.</p>";
        }
    });

    console.log("POPUP DEBUG 6: Messaggio inviato (l'esecuzione continua).");

    const port = chrome.runtime.connect({name: "readerPopupChannel"});
});