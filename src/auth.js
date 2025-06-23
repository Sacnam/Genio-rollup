// File: auth.js (Refactored for Manifest V3 - Message Passing)
//stranezzegit commit -m "Il tuo messaggio di commit"
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

    chrome.runtime.sendMessage({
        command: 'login',
        payload: {
            email: emailVal.trim(),
            password: passwordVal
        }
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Message sending failed:", chrome.runtime.lastError);
            showError(passwordError, "An unexpected error occurred. Please try again.");
            setButtonState(btn, false, 'Log In');
            return;
        }

        if (response.success) {
            window.close();
        } else {
            // Usa la mappatura degli errori inviata dal background
            if (response.error.code === 'auth/user-not-found' || response.error.code === 'auth/invalid-email') {
                showError(emailError, response.error.message);
            } else {
                showError(passwordError, response.error.message);
            }
            setButtonState(btn, false, 'Log In');
        }
    });
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

    chrome.runtime.sendMessage({
        command: 'signup',
        payload: {
            name: nameVal.trim(),
            email: emailVal.trim(),
            password: passwordVal
        }
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Message sending failed:", chrome.runtime.lastError);
            showError(passwordError, "An unexpected error occurred. Please try again.");
            setButtonState(btn, false, 'Sign Up');
            return;
        }

        if (response.success) {
            window.close();
        } else {
            // Usa la mappatura degli errori inviata dal background
            if (response.error.code === 'auth/email-already-in-use' || response.error.code === 'auth/invalid-email') {
                showError(emailError, response.error.message);
            } else {
                showError(passwordError, response.error.message);
            }
            setButtonState(btn, false, 'Sign Up');
        }
    });
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
    // Controlla se l'utente è già loggato, in tal caso chiudi subito la pagina.
    // Questo gestisce il caso in cui l'utente apre auth.html direttamente essendo già loggato.
    chrome.runtime.sendMessage({ command: 'getAuthState' }, (response) => {
        if (response && response.isLoggedIn) {
            console.log("User is already logged in. Closing auth page.");
            window.close();
        }
    });

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