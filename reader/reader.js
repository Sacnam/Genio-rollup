// reader.js (Sintassi compat, per funzionare con i file -compat.js)
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded for reader.js started.");

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
    let fbFunctions;
    let currentFirebaseUser = null;
    let articlesListener = null;
    let feedSubscriptionsListener = null;

    try {
        if (typeof firebase !== 'undefined') {
            if (!firebase.apps.length) {
                fbApp = firebase.initializeApp(firebaseConfig);
            } else {
                fbApp = firebase.app();
            }
            fbAuth = firebase.auth();
            fbDb = firebase.firestore();
            if (typeof firebase.functions === 'function') {
                fbFunctions = firebase.functions();
            } else {
                console.warn("Reader.js: Firebase Functions SDK non sembra essere caricato/disponibile.");
            }
            console.log("Reader.js: Firebase initialized.");
        } else {
            console.error("Reader.js: Firebase SDK non caricato.");
            throw new Error("Firebase SDK not loaded");
        }
    } catch (e) {
        console.error("Reader.js: Errore inizializzazione Firebase:", e);
        const appElement = document.getElementById('app');
        if (appElement) appElement.innerHTML = `<p class="error-message" style="padding:20px; text-align:center;">Error initializing application services. Please try again later.</p>`;
        return;
    }

    // --- HELPER FUNCTIONS ---
    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return '';
        return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "").replace(/'/g, "'");
    }

    function getYouTubeVideoId(url) {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
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

    // --- APPLICATION STATE ---
    let allArticles = [];
    let allFeedItems = [];
    let displayedItems = [];

    let currentFilter = {
        type: 'page',
        value: 'homeAll'
    };
    let currentSort = {
        field: 'relevantDate',
        order: 'desc'
    };
    let currentReadingItem = null;
    let rssFeedsSubscriptions = {};
    let readingSettings = {
        fontSize: 16,
        theme: 'dark'
    };

    // --- STORAGE KEYS ---
    const STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL = 'rssFeeds';
    const STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL = 'feedSubscriptionDates';
    const STORAGE_KEY_RSS_FEED_ITEMS_CACHE = 'rssFeedItemsCache';
    const STORAGE_KEY_READER_MAIN_COL_WIDTH = 'readerMainColumnWidth';
    const STORAGE_KEY_READING_SETTINGS = 'readingSettings';
    const STORAGE_KEY_LAST_FILTER = 'readerLastFilterUnified';

    // --- UI ELEMENTS ---
    const app = document.getElementById('app');
    const hamburgerMenu = document.getElementById('hamburger-menu');
    const mainHeaderHamburgerBtn = document.getElementById('mainHeaderHamburgerBtn');
    const sidebarHeaderHamburgerBtn = document.getElementById('sidebarHeaderHamburgerBtn');
    const mainPagesList = document.getElementById('main-pages-list');
    const feedsSectionToggle = document.getElementById('feeds-section-toggle');
    const hamburgerFeedsListWrapper = document.getElementById('hamburger-feeds-list-wrapper');
    const hamburgerFeedsList = document.getElementById('hamburger-feeds-list');
    const quickNavHeader = document.getElementById('quick-nav-header');
    const readerMainContent = document.getElementById('reader-main-content');
    const readerContentWrapper = document.getElementById('reader-content-wrapper');
    const mainColumn = document.getElementById('main-column');
    const resizer = document.getElementById('resizer');
    const articlesContainer = document.getElementById('articlesContainer');
    const emptyStateMessage = document.querySelector('.empty-state-message');
    const searchInput = document.getElementById('searchInput');
    const sortFilterButton = document.getElementById('sortFilterButton');
    const readingPane = document.getElementById('reading-pane');
    const articleViewTitle = document.getElementById('articleViewTitle');
    const articleViewLink = document.getElementById('articleViewLink');
    const articleViewDate = document.getElementById('articleViewDate');
    const articleViewReadTime = document.getElementById('articleViewReadTime');
    const articleContent = document.getElementById('articleContent');
    const closeArticleBtn = document.getElementById('closeArticleBtn');
    const refreshArticleBtn = document.getElementById('refreshArticleBtn');
    const toggleAppearanceMenuBtn = document.getElementById('toggleAppearanceMenuBtn');
    const appearanceDropdown = document.getElementById('appearanceDropdown');
    const toggleFullscreenReaderBtn = document.getElementById('toggleFullscreenReader');
    const markAsFavoriteBtn = document.getElementById('markAsFavoriteBtn');
    const toggleReadLaterBtn = document.getElementById('toggleReadLaterBtn');
    const deleteArticleReaderBtn = document.getElementById('deleteArticleReaderBtn');
    const decreaseFontBtn = document.getElementById('decreaseFontBtn');
    const increaseFontBtn = document.getElementById('increaseFontBtn');
    const currentFontSizeLabel = document.getElementById('currentFontSizeLabel');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    let refreshFeedsUiButton;
    const rootStyles = document.documentElement ? getComputedStyle(document.documentElement) : {};
    const DEFAULT_READER_MAIN_COL_WIDTH = rootStyles.getPropertyValue ? (rootStyles.getPropertyValue('--main-column-default-basis').trim() || '35%') : '35%';

    // TTS Elements
    let ttsAudioElement = null;
    let ttsLoadingIndicator = null;
    let playSpeechBtn = null;


    if (!articlesContainer) console.error("Element articlesContainer NOT FOUND (reader.js)!");

    function applyTheme() {
        if (!document.documentElement || !themeToggleBtn) return;
        document.documentElement.setAttribute('data-theme', readingSettings.theme);
        const themeIcon = themeToggleBtn.querySelector('i');
        if (themeIcon) {
            themeIcon.className = readingSettings.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    async function loadInitialDataForUser() {
        if (!currentFirebaseUser || !fbDb) {
            allArticles = [];
            rssFeedsSubscriptions = {};
            if (articlesListener) { articlesListener(); articlesListener = null; }
            if (feedSubscriptionsListener) { feedSubscriptionsListener(); feedSubscriptionsListener = null; }
            renderHamburgerFeedsList(rssFeedsSubscriptions);
            filterAndSortItems();
            return;
        }

        if (articlesListener) articlesListener();
        const articlesRef = fbDb.collection('users').doc(currentFirebaseUser.uid).collection('savedArticles');
        articlesListener = articlesRef.orderBy("dateAdded", "desc").onSnapshot(snapshot => {
            const firestoreArticles = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                firestoreArticles.push({
                    ...data,
                    id: doc.id,
                    dateAdded: data.dateAdded && data.dateAdded.toDate ? data.dateAdded.toDate() : new Date(0),
                    pubDate: data.pubDate && data.pubDate.toDate ? data.pubDate.toDate() : null,
                    relevantDate: data.pubDate && data.pubDate.toDate ? data.pubDate.toDate() : (data.dateAdded && data.dateAdded.toDate ? data.dateAdded.toDate() : new Date(0)),
                    isFavorite: data.isFavorite || false,
                    isReadLater: data.isReadLater || false,
                    isRead: data.isRead || false,
                    tags: Array.isArray(data.tags) ? data.tags : [],
                    imageUrl: data.imageUrl || '',
                    excerpt: data.excerpt || '',
                    type: 'article',
                    source: data.source || 'manual'
                });
            });
            allArticles = firestoreArticles;
            filterAndSortItems();
            chrome.runtime.sendMessage({ command: 'updateBadgeCount' });
        }, error => {
            console.error("Error listening to saved articles:", error);
            allArticles = [];
            filterAndSortItems();
            if (articlesContainer) articlesContainer.innerHTML = `<p class="error-message">Error loading your articles: ${escapeHtml(error.message)}</p>`;
        });

        if (feedSubscriptionsListener) feedSubscriptionsListener();
        const feedSubsRef = fbDb.collection('users').doc(currentFirebaseUser.uid).collection('feedSubscriptions');
        feedSubscriptionsListener = feedSubsRef.orderBy("title", "asc").onSnapshot(snapshot => {
            const firestoreSubscriptions = {};
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.url) {
                    firestoreSubscriptions[data.url] = {
                        id: doc.id,
                        title: data.title || new URL(data.url).hostname,
                        url: data.url,
                        subscribedAt: data.subscribedAt && data.subscribedAt.toDate ? data.subscribedAt.toDate().getTime() : 0
                    };
                }
            });
            rssFeedsSubscriptions = firestoreSubscriptions;
            renderHamburgerFeedsList(rssFeedsSubscriptions);
            if (currentFilter.type === 'specificFeed' || (currentFilter.type === 'page' && currentFilter.value === 'newFeeds')) {
                filterAndSortItems();
            }
        }, error => {
            console.error("Error listening to feed subscriptions:", error);
            rssFeedsSubscriptions = {};
            renderHamburgerFeedsList(rssFeedsSubscriptions);
        });
    }


    async function loadCommonInitialData() {
        try {
            const result = await new Promise((resolve, reject) => {
                chrome.storage.local.get([
                    STORAGE_KEY_READING_SETTINGS,
                    STORAGE_KEY_READER_MAIN_COL_WIDTH, STORAGE_KEY_RSS_FEED_ITEMS_CACHE,
                    STORAGE_KEY_LAST_FILTER,
                    STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL,
                    STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL
                ], (data) => {
                    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                    resolve(data);
                });
            });

            allFeedItems = (result[STORAGE_KEY_RSS_FEED_ITEMS_CACHE] || []).map(item => ({
                ...item, type: 'feedItem', isRead: item.isRead || false,
                pubDate: item.pubDate ? new Date(item.pubDate) : new Date(0),
                description: item.description || '', fullContentHTML: item.fullContentHTML || '',
                contentFromReadability: item.contentFromReadability || ''
            }));

            if (!currentFirebaseUser) {
                const localSubs = result[STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL] || {};
                const localSubDates = result[STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL] || {};
                rssFeedsSubscriptions = {};
                for (const url in localSubs) {
                    rssFeedsSubscriptions[url] = {
                        id: url,
                        title: localSubs[url].title,
                        url: url,
                        subscribedAt: localSubDates[url] || 0
                    };
                }
            }

            if (result[STORAGE_KEY_READING_SETTINGS]) readingSettings = { ...readingSettings, ...result[STORAGE_KEY_READING_SETTINGS] };
            if (articleContent) articleContent.style.fontSize = `${readingSettings.fontSize}px`;
            if (currentFontSizeLabel) currentFontSizeLabel.textContent = `${readingSettings.fontSize}px`;
            applyTheme();

            const savedMainColWidth = result[STORAGE_KEY_READER_MAIN_COL_WIDTH] || DEFAULT_READER_MAIN_COL_WIDTH;
            if (mainColumn && readingPane) {
                if (readingPane.classList.contains('collapsed')) {
                    mainColumn.style.flexBasis = '100%';
                    if (readerContentWrapper) readerContentWrapper.classList.add('reading-pane-collapsed-wrapper');
                    if (articlesContainer) articlesContainer.classList.remove('main-column-narrowed');
                } else {
                    mainColumn.style.flexBasis = savedMainColWidth;
                    if (readerContentWrapper) readerContentWrapper.classList.remove('reading-pane-collapsed-wrapper');
                    if (articlesContainer) articlesContainer.classList.add('main-column-narrowed');
                }
            }
            currentFilter = result[STORAGE_KEY_LAST_FILTER] || { type: 'page', value: 'homeAll' };

            updateActiveHamburgerFilter();
            updateSortButtonIcon();
            renderHamburgerFeedsList(rssFeedsSubscriptions);

            chrome.runtime.sendMessage({ command: 'fetchAllFeeds', forceRefresh: false });
        } catch (error) {
            console.error("Error loading common data (reader.js):", error);
            if (articlesContainer) articlesContainer.innerHTML = `<p class="error-message">Error loading data: ${escapeHtml(error.message)}</p>`;
        }
    }

    fbAuth.onAuthStateChanged(async (user) => {
        const previousUser = currentFirebaseUser;
        currentFirebaseUser = user;

        if (user) {
            console.log("Reader.js: User is logged in - UID:", user.uid);
            if (!previousUser || previousUser.uid !== user.uid) {
                await loadInitialDataForUser();
            }
        } else {
            console.log("Reader.js: User is not logged in.");
            if (articlesListener) { articlesListener(); articlesListener = null; }
            if (feedSubscriptionsListener) { feedSubscriptionsListener(); feedSubscriptionsListener = null; }
            allArticles = [];
            rssFeedsSubscriptions = {};
            if (emptyStateMessage && articlesContainer) {
                articlesContainer.innerHTML = '';
                articlesContainer.style.display = 'none';
                emptyStateMessage.textContent = "Please log in to view and manage your saved articles and feeds.";
                emptyStateMessage.style.display = 'block';
            }
            if (readingPane && !readingPane.classList.contains('collapsed')) {
                closeReadingPane();
            }
            const localSubsData = await chrome.storage.local.get([STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL, STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL]);
            const localSubs = localSubsData[STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL] || {};
            const localSubDates = localSubsData[STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL] || {};
            rssFeedsSubscriptions = {};
            for (const url in localSubs) {
                rssFeedsSubscriptions[url] = { id: url, title: localSubs[url].title, url: url, subscribedAt: localSubDates[url] || 0 };
            }
            renderHamburgerFeedsList(rssFeedsSubscriptions);
        }
        await loadCommonInitialData();
        filterAndSortItems();
    });


    function toggleHamburgerMenu() {
        if (!hamburgerMenu || !readerMainContent) return;
        const isOpen = hamburgerMenu.classList.contains('open');
        const shouldBeOpen = !isOpen;

        hamburgerMenu.classList.toggle('open', shouldBeOpen);
        hamburgerMenu.classList.toggle('closed', !shouldBeOpen);

        if (mainHeaderHamburgerBtn) mainHeaderHamburgerBtn.style.display = shouldBeOpen ? 'none' : 'inline-flex';
        if (sidebarHeaderHamburgerBtn) sidebarHeaderHamburgerBtn.style.display = shouldBeOpen ? 'inline-flex' : 'none';

        const newMarginLeft = shouldBeOpen ? 'var(--hamburger-opened-width)' : '0';
        readerMainContent.style.marginLeft = newMarginLeft;
        readerMainContent.style.width = `calc(100% - ${newMarginLeft})`;


        if (mainColumn && readingPane && articlesContainer) {
            if (readingPane.classList.contains('collapsed')) { articlesContainer.classList.remove('main-column-narrowed'); }
            else { articlesContainer.classList.add('main-column-narrowed'); }
        }
    }


    function renderHamburgerFeedsList(subscriptionsToList) {
        if (!hamburgerFeedsList) return;
        const feedEntries = Object.values(subscriptionsToList);

        if (feedEntries.length === 0) {
            hamburgerFeedsList.innerHTML = '<li class="empty-nav-item">No subscriptions.</li>';
            return;
        }
        feedEntries.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

        hamburgerFeedsList.innerHTML = feedEntries.map(feed => `
            <li data-filter-type="specificFeed" data-filter-value="${escapeHtml(feed.url)}"
                data-feed-id="${escapeHtml(feed.id)}"
                class="${currentFilter.type === 'specificFeed' && currentFilter.value === feed.url ? 'active-filter' : ''}">
                <span class="feed-title-hamburger" title="View feed: ${escapeHtml(feed.title)}">${escapeHtml(feed.title)}</span>
                <div class="feed-actions-hamburger">
                    <button class="icon-btn edit-feed-name-btn" data-feed-url="${escapeHtml(feed.url)}" data-current-name="${escapeHtml(feed.title)}" title="Edit Name">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="icon-btn unsubscribe-feed-btn" data-feed-url="${escapeHtml(feed.url)}" title="Unsubscribe from ${escapeHtml(feed.title)}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </li>
        `).join('');
    }

    async function saveReadingSettings() {
        try {
            await new Promise((resolve, reject) => {
                chrome.storage.local.set({
                    [STORAGE_KEY_READING_SETTINGS]: readingSettings,
                }, () => { if (chrome.runtime.lastError) return reject(chrome.runtime.lastError); resolve(); });
            });
        } catch (error) { console.error("Error saving reading settings (reader.js):", error); }
    }

    async function saveFeedItemsCache() {
        try {
            const itemsToSave = allFeedItems.map(item => ({
                ...item,
                pubDate: item.pubDate instanceof Date ? item.pubDate.toISOString() : item.pubDate,
            }));
            await new Promise((resolve, reject) => {
                chrome.storage.local.set({ [STORAGE_KEY_RSS_FEED_ITEMS_CACHE]: itemsToSave },
                () => { if (chrome.runtime.lastError) return reject(chrome.runtime.lastError); resolve(); });
            });
        } catch (error) { console.error("Errore nel salvataggio cache storico feed:", error); }
    }


    async function saveLayoutData() {
        if (!mainColumn || !readingPane || readingPane.classList.contains('collapsed')) return;
        try {
            await new Promise((resolve, reject) => {
                chrome.storage.local.set({ [STORAGE_KEY_READER_MAIN_COL_WIDTH]: mainColumn.style.flexBasis || DEFAULT_READER_MAIN_COL_WIDTH },
                () => { if (chrome.runtime.lastError) return reject(chrome.runtime.lastError); resolve(); });
            });
        } catch (error) { console.error("Error saving layout data (reader.js):", error); }
    }

    function updateActiveHamburgerFilter() {
        if (mainPagesList) {
            mainPagesList.querySelectorAll('li').forEach(li => {
                const isActive = currentFilter.type === 'page' && li.dataset.filterValue === currentFilter.value;
                li.classList.toggle('active-filter', isActive);
            });
        }
        if (hamburgerFeedsList) {
            hamburgerFeedsList.querySelectorAll('li').forEach(li => {
                const isActive = currentFilter.type === 'specificFeed' && li.dataset.filterValue === currentFilter.value;
                li.classList.toggle('active-filter', isActive);
            });
        }
        if (quickNavHeader) {
            quickNavHeader.querySelectorAll('.quick-nav-btn').forEach(btn => {
                const isActive = currentFilter.type === 'page' && btn.dataset.filterValue === currentFilter.value;
                btn.classList.toggle('active-filter', isActive);
            });
        }

        if (refreshFeedsUiButton) {
            const isFeedRelatedView = currentFilter.type === 'specificFeed' ||
                                     (currentFilter.type === 'page' && ['homeAll', 'newFeeds'].includes(currentFilter.value));
            refreshFeedsUiButton.style.display = isFeedRelatedView ? 'inline-flex' : 'none';
        }
    }

    function filterAndSortItems() {
        if (!currentFirebaseUser && currentFilter.type !== 'specificFeed') {
            if (emptyStateMessage && articlesContainer) {
                articlesContainer.innerHTML = '';
                articlesContainer.style.display = 'none';
                emptyStateMessage.textContent = "Please log in to view and manage your saved articles and feeds.";
                emptyStateMessage.style.display = 'block';
                displayedItems = [];
            }
            return;
        }

        let tempItems = [];
        const searchTerm = (searchInput && searchInput.value) ? searchInput.value.trim().toLowerCase() : '';

        if (currentFilter.type === 'page' && currentFilter.value === 'homeAll') {
            if (currentSort.field !== 'relevantDate' && currentSort.field !== 'title') {
                currentSort.field = 'relevantDate'; currentSort.order = 'desc';
            }
        } else if (currentFilter.type === 'page' && currentFilter.value === 'newFeeds') {
            if (!['pubDate', 'title', 'feedTitle'].includes(currentSort.field)) {
                currentSort.field = 'pubDate'; currentSort.order = 'desc';
            }
        } else if (currentFilter.type === 'specificFeed') {
            if (!['pubDate', 'title'].includes(currentSort.field)) {
                currentSort.field = 'pubDate'; currentSort.order = 'desc';
            }
        } else {
            if (!['dateAdded', 'title'].includes(currentSort.field)) {
                 currentSort.field = 'dateAdded'; currentSort.order = 'desc';
            }
        }
        updateSortButtonIcon();

        try {
            if (currentFilter.type === 'page') {
                if (currentFilter.value === 'homeAll') {
                    tempItems = [...allArticles];
                } else if (currentFilter.value === 'newFeeds') {
                    tempItems = allArticles.filter(article => {
                        if (article.source !== 'feed') return false;
                        const subInfo = rssFeedsSubscriptions[article.feedUrl];
                        if (!subInfo || !subInfo.subscribedAt) {
                            return true;
                        }
                        const articlePubDate = article.pubDate ? new Date(article.pubDate).getTime() : 0;
                        return articlePubDate >= subInfo.subscribedAt;
                    });
                } else if (currentFilter.value === 'favorites') {
                    tempItems = allArticles.filter(a => a.isFavorite);
                } else if (currentFilter.value === 'readLater') {
                    tempItems = allArticles.filter(a => a.isReadLater);
                }

                if (searchTerm && tempItems.length > 0) {
                     tempItems = tempItems.filter(item =>
                        (item.title && item.title.toLowerCase().includes(searchTerm)) ||
                        (item.content && item.content.toLowerCase().includes(searchTerm)) ||
                        (item.url && item.url.toLowerCase().includes(searchTerm)) ||
                        (item.feedTitle && item.source === 'feed' && item.feedTitle.toLowerCase().includes(searchTerm)) ||
                        (item.excerpt && item.excerpt.toLowerCase().includes(searchTerm))
                    );
                }
            } else if (currentFilter.type === 'specificFeed') {
                tempItems = allFeedItems.filter(item => item.feedUrl === currentFilter.value);
                if (searchTerm) tempItems = tempItems.filter(item => (item.title && item.title.toLowerCase().includes(searchTerm)) || (item.feedTitle && item.feedTitle.toLowerCase().includes(searchTerm)) || (item.description && item.description.toLowerCase().includes(searchTerm)));
            }
        } catch (e) {
            console.error("ERRORE durante il filtraggio:", e);
        }

        sortItems(tempItems);
        displayedItems = tempItems;
        renderItems();
        chrome.storage.local.set({ [STORAGE_KEY_LAST_FILTER]: currentFilter });
    }

    function sortItems(items) {
        items.sort((a, b) => {
            let valA, valB;
            const field = currentSort.field;

            if (field === 'relevantDate') {
                valA = a.relevantDate ? new Date(a.relevantDate).getTime() : 0;
                valB = b.relevantDate ? new Date(b.relevantDate).getTime() : 0;
            } else if (field === 'pubDate') {
                valA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
                valB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
            } else if (field === 'dateAdded') {
                valA = a.dateAdded ? new Date(a.dateAdded).getTime() : 0;
                valB = b.dateAdded ? new Date(b.dateAdded).getTime() : 0;
            } else {
                valA = String(a[field] || '').toLowerCase();
                valB = String(b[field] || '').toLowerCase();
            }

            let comparison = 0;
            if (valA > valB) comparison = 1;
            else if (valA < valB) comparison = -1;
            return currentSort.order === 'desc' ? comparison * -1 : comparison;
        });
    }

    function updateSortButtonIcon() {
        if (!sortFilterButton) return; const icon = sortFilterButton.querySelector('i'); if (!icon) return;
        sortFilterButton.style.display = 'inline-flex'; let title = 'Sort';
        const field = currentSort.field;
        const order = currentSort.order;

        if (field === 'relevantDate' || field === 'pubDate' || field === 'dateAdded') {
            icon.className = order === 'desc' ? 'fas fa-sort-amount-down-alt' : 'fas fa-sort-amount-up-alt';
            title = `Sort by Date (${order === 'desc' ? 'Newest' : 'Oldest'} First)`;
        } else if (field === 'title') {
            icon.className = order === 'asc' ? 'fas fa-sort-alpha-down' : 'fas fa-sort-alpha-up';
            title = `Sort by Title (${order === 'asc' ? 'A-Z' : 'Z-A'})`;
        } else if (field === 'feedTitle') {
            icon.className = order === 'asc' ? 'fas fa-sort-alpha-down' : 'fas fa-sort-alpha-up';
            title = `Sort by Feed Title (${order === 'asc' ? 'A-Z' : 'Z-A'})`;
        } else { icon.className = 'fas fa-filter'; }
        sortFilterButton.title = title;
    }

    function renderItems() {
        if (!articlesContainer || !emptyStateMessage) {
            console.error("renderItems: articlesContainer or emptyStateMessage not found!");
            return;
        }
        if (!currentFirebaseUser && currentFilter.type !== 'specificFeed') {
             filterAndSortItems();
             return;
        }

        const isArticleBasedView = (currentFilter.type === 'page' && ['homeAll', 'newFeeds', 'readLater', 'favorites'].includes(currentFilter.value));
        const isSpecificFeedView = currentFilter.type === 'specificFeed';

        if (displayedItems.length === 0) {
            let message = "No items to display.";
            if (currentFilter.type === 'page') {
                if (currentFilter.value === 'homeAll') message = "Your home is empty. Subscribe to feeds or save articles!";
                else if (currentFilter.value === 'newFeeds') message = "No new items from your feeds. Try refreshing or subscribe to more feeds!";
                else if (currentFilter.value === 'favorites') message = "No favorite articles.";
                else if (currentFilter.value === 'readLater') message = "Your 'Read Later' list is empty.";
            } else if (isSpecificFeedView) {
                 message = "No items from this feed. Try refreshing.";
            }
            if (searchInput && searchInput.value.trim()) message = "No results for your search.";
            emptyStateMessage.textContent = message; emptyStateMessage.style.display = 'block';
            articlesContainer.innerHTML = ''; articlesContainer.style.display = 'none';
        } else {
            emptyStateMessage.style.display = 'none'; articlesContainer.style.display = 'grid';
            if (isArticleBasedView) renderArticleList();
            else if (isSpecificFeedView) renderFeedItemList();
            else articlesContainer.innerHTML = '';
        }
        updateActiveCardState();
    }

    function renderArticleList() {
        if (!articlesContainer) return;
        articlesContainer.innerHTML = displayedItems.map((article, index) => {
            if (article.type !== 'article') {
                return '';
            }
            const domain = article.url ? new URL(article.url).hostname.replace('www.', '') : (article.feedTitle || 'Saved Item');

            let imageUrl = article.imageUrl || '';
            let imagePlaceholderIcon = article.source === 'feed' ? 'fas fa-rss' : 'fas fa-archive';
            const isVideo = article.url && (article.url.includes('youtube.com') || article.url.includes('youtu.be'));

            if (isVideo) {
                imagePlaceholderIcon = 'fas fa-play-circle';
                const videoId = getYouTubeVideoId(article.url);
                if (videoId && !imageUrl) {
                    imageUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
                }
            }

            const imagePlaceholder = `<div class="article-card-image-placeholder"><i class="${imagePlaceholderIcon}"></i></div>`;
            let imageElementContent = imageUrl ?
                `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(article.title)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"/><div class="article-card-image-placeholder" style="display:none;"><i class="fas fa-image"></i></div>` :
                imagePlaceholder;

            let articleExcerpt = article.excerpt || "";
            if (isVideo && (articleExcerpt.toLowerCase().includes("contenut") || articleExcerpt.toLowerCase().includes("blocked content") || articleExcerpt.length < 20)) {
                articleExcerpt = "Video content. Click to view.";
            } else if (!isVideo && articleExcerpt.length === 0 && article.content && typeof article.content === 'string' && article.content.length > 20) {
                 articleExcerpt = article.content.replace(/<[^>]+>/g, '').substring(0, 150) + "...";
            } else if (articleExcerpt.length === 0) {
                articleExcerpt = "No excerpt available.";
            }


            const dateDisplay = article.pubDate ? new Date(article.pubDate).toLocaleDateString() : (article.dateAdded ? new Date(article.dateAdded).toLocaleDateString() : '');

            let readTimeMinutes = 0;
            if (isVideo) {
                readTimeMinutes = 1;
            } else {
                const readTimeSource = article.content || article.textContent || "";
                const words = typeof readTimeSource === 'string' ? readTimeSource.split(/\s+/).length : 0;
                readTimeMinutes = Math.ceil(words / 200);
            }
            const readTimeString = readTimeMinutes > 0 ? `${readTimeMinutes} min read` : '';
            const isUnreadArticleFromFeed = article.source === 'feed' && !article.isRead;

            return `
                <div class="article-card vertical-layout ${isUnreadArticleFromFeed ? 'unread-feed-article' : ''} ${isVideo ? 'video-type' : ''} ${currentReadingItem && currentReadingItem.id === article.id && readingPane && !readingPane.classList.contains('collapsed') ? 'active' : ''}"
                     data-item-id="${escapeHtml(article.id)}" data-item-type="article" data-index="${index}">
                    <div class="card-image-top">${imageElementContent}</div>
                    <div class="card-content-wrapper">
                        <div class="card-title-actions-row">
                            <h3 class="article-card-title" title="${escapeHtml(article.title)}">
                                ${escapeHtml(article.title)}
                            </h3>
                            <div class="card-actions-horizontal">
                                <button class="icon-btn card-action-favorite ${article.isFavorite ? 'active' : ''}" data-action="toggle-favorite" title="${article.isFavorite ? 'Unfavorite' : 'Favorite'}"><i class="${article.isFavorite ? 'fas fa-star' : 'far fa-star'}"></i></button>
                                <button class="icon-btn card-action-read-later ${article.isReadLater ? 'active' : ''}" data-action="toggle-read-later-card" title="${article.isReadLater ? 'Remove from Read Later' : 'Add to Read Later'}"><i class="${article.isReadLater ? 'fas fa-bookmark' : 'far fa-bookmark'}"></i></button>
                                <button class="icon-btn card-action-delete" data-action="delete" title="Delete"><i class="fas fa-trash-alt"></i></button>
                            </div>
                        </div>
                        ${articleExcerpt ? `<p class="article-card-excerpt" title="${escapeHtml(articleExcerpt)}">${escapeHtml(articleExcerpt)}</p>` : ''}
                        <div class="article-card-meta-bottom">
                            <span class="article-card-url-display" title="${escapeHtml(domain)}">${escapeHtml(domain)}</span>
                            ${readTimeString ? `<span class="article-card-read-time">${escapeHtml(readTimeString)}</span>` : ''}
                            <span class="article-card-date-added">${dateDisplay}</span>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }

    function renderFeedItemList() {
        if (!articlesContainer) return;
        articlesContainer.innerHTML = displayedItems.map((item, index) => {
            if (item.type !== 'feedItem') return '';
            const title = item.title || 'No Title';
            const feedTitle = item.feedTitle || 'Unknown Feed';
            const date = item.pubDate ? new Date(item.pubDate).toLocaleDateString() : 'No Date';
            let description = item.description || item.summary || '';
            if (description) { const tempDiv = document.createElement('div'); tempDiv.innerHTML = description; description = (tempDiv.textContent || tempDiv.innerText || "").substring(0, 150) + "..."; }
            else { description = "No summary available."; }
            const isUnread = !item.isRead;
            return `
                <div class="article-card detailed-card feed-item-card ${isUnread ? 'unread' : 'read'} ${currentReadingItem && currentReadingItem.id === item.id && readingPane && !readingPane.classList.contains('collapsed') ? 'active' : ''}"
                     data-item-id="${escapeHtml(item.id)}" data-item-type="feedItem" data-index="${index}">
                    <div class="article-card-content">
                         <h3 class="article-card-title">
                            ${escapeHtml(title)}
                        </h3>
                        <p class="article-card-excerpt">${escapeHtml(description)}</p>
                        <div class="article-card-meta">
                            <span class="article-card-domain" title="Source: ${escapeHtml(feedTitle)}">${escapeHtml(feedTitle)}</span>
                            <span class="article-card-date">${escapeHtml(date)}</span>
                            <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="icon-btn feed-item-external-link" title="Open original in new tab" data-action="open-external">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                        </div>
                    </div>
                </div>`;
        }).join('');
    }


    async function showArticleUI(itemData, forceRefreshContent = false) {
        if (!readingPane || !articleViewTitle || !articleContent || !articleViewLink) return Promise.resolve();
        if (itemData.type === 'article' && !currentFirebaseUser) {
            articleContent.innerHTML = '<p>Please log in to view this article.</p>';
            if (playSpeechBtn) playSpeechBtn.style.display = 'none';
            return Promise.resolve();
        }

        currentReadingItem = itemData; openArticleView();
        articleViewTitle.textContent = itemData.title || 'No Title';
        const itemUrl = itemData.url || itemData.link || '#';
        const youtubeVideoId = getYouTubeVideoId(itemUrl);
        articleViewLink.href = itemUrl;
        articleViewLink.textContent = youtubeVideoId ? 'Watch on YouTube' : (itemUrl !== '#' ? 'Read Original' : 'No Link');

        let dateToDisplayStr = '';
        if (itemData.type === 'article') {
            dateToDisplayStr = itemData.pubDate ? new Date(itemData.pubDate).toLocaleString() : (itemData.dateAdded ? new Date(itemData.dateAdded).toLocaleString() : '');
        } else if (itemData.type === 'feedItem' && itemData.pubDate) {
            dateToDisplayStr = new Date(itemData.pubDate).toLocaleString();
        }
        articleViewDate.textContent = dateToDisplayStr;

        let textContentForReadTime = "";
        if (itemData.type === 'article') {
            textContentForReadTime = itemData.content || "";
        } else if (itemData.type === 'feedItem') {
            textContentForReadTime = itemData.description || itemData.summary || itemData.fullContentHTML || "";
        }

        let readTimeMinutes = 0;
        if (youtubeVideoId) {
            readTimeMinutes = 1;
        } else {
            const words = typeof textContentForReadTime === 'string' ? textContentForReadTime.split(/\s+/).length : 0;
            readTimeMinutes = Math.ceil(words / 200);
        }
        articleViewReadTime.textContent = readTimeMinutes > 0 ? `${readTimeMinutes} min read` : '';


        const oldLoadBtn = document.getElementById('dynamicLoadFullContentBtn');
        if (oldLoadBtn) oldLoadBtn.remove();
        articleContent.innerHTML = ''; let contentDisplayed = false;

        const loadFullContentUtility = async (url, targetItem) => {
            articleContent.innerHTML = '<p>Loading full content...</p>';
            try {
                const readabilityResult = await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({ command: 'fetchWithReadability', url: url }, response => {
                        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                        if (response && response.success && response.article) resolve(response.article);
                        else reject(new Error(response ? response.error : 'Unknown error fetching with Readability'));
                    });
                });
                if (readabilityResult && readabilityResult.content) {
                    articleContent.innerHTML = readabilityResult.content;
                    if (targetItem.type === 'feedItem') {
                        const originalFeedItemIndex = allFeedItems.findIndex(fi => fi.id === targetItem.id);
                        if (originalFeedItemIndex !== -1) {
                            allFeedItems[originalFeedItemIndex].contentFromReadability = readabilityResult.content;
                            targetItem.contentFromReadability = readabilityResult.content;
                            await saveFeedItemsCache();
                        }
                    } else if (targetItem.type === 'article' && currentFirebaseUser && fbDb) {
                         const articleRef = fbDb.collection('users').doc(currentFirebaseUser.uid).collection('savedArticles').doc(targetItem.id);
                         await articleRef.update({ content: readabilityResult.content });
                    }
                } else {
                    let fallbackContent = '';
                    if (targetItem.type === 'article') fallbackContent = targetItem.content || '';
                    else if (targetItem.type === 'feedItem') fallbackContent = targetItem.fullContentHTML || targetItem.description || '';
                    articleContent.innerHTML = `<p><i>Could not load full content. Error: ${readabilityResult.error || 'Unknown'}</i></p><br>${fallbackContent}`;
                }
            } catch (error) {
                console.error("Error loading full content:", error);
                let fallbackContent = '';
                if (targetItem.type === 'article') fallbackContent = targetItem.content || '';
                else if (targetItem.type === 'feedItem') fallbackContent = targetItem.fullContentHTML || targetItem.description || '';
                articleContent.innerHTML = `<p><i>Error loading full content: ${escapeHtml(error.message)}.</i></p><br>${fallbackContent}`;
            }
        };


        if (youtubeVideoId) {
            articleContent.innerHTML = `<div class="youtube-video-container"><iframe src="https://www.youtube-nocookie.com/embed/${youtubeVideoId}?rel=0&modestbranding=1&autoplay=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
            contentDisplayed = true;
        } else if (forceRefreshContent && itemUrl && itemUrl !== '#') {
            await loadFullContentUtility(itemUrl, itemData);
            contentDisplayed = true;
        } else if (itemData.type === 'article' && itemData.content) {
            if (itemData.source === 'manual' && typeof marked?.parse === 'function' && !itemData.content.trim().startsWith('<')) {
                 articleContent.innerHTML = marked.parse(itemData.content);
            } else {
                 articleContent.innerHTML = itemData.content;
            }
            contentDisplayed = true;
        } else if (itemData.type === 'feedItem') {
            if (itemData.contentFromReadability) { articleContent.innerHTML = itemData.contentFromReadability; contentDisplayed = true; }
            else if (itemData.fullContentHTML) { articleContent.innerHTML = itemData.fullContentHTML; contentDisplayed = true; }
            else if (itemData.description) {
                const tempDiv = document.createElement('div'); tempDiv.innerHTML = itemData.description;
                if (tempDiv.children.length > 0 || tempDiv.innerHTML.match(/<[a-z][\s\S]*>/i)) { articleContent.innerHTML = itemData.description; }
                else { articleContent.innerHTML = `<p>${escapeHtml(itemData.description)}</p>`; }
                contentDisplayed = true;
            }

            if (itemUrl && itemUrl !== '#' && !itemData.contentFromReadability) {
                const loadButton = document.createElement('button'); loadButton.id = 'dynamicLoadFullContentBtn';
                loadButton.className = 'action-btn'; loadButton.textContent = 'Load Full Content';
                loadButton.style.margin = '15px auto'; loadButton.style.display = 'block';
                loadButton.onclick = async () => {
                    loadButton.remove();
                    await loadFullContentUtility(itemUrl, itemData);
                };
                if (articleContent.firstChild) articleContent.insertBefore(loadButton, articleContent.firstChild);
                else articleContent.appendChild(loadButton);
            }
        }

        if (!contentDisplayed && !forceRefreshContent) articleContent.innerHTML = '<p>Content not available.</p>';

        if (itemData.type === 'article') {
            markAsFavoriteBtn.style.display = 'inline-flex'; toggleReadLaterBtn.style.display = 'inline-flex'; deleteArticleReaderBtn.style.display = 'inline-flex';
            markAsFavoriteBtn.classList.toggle('active', !!itemData.isFavorite);
            const favIcon = markAsFavoriteBtn.querySelector('i'); if (favIcon) favIcon.className = itemData.isFavorite ? 'fas fa-star' : 'far fa-star';
            markAsFavoriteBtn.title = itemData.isFavorite ? 'Remove Favorite' : 'Add to Favorites';
            toggleReadLaterBtn.classList.toggle('active', !!itemData.isReadLater);
            const readLaterIcon = toggleReadLaterBtn.querySelector('i'); if (readLaterIcon) readLaterIcon.className = itemData.isReadLater ? 'fas fa-bookmark' : 'far fa-bookmark';
            toggleReadLaterBtn.title = itemData.isReadLater ? 'Remove from Read Later' : 'Add to Read Later';
        } else {
            markAsFavoriteBtn.style.display = 'none'; toggleReadLaterBtn.style.display = 'none'; deleteArticleReaderBtn.style.display = 'none';
        }

        if (playSpeechBtn) {
            const hasReadableContent = (itemData.type === 'article' && itemData.content) ||
                                   (itemData.type === 'feedItem' && (itemData.contentFromReadability || itemData.fullContentHTML || itemData.description));
            playSpeechBtn.style.display = hasReadableContent && !youtubeVideoId ? 'inline-flex' : 'none';
            if (ttsAudioElement && !ttsAudioElement.paused) {
                ttsAudioElement.pause();
                playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                playSpeechBtn.title = 'Read Aloud';
            }
        }


        if (!itemData.isRead && !forceRefreshContent) {
            if (itemData.type === 'article' && currentFirebaseUser && fbDb) {
                const articleRef = fbDb.collection('users').doc(currentFirebaseUser.uid).collection('savedArticles').doc(itemData.id);
                await articleRef.update({ isRead: true });
            } else if (itemData.type === 'feedItem') {
                const originalFeedItemIndex = allFeedItems.findIndex(fi => fi.id === itemData.id);
                if (originalFeedItemIndex !== -1) {
                    allFeedItems[originalFeedItemIndex].isRead = true;
                    itemData.isRead = true;
                    await saveFeedItemsCache();
                    const cardInList = articlesContainer.querySelector(`.article-card[data-item-id="${escapeHtml(itemData.id)}"]`);
                    if (cardInList) {
                        cardInList.classList.remove('unread'); cardInList.classList.add('read');
                    }
                }
            }
        }
        updateActiveCardState();
        return Promise.resolve();
    }


    function updateActiveCardState() {
        if (!articlesContainer || !displayedItems) return;
        articlesContainer.querySelectorAll('.article-card.active').forEach(card => card.classList.remove('active'));
        if (currentReadingItem && readingPane && !readingPane.classList.contains('collapsed')) {
            const displayedIndex = displayedItems.findIndex(item => item.id === currentReadingItem.id && item.type === currentReadingItem.type);
            if (displayedIndex !== -1) {
                const activeCard = articlesContainer.querySelector(`.article-card[data-index="${displayedIndex}"]`);
                if (activeCard) activeCard.classList.add('active');
            }
        }
    }

    function closeReadingPane() {
        if (readingPane.classList.contains('fullscreen')) {
            toggleReaderFullscreen();
        }
        if (readingPane && mainColumn && readerContentWrapper && articlesContainer) {
            readingPane.classList.add('collapsed');
            readerContentWrapper.classList.add('reading-pane-collapsed-wrapper');
            mainColumn.style.flexBasis = '100%';
            articlesContainer.classList.remove('main-column-narrowed');
            currentReadingItem = null; updateActiveCardState();
            if (articleContent) articleContent.innerHTML = '';
            if (appearanceDropdown) appearanceDropdown.classList.remove('visible');
            if (playSpeechBtn) playSpeechBtn.style.display = 'none';
            if (ttsAudioElement && !ttsAudioElement.paused) {
                ttsAudioElement.pause();
                if(playSpeechBtn) {
                    playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                    playSpeechBtn.title = 'Read Aloud';
                }
            }
        }
    }


    function openArticleView() {
        if (readingPane && mainColumn && readerContentWrapper && articlesContainer) {
            readingPane.classList.remove('collapsed');
            readerContentWrapper.classList.remove('reading-pane-collapsed-wrapper');
            articlesContainer.classList.add('main-column-narrowed');
            chrome.storage.local.get(STORAGE_KEY_READER_MAIN_COL_WIDTH, (data) => {
                mainColumn.style.flexBasis = data[STORAGE_KEY_READER_MAIN_COL_WIDTH] || DEFAULT_READER_MAIN_COL_WIDTH;
            });
        }
    }

    function toggleReaderFullscreen() {
        if (!readingPane || !readerContentWrapper || !toggleFullscreenReaderBtn) return;
        const willBeFullscreen = !readingPane.classList.contains('fullscreen');
        readingPane.classList.toggle('fullscreen', willBeFullscreen);

        const icon = toggleFullscreenReaderBtn.querySelector('i');
        if (icon) icon.className = willBeFullscreen ? 'fas fa-compress' : 'fas fa-expand';
        toggleFullscreenReaderBtn.title = willBeFullscreen ? "Exit Fullscreen" : "Fullscreen";

        if (closeArticleBtn) {
            closeArticleBtn.style.display = willBeFullscreen ? 'none' : 'inline-flex';
        }

        if (willBeFullscreen) {
            if (mainColumn) mainColumn.style.display = 'none'; if (resizer) resizer.style.display = 'none';
        } else {
            if (mainColumn) mainColumn.style.display = 'flex'; if (resizer) resizer.style.display = 'block';
            if (!readingPane.classList.contains('collapsed')) openArticleView();
        }
    }


    async function deleteArticleFromFirestore(articleId) {
        if (!currentFirebaseUser || !fbDb || !articleId) return;
        try {
            const articleRef = fbDb.collection('users').doc(currentFirebaseUser.uid).collection('savedArticles').doc(articleId);
            await articleRef.delete();
            console.log(`Article ${articleId} deleted from Firestore.`);
            if (currentReadingItem && currentReadingItem.id === articleId) {
                closeReadingPane();
            }
        } catch (error) {
            console.error("Error deleting article from Firestore:", error);
            alert("Error deleting article. Please try again.");
        }
    }

    async function toggleFavoriteCurrentItem() {
        if (currentReadingItem && currentReadingItem.type === 'article' && currentFirebaseUser && fbDb) {
            const articleRef = fbDb.collection('users').doc(currentFirebaseUser.uid).collection('savedArticles').doc(currentReadingItem.id);
            const newFavoriteState = !currentReadingItem.isFavorite;
            try {
                await articleRef.update({ isFavorite: newFavoriteState });
                markAsFavoriteBtn.classList.toggle('active', newFavoriteState);
                const favIcon = markAsFavoriteBtn.querySelector('i');
                if (favIcon) favIcon.className = newFavoriteState ? 'fas fa-star' : 'far fa-star';
                markAsFavoriteBtn.title = newFavoriteState ? 'Remove Favorite' : 'Add to Favorites';
            } catch (error) {
                console.error("Error updating favorite state in Firestore:", error);
            }
        }
    }

    async function toggleReadLaterCurrentItem() {
        if (currentReadingItem && currentReadingItem.type === 'article' && currentFirebaseUser && fbDb) {
            const articleRef = fbDb.collection('users').doc(currentFirebaseUser.uid).collection('savedArticles').doc(currentReadingItem.id);
            const newReadLaterState = !currentReadingItem.isReadLater;
            try {
                await articleRef.update({ isReadLater: newReadLaterState });
                toggleReadLaterBtn.classList.toggle('active', newReadLaterState);
                const readLaterIcon = toggleReadLaterBtn.querySelector('i');
                if (readLaterIcon) readLaterIcon.className = newReadLaterState ? 'fas fa-bookmark' : 'far fa-bookmark';
                toggleReadLaterBtn.title = newReadLaterState ? 'Remove from Read Later' : 'Add to Read Later';

                if (!newReadLaterState && currentFilter.type === 'page' && currentFilter.value === 'readLater') {
                    closeReadingPane();
                }
            } catch (error) {
                console.error("Error updating read later state in Firestore:", error);
            }
        }
    }

    async function changeFontSize(delta) {
        const newSize = readingSettings.fontSize + delta;
        if (newSize >= 10 && newSize <= 30) {
            readingSettings.fontSize = newSize;
            if (articleContent) articleContent.style.fontSize = `${readingSettings.fontSize}px`;
            if (currentFontSizeLabel) currentFontSizeLabel.textContent = `${readingSettings.fontSize}px`;
            await saveReadingSettings();
        }
    }

    async function toggleTheme() {
        readingSettings.theme = readingSettings.theme === 'light' ? 'dark' : 'light';
        applyTheme(); await saveReadingSettings();
    }

    function initMainLayoutResizer() {
        if (!resizer || !mainColumn || !readingPane || !readerContentWrapper) return;
        let startX, startWidthMain;
        function onMouseMove(e) {
            const dx = e.clientX - startX; let newMainWidth = startWidthMain + dx;
            const containerWidth = readerContentWrapper.offsetWidth; const resizerWidthVal = resizer.offsetWidth;
            const minPaneWidth = 300; const minMainColWidth = 280;
            if (newMainWidth < minMainColWidth) newMainWidth = minMainColWidth;
            if (containerWidth - newMainWidth - resizerWidthVal < minPaneWidth) {
                newMainWidth = containerWidth - minPaneWidth - resizerWidthVal;
            }
            mainColumn.style.flexBasis = `${newMainWidth}px`;
        }
        function onMouseUp() {
            document.body.classList.remove('is-resizing');
            document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp);
            saveLayoutData();
        }
        resizer.addEventListener('mousedown', (e) => {
            if (readingPane.classList.contains('collapsed')) return;
            document.body.classList.add('is-resizing'); startX = e.clientX; startWidthMain = mainColumn.offsetWidth;
            document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });
    }

    function setupRefreshFeedsButton() {
        let existingButton = document.getElementById('refreshFeedsButtonReader');
        if (existingButton) { refreshFeedsUiButton = existingButton; }
        else if (sortFilterButton && sortFilterButton.parentElement) {
            refreshFeedsUiButton = document.createElement('button'); refreshFeedsUiButton.id = 'refreshFeedsButtonReader';
            refreshFeedsUiButton.className = 'icon-btn'; refreshFeedsUiButton.title = 'Refresh All Feeds';
            refreshFeedsUiButton.innerHTML = '<i class="fas fa-sync-alt"></i>'; refreshFeedsUiButton.style.marginLeft = '8px';
            sortFilterButton.parentElement.insertBefore(refreshFeedsUiButton, sortFilterButton.nextSibling);
        } else { return; }
        if (refreshFeedsUiButton) {
            refreshFeedsUiButton.addEventListener('click', () => {
                if (refreshFeedsUiButton.querySelector('i')) refreshFeedsUiButton.querySelector('i').classList.add('fa-spin');
                chrome.runtime.sendMessage({ command: 'fetchAllFeeds', forceRefresh: true }, (response) => {
                    if (chrome.runtime.lastError) {
                        if (refreshFeedsUiButton.querySelector('i')) refreshFeedsUiButton.querySelector('i').classList.remove('fa-spin');
                        return;
                    }
                    if (refreshFeedsUiButton.querySelector('i')) refreshFeedsUiButton.querySelector('i').classList.remove('fa-spin');
                });
            });
            updateActiveHamburgerFilter();
        }
    }

    async function handleUnsubscribeFeed(feedUrlToUnsubscribe) {
        const feedSubscriptionData = rssFeedsSubscriptions[feedUrlToUnsubscribe];
        if (!feedSubscriptionData) return;

        if (confirm(`Are you sure you want to unsubscribe from "${escapeHtml(feedSubscriptionData.title)}"? \n\n- Articles already promoted to your Home/New Feeds will remain.\n- Raw history for this specific feed will be removed.`)) {
            if (currentFirebaseUser && fbDb) {
                try {
                    await fbDb.collection('users').doc(currentFirebaseUser.uid).collection('feedSubscriptions').doc(feedSubscriptionData.id).delete();
                } catch (error) {
                    console.error("Errore durante la disiscrizione da Firestore:", error);
                    alert("Error unsubscribing from synced feed. Please try again.");
                    return;
                }
            } else {
                delete rssFeedsSubscriptions[feedUrlToUnsubscribe];
                try {
                    await new Promise((resolve, reject) => {
                        chrome.storage.local.set({
                            [STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL]: rssFeedsSubscriptions
                        },
                        () => { if (chrome.runtime.lastError) return reject(chrome.runtime.lastError); resolve(); });
                    });
                    renderHamburgerFeedsList(rssFeedsSubscriptions);
                } catch (error) {
                    console.error("Errore durante la disiscrizione da storage locale:", error);
                    alert("Error unsubscribing locally. Please try again.");
                    return;
                }
            }

            allFeedItems = allFeedItems.filter(item => item.feedUrl !== feedUrlToUnsubscribe);
            await saveFeedItemsCache();

            if (currentFilter.type === 'specificFeed' && currentFilter.value === feedUrlToUnsubscribe) {
                currentFilter = { type: 'page', value: 'homeAll' };
                updateActiveHamburgerFilter();
                if (readingPane && !readingPane.classList.contains('collapsed')) closeReadingPane();
            }
            filterAndSortItems();
            chrome.runtime.sendMessage({ command: 'feedUnsubscribed', feedUrl: feedUrlToUnsubscribe });
        }
    }

    function setupTTSButton() {
        const readingPaneToolbar = document.querySelector('#reading-pane .toolbar');
        if (!readingPaneToolbar) return;

        playSpeechBtn = document.createElement('button');
        playSpeechBtn.className = 'icon-btn';
        playSpeechBtn.id = 'playSpeechBtn';
        playSpeechBtn.title = 'Read Aloud';
        playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        playSpeechBtn.style.display = 'none';

        ttsLoadingIndicator = document.createElement('span');
        ttsLoadingIndicator.id = 'ttsLoadingIndicator';
        ttsLoadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        ttsLoadingIndicator.style.display = 'none';
        ttsLoadingIndicator.style.marginLeft = '8px';
        ttsLoadingIndicator.style.color = 'var(--popup-icon-color)';


        const favoriteButton = document.getElementById('markAsFavoriteBtn');
        if (favoriteButton) {
            readingPaneToolbar.insertBefore(playSpeechBtn, favoriteButton);
            readingPaneToolbar.insertBefore(ttsLoadingIndicator, playSpeechBtn.nextSibling);
        } else {
            const divider = readingPaneToolbar.querySelector('.toolbar-divider');
            if (divider) {
                 readingPaneToolbar.insertBefore(playSpeechBtn, divider);
                 readingPaneToolbar.insertBefore(ttsLoadingIndicator, playSpeechBtn.nextSibling);
            } else {
                readingPaneToolbar.appendChild(playSpeechBtn);
                readingPaneToolbar.appendChild(ttsLoadingIndicator);
            }
        }

        playSpeechBtn.addEventListener('click', async () => {
            if (!currentReadingItem || !currentFirebaseUser) {
                alert("Please open an article and be logged in to use Text-to-Speech.");
                return;
            }
            if (!fbFunctions) {
                alert("Text-to-Speech service is not available at the moment. Firebase Functions SDK might not be loaded.");
                console.error("TTS Error: Firebase Functions (fbFunctions) is not initialized.");
                return;
            }


            if (ttsAudioElement && !ttsAudioElement.paused) {
                ttsAudioElement.pause();
                ttsAudioElement.currentTime = 0;
                playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                playSpeechBtn.title = 'Read Aloud';
                if(ttsLoadingIndicator) ttsLoadingIndicator.style.display = 'none';
                playSpeechBtn.disabled = false;
                return;
            }

            let textToRead = "";
            if (currentReadingItem.type === 'article') {
                const tempDiv = document.createElement('div');
                if (currentReadingItem.source === 'manual' && typeof marked?.parse === 'function' && currentReadingItem.content && !currentReadingItem.content.trim().startsWith('<')) {
                    tempDiv.innerHTML = marked.parse(currentReadingItem.content || "");
                } else {
                    tempDiv.innerHTML = currentReadingItem.content || "";
                }
                textToRead = tempDiv.textContent || tempDiv.innerText || "";
            } else if (currentReadingItem.type === 'feedItem') {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = currentReadingItem.contentFromReadability || currentReadingItem.fullContentHTML || currentReadingItem.description || "";
                textToRead = tempDiv.textContent || tempDiv.innerText || "";
            }

            if (!textToRead.trim()) {
                alert("No readable text found in the current item.");
                return;
            }

            const MAX_CLIENT_TEXT_LENGTH = 2800;
            if (textToRead.length > MAX_CLIENT_TEXT_LENGTH) {
                textToRead = textToRead.substring(0, MAX_CLIENT_TEXT_LENGTH) + "... (text truncated for TTS)";
            }

            playSpeechBtn.disabled = true;
            if(ttsLoadingIndicator) ttsLoadingIndicator.style.display = 'inline-block';
            playSpeechBtn.innerHTML = '<i class="fas fa-stop-circle"></i>';
            playSpeechBtn.title = 'Stop Reading';

            try {
                const generateSpeechCallable = fbFunctions.httpsCallable('generateSpeech');
                const result = await generateSpeechCallable({
                    text: textToRead,
                    voice: "af_bella",
                });

                if (result.data && result.data.audioUrl) {
                    if (ttsAudioElement) {
                        ttsAudioElement.pause();
                        ttsAudioElement.removeAttribute('src');
                        ttsAudioElement.load();
                    } else {
                        ttsAudioElement = new Audio();
                    }
                    ttsAudioElement.src = result.data.audioUrl;
                    await ttsAudioElement.play();
                    playSpeechBtn.disabled = false;
                    if(ttsLoadingIndicator) ttsLoadingIndicator.style.display = 'none';


                    ttsAudioElement.onended = () => {
                        playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                        playSpeechBtn.title = 'Read Aloud';
                        if(ttsLoadingIndicator) ttsLoadingIndicator.style.display = 'none';
                    };
                    ttsAudioElement.onerror = (e) => {
                        console.error("Audio element error:", e);
                        alert("An error occurred while trying to play the audio.");
                        playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                        playSpeechBtn.title = 'Read Aloud';
                        if(ttsLoadingIndicator) ttsLoadingIndicator.style.display = 'none';
                    };
                } else {
                    throw new Error(result.data.error || "Audio URL not found in response.");
                }
            } catch (error) {
                console.error("Error calling generateSpeech function:", error);
                alert("Error generating speech: " + error.message);
                playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                playSpeechBtn.title = 'Read Aloud';
                playSpeechBtn.disabled = false;
                if(ttsLoadingIndicator) ttsLoadingIndicator.style.display = 'none';
            }
        });
    }


    // --- EVENT LISTENERS ---
    if (mainHeaderHamburgerBtn) mainHeaderHamburgerBtn.addEventListener('click', toggleHamburgerMenu);
    if (sidebarHeaderHamburgerBtn) sidebarHeaderHamburgerBtn.addEventListener('click', toggleHamburgerMenu);


    if (mainPagesList) {
        mainPagesList.addEventListener('click', (e) => {
            const listItem = e.target.closest('li[data-filter-type="page"]');
            if (listItem && !listItem.classList.contains('active-filter')) {
                currentFilter = { type: 'page', value: listItem.dataset.filterValue };
                updateActiveHamburgerFilter(); currentReadingItem = null;
                if (readingPane && !readingPane.classList.contains('collapsed')) closeReadingPane();
                if (searchInput) searchInput.value = '';
                filterAndSortItems();
                if (window.innerWidth < 768 && hamburgerMenu && hamburgerMenu.classList.contains('open')) {
                    toggleHamburgerMenu();
                }
            }
        });
    }

    if (hamburgerFeedsList) {
        hamburgerFeedsList.addEventListener('click', async (e) => {
            const editButton = e.target.closest('.edit-feed-name-btn');
            const unsubscribeButton = e.target.closest('.unsubscribe-feed-btn');
            const listItem = e.target.closest('li[data-filter-type="specificFeed"]');

            if (editButton) {
                e.stopPropagation();
                const feedUrl = editButton.dataset.feedUrl;
                const currentName = editButton.dataset.currentName;
                const feedSubscriptionData = rssFeedsSubscriptions[feedUrl];
                if (!feedSubscriptionData) return;

                const promptMessage = `Edit Feed Name:\n\nCurrent Name: ${escapeHtml(currentName)}\nURL: ${escapeHtml(feedUrl)}\n\nEnter new name:`;
                const newName = prompt(promptMessage, currentName);

                if (newName && newName.trim() && newName.trim() !== currentName) {
                    if (currentFirebaseUser && fbDb) {
                        try {
                            await fbDb.collection('users').doc(currentFirebaseUser.uid).collection('feedSubscriptions').doc(feedSubscriptionData.id).update({ title: newName.trim() });
                            const articlesToUpdateQuery = fbDb.collection('users').doc(currentFirebaseUser.uid).collection('savedArticles')
                                .where('feedUrl', '==', feedUrl);
                            const snapshot = await articlesToUpdateQuery.get();
                            const batch = fbDb.batch();
                            snapshot.forEach(doc => {
                                batch.update(doc.ref, { feedTitle: newName.trim() });
                            });
                            await batch.commit();
                        } catch (error) { console.error("Errore rinomina feed su Firestore:", error); alert("Error renaming synced feed."); return; }
                    } else {
                        if (rssFeedsSubscriptions[feedUrl]) {
                            rssFeedsSubscriptions[feedUrl].title = newName.trim();
                            try {
                                await new Promise((resolve, reject) => {
                                    chrome.storage.local.set({ [STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL]: rssFeedsSubscriptions },
                                    () => { if (chrome.runtime.lastError) return reject(chrome.runtime.lastError); resolve(); });
                                });
                                renderHamburgerFeedsList(rssFeedsSubscriptions);
                            } catch (error) { console.error("Errore rinomina feed locale:", error); alert("Error renaming local feed."); return; }
                        }
                    }
                    allFeedItems.forEach(item => { if (item.feedUrl === feedUrl) item.feedTitle = newName.trim(); });
                    await saveFeedItemsCache();
                    if ((currentFilter.type === 'specificFeed' && currentFilter.value === feedUrl) ||
                        (currentFilter.type === 'page' && ['homeAll', 'newFeeds'].includes(currentFilter.value))) {
                        filterAndSortItems();
                    }
                    chrome.runtime.sendMessage({ command: 'feedRenamed', feedUrl: feedUrl, newName: newName.trim() });
                }
                return;
            }
            if (unsubscribeButton) { e.stopPropagation(); handleUnsubscribeFeed(unsubscribeButton.dataset.feedUrl); return; }

            if (listItem && !listItem.classList.contains('empty-nav-item') && !listItem.classList.contains('active-filter')) {
                currentFilter = { type: 'specificFeed', value: listItem.dataset.filterValue };
                updateActiveHamburgerFilter(); currentReadingItem = null;
                if (readingPane && !readingPane.classList.contains('collapsed')) closeReadingPane();
                if (searchInput) searchInput.value = '';
                filterAndSortItems();
                if (window.innerWidth < 768 && hamburgerMenu && hamburgerMenu.classList.contains('open')) {
                     toggleHamburgerMenu();
                }
            }
        });
    }

    if (quickNavHeader) {
        quickNavHeader.addEventListener('click', (e) => {
            const button = e.target.closest('.quick-nav-btn[data-filter-type="page"]');
            if (button) {
                const filterValue = button.dataset.filterValue;
                if (!(currentFilter.type === 'page' && currentFilter.value === filterValue)) {
                    currentFilter = { type: 'page', value: filterValue };
                    updateActiveHamburgerFilter();
                    currentReadingItem = null;
                    if (readingPane && !readingPane.classList.contains('collapsed')) closeReadingPane();
                    if (searchInput) searchInput.value = '';
                    filterAndSortItems();
                }
            }
        });
    }


    if (feedsSectionToggle) {
        feedsSectionToggle.addEventListener('click', () => {
            const isCollapsed = feedsSectionToggle.classList.toggle('collapsed');
            feedsSectionToggle.setAttribute('aria-expanded', !isCollapsed);
            if (hamburgerFeedsListWrapper) hamburgerFeedsListWrapper.classList.toggle('collapsed', isCollapsed);
        });
    }

    if (articlesContainer) {
        articlesContainer.addEventListener('click', async (e) => {
            const card = e.target.closest('.article-card'); if (!card) return;
            const itemId = card.dataset.itemId;
            const itemType = card.dataset.itemType;
            const displayedIndex = parseInt(card.dataset.index, 10);
            const actionButton = e.target.closest('button[data-action]');

            if (actionButton) {
                e.stopPropagation(); const action = actionButton.dataset.action;
                if (itemType === 'article' && currentFirebaseUser && fbDb) {
                    const articleForAction = displayedItems.find(item => item.id === itemId && item.type === 'article');
                    if (articleForAction) {
                        const articleRef = fbDb.collection('users').doc(currentFirebaseUser.uid).collection('savedArticles').doc(itemId);
                        if (action === 'toggle-favorite') {
                            await articleRef.update({ isFavorite: !articleForAction.isFavorite });
                        }
                        else if (action === 'toggle-read-later-card') {
                            await articleRef.update({ isReadLater: !articleForAction.isReadLater });
                        }
                        else if (action === 'delete') {
                            await deleteArticleFromFirestore(itemId);
                            return;
                        }
                    }
                } else if (itemType === 'feedItem') {
                    if (action === 'open-external') {
                        const feedItemToMark = displayedItems[displayedIndex];
                        if (feedItemToMark && !feedItemToMark.isRead) {
                            const originalFeedItem = allFeedItems.find(fi => fi.id === feedItemToMark.id);
                            if (originalFeedItem) {
                                originalFeedItem.isRead = true; await saveFeedItemsCache();
                                card.classList.remove('unread'); card.classList.add('read');
                            }
                        }
                    }
                }
                return;
            }
            if (displayedIndex >= 0 && displayedIndex < displayedItems.length) {
                const itemToView = displayedItems[displayedIndex];
                currentReadingItem = itemToView;
                const refreshIcon = refreshArticleBtn ? refreshArticleBtn.querySelector('i') : null;
                if (refreshIcon) refreshIcon.classList.add('fa-spin');
                showArticleUI(itemToView).finally(() => {
                    if (refreshIcon) refreshIcon.classList.remove('fa-spin');
                });
                updateActiveCardState();
            }
        });
    }

    if (closeArticleBtn) closeArticleBtn.addEventListener('click', closeReadingPane);

    if (refreshArticleBtn) {
        refreshArticleBtn.addEventListener('click', () => {
            if (currentReadingItem) {
                const icon = refreshArticleBtn.querySelector('i');
                if (icon) icon.classList.add('fa-spin');
                showArticleUI(currentReadingItem, true).finally(() => {
                    if (icon) icon.classList.remove('fa-spin');
                });
            }
        });
    }

    if (toggleAppearanceMenuBtn && appearanceDropdown) {
        toggleAppearanceMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            appearanceDropdown.classList.toggle('visible');
        });
        document.addEventListener('click', (e) => {
            if (!appearanceDropdown.contains(e.target) && !toggleAppearanceMenuBtn.contains(e.target)) {
                appearanceDropdown.classList.remove('visible');
            }
        });
    }

    if (toggleFullscreenReaderBtn) toggleFullscreenReaderBtn.addEventListener('click', toggleReaderFullscreen);
    if (markAsFavoriteBtn) markAsFavoriteBtn.addEventListener('click', toggleFavoriteCurrentItem);
    if (toggleReadLaterBtn) toggleReadLaterBtn.addEventListener('click', toggleReadLaterCurrentItem);
    if (deleteArticleReaderBtn) {
        deleteArticleReaderBtn.addEventListener('click', async () => {
            if (currentReadingItem && currentReadingItem.type === 'article') {
                await deleteArticleFromFirestore(currentReadingItem.id);
            }
        });
    }
    if (decreaseFontBtn) decreaseFontBtn.addEventListener('click', () => changeFontSize(-1));
    if (increaseFontBtn) increaseFontBtn.addEventListener('click', () => changeFontSize(1));
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    if (searchInput) { searchInput.addEventListener('input', () => filterAndSortItems()); searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchInput.blur(); }); }

    if (sortFilterButton) {
        sortFilterButton.addEventListener('click', () => {
            const currentField = currentSort.field;

            if (currentFilter.type === 'page' && currentFilter.value === 'homeAll') {
                if (currentField === 'relevantDate') { currentSort.field = 'title'; currentSort.order = 'asc'; }
                else { currentSort.field = 'relevantDate'; currentSort.order = 'desc';}
            } else if (currentFilter.type === 'page' && currentFilter.value === 'newFeeds') {
                if (currentField === 'pubDate') { currentSort.field = 'title'; currentSort.order = 'asc'; }
                else if (currentField === 'title') { currentSort.field = 'feedTitle'; currentSort.order = 'asc'; }
                else { currentSort.field = 'pubDate'; currentSort.order = 'desc'; }
            } else if (currentFilter.type === 'specificFeed') {
                if (currentField === 'pubDate') { currentSort.field = 'title'; currentSort.order = 'asc'; }
                else { currentSort.field = 'pubDate'; currentSort.order = 'desc'; }
            } else {
                if (currentField === 'dateAdded') { currentSort.field = 'title'; currentSort.order = 'asc'; }
                else { currentSort.field = 'dateAdded'; currentSort.order = 'desc'; }
            }
            updateSortButtonIcon(); filterAndSortItems();
        });
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.command === 'feedsUpdated') {
            let UINeedsRefreshForFeedItems = false;

            if (message.feedItems && Array.isArray(message.feedItems)) {
                const newRawItems = message.feedItems.map(item => ({
                    ...item,
                    pubDate: item.pubDate ? new Date(item.pubDate) : new Date(0),
                    isRead: item.isRead || false,
                    type: 'feedItem'
                }));
                if (JSON.stringify(allFeedItems) !== JSON.stringify(newRawItems)) {
                    allFeedItems = newRawItems;
                    saveFeedItemsCache();
                    if (currentFilter.type === 'specificFeed') UINeedsRefreshForFeedItems = true;
                }
            }
            if (!currentFirebaseUser && message.subscriptions) {
                const localSubs = {};
                for(const url in message.subscriptions) {
                    localSubs[url] = {id: url, title: message.subscriptions[url].title, url: url, subscribedAt: 0 };
                }
                if (JSON.stringify(rssFeedsSubscriptions) !== JSON.stringify(localSubs)) {
                    rssFeedsSubscriptions = localSubs;
                    renderHamburgerFeedsList(rssFeedsSubscriptions);
                }
            }


            if (UINeedsRefreshForFeedItems) {
                filterAndSortItems();
            }
            chrome.runtime.sendMessage({ command: 'updateBadgeCount' });
            sendResponse({ received: true, processed: UINeedsRefreshForFeedItems });
            return true;

        } else if (message.command === 'feedSubscribed' || message.command === 'feedUnsubscribed' || message.command === 'feedRenamed') {
            if (!currentFirebaseUser) {
                (async () => {
                    const localSubsData = await chrome.storage.local.get([STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL, STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL]);
                    const localSubs = localSubsData[STORAGE_KEY_RSS_FEEDS_SUBSCRIPTIONS_LOCAL] || {};
                    const localSubDates = localSubsData[STORAGE_KEY_FEED_SUBSCRIPTION_DATES_LOCAL] || {};
                    rssFeedsSubscriptions = {};
                    for (const url in localSubs) {
                        rssFeedsSubscriptions[url] = { id: url, title: localSubs[url].title, url: url, subscribedAt: localSubDates[url] || 0 };
                    }
                    renderHamburgerFeedsList(rssFeedsSubscriptions);
                })();
            }
            chrome.runtime.sendMessage({ command: 'fetchAllFeeds', forceRefresh: true });
            sendResponse({ received: true });
            return true;
        }
        return true;
    });

    if (readingPane && articlesContainer) {
        if (readingPane.classList.contains('collapsed')) articlesContainer.classList.remove('main-column-narrowed');
        else articlesContainer.classList.add('main-column-narrowed');
    }

    if (mainHeaderHamburgerBtn) mainHeaderHamburgerBtn.style.display = hamburgerMenu.classList.contains('open') ? 'none' : 'inline-flex';
    if (sidebarHeaderHamburgerBtn) sidebarHeaderHamburgerBtn.style.display = hamburgerMenu.classList.contains('open') ? 'inline-flex' : 'none';

    if (readerMainContent && hamburgerMenu) {
        const initialMarginLeft = hamburgerMenu.classList.contains('open') ? 'var(--hamburger-opened-width)' : '0';
        readerMainContent.style.marginLeft = initialMarginLeft;
        readerMainContent.style.width = `calc(100% - ${initialMarginLeft})`;
    }

    setupTTSButton();
    setupRefreshFeedsButton();
    initMainLayoutResizer();
    chrome.runtime.sendMessage({ command: "clearReaderBadge" });
    const port = chrome.runtime.connect({ name: "readerPageChannel" });
});