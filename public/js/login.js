(function () {
  function getNextPath() {
    const params = new URLSearchParams(window.location.search);
    const nextPath = String(params.get('next') || '').trim();
    if (!nextPath.startsWith('/')) return '/index.html';
    if (nextPath.startsWith('//')) return '/index.html';
    if (nextPath.includes('login.html')) return '/index.html';
    return nextPath || '/index.html';
  }

  function setError(message) {
    const errorNode = document.getElementById('loginError');
    if (!errorNode) return;
    const text = String(message || '').trim();
    errorNode.textContent = text;
    errorNode.hidden = !text;
  }

  async function handleLoginSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    if (!usernameInput || !passwordInput || !submitButton) return;

    const username = String(usernameInput.value || '').trim();
    const password = String(passwordInput.value || '');
    if (!username || !password) {
      setError('Enter both username and password.');
      return;
    }

    setError('');
    submitButton.disabled = true;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          username,
          password,
          next: getNextPath()
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload && payload.error ? payload.error : 'Sign in failed.');
        return;
      }

      window.location.href = payload && payload.redirectTo ? payload.redirectTo : '/index.html';
    } catch (error) {
      setError('Unable to reach server. Check that the PDA app is running.');
    } finally {
      submitButton.disabled = false;
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const usernameInput = document.getElementById('loginUsername');
    if (!form) return;
    form.addEventListener('submit', handleLoginSubmit);
    if (usernameInput) usernameInput.focus();
  });
})();
