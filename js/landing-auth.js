// Potentiel Immo — gestion de l'authentification sur la landing page
// Affiche soit un bouton "Se connecter / S'inscrire" (visiteur anonyme),
// soit "Bonjour [Prénom]" + un accès à l'espace client (utilisateur déjà
// connecté). Propose une modale légère de connexion (Google + email)
// pour ne pas avoir à passer par le chatbot Loop pour se connecter.

document.addEventListener('DOMContentLoaded', async () => {
  const zone = document.getElementById('headerAuthZone');
  if (!zone) return;

  async function refreshAuthZone() {
    const user = window.PotentielAuth ? await window.PotentielAuth.getCurrentUser() : null;

    if (user) {
      const firstName = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name))
        ? String(user.user_metadata.full_name || user.user_metadata.name).split(' ')[0]
        : (user.email ? user.email.split('@')[0] : 'vous');

      zone.innerHTML = `
        <span class="header-auth-greeting">Bonjour ${escapeHtml(firstName)}</span>
        <a href="espace-client.html" class="btn btn-header-secondary">Mon espace client</a>
      `;
    } else {
      zone.innerHTML = `
        <button type="button" class="btn btn-header-secondary" id="headerLoginBtn">Se connecter / S'inscrire</button>
      `;
      const loginBtn = document.getElementById('headerLoginBtn');
      if (loginBtn) {
        loginBtn.addEventListener('click', openLoginModal);
      }
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // -----------------------------------------------------------
  // Modale de connexion légère — réutilise la même logique que dans
  // Loop (Google en avant, email/mot de passe en option), mais sans
  // passer par le questionnaire puisqu'on n'a pas de bien à estimer ici.
  // -----------------------------------------------------------
  function openLoginModal() {
    const existing = document.getElementById('loginModalOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'loginModalOverlay';
    overlay.className = 'login-modal-overlay';
    overlay.innerHTML = `
      <div class="login-modal" role="dialog" aria-modal="true" aria-label="Connexion">
        <button type="button" class="login-modal-close" aria-label="Fermer">&times;</button>
        <h2 class="login-modal-title">Accédez à votre espace client</h2>
        <p class="login-modal-sub">Suivez vos biens et retrouvez vos estimations à tout moment.</p>

        <button type="button" class="btn-google-modal" id="modalGoogleBtn">
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.91c1.7-1.57 2.69-3.88 2.69-6.64z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.91-2.27c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.95 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.83.96 4.04l2.99-2.34z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.99 2.34C4.66 5.16 6.65 3.58 9 3.58z"/></svg>
          <span>Continuer avec Google</span>
        </button>

        <div class="login-modal-divider"><span>ou</span></div>

        <form id="modalEmailForm" class="login-modal-form">
          <input type="email" placeholder="votre@email.fr" inputmode="email" required aria-label="Email">
          <input type="password" placeholder="Mot de passe (8 caractères min.)" required minlength="8" aria-label="Mot de passe">
          <button type="submit" class="btn btn-primary">Continuer</button>
        </form>
        <p class="login-modal-status" id="modalStatus"></p>
        <p class="login-modal-fineprint">Si vous n'avez pas encore de compte, il sera créé automatiquement.</p>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.login-modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#modalGoogleBtn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try {
        if (window.PotentielAuth) {
          await window.PotentielAuth.signInWithGoogle();
        }
      } catch (err) {
        console.error('Échec de la connexion Google', err);
        e.target.disabled = false;
      }
    });

    const form = overlay.querySelector('#modalEmailForm');
    const statusEl = overlay.querySelector('#modalStatus');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = form.querySelector('input[type="email"]').value.trim();
      const password = form.querySelector('input[type="password"]').value;
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      statusEl.textContent = 'Connexion en cours…';

      try {
        if (!window.PotentielAuth) throw new Error('Service de compte indisponible');
        try {
          await window.PotentielAuth.signInWithEmail(email, password);
        } catch (signInErr) {
          await window.PotentielAuth.signUpWithEmail(email, password);
        }
        overlay.remove();
        window.location.href = 'espace-client.html';
      } catch (err) {
        console.error('Échec de la connexion/inscription', err);
        statusEl.textContent = "Une erreur est survenue. Vérifiez votre mot de passe ou réessayez.";
        submitBtn.disabled = false;
      }
    });
  }

  await refreshAuthZone();

  if (window.PotentielAuth) {
    window.PotentielAuth.onAuthStateChange(() => {
      refreshAuthZone();
    });
  }
});
