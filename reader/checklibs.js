// checklibs.js
console.log("Controllo caricamento librerie (da checklibs.js)...");
if (typeof JSZip !== 'undefined') {
    console.log('JSZip (locale da ../libs) è CARICATO CORRETTAMENTE.');
} else {
    console.error('ERRORE: JSZip (locale da ../libs) NON è definito.');
}
if (typeof ePub !== 'undefined') {
    console.log('EPUB.js (locale da ../libs) è CARICATO CORRETTAMENTE e ePub è definito.');
} else {
    console.error('ERRORE: EPUB.js (locale da ../libs) NON è stato caricato o ePub NON è definito.');
}
if (typeof marked !== 'undefined') {
    console.log('Marked.js (locale da ../libs) è CARICATO CORRETTAMENTE.');
} else {
    console.error('ERRORE: Marked.js (locale da ../libs) NON è definito.');
}
// In checklibs.js
if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
    console.log('Marked.js (locale da ../libs) è CARICATO CORRETTAMENTE e marked.parse è una funzione.');
} else if (typeof marked !== 'undefined') {
    console.warn('Marked.js (locale da ../libs) è CARICATO, MA marked.parse NON è una funzione. Oggetto marked:', marked);
} else {
    console.error('Marked.js (locale da ../libs) NON è caricato (marked is undefined).');
}