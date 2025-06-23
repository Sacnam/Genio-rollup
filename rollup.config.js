import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: {
    // Definiamo qui tutti i file JS che sono "punti di ingresso"
    'background': 'src/background.js',
    'content': 'src/content.js',
    'auth': 'src/auth.js',
    'popup/popup': 'src/popup/popup.js',
    'reader/reader': 'src/reader/reader.js',
    'sidebar/script': 'src/sidebar/script.js',
    'sidebar/coins': 'src/sidebar/coins.js',
    'sidebar/manage_prompts': 'src/sidebar/manage_prompts.js',
    'offscreen_parser': 'src/offscreen_parser.js'
    // Aggiungi altri se necessario
  },
  output: {
    dir: 'dist', // La cartella dove andranno i file finali
    format: 'esm', // Il formato corretto per le estensioni Chrome
    chunkFileNames: 'chunks/[name].js'
  },
  plugins: [
    resolve(), // Permette a Rollup di trovare le librerie in node_modules
    commonjs()  // Converte moduli CommonJS (se ce ne sono) in ES6
  ]
};