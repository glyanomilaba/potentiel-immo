// Potentiel Immo — générateur du rapport personnalisé (PDF)
// Construit un document HTML complet à partir des réponses du questionnaire
// et du résultat du moteur d'estimation, puis le convertit en PDF côté
// navigateur via html2pdf.js. Sert à la fois de pièce jointe pour le
// prospect et de copie de travail pour le conseiller.

const ReportGenerator = (() => {

  // -----------------------------------------------------------
  // Libellés lisibles pour les caractéristiques du bien
  // -----------------------------------------------------------
  function formatBienLabel(answers) {
    const parts = [];
    if (answers.typeBien) parts.push(answers.typeBien);
    if (answers.surface) parts.push(`${answers.surface} m²`);
    if (answers.pieces) parts.push(`${answers.pieces} pièce(s)`);
    return parts.join(' · ') || 'votre bien';
  }

  function formatObjectifLabel(answers) {
    if (answers.objectif === 'Louer' || answers.objectif === 'Optimiser un bien déjà loué') {
      const loc = answers.typeLocation;
      if (loc === 'Courte durée') return 'Location courte durée (type Airbnb)';
      if (loc === "Les deux m'intéressent") return 'Location longue et courte durée';
      return 'Location longue durée';
    }
    if (answers.objectif === 'Vendre') return 'Vente';
    return answers.objectif || 'Non précisé';
  }

  function formatMoney(value, unit) {
    if (typeof value !== 'number') return '—';
    return `${value.toLocaleString('fr-FR')} ${unit || ''}`.trim();
  }

  // -----------------------------------------------------------
  // Recommandations générées selon les réponses et le résultat
  // -----------------------------------------------------------
  function buildRecommendations(answers, primary) {
    const recos = [];

    if (answers.dpe === 'E ou F' || answers.dpe === 'G') {
      recos.push("Une rénovation énergétique (isolation, chauffage) pourrait sensiblement améliorer le potentiel du bien et faciliter sa mise en location ou sa vente, le DPE étant de plus en plus déterminant pour les acquéreurs et locataires.");
    }

    if (answers.etat === 'À rafraîchir' || answers.etat === 'Travaux à prévoir') {
      recos.push("Des travaux de rafraîchissement ciblés (peinture, sols, cuisine ou salle de bain) offrent souvent un bon retour sur investissement avant une mise en vente ou en location.");
    }

    if (answers.exterieur === 'Aucun') {
      recos.push("L'absence d'espace extérieur peut être compensée par une mise en valeur soignée des volumes intérieurs et de la luminosité dans les photos et visites.");
    }

    if (primary && primary.type === 'location-courte') {
      recos.push("La location courte durée génère un potentiel de revenus plus élevé que la location classique, mais demande une gestion plus active (accueil, ménage, tarification) — une conciergerie spécialisée peut prendre en charge cet aspect.");
    }

    if (answers.objectif === 'Je ne sais pas encore') {
      recos.push("Avant de trancher entre vente et location, il est utile de comparer les deux scénarios sur la durée, en tenant compte de votre situation personnelle et de vos projets à moyen terme.");
    }

    if (recos.length === 0) {
      recos.push("Votre bien présente un bon potentiel en l'état. Un échange avec un conseiller permettra d'affiner la stratégie la plus adaptée à votre situation.");
    }

    return recos;
  }

  // -----------------------------------------------------------
  // Bloc d'affichage d'un résultat chiffré (réutilisable pour
  // les cas mixte/indécis où plusieurs résultats coexistent)
  // -----------------------------------------------------------
  function renderResultBlock(title, result) {
    if (!result) return '';
    return `
      <div class="report-result-block">
        <h3>${title}</h3>
        <p class="report-figure">${formatMoney(result.pointEstimate, result.unit)}</p>
        <p class="report-range">Fourchette estimée : ${formatMoney(result.rangeLow, result.unit)} – ${formatMoney(result.rangeHigh, result.unit)}</p>
        <p class="report-source">${result.sourceLabel || ''}</p>
      </div>
    `;
  }

  function renderResultsSection(result) {
    if (!result) return '<p>Estimation indisponible.</p>';

    if (result.type === 'location-mixte') {
      return renderResultBlock('Potentiel en location longue durée', result.longue) + renderResultBlock('Potentiel en location courte durée', result.courte);
    }
    if (result.type === 'indecis') {
      return renderResultBlock('Potentiel à la vente', result.vente) + renderResultBlock('Potentiel en location longue durée', result.longue) + renderResultBlock('Potentiel en location courte durée', result.courte);
    }
    const titleMap = {
      'vente': 'Potentiel à la vente',
      'location-longue': 'Potentiel en location longue durée',
      'location-courte': 'Potentiel en location courte durée',
    };
    return renderResultBlock(titleMap[result.type] || 'Potentiel estimé', result);
  }

  // -----------------------------------------------------------
  // Construction du document HTML complet
  // -----------------------------------------------------------
  function buildReportHtml(answers, result) {
    const primary = (result && (result.longue || result.vente || result)) || null;
    const recommendations = buildRecommendations(answers, primary);
    const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Helvetica', 'Arial', sans-serif;
    color: #0B1E3D;
    margin: 0;
    padding: 40px;
    line-height: 1.5;
  }
  .report-header {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 2px solid #1A4FE0; padding-bottom: 16px; margin-bottom: 28px;
  }
  .report-logo { font-size: 20px; font-weight: bold; color: #0B1E3D; }
  .report-logo em { color: #1A4FE0; font-style: normal; }
  .report-date { font-size: 12px; color: #6B7280; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h2 { font-size: 16px; color: #1A4FE0; margin: 28px 0 10px; border-bottom: 1px solid #E8EEFC; padding-bottom: 6px; }
  h3 { font-size: 14px; margin: 0 0 4px; color: #0B1E3D; }
  p { margin: 4px 0; font-size: 13px; }
  .report-subtitle { font-size: 13px; color: #6B7280; margin-bottom: 24px; }
  .report-meta-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px;
    background: #F5F3EE; border-radius: 8px; padding: 16px 20px; font-size: 13px;
  }
  .report-meta-grid div span:first-child { color: #6B7280; display: inline-block; min-width: 140px; }
  .report-result-block {
    background: #E8EEFC; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px;
  }
  .report-figure { font-size: 26px; font-weight: bold; color: #1A4FE0; margin: 4px 0; }
  .report-range { font-size: 12px; color: #6B7280; margin: 0; }
  .report-source { font-size: 11px; color: #9CA3AF; font-style: italic; margin: 4px 0 0; }
  .report-recos { list-style: none; padding: 0; margin: 0; }
  .report-recos li {
    font-size: 13px; padding: 10px 0 10px 22px; position: relative;
    border-bottom: 1px solid #EDEAE2;
  }
  .report-recos li::before {
    content: '→'; position: absolute; left: 0; color: #1A4FE0; font-weight: bold;
  }
  .report-footer {
    margin-top: 36px; padding-top: 16px; border-top: 1px solid #EDEAE2;
    font-size: 11px; color: #9CA3AF;
  }
  .report-cta {
    background: #0B1E3D; color: #F5F3EE; border-radius: 8px; padding: 18px 22px; margin-top: 24px;
  }
  .report-cta p { color: #F5F3EE; margin: 0; font-size: 13px; }
</style>
</head>
<body>

  <div class="report-header">
    <div class="report-logo">Potentiel<em>Immo</em></div>
    <div class="report-date">Rapport généré le ${dateStr}</div>
  </div>

  <h1>Analyse de potentiel — ${formatBienLabel(answers)}</h1>
  <p class="report-subtitle">Préparé pour ${answers.prenom || ''} ${answers.nom || ''} · Objectif : ${formatObjectifLabel(answers)}</p>

  <h2>Potentiel estimé</h2>
  ${renderResultsSection(result)}

  <h2>Caractéristiques du bien</h2>
  <div class="report-meta-grid">
    <div><span>Adresse</span><span>${answers.adresse || '—'}</span></div>
    <div><span>Type de bien</span><span>${answers.typeBien || '—'}</span></div>
    <div><span>Surface</span><span>${answers.surface ? answers.surface + ' m²' : '—'}</span></div>
    <div><span>Pièces</span><span>${answers.pieces || '—'}</span></div>
    <div><span>Étage</span><span>${answers.etage || '—'}</span></div>
    <div><span>Ascenseur</span><span>${answers.ascenseur || '—'}</span></div>
    <div><span>Année de construction</span><span>${answers.anneeConstruction || '—'}</span></div>
    <div><span>DPE</span><span>${answers.dpe || '—'}</span></div>
    <div><span>Extérieur</span><span>${answers.exterieur || '—'}</span></div>
    <div><span>Stationnement</span><span>${answers.stationnement || '—'}</span></div>
    <div><span>Exposition</span><span>${answers.exposition || '—'}</span></div>
    <div><span>État général</span><span>${answers.etat || '—'}</span></div>
    <div><span>Travaux récents</span><span>${answers.travauxRecents || '—'}</span></div>
  </div>

  <h2>Comment ce chiffre est calculé</h2>
  <p>L'estimation croise les caractéristiques de votre bien avec des données de marché officielles : transactions immobilières réelles (DVF) pour la vente, observatoires locaux des loyers pour la location longue durée, et méthode standard du secteur pour la location courte durée. Le résultat est ensuite ajusté selon l'état du bien, sa performance énergétique, son étage et ses atouts spécifiques (extérieur, exposition).</p>

  <h2>Recommandations</h2>
  <ul class="report-recos">
    ${recommendations.map(r => `<li>${r}</li>`).join('')}
  </ul>

  <div class="report-cta">
    <p><strong>Prochaine étape :</strong> un conseiller Potentiel Immo va vous contacter prochainement pour commenter cette analyse en détail, répondre à vos questions, et vous mettre en relation avec un partenaire (agence ou conciergerie) si vous le souhaitez.</p>
  </div>

  <div class="report-footer">
    <p>Ce rapport est une estimation indicative basée sur les informations déclarées et des données de marché publiques. Il ne constitue pas une expertise immobilière formelle. Potentiel Immo — contact@potentielimmo.fr</p>
  </div>

</body>
</html>
    `;
  }

  // -----------------------------------------------------------
  // Conversion en PDF via html2pdf.js (chargé depuis le CDN)
  // Retourne un Blob PDF, prêt à être envoyé en pièce jointe ou
  // proposé en téléchargement.
  // -----------------------------------------------------------
  async function ensureHtml2Pdf() {
    if (window.html2pdf) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Impossible de charger html2pdf.js'));
      document.head.appendChild(script);
    });
  }

  async function generatePdfBlob(answers, result) {
    await ensureHtml2Pdf();

    const html = buildReportHtml(answers, result);
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.width = '794px'; // largeur A4 à 96dpi
    container.innerHTML = html;
    document.body.appendChild(container);

    try {
      const worker = window.html2pdf()
        .set({
          margin: 0,
          filename: 'potentiel-immo-rapport.pdf',
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'px', format: 'a4', orientation: 'portrait' },
        })
        .from(container);

      const pdfBlob = await worker.outputPdf('blob');
      return pdfBlob;
    } finally {
      container.remove();
    }
  }

  async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // reader.result = "data:application/pdf;base64,XXXX" — on ne garde que la partie base64
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  return { buildReportHtml, generatePdfBlob, blobToBase64, formatBienLabel, formatObjectifLabel };
})();

if (typeof window !== 'undefined') {
  window.ReportGenerator = ReportGenerator;
}
