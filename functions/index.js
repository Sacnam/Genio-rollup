// File: functions/index.js (Versione AGGIORNATA con la funzione TTS)

// Importazioni V2, Admin SDK, e Secret Manager
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest, onCall } = require("firebase-functions/v2/https"); // <-- MODIFICATO: Aggiunto onCall
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { FieldValue } = require('firebase-admin/firestore');
const { defineSecret } = require("firebase-functions/params");

// --- INIZIO SEZIONE NUOVA: Import e Secret per Replicate ---
const Replicate = require("replicate");
const replicateApiKey = defineSecret("REPLICATE_API_KEY"); // <-- NUOVO: Definisce il secret per Replicate
// --- FINE SEZIONE NUOVA ---

// Definisci i segreti PUNTANDO a quelli gestiti dall'estensione Firebase
const stripeSecretKey = defineSecret("firestore-stripe-payments-STRIPE_API_KEY");
const stripeWebhookSecret = defineSecret("firestore-stripe-payments-STRIPE_WEBHOOK_SECRET");

// Inizializza Stripe
const stripe = require('stripe');

// Inizializzazione Admin SDK
try {
  if (admin.apps.length === 0) admin.initializeApp();
} catch (e) {
  logger.error("Errore inizializzazione Firebase Admin SDK:", e);
}
const db = admin.firestore();

// --- Funzione Helper per Calcolare il Costo (Invariata) ---
function calculateCostBasedOnPrompt(promptText) {
    const promptLength = promptText ? promptText.length : 0;
    const baseCost = 1;
    const charactersPerExtraCoin = 200;
    const extraCoins = Math.floor(promptLength / charactersPerExtraCoin);
    const totalCost = baseCost + extraCoins;
    logger.info(`[Cost Calculation V2 - Char Based] Prompt length: ${promptLength}, Base cost: ${baseCost}, Chars per extra coin: ${charactersPerExtraCoin}, Extra coins: ${extraCoins}, Total cost: ${totalCost}`);
    return Math.max(1, totalCost);
}

// --- Funzione Webhook Stripe (Invariata) ---
exports.handleStripePaymentWebhook = onRequest(
    { secrets: [stripeSecretKey, stripeWebhookSecret] },
    async (req, res) => {
        logger.info("[Webhook V2 - Secrets - ExtSource] Ricevuta richiesta webhook...");
        const stripeClient = stripe(stripeSecretKey.value());
        const webhookSecretValue = stripeWebhookSecret.value();
        if (!stripeSecretKey.value() || !webhookSecretValue) {
             logger.error("[Webhook V2 - Secrets - ExtSource] Errore critico: Valori dei segreti non disponibili.");
             res.status(500).send("Internal Server Error: Secret values not loaded.");
             return;
        }
        const sig = req.headers['stripe-signature'];
        let event;
        try {
            event = stripeClient.webhooks.constructEvent(req.rawBody, sig, webhookSecretValue);
            logger.info(`[Webhook V2 - Secrets - ExtSource] Evento Stripe verificato: ${event.type}`);
        } catch (err) {
            logger.error(`[Webhook V2 - Secrets - ExtSource] Errore verifica firma webhook: ${err.message}`);
            if (err instanceof stripe.errors.StripeSignatureVerificationError) {
                logger.error("[Webhook V2 - Secrets - ExtSource] L'errore è di tipo StripeSignatureVerificationError. Controlla il segreto webhook e che l'evento non sia stato modificato.");
            }
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }
        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            logger.info(`[Webhook V2 - Secrets - ExtSource] Gestione evento checkout.session.completed per sessione: ${session.id}`);
            const userId = session.client_reference_id;
            if (!userId) {
                logger.error(`[Webhook V2 - Secrets - ExtSource] Errore: client_reference_id mancante nella sessione ${session.id}`);
                res.status(200).send('Webhook received, but missing client_reference_id.');
                return;
            }
            logger.info(`[Webhook V2 - Secrets - ExtSource] ID Utente (client_reference_id): ${userId}`);
            const coinsToAdd = 5000;
            logger.info(`[Webhook V2 - Secrets - ExtSource] Tentativo di aggiungere ${coinsToAdd} monete all'utente ${userId} (prodotto singolo)`);
            const userRef = db.collection('users').doc(userId);
            try {
                await userRef.update({
                    coins: FieldValue.increment(coinsToAdd)
                });
                logger.info(`[Webhook V2 - Secrets - ExtSource] Successo! Aggiunte ${coinsToAdd} monete all'utente ${userId}.`);
            } catch (error) {
                logger.error(`[Webhook V2 - Secrets - ExtSource] Errore durante l'aggiornamento Firestore per utente ${userId}:`, error);
                res.status(500).send(`Firestore update failed: ${error.message}`);
                return;
            }
        } else {
            logger.info(`[Webhook V2 - Secrets - ExtSource] Evento non gestito: ${event.type}`);
        }
        logger.info("[Webhook V2 - Secrets - ExtSource] Elaborazione webhook completata con successo.");
        res.status(200).send('Webhook received successfully.');
    }
);

