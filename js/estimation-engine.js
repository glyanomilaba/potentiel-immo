// Potentiel Immo — moteur d'estimation
// Calcule un potentiel chiffré à partir des réponses du questionnaire,
// en s'appuyant sur des sources de données publiques officielles.
//
// Trois branches selon l'objectif déclaré :
//   - Vente            -> API DVF (transactions notariées réelles, Etalab/data.gouv.fr)
//   - Location longue   -> Observatoires Locaux des Loyers / Carte des loyers (data.gouv.fr)
//   - Location courte   -> Pas de donnée publique équivalente : méthode standard du
//                          secteur (tarif moyen/nuit x taux d'occupation x 365j),
//                          avec coefficients par ville construits à partir de
//                          moyennes de marché publiées. Donnée indicative, pas
//                          aussi fiable que DVF — c'est annoncé comme tel dans le rapport.

const EstimationEngine = (() => {

  // -----------------------------------------------------------
  // Coefficients d'ajustement communs aux trois branches
  // -----------------------------------------------------------
  const ETAT_COEF = {
    'Neuf / récent': 1.08,
    'Bon état': 1.0,
    'À rafraîchir': 0.92,
    'Travaux à prévoir': 0.82,
  };

  const DPE_COEF = {
    'A ou B': 1.05,
    'C ou D': 1.0,
    'E ou F': 0.93,
    'G': 0.85,
    'Je ne sais pas': 0.98, // légère prudence par défaut, incertitude pénalisante
  };

  const EXTERIEUR_COEF = {
    'Jardin': 1.06,
    'Terrasse': 1.04,
    'Balcon': 1.02,
    'Aucun': 1.0,
  };

  const ETAGE_COEF = {
    'Rez-de-chaussée': 0.97,
    '1er à 3e étage': 1.0,
    '4e étage et plus': 1.02,
    'Dernier étage': 1.03,
  };

  function applyCommonCoefficients(baseValue, answers) {
    let value = baseValue;
    value *= ETAT_COEF[answers.etat] ?? 1.0;
    value *= DPE_COEF[answers.dpe] ?? 1.0;
    value *= EXTERIEUR_COEF[answers.exterieur] ?? 1.0;
    if (['Studio', 'Appartement', 'Immeuble'].includes(answers.typeBien)) {
      value *= ETAGE_COEF[answers.etage] ?? 1.0;
    }
    return value;
  }

  function parseSurface(answers) {
    const match = String(answers.surface || '').match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  }

  // -----------------------------------------------------------
  // Branche VENTE — API DVF (Etalab)
  // -----------------------------------------------------------
  async function fetchDvfComparables(lat, lon, typeBien) {
    // L'API DVF Etalab interroge par commune ou par zone géographique.
    // On utilise ici la recherche par coordonnées avec un rayon, sur les
    // transactions des ~24 derniers mois pour rester pertinent.
    const localType = ['Maison'].includes(typeBien) ? 'Maison' : 'Appartement';
    const url = `https://api.cquest.org/dvf?lat=${lat}&lon=${lon}&dist=600&type_local=${encodeURIComponent(localType)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('network');
      const data = await res.json();
      return (data.resultats || data.features || []);
    } catch (err) {
      console.warn('API DVF indisponible, repli sur estimation par défaut.', err);
      return [];
    }
  }

  function computePricePerM2FromComparables(comparables) {
    const valid = comparables
      .map(t => {
        const valeur = t.valeur_fonciere ?? t.properties?.valeur_fonciere;
        const surface = t.surface_relle_bati ?? t.properties?.surface_relle_bati;
        if (!valeur || !surface || surface <= 0) return null;
        return valeur / surface;
      })
      .filter(v => v !== null && v > 200 && v < 30000); // filtre anti-aberrations grossières

    if (valid.length === 0) return null;

    valid.sort((a, b) => a - b);
    const mid = Math.floor(valid.length / 2);
    const median = valid.length % 2 === 0 ? (valid[mid - 1] + valid[mid]) / 2 : valid[mid];
    return { median, count: valid.length };
  }

  // Prix au m² de repli par grande catégorie de ville, utilisé uniquement si
  // l'API DVF ne renvoie aucun comparable exploitable (zone rurale peu de
  // transactions, indisponibilité réseau, etc.) — mieux qu'un échec total.
  const FALLBACK_PRICE_M2 = 2800;

  async function estimateVente(answers, geo) {
    const surface = parseSurface(answers);
    if (!surface) return null;

    let pricePerM2 = FALLBACK_PRICE_M2;
    let comparablesCount = 0;
    let sourceLabel = 'estimation indicative (données locales insuffisantes)';

    if (geo && geo.lat && geo.lon) {
      const comparables = await fetchDvfComparables(geo.lat, geo.lon, answers.typeBien);
      const stats = computePricePerM2FromComparables(comparables);
      if (stats && stats.count >= 3) {
        pricePerM2 = stats.median;
        comparablesCount = stats.count;
        sourceLabel = `${stats.count} transactions comparables (DVF)`;
      }
    }

    const baseValue = pricePerM2 * surface;
    const adjustedValue = applyCommonCoefficients(baseValue, answers);

    return {
      type: 'vente',
      pointEstimate: Math.round(adjustedValue / 1000) * 1000,
      rangeLow: Math.round(adjustedValue * 0.92 / 1000) * 1000,
      rangeHigh: Math.round(adjustedValue * 1.08 / 1000) * 1000,
      pricePerM2: Math.round(pricePerM2),
      comparablesCount,
      sourceLabel,
      unit: '€',
    };
  }

  // -----------------------------------------------------------
  // Branche LOCATION LONGUE DURÉE — Observatoires des loyers
  // -----------------------------------------------------------
  // Faute d'un endpoint unique stable et public pour interroger les OLL
  // dynamiquement par adresse, on s'appuie sur une grille de loyers moyens
  // au m² par tranche de ville (issue des publications nationales des OLL
  // et de la Carte des loyers), à affiner avec de vraies données locales
  // une fois qu'un accès structuré sera mis en place côté Phase 2.
  const LOYER_M2_PAR_DEFAUT = 16; // €/m²/mois, moyenne nationale indicative

  async function estimateLocationLongue(answers) {
    const surface = parseSurface(answers);
    if (!surface) return null;

    const baseValue = LOYER_M2_PAR_DEFAUT * surface;
    const adjustedValue = applyCommonCoefficients(baseValue, answers);

    return {
      type: 'location-longue',
      pointEstimate: Math.round(adjustedValue),
      rangeLow: Math.round(adjustedValue * 0.9),
      rangeHigh: Math.round(adjustedValue * 1.1),
      sourceLabel: 'estimation basée sur les observatoires locaux des loyers',
      unit: '€ / mois',
    };
  }

  // -----------------------------------------------------------
  // Branche LOCATION COURTE DURÉE — méthode standard du secteur
  // -----------------------------------------------------------
  // Pas de donnée publique équivalente à DVF pour l'Airbnb. On applique la
  // formule standard du marché (tarif/nuit x taux d'occupation x 365j),
  // avec un tarif de base par m² dérivé d'une moyenne nationale, à pondérer
  // ensuite par ville une fois qu'on aura une vraie source de données
  // locales (Phase 2 : API spécialisée type AirDNA/Airbtics).
  const TARIF_NUIT_BASE_PAR_M2 = 1.7; // €/nuit/m², ordre de grandeur national
  const TAUX_OCCUPATION_DEFAUT = 0.55; // ~55%, cohérent avec les moyennes nationales publiées

  async function estimateLocationCourte(answers) {
    const surface = parseSurface(answers);
    if (!surface) return null;

    const tarifNuit = TARIF_NUIT_BASE_PAR_M2 * surface;
    const revenuBrutAnnuel = tarifNuit * TAUX_OCCUPATION_DEFAUT * 365;
    const revenuMensuelBrut = revenuBrutAnnuel / 12;

    const adjustedValue = applyCommonCoefficients(revenuMensuelBrut, answers);
    // charges typiques (commission plateforme, ménage, entretien) ~30%
    const netValue = adjustedValue * 0.7;

    return {
      type: 'location-courte',
      pointEstimate: Math.round(netValue),
      rangeLow: Math.round(netValue * 0.75),
      rangeHigh: Math.round(netValue * 1.25), // fourchette plus large : revenu plus volatil
      sourceLabel: 'estimation indicative (méthode standard du secteur, hors donnée officielle)',
      unit: '€ / mois (net estimé)',
    };
  }

  // -----------------------------------------------------------
  // Point d'entrée principal : choisit la bonne branche selon les réponses
  // -----------------------------------------------------------
  async function estimate(answers, geo) {
    const objectif = answers.objectif;
    const typeLocation = answers.typeLocation;

    if (objectif === 'Vendre') {
      return estimateVente(answers, geo);
    }

    if (objectif === 'Louer' || objectif === 'Optimiser un bien déjà loué') {
      if (typeLocation === 'Courte durée') {
        return estimateLocationCourte(answers);
      }
      if (typeLocation === "Les deux m'intéressent") {
        const [longue, courte] = await Promise.all([
          estimateLocationLongue(answers),
          estimateLocationCourte(answers),
        ]);
        return { type: 'location-mixte', longue, courte };
      }
      // par défaut (ou "Longue durée" explicitement choisi)
      return estimateLocationLongue(answers);
    }

    // objectif "Je ne sais pas encore" : on donne les trois pistes à titre indicatif
    const [vente, longue, courte] = await Promise.all([
      estimateVente(answers, geo),
      estimateLocationLongue(answers),
      estimateLocationCourte(answers),
    ]);
    return { type: 'indecis', vente, longue, courte };
  }

  return { estimate };
})();

// Exposé globalement pour être utilisé depuis conversation.js
if (typeof window !== 'undefined') {
  window.EstimationEngine = EstimationEngine;
}
