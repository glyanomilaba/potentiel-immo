// Potentiel Immo — espace client
// Affiche les biens de l'utilisateur connecté, avec pour chacun le
// dernier potentiel estimé, le téléchargement du rapport PDF, et les
// actions de réestimation / modification / suppression.

document.addEventListener('DOMContentLoaded', async () => {
  const greetingEl = document.getElementById('ecGreeting');
  const authZone = document.getElementById('headerAuthZone');
  const loadingEl = document.getElementById('ecLoading');
  const emptyEl = document.getElementById('ecEmpty');
  const gridEl = document.getElementById('ecPropertiesGrid');
  const cardTemplate = document.getElementById('ecPropertyCardTemplate');

  if (!window.PotentielAuth || !window.PotentielData) {
    loadingEl.innerHTML = '<p>Le service est momentanément indisponible. Réessayez dans un instant.</p>';
    return;
  }

  // -----------------------------------------------------------
  // L'accès à cette page nécessite d'être connecté — sinon, retour
  // vers la landing où la personne pourra se connecter ou s'inscrire.
  // -----------------------------------------------------------
  const user = await window.PotentielAuth.getCurrentUser();
  if (!user) {
    window.location.href = 'landing.html';
    return;
  }

  renderHeaderAuthZone(user);

  const firstName = (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name))
    ? String(user.user_metadata.full_name || user.user_metadata.name).split(' ')[0]
    : (user.email ? user.email.split('@')[0] : '');
  greetingEl.textContent = firstName ? `Bonjour ${firstName}` : 'Bonjour';

  await loadAndRenderProperties(user.id);

  // -----------------------------------------------------------
  // Zone d'authentification du header — identique à celle de la
  // landing, pour la cohérence (prénom + accès espace client, ou
  // bouton de déconnexion ici puisqu'on y est déjà).
  // -----------------------------------------------------------
  function renderHeaderAuthZone(user) {
    authZone.innerHTML = `
      <button type="button" class="btn-header-secondary" id="logoutBtn">Se déconnecter</button>
    `;
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        await window.PotentielAuth.signOut();
        window.location.href = 'landing.html';
      } catch (err) {
        console.error('Échec de la déconnexion', err);
      }
    });
  }

  // -----------------------------------------------------------
  // Chargement des biens et de leur dernière estimation
  // -----------------------------------------------------------
  async function loadAndRenderProperties(userId) {
    console.log('[diag] loadAndRenderProperties: démarrage, userId =', userId);
    let properties = [];
    try {
      properties = await window.PotentielData.listProperties(userId);
      console.log('[diag] listProperties OK, nombre de biens =', properties.length, properties);
    } catch (err) {
      console.error('[diag] Échec du chargement des biens', err);
      const detail = (err && err.message) ? err.message : 'erreur inconnue';
      loadingEl.innerHTML = `<p>Impossible de charger vos biens pour le moment (${escapeHtml(detail)}). Réessayez dans un instant.</p>`;
      loadingEl.hidden = false;
      emptyEl.hidden = true;
      gridEl.hidden = true;
      return;
    }

    loadingEl.hidden = true;
    console.log('[diag] loadingEl masqué');

    if (properties.length === 0) {
      console.log('[diag] Aucun bien, affichage état vide');
      emptyEl.hidden = false;
      return;
    }

    gridEl.hidden = false;
    console.log('[diag] Avant Promise.all sur', properties.length, 'bien(s)');

    // charge en parallèle la dernière estimation de chaque bien
    let propertiesWithEstimation;
    try {
      propertiesWithEstimation = await Promise.all(
        properties.map(async (property) => {
          console.log('[diag] traitement du bien', property.id);
          let lastEstimation = null;
          try {
            const estimations = await window.PotentielData.listEstimations(property.id);
            console.log('[diag] listEstimations OK pour', property.id, '→', estimations.length, 'estimation(s)');
            lastEstimation = estimations[0] || null;
          } catch (err) {
            console.warn('[diag] Estimation indisponible pour le bien', property.id, err);
          }
          return { property, lastEstimation };
        })
      );
      console.log('[diag] Promise.all terminé avec succès', propertiesWithEstimation);
    } catch (err) {
      console.error('[diag] Promise.all a levé une exception inattendue', err);
      loadingEl.hidden = false;
      loadingEl.innerHTML = `<p>Une erreur inattendue est survenue (${escapeHtml(err && err.message || 'inconnue')}).</p>`;
      gridEl.hidden = true;
      return;
    }

    console.log('[diag] Début de la construction des cartes');
    propertiesWithEstimation.forEach(({ property, lastEstimation }) => {
      try {
        gridEl.appendChild(buildPropertyCard(property, lastEstimation));
        console.log('[diag] Carte ajoutée pour', property.id);
      } catch (err) {
        console.error('[diag] Échec de la construction de la carte pour', property.id, err);
      }
    });
    console.log('[diag] Fin du rendu des cartes');
  }

  // -----------------------------------------------------------
  // Construit une carte de bien à partir du gabarit HTML
  // -----------------------------------------------------------
  function buildPropertyCard(property, lastEstimation) {
    const node = cardTemplate.content.cloneNode(true);
    const card = node.querySelector('.ec-property-card');
    const answers = property.answers || {};

    card.querySelector('.ec-property-type').textContent = formatObjectifLabel(answers);
    card.querySelector('.ec-property-label').textContent = answers.typeBien
      ? `${answers.typeBien}${answers.surface ? ' · ' + answers.surface + ' m²' : ''}`
      : (property.label || 'Bien sans nom');
    card.querySelector('.ec-property-address').textContent = answers.adresse || '';

    const figureBlock = card.querySelector('.ec-property-figure-block');
    const figureLabelEl = card.querySelector('.ec-property-figure-label');
    const figureEl = card.querySelector('.ec-property-figure');
    const primary = pickPrimaryFromResult(lastEstimation ? lastEstimation.result : null);

    if (primary && typeof primary.pointEstimate === 'number') {
      figureLabelEl.textContent = 'Potentiel estimé';
      figureEl.textContent = `${primary.pointEstimate.toLocaleString('fr-FR')} ${primary.unit || ''}`.trim();
    } else {
      figureLabelEl.textContent = 'Estimation';
      figureEl.textContent = 'Non disponible';
      figureBlock.style.opacity = '0.6';
    }

    const dateEl = card.querySelector('.ec-property-date');
    const dateSource = lastEstimation ? lastEstimation.created_at : property.created_at;
    dateEl.textContent = dateSource
      ? `Mis à jour le ${new Date(dateSource).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
      : '';

    // ----- menu (...) : modifier / supprimer -----
    const menuBtn = card.querySelector('.ec-property-menu-btn');
    const menu = card.querySelector('.ec-property-menu');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.ec-property-menu').forEach(m => { if (m !== menu) m.hidden = true; });
      menu.hidden = !menu.hidden;
    });
    document.addEventListener('click', () => { menu.hidden = true; });

    card.querySelector('.ec-menu-edit').addEventListener('click', () => {
      goToReestimate(property);
    });

    card.querySelector('.ec-menu-delete').addEventListener('click', async () => {
      const confirmed = window.confirm(`Supprimer définitivement ce bien et son historique d'estimations ?`);
      if (!confirmed) return;
      try {
        await window.PotentielData.deleteProperty(property.id);
        card.remove();
        if (gridEl.children.length === 0) {
          gridEl.hidden = true;
          emptyEl.hidden = false;
        }
      } catch (err) {
        console.error('Échec de la suppression', err);
        alert("La suppression a échoué, réessayez dans un instant.");
      }
    });

    // ----- bouton PDF -----
    const pdfBtn = card.querySelector('.ec-pdf-btn');
    pdfBtn.addEventListener('click', async () => {
      if (!lastEstimation) return;
      pdfBtn.disabled = true;
      const originalText = pdfBtn.innerHTML;
      pdfBtn.textContent = 'Génération…';
      try {
        if (!window.ReportGenerator) throw new Error('Générateur de rapport indisponible');
        const blob = await window.ReportGenerator.generatePdfBlob(answers, lastEstimation.result);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `potentiel-immo-${(answers.adresse || 'rapport').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } catch (err) {
        console.error('Échec de la génération du PDF', err);
        alert("La génération du PDF a échoué, réessayez dans un instant.");
      } finally {
        pdfBtn.disabled = false;
        pdfBtn.innerHTML = originalText;
      }
    });

    // ----- bouton réestimer -----
    card.querySelector('.ec-reestimate-btn').addEventListener('click', () => {
      goToReestimate(property);
    });

    return node;
  }

  // -----------------------------------------------------------
  // Redirige vers Loop (index.html) avec les réponses du bien à
  // pré-remplir, pour permettre la modification + recalcul.
  // -----------------------------------------------------------
  function goToReestimate(property) {
    try {
      sessionStorage.setItem('potentielImmo.reestimateProperty', JSON.stringify({
        propertyId: property.id,
        answers: property.answers || {},
      }));
    } catch (err) {
      console.warn('Impossible de préparer la réestimation', err);
    }
    window.location.href = 'index.html?reestimer=1';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatObjectifLabel(answers) {
    if (answers.objectif === 'Louer' || answers.objectif === 'Optimiser un bien déjà loué') {
      const loc = answers.typeLocation;
      if (loc === 'Courte durée') return 'Location courte durée';
      if (loc === "Les deux m'intéressent") return 'Location';
      return 'Location longue durée';
    }
    if (answers.objectif === 'Vendre') return 'Vente';
    return answers.objectif || 'Estimation';
  }

  function pickPrimaryFromResult(result) {
    if (!result) return null;
    if (result.type === 'location-mixte') return result.longue || result.courte;
    if (result.type === 'indecis') return result.vente || result.longue || result.courte;
    return result;
  }
});
