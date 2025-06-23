// htmlToMarkdown_global.js
// Assicurati che TurndownService sia già stato caricato globalmente (da turndown.js)

/**
 * Converte HTML in Markdown con pulizia avanzata e formattazione migliorata
 * @param {string} html - Contenuto HTML da convertire
 * @param {string} baseUrl - URL base per risolvere i link relativi
 * @return {string} Contenuto convertito in Markdown
 */
function convertHtmlToMarkdownGlobal(html, baseUrl) { // Rinominata per chiarezza
  if (typeof TurndownService === 'undefined') {
      console.error("Errore FATALE: TurndownService non è disponibile globalmente. Assicurati che turndown.js sia caricato prima di questo script.");
      return "Errore: Libreria di conversione (TurndownService) non caricata.";
  }

  // Fase 1: Pre-pulizia del HTML
  const cleanedHtml = cleanupHtml(html); // Funzione definita sotto

  // Fase 2: Conversione tramite Turndown con regole personalizzate
  const turndown = configureTurndownService(baseUrl); // Funzione definita sotto

  // Fase 3: Post-elaborazione del Markdown generato
  return postProcessMarkdown(turndown.turndown(cleanedHtml)); // Funzione definita sotto
}

/**
* Pulisce l'HTML prima della conversione rimuovendo elementi non necessari
*/
// In htmlToMarkdown_global.js

function cleanupHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // ... (la parte di globalElementsToRemove rimane simile, ma potresti doverla affinare
    // per assicurarti di non rimuovere il vero contenitore dei post) ...
    const globalElementsToRemove = [
        'script', 'style', 'svg', 'iframe', 'nav', // Rimuovi 'header', 'footer' con più cautela
        '.cookie-banner', '.advertisement', '.ads', '.popup', '.modal',
        '[id*="cookie"]', '[id*="banner"]', '[id*="popup"]',
        '[class*="ad-"]', '[aria-hidden="true"]',
        '.nav-menu', '.site-sidebar', '.widget-area', // Classi comuni per sidebar
        '[role="banner"]', '[role="navigation"]', '[role="search"]', '[role="contentinfo"]',
        'aside:not(article aside, main aside)',
        'noscript', 'meta', 'link', 'form:not(article form, main form)', // Mantieni form dentro il contenuto principale?
        'button:not(article button, main button)', 'input:not(article input, main input)', // Idem per input/button
        '#comments', '.comments-section',
        '.site-header', '.site-footer', '.main-navigation', // Header/footer globali
        '.page-header', // Spesso solo il titolo della pagina archivio
        '.post-navigation', '.posts-navigation', '.pagination' // Navigazione tra pagine di post
    ];

    globalElementsToRemove.forEach(selector => {
        try {
            doc.querySelectorAll(selector).forEach(el => el.remove());
        } catch (e) { /* ... */ }
    });

    // Tentativo di estrarre il contenitore principale dei post
    let mainContentContainer =
        doc.querySelector('#primary.content-area') || // Specifico per Cal Newport, da ispezione
        doc.querySelector('.content-area') ||
        doc.querySelector('#content.site-content') ||
        doc.querySelector('main#main') || // <main id="main"> è comune
        doc.querySelector('main') ||
        doc.querySelector('[role="main"]');
        // Aggiungi altri selettori comuni per contenitori di liste di post
        // doc.querySelector('.blog-posts') || doc.querySelector('.posts-list')

    if (!mainContentContainer) {
        console.warn("Nessun contenitore di contenuto principale specifico trovato, uso euristica sul body.");
        // L'euristica precedente era per un singolo articolo, qui vogliamo il contenitore
        // Se non troviamo un contenitore specifico, potremmo dover prendere il body
        // e sperare che la rimozione degli elementi globali sia stata sufficiente.
        // Per ora, se non troviamo un contenitore, usiamo il body.
        // La logica di estrazione di *singoli* articoli da una lista è diversa
        // da quella di estrarre il contenuto di *una singola pagina articolo*.
        // Per una pagina di blog (lista di articoli), vogliamo il contenitore di questi articoli.
        mainContentContainer = doc.body;
    }

    if (mainContentContainer) {
        console.log("CONTENITORE PRINCIPALE SELEZIONATO:", mainContentContainer.tagName + (mainContentContainer.id ? "#" + mainContentContainer.id : "") + (mainContentContainer.className ? "." + mainContentContainer.className.split(" ").join(".") : ""));

        // Rimuovi elementi spazzatura *all'interno* del contenitore principale identificato
        // che non sono parte degli articoli stessi (es. "read more" se non vuoi i link, widget interni)
        const innerElementsToRemove = [
            '.sharedaddy', // Plugin di condivisione comune
            '.jp-relatedposts', // Jetpack related posts
            // '.entry-meta', '.post-meta' // Potresti volerli tenere per date/autori
            // '.read-more', 'a.more-link' // Se vuoi solo l'anteprima e non il link "read more"
        ];
        innerElementsToRemove.forEach(selector => {
            try {
                mainContentContainer.querySelectorAll(selector).forEach(el => el.remove());
            } catch (e) { /* ... */ }
        });

        // Rimuovi attributi non necessari
        const allElementsInMain = mainContentContainer.querySelectorAll('*');
        const attributesToKeep = ['href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'start', 'lang', 'class'];
        allElementsInMain.forEach(el => { /* ... (logica rimozione attributi come prima) ... */ });

        return mainContentContainer.innerHTML;
    }

    console.warn("ATTENZIONE: Fallback a doc.body.innerHTML per cleanupHtml.");
    return doc.body.innerHTML;
}

