// Potentiel Immo — moteur de calculs financiers pour le rapport d'expert
// Calcule rendement brut, charges estimées, cash-flow et projections
// pluriannuelles à partir du résultat du moteur d'estimation. Reste
// volontairement avant impôt (pas de simulation fiscale personnalisée,
// la fiscalité dépendant trop de la situation individuelle pour être
// généralisée sans risque de conseil erroné).

const FinanceCalculator = (() => {

  // -----------------------------------------------------------
  // Charges forfaitaires estimées par défaut, en % du loyer annuel brut.
  // Ordres de grandeur usuels du marché locatif français (charges non
  // récupérables, assurance PNO, entretien courant, vacance locative).
  // -----------------------------------------------------------
  const CHARGES_RATIO = {
    'location-longue': 0.22,   // ~22% : charges copro non récup., PNO, entretien, vacance
    'location-courte': 0.35,   // ~35% : commissions plateforme, ménage, plus haute rotation
  };

  function computeRentalFinancials(result, type) {
    if (!result || typeof result.pointEstimate !== 'number') return null;

    const monthlyGross = result.pointEstimate;
    const annualGross = monthlyGross * 12;
    const chargesRatio = CHARGES_RATIO[type] ?? 0.22;
    const annualCharges = annualGross * chargesRatio;
    const annualNet = annualGross - annualCharges;
    const monthlyNet = annualNet / 12;

    return {
      monthlyGross: Math.round(monthlyGross),
      annualGross: Math.round(annualGross),
      annualCharges: Math.round(annualCharges),
      annualNet: Math.round(annualNet),
      monthlyNet: Math.round(monthlyNet),
      chargesRatioPct: Math.round(chargesRatio * 100),
    };
  }

  // -----------------------------------------------------------
  // Rendement brut/net (nécessite une valeur du bien — on utilise
  // l'estimation de vente si disponible, sinon le rendement n'est pas
  // calculable de façon fiable et on retourne null).
  // -----------------------------------------------------------
  function computeYield(rentalFinancials, propertyValue) {
    if (!rentalFinancials || !propertyValue || propertyValue <= 0) return null;
    return {
      grossYieldPct: Math.round((rentalFinancials.annualGross / propertyValue) * 1000) / 10,
      netYieldPct: Math.round((rentalFinancials.annualNet / propertyValue) * 1000) / 10,
    };
  }

  // -----------------------------------------------------------
  // Projection des revenus cumulés sur N années, avec une légère
  // revalorisation annuelle des loyers (indexation usuelle, hypothèse
  // prudente) pour rester réaliste sans être optimiste.
  // -----------------------------------------------------------
  const ANNUAL_RENT_GROWTH = 0.015; // +1.5%/an, hypothèse prudente d'indexation

  function computeProjection(rentalFinancials, years = 10) {
    if (!rentalFinancials) return [];

    const projection = [];
    let cumulative = 0;
    let currentAnnualNet = rentalFinancials.annualNet;

    for (let year = 1; year <= years; year++) {
      cumulative += currentAnnualNet;
      projection.push({
        year,
        annualNet: Math.round(currentAnnualNet),
        cumulative: Math.round(cumulative),
      });
      currentAnnualNet *= (1 + ANNUAL_RENT_GROWTH);
    }

    return projection;
  }

  // -----------------------------------------------------------
  // Indicateur de tension locative — approximation basée sur le type de
  // ville/zone n'étant pas disponible avec précision dans notre système
  // actuel, on dérive un indicateur qualitatif simple à partir du nombre
  // de comparables trouvés par le moteur DVF (proxy d'activité du marché
  // local) plutôt que d'inventer une donnée qu'on n'a pas.
  // -----------------------------------------------------------
  function estimateMarketTension(venteResult) {
    if (!venteResult || typeof venteResult.comparablesCount !== 'number') {
      return { level: 'inconnue', label: 'Donnée insuffisante pour évaluer la tension locative.' };
    }
    const count = venteResult.comparablesCount;
    if (count >= 8) {
      return { level: 'élevée', label: 'Marché actif : de nombreuses transactions récentes témoignent d\'une forte demande dans le secteur.' };
    }
    if (count >= 3) {
      return { level: 'modérée', label: 'Marché modérément actif : un volume de transactions raisonnable a été observé dans le secteur.' };
    }
    return { level: 'limitée', label: 'Données locales limitées : peu de transactions récentes recensées, la mise en location pourrait demander un peu plus de patience.' };
  }

  // -----------------------------------------------------------
  // Détermine la meilleure recommandation parmi les options disponibles,
  // selon un critère simple et transparent : le rendement annuel net
  // rapporté à la valeur du bien (ou, à défaut de valeur vénale connue,
  // le montant net annuel généré). Toujours explicable au prospect.
  // -----------------------------------------------------------
  function pickBestOption({ vente, locationLongue, locationCourte }) {
    const candidates = [];

    if (vente && typeof vente.pointEstimate === 'number') {
      candidates.push({
        type: 'vente',
        label: 'Vente',
        score: vente.pointEstimate, // capital immédiat disponible
        reason: "Un capital immédiat disponible, sans gestion locative à assurer.",
      });
    }

    if (locationLongue) {
      const fin = computeRentalFinancials(locationLongue, 'location-longue');
      if (fin) {
        candidates.push({
          type: 'location-longue',
          label: 'Location longue durée',
          score: fin.annualNet * 8, // pondération pour comparer à un capital (≈ multiple de rendement usuel)
          reason: "Un revenu régulier et stable, avec une gestion locative simplifiée.",
          financials: fin,
        });
      }
    }

    if (locationCourte) {
      const fin = computeRentalFinancials(locationCourte, 'location-courte');
      if (fin) {
        candidates.push({
          type: 'location-courte',
          label: 'Location courte durée',
          score: fin.annualNet * 6, // pondération légèrement prudente (revenu plus volatil)
          reason: "Le revenu net potentiel le plus élevé, en contrepartie d'une gestion plus active.",
          financials: fin,
        });
      }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  return {
    computeRentalFinancials,
    computeYield,
    computeProjection,
    estimateMarketTension,
    pickBestOption,
  };
})();

if (typeof window !== 'undefined') {
  window.FinanceCalculator = FinanceCalculator;
}
