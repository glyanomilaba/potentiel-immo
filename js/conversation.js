// Potentiel Immo — accueil conversationnel plein écran (mascotte Loop)
// Mode "scène unique" : une seule question affichée à la fois, transitions
// d'entrée/sortie, pas d'historique empilé ni de défilement de page.

// -----------------------------------------------------------
// Enregistrement des prospects
// L'envoi passe par la fonction serverless /api/save-prospect (voir
// api/save-prospect.js), qui relaie vers Airtable côté serveur. Le token
// Airtable n'est jamais présent dans ce fichier : il est configuré
// uniquement dans les variables d'environnement de l'hébergement
// (Vercel), pour ne jamais être visible dans le code source de la page.
// -----------------------------------------------------------
const SAVE_PROSPECT_ENDPOINT = '/api/save-prospect';

// Convertit les réponses collectées (clés internes type "typeBien") vers
// les noms de colonnes exacts de la table Airtable "Prospects".
function mapAnswersToAirtableFields(answers) {
  return {
    'Prenom': answers.prenom || '',
    'Nom': answers.nom || '',
    'Objectif': answers.objectif || '',
    'Type location': answers.typeLocation || '',
    'Adresse': answers.adresse || '',
    'Type de bien': answers.typeBien || '',
    'Surface': answers.surface || '',
    'Pièces': answers.pieces || '',
    'Étage': answers.etage || '',
    'Ascenseur': answers.ascenseur || '',
    'Année construction': answers.anneeConstruction || '',
    'DPE': answers.dpe || '',
    'Extérieur': answers.exterieur || '',
    'Stationnement': answers.stationnement || '',
    'Exposition': answers.exposition || '',
    'État': answers.etat || '',
    'Travaux récents': answers.travauxRecents || '',
    'Email': answers.email || '',
    'Téléphone': answers.telephone || '',
    'Estimation': answers.estimationResume || '',
    'Statut': 'Nouveau',
    // Note : les champs "Appel effectué le", "Consentement obtenu par appel"
    // et "Notes appel" ne sont volontairement pas envoyés ici — ils sont
    // remplis manuellement dans Airtable après l'appel téléphonique.
    // Les envoyer vides depuis le site fait échouer la requête si la colonne
    // Airtable est typée "Date" (Airtable refuse une chaîne vide pour ce type).
  };
}

