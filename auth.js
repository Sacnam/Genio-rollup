// File: auth.js (Sostituisce sidebar/login.js)

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB733UNF8wJYRszdIw4H3XoS7Bmn7yvLig",
    authDomain: "genio-f9386.firebaseapp.com",
    projectId: "genio-f9386",
    storageBucket: "genio-f9386.firebasestorage.app",
    messagingSenderId: "759357192037",
    appId: "1:759357192037:web:b0004722e8f1d4c9e5138c",
    measurementId: "G-B18GK4VB1G"
};

// Initialize Firebase
let app, db, auth;
try {
    if (!firebase.apps.length) {
        app = firebase.initializeApp(firebaseConfig);
    } else {
        app = firebase.app();
    }
    db = firebase.firestore();
    auth = firebase.auth();
} catch (error) {
    console.error("Firebase initialization error in auth.js:", error);
    document.body.innerHTML = '<p style="color:red; padding: 20px;">Error initializing application services. Please try again later.</p>';
}

// DOM elements
const elements = {
    login: {
        container: document.getElementById('loginContainer'),
        email: document.getElementById('email'),
        password: document.getElementById('password'),
        btn: document.getElementById('loginBtn'),
        emailError: document.getElementById('emailError'),
        passwordError: document.getElementById('passwordError')
    },
    signup: {
        container: document.getElementById('signupContainer'),
        name: document.getElementById('signupName'),
        email: document.getElementById('signupEmail'),
        password: document.getElementById('signupPassword'),
        btn: document.getElementById('signupBtn'),
        nameError: document.getElementById('nameError'),
        emailError: document.getElementById('signupEmailError'),
        passwordError: document.getElementById('signupPasswordError')
    },
    links: {
        showSignup: document.getElementById('showSignup'),
        showLogin: document.getElementById('showLogin')
    },
    passwordToggles: document.querySelectorAll('.toggle-password')
};

// Auth state observer
if (auth) {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // Se l'utente è già loggato quando apre questa pagina,
            // avvisa il background e chiudi la scheda.
            console.log("User is already signed in. Notifying background and closing.");
            notifyBackgroundAndClose();
        }
    });
}

// --- Utility Functions ---
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validateField = (value, minLength = 0, checkEmail = false) => {
    const trimmedValue = value.trim();
    const lengthValid = trimmedValue.length >= minLength;
    const emailValid = checkEmail ? emailRegex.test(trimmedValue) : true;
    return lengthValid && emailValid;
};
const showError = (element, message) => {
    if (element) {
        element.textContent = message;
        element.style.display = 'block';
    }
};
const clearErrors = (errorElements) => errorElements.forEach(el => {
    if (el) {
        el.textContent = '';
        el.style.display = 'none';
    }
});
const setButtonState = (button, isLoading, defaultText) => {
    if (button) {
        button.disabled = isLoading;
        button.textContent = isLoading ? 'Loading...' : defaultText;
    }
};

// NUOVA FUNZIONE per notificare il background e chiudere la scheda
function notifyBackgroundAndClose() {
    chrome.runtime.sendMessage({ type: 'auth_success' }, (response) => {
        if (chrome.runtime.lastError) {
            // Potrebbe esserci un errore se il background script non è pronto, ma possiamo comunque chiudere
            console.warn("Could not send auth_success message:", chrome.runtime.lastError.message);
        }
        window.close();
    });
}


// --- Event Handlers ---
const handleLogin = async () => {
    const { email, password, btn, emailError, passwordError } = elements.login;
    const emailVal = email.value;
    const passwordVal = password.value;

    clearErrors([emailError, passwordError]);

    let isValid = true;
    if (!validateField(emailVal, 1, true)) {
        showError(emailError, 'Please enter a valid email');
        isValid = false;
    }
    if (passwordVal.length < 6) {
        showError(passwordError, 'Password must be at least 6 characters');
        isValid = false;
    }

    if (!isValid) return;

    setButtonState(btn, true, 'Log In');

    try {
        await auth.signInWithEmailAndPassword(emailVal.trim(), passwordVal);
        // SUCCESSO: notifica e chiudi
        notifyBackgroundAndClose();
    } catch (error) {
        const errorMap = {
            'auth/user-not-found': 'No account found with this email.',
            'auth/wrong-password': 'Incorrect password. Please try again.',
            'auth/invalid-email': 'The email address is not valid.',
            'auth/invalid-credential': 'Incorrect email or password.',
            'auth/too-many-requests': 'Access temporarily disabled due to too many failed login attempts. Please try again later.',
            'auth/network-request-failed': 'Network error. Please check your connection.'
        };
        const message = errorMap[error.code] || 'Login failed. Please try again.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
            showError(emailError, message);
        } else {
            showError(passwordError, message);
        }
    } finally {
        setButtonState(btn, false, 'Log In');
    }
};

