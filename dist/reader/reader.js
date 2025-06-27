// reader.js (Refactored for Manifest V3 - Message Passing Architecture)
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded for reader.js started.");

    // --- APPLICATION STATE ---
    let allArticles = [];
    let allFeedItems = [];
    let displayedItems = [];
    let currentUser = null;
    let currentFilter = { type: 'page', value: 'homeAll' };
    let currentSort = { field: 'relevantDate', order: 'desc' };
    let currentReadingItem = null;
    let rssFeedsSubscriptions = {};
    let readingSettings = { fontSize: 16, theme: 'dark' };

    // --- STORAGE KEYS ---
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
    let ttsAudioElement = null;
    let ttsLoadingIndicator = null;
    let playSpeechBtn = null;

    if (!articlesContainer) console.error("Element articlesContainer NOT FOUND (reader.js)!");

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

    // --- UI INITIALIZATION & RENDERING ---
    function applyTheme() {
        if (!document.documentElement || !themeToggleBtn) return;
        document.documentElement.setAttribute('data-theme', readingSettings.theme);
        const themeIcon = themeToggleBtn.querySelector('i');
        if (themeIcon) {
            themeIcon.className = readingSettings.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    async function initializeReaderUI(initialData) {
        currentUser = initialData.user;
        allArticles = (initialData.articles || []).map(a => ({
            ...a,
            dateAdded: a.dateAdded ? new Date(a.dateAdded.seconds * 1000) : new Date(0),
            pubDate: a.pubDate ? new Date(a.pubDate.seconds * 1000) : null,
            relevantDate: a.pubDate ? new Date(a.pubDate.seconds * 1000) : (a.dateAdded ? new Date(a.dateAdded.seconds * 1000) : new Date(0)),
            type: 'article'
        }));
        allFeedItems = (initialData.feedItems || []).map(item => ({
            ...item,
            pubDate: item.pubDate ? new Date(item.pubDate) : new Date(0),
            type: 'feedItem'
        }));
        rssFeedsSubscriptions = initialData.subscriptions || {};

        const settingsResult = await chrome.storage.local.get([
            STORAGE_KEY_READING_SETTINGS,
            STORAGE_KEY_READER_MAIN_COL_WIDTH,
            STORAGE_KEY_LAST_FILTER
        ]);

        if (settingsResult[STORAGE_KEY_READING_SETTINGS]) readingSettings = { ...readingSettings, ...settingsResult[STORAGE_KEY_READING_SETTINGS] };
        if (articleContent) articleContent.style.fontSize = `${readingSettings.fontSize}px`;
        if (currentFontSizeLabel) currentFontSizeLabel.textContent = `${readingSettings.fontSize}px`;
        applyTheme();

        const savedMainColWidth = settingsResult[STORAGE_KEY_READER_MAIN_COL_WIDTH] || DEFAULT_READER_MAIN_COL_WIDTH;
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
        currentFilter = settingsResult[STORAGE_KEY_LAST_FILTER] || { type: 'page', value: 'homeAll' };

        updateActiveHamburgerFilter();
        updateSortButtonIcon();
        renderHamburgerFeedsList(rssFeedsSubscriptions);
        filterAndSortItems();
    }

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
            await chrome.storage.local.set({ [STORAGE_KEY_READING_SETTINGS]: readingSettings });
        } catch (error) { console.error("Error saving reading settings (reader.js):", error); }
    }

    async function saveLayoutData() {
        if (!mainColumn || !readingPane || readingPane.classList.contains('collapsed')) return;
        try {
            await chrome.storage.local.set({ [STORAGE_KEY_READER_MAIN_COL_WIDTH]: mainColumn.style.flexBasis || DEFAULT_READER_MAIN_COL_WIDTH });
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
        if (!currentUser && currentFilter.type !== 'specificFeed') {
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
                        if (!subInfo || !subInfo.subscribedAt) return true;
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

            if (field === 'relevantDate' || field === 'pubDate' || field === 'dateAdded') {
                valA = a[field] ? new Date(a[field]).getTime() : 0;
                valB = b[field] ? new Date(b[field]).getTime() : 0;
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
        if (!currentUser && currentFilter.type !== 'specificFeed') {
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
            if (article.type !== 'article') return '';
            const domain = article.url ? new URL(article.url).hostname.replace('www.', '') : (article.feedTitle || 'Saved Item');
            let imageUrl = article.imageUrl || '';
            let imagePlaceholderIcon = article.source === 'feed' ? 'fas fa-rss' : 'fas fa-archive';
            const isVideo = article.url && (article.url.includes('youtube.com') || article.url.includes('youtu.be'));

            if (isVideo) {
                imagePlaceholderIcon = 'fas fa-play-circle';
                const videoId = getYouTubeVideoId(article.url);
                if (videoId && !imageUrl) imageUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
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
            let readTimeMinutes = isVideo ? 1 : Math.ceil((article.content || article.textContent || "").split(/\s+/).length / 200);
            const readTimeString = readTimeMinutes > 0 ? `${readTimeMinutes} min read` : '';
            const isUnreadArticleFromFeed = article.source === 'feed' && !article.isRead;

            return `
                <div class="article-card vertical-layout ${isUnreadArticleFromFeed ? 'unread-feed-article' : ''} ${isVideo ? 'video-type' : ''} ${currentReadingItem && currentReadingItem.id === article.id && readingPane && !readingPane.classList.contains('collapsed') ? 'active' : ''}"
                     data-item-id="${escapeHtml(article.id)}" data-item-type="article" data-index="${index}">
                    <div class="card-image-top">${imageElementContent}</div>
                    <div class="card-content-wrapper">
                        <div class="card-title-actions-row">
                            <h3 class="article-card-title" title="${escapeHtml(article.title)}">${escapeHtml(article.title)}</h3>
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
                         <h3 class="article-card-title">${escapeHtml(title)}</h3>
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
        if (!readingPane || !articleViewTitle || !articleContent || !articleViewLink) return;
        if (itemData.type === 'article' && !currentUser) {
            articleContent.innerHTML = '<p>Please log in to view this article.</p>';
            if (playSpeechBtn) playSpeechBtn.style.display = 'none';
            return;
        }

        currentReadingItem = itemData; openArticleView();
        articleViewTitle.textContent = itemData.title || 'No Title';
        const itemUrl = itemData.url || itemData.link || '#';
        const youtubeVideoId = getYouTubeVideoId(itemUrl);
        articleViewLink.href = itemUrl;
        articleViewLink.textContent = youtubeVideoId ? 'Watch on YouTube' : (itemUrl !== '#' ? 'Read Original' : 'No Link');

        let dateToDisplayStr = '';
        if (itemData.type === 'article') dateToDisplayStr = (itemData.pubDate || itemData.dateAdded) ? new Date(itemData.pubDate || itemData.dateAdded).toLocaleString() : '';
        else if (itemData.type === 'feedItem' && itemData.pubDate) dateToDisplayStr = new Date(itemData.pubDate).toLocaleString();
        articleViewDate.textContent = dateToDisplayStr;

        let textContentForReadTime = (itemData.type === 'article') ? (itemData.content || "") : (itemData.description || itemData.summary || itemData.fullContentHTML || "");
        let readTimeMinutes = youtubeVideoId ? 1 : Math.ceil(textContentForReadTime.split(/\s+/).length / 200);
        articleViewReadTime.textContent = readTimeMinutes > 0 ? `${readTimeMinutes} min read` : '';

        const oldLoadBtn = document.getElementById('dynamicLoadFullContentBtn');
        if (oldLoadBtn) oldLoadBtn.remove();
        articleContent.innerHTML = ''; let contentDisplayed = false;

        const loadFullContentUtility = (url, targetItem) => {
            articleContent.innerHTML = '<p>Loading full content...</p>';
            chrome.runtime.sendMessage({ command: 'fetchWithReadability', url: url }, (response) => {
                if (response && response.success && response.article) {
                    articleContent.innerHTML = response.article.content;
                    chrome.runtime.sendMessage({ command: 'updateItemContent', payload: { itemId: targetItem.id, itemType: targetItem.type, newContent: response.article.content } });
                } else {
                    let fallbackContent = (targetItem.type === 'article') ? targetItem.content : (targetItem.fullContentHTML || targetItem.description);
                    articleContent.innerHTML = `<p><i>Could not load full content. Error: ${response ? response.error : 'Unknown'}</i></p><br>${fallbackContent || ''}`;
                }
            });
        };

        if (youtubeVideoId) {
            articleContent.innerHTML = `<div class="youtube-video-container"><iframe src="https://www.youtube-nocookie.com/embed/${youtubeVideoId}?rel=0&modestbranding=1&autoplay=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
            contentDisplayed = true;
        } else if (forceRefreshContent && itemUrl && itemUrl !== '#') {
            loadFullContentUtility(itemUrl, itemData);
            contentDisplayed = true;
        } else if (itemData.type === 'article' && itemData.content) {
            articleContent.innerHTML = (itemData.source === 'manual' && typeof marked?.parse === 'function' && !itemData.content.trim().startsWith('<')) ? marked.parse(itemData.content) : itemData.content;
            contentDisplayed = true;
        } else if (itemData.type === 'feedItem') {
            if (itemData.contentFromReadability) { articleContent.innerHTML = itemData.contentFromReadability; contentDisplayed = true; }
            else if (itemData.fullContentHTML) { articleContent.innerHTML = itemData.fullContentHTML; contentDisplayed = true; }
            else if (itemData.description) {
                const tempDiv = document.createElement('div'); tempDiv.innerHTML = itemData.description;
                articleContent.innerHTML = (tempDiv.children.length > 0 || tempDiv.innerHTML.match(/<[a-z][\s\S]*>/i)) ? itemData.description : `<p>${escapeHtml(itemData.description)}</p>`;
                contentDisplayed = true;
            }

            if (itemUrl !== '#' && !itemData.contentFromReadability) {
                const loadButton = document.createElement('button'); loadButton.id = 'dynamicLoadFullContentBtn';
                loadButton.className = 'action-btn'; loadButton.textContent = 'Load Full Content';
                loadButton.style.margin = '15px auto'; loadButton.style.display = 'block';
                loadButton.onclick = () => { loadButton.remove(); loadFullContentUtility(itemUrl, itemData); };
                if (articleContent.firstChild) articleContent.insertBefore(loadButton, articleContent.firstChild);
                else articleContent.appendChild(loadButton);
            }
        }

        if (!contentDisplayed && !forceRefreshContent) articleContent.innerHTML = '<p>Content not available.</p>';

        if (itemData.type === 'article') {
            markAsFavoriteBtn.style.display = 'inline-flex'; toggleReadLaterBtn.style.display = 'inline-flex'; deleteArticleReaderBtn.style.display = 'inline-flex';
            markAsFavoriteBtn.classList.toggle('active', !!itemData.isFavorite);
            markAsFavoriteBtn.querySelector('i').className = itemData.isFavorite ? 'fas fa-star' : 'far fa-star';
            markAsFavoriteBtn.title = itemData.isFavorite ? 'Remove Favorite' : 'Add to Favorites';
            toggleReadLaterBtn.classList.toggle('active', !!itemData.isReadLater);
            toggleReadLaterBtn.querySelector('i').className = itemData.isReadLater ? 'fas fa-bookmark' : 'far fa-bookmark';
            toggleReadLaterBtn.title = itemData.isReadLater ? 'Remove from Read Later' : 'Add to Read Later';
        } else {
            markAsFavoriteBtn.style.display = 'none'; toggleReadLaterBtn.style.display = 'none'; deleteArticleReaderBtn.style.display = 'none';
        }

        if (playSpeechBtn) {
            const hasReadableContent = (itemData.type === 'article' && itemData.content) || (itemData.type === 'feedItem' && (itemData.contentFromReadability || itemData.fullContentHTML || itemData.description));
            playSpeechBtn.style.display = hasReadableContent && !youtubeVideoId ? 'inline-flex' : 'none';
            if (ttsAudioElement && !ttsAudioElement.paused) {
                ttsAudioElement.pause();
                playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                playSpeechBtn.title = 'Read Aloud';
            }
        }

        if (!itemData.isRead && !forceRefreshContent) {
            chrome.runtime.sendMessage({ command: 'markItemAsRead', payload: { itemId: itemData.id, itemType: itemData.type } });
            const cardInList = articlesContainer.querySelector(`.article-card[data-item-id="${escapeHtml(itemData.id)}"]`);
            if (cardInList) { cardInList.classList.remove('unread'); cardInList.classList.add('read'); }
        }
        updateActiveCardState();
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
        if (readingPane.classList.contains('fullscreen')) toggleReaderFullscreen();
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
                if(playSpeechBtn) { playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>'; playSpeechBtn.title = 'Read Aloud'; }
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
        if (!readingPane || !toggleFullscreenReaderBtn) return;
        const willBeFullscreen = !readingPane.classList.contains('fullscreen');
        readingPane.classList.toggle('fullscreen', willBeFullscreen);
        toggleFullscreenReaderBtn.querySelector('i').className = willBeFullscreen ? 'fas fa-compress' : 'fas fa-expand';
        toggleFullscreenReaderBtn.title = willBeFullscreen ? "Exit Fullscreen" : "Fullscreen";
        if (closeArticleBtn) closeArticleBtn.style.display = willBeFullscreen ? 'none' : 'inline-flex';
        if (mainColumn) mainColumn.style.display = willBeFullscreen ? 'none' : 'flex';
        if (resizer) resizer.style.display = willBeFullscreen ? 'none' : 'block';
    }

    function handleDeleteArticle(articleId) {
        if (!currentUser || !articleId) return;
        chrome.runtime.sendMessage({ command: 'deleteArticle', payload: { articleId } }, (response) => {
            if (response.success) {
                console.log(`Article ${articleId} deleted.`);
                if (currentReadingItem && currentReadingItem.id === articleId) closeReadingPane();
            } else {
                console.error("Error deleting article:", response.error);
                alert("Error deleting article. Please try again.");
            }
        });
    }

    function handleToggleFavorite(article) {
        if (!article || !currentUser) return;
        const newFavoriteState = !article.isFavorite;
        chrome.runtime.sendMessage({ command: 'updateArticle', payload: { articleId: article.id, updates: { isFavorite: newFavoriteState } } }, (response) => {
            if (!response.success) {
                console.error("Error updating favorite state:", response.error);
                alert("Error updating favorite state.");
            }
        });
    }

    function handleToggleReadLater(article) {
        if (!article || !currentUser) return;
        const newReadLaterState = !article.isReadLater;
        chrome.runtime.sendMessage({ command: 'updateArticle', payload: { articleId: article.id, updates: { isReadLater: newReadLaterState } } }, (response) => {
            if (!response.success) {
                console.error("Error updating read later state:", response.error);
                alert("Error updating read later state.");
            }
        });
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
            if (containerWidth - newMainWidth - resizerWidthVal < minPaneWidth) newMainWidth = containerWidth - minPaneWidth - resizerWidthVal;
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
                chrome.runtime.sendMessage({ command: 'fetchAllFeeds', payload: { forceRefresh: true } }, () => {
                    if (refreshFeedsUiButton.querySelector('i')) refreshFeedsUiButton.querySelector('i').classList.remove('fa-spin');
                });
            });
            updateActiveHamburgerFilter();
        }
    }

    function handleUnsubscribeFeed(feedUrlToUnsubscribe) {
        const feedSubscriptionData = rssFeedsSubscriptions[feedUrlToUnsubscribe];
        if (!feedSubscriptionData) return;

        if (confirm(`Are you sure you want to unsubscribe from "${escapeHtml(feedSubscriptionData.title)}"?`)) {
            chrome.runtime.sendMessage({ command: 'unsubscribeFromFeed', payload: { feedUrl: feedUrlToUnsubscribe } }, (response) => {
                if (response.success) {
                    if (currentFilter.type === 'specificFeed' && currentFilter.value === feedUrlToUnsubscribe) {
                        currentFilter = { type: 'page', value: 'homeAll' };
                        updateActiveHamburgerFilter();
                        if (readingPane && !readingPane.classList.contains('collapsed')) closeReadingPane();
                    }
                } else {
                    alert("Error unsubscribing. Please try again.");
                }
            });
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

        playSpeechBtn.addEventListener('click', () => {
            if (!currentReadingItem || !currentUser) {
                alert("Please open an article and be logged in to use Text-to-Speech.");
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
            const tempDiv = document.createElement('div');
            if (currentReadingItem.type === 'article') {
                tempDiv.innerHTML = (currentReadingItem.source === 'manual' && typeof marked?.parse === 'function' && !currentReadingItem.content.trim().startsWith('<')) ? marked.parse(currentReadingItem.content || "") : (currentReadingItem.content || "");
            } else if (currentReadingItem.type === 'feedItem') {
                tempDiv.innerHTML = currentReadingItem.contentFromReadability || currentReadingItem.fullContentHTML || currentReadingItem.description || "";
            }
            textToRead = tempDiv.textContent || tempDiv.innerText || "";

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

            chrome.runtime.sendMessage({ command: 'generateSpeech', payload: { text: textToRead, voice: "af_bella" } }, (response) => {
                if (response.success && response.audioUrl) {
                    if (ttsAudioElement) { ttsAudioElement.pause(); ttsAudioElement.removeAttribute('src'); ttsAudioElement.load(); }
                    else { ttsAudioElement = new Audio(); }
                    ttsAudioElement.src = response.audioUrl;
                    ttsAudioElement.play().then(() => {
                        playSpeechBtn.disabled = false;
                        if(ttsLoadingIndicator) ttsLoadingIndicator.style.display = 'none';
                    }).catch(e => {
                        console.error("Audio playback error:", e);
                        alert("Error playing audio.");
                        playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                        playSpeechBtn.title = 'Read Aloud';
                        if(ttsLoadingIndicator) ttsLoadingIndicator.style.display = 'none';
                    });

                    ttsAudioElement.onended = () => { playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>'; playSpeechBtn.title = 'Read Aloud'; };
                    ttsAudioElement.onerror = (e) => { console.error("Audio element error:", e); alert("An error occurred while trying to play the audio."); playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>'; playSpeechBtn.title = 'Read Aloud'; };
                } else {
                    console.error("Error calling generateSpeech function:", response.error);
                    alert("Error generating speech: " + response.error.message);
                    playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                    playSpeechBtn.title = 'Read Aloud';
                    playSpeechBtn.disabled = false;
                    if(ttsLoadingIndicator) ttsLoadingIndicator.style.display = 'none';
                }
            });
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
                if (window.innerWidth < 768 && hamburgerMenu && hamburgerMenu.classList.contains('open')) toggleHamburgerMenu();
            }
        });
    }

    if (hamburgerFeedsList) {
        hamburgerFeedsList.addEventListener('click', (e) => {
            const editButton = e.target.closest('.edit-feed-name-btn');
            const unsubscribeButton = e.target.closest('.unsubscribe-feed-btn');
            const listItem = e.target.closest('li[data-filter-type="specificFeed"]');

            if (editButton) {
                e.stopPropagation();
                const feedUrl = editButton.dataset.feedUrl;
                const currentName = editButton.dataset.currentName;
                const newName = prompt(`Edit Feed Name:\n\nURL: ${escapeHtml(feedUrl)}`, currentName);
                if (newName && newName.trim() && newName.trim() !== currentName) {
                    chrome.runtime.sendMessage({ command: 'renameFeed', payload: { feedUrl, newName: newName.trim() } });
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
                if (window.innerWidth < 768 && hamburgerMenu && hamburgerMenu.classList.contains('open')) toggleHamburgerMenu();
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
                    updateActiveHamburgerFilter(); currentReadingItem = null;
                    if (readingPane && !readingPane.classList.contains('collapsed')) closeReadingPane();
                    if (searchInput) searchInput.value = '';
                    filterAndSortItems();
                }
            }
        });
    }

    if (feedsSectionToggle) feedsSectionToggle.addEventListener('click', () => { feedsSectionToggle.classList.toggle('collapsed'); hamburgerFeedsListWrapper.classList.toggle('collapsed', feedsSectionToggle.classList.contains('collapsed')); });

    if (articlesContainer) {
        articlesContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.article-card'); if (!card) return;
            const itemId = card.dataset.itemId;
            const itemType = card.dataset.itemType;
            const displayedIndex = parseInt(card.dataset.index, 10);
            const actionButton = e.target.closest('button[data-action]');

            if (actionButton) {
                e.stopPropagation(); const action = actionButton.dataset.action;
                if (itemType === 'article' && currentUser) {
                    const articleForAction = displayedItems.find(item => item.id === itemId && item.type === 'article');
                    if (articleForAction) {
                        if (action === 'toggle-favorite') handleToggleFavorite(articleForAction);
                        else if (action === 'toggle-read-later-card') handleToggleReadLater(articleForAction);
                        else if (action === 'delete') handleDeleteArticle(itemId);
                    }
                } else if (itemType === 'feedItem' && action === 'open-external') {
                    const feedItemToMark = displayedItems[displayedIndex];
                    if (feedItemToMark && !feedItemToMark.isRead) {
                        chrome.runtime.sendMessage({ command: 'markItemAsRead', payload: { itemId: feedItemToMark.id, itemType: 'feedItem' } });
                        card.classList.remove('unread'); card.classList.add('read');
                    }
                }
                return;
            }
            if (displayedIndex >= 0 && displayedIndex < displayedItems.length) {
                const itemToView = displayedItems[displayedIndex];
                currentReadingItem = itemToView;
                const refreshIcon = refreshArticleBtn ? refreshArticleBtn.querySelector('i') : null;
                if (refreshIcon) refreshIcon.classList.add('fa-spin');
                showArticleUI(itemToView).finally(() => { if (refreshIcon) refreshIcon.classList.remove('fa-spin'); });
                updateActiveCardState();
            }
        });
    }

    if (closeArticleBtn) closeArticleBtn.addEventListener('click', closeReadingPane);
    if (refreshArticleBtn) refreshArticleBtn.addEventListener('click', () => { if (currentReadingItem) { const icon = refreshArticleBtn.querySelector('i'); if (icon) icon.classList.add('fa-spin'); showArticleUI(currentReadingItem, true).finally(() => { if (icon) icon.classList.remove('fa-spin'); }); } });
    if (toggleAppearanceMenuBtn && appearanceDropdown) { toggleAppearanceMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); appearanceDropdown.classList.toggle('visible'); }); document.addEventListener('click', (e) => { if (!appearanceDropdown.contains(e.target) && !toggleAppearanceMenuBtn.contains(e.target)) appearanceDropdown.classList.remove('visible'); }); }
    if (toggleFullscreenReaderBtn) toggleFullscreenReaderBtn.addEventListener('click', toggleReaderFullscreen);
    if (markAsFavoriteBtn) markAsFavoriteBtn.addEventListener('click', () => handleToggleFavorite(currentReadingItem));
    if (toggleReadLaterBtn) toggleReadLaterBtn.addEventListener('click', () => handleToggleReadLater(currentReadingItem));
    if (deleteArticleReaderBtn) deleteArticleReaderBtn.addEventListener('click', () => { if (currentReadingItem && currentReadingItem.type === 'article') handleDeleteArticle(currentReadingItem.id); });
    if (decreaseFontBtn) decreaseFontBtn.addEventListener('click', () => changeFontSize(-1));
    if (increaseFontBtn) increaseFontBtn.addEventListener('click', () => changeFontSize(1));
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    if (searchInput) { searchInput.addEventListener('input', () => filterAndSortItems()); searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') searchInput.blur(); }); }

    if (sortFilterButton) {
        sortFilterButton.addEventListener('click', () => {
            const currentField = currentSort.field;
            if (currentFilter.type === 'page' && currentFilter.value === 'homeAll') { currentSort.field = (currentField === 'relevantDate') ? 'title' : 'relevantDate'; currentSort.order = (currentSort.field === 'title') ? 'asc' : 'desc'; }
            else if (currentFilter.type === 'page' && currentFilter.value === 'newFeeds') { if (currentField === 'pubDate') { currentSort.field = 'title'; } else if (currentField === 'title') { currentSort.field = 'feedTitle'; } else { currentSort.field = 'pubDate'; } currentSort.order = (currentSort.field === 'pubDate') ? 'desc' : 'asc'; }
            else if (currentFilter.type === 'specificFeed') { currentSort.field = (currentField === 'pubDate') ? 'title' : 'pubDate'; currentSort.order = (currentSort.field === 'title') ? 'asc' : 'desc'; }
            else { currentSort.field = (currentField === 'dateAdded') ? 'title' : 'dateAdded'; currentSort.order = (currentSort.field === 'title') ? 'asc' : 'desc'; }
            updateSortButtonIcon(); filterAndSortItems();
        });
    }

    // --- LISTENER PER AGGIORNAMENTI DAL BACKGROUND ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.command) {
            case 'readerDataUpdate':
                const { articles, subscriptions, feedItems } = message.payload;
                if (articles) allArticles = articles.map(a => ({ ...a, dateAdded: new Date(a.dateAdded.seconds * 1000), pubDate: a.pubDate ? new Date(a.pubDate.seconds * 1000) : null, relevantDate: a.pubDate ? new Date(a.pubDate.seconds * 1000) : new Date(a.dateAdded.seconds * 1000), type: 'article' }));
                if (subscriptions) { rssFeedsSubscriptions = subscriptions; renderHamburgerFeedsList(rssFeedsSubscriptions); }
                if (feedItems) allFeedItems = feedItems.map(item => ({ ...item, pubDate: item.pubDate ? new Date(item.pubDate) : new Date(0), type: 'feedItem' }));
                filterAndSortItems();
                break;
            case 'userDataUpdated': // Listen for user data changes (e.g., login/logout)
                // Re-initialize UI based on new user state
                chrome.runtime.sendMessage({ command: 'getReaderInitialData' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("READER ERRORE DI CONNESSIONE (userDataUpdated):", chrome.runtime.lastError.message);
                        app.innerHTML = `<p class="error-message" style="padding:20px; text-align:center;">Error loading application data. Please try reloading the extension.</p>`;
                        return;
                    }
                    if (response && response.success) {
                        initializeReaderUI(response.data);
                    } else {
                        console.error("READER ERRORE LOGICO (userDataUpdated):", response?.error);
                        app.innerHTML = `<p class="error-message" style="padding:20px; text-align:center;">Error loading application data. Please try reloading the extension.</p>`;
                    }
                });
                break;
        }
        return true;
    });

    // --- INIZIALIZZAZIONE ---
    chrome.runtime.sendMessage({ command: 'getReaderInitialData' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("READER ERRORE DI CONNESSIONE:", chrome.runtime.lastError.message);
            app.innerHTML = `<p class="error-message" style="padding:20px; text-align:center;">Error: Connection to background service failed. Please reload the extension.</p>`;
            return;
        }
        
        if (response && response.success) {
            // La richiesta è andata a buon fine, ora controlliamo i dati
            initializeReaderUI(response.data);
        } else {
            // Questo blocco ora gestisce solo errori imprevisti dal background
            console.error("READER ERRORE LOGICO:", response?.error);
            app.innerHTML = `<p class="error-message" style="padding:20px; text-align:center;">Error: Failed to load initial data from background.</p>`;
        }
    });

    setupTTSButton();
    setupRefreshFeedsButton();
    initMainLayoutResizer();
    chrome.runtime.sendMessage({ command: "clearReaderBadge" });
    chrome.runtime.connect({ name: "readerPageChannel" });
});