// --- Funzione per Addebito Chat (Invariata) ---
exports.chargeForChatResponse = onDocumentUpdated("chats/{chatId}", async (event) => {
    const chatId = event.params.chatId;
    const beforeSnapshot = event.data.before;
    const afterSnapshot = event.data.after;
    if (!beforeSnapshot || !afterSnapshot) { logger.warn(`[Chat Charge V5 - V2 Syntax] Snapshot mancante per chat ID: ${chatId}. Evento ignorato.`); return; }
    const beforeData = beforeSnapshot.data();
    const afterData = afterSnapshot.data();
    logger.info(`[Chat Charge V5 - V2 Syntax] Funzione triggerata per chat ID: ${chatId}`);
    if (afterData.response && !beforeData.response && !afterData.costApplied && afterData.userId) {
        const userId = afterData.userId;
        const promptText = afterData.prompt || "";
        const calculatedCost = calculateCostBasedOnPrompt(promptText);
        logger.info(`[Chat Charge V5 - V2 Syntax] Rilevata nuova risposta per utente ${userId}. Tentativo addebito di ${calculatedCost} monete.`);
        const userRef = db.collection('users').doc(userId);
        const chatRef = afterSnapshot.ref;
        try {
            await db.runTransaction(async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) { logger.error(`[Chat Charge V5 - V2 Syntax] Utente ${userId} non trovato.`); throw new Error(`Utente ${userId} non trovato.`); }
                const userData = userDoc.data();
                const currentCoins = userData.coins || 0;
                logger.info(`[Chat Charge V5 - V2 Syntax] Saldo attuale utente ${userId}: ${currentCoins} monete.`);
                if (currentCoins >= calculatedCost) {
                    const newBalance = currentCoins - calculatedCost;
                    transaction.update(userRef, { coins: newBalance });
                    const transactionRef = userRef.collection('transactions').doc();
                    transaction.set(transactionRef, { type: 'chat_usage', amount: -calculatedCost, chatId: chatId, timestamp: FieldValue.serverTimestamp(), description: `Utilizzo Chatbot Genio (Prompt Chars: ${promptText.length})` });
                    transaction.update(chatRef, { costApplied: true, coinsCharged: calculatedCost });
                    logger.info(`[Chat Charge V5 - V2 Syntax] Addebito di ${calculatedCost} monete completato per utente ${userId}. Nuovo saldo: ${newBalance}.`);
                } else {
                    logger.warn(`[Chat Charge V5 - V2 Syntax] Saldo insufficiente per utente ${userId} (ha ${currentCoins}, servono ${calculatedCost}). Addebito saltato.`);
                    transaction.update(chatRef, { costApplied: false, coinsCharged: 0, chargeFailedReason: 'insufficient_funds', requiredCoins: calculatedCost });
                }
            });
        } catch (error) {
            logger.error(`[Chat Charge V5 - V2 Syntax] Errore durante la transazione per chat ${chatId} / utente ${userId}:`, error);
            try { await chatRef.update({ costApplied: false, chargeFailedReason: `transaction_error: ${error.message}` }); }
            catch (updateError) { logger.error(`[Chat Charge V5 - V2 Syntax] Impossibile aggiornare stato errore su chat ${chatId}:`, updateError); }
        }
    } else {
        let reason = "[Chat Charge V5 - V2 Syntax] Nessuna azione richiesta: ";
        if (!afterData.response) reason += "Nessuna risposta. ";
        if (afterData.costApplied) reason += "Costo già applicato. ";
        if (!afterData.userId) reason += "UserID mancante. ";
        if (beforeData.response === afterData.response && !afterData.costApplied) reason += "Risposta non cambiata e non addebitata. ";
        if (reason !== "[Chat Charge V5 - V2 Syntax] Nessuna azione richiesta: ") { logger.info(`${reason} (Chat ID: ${chatId})`); }
    }
});

// --- INIZIO SEZIONE NUOVA: Funzione Text-to-Speech ---
exports.generateSpeech = onCall({ secrets: [replicateApiKey] }, async (request) => {
    logger.info("[TTS] Ricevuta richiesta per la generazione vocale.");

    // 1. Controlla l'autenticazione dell'utente
    if (!request.auth) {
        logger.warn("[TTS] Chiamata non autenticata.");
        throw new functions.https.HttpsError(
            "unauthenticated",
            "La funzione deve essere chiamata da un utente autenticato."
        );
    }

    const text = request.data.text;
    const voice = request.data.voice || "af_bella"; // Voce di default

    // 2. Valida l'input
    if (!text || typeof text !== "string" || text.trim().length === 0) {
        logger.warn("[TTS] Chiamata con argomento 'text' non valido.");
        throw new functions.https.HttpsError(
            "invalid-argument",
            "La funzione deve essere chiamata con un argomento 'text' valido."
        );
    }

    logger.info(`[TTS] Inizio generazione per la voce: ${voice}.`);

    try {
        // Inizializza il client Replicate con la chiave API dal Secret Manager
        const replicateClient = new Replicate({
            auth: replicateApiKey.value(),
        });

        // 3. Chiama il modello Kokoro su Replicate
        const model = "jaaari/kokoro-82m:f559560eb822dc509045f3921a1921234918b91739db4bf3daab2169b71c7a13";
        const input = {
            text: text,
            voice: voice,
            speed: 1,
        };

        logger.info("[TTS] Chiamata all'API di Replicate in corso...");
        const output = await replicateClient.run(model, { input });
        logger.info("[TTS] Risposta da Replicate ricevuta con successo.");

        // 4. Restituisci l'URL del file audio
        if (typeof output === "string" && output.startsWith("http")) {
            return { audioUrl: output };
        } else {
            logger.error("[TTS] L'API di Replicate ha restituito un output inatteso:", output);
            throw new functions.https.HttpsError(
                "internal",
                "Risposta API inattesa dal servizio di generazione vocale."
            );
        }
    } catch (error) {
        logger.error("[TTS] Errore durante la chiamata all'API di Replicate:", error);
        const errorMessage = error.message || "Errore sconosciuto con l'API di Replicate.";
        throw new functions.https.HttpsError("internal", `Errore nella generazione vocale: ${errorMessage}`);
    }
});