const handleSignup = async () => {
    const { name, email, password, btn, nameError, emailError, passwordError } = elements.signup;
    const nameVal = name.value;
    const emailVal = email.value;
    const passwordVal = password.value;

    clearErrors([nameError, emailError, passwordError]);

    let isValid = true;
    if (!validateField(nameVal, 1)) {
        showError(nameError, 'Please enter your full name');
        isValid = false;
    }
    if (!validateField(emailVal, 1, true)) {
        showError(emailError, 'Please enter a valid email');
        isValid = false;
    }
    if (passwordVal.length < 6) {
        showError(passwordError, 'Password must be at least 6 characters');
        isValid = false;
    }

    if (!isValid) return;

    setButtonState(btn, true, 'Sign Up');
    let createdUser = null;

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(emailVal.trim(), passwordVal);
        createdUser = userCredential.user;
        await createdUser.updateProfile({ displayName: nameVal.trim() });

        const userRef = db.collection('users').doc(createdUser.uid);
        const transactionRef = userRef.collection('transactions').doc();

        const userData = {
            name: nameVal.trim(),
            email: emailVal.trim(),
            coins: 50,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active',
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        };
        const transactionData = {
            amount: 50,
            type: 'credit',
            description: 'Welcome bonus',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        const batch = db.batch();
        batch.set(userRef, userData);
        batch.set(transactionRef, transactionData);
        await batch.commit();

        // SUCCESSO: notifica e chiudi
        notifyBackgroundAndClose();

    } catch (error) {
        if (createdUser) {
            try { await createdUser.delete(); } catch (deleteError) { console.error('Auth user rollback failed:', deleteError); }
        }
        const errorMap = {
            'auth/email-already-in-use': 'This email address is already registered.',
            'auth/invalid-email': 'The email address is not valid.',
            'auth/weak-password': 'Password is too weak. Please choose a stronger password.',
            'permission-denied': 'Database error. Could not save user data.',
            'unavailable': 'Database service is temporarily unavailable. Please try again.'
        };
        const message = errorMap[error.code] || `Signup failed: ${error.message}`;
        if (error.code === 'auth/email-already-in-use' || error.code === 'auth/invalid-email') {
            showError(emailError, message);
        } else {
            showError(passwordError, message);
        }
    } finally {
        setButtonState(btn, false, 'Sign Up');
    }
};

const togglePasswordVisibility = (event) => {
    const iconSpan = event.currentTarget;
    const targetInputId = iconSpan.dataset.target;
    if (!targetInputId) return;
    const passwordInput = document.getElementById(targetInputId);
    if (passwordInput) {
        const isPasswordHidden = passwordInput.type === 'password';
        passwordInput.type = isPasswordHidden ? 'text' : 'password';
        iconSpan.classList.toggle('active', isPasswordHidden);
    }
};

// --- Attach Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    if (elements.login.btn) elements.login.btn.addEventListener('click', handleLogin);
    if (elements.signup.btn) elements.signup.btn.addEventListener('click', handleSignup);

    if (elements.links.showSignup) {
        elements.links.showSignup.addEventListener('click', (e) => {
            e.preventDefault();
            elements.login.container.style.display = 'none';
            elements.signup.container.style.display = 'flex';
            clearErrors([elements.login.emailError, elements.login.passwordError, elements.signup.nameError, elements.signup.emailError, elements.signup.passwordError]);
        });
    }
    if (elements.links.showLogin) {
        elements.links.showLogin.addEventListener('click', (e) => {
            e.preventDefault();
            elements.signup.container.style.display = 'none';
            elements.login.container.style.display = 'flex';
            clearErrors([elements.login.emailError, elements.login.passwordError, elements.signup.nameError, elements.signup.emailError, elements.signup.passwordError]);
        });
    }

    elements.passwordToggles.forEach(toggle => toggle.addEventListener('click', togglePasswordVisibility));

    [elements.login.email, elements.login.password, elements.signup.name, elements.signup.email, elements.signup.password].forEach(input => {
        if (input) {
            input.addEventListener('input', () => {
                if (input.id.startsWith('signup')) {
                    clearErrors([elements.signup.nameError, elements.signup.emailError, elements.signup.passwordError]);
                } else {
                    clearErrors([elements.login.emailError, elements.login.passwordError]);
                }
            });
        }
    });
});
