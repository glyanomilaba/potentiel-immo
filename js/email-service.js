// Potentiel Immo — service d'envoi d'email avec rapport PDF
// Envoie deux emails au moment où le prospect valide ses coordonnées : un
// email teaser au prospect avec le PDF complet en pièce jointe, et une
// copie identique vers l'adresse interne pour préparer l'appel du
// conseiller.
//
// L'envoi passe par la fonction serverless /api/send-email (voir
// api/send-email.js), qui relaie vers Resend côté serveur. Cette
// indirection est nécessaire car l'API Resend bloque les appels directs
// depuis un navigateur (CORS) et exige que la clé API ne soit jamais
// exposée côté client — elle est donc configurée uniquement dans les
// variables d'environnement de l'hébergement (Vercel), jamais ici.

const EmailService = (() => {

  const SEND_EMAIL_ENDPOINT = '/api/send-email';

  // Adresse d'envoi : tant qu'aucun domaine n'est vérifié sur Resend, on
  // utilise leur domaine de test par défaut (onboarding@resend.dev) qui
  // fonctionne sans configuration, mais avec une délivrabilité limitée et
  // un envoi restreint à l'adresse du compte Resend. À remplacer par une
  // adresse sur ton propre domaine une fois vérifié dans Resend
  // (ex: contact@potentielimmo.com).
  const FROM_ADDRESS = 'Potentiel Immo <onboarding@resend.dev>';
  const INTERNAL_COPY_ADDRESS = 'glyanomilaba@gmail.com';

  function buildProspectEmailHtml(answers, primary) {
    const prenom = answers.prenom || '';
    const bienLabel = (window.ReportGenerator && window.ReportGenerator.formatBienLabel(answers)) || 'votre bien';
    const figureHint = primary && typeof primary.pointEstimate === 'number'
      ? `un potentiel à ne pas négliger`
      : `des informations utiles pour la suite`;

    return `
      <div style="font-family: Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #0B1E3D;">
        <p style="font-size: 18px; font-weight: bold; margin-bottom: 4px;">Potentiel<span style="color:#1A4FE0;">Immo</span></p>
        <p style="font-size: 15px;">Bonjour ${prenom},</p>
        <p style="font-size: 15px; line-height: 1.6;">
          Merci pour votre confiance ! Votre analyse pour <strong>${bienLabel}</strong> est terminée,
          et elle révèle ${figureHint}.
        </p>
        <p style="font-size: 15px; line-height: 1.6;">
          Vous trouverez le détail complet de votre estimation, la méthode de calcul et nos
          recommandations personnalisées dans le rapport PDF joint à cet email.
        </p>
        <p style="font-size: 15px; line-height: 1.6;">
          Un conseiller vous appellera prochainement pour commenter ces résultats avec vous,
          répondre à toutes vos questions, et vous orienter vers le meilleur partenaire pour
          la suite de votre projet si vous le souhaitez.
        </p>
        <p style="font-size: 15px; margin-top: 28px;">À très bientôt,<br>L'équipe Potentiel Immo</p>
      </div>
    `;
  }

  function buildInternalEmailHtml(answers, primary) {
    const bienLabel = (window.ReportGenerator && window.ReportGenerator.formatBienLabel(answers)) || 'bien non précisé';
    const objectifLabel = (window.ReportGenerator && window.ReportGenerator.formatObjectifLabel(answers)) || answers.objectif || '';
    return `
      <div style="font-family: Helvetica, Arial, sans-serif; max-width: 560px;">
        <p><strong>Nouveau prospect — ${answers.prenom || ''} ${answers.nom || ''}</strong></p>
        <p>Objectif : ${objectifLabel}<br>
        Bien : ${bienLabel}<br>
        Adresse : ${answers.adresse || '—'}<br>
        Email : ${answers.email || '—'}<br>
        Téléphone : ${answers.telephone || '—'}</p>
        <p>Le rapport complet (PDF) est joint à cet email pour préparer l'appel.</p>
      </div>
    `;
  }

  async function sendEmailWithAttachment({ to, subject, html, pdfBase64, filename }) {
    try {
      const res = await fetch(SEND_EMAIL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to,
          subject,
          html,
          attachments: pdfBase64 ? [{ filename, content: pdfBase64 }] : [],
        }),
      });

      if (!res.ok) {
        const errorBody = await res.text();
        console.error('Échec de l\'envoi d\'email (via /api/send-email)', res.status, errorBody);
        return { success: false, reason: 'api_error', status: res.status };
      }

      const data = await res.json();
      return { success: true, id: data.id };
    } catch (err) {
      console.error('Erreur réseau lors de l\'envoi d\'email', err);
      return { success: false, reason: 'network_error' };
    }
  }

  // -----------------------------------------------------------
  // Point d'entrée principal : génère le PDF puis envoie les deux emails
  // (prospect + copie interne) en parallèle.
  // -----------------------------------------------------------
  async function sendReportEmails(answers, result) {
    if (!window.ReportGenerator) {
      console.error('ReportGenerator non chargé : impossible de générer le PDF.');
      return { success: false, reason: 'report_generator_missing' };
    }

    const primary = result && (result.longue || result.vente || (result.type && result.pointEstimate !== undefined ? result : null));

    let pdfBase64 = null;
    try {
      const pdfBlob = await window.ReportGenerator.generatePdfBlob(answers, result);
      pdfBase64 = await window.ReportGenerator.blobToBase64(pdfBlob);
    } catch (err) {
      console.error('Échec de la génération du PDF', err);
      // on continue quand même : on enverra les emails sans pièce jointe plutôt que de tout bloquer
    }

    const prospectEmail = answers.email;
    const filename = 'potentiel-immo-rapport.pdf';

    const tasks = [];

    if (prospectEmail) {
      tasks.push(sendEmailWithAttachment({
        to: prospectEmail,
        subject: 'Votre analyse de potentiel immobilier est prête',
        html: buildProspectEmailHtml(answers, primary),
        pdfBase64,
        filename,
      }));
    }

    if (INTERNAL_COPY_ADDRESS && !INTERNAL_COPY_ADDRESS.includes('COLLE_TON_EMAIL')) {
      tasks.push(sendEmailWithAttachment({
        to: INTERNAL_COPY_ADDRESS,
        subject: `Nouveau prospect — ${answers.prenom || ''} ${answers.nom || ''}`,
        html: buildInternalEmailHtml(answers, primary),
        pdfBase64,
        filename,
      }));
    } else {
      console.warn('Adresse interne non configurée : pas de copie envoyée en interne.');
    }

    const results = await Promise.all(tasks);
    const anySuccess = results.some(r => r.success);
    return { success: anySuccess, details: results };
  }

  return { sendReportEmails };
})();

if (typeof window !== 'undefined') {
  window.EmailService = EmailService;
}
