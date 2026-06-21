// Potentiel Immo — gestion des biens et estimations (Supabase)
// Permet à un utilisateur connecté de sauvegarder un bien, de consulter
// ses biens existants, et d'enregistrer une nouvelle estimation pour un
// bien donné. S'appuie sur PotentielAuth pour le client Supabase déjà
// configuré, et sur les politiques RLS de la base pour la sécurité —
// un utilisateur ne peut jamais accéder aux données d'un autre, cette
// garantie est appliquée côté base de données, pas seulement ici.

const PotentielData = (() => {

  // -----------------------------------------------------------
  // Construit un libellé lisible pour identifier un bien dans une liste
  // (ex: "Appartement · 50 m² · 1 rue de Paris").
  // -----------------------------------------------------------
  function buildPropertyLabel(answers) {
    const parts = [];
    if (answers.typeBien) parts.push(answers.typeBien);
    if (answers.surface) parts.push(`${answers.surface} m²`);
    if (answers.adresse) parts.push(answers.adresse);
    return parts.join(' · ') || 'Bien sans nom';
  }

  // -----------------------------------------------------------
  // Enregistre un nouveau bien pour l'utilisateur connecté, à partir
  // des réponses du questionnaire. Retourne l'id du bien créé.
  // -----------------------------------------------------------
  async function saveProperty(userId, answers) {
    if (!window.PotentielAuth) throw new Error('PotentielAuth non chargé');
    const client = await window.PotentielAuth.getClient();

    const { data, error } = await client
      .from('properties')
      .insert({
        user_id: userId,
        label: buildPropertyLabel(answers),
        answers,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // -----------------------------------------------------------
  // Enregistre le résultat d'une estimation pour un bien existant.
  // -----------------------------------------------------------
  async function saveEstimation(userId, propertyId, result) {
    if (!window.PotentielAuth) throw new Error('PotentielAuth non chargé');
    const client = await window.PotentielAuth.getClient();

    const { data, error } = await client
      .from('estimations')
      .insert({
        user_id: userId,
        property_id: propertyId,
        result,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // -----------------------------------------------------------
  // Liste tous les biens de l'utilisateur connecté, du plus récent au
  // plus ancien.
  // -----------------------------------------------------------
  async function listProperties(userId) {
    if (!window.PotentielAuth) throw new Error('PotentielAuth non chargé');
    const client = await window.PotentielAuth.getClient();

    const { data, error } = await client
      .from('properties')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // -----------------------------------------------------------
  // Liste les estimations passées d'un bien donné, de la plus récente
  // à la plus ancienne — utile pour afficher l'évolution dans le temps.
  // -----------------------------------------------------------
  async function listEstimations(propertyId) {
    if (!window.PotentielAuth) throw new Error('PotentielAuth non chargé');
    const client = await window.PotentielAuth.getClient();

    const { data, error } = await client
      .from('estimations')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  // -----------------------------------------------------------
  // Met à jour les réponses d'un bien existant (pour permettre de
  // modifier les caractéristiques et relancer une estimation).
  // -----------------------------------------------------------
  async function updatePropertyAnswers(propertyId, answers) {
    if (!window.PotentielAuth) throw new Error('PotentielAuth non chargé');
    const client = await window.PotentielAuth.getClient();

    const { data, error } = await client
      .from('properties')
      .update({ answers, label: buildPropertyLabel(answers) })
      .eq('id', propertyId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async function deleteProperty(propertyId) {
    if (!window.PotentielAuth) throw new Error('PotentielAuth non chargé');
    const client = await window.PotentielAuth.getClient();

    const { error } = await client
      .from('properties')
      .delete()
      .eq('id', propertyId);

    if (error) throw error;
  }

  return {
    buildPropertyLabel,
    saveProperty,
    saveEstimation,
    listProperties,
    listEstimations,
    updatePropertyAnswers,
    deleteProperty,
  };
})();

if (typeof window !== 'undefined') {
  window.PotentielData = PotentielData;
}