/**
* Configura il servizio Turndown con regole personalizzate
*/
function configureTurndownService(baseUrl) {
  const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      hr: '---',
      strongDelimiter: '**',
      emDelimiter: '_', // Preferenza personale, puoi usare '*'
      linkStyle: 'inlined'
  });

  // Regola migliorata per i link (già buona, piccole aggiunte)
  turndown.addRule('links', {
      filter: 'a',
      replacement: (content, node) => {
          const rawContent = node.textContent || ""; // Usa textContent per evitare HTML interno
          if (!rawContent.trim()) return '';

          let href = node.getAttribute('href') || '';
          if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href === '#' || href.startsWith('#')) {
               // Se è un link interno alla pagina o mailto, e il contenuto è solo l'href, non renderizzarlo come link markdown
              if (rawContent.trim() === href.trim()) return rawContent.trim();
              return rawContent.trim(); // Altrimenti, restituisci solo il testo
          }

          try {
              const url = new URL(href, baseUrl).toString();
              return `[${rawContent.trim()}](${url})`;
          } catch {
              return rawContent.trim(); // Fallback se l'URL non è valido
          }
      }
  });

  // Regola migliorata per le immagini
  turndown.addRule('images', {
      filter: 'img',
      replacement: (content, node) => {
          const src = node.getAttribute('src') || '';
          // Filtra immagini molto piccole (probabilmente icone o spacer) o data URI (eccetto SVG che potresti voler gestire)
          const width = parseInt(node.getAttribute('width') || node.offsetWidth || '0');
          const height = parseInt(node.getAttribute('height') || node.offsetHeight || '0');

          if (!src || src.startsWith('data:image') && !src.startsWith('data:image/svg+xml')) return '';
          if ((width > 0 && width < 50) || (height > 0 && height < 50)) { // Soglia per immagini piccole
               // Se è un'icona dentro un link, potrebbe essere importante il testo del link
              if (node.closest('a')) return ''; // Non rendere l'icona, il testo del link sarà catturato
              return ''; // Altrimenti scarta
          }


          let alt = (node.getAttribute('alt') || '').trim();
          const title = (node.getAttribute('title') || '').trim();

          // Se l'alt è vuoto, prova a derivarlo dal nome del file o dal contesto
          if (!alt && src) {
              try {
                  const urlParts = new URL(src, baseUrl).pathname.split('/');
                  const filename = urlParts.pop();
                  if (filename) {
                      alt = filename.substring(0, filename.lastIndexOf('.'))
                                    .replace(/[-_]/g, ' ') // Sostituisci trattini/underscore con spazi
                                    .replace(/\b\w/g, l => l.toUpperCase()); // Capitalizza
                  }
              } catch {}
          }
          if (!alt) alt = "Immagine"; // Fallback generico

          try {
              const url = new URL(src, baseUrl).toString();
              return title
                  ? `![${alt}](${url} "${title}")`
                  : `![${alt}](${url})`;
          } catch {
              return ''; // Non renderizzare se l'URL dell'immagine non è valido
          }
      }
  });
  
  // Mantenere figure e figcaption
  turndown.keep(['figure', 'figcaption']);
  turndown.addRule('figure', {
      filter: 'figure',
      replacement: function (content) {
          return '\n\n' + content.trim() + '\n\n';
      }
  });
  turndown.addRule('figcaption', {
      filter: 'figcaption',
      replacement: function (content) {
          return '\n*Didascalia: ' + content.trim() + '*\n';
      }
  });


  // Gestione migliorata dei blocchi di codice (già buona, piccole aggiunte)
  turndown.addRule('codeBlocks', {
      filter: (node) => {
          return (
              node.nodeName === 'PRE' &&
              (!node.firstChild || node.firstChild.nodeName !== 'CODE') // Codice direttamente in PRE
          ) || (
              node.nodeName === 'PRE' &&
              node.firstChild &&
              node.firstChild.nodeName === 'CODE' // Struttura PRE > CODE
          );
      },
      replacement: (content, node) => {
          const codeNode = node.nodeName === 'CODE' ? node : node.querySelector('code');
          const codeText = codeNode ? codeNode.textContent : node.textContent; // Prendi il testo dal nodo giusto
          
          if (!codeText.trim()) return '';

          let language = '';
          if (codeNode) {
              const classAttr = codeNode.getAttribute('class') || '';
              const languageMatch = classAttr.match(/language-(\w+)/);
              if (languageMatch) language = languageMatch[1];
          }
          if (!language && node.hasAttribute('class')) { // Fallback al PRE se CODE non ha classe
               const classAttr = node.getAttribute('class') || '';
               const languageMatch = classAttr.match(/language-(\w+)/);
               if (languageMatch) language = languageMatch[1];
          }

          return `\n\`\`\`${language}\n${codeText.trim()}\n\`\`\`\n`;
      }
  });
  
  // Gestione codice inline
  turndown.addRule('inlineCode', {
      filter: (node) => {
          return node.nodeName === 'CODE' && node.closest('pre') === null;
      },
      replacement: (content, node) => {
          if (!content.trim()) return '';
          return `\`${content.trim()}\``;
      }
  });


  // Tratta meglio le tabelle (già buona)
  turndown.addRule('tables', {
      filter: 'table',
      replacement: function (content, node) {
          // La logica di Turndown per le tabelle è già abbastanza buona,
          // ma assicuriamoci di pulire il contenuto delle celle.
          // Questa regola personalizzata è più per controllo fine se necessario.
          // Per ora, usiamo quella di default di Turndown se è sufficiente.
          // Se vuoi un controllo più granulare, implementa la logica qui.
          // Questa è una versione semplificata:
          let markdown = '';
          const rows = Array.from(node.rows);

          if (rows.length === 0) return '';

          // Header
          const headerCells = Array.from(rows[0].cells);
          markdown += '| ' + headerCells.map(cell => (cell.textContent || "").trim().replace(/\|/g, '\\|')).join(' | ') + ' |\n';
          markdown += '| ' + headerCells.map(() => '---').join(' | ') + ' |\n';

          // Body
          for (let i = 1; i < rows.length; i++) {
              const bodyCells = Array.from(rows[i].cells);
              // Assicurati che il numero di colonne corrisponda all'header
              if (bodyCells.length === headerCells.length) {
                  markdown += '| ' + bodyCells.map(cell => (cell.textContent || "").trim().replace(/\|/g, '\\|')).join(' | ') + ' |\n';
              }
          }
          return '\n' + markdown.trim() + '\n\n';
      }
  });

  // Rimuovi elementi indesiderati (già buona)
  turndown.remove([
      // 'script', 'style', 'iframe', 'canvas', 'noscript',
      // 'form', 'input', 'button', 'select', 'option', 'meta', 'link'
      // Molti di questi sono già rimossi da cleanupHtml, ma è una doppia sicurezza.
  ]);

  return turndown;
}

