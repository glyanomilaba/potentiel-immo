// Fonction serverless Vercel — relais sécurisé vers l'API Resend.
//
// Pourquoi cette fonction existe : l'API Resend bloque les appels directs
// depuis un navigateur (CORS), et exige que l'envoi d'email se fasse
// côté serveur pour ne pas exposer la clé API. Cette fonction reçoit la
// demande d'envoi depuis le site (conversation.js / email-service.js),
// y ajoute la clé API Resend (lue depuis une variable d'environnement,
// jamais visible côté client), puis relaie vers Resend et renvoie le
// résultat au site.
//
// La clé API doit être configurée dans Vercel : Project Settings →
// Environment Variables → RESEND_API_KEY = re_xxxxxxxx

export default async function handler(req, res) {
  // Autorise les appels depuis le site (même domaine en production,
  // mais on reste permissif ici pour faciliter les tests).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée, utiliser POST.' });
    return;
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY) {
    res.status(500).json({ error: 'RESEND_API_KEY non configurée côté serveur.' });
    return;
  }

  try {
    const { from, to, subject, html, attachments } = req.body || {};

    if (!to || !subject || !html) {
      res.status(400).json({ error: 'Champs requis manquants : to, subject, html.' });
      return;
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from || 'Potentiel Immo <onboarding@resend.dev>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        attachments: attachments || [],
      }),
    });

    const data = await resendResponse.json();

    if (!resendResponse.ok) {
      res.status(resendResponse.status).json({ error: 'Erreur Resend', details: data });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur interne lors de l\'envoi', details: String(err) });
  }
}