// Envoie les réponses vers Airtable (via la fonction serverless relais).
// Renvoie true/false selon le succès, ne lève jamais d'exception pour ne
// pas casser l'expérience utilisateur : un échec d'envoi ne doit jamais
// empêcher d'afficher le message de fin.
async function sendToAirtable(answers) {
  try {
    const res = await fetch(SAVE_PROSPECT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: mapAnswersToAirtableFields(answers),
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error('Échec de l\'envoi vers Airtable', res.status, errorBody);
      return false;
    }

    const data = await res.json();
    console.log('Prospect enregistré dans Airtable, id :', data.id);
    return true;
  } catch (err) {
    console.error('Erreur réseau lors de l\'envoi vers Airtable', err);
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {

  const convThread = document.getElementById('convThread');
  const convProgress = document.getElementById('convProgress');
  const convProgressFill = document.getElementById('convProgressFill');
  const convProgressLabel = document.getElementById('convProgressLabel');
  const convBackBtn = document.getElementById('convBackBtn');
  const orbMascot = document.getElementById('orbMascot');
  const mascotZone = document.querySelector('.conv-mascot-zone');

  if (!convThread) return;

  // -----------------------------------------------------------
  // États et mouvements visuels de la mascotte
  // -----------------------------------------------------------
  function setOrbState(state) {
    // state : 'idle' | 'typing' | 'happy'
    orbMascot.classList.remove('orb-idle', 'orb-typing', 'orb-happy');
    orbMascot.classList.add('orb-' + state);
  }

  const bounceVariants = ['is-bounce-1', 'is-bounce-2', 'is-bounce-3'];
  function bounceMascot() {
    bounceVariants.forEach(c => mascotZone.classList.remove(c));
    void mascotZone.offsetWidth; // force reflow pour pouvoir rejouer l'animation
    const variant = bounceVariants[Math.floor(Math.random() * bounceVariants.length)];
    mascotZone.classList.add(variant);
  }

  // -----------------------------------------------------------
  // État de la conversation
  // -----------------------------------------------------------
  const answers = {};
  let lastEstimationResult = null; // conserve le résultat complet du moteur, pour le PDF/email
  let convAuthenticatedUserId = null; // id du compte Supabase une fois connecté, null sinon
  let convReestimatePropertyId = null; // id du bien existant si on est en mode réestimation, null sinon
  let flowIndex = 0;
  let hasStarted = false;
  const historyStack = []; // pile de { index, answersSnapshot, blockTitleBefore }
  let lastRenderedBlockTitle = null;

  // -----------------------------------------------------------
  // Script de conversation organisé en blocs thématiques
  // -----------------------------------------------------------
  const blocks = [
    {
      title: null,
      steps: [
        {
          key: 'identite',
          bot: "Pour commencer, comment puis-je vous appeler ?",
          type: 'identity',
        },
      ],
    },
    {
      title: 'Le projet',
      steps: [
        {
          key: 'objectif',
          bot: "Quel est votre objectif ?",
          type: 'choice',
          choices: ['Vendre', 'Louer', 'Optimiser un bien déjà loué', 'Je ne sais pas encore'],
        },
        {
          key: 'typeLocation',
          bot: "Vous visez plutôt la location longue durée ou la location courte durée (type Airbnb) ?",
          type: 'choice',
          choices: ['Longue durée', 'Courte durée', 'Les deux m\'intéressent'],
          skip: a => !['Louer', 'Optimiser un bien déjà loué'].includes(a.objectif),
        },
        {
          key: 'horizon',
          bot: "Pour vous aider à y voir plus clair : vous envisagez plutôt ce projet à court terme, ou sur le long terme ?",
          type: 'choice',
          choices: ['Court terme (besoin rapide de liquidités)', 'Long terme (constituer un patrimoine)', 'Pas encore décidé'],
          skip: a => a.objectif !== 'Je ne sais pas encore',
        },
        {
          key: 'priorite',
          bot: "Qu'est-ce qui compte le plus pour vous aujourd'hui ?",
          type: 'choice',
          choices: ['Un capital disponible rapidement', 'Un revenu régulier dans le temps', 'Les deux se valent pour moi'],
          skip: a => a.objectif !== 'Je ne sais pas encore',
        },
        {
          key: 'disponibiliteGestion',
          bot: "Êtes-vous prêt à vous impliquer un peu dans la gestion (ou à passer par un partenaire), ou préférez-vous la solution la plus simple possible ?",
          type: 'choice',
          choices: ['Je suis disponible pour m\'impliquer', 'Je préfère le plus simple possible', 'Peu importe, je passerai par un partenaire'],
          skip: a => a.objectif !== 'Je ne sais pas encore',
        },
      ],
    },
    {
      title: 'Localisation',
      steps: [
        {
          key: 'adresse',
          bot: "Quelle est l'adresse exacte du bien ? Cela me permet de comparer avec les biens réellement vendus ou loués dans votre rue.",
          type: 'address',
          placeholder: "Commencez à taper l'adresse…",
        },
      ],
    },
    {
      title: 'Le bien',
      steps: [
        {
          key: 'typeBien',
          bot: "De quel type de bien s'agit-il ?",
          type: 'choice',
          choices: ['Studio', 'Appartement', 'Maison', 'Immeuble'],
        },
        {
          key: 'surface',
          bot: "Quelle est sa surface habitable, en m² (loi Carrez si copropriété) ?",
          type: 'text',
          placeholder: 'Ex : 65',
          inputMode: 'numeric',
          hint: 'Indiquez une valeur la plus précise possible : elle influence directement le calcul de votre estimation.',
        },
        {
          key: 'pieces',
          bot: "Combien de pièces compte le bien (hors cuisine et salle de bain) ?",
          type: 'text',
          placeholder: 'Ex : 3',
          inputMode: 'numeric',
          hint: 'Un nombre exact permet une comparaison plus fiable avec des biens similaires.',
        },
        {
          key: 'etage',
          bot: "À quel étage se situe-t-il ?",
          type: 'choice',
          choices: ['Rez-de-chaussée', '1er à 3e étage', '4e étage et plus', 'Dernier étage'],
          skip: a => !['Studio', 'Appartement', 'Immeuble'].includes(a.typeBien),
        },
        {
          key: 'ascenseur',
          bot: "L'immeuble dispose-t-il d'un ascenseur ?",
          type: 'choice',
          choices: ['Oui', 'Non', 'Non concerné'],
          skip: a => !['Studio', 'Appartement', 'Immeuble'].includes(a.typeBien),
        },
        {
          key: 'anneeConstruction',
          bot: "De quand date la construction, approximativement ?",
          type: 'choice',
          choices: ['Avant 1945', '1945 – 1980', '1980 – 2010', 'Après 2010'],
        },
        {
          key: 'dpe',
          bot: "Connaissez-vous le DPE (diagnostic de performance énergétique) du bien ?",
          type: 'choice',
          choices: ['A ou B', 'C ou D', 'E ou F', 'G', 'Je ne sais pas'],
        },
      ],
    },
    {
      title: 'Confort et atouts',
      steps: [
        {
          key: 'exterieur',
          bot: "Le bien dispose-t-il d'un espace extérieur ?",
          type: 'choice',
          choices: ['Balcon', 'Terrasse', 'Jardin', 'Aucun'],
        },
        {
          key: 'stationnement',
          bot: "Et côté stationnement ?",
          type: 'choice',
          choices: ['Garage', 'Place réservée', 'Aucun'],
        },
        {
          key: 'exposition',
          bot: "Quelle est l'exposition principale du bien ?",
          type: 'choice',
          choices: ['Sud', 'Nord', 'Est / Ouest', 'Je ne sais pas'],
        },
      ],
    },
    {
      title: 'État du bien',
      steps: [
        {
          key: 'etat',
          bot: "Dans quel état général se trouve le bien aujourd'hui ?",
          type: 'choice',
          choices: ['Neuf / récent', 'Bon état', 'À rafraîchir', 'Travaux à prévoir'],
        },
        {
          key: 'travauxRecents',
          bot: "Des travaux ont-ils été réalisés récemment (moins de 5 ans) ?",
          type: 'choice',
          choices: ['Oui, rénovation complète', 'Oui, travaux partiels', 'Non'],
        },
      ],
    },
  ];

  function resolveFlow() {
    const flow = [];
    blocks.forEach(block => {
      block.steps.forEach(step => {
        if (typeof step.skip === 'function' && step.skip(answers)) return;
        flow.push({ ...step, blockTitle: block.title });
      });
    });
    return flow;
  }

  function updateProgress(index, total) {
    const pct = Math.round((index / total) * 100);
    convProgressFill.style.width = pct + '%';
    convProgressLabel.textContent = index < total
      ? `Étape ${index + 1} sur ${total}`
      : 'Analyse terminée';
    convBackBtn.disabled = index === 0;
  }

  // -----------------------------------------------------------
  // Mécanique de scène : une seule "carte" affichée à la fois.
  // `renderScene(buildFn)` anime la sortie de la scène courante,
  // vide le conteneur, appelle buildFn(stage) pour construire la
  // nouvelle scène, puis l'anime en entrée.
  // -----------------------------------------------------------
  function renderScene(buildFn) {
    const current = convThread.querySelector('.conv-stage');

    function mount() {
      const stage = document.createElement('div');
      stage.className = 'conv-stage is-entering';
      convThread.appendChild(stage);
      buildFn(stage);
      stage.addEventListener('animationend', () => {
        stage.classList.remove('is-entering');
      }, { once: true });
    }

    if (current) {
      current.classList.add('is-leaving');
      current.addEventListener('animationend', () => {
        current.remove();
        mount();
      }, { once: true });
    } else {
      mount();
    }
  }

  function renderBlockHeaderInto(stage, title) {
    if (!title) return;
    const header = document.createElement('div');
    header.className = 'conv-block-header';
    header.innerHTML = `<span class="conv-block-line"></span><span>${title}</span><span class="conv-block-line"></span>`;
    stage.appendChild(header);
  }

  function addTypingThen(stage, text, onDone) {
    setOrbState('typing');
    const typing = document.createElement('div');
    typing.className = 'conv-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    stage.appendChild(typing);

    const delay = 500 + Math.random() * 300;
    setTimeout(() => {
      typing.remove();
      const msg = document.createElement('div');
      msg.className = 'conv-msg conv-msg-bot';
      msg.textContent = text;
      stage.appendChild(msg);
      setOrbState('happy');
      setTimeout(() => setOrbState('idle'), 600);
      onDone();
    }, delay);
  }

  function addConfirmedAnswer(stage, text) {
    const tag = document.createElement('span');
    tag.className = 'conv-msg-user';
    tag.textContent = text;
    stage.appendChild(tag);
    bounceMascot();
  }

  // -----------------------------------------------------------
  // Inputs
  // -----------------------------------------------------------
  function renderChoiceInput(stage, step, onAnswered) {
    const wrap = document.createElement('div');
    wrap.className = 'conv-choices';

    step.choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'conv-choice-btn';
      btn.textContent = choice;
      btn.addEventListener('click', () => {
        wrap.querySelectorAll('button').forEach(b => b.disabled = true);
        onAnswered(choice);
      });
      wrap.appendChild(btn);
    });

    stage.appendChild(wrap);
  }

  function renderTextInput(stage, step, onAnswered) {
    const wrap = document.createElement('div');
    wrap.className = 'conv-field-wrap';

    const row = document.createElement('div');
    row.className = 'conv-input-row';
    row.innerHTML = `
      <input type="text" placeholder="${step.placeholder || ''}" ${step.inputMode ? `inputmode="${step.inputMode}"` : ''} aria-label="${step.bot}">
      <button type="button" class="conv-send-btn" aria-label="Envoyer" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8H14M14 8L9.5 3.5M14 8L9.5 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    `;
    wrap.appendChild(row);

    if (step.hint) {
      const hint = document.createElement('p');
      hint.className = 'conv-fineprint';
      hint.textContent = step.hint;
      wrap.appendChild(hint);
    }

    stage.appendChild(wrap);

    const input = row.querySelector('input');
    const sendBtn = row.querySelector('.conv-send-btn');

    input.addEventListener('input', () => {
      sendBtn.disabled = input.value.trim().length === 0;
    });

    function submit() {
      const value = input.value.trim();
      if (!value) return;
      onAnswered(value);
    }

    sendBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input.focus(), 100);
  }

  // Champ identité : prénom + nom, avec précision sur l'usage de la donnée
  function renderIdentityInput(stage, step, onAnswered) {
    const wrap = document.createElement('div');
    wrap.className = 'conv-contact-wrap';
    wrap.innerHTML = `
      <div class="conv-input-row">
        <input type="text" placeholder="Votre prénom" aria-label="Votre prénom">
      </div>
      <div class="conv-input-row">
        <input type="text" placeholder="Votre nom" aria-label="Votre nom">
        <button type="button" class="conv-send-btn" aria-label="Envoyer" disabled>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8H14M14 8L9.5 3.5M14 8L9.5 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    `;
    stage.appendChild(wrap);

    const fineprint = document.createElement('p');
    fineprint.className = 'conv-fineprint';
    fineprint.textContent = "Ces informations apparaîtront sur votre rapport d'estimation.";
    stage.appendChild(fineprint);

    const inputs = wrap.querySelectorAll('input');
    const firstNameInput = inputs[0];
    const lastNameInput = inputs[1];
    const sendBtn = wrap.querySelector('.conv-send-btn');

    function refreshSendState() {
      sendBtn.disabled = firstNameInput.value.trim().length === 0 || lastNameInput.value.trim().length === 0;
    }

    firstNameInput.addEventListener('input', refreshSendState);
    lastNameInput.addEventListener('input', refreshSendState);

    function submit() {
      const firstName = firstNameInput.value.trim();
      const lastName = lastNameInput.value.trim();
      if (!firstName || !lastName) return;
      onAnswered({ prenom: firstName, nom: lastName });
    }

    sendBtn.addEventListener('click', submit);
    firstNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') lastNameInput.focus(); });
    lastNameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => firstNameInput.focus(), 100);
  }

  // Champ adresse avec autocomplétion via l'API officielle de la Base Adresse Nationale (IGN)
  function renderAddressInput(stage, step, onAnswered) {
    const row = document.createElement('div');
    row.className = 'conv-input-row conv-input-row-address';
    row.innerHTML = `
      <div class="conv-address-field">
        <input type="text" placeholder="${step.placeholder || ''}" autocomplete="off" aria-label="${step.bot}" aria-autocomplete="list">
        <div class="conv-address-suggestions" hidden></div>
      </div>
      <button type="button" class="conv-send-btn" aria-label="Envoyer" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8H14M14 8L9.5 3.5M14 8L9.5 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    `;
    stage.appendChild(row);

    const input = row.querySelector('input');
    const sendBtn = row.querySelector('.conv-send-btn');
    const suggestionsBox = row.querySelector('.conv-address-suggestions');

    let selectedLabel = null;
    let selectedGeo = null;
    let debounceTimer = null;
    let activeIndex = -1;
    let currentResults = [];

    async function fetchSuggestions(query) {
      try {
        const url = `https://data.geopf.fr/geocodage/completion/?text=${encodeURIComponent(query)}&type=StreetAddress&maximumResponses=5`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('network');
        const data = await res.json();
        return (data.results || []).map(r => r.fulltext || r.street || '').filter(Boolean);
      } catch (err) {
        return [];
      }
    }

    function renderSuggestions(results) {
      currentResults = results;
      activeIndex = -1;
      if (!results.length) {
        suggestionsBox.hidden = true;
        suggestionsBox.innerHTML = '';
        return;
      }
      suggestionsBox.innerHTML = results.map((r, i) =>
        `<button type="button" class="conv-address-option" data-index="${i}">${r}</button>`
      ).join('');
      suggestionsBox.hidden = false;

      suggestionsBox.querySelectorAll('.conv-address-option').forEach(btn => {
        btn.addEventListener('click', () => {
          selectAddress(results[Number(btn.dataset.index)]);
        });
      });
    }

    function selectAddress(label) {
      selectedLabel = label;
      input.value = label;
      suggestionsBox.hidden = true;
      sendBtn.disabled = false;
      input.classList.add('is-verified');
      // géolocalise l'adresse choisie en arrière-plan (endpoint /search, format GeoJSON standard)
      fetchGeocode(label);
    }

    async function fetchGeocode(addressLabel) {
      try {
        const url = `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(addressLabel)}&limit=1`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('network');
        const data = await res.json();
        const feature = data.features && data.features[0];
        if (feature && feature.geometry && Array.isArray(feature.geometry.coordinates)) {
          const [lon, lat] = feature.geometry.coordinates;
          selectedGeo = { lat, lon };
        }
      } catch (err) {
        // pas grave : le moteur d'estimation utilisera son repli sans géolocalisation
        selectedGeo = null;
      }
    }

    input.addEventListener('input', () => {
      selectedLabel = null;
      selectedGeo = null;
      input.classList.remove('is-verified');
      sendBtn.disabled = true;
      const query = input.value.trim();
      clearTimeout(debounceTimer);
      if (query.length < 3) {
        suggestionsBox.hidden = true;
        return;
      }
      debounceTimer = setTimeout(async () => {
        const results = await fetchSuggestions(query);
        renderSuggestions(results);
      }, 280);
    });

    input.addEventListener('keydown', (e) => {
      if (suggestionsBox.hidden) {
        if (e.key === 'Enter') submit();
        return;
      }
      const options = suggestionsBox.querySelectorAll('.conv-address-option');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, options.length - 1);
        options.forEach((o, i) => o.classList.toggle('is-active', i === activeIndex));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        options.forEach((o, i) => o.classList.toggle('is-active', i === activeIndex));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && currentResults[activeIndex]) {
          selectAddress(currentResults[activeIndex]);
        } else {
          submit();
        }
      }
    });

    function submit() {
      const value = (selectedLabel || input.value.trim());
      if (!value) return;
      onAnswered(value, { verified: Boolean(selectedLabel), geo: selectedGeo });
    }

    sendBtn.addEventListener('click', submit);
    setTimeout(() => input.focus(), 100);
  }

  // -----------------------------------------------------------
  // Scène d'accueil : présentation de Loop + pause d'engagement
  // -----------------------------------------------------------
  function renderIntro() {
    renderScene((stage) => {
      addTypingThen(stage, "Bonjour, je suis Loop, votre assistante Potentiel Immo. Je vais vous poser quelques questions précises, un peu comme le ferait un expert immobilier, pour estimer ce que votre bien peut réellement vous rapporter.", () => {
        const wrap = document.createElement('div');
        wrap.className = 'conv-intro-actions';

        const startBtn = document.createElement('button');
        startBtn.type = 'button';
        startBtn.className = 'conv-choice-btn is-primary';
        startBtn.textContent = "Oui, c'est parti";

        const laterBtn = document.createElement('button');
        laterBtn.type = 'button';
        laterBtn.className = 'conv-choice-btn';
        laterBtn.textContent = "Je préfère en savoir plus d'abord";

        startBtn.addEventListener('click', () => {
          bounceMascot();
          convProgress.hidden = false;
          renderStep(0);
        });

        laterBtn.addEventListener('click', () => {
          if (typeof showLanding === 'function') {
            showLanding();
          } else {
            window.location.href = 'landing.html';
          }
        });

        wrap.appendChild(startBtn);
        wrap.appendChild(laterBtn);
        stage.appendChild(wrap);

        const confidentialityNote = document.createElement('p');
        confidentialityNote.className = 'conv-fineprint';
        confidentialityNote.textContent = "Vos réponses restent confidentielles et ne sont transmises à un partenaire qu'avec votre accord.";
        stage.appendChild(confidentialityNote);
      });
    });
  }

  function renderStep(index) {
    const flow = resolveFlow();
    updateProgress(index, flow.length);

    if (index >= flow.length) {
      renderScene((stage) => {
        addTypingThen(stage, "Merci, j'ai toutes les informations nécessaires.", () => {
          renderAnalysisLoader();
        });
      });
      return;
    }

    const step = flow[index];
    const blockTitleBefore = lastRenderedBlockTitle;
    const isNewBlock = step.blockTitle !== lastRenderedBlockTitle;
    if (isNewBlock) lastRenderedBlockTitle = step.blockTitle;

    // empile l'état pour le retour arrière (snapshot léger des réponses)
    historyStack.push({
      index,
      answersSnapshot: { ...answers },
      blockTitleBefore,
    });

    renderScene((stage) => {
      if (isNewBlock) renderBlockHeaderInto(stage, step.blockTitle);

      addTypingThen(stage, step.bot, () => {
        const onAnswered = (value, meta) => {
          if (step.type === 'identity') {
            // value = { prenom, nom } — on stocke les deux clés et on affiche un résumé lisible
            answers.prenom = value.prenom;
            answers.nom = value.nom;
            addConfirmedAnswer(stage, `${value.prenom} ${value.nom}`);
          } else {
            // affiche la confirmation de la réponse dans la scène courante avant de continuer
            addConfirmedAnswer(stage, value);
            answers[step.key] = value;
            if (step.type === 'address' && meta && meta.geo) {
              answers.geo = meta.geo;
            }
          }
          flowIndex = index + 1;
          setTimeout(() => renderStep(flowIndex), 320);
        };

        if (step.type === 'choice') {
          renderChoiceInput(stage, step, onAnswered);
        } else if (step.type === 'address') {
          renderAddressInput(stage, step, onAnswered);
        } else if (step.type === 'text') {
          renderTextInput(stage, step, onAnswered);
        } else if (step.type === 'identity') {
          renderIdentityInput(stage, step, onAnswered);
        }
      });
    });
  }

  // -----------------------------------------------------------
  // Écran de chargement "analyse en cours" : barre de progression
  // 0→100% avec des messages de statut qui changent, pour donner
  // une impression de calcul réel plutôt qu'une réponse instantanée.
  // -----------------------------------------------------------
  function renderAnalysisLoader() {
    const loaderSteps = [
      "Analyse du marché local…",
      "Comparaison avec les biens similaires…",
      "Calcul du potentiel locatif…",
      "Vérification des données du quartier…",
      "Croisement des tendances de prix…",
      "Finalisation de votre rapport…",
    ];

    renderScene((stage) => {
      const wrap = document.createElement('div');
      wrap.className = 'conv-loader';
      wrap.innerHTML = `
        <div class="conv-loader-bar-track">
          <div class="conv-loader-bar-fill" id="loaderFill"></div>
        </div>
        <div class="conv-loader-pct" id="loaderPct">0%</div>
        <div class="conv-loader-label" id="loaderLabel">${loaderSteps[0]}</div>
      `;
      stage.appendChild(wrap);

      const fill = wrap.querySelector('#loaderFill');
      const pct = wrap.querySelector('#loaderPct');
      const label = wrap.querySelector('#loaderLabel');

      const totalDuration = 6200; // ms — ralenti pour paraître plus minutieux
      const start = performance.now();
      let lastStepIndex = 0;

      function tick(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / totalDuration, 1);
        // easing : démarre vite, ralentit en approchant 100% (impression de calcul minutieux)
        const eased = 1 - Math.pow(1 - progress, 2);
        const percent = Math.round(eased * 100);

        fill.style.width = percent + '%';
        pct.textContent = percent + '%';

        const stepIndex = Math.min(
          Math.floor(progress * loaderSteps.length),
          loaderSteps.length - 1
        );
        if (stepIndex !== lastStepIndex || elapsed < 50) {
          lastStepIndex = stepIndex;
          label.textContent = loaderSteps[stepIndex];
        }

        if (progress < 1) {
          requestAnimationFrame(tick);
        } else {
          setTimeout(() => renderTeaser(), 400);
        }
      }

      requestAnimationFrame(tick);
    });
  }

  // -----------------------------------------------------------
  // Scène teaser : aperçu chiffré flouté + accroche, avant la
  // demande d'email. Le chiffre vient désormais du vrai moteur
  // d'estimation (window.EstimationEngine), basé sur DVF / Observatoires
  // des loyers / méthode courte durée selon l'objectif déclaré.
  // -----------------------------------------------------------
  function pickPrimaryResult(result) {
    // Réduit un résultat potentiellement composite (mixte/indécis) à un
    // seul chiffre à afficher dans le teaser flouté, avec son unité.
    if (!result) return null;
    if (result.type === 'location-mixte') {
      return result.longue || result.courte;
    }
    if (result.type === 'indecis') {
      return result.vente || result.longue || result.courte;
    }
    return result;
  }

  // -----------------------------------------------------------
  // Clé de sauvegarde temporaire des réponses, utilisée uniquement le
  // temps d'une redirection vers Google (l'utilisateur quitte la page
  // puis y revient une fois authentifié — sans cette sauvegarde, tout
  // l'historique du questionnaire serait perdu au retour).
  // -----------------------------------------------------------
  const PENDING_ANSWERS_KEY = 'potentielImmo.pendingAnswers';

  function savePendingAnswersBeforeRedirect() {
    try {
      localStorage.setItem(PENDING_ANSWERS_KEY, JSON.stringify(answers));
    } catch (err) {
      console.warn('Impossible de sauvegarder temporairement les réponses avant redirection.', err);
    }
  }

  function restorePendingAnswersIfAny() {
    try {
      const raw = localStorage.getItem(PENDING_ANSWERS_KEY);
      if (!raw) return false;
      const restored = JSON.parse(raw);
      Object.assign(answers, restored);
      localStorage.removeItem(PENDING_ANSWERS_KEY);
      return true;
    } catch (err) {
      console.warn('Impossible de restaurer les réponses après redirection.', err);
      return false;
    }
  }

  async function renderTeaser() {
    renderScene((stage) => {
      addTypingThen(stage, "Voilà, votre analyse est prête.", async () => {
        let figureText = '···';
        let unitText = '';

        try {
          if (window.EstimationEngine) {
            const result = await window.EstimationEngine.estimate(answers, answers.geo);
            lastEstimationResult = result;
            const primary = pickPrimaryResult(result);
            if (primary && typeof primary.pointEstimate === 'number') {
              figureText = primary.pointEstimate.toLocaleString('fr-FR');
              unitText = primary.unit || '';
              answers.estimationResume = `${primary.pointEstimate} ${primary.unit} (${primary.sourceLabel || ''})`;
            }
          }
        } catch (err) {
          console.warn('Estimation indisponible, affichage générique du teaser.', err);
        }

        const teaser = document.createElement('div');
        teaser.className = 'conv-teaser';
        teaser.innerHTML = `
          <span class="conv-teaser-label">Potentiel identifié</span>
          <span class="conv-teaser-figure"><span class="conv-teaser-blur">${figureText}</span><span class="conv-teaser-unit">${unitText}</span></span>
          <span class="conv-teaser-hint">${convAuthenticatedUserId ? 'Votre estimation mise à jour' : 'Connectez-vous pour recevoir le détail complet et suivre ce bien'}</span>
        `;
        stage.appendChild(teaser);

        setTimeout(() => {
          if (convAuthenticatedUserId) {
            // déjà connecté (mode réestimation) : pas besoin de repasser
            // par l'authentification, on enchaîne directement
            addTypingThen(stage, "Je mets à jour votre estimation…", () => {
              finalizeJourney(stage);
            });
            return;
          }
          addTypingThen(stage, "Pour découvrir le détail complet de votre analyse et la retrouver à tout moment, connectez-vous ou créez votre compte gratuit.", () => {
            renderAuthGate(stage);
          });
        }, 600);
      });
    });
  }

  // -----------------------------------------------------------
  // Porte d'authentification obligatoire avant d'accéder au détail de
  // l'estimation. Propose Google en avant, email/mot de passe en
  // option. Une fois authentifié (par l'une ou l'autre méthode), enchaîne
  // sur la capture du téléphone puis la finalisation du parcours.
  // -----------------------------------------------------------
  function renderAuthGate(stage) {
    const wrap = document.createElement('div');
    wrap.className = 'conv-account-wrap';

    const googleBtn = document.createElement('button');
    googleBtn.type = 'button';
    googleBtn.className = 'conv-choice-btn conv-google-btn';
    googleBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.09-1.8 2.73v2.27h2.91c1.7-1.57 2.69-3.88 2.69-6.64z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.91-2.27c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"/><path fill="#FBBC05" d="M3.95 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.83.96 4.04l2.99-2.34z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l2.99 2.34C4.66 5.16 6.65 3.58 9 3.58z"/></svg>
      <span>Continuer avec Google</span>
    `;
    googleBtn.addEventListener('click', async () => {
      googleBtn.disabled = true;
      try {
        if (window.PotentielAuth) {
          // sauvegarde les réponses avant de quitter la page : Google
          // redirige le navigateur, donc le code JS en cours s'arrête ici
          savePendingAnswersBeforeRedirect();
          await window.PotentielAuth.signInWithGoogle();
        }
      } catch (err) {
        console.error('Échec de la connexion Google', err);
        googleBtn.disabled = false;
      }
    });

    const emailLink = document.createElement('button');
    emailLink.type = 'button';
    emailLink.className = 'conv-account-email-link';
    emailLink.textContent = 'ou continuer avec mon email';
    emailLink.addEventListener('click', () => {
      renderAuthEmailForm(stage);
    });

    wrap.appendChild(googleBtn);
    wrap.appendChild(emailLink);
    stage.appendChild(wrap);
  }

  // -----------------------------------------------------------
  // Formulaire email + mot de passe — gère à la fois la connexion (si
  // le compte existe déjà) et l'inscription (sinon), pour ne pas
  // imposer un choix supplémentaire au prospect à cette étape.
  // -----------------------------------------------------------
  function renderAuthEmailForm(stage) {
    const existingWrap = stage.querySelector('.conv-account-wrap');
    if (existingWrap) existingWrap.remove();

    const formWrap = document.createElement('div');
    formWrap.className = 'conv-contact-wrap';
    formWrap.innerHTML = `
      <div class="conv-input-row">
        <input type="email" placeholder="votre@email.fr" inputmode="email" aria-label="Votre email">
      </div>
      <div class="conv-input-row">
        <input type="password" placeholder="Mot de passe (8 caractères min.)" aria-label="Mot de passe">
        <button type="button" class="conv-send-btn" aria-label="Continuer" disabled>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8H14M14 8L9.5 3.5M14 8L9.5 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    `;
    stage.appendChild(formWrap);

    const statusMsg = document.createElement('p');
    statusMsg.className = 'conv-fineprint';
    statusMsg.textContent = "Si vous n'avez pas encore de compte, il sera créé automatiquement.";
    stage.appendChild(statusMsg);

    const emailInput = formWrap.querySelector('input[type="email"]');
    const passwordInput = formWrap.querySelector('input[type="password"]');
    const sendBtn = formWrap.querySelector('.conv-send-btn');

    function refreshSendState() {
      sendBtn.disabled = !emailInput.value.includes('@') || passwordInput.value.length < 8;
    }
    emailInput.addEventListener('input', refreshSendState);
    passwordInput.addEventListener('input', refreshSendState);

    async function submit() {
      if (sendBtn.disabled) return;
      sendBtn.disabled = true;
      statusMsg.textContent = 'Connexion en cours…';

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      try {
        if (!window.PotentielAuth) throw new Error('Service de compte indisponible');

        let user = null;
        // tente d'abord la connexion (cas le plus fréquent pour un
        // utilisateur qui revient) ; si le compte n'existe pas, bascule
        // automatiquement sur la création, pour ne pas imposer un choix
        // supplémentaire au prospect à cette étape du parcours.
        try {
          const signInData = await window.PotentielAuth.signInWithEmail(email, password);
          user = signInData.user;
        } catch (signInErr) {
          const signUpData = await window.PotentielAuth.signUpWithEmail(email, password);
          user = signUpData.user;
        }

        answers.email = email;
        formWrap.remove();
        statusMsg.remove();
        addTypingThen(stage, "Merci ! Une dernière chose : à quel numéro un conseiller peut-il vous joindre pour commenter votre analyse ?", () => {
          onAuthenticated(stage, user);
        });
      } catch (err) {
        console.error('Échec de la connexion/inscription', err);
        statusMsg.textContent = "Une erreur est survenue. Vérifiez votre mot de passe ou réessayez dans un instant.";
        sendBtn.disabled = false;
      }
    }

    sendBtn.addEventListener('click', submit);
    passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => emailInput.focus(), 100);
  }

  // -----------------------------------------------------------
  // Appelée une fois l'utilisateur authentifié (Google ou email) : on
  // connaît désormais son identité, il ne reste qu'à demander le
  // téléphone avant de finaliser le parcours (sauvegarde du bien et de
  // l'estimation liés au compte, envoi des emails, enregistrement
  // Airtable).
  // -----------------------------------------------------------
  function onAuthenticated(stage, user) {
    if (user && user.email) answers.email = user.email;
    convAuthenticatedUserId = user ? user.id : null;
    renderPhoneCapture(stage);
  }

  function renderPhoneCapture(stage) {
    const row = document.createElement('div');
    row.className = 'conv-input-row';
    row.innerHTML = `
      <input type="tel" placeholder="Votre numéro de téléphone" inputmode="tel" aria-label="Votre téléphone">
      <button type="button" class="conv-send-btn" aria-label="Envoyer" disabled>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 8H14M14 8L9.5 3.5M14 8L9.5 12.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    `;
    stage.appendChild(row);

    const input = row.querySelector('input');
    const sendBtn = row.querySelector('.conv-send-btn');

    function isPhoneValid(value) {
      return (value.match(/\d/g) || []).length >= 6;
    }

    input.addEventListener('input', () => {
      sendBtn.disabled = !isPhoneValid(input.value);
    });

    async function submit() {
      const phone = input.value.trim();
      if (!isPhoneValid(phone)) return;
      sendBtn.disabled = true;
      answers.telephone = phone;
      await finalizeJourney(stage);
    }

    sendBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input.focus(), 100);
  }

  // -----------------------------------------------------------
  // Finalisation du parcours : sauvegarde le bien + l'estimation dans
  // Supabase (liés au compte), envoie les emails, enregistre dans
  // Airtable, puis affiche le message de conclusion.
  // -----------------------------------------------------------
  async function finalizeJourney(stage) {
    convProgressLabel.textContent = 'Analyse terminée';
    convBackBtn.disabled = true;

    renderScene((finalStage) => {
      addTypingThen(finalStage, "Merci ! J'enregistre votre demande et je prépare votre rapport…", () => {});
    });

    const tasks = [
      sendToAirtable(answers),
      (window.EmailService
        ? window.EmailService.sendReportEmails(answers, lastEstimationResult).catch(err => {
            console.error('Échec de l\'envoi du rapport par email', err);
            return { success: false };
          })
        : Promise.resolve({ success: false })),
    ];

    if (convAuthenticatedUserId && window.PotentielData) {
      const savePropertyPromise = convReestimatePropertyId
        ? window.PotentielData.updatePropertyAnswers(convReestimatePropertyId, answers)
        : window.PotentielData.saveProperty(convAuthenticatedUserId, answers);

      tasks.push(
        savePropertyPromise
          .then(property => window.PotentielData.saveEstimation(convAuthenticatedUserId, property.id, lastEstimationResult || {}))
          .catch(err => {
            console.error('Échec de la sauvegarde du bien dans l\'espace client', err);
            return null;
          })
      );
    }

    const [airtableSuccess] = await Promise.all(tasks);

    const firstName = answers.prenom ? answers.prenom.trim() : '';
    const greeting = firstName ? `Merci ${firstName} ! ` : 'Merci ! ';

    renderScene((finalStage) => {
      const message = airtableSuccess
        ? `${greeting}Votre analyse personnalisée pour votre ${(answers.typeBien || 'bien').toLowerCase()} arrive par email dans quelques instants, et reste disponible dans votre espace client. Un conseiller vous appellera prochainement pour vous expliquer les résultats en détail et répondre à toutes vos questions.`
        : `${greeting}Votre demande a bien été reçue. Un léger souci technique est survenu de notre côté, mais ne vous inquiétez pas : un conseiller vous recontactera rapidement pour faire le point avec vous.`;
      addTypingThen(finalStage, message, () => {
        if (convAuthenticatedUserId) {
          const link = document.createElement('a');
          link.href = 'espace-client.html';
          link.className = 'conv-choice-btn is-primary conv-space-client-link';
          link.textContent = 'Accéder à mon espace client';
          finalStage.appendChild(link);
        }
      });
    });
  }


  function goBack() {
    if (historyStack.length === 0) return;
    const last = historyStack.pop();

    // restaure les réponses telles qu'elles étaient avant cette étape
    Object.keys(answers).forEach(k => delete answers[k]);
    Object.assign(answers, last.answersSnapshot);

    lastRenderedBlockTitle = last.blockTitleBefore;
    flowIndex = last.index;
    renderStep(flowIndex);
  }

  convBackBtn.addEventListener('click', goBack);

  // -----------------------------------------------------------
  // Mode réestimation : arrivée depuis l'espace client avec un bien
  // existant à modifier. Pré-remplit les réponses et démarre
  // directement le questionnaire (déjà connecté, pas besoin de
  // repasser par l'authentification).
  // -----------------------------------------------------------
  async function tryStartReestimation() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('reestimer') !== '1') return false;

    let stored = null;
    try {
      const raw = sessionStorage.getItem('potentielImmo.reestimateProperty');
      if (raw) stored = JSON.parse(raw);
    } catch (err) {
      console.warn('Impossible de lire les données de réestimation', err);
    }
    if (!stored) return false;

    const user = window.PotentielAuth ? await window.PotentielAuth.getCurrentUser() : null;
    if (!user) return false; // session expirée entre-temps : repli sur le parcours normal

    sessionStorage.removeItem('potentielImmo.reestimateProperty');
    Object.assign(answers, stored.answers || {});
    convReestimatePropertyId = stored.propertyId || null;
    convAuthenticatedUserId = user.id;

    hasStarted = true;
    convProgress.hidden = false;
    renderScene((stage) => {
      addTypingThen(stage, "Reprenons ce bien : modifiez les réponses qui ont changé, et je recalcule votre potentiel à la fin.", () => {
        flowIndex = 0;
        renderStep(0);
      });
    });
    return true;
  }

  // -----------------------------------------------------------
  // Démarrage : si l'utilisateur revient d'une redirection Google avec
  // des réponses en attente, on les restaure et on reprend directement
  // à l'étape "téléphone" plutôt que de relancer tout le questionnaire
  // depuis le début. Sinon, démarrage normal de la conversation.
  // -----------------------------------------------------------
  async function tryResumeAfterRedirect() {
    const hasPending = restorePendingAnswersIfAny();
    if (!hasPending) return false;

    const user = window.PotentielAuth ? await window.PotentielAuth.getCurrentUser() : null;
    if (!user) return false; // la connexion Google a échoué ou a été annulée

    hasStarted = true;
    convProgress.hidden = false;
    convBackBtn.disabled = true;
    renderScene((stage) => {
      addTypingThen(stage, "Vous voilà connecté ! Une dernière chose : à quel numéro un conseiller peut-il vous joindre ?", () => {
        onAuthenticated(stage, user);
      });
    });
    return true;
  }

  if (!hasStarted) {
    tryStartReestimation().then(async reestimating => {
      if (reestimating) return;

      const resumed = await tryResumeAfterRedirect();
      if (resumed) return;

      // Pas de parcours en cours à reprendre : si une session existe déjà
      // (utilisateur revenu sur le site après s'être connecté précédemment),
      // on le redirige vers la landing plutôt que de lui refaire passer le
      // questionnaire — il y retrouvera son prénom et l'accès à son espace
      // client. Sinon, démarrage normal du chatbot.
      const existingUser = window.PotentielAuth ? await window.PotentielAuth.getCurrentUser() : null;
      if (existingUser && !hasStarted) {
        window.location.href = 'landing.html';
        return;
      }

      if (!hasStarted) {
        hasStarted = true;
        setTimeout(renderIntro, 500);
      }
    });
  }

});
