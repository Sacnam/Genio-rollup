const iframe = document.getElementById('sandbox-frame');

function loadUrl(url) {
    iframe.src = url;
    iframe.style.width = '100%';
    iframe.style.height = '100vh';
    iframe.style.border = 'none';
    
    // Iniezione script per prevenire il frame busting
    const script = document.createElement('script');
    script.textContent = `
        window.addEventListener('DOMContentLoaded', () => {
            Object.defineProperty(window, 'parent', { value: window });
            Object.defineProperty(window, 'top', { value: window });
            window.self = window;
        });
    `;
    iframe.contentDocument?.documentElement?.appendChild(script.cloneNode(true));
}

// Comunicazione con il content script
window.addEventListener('message', (event) => {
    if (event.data.type === 'loadUrl') {
        loadUrl(event.data.url);
    }
});