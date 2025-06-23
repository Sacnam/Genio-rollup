// offscreen_parser.js
console.log("Offscreen document script loaded. Readability:", typeof Readability);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.target !== 'offscreen_document_rss_parser') {
        return false;
    }

    if (request.action === "parseXmlFeed") {
        // ... (codice per parseXmlFeed rimane invariato, come te l'ho dato prima) ...
        console.log("Offscreen: Ricevuta richiesta parseXmlFeed per URL:", request.feedUrl);
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(request.xmlString, "application/xml");

            const parserErrorNode = xmlDoc.querySelector('parsererror');
            if (parserErrorNode) {
                console.error("Offscreen: Errore parsing XML:", parserErrorNode.textContent);
                sendResponse({ error: `XML Parsing Error: ${parserErrorNode.textContent}` });
                return true;
            }

            const items = [];
            const feedType = xmlDoc.documentElement.nodeName.toLowerCase();
            const itemsSelector = (feedType === 'rss') ? "item" : "entry";
            const feedBaseUrl = request.feedUrl;

            xmlDoc.querySelectorAll(itemsSelector).forEach(itemNode => {
                const title = itemNode.querySelector("title")?.textContent?.trim() || "No Title";
                let link = itemNode.querySelector("link[href]")?.getAttribute('href') || itemNode.querySelector("link")?.textContent?.trim();
                let guid = itemNode.querySelector("guid")?.textContent?.trim();

                if (feedType === 'feed' && !link) {
                    const atomLinkNode = Array.from(itemNode.querySelectorAll("link[rel='alternate']")).find(n => n.getAttribute('type') === 'text/html') || itemNode.querySelector("link[href]");
                    if (atomLinkNode) link = atomLinkNode.getAttribute('href');
                    const atomIdNode = itemNode.querySelector("id");
                    if (atomIdNode) {
                        const atomIdText = atomIdNode.textContent.trim();
                        if (!link && atomIdText.startsWith('http')) link = atomIdText;
                        else if (!guid) guid = atomIdText;
                    }
                }
                if (!link && guid && guid.startsWith('http')) link = guid;

                if (link && !link.startsWith('http') && link !== '#') {
                    try {
                        link = new URL(link, feedBaseUrl).href;
                    } catch (e) {
                        console.warn(`Offscreen: Impossibile risolvere URL relativo "${link}" con base "${feedBaseUrl}"`);
                        link = '#';
                    }
                }
                if (link === '#' && itemNode.querySelector("guid[isPermaLink='true']")?.textContent) {
                    link = itemNode.querySelector("guid[isPermaLink='true']").textContent.trim();
                }
                if (!link) link = '#';

                const itemId = guid || link || (title + (itemNode.querySelector("pubDate, published, updated, dc\\:date")?.textContent || Date.now()));
                const pubDateStr = itemNode.querySelector("pubDate, published, updated, dc\\:date")?.textContent;
                const pubDate = pubDateStr ? new Date(pubDateStr).toISOString() : new Date().toISOString();
                const descriptionNode = itemNode.querySelector("description, summary");
                const description = descriptionNode?.textContent.trim() || "";
                let fullContentHTML = "";
                const contentEncodedNode = itemNode.querySelector("content\\:encoded, content");
                if (contentEncodedNode) {
                    fullContentHTML = contentEncodedNode.textContent.trim() || "";
                } else if (descriptionNode && descriptionNode.childNodes.length > 0 && Array.from(descriptionNode.childNodes).some(n => n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.CDATA_SECTION_NODE)) {
                    fullContentHTML = descriptionNode.innerHTML.trim() || descriptionNode.textContent.trim() || "";
                }

                items.push({
                    id: itemId,
                    title: title,
                    link: link,
                    pubDate: pubDate,
                    description: description,
                    fullContentHTML: fullContentHTML
                });
            });
            sendResponse({ success: true, items: items });
        } catch (e) {
            console.error("Offscreen: Eccezione durante il parsing XML:", e);
            sendResponse({ error: e.toString() });
        }
        return true;

    } else if (request.action === "extractArticleWithReadability") {
        console.log("Offscreen: Ricevuta richiesta extractArticleWithReadability per URL:", request.pageUrl);
        if (typeof Readability === 'undefined') {
            console.error("Offscreen: Readability non è definita!");
            sendResponse({ success: false, error: "Readability library not loaded in offscreen document." });
            return true;
        }
        try {
            const doc = new DOMParser().parseFromString(request.htmlContent, "text/html");
            let baseEl = doc.querySelector('base[href]');
            if (!baseEl) {
                baseEl = doc.createElement('base');
                baseEl.setAttribute('href', request.pageUrl); // Usa l'URL della pagina originale come base
                doc.head.appendChild(baseEl);
            }

            const readerArticle = new Readability(doc.cloneNode(true), { charThreshold: 250, nTopCandidates: 5 }).parse();

            if (readerArticle && readerArticle.content) {
                sendResponse({
                    success: true,
                    article: {
                        title: readerArticle.title || "Untitled",
                        content: readerArticle.content,
                        textContent: readerArticle.textContent,
                        length: readerArticle.length,
                        excerpt: readerArticle.excerpt,
                        byline: readerArticle.byline,
                        siteName: readerArticle.siteName,
                        // L'estrazione dell'immagine principale potrebbe essere fatta qui o nel background
                        // Per semplicità, la lasciamo nel background per ora, ma potrebbe essere più efficiente qui.
                    }
                });
            } else {
                sendResponse({ success: false, error: "Readability could not parse content." });
            }
        } catch (e) {
            console.error("Offscreen: Eccezione durante Readability:", e);
            sendResponse({ success: false, error: e.toString() });
        }
        return true;
    }
    return false;
});
