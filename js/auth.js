// Potentiel Immo — module d'authentification (Supabase)
// Gère la connexion Google, l'inscription/connexion par email+mot de
// passe, la déconnexion, et l'état de session courant. Utilise le SDK
// officiel Supabase chargé depuis le CDN — la clé "publishable" utilisée
// ici est volontairement publique (conçue pour être visible côté
// navigateur) et n'autorise que ce que les règles de sécurité RLS de la
// base de données permettent.

const PotentielAuth = (() => {

  const SUPABASE_URL = 'https://nifckaulqzxpwaxgyjun.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_F2-FM43dQI6o6FmuBHxoOA_7YPQeqgE';

  let supabaseClient = null;

  async function ensureSupabaseClient() {
    if (supabaseClient) return supabaseClient;

    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Impossible de charger le SDK Supabase'));
        document.head.appendChild(script);
      });
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    return supabaseClient;
  }

  // -----------------------------------------------------------
  // Connexion avec Google — redirige vers Google, puis revient sur la
  // page courante une fois authentifié (géré automatiquement par
  // Supabase via l'URL de callback configurée dans le dashboard).
  // -----------------------------------------------------------
  async function signInWithGoogle() {
    const client = await ensureSupabaseClient();
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.href,
      },
    });
    if (error) throw error;
  }

  // -----------------------------------------------------------
  // Inscription par email + mot de passe. Supabase envoie un email de
  // confirmation par défaut — selon la configuration du projet, le
  // compte peut nécessiter une validation avant la première connexion.
  // -----------------------------------------------------------
  async function signUpWithEmail(email, password, metadata) {
    const client = await ensureSupabaseClient();
    const options = metadata ? { data: metadata } : undefined;
    const { data, error } = await client.auth.signUp({ email, password, options });
    if (error) throw error;
    return data;
  }

  async function signInWithEmail(email, password) {
    const client = await ensureSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const client = await ensureSupabaseClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  // -----------------------------------------------------------
  // Récupère l'utilisateur actuellement connecté, ou null si personne
  // n'est connecté. Ne lève jamais d'exception : un échec de
  // récupération de session ne doit jamais casser le reste du site.
  // -----------------------------------------------------------
  async function getCurrentUser() {
    try {
      const client = await ensureSupabaseClient();
      const { data, error } = await client.auth.getUser();
      if (error || !data || !data.user) return null;
      return data.user;
    } catch (err) {
      console.warn('Impossible de récupérer l\'utilisateur courant.', err);
      return null;
    }
  }

  // -----------------------------------------------------------
  // Permet à d'autres parties du site de réagir aux changements d'état
  // de connexion (ex: rafraîchir l'affichage quand l'utilisateur se
  // connecte ou se déconnecte).
  // -----------------------------------------------------------
  async function onAuthStateChange(callback) {
    const client = await ensureSupabaseClient();
    client.auth.onAuthStateChange((event, session) => {
      callback(event, session ? session.user : null);
    });
  }

  async function getClient() {
    return ensureSupabaseClient();
  }

  return {
    signInWithGoogle,
    signUpWithEmail,
    signInWithEmail,
    signOut,
    getCurrentUser,
    onAuthStateChange,
    getClient,
  };
})();

if (typeof window !== 'undefined') {
  window.PotentielAuth = PotentielAuth;
}
