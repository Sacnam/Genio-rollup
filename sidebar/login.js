// File: login.js (Sintassi compat, per funzionare con i file -compat.js)

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
    console.log("Firebase initialized successfully in login.js");
} catch (error) {
    console.error("Firebase initialization error in login.js:", error);
    document.body.innerHTML = '<p style="color:red; padding: 20px;">Error initializing application services. Please try again later.</p>';
}

// DOM elements
const elements = {
    login: {
        container: document.querySelector('.login-container'),
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

// Auth state observer with user document check
if (auth) {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            const userRef = db.collection('users').doc(user.uid);
            try {
                const doc = await userRef.get();
                if (!doc.exists) {
                    console.warn('User document missing, creating...');
                    await userRef.set({
                        name: user.displayName || 'User',
                        email: user.email,
                        coins: 50,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        status: 'active',
                    });
                    console.log('User document created.');
                }
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Error checking/creating user document:', error);
                auth.signOut();
                alert('Account configuration error. Please log in again.');
            }
        } else {
            console.log("No user logged in. Showing login form.");
            if (elements.signup.container) elements.signup.container.style.display = 'none';
            if (elements.login.container) elements.login.container.style.display = 'flex';
            clearErrors([
                elements.login.emailError, elements.login.passwordError,
                elements.signup.nameError, elements.signup.emailError, elements.signup.passwordError
            ]);
        }
    });
} else {
    console.error("Firebase Auth service is not available.");
    if (!document.body.innerHTML.includes('Error initializing')) {
         document.body.innerHTML = '<p style="color:red; padding: 20px;">Authentication service failed to load. Please refresh.</p>';
    }
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
    } else {
        console.warn("Attempted to show error on a null element:", message);
    }
};
const clearErrors = (errorElements) =>
    errorElements.forEach(el => {
        if (el) {
            el.textContent = '';
            el.style.display = 'none';
        }
    });
const setButtonState = (button, isLoading, defaultText) => {
    if (button) {
        button.disabled = isLoading;
        button.textContent = isLoading ? 'Loading...' : defaultText;
    } else {
        console.warn("Attempted to set state on a null button.");
    }
};

// --- Event Handlers ---
const handleLogin = async () => {
    if (!elements.login.email || !elements.login.password || !elements.login.btn || !elements.login.emailError || !elements.login.passwordError) {
        console.error("Login form elements not found.");
        alert("An error occurred. Please refresh the page.");
        return;
    }

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
        console.log("Login successful, redirecting...");
    } catch (error) {
        console.error('Login error:', error.code, error.message);
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
    if (!elements.signup.name || !elements.signup.email || !elements.signup.password || !elements.signup.btn || !elements.signup.nameError || !elements.signup.emailError || !elements.signup.passwordError) {
        console.error("Signup form elements not found.");
        alert("An error occurred. Please refresh the page.");
        return;
    }

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
        console.log('Auth user created:', createdUser.uid);

        await createdUser.updateProfile({ displayName: nameVal.trim() });
        console.log('Firebase Auth profile updated with display name.');

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
        console.log('Firestore batch (user data & transaction) completed successfully.');

        console.log("Signup successful, redirecting...");

    } catch (error) {
        console.error('Signup error:', error.code, error.message);

        if (createdUser && (error.code.startsWith('permission-denied') || error.code.startsWith('unavailable'))) {
            console.warn("Firestore error after Auth creation. Attempting Auth user rollback...");
            try {
                await createdUser.delete();
                console.log('Auth user rollback successful.');
            } catch (deleteError) {
                console.error('Auth user rollback failed:', deleteError);
                alert("Signup partially failed. Please contact support if you cannot log in.");
            }
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
        } else if (error.code === 'auth/weak-password') {
            showError(passwordError, message);
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
    } else {
        console.warn(`Password input with ID "${targetInputId}" not found.`);
    }
};

// --- Attach Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    if (elements.login.btn) {
        elements.login.btn.addEventListener('click', handleLogin);
    } else { console.error("Login button not found."); }

    if (elements.signup.btn) {
        elements.signup.btn.addEventListener('click', handleSignup);
    } else { console.error("Signup button not found."); }

    if (elements.links.showSignup) {
        elements.links.showSignup.addEventListener('click', (e) => {
            e.preventDefault();
            if (elements.login.container) elements.login.container.style.display = 'none';
            if (elements.signup.container) elements.signup.container.style.display = 'flex';
            clearErrors([
                elements.login.emailError, elements.login.passwordError,
                elements.signup.nameError, elements.signup.emailError, elements.signup.passwordError
            ]);
        });
    } else { console.error("Show Signup link not found."); }

    if (elements.links.showLogin) {
        elements.links.showLogin.addEventListener('click', (e) => {
            e.preventDefault();
            if (elements.signup.container) elements.signup.container.style.display = 'none';
            if (elements.login.container) elements.login.container.style.display = 'flex';
            clearErrors([
                elements.login.emailError, elements.login.passwordError,
                elements.signup.nameError, elements.signup.emailError, elements.signup.passwordError
            ]);
        });
    } else { console.error("Show Login link not found."); }

    if (elements.passwordToggles.length > 0) {
        elements.passwordToggles.forEach(toggle => {
            toggle.addEventListener('click', togglePasswordVisibility);
        });
    } else { console.warn("No password toggle icons found."); }

    const inputsToClearErrors = [
        elements.login.email, elements.login.password,
        elements.signup.name, elements.signup.email, elements.signup.password
    ];

    inputsToClearErrors.forEach(input => {
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

    console.log("Event listeners attached.");
});