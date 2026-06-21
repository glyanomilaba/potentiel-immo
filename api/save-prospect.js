// Fonction serverless Vercel — relais sécurisé vers l'API Airtable.
//
// Pourquoi cette fonction existe : le token Airtable ne doit jamais être
// visible dans le code source du site (sinon n'importe qui pourrait lire,
// modifier ou supprimer les données de prospects). Cette fonction reçoit
// les réponses du questionnaire depuis le site (conversation.js), y
// ajoute le token Airtable (lu depuis une variable d'environnement,
// jamais visible côté client), puis relaie vers Airtable.
//
// Variables d'environnement à configurer dans Vercel : Project Settings →
// Environment Variables →
//   AIRTABLE_TOKEN = pat...
//   AIRTABLE_BASE_ID = app...
//   AIRTABLE_TABLE_ID = tbl...

export default async function handler(req, res) {
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

  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
    res.status(500).json({ error: 'Variables Airtable non configurées côté serveur.' });
    return;
  }

  try {
    const { fields } = req.body || {};

    if (!fields) {
      res.status(400).json({ error: 'Champ requis manquant : fields.' });
      return;
    }

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`;

    const airtableResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    const data = await airtableResponse.json();

    if (!airtableResponse.ok) {
      res.status(airtableResponse.status).json({ error: 'Erreur Airtable', details: data });
      return;
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Erreur interne lors de l\'enregistrement', details: String(err) });
  }
}