/**
* Post-elabora il markdown generato per migliorarne la leggibilità
*/
function postProcessMarkdown(markdown) {
  return markdown
      .replace(/\n{3,}/g, '\n\n')               // Rimuove linee vuote eccessive
      .replace(/!\[\]\([^)]+\)/g, '')           // Rimuove immagini senza testo alternativo (se l'alt è vuoto)
      .replace(/\[([^\]]+)\]\(\s*\)/g, '$1')    // Rimuove link vuoti (es. [Testo]())
      .replace(/\[\s*\]\([^)]+\)/g, '')         // Rimuove link con testo vuoto (es. [](url))
      .replace(/ /g, ' ')                  // Sostituisce   con spazi normali
      .replace(/[ \t]+\n/g, '\n')               // Rimuove spazi alla fine delle righe
      // .replace(/\n\s+/g, '\n')               // Rimuove spazi all'inizio delle righe (potrebbe essere troppo aggressivo per indentazioni volute)
      .replace(/\n(#+)\s*\n/g, '\n')            // Rimuove intestazioni vuote
      .replace(/-{4,}/g, '---')                 // Standardizza i separatori orizzontali lunghi
      .replace(/\*{4,}/g, '---')                 // Standardizza i separatori orizzontali con asterischi
      .replace(/\[\]\(([^)]+)\)/g, '<$1>')      // Converte link vuoti in semplici URL tra < >
      .replace(/(\n\s*){2,}(```)/g, '\n\n$2')   // Assicura spazio corretto prima dei blocchi di codice
      .replace(/(```)(\n\s*){2,}/g, '$1\n\n')   // Assicura spazio corretto dopo i blocchi di codice
      .replace(/\n\n+/g, '\n\n')                // Normalizza multiple newlines a due
      .trim();
}