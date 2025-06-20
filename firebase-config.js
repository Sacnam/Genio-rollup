// GENIO_07_6/firebase-config.js

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// La tua configurazione Firebase (mantenuta intatta)
const firebaseConfig = {
  apiKey: "AIzaSyB733UNF8wJYRszdIw4H3XoS7Bmn7yvLig",
  authDomain: "genio-f9386.firebaseapp.com",
  projectId: "genio-f9386",
  storageBucket: "genio-f9386.appspot.com", // Corretto a .appspot.com, standard per storageBucket
  messagingSenderId: "759357192037",
  appId: "1:759357192037:web:b0004722e8f1d4c9e5138c",
  measurementId: "G-B18GK4VB1G"
};

// Variabile singleton per contenere le istanze dei servizi Firebase in questo specifico contesto.
let firebaseServices = null;

/**
 * Inizializza l'app Firebase e i suoi servizi in modo robusto per gli ambienti
 * delle estensioni Chrome (Service Worker, Popup, etc.), che non condividono la memoria.
 * 
 * @returns {{auth: import('firebase/auth').Auth, db: import('firebase/firestore').Firestore}}
 */
export function getFirebaseServices() {
  // Se i servizi sono già stati inizializzati in QUESTO contesto, restituiscili subito.
  if (firebaseServices) {
    return firebaseServices;
  }

  let app;

  // getApps() restituisce un array di tutte le app Firebase inizializzate.
  // Se la lunghezza non è zero, significa che un altro contesto (es. il background script)
  // ha già inizializzato l'app.
  if (getApps().length === 0) {
    console.log("Nessuna app Firebase trovata. Inizializzazione in corso...");
    app = initializeApp(firebaseConfig);
  } else {
    console.log("App Firebase già inizializzata trovata. Ottenimento dell'istanza esistente...");
    // getApp() recupera l'istanza [DEFAULT] già inizializzata da un altro contesto.
    app = getApp();
  }

  // Ora che abbiamo un'istanza dell'app (nuova o esistente), otteniamo i servizi.
  const auth = getAuth(app);
  const db = getFirestore(app);
  
  // Salva le istanze nella variabile singleton per le chiamate future in questo contesto.
  firebaseServices = { auth, db };
  
  return firebaseServices;
}