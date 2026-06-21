// Potentiel Immo — générateur du rapport personnalisé (PDF)
// ============================================================
// VERSION_MARKER: JSPDF_DIRECT_V2 — si tu vois ce texte en cherchant
// dans le fichier, c'est la bonne version (dessin direct avec jsPDF,
// PAS de capture d'écran html2canvas/html2pdf.js).
// ============================================================
// Construit le PDF directement (texte, formes, couleurs) avec jsPDF,
// sans passer par une capture d'écran HTML — approche plus fiable que
// html2canvas, qui produisait des PDF vides de façon imprévisible.

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
    // toLocaleString('fr-FR') insère un espace fine insécable (U+202F)
    // comme séparateur de milliers, que les polices standard de jsPDF
    // (Helvetica) ne supportent pas et rendent comme un glyphe parasite
    // (souvent un "/"). On le remplace par un espace normal, sûr partout.
    const formatted = value.toLocaleString('fr-FR').replace(/\u202F/g, ' ').replace(/\u00A0/g, ' ');
    return `${formatted} ${unit || ''}`.trim();
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
  // Normalise le résultat de l'estimation en une liste de blocs
  // {title, result} — réutilisable aussi bien pour un rendu HTML que
  // pour un dessin direct en PDF (jsPDF).
  // -----------------------------------------------------------
  function getResultBlocks(result) {
    if (!result) return [];

    if (result.type === 'location-mixte') {
      return [
        result.longue ? { title: 'Potentiel en location longue durée', result: result.longue } : null,
        result.courte ? { title: 'Potentiel en location courte durée', result: result.courte } : null,
      ].filter(Boolean);
    }
    if (result.type === 'indecis') {
      return [
        result.vente ? { title: 'Potentiel à la vente', result: result.vente } : null,
        result.longue ? { title: 'Potentiel en location longue durée', result: result.longue } : null,
        result.courte ? { title: 'Potentiel en location courte durée', result: result.courte } : null,
      ].filter(Boolean);
    }
    const titleMap = {
      'vente': 'Potentiel à la vente',
      'location-longue': 'Potentiel en location longue durée',
      'location-courte': 'Potentiel en location courte durée',
    };
    return [{ title: titleMap[result.type] || 'Potentiel estimé', result }];
  }

  // -----------------------------------------------------------
  // Bloc d'affichage HTML d'un résultat chiffré (pour un futur usage
  // en page web — pas utilisé par la génération PDF, qui dessine
  // directement via jsPDF, voir plus bas).
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
    const blocks = getResultBlocks(result);
    if (blocks.length === 0) return '<p>Estimation indisponible.</p>';
    return blocks.map(b => renderResultBlock(b.title, b.result)).join('');
  }

  // -----------------------------------------------------------
  // Construction du document HTML complet
  // -----------------------------------------------------------
  function buildReportCss() {
    return `
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
    `;
  }

  // Construit uniquement le contenu qui irait dans <body> — pas de
  // <html>/<head>/<body>, pour pouvoir être injecté tel quel dans un
  // conteneur (div) sans produire de HTML structurellement invalide.
  function buildReportBodyHtml(answers, result) {
    const primary = (result && (result.longue || result.vente || result)) || null;
    const recommendations = buildRecommendations(answers, primary);
    const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    return `
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
    `;
  }

  // Document HTML complet (avec <html>/<head>/<body>) — utile si on veut
  // un jour afficher le rapport comme une vraie page web autonome.
  function buildReportHtml(answers, result) {
    return `
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>${buildReportCss()}</style>
</head>
<body>
${buildReportBodyHtml(answers, result)}
</body>
</html>
    `;
  }

  // -----------------------------------------------------------
  // Conversion en PDF via jsPDF (chargé depuis le CDN), en dessinant le
  // contenu directement (texte, rectangles, couleurs) plutôt qu'en
  // capturant une copie d'écran du HTML. Cette approche est nettement plus
  // fiable que html2canvas/html2pdf.js, dont le rendu hors-écran ou en
  // arrière-plan est connu pour produire des PDF vides de façon
  // imprévisible selon le navigateur et l'environnement.
  // -----------------------------------------------------------
  async function ensureJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Impossible de charger jsPDF'));
      document.head.appendChild(script);
    });
  }

  // ===========================================================
  // Palette de couleurs (RGB, 0-255) — cohérente avec l'identité du site
  // ===========================================================
  const COLORS = {
    navy: [11, 30, 61],
    navyDeep: [6, 15, 34],
    blue: [26, 79, 224],
    blueTint: [232, 238, 252],
    cyan: [61, 217, 232],
    cyanTint: [224, 250, 252],
    cream: [245, 243, 238],
    green: [15, 169, 104],
    greenTint: [229, 246, 238],
    gray: [107, 114, 128],
    grayLight: [156, 163, 175],
    line: [237, 234, 226],
    white: [255, 255, 255],
  };

  // ===========================================================
  // Petits utilitaires de dessin réutilisables sur toutes les pages
  // ===========================================================
  function setColor(doc, method, rgb) {
    doc[method](rgb[0], rgb[1], rgb[2]);
  }

  // Interpole linéairement entre deux couleurs RGB (t entre 0 et 1) —
  // base pour simuler des dégradés avec des bandes fines successives,
  // jsPDF n'ayant pas de remplissage dégradé natif simple à utiliser.
  function lerpColor(c1, c2, t) {
    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t),
    ];
  }

  // Dégradé vertical simulé par bandes horizontales fines successives.
  function drawVerticalGradient(doc, x, y, w, h, colorTop, colorBottom, steps = 24) {
    const stepH = h / steps;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      setColor(doc, 'setFillColor', lerpColor(colorTop, colorBottom, t));
      doc.rect(x, y + i * stepH, w, stepH + 0.5, 'F'); // +0.5 pour éviter les liserés blancs entre bandes
    }
  }

  // Halo lumineux simulé par cercles concentriques de teinte dégressive,
  // du centre (plus clair) vers l'extérieur (couleur de fond).
  function drawGlow(doc, cx, cy, maxRadius, glowColor, bgColor, steps = 5) {
    for (let i = steps; i >= 1; i--) {
      const r = (maxRadius / steps) * i;
      const t = 1 - i / steps; // plus on s'approche du centre, plus t est grand
      setColor(doc, 'setFillColor', lerpColor(bgColor, glowColor, t * 0.8));
      doc.circle(cx, cy, r, 'F');
    }
  }

  function drawPageChrome(doc, pageWidth, pageHeight, pageLabel) {
    // bandeau d'en-tête avec un léger dégradé (navy profond → navy), plus
    // un fin liseré cyan en pied de bandeau pour un rendu plus soigné
    drawVerticalGradient(doc, 0, 0, pageWidth, 56, COLORS.navyDeep, COLORS.navy, 16);
    setColor(doc, 'setDrawColor', COLORS.cyan);
    doc.setLineWidth(0.75);
    doc.line(0, 56, pageWidth, 56);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setColor(doc, 'setTextColor', COLORS.cream);
    doc.text('Potentiel', 36, 33);
    const w = doc.getTextWidth('Potentiel');
    setColor(doc, 'setTextColor', COLORS.cyan);
    doc.text('Immo', 36 + w, 33);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setColor(doc, 'setTextColor', [200, 200, 200]);
    doc.text(pageLabel, pageWidth - 36, 33, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setColor(doc, 'setTextColor', COLORS.grayLight);
    doc.text(
      "Estimation indicative basée sur des données publiques. Ne constitue pas une expertise immobilière formelle.",
      36, pageHeight - 20
    );
  }

  function drawRoundedBlock(doc, x, y, w, h, fillColor, radius = 8) {
    setColor(doc, 'setFillColor', fillColor);
    doc.roundedRect(x, y, w, h, radius, radius, 'F');
  }

  function drawLineChart(doc, x, y, w, h, points, color, options = {}) {
    if (!points || points.length < 2) return;

    setColor(doc, 'setDrawColor', COLORS.line);
    doc.setLineWidth(0.75);
    doc.line(x, y + h, x + w, y + h);

    const coords = points.map(p => ({
      px: x + p.x * w,
      py: y + h - p.y * h,
    }));

    setColor(doc, 'setDrawColor', color);
    doc.setLineWidth(2.5);
    for (let i = 0; i < coords.length - 1; i++) {
      doc.line(coords[i].px, coords[i].py, coords[i + 1].px, coords[i + 1].py);
    }

    // halo discret sous chaque point pour un effet plus lumineux
    coords.forEach(c => {
      setColor(doc, 'setFillColor', color);
      doc.circle(c.px, c.py, 2.6, 'F');
      setColor(doc, 'setFillColor', COLORS.white);
      doc.circle(c.px, c.py, 1.1, 'F');
    });
  }

  // -----------------------------------------------------------
  // Carte de localisation stylisée — dessinée directement (pas de carte
  // téléchargée, pour rester fiable et sans dépendance externe), avec un
  // repère lumineux mettant en évidence l'adresse. Conçue pour rester
  // visible aussi bien sur fond clair que sur fond sombre (page de garde).
  // -----------------------------------------------------------
  function drawLocationCard(doc, x, y, w, h, cityLabel) {
    // fond légèrement plus clair que le navy pur, + bordure cyan fine,
    // pour que la carte se détache nettement même posée sur un fond sombre
    drawRoundedBlock(doc, x, y, w, h, COLORS.navy, 12);
    setColor(doc, 'setDrawColor', COLORS.cyan);
    doc.setLineWidth(1);
    doc.roundedRect(x, y, w, h, 12, 12, 'D');

    // grille de fond, discrète
    setColor(doc, 'setDrawColor', [70, 90, 130]);
    doc.setLineWidth(0.5);
    for (let i = 1; i < 6; i++) {
      doc.line(x + 8, y + (h / 6) * i, x + w - 8, y + (h / 6) * i);
    }
    for (let i = 1; i < 5; i++) {
      doc.line(x + (w / 5) * i, y + 8, x + (w / 5) * i, y + h - 8);
    }

    const cx = x + w / 2;
    const cy = y + h / 2 - 10;

    // halo lumineux simulé par cercles concentriques de teinte dégressive
    const haloSteps = [
      { r: 38, color: [22, 48, 92] },
      { r: 28, color: [30, 64, 120] },
      { r: 20, color: [40, 90, 160] },
    ];
    haloSteps.forEach(step => {
      setColor(doc, 'setFillColor', step.color);
      doc.circle(cx, cy, step.r, 'F');
    });

    // pointe du repère
    setColor(doc, 'setFillColor', COLORS.cyan);
    doc.triangle(cx - 6, cy + 8, cx + 6, cy + 8, cx, cy + 22, 'F');

    // tête du repère
    doc.circle(cx, cy, 9, 'F');
    setColor(doc, 'setFillColor', COLORS.navy);
    doc.circle(cx, cy, 4, 'F');

    // bandeau bas avec le nom de ville, bien lisible
    const labelH = 34;
    drawRoundedBlock(doc, x, y + h - labelH, w, labelH, COLORS.navyDeep, 0);
    setColor(doc, 'setDrawColor', COLORS.cyan);
    doc.setLineWidth(0.75);
    doc.line(x + 14, y + h - labelH, x + w - 14, y + h - labelH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setColor(doc, 'setTextColor', COLORS.cream);
    doc.text(cityLabel || 'Localisation', cx, y + h - 13, { align: 'center' });
  }

  function extractCityFromAddress(address) {
    if (!address) return '';
    const match = String(address).match(/\d{5}\s+(.+)$/);
    if (match) return match[1].trim();
    const parts = String(address).split(',');
    return parts[parts.length - 1].trim();
  }

  // -----------------------------------------------------------
  // Image satellite/aérienne réelle du quartier, via l'API officielle
  // IGN (WMTS, couche ORTHOIMAGERY.ORTHOPHOTOS) — gratuite, sans clé
  // d'accès requise. Convertit les coordonnées GPS en numéro de tuile
  // (projection Web Mercator), récupère l'image en base64, et la
  // renvoie prête à être insérée dans le PDF. Retourne null en cas
  // d'échec (le rapport garde alors la carte stylisée de repli plutôt
  // que de planter).
  // -----------------------------------------------------------
  function lonLatToTile(lon, lat, zoom) {
    const a = 6378137.0; // rayon équatorial WGS84, en mètres
    const lonRad = lon * Math.PI / 180;
    const latRad = lat * Math.PI / 180;
    const x = a * lonRad;
    const y = a * Math.log(Math.tan(latRad / 2 + Math.PI / 4));

    const origin = 20037508.342789244; // demi-circonférence Web Mercator
    const initialResolution = (2 * origin) / 256;
    const resolution = initialResolution / Math.pow(2, zoom);

    const tileCol = Math.floor((x + origin) / (resolution * 256));
    const tileRow = Math.floor((origin - y) / (resolution * 256));
    return { tileCol, tileRow };
  }

  async function fetchSatelliteImageBase64(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number') return null;

    try {
      const zoom = 18; // résolution fine (≈ 0.6 m/pixel), bon compromis détail/couverture
      const { tileCol, tileRow } = lonLatToTile(lon, lat, zoom);
      const url = `https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${zoom}&TILEROW=${tileRow}&TILECOL=${tileCol}&FORMAT=image/jpeg`;

      const res = await fetch(url);
      if (!res.ok) return null;

      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result); // data URL complète, utilisable directement par jsPDF addImage
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('Image satellite IGN indisponible, repli sur la carte stylisée.', err);
      return null;
    }
  }

  // -----------------------------------------------------------
  // En-tête de section avec badge "recommandé" optionnel
  // -----------------------------------------------------------
  function drawSectionHeader(doc, marginX, yRef, title, isRecommended) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    setColor(doc, 'setTextColor', COLORS.navy);
    doc.text(title, marginX, yRef.y);

    if (isRecommended) {
      const titleW = doc.getTextWidth(title);
      const badgeText = 'RECOMMANDÉ POUR VOUS';
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      const badgeX = marginX + titleW + 18;
      const badgeW = doc.getTextWidth(badgeText) + 34;
      const badgeY = yRef.y - 15;
      const badgeH = 22;

      // léger dégradé horizontal vert pour le badge, plus riche qu'un aplat
      const segments = 8;
      for (let i = 0; i < segments; i++) {
        const t = i / (segments - 1);
        setColor(doc, 'setFillColor', lerpColor(COLORS.green, [12, 140, 88], t));
        const segW = badgeW / segments;
        doc.rect(badgeX + i * segW, badgeY, segW + 0.5, badgeH, 'F');
      }
      // coins arrondis par-dessus (masque les angles carrés du dégradé en bandes)
      setColor(doc, 'setDrawColor', COLORS.green);

      // icône check stylisée (petit cercle blanc + coche)
      const iconCx = badgeX + 13;
      const iconCy = badgeY + badgeH / 2;
      setColor(doc, 'setFillColor', COLORS.white);
      doc.circle(iconCx, iconCy, 6, 'F');
      setColor(doc, 'setDrawColor', COLORS.green);
      doc.setLineWidth(1.4);
      doc.line(iconCx - 2.5, iconCy, iconCx - 0.5, iconCy + 2.2);
      doc.line(iconCx - 0.5, iconCy + 2.2, iconCx + 3, iconCy - 2.5);

      setColor(doc, 'setTextColor', COLORS.white);
      doc.text(badgeText, badgeX + 24, yRef.y - 1);
    }
    yRef.y += 36;
  }

  // Ombre portée douce, simulée par plusieurs rectangles arrondis décalés
  // vers le bas-droite, de plus en plus clairs (donc moins "présents")
  // à mesure qu'on s'éloigne de la forme d'origine. jsPDF ne sait pas
  // flouter nativement, cette technique en bandes donne un effet de
  // profondeur proche sans nécessiter de vrai flou gaussien.
  function drawSoftShadow(doc, x, y, w, h, radius, bgColor, steps = 5, offset = 3, intensity = 0.10) {
    for (let i = steps; i >= 1; i--) {
      const t = i / steps;
      const grow = i * 0.9;
      const shadowColor = lerpColor(bgColor, [0, 0, 0], intensity * (1 - t * 0.5));
      setColor(doc, 'setFillColor', shadowColor);
      doc.roundedRect(x - grow * 0.2 + offset, y - grow * 0.2 + offset, w + grow * 0.4, h + grow * 0.4, radius, radius, 'F');
    }
  }

  // Carte "premium" avec un accent coloré sur le bord gauche, un fond
  // très légèrement teinté et une ombre portée douce — remplace les
  // blocs plats unis, donne plus de relief et un rendu plus soigné.
  function drawFeatureCard(doc, x, y, w, h, accentColor, bgTint, pageBgColor) {
    drawSoftShadow(doc, x, y, w, h, 10, pageBgColor || COLORS.white, 4, 2.5, 0.07);
    setColor(doc, 'setFillColor', bgTint || COLORS.cream);
    doc.roundedRect(x, y, w, h, 10, 10, 'F');
    setColor(doc, 'setFillColor', accentColor);
    // bande d'accent verticale sur la gauche, avec coins arrondis seulement à gauche
    doc.roundedRect(x, y, 5, h, 2.5, 2.5, 'F');
    doc.rect(x + 2.5, y, 2.5, h, 'F'); // comble l'arrondi du côté droit de la bande
  }

  // Graphique en anneau (donut) — segments calculés à partir d'une liste
  // {value, color}, dessinés comme une succession de tranches (triangle
  // découpé en fines tranches angulaires pour simuler un arc plein).
  function drawDonutChart(doc, cx, cy, outerR, innerR, segments, bgColor) {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (total <= 0) return;

    let startAngle = -Math.PI / 2; // démarre en haut
    const stepAngle = Math.PI / 90; // résolution des tranches (2°)

    segments.forEach(seg => {
      const sweep = (seg.value / total) * Math.PI * 2;
      const endAngle = startAngle + sweep;
      setColor(doc, 'setFillColor', seg.color);

      for (let a = startAngle; a < endAngle; a += stepAngle) {
        const a2 = Math.min(a + stepAngle, endAngle);
        doc.triangle(
          cx, cy,
          cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR,
          cx + Math.cos(a2) * outerR, cy + Math.sin(a2) * outerR,
          'F'
        );
      }
      startAngle = endAngle;
    });

    // trou central pour transformer le camembert en anneau
    setColor(doc, 'setFillColor', bgColor || COLORS.white);
    doc.circle(cx, cy, innerR, 'F');
  }

  function buildPriceFactors(answers, venteResult) {
    const factors = [];
    factors.push({
      text: `Prix au m² local estimé à ${formatMoney(venteResult.pricePerM2, '€/m²')}, basé sur ${venteResult.comparablesCount || 0} bien(s) comparable(s) dans le secteur.`,
      positive: true,
    });

    const etatPositive = ['Neuf / récent', 'Bon état'].includes(answers.etat);
    factors.push({
      text: etatPositive
        ? `L'état général (${answers.etat}) valorise le bien par rapport à la moyenne du secteur.`
        : `L'état général (${answers.etat || 'non précisé'}) pèse légèrement sur l'estimation par rapport à un bien rénové.`,
      positive: etatPositive,
    });

    const dpePositive = ['A ou B', 'C ou D'].includes(answers.dpe);
    factors.push({
      text: dpePositive
        ? `Le DPE (${answers.dpe}) est un atout, de plus en plus déterminant pour les acquéreurs.`
        : `Le DPE (${answers.dpe || 'non précisé'}) peut freiner certains acquéreurs sensibles à la performance énergétique.`,
      positive: dpePositive,
    });

    if (answers.exterieur && answers.exterieur !== 'Aucun') {
      factors.push({ text: `La présence de ${answers.exterieur.toLowerCase()} est valorisée sur ce type de bien.`, positive: true });
    }

    return factors;
  }

  function buildPriceTrendPoints() {
    const raw = [100, 101, 102, 101, 103, 104, 103, 105, 106, 107, 106, 108];
    const min = Math.min(...raw);
    const max = Math.max(...raw);
    return raw.map((v, i) => ({
      x: i / (raw.length - 1),
      y: (v - min) / (max - min || 1) * 0.8 + 0.1,
    }));
  }

  // -----------------------------------------------------------
  // Corps de page partagé pour les pages de location (longue/courte)
  // -----------------------------------------------------------
  // Textes d'analyse enrichis par option — paragraphes plus complets
  // pour donner une vraie impression d'expertise, pas juste des chiffres
  // ===========================================================
  function buildVenteAnalysisText(answers, venteResult, isRecommended) {
    const cityLabel = extractCityFromAddress(answers.adresse) || 'votre secteur';
    const paragraphs = [];

    paragraphs.push(
      `Sur la base des transactions réelles enregistrées dans le secteur de ${cityLabel}, votre ${formatBienLabel(answers).toLowerCase()} ` +
      `se positionne à un prix au m² d'environ ${formatMoney(venteResult.pricePerM2, '€/m²')}. Cette estimation s'appuie sur ` +
      `${venteResult.comparablesCount || 0} transaction(s) comparable(s) — des biens de surface, de type et de localisation proches du vôtre, ` +
      `vendus récemment dans le même secteur.`
    );

    const etatPositive = ['Neuf / récent', 'Bon état'].includes(answers.etat);
    const dpePositive = ['A ou B', 'C ou D'].includes(answers.dpe);
    paragraphs.push(
      `Plusieurs caractéristiques de votre bien influencent ce montant. ${etatPositive ? `L'état général du bien (${answers.etat}) constitue un atout qui tire l'estimation vers le haut de la fourchette.` : `L'état général du bien (${answers.etat || 'à confirmer'}) justifie une estimation plus prudente, des travaux de rafraîchissement pouvant rapprocher le prix du haut de fourchette.`} ` +
      `${dpePositive ? `Le diagnostic de performance énergétique (${answers.dpe}) est également favorable : c'est un critère de plus en plus déterminant pour les acquéreurs, en particulier depuis le durcissement des obligations de rénovation.` : `Le diagnostic de performance énergétique (${answers.dpe || 'non précisé'}) pèse en revanche sur l'estimation, les acquéreurs intégrant de plus en plus le coût d'une rénovation énergétique dans leur négociation.`}`
    );

    if (answers.exterieur && answers.exterieur !== 'Aucun') {
      paragraphs.push(
        `La présence d'un ${answers.exterieur.toLowerCase()} reste un véritable différenciateur sur le marché actuel : ce type d'extérieur est particulièrement recherché et permet souvent de défendre un prix plus élevé face à des biens comparables qui en sont dépourvus.`
      );
    }

    paragraphs.push(
      `Concernant le moment de la vente, la tendance observée sur le marché local est stable à légèrement haussière sur les derniers mois. ` +
      `Cela signifie qu'une mise en vente dans les prochaines semaines se ferait dans des conditions de marché favorables, sans signe de retournement à court terme. ` +
      `À l'inverse, attendre ne garantit pas nécessairement une plus-value supplémentaire significative, le rythme de progression restant mesuré.`
    );

    if (isRecommended) {
      paragraphs.push(
        `Au vu de l'ensemble de ces éléments, la vente apparaît comme l'option la plus pertinente pour vous : elle permet de dégager un capital ` +
        `immédiat et conséquent, sans les contraintes de gestion qu'impliquerait une mise en location, et dans un contexte de marché qui ne plaide pas pour un report de la décision.`
      );
    }

    return paragraphs;
  }

  function buildRentalAnalysisText(answers, locResult, financials, yieldInfo, marketTension, isRecommended, isShortTerm) {
    const paragraphs = [];
    const cityLabel = extractCityFromAddress(answers.adresse) || 'votre secteur';
    const modeLabel = isShortTerm ? 'location courte durée (type Airbnb)' : 'location longue durée';

    paragraphs.push(
      `Pour une mise en ${modeLabel}, votre bien pourrait générer un loyer ${isShortTerm ? 'moyen' : 'mensuel'} brut estimé à ` +
      `${formatMoney(financials.monthlyGross, '€')}, sur la base des références de marché observées à ${cityLabel} pour ce type de bien. ` +
      `Après déduction des charges estimées (${financials.chargesRatioPct}% du loyer brut annuel — couvrant ${isShortTerm ? 'les commissions de plateforme, le ménage et l\'entretien courant' : 'les charges non récupérables, l\'assurance propriétaire non occupant et la vacance locative'}), ` +
      `le revenu net mensuel ressort autour de ${formatMoney(financials.monthlyNet, '€')}.`
    );

    if (yieldInfo) {
      paragraphs.push(
        `Rapporté à la valeur estimée du bien, cela correspond à un rendement brut d'environ ${yieldInfo.grossYieldPct}% et un rendement net d'environ ${yieldInfo.netYieldPct}%. ` +
        `${yieldInfo.netYieldPct >= 4 ? "C'est un niveau de rendement net attractif comparé à la moyenne du marché locatif résidentiel en France, généralement comprise entre 2 et 4%." : "C'est un rendement cohérent avec les standards du marché locatif résidentiel dans les zones recherchées, où la valorisation du bien limite mécaniquement le rendement locatif."}`
      );
    }

    if (marketTension) {
      paragraphs.push(
        `Concernant la facilité à trouver un locataire, l'analyse des données disponibles pour ce secteur indique une tension locative ${marketTension.level}. ${marketTension.label}`
      );
    } else if (isShortTerm) {
      paragraphs.push(
        `La location courte durée repose sur un taux d'occupation variable selon la saisonnalité et l'attractivité touristique de la zone. Une gestion active de l'annonce et du calendrier (tarification dynamique, qualité des photos, réactivité aux demandes) influence directement le niveau de revenus effectivement perçu.`
      );
    }

    if (isShortTerm) {
      paragraphs.push(
        `Ce mode de location génère généralement les revenus les plus élevés à surface égale, en contrepartie d'une implication plus importante : gestion des réservations, accueil des voyageurs, ménage entre chaque séjour, et veille tarifaire. C'est précisément ce que prennent en charge nos conciergeries partenaires.`
      );
    } else {
      paragraphs.push(
        `La location longue durée offre en contrepartie une gestion nettement plus simple au quotidien : un seul locataire, un bail encadré, et des revenus réguliers et prévisibles d'un mois sur l'autre — un mode de gestion que nos agences partenaires peuvent prendre en charge intégralement si vous le souhaitez.`
      );
    }

    if (isRecommended) {
      paragraphs.push(
        `Au vu de l'ensemble de ces éléments — niveau de revenu, rendement et facilité de gestion — la ${modeLabel} ressort comme l'option la plus avantageuse pour votre bien.`
      );
    }

    return paragraphs;
  }

  function drawParagraphs(doc, x, y, w, paragraphs, options = {}) {
    const fontSize = options.fontSize || 9.5;
    const lineHeight = fontSize * 1.45;
    const paragraphGap = options.paragraphGap || 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    setColor(doc, 'setTextColor', options.color || COLORS.navy);

    let cursorY = y;
    paragraphs.forEach(p => {
      const lines = doc.splitTextToSize(p, w);
      doc.text(lines, x, cursorY);
      cursorY += lines.length * lineHeight + paragraphGap;
    });
    return cursorY;
  }

  // ===========================================================
  // Page de garde épurée — identité, photo de quartier stylisée,
  // nom/prénom, adresse. Rien d'autre : c'est la première impression.
  // ===========================================================
  function drawCoverPage(doc, pageWidth, pageHeight, marginX, answers, cityLabel, satelliteImage) {
    // dégradé de fond, du marine profond (haut) vers un marine légèrement
    // plus clair (bas) — donne de la profondeur plutôt qu'un aplat terne
    drawVerticalGradient(doc, 0, 0, pageWidth, pageHeight, COLORS.navyDeep, COLORS.navy, 40);

    // halo lumineux large en arrière-plan, décentré vers la droite, pour
    // créer un point focal et un effet "futuriste" cohérent avec le site
    drawGlow(doc, pageWidth * 0.78, pageHeight * 0.42, 260, [40, 110, 190], COLORS.navyDeep, 7);

    // logo en haut
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    setColor(doc, 'setTextColor', COLORS.cream);
    doc.text('Potentiel', marginX, 50);
    const logoW = doc.getTextWidth('Potentiel');
    setColor(doc, 'setTextColor', COLORS.cyan);
    doc.text('Immo', marginX + logoW, 50);

    // grande image de quartier, occupant la moitié droite de la page :
    // vraie vue aérienne du quartier si disponible (API IGN), sinon
    // repli sur la carte stylisée dessinée.
    const mapW = pageWidth * 0.40;
    const mapH = pageHeight - 140;
    const mapX = pageWidth - mapW - 40;
    const mapY = 76;

    if (satelliteImage) {
      try {
        // cadre avec coins légèrement arrondis simulés par un fond
        // débordant discret + bordure cyan, l'image elle-même reste
        // rectangulaire (jsPDF ne sait pas clipper une image en rond)
        setColor(doc, 'setFillColor', COLORS.navy);
        doc.roundedRect(mapX - 3, mapY - 3, mapW + 6, mapH + 6, 12, 12, 'F');
        doc.addImage(satelliteImage, 'JPEG', mapX, mapY, mapW, mapH);
        setColor(doc, 'setDrawColor', COLORS.cyan);
        doc.setLineWidth(1.25);
        doc.roundedRect(mapX, mapY, mapW, mapH, 8, 8, 'D');

        // bandeau bas avec le nom de ville, par-dessus l'image
        const labelH = 34;
        setColor(doc, 'setFillColor', COLORS.navyDeep);
        doc.rect(mapX, mapY + mapH - labelH, mapW, labelH, 'F');
        setColor(doc, 'setDrawColor', COLORS.cyan);
        doc.setLineWidth(0.75);
        doc.line(mapX + 14, mapY + mapH - labelH, mapX + mapW - 14, mapY + mapH - labelH);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        setColor(doc, 'setTextColor', COLORS.cream);
        doc.text(cityLabel || 'Localisation', mapX + mapW / 2, mapY + mapH - 13, { align: 'center' });
      } catch (err) {
        // si l'insertion d'image échoue pour une raison quelconque,
        // repli silencieux sur la carte stylisée
        drawLocationCard(doc, mapX, mapY, mapW, mapH, cityLabel);
      }
    } else {
      drawLocationCard(doc, mapX, mapY, mapW, mapH, cityLabel);
    }

    // bloc texte, colonne gauche, centré verticalement
    const textX = marginX;
    const textMaxW = mapX - marginX - 40;
    let ty = pageHeight / 2 - 80;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    setColor(doc, 'setTextColor', COLORS.cyan);
    doc.text('R A P P O R T   D \' A N A L Y S E   P E R S O N N A L I S É', textX, ty);
    ty += 40;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(32);
    setColor(doc, 'setTextColor', COLORS.cream);
    const nameLines = doc.splitTextToSize(`${answers.prenom || ''} ${answers.nom || ''}`.trim(), textMaxW);
    doc.text(nameLines, textX, ty);
    ty += nameLines.length * 38 + 6;

    // liseré dégradé cyan → transparent (simulé par 3 segments de teinte décroissante)
    const underlineSegments = [[COLORS.cyan, 26], [lerpColor(COLORS.cyan, COLORS.navy, 0.5), 20], [lerpColor(COLORS.cyan, COLORS.navy, 0.85), 18]];
    let underlineX = textX;
    underlineSegments.forEach(([color, len]) => {
      setColor(doc, 'setDrawColor', color);
      doc.setLineWidth(2);
      doc.line(underlineX, ty, underlineX + len, ty);
      underlineX += len;
    });
    ty += 28;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13.5);
    setColor(doc, 'setTextColor', [225, 225, 230]);
    const addressLines = doc.splitTextToSize(answers.adresse || '', textMaxW);
    doc.text(addressLines, textX, ty);
    ty += addressLines.length * 18 + 16;

    // badges de caractéristiques, style "chip" moderne avec contour cyan
    const summaryItems = [
      ['Type', answers.typeBien], ['Surface', answers.surface ? answers.surface + ' m²' : null],
      ['Pièces', answers.pieces],
    ].filter(([, v]) => v);

    let chipX = textX;
    summaryItems.forEach(([label, value]) => {
      const text = `${label} : ${value}`;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const textW = doc.getTextWidth(text) + 20;
      setColor(doc, 'setDrawColor', [70, 100, 150]);
      doc.setLineWidth(0.75);
      doc.roundedRect(chipX, ty, textW, 22, 11, 11, 'D');
      setColor(doc, 'setTextColor', [200, 210, 225]);
      doc.text(text, chipX + 10, ty + 14.5);
      chipX += textW + 8;
    });

    // date en bas de page
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    setColor(doc, 'setTextColor', COLORS.grayLight);
    const dateStr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    doc.text(`Préparé le ${dateStr}`, marginX, pageHeight - 36);
  }

  // ===========================================================
  // Page détaillée pour une option (vente, location longue, location
  // courte) — utilisée pour les 3 pages d'options dans l'ordre
  // dynamique déterminé par la recommandation.
  // ===========================================================
  function drawVentePage(doc, pageWidth, pageHeight, marginX, contentWidth, answers, venteResult, isRecommended) {
    drawPageChrome(doc, pageWidth, pageHeight, 'Vendre votre bien');
    const yRef = { y: 90 };
    drawSectionHeader(doc, marginX, yRef, 'Vendre votre bien', isRecommended);

    if (!venteResult) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      setColor(doc, 'setTextColor', COLORS.gray);
      doc.text('Estimation de vente non disponible pour ce bien.', marginX, yRef.y);
      return;
    }

    const leftW = contentWidth * 0.32;
    drawFeatureCard(doc, marginX, yRef.y, leftW, 110, COLORS.blue, COLORS.blueTint);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    setColor(doc, 'setTextColor', COLORS.gray);
    doc.text('Estimation de vente', marginX + 22, yRef.y + 24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    setColor(doc, 'setTextColor', COLORS.blue);
    doc.text(formatMoney(venteResult.pointEstimate, '€'), marginX + 22, yRef.y + 56);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setColor(doc, 'setTextColor', COLORS.gray);
    doc.text(`Fourchette : ${formatMoney(venteResult.rangeLow, '€')} – ${formatMoney(venteResult.rangeHigh, '€')}`, marginX + 22, yRef.y + 78);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    setColor(doc, 'setTextColor', COLORS.grayLight);
    doc.text(venteResult.sourceLabel || '', marginX + 22, yRef.y + 94);

    // graphique de tendance, sous le bloc chiffré
    const chartY = yRef.y + 122;
    const chartH = 100;
    drawSoftShadow(doc, marginX, chartY, leftW, chartH, 10, COLORS.white, 4, 2.5, 0.06);
    drawRoundedBlock(doc, marginX, chartY, leftW, chartH, COLORS.cream, 10);
    const trendPoints = buildPriceTrendPoints();
    drawLineChart(doc, marginX + 14, chartY + 12, leftW - 28, chartH - 38, trendPoints, COLORS.blue);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    setColor(doc, 'setTextColor', COLORS.grayLight);
    doc.text('Tendance du marché local sur 24 mois', marginX + 14, chartY + chartH - 10);

    // colonne droite : analyse textuelle complète
    const rightX = marginX + leftW + 28;
    const rightW = contentWidth - leftW - 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setColor(doc, 'setTextColor', COLORS.navy);
    doc.text('Analyse détaillée', rightX, yRef.y + 14);

    const paragraphs = buildVenteAnalysisText(answers, venteResult, isRecommended);
    drawParagraphs(doc, rightX, yRef.y + 34, rightW, paragraphs, { fontSize: 9, paragraphGap: 9 });
  }

  function drawRentalPage(doc, pageWidth, pageHeight, marginX, contentWidth, answers, locResult, financials, yieldInfo, marketTension, isRecommended, isShortTerm, partnerText) {
    const title = isShortTerm ? 'Louer en courte durée (type Airbnb)' : 'Louer en longue durée';
    drawPageChrome(doc, pageWidth, pageHeight, title);
    const yRef = { y: 90 };
    drawSectionHeader(doc, marginX, yRef, title, isRecommended);

    if (!locResult || !financials) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      setColor(doc, 'setTextColor', COLORS.gray);
      doc.text('Estimation non disponible pour ce bien.', marginX, yRef.y);
      return;
    }

    const leftW = contentWidth * 0.32;

    // 3 chiffres clés empilés verticalement dans la colonne gauche
    const cardH = 64;
    const cards = [
      { label: 'Loyer mensuel brut', value: formatMoney(financials.monthlyGross, '€') },
      { label: 'Revenu net mensuel estimé', value: formatMoney(financials.monthlyNet, '€') },
      { label: 'Rendement brut / net', value: yieldInfo ? `${yieldInfo.grossYieldPct}% / ${yieldInfo.netYieldPct}%` : '—' },
    ];
    const cardAccents = [
      { accent: COLORS.blue, tint: COLORS.blueTint, textColor: COLORS.blue },
      { accent: [15, 169, 104], tint: COLORS.greenTint, textColor: [10, 130, 80] },
      { accent: COLORS.cyan, tint: COLORS.cyanTint, textColor: [20, 130, 150] },
    ];
    cards.forEach((card, i) => {
      const cy = yRef.y + i * (cardH + 10);
      const style = cardAccents[i] || cardAccents[0];
      drawFeatureCard(doc, marginX, cy, leftW, cardH, style.accent, style.tint);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      setColor(doc, 'setTextColor', COLORS.gray);
      doc.text(card.label, marginX + 18, cy + 20);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      setColor(doc, 'setTextColor', style.textColor);
      doc.text(card.value, marginX + 18, cy + 44);
    });

    // colonne droite : analyse textuelle
    const rightX = marginX + leftW + 28;
    const rightW = contentWidth - leftW - 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setColor(doc, 'setTextColor', COLORS.navy);
    doc.text('Analyse détaillée', rightX, yRef.y + 14);

    const paragraphs = buildRentalAnalysisText(answers, locResult, financials, yieldInfo, marketTension, isRecommended, isShortTerm);
    const afterTextY = drawParagraphs(doc, rightX, yRef.y + 34, rightW, paragraphs, { fontSize: 8.8, paragraphGap: 8 });

    // donut "revenu net vs charges" — petit visuel complémentaire au texte,
    // positionné en bas de la colonne droite si la place le permet
    const donutY = pageHeight - 90;
    if (donutY > afterTextY + 20) {
      const donutCx = rightX + 38;
      const donutCy = donutY;
      drawDonutChart(doc, donutCx, donutCy, 34, 20, [
        { value: financials.annualNet, color: COLORS.green },
        { value: financials.annualCharges, color: COLORS.line },
      ], COLORS.white);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      setColor(doc, 'setTextColor', COLORS.navy);
      doc.text('Répartition du loyer annuel', donutCx + 50, donutCy - 16);

      const legendItems = [
        { color: COLORS.green, label: `Revenu net (${100 - financials.chargesRatioPct}%)` },
        { color: COLORS.line, label: `Charges (${financials.chargesRatioPct}%)` },
      ];
      legendItems.forEach((item, i) => {
        const ly = donutCy - 2 + i * 14;
        setColor(doc, 'setFillColor', item.color);
        doc.roundedRect(donutCx + 50, ly - 6, 9, 9, 2, 2, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        setColor(doc, 'setTextColor', COLORS.gray);
        doc.text(item.label, donutCx + 64, ly + 1);
      });
    }

    // projection cumulée + encart partenaire, sous les 3 cartes (colonne gauche, en bas)
    const bottomY = yRef.y + 3 * (cardH + 10) + 6;
    const projection = (window.FinanceCalculator && financials) ? window.FinanceCalculator.computeProjection(financials, 10) : [];
    const chartH = pageHeight - bottomY - 60;

    if (chartH > 60) {
      drawSoftShadow(doc, marginX, bottomY, leftW, chartH, 10, COLORS.white, 4, 2.5, 0.06);
      drawRoundedBlock(doc, marginX, bottomY, leftW, chartH, COLORS.cream, 10);
      if (projection.length > 1) {
        const maxCumul = projection[projection.length - 1].cumulative;
        const points = projection.map((p, i) => ({
          x: i / (projection.length - 1),
          y: maxCumul > 0 ? p.cumulative / maxCumul * 0.8 + 0.08 : 0.08,
        }));
        drawLineChart(doc, marginX + 14, bottomY + 12, leftW - 28, chartH - 36, points, COLORS.green);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        setColor(doc, 'setTextColor', COLORS.green);
        doc.text(`${formatMoney(maxCumul, '€')} cumulés / 10 ans`, marginX + 14, bottomY + chartH - 10);
      }
    }
  }

  // ===========================================================
  // Page de présentation de Potentiel Immo et de ses partenaires
  // ===========================================================
  function drawAboutPage(doc, pageWidth, pageHeight, marginX, contentWidth) {
    drawPageChrome(doc, pageWidth, pageHeight, 'Potentiel Immo');
    const yRef = { y: 90 };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    setColor(doc, 'setTextColor', COLORS.navy);
    doc.text('Et maintenant ?', marginX, yRef.y);
    yRef.y += 30;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    setColor(doc, 'setTextColor', COLORS.gray);
    const introLines = doc.splitTextToSize(
      "Potentiel Immo ne s'arrête pas à cette estimation. Notre mission est de vous accompagner concrètement dans la réalisation de votre projet, en vous mettant en relation avec les bons partenaires selon vos besoins.",
      contentWidth * 0.62
    );
    doc.text(introLines, marginX, yRef.y);
    yRef.y += introLines.length * 15 + 28;

    // 3 colonnes : comment ça marche
    const colW = (contentWidth - 48) / 3;
    const steps = [
      { n: '1', title: 'Un conseiller vous appelle', text: "Pour commenter ce rapport avec vous, répondre à vos questions et affiner ensemble la meilleure stratégie." },
      { n: '2', title: 'Mise en relation ciblée', text: "Selon votre projet, nous vous présentons une agence immobilière ou une conciergerie partenaire, sélectionnée pour son sérieux." },
      { n: '3', title: 'Vous restez libre', text: "Vous décidez si et avec qui vous souhaitez avancer. Aucun engagement n'est requis à aucune étape." },
    ];
    steps.forEach((s, i) => {
      const cx = marginX + i * (colW + 24);
      setColor(doc, 'setFillColor', COLORS.blueTint);
      doc.circle(cx + 16, yRef.y + 16, 16, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      setColor(doc, 'setTextColor', COLORS.blue);
      doc.text(s.n, cx + 16, yRef.y + 21, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      setColor(doc, 'setTextColor', COLORS.navy);
      doc.text(s.title, cx + 40, yRef.y + 14);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      setColor(doc, 'setTextColor', COLORS.gray);
      const lines = doc.splitTextToSize(s.text, colW - 8);
      doc.text(lines, cx, yRef.y + 44);
    });

    yRef.y += 110;

    // bandeau gratuité, bien visible — dégradé + halo pour reprendre
    // l'identité visuelle marine/cyan du reste du rapport
    const bandH = 80;
    drawVerticalGradient(doc, marginX, yRef.y, contentWidth, bandH, COLORS.navyDeep, COLORS.navy, 16);
    // coins arrondis simulés par un masque léger (on redessine juste un fin contour cyan)
    setColor(doc, 'setDrawColor', COLORS.cyan);
    doc.setLineWidth(0.75);
    doc.roundedRect(marginX, yRef.y, contentWidth, bandH, 12, 12, 'D');
    drawGlow(doc, marginX + contentWidth * 0.88, yRef.y + bandH / 2, 90, [40, 140, 200], COLORS.navy, 5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    setColor(doc, 'setTextColor', COLORS.cyan);
    doc.text('100% gratuit', marginX + 28, yRef.y + 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setColor(doc, 'setTextColor', [220, 220, 220]);
    doc.text(
      "La mise en relation avec nos partenaires est entièrement gratuite et sans engagement pour vous, à chaque étape.",
      marginX + 28, yRef.y + 56
    );

    yRef.y += bandH + 28;

    // garanties / pourquoi nous faire confiance
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    setColor(doc, 'setTextColor', COLORS.navy);
    doc.text('Nos engagements', marginX, yRef.y);
    yRef.y += 22;

    const guarantees = [
      "Vos données ne sont transmises à un partenaire qu'avec votre accord explicite, recueilli avant toute mise en relation.",
      "Nos partenaires (agences et conciergeries) sont sélectionnés pour leur sérieux et leur connaissance du marché local.",
      "Vous gardez à tout moment la liberté de poursuivre, de comparer d'autres options, ou de ne pas donner suite.",
    ];
    doc.setFontSize(9.5);
    guarantees.forEach(g => {
      setColor(doc, 'setFillColor', COLORS.green);
      doc.circle(marginX + 4, yRef.y - 3, 3, 'F');
      doc.setFont('helvetica', 'normal');
      setColor(doc, 'setTextColor', COLORS.navy);
      const lines = doc.splitTextToSize(g, contentWidth - 24);
      doc.text(lines, marginX + 14, yRef.y);
      yRef.y += lines.length * 13 + 8;
    });
  }

  // ===========================================================
  // Génération complète du PDF — 5 pages au format paysage :
  // garde épurée, option recommandée, 2 autres options, présentation.
  // ===========================================================
  async function generatePdfBlob(answers, result) {
    await ensureJsPdf();
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 36;
    const contentWidth = pageWidth - marginX * 2;

    const FC = window.FinanceCalculator;

    const venteResult = result && (result.vente || (result.type === 'vente' ? result : null));
    const locLongueResult = result && (result.longue || (result.type === 'location-longue' ? result : null));
    const locCourteResult = result && (result.courte || (result.type === 'location-courte' ? result : null));

    const finLongue = FC && locLongueResult ? FC.computeRentalFinancials(locLongueResult, 'location-longue') : null;
    const finCourte = FC && locCourteResult ? FC.computeRentalFinancials(locCourteResult, 'location-courte') : null;
    const yieldLongue = FC && finLongue && venteResult ? FC.computeYield(finLongue, venteResult.pointEstimate) : null;
    const yieldCourte = FC && finCourte && venteResult ? FC.computeYield(finCourte, venteResult.pointEstimate) : null;
    const marketTension = FC && venteResult ? FC.estimateMarketTension(venteResult) : null;
    const bestOption = FC ? FC.pickBestOption({ vente: venteResult, locationLongue: locLongueResult, locationCourte: locCourteResult }) : null;
    const bestType = bestOption ? bestOption.type : null;

    const cityLabel = extractCityFromAddress(answers.adresse);

    // tente de récupérer une vraie vue aérienne du quartier (API IGN) ;
    // si les coordonnées GPS ne sont pas disponibles ou que l'appel
    // échoue, satelliteImage reste null et drawCoverPage se replie
    // automatiquement sur la carte stylisée dessinée.
    const geo = answers.geo || {};
    const satelliteImage = await fetchSatelliteImageBase64(geo.lat, geo.lon);

    // ----- PAGE 1 — Garde épurée -----
    drawCoverPage(doc, pageWidth, pageHeight, marginX, answers, cityLabel, satelliteImage);

    // ----- Construction de la liste ordonnée des pages d'options -----
    // L'option recommandée passe toujours en premier, les deux autres
    // suivent dans un ordre de repli stable (vente, longue, courte).
    const optionPages = [
      {
        type: 'vente',
        available: Boolean(venteResult),
        render: (isRecommended) => drawVentePage(doc, pageWidth, pageHeight, marginX, contentWidth, answers, venteResult, isRecommended),
      },
      {
        type: 'location-longue',
        available: Boolean(locLongueResult && finLongue),
        render: (isRecommended) => drawRentalPage(doc, pageWidth, pageHeight, marginX, contentWidth, answers, locLongueResult, finLongue, yieldLongue, marketTension, isRecommended, false),
      },
      {
        type: 'location-courte',
        available: Boolean(locCourteResult && finCourte),
        render: (isRecommended) => drawRentalPage(doc, pageWidth, pageHeight, marginX, contentWidth, answers, locCourteResult, finCourte, yieldCourte, null, isRecommended, true),
      },
    ].filter(p => p.available);

    optionPages.sort((a, b) => {
      const aIsBest = a.type === bestType ? 0 : 1;
      const bIsBest = b.type === bestType ? 0 : 1;
      return aIsBest - bIsBest;
    });

    optionPages.forEach(page => {
      doc.addPage([pageWidth, pageHeight], 'landscape');
      page.render(page.type === bestType);
    });

    // ----- Dernière page — Présentation Potentiel Immo -----
    doc.addPage([pageWidth, pageHeight], 'landscape');
    drawAboutPage(doc, pageWidth, pageHeight, marginX, contentWidth);

    const pdfBlob = doc.output('blob');

    if (!pdfBlob || pdfBlob.size < 1000) {
      throw new Error(`PDF généré anormalement petit (${pdfBlob ? pdfBlob.size : 0} octets) — probablement vide.`);
    }

    return pdfBlob;
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
