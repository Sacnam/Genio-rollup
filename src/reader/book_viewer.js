// reader/book_viewer.js
import '../foliate-js/view.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Elementi UI
    const foliateBookView = document.getElementById('foliateBookView');
    const prevPageBtn = document.getElementById('prevPageBtn');
    const nextPageBtn = document.getElementById('nextPageBtn');
    const pageControlsContainer = document.querySelector('.page-viewer-controls'); // Contenitore dei pulsanti di pagina

    const closeBookBtn = document.getElementById('closeBookBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const tocBtn = document.getElementById('tocBtn');
    const tocPanel = document.getElementById('tocPanel');
    const tocList = document.getElementById('tocList');
    const closeTocPanelBtn = document.getElementById('closeTocPanelBtn');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const scrollToggleBtn = document.getElementById('scrollToggleBtn');

    // Stato
    const STORAGE_KEY_READER_BOOKS = 'readerBooks';
    const STORAGE_KEY_BOOK_FILES = 'readerBookFiles';
    const STORAGE_KEY_VIEWER_THEME = 'bookViewerTheme';
    const STORAGE_KEY_VIEWER_FLOW = 'bookViewerFlow';

    let currentBookId = null;
    let currentCfi = null;
    let currentViewerTheme = (await chrome.storage.local.get(STORAGE_KEY_VIEWER_THEME))[STORAGE_KEY_VIEWER_THEME] || 'light';
    let currentFlowMode = (await chrome.storage.local.get(STORAGE_KEY_VIEWER_FLOW))[STORAGE_KEY_VIEWER_FLOW] || 'paginated';

    // --- INIZIALIZZAZIONE ---
    if (!foliateBookView || !pageControlsContainer || !closeBookBtn || !loadingIndicator || !tocBtn || !tocPanel || !tocList || !closeTocPanelBtn || !themeToggleBtn || !scrollToggleBtn) {
        console.error("Uno o più elementi UI essenziali non trovati in book_viewer.html!");
        if(loadingIndicator) {
            loadingIndicator.textContent = 'Errore: Elementi UI mancanti.';
            loadingIndicator.style.display = 'block';
        }
        return;
    }

    applyPageTheme();
    updateFlowMode();
    loadAndOpenBook();

    // --- GESTIONE TEMA ---
    function applyPageTheme() {
        document.body.classList.toggle('dark-theme', currentViewerTheme === 'dark');
        themeToggleBtn.querySelector('i').className = currentViewerTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
        injectContentStyles(); // Riapplica stili al contenuto del libro
    }

    themeToggleBtn.addEventListener('click', () => {
        currentViewerTheme = currentViewerTheme === 'light' ? 'dark' : 'light';
        chrome.storage.local.set({ [STORAGE_KEY_VIEWER_THEME]: currentViewerTheme });
        applyPageTheme();
    });

    // --- GESTIONE MODALITÀ SCORRIMENTO/PAGINAZIONE ---
    function updateFlowMode() {
        foliateBookView.setAttribute('flow', currentFlowMode);
        pageControlsContainer.style.display = currentFlowMode === 'paginated' ? 'flex' : 'none';
        scrollToggleBtn.querySelector('i').className = currentFlowMode === 'scrolled' ? 'fas fa-book-open' : 'fas fa-arrows-alt-v'; // Esempio icone
        scrollToggleBtn.title = currentFlowMode === 'scrolled' ? 'Modalità Paginata' : 'Modalità Scorrimento';
        console.log("Flow mode impostato a:", currentFlowMode);
    }

    scrollToggleBtn.addEventListener('click', () => {
        currentFlowMode = currentFlowMode === 'paginated' ? 'scrolled' : 'paginated';
        chrome.storage.local.set({ [STORAGE_KEY_VIEWER_FLOW]: currentFlowMode });
        updateFlowMode();
    });


    // --- GESTIONE INDICE (TOC) ---
    tocBtn.addEventListener('click', () => {
        const book = foliateBookView.book; // Accedi alla proprietà 'book' dell'elemento foliate-view
        if (book && book.toc && book.toc.length > 0) {
            renderToc(book.toc, tocList);
            tocPanel.classList.add('visible');
        } else {
            alert("Indice non disponibile per questo libro.");
        }
    });

    closeTocPanelBtn.addEventListener('click', () => {
        tocPanel.classList.remove('visible');
    });

    function renderToc(tocItems, parentElement) {
        parentElement.innerHTML = ''; // Pulisci
        tocItems.forEach(item => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = '#';
            a.textContent = item.label.trim();
            a.dataset.destination = item.href; // Foliate usa questo per la navigazione
            
            a.addEventListener('click', async (e) => {
                e.preventDefault();
                const destination = e.target.dataset.destination;
                if (destination) {
                    try {
                        await foliateBookView.goTo(destination);
                        tocPanel.classList.remove('visible'); // Chiudi TOC dopo navigazione
                    } catch (err) {
                        console.error("Errore navigazione TOC:", destination, err);
                        alert("Impossibile navigare a questa sezione dell'indice.");
                    }
                }
            });
            li.appendChild(a);
            if (item.subitems && item.subitems.length > 0) {
                const subUl = document.createElement('ul');
                renderToc(item.subitems, subUl);
                li.appendChild(subUl);
            }
            parentElement.appendChild(li);
        });
    }

    // --- CARICAMENTO E GESTIONE LIBRO ---
    if (prevPageBtn) prevPageBtn.addEventListener('click', () => foliateBookView.prev());
    if (nextPageBtn) nextPageBtn.addEventListener('click', () => foliateBookView.next());
    
    closeBookBtn.addEventListener('click', () => {
        saveCurrentBookLocation();
        window.location.href = chrome.runtime.getURL('reader/reader.html');
    });

    window.addEventListener('beforeunload', saveCurrentBookLocation);

    async function saveCurrentBookLocation() {
        if (currentBookId && (currentCfi || foliateBookView.location)) { // foliateBookView.location per lo scroll
            let locationToSave = currentCfi;
            if (currentFlowMode === 'scrolled' && foliateBookView.location) {
                 // Per lo scroll, foliate-view espone 'location' che può essere un oggetto { index, anchor: fraction }
                 // Bisogna capire come foliate-js vuole che questo sia passato a goTo.
                 // Per ora, se CFI è disponibile, usiamo quello. Altrimenti, vediamo se location.href esiste.
                 // Potrebbe essere necessario salvare e.detail completo da 'relocate'.
                 locationToSave = foliateBookView.location.cfi || foliateBookView.location.href || currentCfi;
            }

            if (!locationToSave) return;

            try {
                const result = await new Promise((resolve, reject) => {
                    chrome.storage.local.get(STORAGE_KEY_READER_BOOKS, data => {
                        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                        else resolve(data);
                    });
                });
                const allBooksMeta = result[STORAGE_KEY_READER_BOOKS] || [];
                const bookMetaIndex = allBooksMeta.findIndex(b => b.id === currentBookId);
                if (bookMetaIndex !== -1) {
                    allBooksMeta[bookMetaIndex].lastLocation = locationToSave; // Nome più generico
                    await new Promise((resolve, reject) => {
                        chrome.storage.local.set({ [STORAGE_KEY_READER_BOOKS]: allBooksMeta }, () => {
                            if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
                            else resolve();
                        });
                    });
                    console.log(`Posizione salvata per libro ${currentBookId}:`, locationToSave);
                }
            } catch (error) {
                console.error("Errore nel salvataggio della posizione del libro:", error);
            }
        }
    }

    async function loadAndOpenBook() {
        const urlParams = new URLSearchParams(window.location.search);
        currentBookId = urlParams.get('bookId');

        if (!currentBookId) { /* ... gestione errore ... */ return; }

        loadingIndicator.style.display = 'block';
        loadingIndicator.textContent = 'Caricamento libro...';

        try {
            const result = await new Promise((resolve, reject) => { /* ... recupero dati da storage ... */ });
            const bookFilesData = result[STORAGE_KEY_BOOK_FILES] || {};
            const bookEntry = bookFilesData[currentBookId];
            const allBooksMeta = result[STORAGE_KEY_READER_BOOKS] || [];
            const bookMeta = allBooksMeta.find(b => b.id === currentBookId);
            const lastKnownLocation = bookMeta ? bookMeta.lastLocation : null;

            if (!bookEntry || !bookEntry.arrayBuffer) { /* ... gestione errore ... */ return; }

            const blob = new Blob([bookEntry.arrayBuffer], { type: bookEntry.mimeType || 'application/octet-stream' });
            const fileForFoliate = new File([blob], bookEntry.filename || `${currentBookId}.epub`, { type: bookEntry.mimeType || 'application/epub+zip' });

            await foliateBookView.open(fileForFoliate);
            console.log("Libro aperto con Foliate-JS:", fileForFoliate.name);
            
            // Listener per quando una sezione del libro è caricata nel DOM dell'iframe
            foliateBookView.addEventListener('load', event => {
                console.log("Foliate-view 'load' event:", event.detail.index);
                injectContentStyles(event.detail.doc); // Inietta stili specifici del tema
            });
            
            // Listener per cambio posizione
            foliateBookView.addEventListener('relocate', e => {
                // e.detail può contenere cfi, href, location, index, fraction
                if (e.detail && e.detail.cfi) {
                    currentCfi = e.detail.cfi;
                } else if (e.detail && e.detail.href && foliateBookView.book) {
                    // Potrebbe essere necessario risolvere l'href in un CFI se possibile o salvare l'href
                    // currentCfi = e.detail.href; // Semplificazione, potrebbe non funzionare sempre per goTo
                }
                 // console.log('Relocate:', e.detail);
            });

            if (lastKnownLocation) {
                try {
                    await foliateBookView.goTo(lastKnownLocation);
                    console.log("Ripristinata posizione a:", lastKnownLocation);
                } catch (err) { console.warn("Impossibile andare alla posizione salvata:", lastKnownLocation, err); }
            }

            loadingIndicator.style.display = 'none';
            updateMetadataInStorage(allBooksMeta);

        } catch (error) { /* ... gestione errore ... */ }
    }
    
    function injectContentStyles(bookDocument) {
        // Se bookDocument non è passato (es. al primo applyPageTheme), prova a prenderlo da foliateBookView se il libro è già caricato
        if (!bookDocument && foliateBookView.reader && foliateBookView.reader.renderer && foliateBookView.reader.renderer.iframe) {
            bookDocument = foliateBookView.reader.renderer.iframe.contentDocument;
        }
        
        if (bookDocument) {
            let styleElement = bookDocument.getElementById('custom-viewer-styles');
            if (!styleElement) {
                styleElement = bookDocument.createElement('style');
                styleElement.id = 'custom-viewer-styles';
                bookDocument.head.appendChild(styleElement);
            }

            let cssText = `
                body {
                    transition: background-color 0.3s ease, color 0.3s ease;
                    line-height: 1.7; /* Migliore leggibilità */
                    font-size: 110%; /* Un po' più grande di default */
                    padding: 20px 40px !important; /* Margini interni, !important se necessario */
                }
                p { margin-bottom: 1.2em; }
                a { color: var(${currentViewerTheme === 'dark' ? '--accent-color' : '--accent-color'}); } /* Usa variabile CSS per coerenza */
            `;

            if (currentViewerTheme === 'dark') {
                cssText += `
                    body {
                        background-color: var(--viewer-bg-dark, #1e1e1e) !important;
                        color: var(--viewer-text-dark, #d4d4d4) !important;
                    }
                `;
            } else {
                cssText += `
                    body {
                        background-color: var(--viewer-bg-light, #ffffff) !important;
                        color: var(--viewer-text-light, #121212) !important;
                    }
                `;
            }
            styleElement.textContent = cssText;
            // console.log("Stili tema iniettati nel contenuto del libro:", currentViewerTheme);
        } else if (foliateBookView.book) { // Solo se un libro è effettivamente caricato
             // console.warn("Impossibile iniettare stili: bookDocument non disponibile e libro caricato.");
        }
    }

    async function updateMetadataInStorage(allBooksMetaFromStorage) {
        const bookObject = foliateBookView.book;
        if (bookObject && bookObject.metadata) {
            const bookMetaIndex = allBooksMetaFromStorage.findIndex(b => b.id === currentBookId);
            if (bookMetaIndex !== -1) {
                let metadataUpdated = false;
                const currentMeta = allBooksMetaFromStorage[bookMetaIndex];
                
                let foliateTitle = bookObject.metadata.title;
                if (typeof foliateTitle === 'object' && foliateTitle !== null) { // Gestisce {en: "Title", fr: "Titre"}
                    foliateTitle = Object.values(foliateTitle)[0] || currentMeta.filename.replace(/\.[^/.]+$/, "");
                } else if (!foliateTitle) {
                    foliateTitle = currentMeta.filename.replace(/\.[^/.]+$/, "");
                }

                let foliateCreator = bookObject.metadata.creator;
                 if (Array.isArray(foliateCreator)) {
                    foliateCreator = foliateCreator.map(c => (typeof c === 'object' && c !== null) ? (c.name || Object.values(c)[0]) : c).join(', ');
                } else if (typeof foliateCreator === 'object' && foliateCreator !== null) {
                    foliateCreator = foliateCreator.name || Object.values(foliateCreator)[0];
                } else if (!foliateCreator) {
                    foliateCreator = "Sconosciuto";
                }


                if (foliateTitle && currentMeta.title !== foliateTitle) {
                    currentMeta.title = foliateTitle;
                    metadataUpdated = true;
                }
                if (foliateCreator && currentMeta.author !== foliateCreator) {
                    currentMeta.author = foliateCreator;
                    metadataUpdated = true;
                }

                if (metadataUpdated) {
                    chrome.storage.local.set({ [STORAGE_KEY_READER_BOOKS]: allBooksMetaFromStorage }, () => { /* ... gestione errore/successo ... */ });
                }
            }
        }
    }


    // --- EVIDENZIAZIONE E NOTE (Placeholder/Idea Iniziale) ---
    // Foliate-JS ha 'overlayer.js' e un evento 'create-overlayer'.
    // Questo è molto più complesso e richiede una gestione attenta dei Range DOM.
    // Per ora, solo un abbozzo concettuale.

    // foliateBookView.addEventListener('create-overlayer', e => {
    //     const { doc, index, attach } = e.detail;
    //     // Qui potresti creare un tuo overlayer custom per le evidenziazioni
    //     // e passarlo a attach(myOverlayerInstance);
    //     console.log("Evento create-overlayer per la sezione:", index);
    //
    //     // Esempio di come potresti gestire la selezione per evidenziare
    //     doc.addEventListener('mouseup', () => {
    //         const selection = doc.getSelection();
    //         if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
    //             const range = selection.getRangeAt(0);
    //             // Qui dovresti:
    //             // 1. Creare un oggetto evidenziazione (con CFI del range, colore, testo, nota)
    //             // 2. Salvare l'evidenziazione (es. in chrome.storage.local, associata al bookId e CFI)
    //             // 3. Disegnare l'evidenziazione sull'overlayer
    //             console.log("Testo selezionato, range:", range);
    //             // alert(`Testo selezionato: "${selection.toString()}" - Implementare evidenziazione!`);
    //             // Per disegnare, dovresti avere un'istanza del tuo overlayer e chiamare un suo metodo addHighlight(range)
    //             selection.removeAllRanges(); // Deseleziona dopo aver processato
    //         }
    //     });
    // });
    // Per le note, potresti fare in modo che cliccando su un'evidenziazione si apra un piccolo popup per scrivere/visualizzare la nota.
});