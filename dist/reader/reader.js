// reader.js (Refactored for Manifest V3 - CSP Compliant & Robust)

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

    // --- UI ELEMENTS CACHING ---
    const ui = {
        app: document.getElementById('app'),
        hamburgerMenu: document.getElementById('hamburger-menu'),
        mainHeaderHamburgerBtn: document.getElementById('mainHeaderHamburgerBtn'),
        sidebarHeaderHamburgerBtn: document.getElementById('sidebarHeaderHamburgerBtn'),
        mainPagesList: document.getElementById('main-pages-list'),
        feedsSectionToggle: document.getElementById('feeds-section-toggle'),
        hamburgerFeedsListWrapper: document.getElementById('hamburger-feeds-list-wrapper'),
        hamburgerFeedsList: document.getElementById('hamburger-feeds-list'),
        quickNavHeader: document.getElementById('quick-nav-header'),
        readerMainContent: document.getElementById('reader-main-content'),
        readerContentWrapper: document.getElementById('reader-content-wrapper'),
        mainColumn: document.getElementById('main-column'),
        resizer: document.getElementById('resizer'),
        articlesContainer: document.getElementById('articlesContainer'),
        emptyStateMessage: document.querySelector('.empty-state-message'),
        searchInput: document.getElementById('searchInput'),
        sortFilterButton: document.getElementById('sortFilterButton'),
        readingPane: document.getElementById('reading-pane'),
        articleViewTitle: document.getElementById('articleViewTitle'),
        articleViewLink: document.getElementById('articleViewLink'),
        articleViewDate: document.getElementById('articleViewDate'),
        articleViewReadTime: document.getElementById('articleViewReadTime'),
        articleContent: document.getElementById('articleContent'),
        closeArticleBtn: document.getElementById('closeArticleBtn'),
        refreshArticleBtn: document.getElementById('refreshArticleBtn'),
        toggleAppearanceMenuBtn: document.getElementById('toggleAppearanceMenuBtn'),
        appearanceDropdown: document.getElementById('appearanceDropdown'),
        toggleFullscreenReaderBtn: document.getElementById('toggleFullscreenReader'),
        markAsFavoriteBtn: document.getElementById('markAsFavoriteBtn'),
        toggleReadLaterBtn: document.getElementById('toggleReadLaterBtn'),
        deleteArticleReaderBtn: document.getElementById('deleteArticleReaderBtn'),
        decreaseFontBtn: document.getElementById('decreaseFontBtn'),
        increaseFontBtn: document.getElementById('increaseFontBtn'),
        currentFontSizeLabel: document.getElementById('currentFontSizeLabel'),
        themeToggleBtn: document.getElementById('themeToggleBtn'),
    };

    let refreshFeedsUiButton;
    const rootStyles = document.documentElement ? getComputedStyle(document.documentElement) : {};
    const DEFAULT_READER_MAIN_COL_WIDTH = rootStyles.getPropertyValue ? (rootStyles.getPropertyValue('--main-column-default-basis').trim() || '35%') : '35%';
    let ttsAudioElement = null;
    let ttsLoadingIndicator = null;
    let playSpeechBtn = null;

    if (!ui.articlesContainer) console.error("Element articlesContainer NOT FOUND (reader.js)!");

    // --- HELPER & UTILITY FUNCTIONS ---
    const escapeHtml = (unsafe) => {
        if (typeof unsafe !== 'string') return '';
        return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    };
    const getYouTubeVideoId = (url) => {
        if (!url) return null;
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2] && match[2].length === 11) ? match[2] : null;
    };

    function createDOMElement(tag, options = {}) {
        const el = document.createElement(tag);
        if (options.className) el.className = options.className;
        if (options.id) el.id = options.id;
        if (options.textContent) el.textContent = options.textContent;
        if (options.innerHTML) el.innerHTML = options.innerHTML;
        if (options.title) el.title = options.title;
        if (options.src) el.src = options.src;
        if (options.alt) el.alt = options.alt;
        if (options.href) el.href = options.href;
        if (options.target) el.target = options.target;
        if (options.rel) el.rel = options.rel;
        if (options.dataset) {
            for (const key in options.dataset) {
                el.dataset[key] = options.dataset[key];
            }
        }
        if (options.style) {
            for (const prop in options.style) {
                el.style[prop] = options.style[prop];
            }
        }
        return el;
    }

    // --- EVENT HANDLERS (definiti prima di essere usati per risolvere ReferenceError) ---
    function handleDeleteArticle(articleId) {
        if (!currentUser || !articleId) return;
        if (confirm('Sei sicuro di voler eliminare questo articolo?')) {
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

    function toggleHamburgerMenu() {
        if (!ui.hamburgerMenu || !ui.readerMainContent) return;
        const isOpen = ui.hamburgerMenu.classList.contains('open');
        const shouldBeOpen = !isOpen;

        ui.hamburgerMenu.classList.toggle('open', shouldBeOpen);
        ui.hamburgerMenu.classList.toggle('closed', !shouldBeOpen);

        if (ui.mainHeaderHamburgerBtn) ui.mainHeaderHamburgerBtn.style.display = shouldBeOpen ? 'none' : 'inline-flex';
        if (ui.sidebarHeaderHamburgerBtn) ui.sidebarHeaderHamburgerBtn.style.display = shouldBeOpen ? 'inline-flex' : 'none';

        const newMarginLeft = shouldBeOpen ? 'var(--hamburger-opened-width)' : '0';
        ui.readerMainContent.style.marginLeft = newMarginLeft;
        ui.readerMainContent.style.width = `calc(100% - ${newMarginLeft})`;

        if (ui.mainColumn && ui.readingPane && ui.articlesContainer) {
            if (ui.readingPane.classList.contains('collapsed')) { ui.articlesContainer.classList.remove('main-column-narrowed'); }
            else { ui.articlesContainer.classList.add('main-column-narrowed'); }
        }
    }

    function filterAndSortItems() {
        if (!currentUser && currentFilter.type !== 'specificFeed') {
            if (ui.emptyStateMessage && ui.articlesContainer) {
                ui.articlesContainer.innerHTML = '';
                ui.articlesContainer.style.display = 'none';
                ui.emptyStateMessage.textContent = "Please log in to view and manage your saved articles and feeds.";
                ui.emptyStateMessage.style.display = 'block';
                displayedItems = [];
            }
            return;
        }

        let tempItems = [];
        const searchTerm = (ui.searchInput && ui.searchInput.value) ? ui.searchInput.value.trim().toLowerCase() : '';

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

    // --- RENDERING FUNCTIONS ---
    function renderArticleList() {
        if (!ui.articlesContainer) return;
        const fragment = document.createDocumentFragment();
        
        displayedItems.forEach((article, index) => {
            if (article.type !== 'article') return;

            const domain = article.url ? new URL(article.url).hostname.replace('www.', '') : (article.feedTitle || 'Saved Item');
            let imageUrl = article.imageUrl || '';
            const isVideo = getYouTubeVideoId(article.url);
            if (isVideo && !imageUrl) imageUrl = `https://img.youtube.com/vi/${isVideo}/mqdefault.jpg`;

            const card = createDOMElement('div', {
                className: `article-card vertical-layout ${article.source === 'feed' && !article.isRead ? 'unread-feed-article' : ''} ${isVideo ? 'video-type' : ''}`,
                dataset: { itemId: article.id, itemType: 'article', index }
            });

            const imageWrapper = createDOMElement('div', { className: 'card-image-top' });
            const placeholder = createDOMElement('div', { className: 'article-card-image-placeholder' });
            placeholder.appendChild(createDOMElement('i', { className: isVideo ? 'fas fa-play-circle' : (article.source === 'feed' ? 'fas fa-rss' : 'fas fa-archive') }));
            
            if (imageUrl) {
                const img = createDOMElement('img', { src: imageUrl, alt: article.title });
                img.onerror = () => { img.style.display = 'none'; placeholder.style.display = 'flex'; };
                placeholder.style.display = 'none';
                imageWrapper.appendChild(img);
            }
            imageWrapper.appendChild(placeholder);

            const contentWrapper = createDOMElement('div', { className: 'card-content-wrapper' });
            const titleActionsRow = createDOMElement('div', { className: 'card-title-actions-row' });
            const title = createDOMElement('h3', { className: 'article-card-title', title: article.title, textContent: article.title });
            
            const actions = createDOMElement('div', { className: 'card-actions-horizontal' });
            const favButton = createDOMElement('button', { className: `icon-btn card-action-favorite ${article.isFavorite ? 'active' : ''}`, title: article.isFavorite ? 'Unfavorite' : 'Favorite' });
            favButton.appendChild(createDOMElement('i', { className: article.isFavorite ? 'fas fa-star' : 'far fa-star' }));
            favButton.addEventListener('click', (e) => { e.stopPropagation(); handleToggleFavorite(article); });

            const readLaterButton = createDOMElement('button', { className: `icon-btn card-action-read-later ${article.isReadLater ? 'active' : ''}`, title: article.isReadLater ? 'Remove from Read Later' : 'Add to Read Later' });
            readLaterButton.appendChild(createDOMElement('i', { className: article.isReadLater ? 'fas fa-bookmark' : 'far fa-bookmark' }));
            readLaterButton.addEventListener('click', (e) => { e.stopPropagation(); handleToggleReadLater(article); });

            const deleteButton = createDOMElement('button', { className: 'icon-btn card-action-delete', title: 'Delete' });
            deleteButton.appendChild(createDOMElement('i', { className: 'fas fa-trash-alt' }));
            deleteButton.addEventListener('click', (e) => { e.stopPropagation(); handleDeleteArticle(article.id); });

            actions.append(favButton, readLaterButton, deleteButton);
            titleActionsRow.append(title, actions);

            let excerptText = article.excerpt || "";
            if (excerptText.length === 0 && article.content && typeof article.content === 'string' && article.content.length > 20) {
                excerptText = article.content.replace(/<[^>]+>/g, '').substring(0, 150) + "...";
            }
            const excerpt = createDOMElement('p', { className: 'article-card-excerpt', title: excerptText, textContent: excerptText });

            const meta = createDOMElement('div', { className: 'article-card-meta-bottom' });
            const urlDisplay = createDOMElement('span', { className: 'article-card-url-display', title: domain, textContent: domain });
            const readTimeMinutes = isVideo ? 1 : Math.ceil((article.content || article.textContent || "").split(/\s+/).length / 200);
            const readTime = createDOMElement('span', { className: 'article-card-read-time', textContent: readTimeMinutes > 0 ? `${readTimeMinutes} min read` : '' });
            const dateDisplay = createDOMElement('span', { className: 'article-card-date-added', textContent: (article.pubDate || article.dateAdded).toLocaleDateString() });
            meta.append(urlDisplay, readTime, dateDisplay);

            contentWrapper.append(titleActionsRow, excerpt, meta);
            card.append(imageWrapper, contentWrapper);
            fragment.appendChild(card);
        });

        ui.articlesContainer.innerHTML = '';
        ui.articlesContainer.appendChild(fragment);
    }

    function renderFeedItemList() {
        if (!ui.articlesContainer) return;
        const fragment = document.createDocumentFragment();

        displayedItems.forEach((item, index) => {
            if (item.type !== 'feedItem') return;

            const card = createDOMElement('div', {
                className: `article-card detailed-card feed-item-card ${!item.isRead ? 'unread' : 'read'}`,
                dataset: { itemId: item.id, itemType: 'feedItem', index }
            });

            const contentWrapper = createDOMElement('div', { className: 'article-card-content' });
            const title = createDOMElement('h3', { className: 'article-card-title', textContent: item.title || 'No Title' });
            
            let descriptionText = item.description || item.summary || '';
            if (descriptionText) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = descriptionText;
                descriptionText = (tempDiv.textContent || tempDiv.innerText || "").substring(0, 150) + "...";
            } else {
                descriptionText = "No summary available.";
            }
            const excerpt = createDOMElement('p', { className: 'article-card-excerpt', textContent: descriptionText });

            const meta = createDOMElement('div', { className: 'article-card-meta' });
            const domain = createDOMElement('span', { className: 'article-card-domain', title: `Source: ${item.feedTitle}`, textContent: item.feedTitle });
            const date = createDOMElement('span', { className: 'article-card-date', textContent: item.pubDate ? new Date(item.pubDate).toLocaleDateString() : 'No Date' });
            
            const externalLink = createDOMElement('a', {
                className: 'icon-btn feed-item-external-link',
                href: item.link,
                target: '_blank',
                rel: 'noopener noreferrer',
                title: 'Open original in new tab'
            });
            externalLink.appendChild(createDOMElement('i', { className: 'fas fa-external-link-alt' }));
            externalLink.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!item.isRead) {
                    chrome.runtime.sendMessage({ command: 'markItemAsRead', payload: { itemId: item.id, itemType: 'feedItem' } });
                    card.classList.remove('unread');
                    card.classList.add('read');
                }
            });

            meta.append(domain, date, externalLink);
            contentWrapper.append(title, excerpt, meta);
            card.appendChild(contentWrapper);
            fragment.appendChild(card);
        });

        ui.articlesContainer.innerHTML = '';
        ui.articlesContainer.appendChild(fragment);
    }

    function renderItems() {
        if (!ui.articlesContainer || !ui.emptyStateMessage) {
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
            if (ui.searchInput && ui.searchInput.value.trim()) message = "No results for your search.";
            ui.emptyStateMessage.textContent = message; 
            ui.emptyStateMessage.style.display = 'block';
            ui.articlesContainer.innerHTML = ''; 
            ui.articlesContainer.style.display = 'none';
        } else {
            ui.emptyStateMessage.style.display = 'none'; 
            ui.articlesContainer.style.display = 'grid';
            if (isArticleBasedView) renderArticleList();
            else if (isSpecificFeedView) renderFeedItemList();
            else ui.articlesContainer.innerHTML = '';
        }
        updateActiveCardState();
    }

    // --- UI LOGIC & STATE MANAGEMENT ---
    function applyTheme() {
        if (!document.documentElement || !ui.themeToggleBtn) return;
        document.documentElement.setAttribute('data-theme', readingSettings.theme);
        const themeIcon = ui.themeToggleBtn.querySelector('i');
        if (themeIcon) {
            themeIcon.className = readingSettings.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        }
    }

    async function saveReadingSettings() {
        try {
            await chrome.storage.local.set({ [STORAGE_KEY_READING_SETTINGS]: readingSettings });
        } catch (error) { console.error("Error saving reading settings (reader.js):", error); }
    }

    async function saveLayoutData() {
        if (!ui.mainColumn || !ui.readingPane || ui.readingPane.classList.contains('collapsed')) return;
        try {
            await chrome.storage.local.set({ [STORAGE_KEY_READER_MAIN_COL_WIDTH]: ui.mainColumn.style.flexBasis || DEFAULT_READER_MAIN_COL_WIDTH });
        } catch (error) { console.error("Error saving layout data (reader.js):", error); }
    }

    function updateActiveHamburgerFilter() {
        if (ui.mainPagesList) {
            ui.mainPagesList.querySelectorAll('li').forEach(li => {
                const isActive = currentFilter.type === 'page' && li.dataset.filterValue === currentFilter.value;
                li.classList.toggle('active-filter', isActive);
            });
        }
        if (ui.hamburgerFeedsList) {
            ui.hamburgerFeedsList.querySelectorAll('li').forEach(li => {
                const isActive = currentFilter.type === 'specificFeed' && li.dataset.filterValue === currentFilter.value;
                li.classList.toggle('active-filter', isActive);
            });
        }
        if (ui.quickNavHeader) {
            ui.quickNavHeader.querySelectorAll('.quick-nav-btn').forEach(btn => {
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
        if (!ui.sortFilterButton) return; const icon = ui.sortFilterButton.querySelector('i'); if (!icon) return;
        ui.sortFilterButton.style.display = 'inline-flex'; let title = 'Sort';
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
        ui.sortFilterButton.title = title;
    }

    function updateActiveCardState() {
        if (!ui.articlesContainer || !displayedItems) return;
        ui.articlesContainer.querySelectorAll('.article-card.active').forEach(card => card.classList.remove('active'));
        if (currentReadingItem && ui.readingPane && !ui.readingPane.classList.contains('collapsed')) {
            const activeCard = ui.articlesContainer.querySelector(`.article-card[data-item-id="${escapeHtml(currentReadingItem.id)}"][data-item-type="${escapeHtml(currentReadingItem.type)}"]`);
            if (activeCard) activeCard.classList.add('active');
        }
    }

    function showArticleUI(itemData, forceRefreshContent = false) {
        if (!ui.readingPane || !ui.articleViewTitle || !ui.articleContent || !ui.articleViewLink) return;
        if (itemData.type === 'article' && !currentUser) {
            ui.articleContent.innerHTML = '<p>Please log in to view this article.</p>';
            if (playSpeechBtn) playSpeechBtn.style.display = 'none';
            return;
        }

        currentReadingItem = itemData;
        openArticleView();
        ui.articleViewTitle.textContent = itemData.title || 'No Title';
        const itemUrl = itemData.url || itemData.link || '#';
        const youtubeVideoId = getYouTubeVideoId(itemUrl);
        ui.articleViewLink.href = itemUrl;
        ui.articleViewLink.textContent = youtubeVideoId ? 'Watch on YouTube' : (itemUrl !== '#' ? 'Read Original' : 'No Link');

        let dateToDisplayStr = '';
        if (itemData.type === 'article') dateToDisplayStr = (itemData.pubDate || itemData.dateAdded) ? new Date(itemData.pubDate || itemData.dateAdded).toLocaleString() : '';
        else if (itemData.type === 'feedItem' && itemData.pubDate) dateToDisplayStr = new Date(itemData.pubDate).toLocaleString();
        ui.articleViewDate.textContent = dateToDisplayStr;

        let textContentForReadTime = (itemData.type === 'article') ? (itemData.content || "") : (itemData.description || itemData.summary || itemData.fullContentHTML || "");
        let readTimeMinutes = youtubeVideoId ? 1 : Math.ceil(textContentForReadTime.split(/\s+/).length / 200);
        ui.articleViewReadTime.textContent = readTimeMinutes > 0 ? `${readTimeMinutes} min read` : '';

        const oldLoadBtn = document.getElementById('dynamicLoadFullContentBtn');
        if (oldLoadBtn) oldLoadBtn.remove();
        ui.articleContent.innerHTML = '';
        let contentDisplayed = false;

        const loadFullContentUtility = (url, targetItem) => {
            ui.articleContent.innerHTML = '<p>Loading full content...</p>';
            chrome.runtime.sendMessage({ command: 'fetchWithReadability', url: url }, (response) => {
                if (response && response.success && response.article) {
                    ui.articleContent.innerHTML = response.article.content;
                    chrome.runtime.sendMessage({ command: 'updateItemContent', payload: { itemId: targetItem.id, itemType: targetItem.type, newContent: response.article.content } });
                } else {
                    let fallbackContent = (targetItem.type === 'article') ? targetItem.content : (targetItem.fullContentHTML || targetItem.description);
                    ui.articleContent.innerHTML = `<p><i>Could not load full content. Error: ${response ? response.error : 'Unknown'}</i></p><br>${fallbackContent || ''}`;
                }
            });
        };

        if (youtubeVideoId) {
            ui.articleContent.innerHTML = `<div class="youtube-video-container"><iframe src="https://www.youtube-nocookie.com/embed/${youtubeVideoId}?rel=0&modestbranding=1&autoplay=0" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
            contentDisplayed = true;
        } else if (forceRefreshContent && itemUrl && itemUrl !== '#') {
            loadFullContentUtility(itemUrl, itemData);
            contentDisplayed = true;
        } else if (itemData.type === 'article' && itemData.content) {
            ui.articleContent.innerHTML = (itemData.source === 'manual' && typeof window.marked?.parse === 'function' && !itemData.content.trim().startsWith('<')) ? window.marked.parse(itemData.content) : itemData.content;
            contentDisplayed = true;
        } else if (itemData.type === 'feedItem') {
            if (itemData.contentFromReadability) { ui.articleContent.innerHTML = itemData.contentFromReadability; contentDisplayed = true; }
            else if (itemData.fullContentHTML) { ui.articleContent.innerHTML = itemData.fullContentHTML; contentDisplayed = true; }
            else if (itemData.description) {
                const tempDiv = document.createElement('div'); tempDiv.innerHTML = itemData.description;
                ui.articleContent.innerHTML = (tempDiv.children.length > 0 || tempDiv.innerHTML.match(/<[a-z][\s\S]*>/i)) ? itemData.description : `<p>${escapeHtml(itemData.description)}</p>`;
                contentDisplayed = true;
            }

            if (itemUrl !== '#' && !itemData.contentFromReadability) {
                const loadButton = createDOMElement('button', { id: 'dynamicLoadFullContentBtn', className: 'action-btn', textContent: 'Load Full Content', style: { margin: '15px auto', display: 'block' } });
                loadButton.addEventListener('click', () => { loadButton.remove(); loadFullContentUtility(itemUrl, itemData); });
                if (ui.articleContent.firstChild) ui.articleContent.insertBefore(loadButton, ui.articleContent.firstChild);
                else ui.articleContent.appendChild(loadButton);
            }
        }

        if (!contentDisplayed && !forceRefreshContent) ui.articleContent.innerHTML = '<p>Content not available.</p>';

        if (itemData.type === 'article') {
            ui.markAsFavoriteBtn.style.display = 'inline-flex'; ui.toggleReadLaterBtn.style.display = 'inline-flex'; ui.deleteArticleReaderBtn.style.display = 'inline-flex';
            ui.markAsFavoriteBtn.classList.toggle('active', !!itemData.isFavorite);
            ui.markAsFavoriteBtn.querySelector('i').className = itemData.isFavorite ? 'fas fa-star' : 'far fa-star';
            ui.markAsFavoriteBtn.title = itemData.isFavorite ? 'Remove Favorite' : 'Add to Favorites';
            ui.toggleReadLaterBtn.classList.toggle('active', !!itemData.isReadLater);
            ui.toggleReadLaterBtn.querySelector('i').className = itemData.isReadLater ? 'fas fa-bookmark' : 'far fa-bookmark';
            ui.toggleReadLaterBtn.title = itemData.isReadLater ? 'Remove from Read Later' : 'Add to Read Later';
        } else {
            ui.markAsFavoriteBtn.style.display = 'none'; ui.toggleReadLaterBtn.style.display = 'none'; ui.deleteArticleReaderBtn.style.display = 'none';
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
            const cardInList = ui.articlesContainer.querySelector(`.article-card[data-item-id="${escapeHtml(itemData.id)}"]`);
            if (cardInList) { cardInList.classList.remove('unread', 'unread-feed-article'); cardInList.classList.add('read'); }
        }
        updateActiveCardState();
    }

    function closeReadingPane() {
        if (ui.readingPane.classList.contains('fullscreen')) toggleReaderFullscreen();
        if (ui.readingPane && ui.mainColumn && ui.readerContentWrapper && ui.articlesContainer) {
            ui.readingPane.classList.add('collapsed');
            ui.readerContentWrapper.classList.add('reading-pane-collapsed-wrapper');
            ui.mainColumn.style.flexBasis = '100%';
            ui.articlesContainer.classList.remove('main-column-narrowed');
            currentReadingItem = null; updateActiveCardState();
            if (ui.articleContent) ui.articleContent.innerHTML = '';
            if (ui.appearanceDropdown) ui.appearanceDropdown.classList.remove('visible');
            if (playSpeechBtn) playSpeechBtn.style.display = 'none';
            if (ttsAudioElement && !ttsAudioElement.paused) {
                ttsAudioElement.pause();
                if(playSpeechBtn) { playSpeechBtn.innerHTML = '<i class="fas fa-volume-up"></i>'; playSpeechBtn.title = 'Read Aloud'; }
            }
        }
    }

    function openArticleView() {
        if (ui.readingPane && ui.mainColumn && ui.readerContentWrapper && ui.articlesContainer) {
            ui.readingPane.classList.remove('collapsed');
            ui.readerContentWrapper.classList.remove('reading-pane-collapsed-wrapper');
            ui.articlesContainer.classList.add('main-column-narrowed');
            chrome.storage.local.get(STORAGE_KEY_READER_MAIN_COL_WIDTH, (data) => {
                ui.mainColumn.style.flexBasis = data[STORAGE_KEY_READER_MAIN_COL_WIDTH] || DEFAULT_READER_MAIN_COL_WIDTH;
            });
        }
    }

    function toggleReaderFullscreen() {
        if (!ui.readingPane || !ui.toggleFullscreenReaderBtn) return;
        const willBeFullscreen = !ui.readingPane.classList.contains('fullscreen');
        ui.readingPane.classList.toggle('fullscreen', willBeFullscreen);
        ui.toggleFullscreenReaderBtn.querySelector('i').className = willBeFullscreen ? 'fas fa-compress' : 'fas fa-expand';
        ui.toggleFullscreenReaderBtn.title = willBeFullscreen ? "Exit Fullscreen" : "Fullscreen";
        if (ui.closeArticleBtn) ui.closeArticleBtn.style.display = willBeFullscreen ? 'none' : 'inline-flex';
        if (ui.mainColumn) ui.mainColumn.style.display = willBeFullscreen ? 'none' : 'flex';
        if (ui.resizer) ui.resizer.style.display = willBeFullscreen ? 'none' : 'block';
    }

    async function changeFontSize(delta) {
        const newSize = readingSettings.fontSize + delta;
        if (newSize >= 10 && newSize <= 30) {
            readingSettings.fontSize = newSize;
            if (ui.articleContent) ui.articleContent.style.fontSize = `${readingSettings.fontSize}px`;
            if (ui.currentFontSizeLabel) ui.currentFontSizeLabel.textContent = `${readingSettings.fontSize}px`;
            await saveReadingSettings();
        }
    }

    async function toggleTheme() {
        readingSettings.theme = readingSettings.theme === 'light' ? 'dark' : 'light';
        applyTheme(); await saveReadingSettings();
    }

    function initMainLayoutResizer() {
        if (!ui.resizer || !ui.mainColumn || !ui.readingPane || !ui.readerContentWrapper) return;
        let startX, startWidthMain;
        function onMouseMove(e) {
            const dx = e.clientX - startX; let newMainWidth = startWidthMain + dx;
            const containerWidth = ui.readerContentWrapper.offsetWidth; const resizerWidthVal = ui.resizer.offsetWidth;
            const minPaneWidth = 300; const minMainColWidth = 280;
            if (newMainWidth < minMainColWidth) newMainWidth = minMainColWidth;
            if (containerWidth - newMainWidth - resizerWidthVal < minPaneWidth) newMainWidth = containerWidth - minPaneWidth - resizerWidthVal;
            ui.mainColumn.style.flexBasis = `${newMainWidth}px`;
        }
        function onMouseUp() {
            document.body.classList.remove('is-resizing');
            document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp);
            saveLayoutData();
        }
        ui.resizer.addEventListener('mousedown', (e) => {
            if (ui.readingPane.classList.contains('collapsed')) return;
            document.body.classList.add('is-resizing'); startX = e.clientX; startWidthMain = ui.mainColumn.offsetWidth;
            document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        });
    }

    function setupRefreshFeedsButton() {
        let existingButton = document.getElementById('refreshFeedsButtonReader');
        if (existingButton) { refreshFeedsUiButton = existingButton; }
        else if (ui.sortFilterButton && ui.sortFilterButton.parentElement) {
            refreshFeedsUiButton = createDOMElement('button', { id: 'refreshFeedsButtonReader', className: 'icon-btn', title: 'Refresh All Feeds', innerHTML: '<i class="fas fa-sync-alt"></i>', style: { marginLeft: '8px' } });
            ui.sortFilterButton.parentElement.insertBefore(refreshFeedsUiButton, ui.sortFilterButton.nextSibling);
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

    function setupTTSButton() {
        const readingPaneToolbar = document.querySelector('#reading-pane .toolbar');
        if (!readingPaneToolbar) return;

        playSpeechBtn = createDOMElement('button', { className: 'icon-btn', id: 'playSpeechBtn', title: 'Read Aloud', innerHTML: '<i class="fas fa-volume-up"></i>', style: { display: 'none' } });
        ttsLoadingIndicator = createDOMElement('span', { id: 'ttsLoadingIndicator', innerHTML: '<i class="fas fa-spinner fa-spin"></i>', style: { display: 'none', marginLeft: '8px', color: 'var(--popup-icon-color)' } });

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
                tempDiv.innerHTML = (currentReadingItem.source === 'manual' && typeof window.marked?.parse === 'function' && !currentReadingItem.content.trim().startsWith('<')) ? window.marked.parse(currentReadingItem.content || "") : (currentReadingItem.content || "");
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

    // --- EVENT LISTENERS SETUP ---
    function setupEventListeners() {
        if (ui.mainHeaderHamburgerBtn) ui.mainHeaderHamburgerBtn.addEventListener('click', toggleHamburgerMenu);
        if (ui.sidebarHeaderHamburgerBtn) ui.sidebarHeaderHamburgerBtn.addEventListener('click', toggleHamburgerMenu);

        if (ui.mainPagesList) {
            ui.mainPagesList.addEventListener('click', (e) => {
                const listItem = e.target.closest('li[data-filter-type="page"]');
                if (listItem && !listItem.classList.contains('active-filter')) {
                    currentFilter = { type: 'page', value: listItem.dataset.filterValue };
                    updateActiveHamburgerFilter(); currentReadingItem = null;
                    if (ui.readingPane && !ui.readingPane.classList.contains('collapsed')) closeReadingPane();
                    if (ui.searchInput) ui.searchInput.value = '';
                    filterAndSortItems();
                    if (window.innerWidth < 768 && ui.hamburgerMenu && ui.hamburgerMenu.classList.contains('open')) toggleHamburgerMenu();
                }
            });
        }

        if (ui.hamburgerFeedsList) {
            ui.hamburgerFeedsList.addEventListener('click', (e) => {
                const listItem = e.target.closest('li[data-filter-type="specificFeed"]');
                if (listItem && !listItem.classList.contains('empty-nav-item') && !listItem.classList.contains('active-filter')) {
                    currentFilter = { type: 'specificFeed', value: listItem.dataset.filterValue };
                    updateActiveHamburgerFilter(); currentReadingItem = null;
                    if (ui.readingPane && !ui.readingPane.classList.contains('collapsed')) closeReadingPane();
                    if (ui.searchInput) ui.searchInput.value = '';
                    filterAndSortItems();
                    if (window.innerWidth < 768 && ui.hamburgerMenu && ui.hamburgerMenu.classList.contains('open')) toggleHamburgerMenu();
                }
            });
        }

        if (ui.quickNavHeader) {
            ui.quickNavHeader.addEventListener('click', (e) => {
                const button = e.target.closest('.quick-nav-btn[data-filter-type="page"]');
                if (button) {
                    const filterValue = button.dataset.filterValue;
                    if (!(currentFilter.type === 'page' && currentFilter.value === filterValue)) {
                        currentFilter = { type: 'page', value: filterValue };
                        updateActiveHamburgerFilter(); currentReadingItem = null;
                        if (ui.readingPane && !ui.readingPane.classList.contains('collapsed')) closeReadingPane();
                        if (ui.searchInput) ui.searchInput.value = '';
                        filterAndSortItems();
                    }
                }
            });
        }

        if (ui.feedsSectionToggle) ui.feedsSectionToggle.addEventListener('click', () => { ui.feedsSectionToggle.classList.toggle('collapsed'); ui.hamburgerFeedsListWrapper.classList.toggle('collapsed', ui.feedsSectionToggle.classList.contains('collapsed')); });

        if (ui.articlesContainer) {
            ui.articlesContainer.addEventListener('click', (e) => {
                const card = e.target.closest('.article-card[data-item-id]');
                if (!card) return;
                const itemId = card.dataset.itemId;
                const itemType = card.dataset.itemType;
                const item = displayedItems.find(i => i.id === itemId && i.type === itemType);
                if (item) {
                    currentReadingItem = item;
                    showArticleUI(item);
                }
            });
        }

        if (ui.closeArticleBtn) ui.closeArticleBtn.addEventListener('click', closeReadingPane);
        if (ui.refreshArticleBtn) ui.refreshArticleBtn.addEventListener('click', () => { if (currentReadingItem) { const icon = ui.refreshArticleBtn.querySelector('i'); if (icon) icon.classList.add('fa-spin'); showArticleUI(currentReadingItem, true).finally(() => { if (icon) icon.classList.remove('fa-spin'); }); } });
        if (ui.toggleAppearanceMenuBtn && ui.appearanceDropdown) { ui.toggleAppearanceMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); ui.appearanceDropdown.classList.toggle('visible'); }); document.addEventListener('click', (e) => { if (!ui.appearanceDropdown.contains(e.target) && !ui.toggleAppearanceMenuBtn.contains(e.target)) ui.appearanceDropdown.classList.remove('visible'); }); }
        if (ui.toggleFullscreenReaderBtn) ui.toggleFullscreenReaderBtn.addEventListener('click', toggleReaderFullscreen);
        if (ui.markAsFavoriteBtn) ui.markAsFavoriteBtn.addEventListener('click', () => handleToggleFavorite(currentReadingItem));
        if (ui.toggleReadLaterBtn) ui.toggleReadLaterBtn.addEventListener('click', () => handleToggleReadLater(currentReadingItem));
        if (ui.deleteArticleReaderBtn) ui.deleteArticleReaderBtn.addEventListener('click', () => { if (currentReadingItem && currentReadingItem.type === 'article') handleDeleteArticle(currentReadingItem.id); });
        if (ui.decreaseFontBtn) ui.decreaseFontBtn.addEventListener('click', () => changeFontSize(-1));
        if (ui.increaseFontBtn) ui.increaseFontBtn.addEventListener('click', () => changeFontSize(1));
        if (ui.themeToggleBtn) ui.themeToggleBtn.addEventListener('click', toggleTheme);
        if (ui.searchInput) { ui.searchInput.addEventListener('input', () => filterAndSortItems()); ui.searchInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') ui.searchInput.blur(); }); }

        if (ui.sortFilterButton) {
            ui.sortFilterButton.addEventListener('click', () => {
                const currentField = currentSort.field;
                if (currentFilter.type === 'page' && currentFilter.value === 'homeAll') { currentSort.field = (currentField === 'relevantDate') ? 'title' : 'relevantDate'; currentSort.order = (currentSort.field === 'title') ? 'asc' : 'desc'; }
                else if (currentFilter.type === 'page' && currentFilter.value === 'newFeeds') { if (currentField === 'pubDate') { currentSort.field = 'title'; } else if (currentField === 'title') { currentSort.field = 'feedTitle'; } else { currentSort.field = 'pubDate'; } currentSort.order = (currentSort.field === 'pubDate') ? 'desc' : 'asc'; }
                else if (currentFilter.type === 'specificFeed') { currentSort.field = (currentField === 'pubDate') ? 'title' : 'pubDate'; currentSort.order = (currentSort.field === 'title') ? 'asc' : 'desc'; }
                else { currentSort.field = (currentField === 'dateAdded') ? 'title' : 'dateAdded'; currentSort.order = (currentSort.field === 'title') ? 'asc' : 'desc'; }
                updateSortButtonIcon(); filterAndSortItems();
            });
        }
    }

    // --- BACKGROUND MESSAGE LISTENER ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.command) {
            case 'readerDataUpdate':
                const { articles, subscriptions, feedItems } = message.payload;
                if (articles) allArticles = articles.map(a => ({ ...a, dateAdded: new Date(a.dateAdded.seconds * 1000), pubDate: a.pubDate ? new Date(a.pubDate.seconds * 1000) : null, relevantDate: a.pubDate ? new Date(a.pubDate.seconds * 1000) : new Date(a.dateAdded.seconds * 1000), type: 'article' }));
                if (subscriptions) { rssFeedsSubscriptions = subscriptions; renderHamburgerFeedsList(rssFeedsSubscriptions); }
                if (feedItems) allFeedItems = feedItems.map(item => ({ ...item, pubDate: item.pubDate ? new Date(item.pubDate) : new Date(0), type: 'feedItem' }));
                filterAndSortItems();
                break;
            case 'userDataUpdated':
                chrome.runtime.sendMessage({ command: 'getReaderInitialData' }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error("READER CONNECTION ERROR (userDataUpdated):", chrome.runtime.lastError.message);
                        ui.app.innerHTML = `<p class="error-message" style="padding:20px; text-align:center;">Error loading application data. Please try reloading the extension.</p>`;
                        return;
                    }
                    if (response && response.success) {
                        initializeReaderUI(response.data);
                    } else {
                        console.error("READER LOGIC ERROR (userDataUpdated):", response?.error);
                        ui.app.innerHTML = `<p class="error-message" style="padding:20px; text-align:center;">Error loading application data. Please try reloading the extension.</p>`;
                    }
                });
                break;
        }
        return true;
    });

    // --- INITIALIZATION ---
    function initializeReaderUI(initialData) {
        currentUser = initialData.user;
        allArticles = (initialData.articles || []).map(a => ({ ...a, dateAdded: new Date(a.dateAdded.seconds * 1000), pubDate: a.pubDate ? new Date(a.pubDate.seconds * 1000) : null, relevantDate: a.pubDate ? new Date(a.pubDate.seconds * 1000) : new Date(a.dateAdded.seconds * 1000), type: 'article' }));
        allFeedItems = (initialData.feedItems || []).map(item => ({ ...item, pubDate: item.pubDate ? new Date(item.pubDate) : new Date(0), type: 'feedItem' }));
        rssFeedsSubscriptions = initialData.subscriptions || {};
        filterAndSortItems();
    }

    function initializeReader() {
        chrome.runtime.sendMessage({ command: 'getReaderInitialData' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("READER CONNECTION ERROR:", chrome.runtime.lastError.message);
                ui.app.innerHTML = `<p class="error-message" style="padding:20px; text-align:center;">Error: Connection to background service failed. Please reload the extension.</p>`;
                return;
            }
            
            if (response && response.success) {
                initializeReaderUI(response.data);
            } else {
                console.error("READER LOGIC ERROR:", response?.error);
                ui.app.innerHTML = `<p class="error-message" style="padding:20px; text-align:center;">Error: Failed to load initial data from background.</p>`;
            }
        });

        setupEventListeners();
        setupTTSButton();
        setupRefreshFeedsButton();
        initMainLayoutResizer();
        chrome.runtime.sendMessage({ command: "clearReaderBadge" });
        chrome.runtime.connect({ name: "readerPageChannel" });
    }

    initializeReader();
});
