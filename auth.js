// Auth DOM Elements
const authScreen = document.getElementById('auth-screen');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegisterBtn = document.getElementById('show-register');
const showLoginBtn = document.getElementById('show-login');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

// Switch between Login and Register
showRegisterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      loginForm.classList.remove('active');
      registerForm.classList.add('active');
      loginError.textContent = '';
      registerError.textContent = '';
});

showLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      registerForm.classList.remove('active');
      loginForm.classList.add('active');
      loginError.textContent = '';
      registerError.textContent = '';
});

// Check if already logged in via cookie
async function checkAuth() {
      try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                  const data = await res.json();
                  console.log('Already logged in as:', data.user.username);
                  initializeApp(data.user);
            } else {
                  console.log('Not logged in, showing auth screen');
                  authScreen.style.display = 'flex';
            }
      } catch (err) {
            console.error('Auth check error:', err);
            authScreen.style.display = 'flex';
      }
}

// Login Handler
loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
            const res = await fetch('/api/auth/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (res.ok) {
                  // Login successful
                  console.log('Login successful:', data.user);
                  initializeApp(data.user);
            } else {
                  loginError.textContent = data.error || 'Login failed';
            }
      } catch (err) {
            console.error('Login error:', err);
            loginError.textContent = 'Network error, please try again.';
      }
});

// Register Handler
registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('register-email').value;
      const username = document.getElementById('register-username').value;
      const password = document.getElementById('register-password').value;

      try {
            const res = await fetch('/api/auth/register', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, username, password })
            });

            const data = await res.json();

            if (res.ok) {
                  // Register successful
                  console.log('Register successful:', data.user);
                  initializeApp(data.user);
            } else {
                  registerError.textContent = data.error || 'Registration failed';
            }
      } catch (err) {
            console.error('Register error:', err);
            registerError.textContent = 'Network error, please try again.';
      }
});

// Initialize App (Hide Auth, Show App, Connect Socket)
window.checkAuth = checkAuth;

function updateAvatar(avatarUrl, username) {
      const avatarEl = document.getElementById('user-avatar');
      const letterEl = document.getElementById('user-avatar-letter');

      if (avatarUrl) {
            letterEl.style.backgroundImage = `url(${avatarUrl})`;
            letterEl.textContent = '';
      } else {
            letterEl.style.backgroundImage = 'none';
            letterEl.textContent = username.charAt(0).toUpperCase();
      }
}
