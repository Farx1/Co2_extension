/**
 * Track Sustainability - Popup Script
 */

// Variables globales
let carbonIntensityData = null;
let currentCountry = 'global_average';

/**
 * Initialiser le popup
 */
async function init() {
  try {
    // Charger les données d'intensité carbone
    const response = await fetch(chrome.runtime.getURL('data/carbon_intensity.json'));
    carbonIntensityData = await response.json();
    
    // Charger les préférences utilisateur
    const result = await chrome.storage.local.get(['selectedCountry']);
    if (result.selectedCountry) {
      currentCountry = result.selectedCountry;
      document.getElementById('country-select').value = currentCountry;
    }
    
    // Charger et afficher les statistiques
    await loadStats();
    
    // Masquer le loading, afficher le contenu
    document.getElementById('loading').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    
    // Configurer les event listeners
    setupEventListeners();
    
    // Rafraîchir les stats toutes les 2 secondes
    setInterval(loadStats, 2000);
    
    // Écouter les changements dans le storage pour se mettre à jour automatiquement
    // Note: Ce listener doit être déclaré au niveau global pour fonctionner même si le popup est fermé puis rouvert
    if (!window.tsStorageListenerSetup) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
          // Si les stats importantes changent, recharger immédiatement
          const hasRelevantChanges = changes.lastExchange || 
                                     changes.totalStats || 
                                     changes.conversationHistory ||
                                     changes.currentSession ||
                                     changes.dataResetTimestamp;
          
          if (hasRelevantChanges) {
            console.log('📊 Changements détectés dans le storage, rafraîchissement...', Object.keys(changes));
            
            // Rafraîchir immédiatement
            if (typeof loadStats === 'function') {
              loadStats();
              
              // Rafraîchir aussi après un court délai pour capturer les changements en cascade
              setTimeout(() => {
                if (typeof loadStats === 'function') {
                  loadStats();
                }
              }, 300);
            }
          }
        }
      });
      window.tsStorageListenerSetup = true;
      console.log('✓ Listener storage configuré');
    }
    
  } catch (error) {
    console.error('Erreur d\'initialisation:', error);
    document.getElementById('loading').innerHTML = '<p>❌ Erreur de chargement</p>';
  }
}

/**
 * Charger les statistiques depuis le storage
 */
async function loadStats() {
  try {
    const result = await chrome.storage.local.get([
      'lastExchange',
      'totalStats',
      'isActive',
      'conversationHistory'
    ]);
    
    // Récupérer le dernier échange (input actuel)
    const lastExchange = result.lastExchange || null;
    
    // Calculer les stats cumulées depuis l'historique
    const history = result.conversationHistory || [];
    let cumulativeStats = {
      requests: history.length,
      promptTokens: 0,
      responseTokens: 0,
      energyJoules: 0,
      co2Grams: 0
    };
    
    history.forEach(exchange => {
      cumulativeStats.promptTokens += exchange.prompt_token_length || exchange.promptTokens || 0;
      cumulativeStats.responseTokens += exchange.response_token_length || exchange.responseTokens || 0;
      // Utiliser les bons noms de champs (energy_consumption_llm_total et co2_grams)
      const energy = exchange.energy_consumption_llm_total || exchange.energyJoules || 0;
      const co2 = exchange.co2_grams || exchange.co2Grams || 0;
      cumulativeStats.energyJoules += energy;
      cumulativeStats.co2Grams += co2;
    });
    
    // Si on a un lastExchange qui n'est pas encore dans l'historique, l'inclure dans le calcul
    // (cela peut arriver si l'échange vient d'être traité mais pas encore ajouté à l'historique)
    if (lastExchange) {
      // Vérifier si le lastExchange est déjà dans l'historique (par timestamp ou ID)
      const lastExchangeInHistory = history.some(exchange => {
        return (exchange.timestamp === lastExchange.timestamp) ||
               (exchange.id && lastExchange.id && exchange.id === lastExchange.id) ||
               (exchange.promptTokens === lastExchange.promptTokens && 
                exchange.responseTokens === lastExchange.responseTokens &&
                Math.abs((exchange.timestamp || 0) - (lastExchange.timestamp || 0)) < 1000);
      });
      
      // Si le lastExchange n'est pas dans l'historique, l'ajouter au calcul
      if (!lastExchangeInHistory) {
        cumulativeStats.requests += 1;
        cumulativeStats.promptTokens += lastExchange.prompt_token_length || lastExchange.promptTokens || 0;
        cumulativeStats.responseTokens += lastExchange.response_token_length || lastExchange.responseTokens || 0;
        cumulativeStats.energyJoules += lastExchange.energyJoules || 0;
        cumulativeStats.co2Grams += lastExchange.co2Grams || 0;
      }
    }
    
    // Utiliser totalStats si disponible ET valide (non vide), sinon recalculer depuis l'historique
    const storedTotalStats = result.totalStats;
    let totalStats;
    
    if (storedTotalStats && 
        (storedTotalStats.requests > 0 || storedTotalStats.tokens > 0 || storedTotalStats.co2Grams > 0)) {
      // Utiliser totalStats si il contient des données
      totalStats = storedTotalStats;
    } else {
      // Recalculer depuis l'historique (plus fiable)
      totalStats = {
        requests: cumulativeStats.requests,
        tokens: cumulativeStats.promptTokens + cumulativeStats.responseTokens,
        co2Grams: cumulativeStats.co2Grams
      };
      
      // Si on a recalculé et que c'est différent, mettre à jour le storage
      if (history.length > 0 && (totalStats.requests > 0 || totalStats.tokens > 0 || totalStats.co2Grams > 0)) {
        chrome.storage.local.set({ totalStats });
      }
    }
    
    const isActive = result.isActive || false;
    
    // Mettre à jour le statut
    const statusEl = document.getElementById('status');
    if (isActive) {
      statusEl.className = 'status active';
      statusEl.textContent = '✅ Conversation active détectée';
    } else {
      statusEl.className = 'status inactive';
      statusEl.textContent = '⚠️ Aucune conversation détectée';
    }
    
    // Input actuel (dernier échange)
    if (lastExchange) {
      document.getElementById('current-prompt-tokens').textContent = (lastExchange.prompt_token_length || lastExchange.promptTokens || 0).toLocaleString();
      document.getElementById('current-response-tokens').textContent = (lastExchange.response_token_length || lastExchange.responseTokens || 0).toLocaleString();
      // Utiliser les bons noms de champs
      const currentEnergy = lastExchange.energy_consumption_llm_total || lastExchange.energyJoules || 0;
      const currentCO2 = lastExchange.co2_grams || lastExchange.co2Grams || 0;
      document.getElementById('current-energy').textContent = currentEnergy.toFixed(6);
      document.getElementById('current-co2').textContent = formatCO2(currentCO2);
      
      // Afficher la source de prédiction
      const predictionSource = lastExchange.predictionSource || 'local';
      const sourceText = predictionSource === 'watsonx' || predictionSource === 'deployed' ? '🤖 Watsonx' : 
                         predictionSource === 'local' ? '💻 Local' : 
                         predictionSource === 'server' ? '🖥️ Serveur' : '💻 Local';
      document.getElementById('current-prediction-source').textContent = sourceText;
    } else {
      document.getElementById('current-prompt-tokens').textContent = '0';
      document.getElementById('current-response-tokens').textContent = '0';
      document.getElementById('current-energy').textContent = '0.000000';
      document.getElementById('current-co2').textContent = '0.0000';
      document.getElementById('current-prediction-source').textContent = '-';
    }
    
    // Total cumulé - utiliser cumulativeStats si totalStats est vide ou a des valeurs à 0
    const finalTotalTokens = (totalStats.tokens && totalStats.tokens > 0) 
      ? totalStats.tokens 
      : (cumulativeStats.promptTokens + cumulativeStats.responseTokens);
    const finalTotalCO2 = (totalStats.co2Grams && totalStats.co2Grams > 0)
      ? totalStats.co2Grams
      : cumulativeStats.co2Grams;
    const finalTotalRequests = (totalStats.requests && totalStats.requests > 0)
      ? totalStats.requests
      : cumulativeStats.requests;
    
    const totalRequestsEl = document.getElementById('total-requests');
    const totalTokensEl = document.getElementById('total-tokens');
    const totalCo2El = document.getElementById('total-co2');
    
    if (totalRequestsEl) totalRequestsEl.textContent = finalTotalRequests.toLocaleString();
    if (totalTokensEl) totalTokensEl.textContent = finalTotalTokens.toLocaleString();
    if (totalCo2El) totalCo2El.textContent = formatCO2(finalTotalCO2);
    
    // Équivalence
    updateEquivalence(finalTotalCO2);
    
    // Envoyer les deux au modèle pour comparaison si on a des données
    if (lastExchange && history.length > 0) {
      await sendComparisonToModel(lastExchange, cumulativeStats);
    }
    
  } catch (error) {
    console.error('Erreur de chargement des stats:', error);
  }
}

/**
 * Envoyer l'input actuel et le cumulé au modèle pour comparaison
 */
async function sendComparisonToModel(lastExchange, cumulativeStats) {
  try {
    // Envoyer la demande de comparaison au background script
    // Le background a accès à WatsonxService
    const response = await chrome.runtime.sendMessage({
      type: 'COMPARE_PREDICTIONS',
      data: {
        lastExchange: lastExchange,
        cumulativeStats: cumulativeStats
      }
    });
    
    if (response && response.success) {
      console.log('📊 Comparaison effectuée:', {
        currentPrediction: response.currentPrediction,
        cumulativePrediction: response.cumulativePrediction,
        difference: response.difference,
        percentDiff: response.percentDiff
      });
    } else {
      console.log('⚠️ Comparaison non disponible:', response?.error || 'Service non disponible');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la comparaison:', error);
  }
}

/**
 * Formater le CO₂ pour l'affichage (gère les très petites valeurs)
 */
function formatCO2(co2Grams) {
  if (co2Grams === 0 || isNaN(co2Grams)) {
    return '0.0000';
  }
  
  // Si très petit (< 0.0001), utiliser la notation scientifique
  if (co2Grams < 0.0001) {
    return co2Grams.toExponential(2);
  }
  
  // Sinon, afficher avec 4 décimales
  return co2Grams.toFixed(4);
}

/**
 * Mettre à jour l'équivalence CO₂
 */
function updateEquivalence(co2Grams) {
  const equivalenceEl = document.getElementById('equivalence');
  
  // Seuils ajustés pour les très petites valeurs
  if (co2Grams < 0.00001) {
    equivalenceEl.textContent = '-';
    return;
  }
  
  // Équivalences approximatives (ajustées pour les très petites valeurs)
  const co2Mg = co2Grams * 1000; // Convertir en milligrammes
  
  if (co2Grams < 0.0001) {
    // Très petit : en microgrammes ou notation scientifique
    const microGrams = (co2Grams * 1000000).toFixed(2);
    equivalenceEl.textContent = `${microGrams} µg CO₂`;
  } else if (co2Grams < 0.001) {
    // Moins d'1mg : en secondes de respiration
    const breathingSeconds = (co2Grams * 1000 / (0.2 / 60)).toFixed(0); // ~0.2g/min = 0.0033g/sec
    equivalenceEl.textContent = `${breathingSeconds} sec de respiration`;
  } else if (co2Grams < 0.01) {
    // Moins de 10mg : en milligrammes
    const mg = (co2Grams * 1000).toFixed(2);
    equivalenceEl.textContent = `${mg} mg CO₂`;
  } else if (co2Grams < 0.1) {
    // Moins de 100mg : en recherches Google
    const googleSearches = (co2Grams / 0.2).toFixed(1); // ~0.2g CO2/recherche
    equivalenceEl.textContent = `${googleSearches} recherches Google`;
  } else if (co2Grams < 1) {
    // Moins d'1g : en emails
    const emails = (co2Grams / 4).toFixed(0); // ~4g CO2/email
    equivalenceEl.textContent = `${emails} emails envoyés`;
  } else if (co2Grams < 10) {
    // Moins de 10g : en km en voiture
    const carKm = (co2Grams / 0.12).toFixed(2); // ~120g CO2/km
    equivalenceEl.textContent = `${carKm} km en voiture`;
  } else {
    // Plus de 10g : en arbres nécessaires
    const co2Kg = co2Grams / 1000;
    const trees = (co2Kg / 21).toFixed(2); // 1 arbre absorbe ~21kg CO2/an
    equivalenceEl.textContent = `${trees} arbres/an nécessaires`;
  }
}

/**
 * Configurer les event listeners
 */
function setupEventListeners() {
  // Bouton dashboard
  const dashboardBtn = document.getElementById('dashboard-btn');
  if (dashboardBtn) {
    dashboardBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
  }
  // Changement de pays
  document.getElementById('country-select').addEventListener('change', async (e) => {
    currentCountry = e.target.value;
    
    // Sauvegarder la préférence
    await chrome.storage.local.set({ selectedCountry: currentCountry });
    
    // Recalculer les stats avec le nouveau mix énergétique
    await recalculateStats();
    
    // Recharger les stats
    await loadStats();
  });
  
  // Bouton scan
  const scanBtn = document.getElementById('scan-btn');
  if (scanBtn) {
    let lastClickTime = 0;
    
    scanBtn.addEventListener('click', async (e) => {
      // Détecter le double-clic (dans les 500ms)
      const currentTime = Date.now();
      const timeSinceLastClick = currentTime - lastClickTime;
      lastClickTime = currentTime;
      
      if (timeSinceLastClick < 500) {
        // Double-clic détecté - forcer le re-scan
        scanBtn.dataset.doubleClicked = 'true';
        console.log('🔄 Double-clic détecté - force rescan activé');
      }
      scanBtn.disabled = true;
      scanBtn.textContent = '⏳ Scan en cours...';
      
      try {
        // Obtenir l'onglet actif
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
          alert('⚠️ Impossible d\'accéder à l\'onglet actif');
          scanBtn.disabled = false;
          scanBtn.textContent = '🔍 Scanner la conversation actuelle';
          return;
        }
        
        // Vérifier que l'onglet est sur une page supportée
        const supportedDomains = ['chatgpt.com', 'claude.ai', 'gemini.google.com'];
        const isSupported = supportedDomains.some(domain => tab.url && tab.url.includes(domain));
        
        if (!isSupported) {
          alert('⚠️ Cette page n\'est pas supportée. Veuillez ouvrir ChatGPT, Claude ou Gemini.');
          scanBtn.disabled = false;
          scanBtn.textContent = '🔍 Scanner la conversation actuelle';
          return;
        }
        
        // Vérifier si les données ont été réinitialisées récemment
        // Si oui, forcer le re-scan de tous les messages
        const storageResult = await chrome.storage.local.get(['dataResetTimestamp', 'conversationHistory', 'lastExchange']);
        const dataResetTimestamp = storageResult.dataResetTimestamp || 0;
        const history = storageResult.conversationHistory || [];
        const lastExchange = storageResult.lastExchange;
        const now = Date.now();
        
        // Forcer le re-scan si :
        // 1. Les données ont été réinitialisées dans les 10 dernières minutes (augmenté pour être plus permissif)
        // 2. L'historique est vide
        // 3. Il n'y a pas de dernier échange (données réinitialisées)
        // 4. Le bouton a été double-cliqué (détection via un attribut data)
        // 5. Le totalStats est vide ou à 0 alors que l'historique contient des données (incohérence)
        const wasDoubleClicked = scanBtn.dataset.doubleClicked === 'true';
        const totalStatsCheck = await chrome.storage.local.get(['totalStats']);
        const totalStatsEmpty = !totalStatsCheck.totalStats || 
                                (totalStatsCheck.totalStats.requests === 0 && 
                                 totalStatsCheck.totalStats.tokens === 0 && 
                                 totalStatsCheck.totalStats.co2Grams === 0);
        const hasHistoryButNoStats = history.length > 0 && totalStatsEmpty;
        
        // Toujours forcer le re-scan si :
        // 1. Double-clic explicite
        // 2. Réinitialisation récente (< 10 min)
        // 3. Pas de données (historique vide OU pas de lastExchange)
        // 4. Incohérence (historique mais pas de stats)
        // 5. Le totalStats est à 0 alors qu'on a un lastExchange (données réinitialisées mais lastExchange pas encore nettoyé)
        const hasLastExchangeButNoStats = lastExchange && totalStatsEmpty;
        
        const forceRescan = wasDoubleClicked ||
                           (now - dataResetTimestamp < 10 * 60 * 1000) || 
                           history.length === 0 || 
                           !lastExchange ||
                           hasHistoryButNoStats ||
                           hasLastExchangeButNoStats;
        
        // Réinitialiser le flag de double-clic
        if (wasDoubleClicked) {
          delete scanBtn.dataset.doubleClicked;
        }
        
        if (forceRescan) {
          console.log('🔄 Force rescan activé - tous les messages seront re-traités');
          scanBtn.textContent = '⏳ Scan forcé en cours...';
        } else {
          console.log('ℹ️ Scan normal (messages déjà traités seront ignorés). Double-cliquez pour forcer le re-scan.');
        }
        
        // Essayer d'envoyer le message directement
        // Ne pas injecter manuellement car le manifest injecte déjà le script automatiquement
        // Si ça échoue, c'est que la page n'est pas supportée ou pas chargée
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'SCAN_CONVERSATION',
          forceRescan: forceRescan
        });
        
        if (response && response.success) {
          const scannedCount = response.scanned || 0;
          if (scannedCount > 0) {
            scanBtn.textContent = `✅ ${scannedCount} message(s) scanné(s)`;
          } else {
            scanBtn.textContent = '✅ Scan terminé';
          }
          
          // Recharger les stats immédiatement puis plusieurs fois pour s'assurer que tout est à jour
          // (le traitement des messages peut prendre un peu de temps)
          await loadStats(); // Premier rafraîchissement immédiat
          
          // Rafraîchir plusieurs fois pour capturer tous les changements
          setTimeout(async () => {
            await loadStats();
          }, 300);
          
          setTimeout(async () => {
            await loadStats();
          }, 800);
          
          setTimeout(async () => {
            await loadStats();
          }, 1500);
          
          setTimeout(async () => {
            await loadStats(); // Dernier rafraîchissement
            scanBtn.disabled = false;
            scanBtn.textContent = '🔍 Scanner la conversation actuelle';
          }, 2500);
        } else {
          alert('⚠️ ' + (response?.error || 'Impossible de scanner la conversation. Assurez-vous d\'être sur ChatGPT, Claude ou Gemini.'));
          scanBtn.disabled = false;
          scanBtn.textContent = '🔍 Scanner la conversation actuelle';
        }
      } catch (error) {
        console.error('Erreur scan:', error);
        alert('⚠️ Erreur lors du scan: ' + error.message + '\n\nAssurez-vous d\'être sur une page ChatGPT, Claude ou Gemini et que la page est complètement chargée.');
        scanBtn.disabled = false;
        scanBtn.textContent = '🔍 Scanner la conversation actuelle';
      }
    });
  }
  
  // Bouton reset
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (confirm('Voulez-vous vraiment réinitialiser toutes les statistiques ? (Input actuel + Total cumulé)')) {
        resetBtn.disabled = true;
        resetBtn.textContent = '⏳ Réinitialisation...';
        
        try {
          // Envoyer un message au background pour réinitialiser TOUT
          await chrome.runtime.sendMessage({
            type: 'RESET_ALL_STATS'
          });
          
          // Recharger les stats immédiatement puis plusieurs fois pour s'assurer que tout est à jour
          await loadStats(); // Premier rafraîchissement immédiat
          
          // Rafraîchir plusieurs fois pour capturer tous les changements
          setTimeout(async () => {
            await loadStats();
          }, 200);
          
          setTimeout(async () => {
            await loadStats();
          }, 500);
          
          setTimeout(async () => {
            await loadStats();
          }, 1000);
          
          setTimeout(async () => {
            await loadStats(); // Dernier rafraîchissement
            resetBtn.disabled = false;
            resetBtn.textContent = '🔄 Réinitialiser les statistiques';
          }, 1500);
        } catch (error) {
          console.error('Erreur réinitialisation:', error);
          resetBtn.disabled = false;
          resetBtn.textContent = '🔄 Réinitialiser les statistiques';
          alert('⚠️ Erreur lors de la réinitialisation: ' + error.message);
        }
      }
    });
  }
  
  // Bouton simulation
  const simulateBtn = document.getElementById('simulate-btn');
  if (simulateBtn) {
    simulateBtn.addEventListener('click', async () => {
      if (confirm('🎲 Voulez-vous générer des données simulées sur 1 an ?\n\nCela ajoutera environ 3000 échanges avec des variations mensuelles réalistes.\n\nLes données existantes seront conservées.')) {
        simulateBtn.disabled = true;
        simulateBtn.textContent = '⏳ Simulation en cours...';
        
        try {
          console.log('📤 Envoi message SIMULATE_ONE_YEAR...');
          
          // Vérifier que le service worker est disponible
          if (!chrome.runtime?.id) {
            throw new Error('Service worker non disponible. Veuillez recharger l\'extension.');
          }
          
          const response = await chrome.runtime.sendMessage({
            type: 'SIMULATE_ONE_YEAR'
          });
          
          console.log('📥 Réponse reçue:', response);
          
          if (!response) {
            throw new Error('Aucune réponse du service worker. Le service worker peut être inactif. Essayez de recharger l\'extension.');
          }
          
          if (response && response.success) {
            simulateBtn.textContent = '✅ Simulation terminée !';
            
            // Afficher un message de succès
            alert(`✅ Simulation terminée avec succès !\n\n` +
                  `📊 ${response.exchangesAdded} échanges ajoutés\n` +
                  `📈 Total: ${response.totalExchanges} échanges\n` +
                  `⚡ Énergie totale: ${(response.totalEnergy / 3600000).toFixed(4)} kWh\n` +
                  `🌍 CO₂ total: ${(response.totalCO2 / 1000).toFixed(4)} kg\n\n` +
                  `Rechargez le dashboard pour voir les graphiques !`);
            
            // Recharger les stats
            await loadStats();
            
            setTimeout(() => {
              simulateBtn.textContent = '🎲 Simuler 1 an de données';
              simulateBtn.disabled = false;
            }, 3000);
          } else {
            const errorMsg = response?.error || 'Erreur inconnue lors de la simulation';
            console.error('❌ Erreur simulation:', errorMsg, response);
            throw new Error(errorMsg);
          }
        } catch (error) {
          console.error('❌ Erreur simulation complète:', error);
          simulateBtn.textContent = '❌ Erreur';
          const errorMessage = error.message || 'Erreur inconnue. Vérifiez la console pour plus de détails.';
          alert('❌ Erreur lors de la simulation: ' + errorMessage);
          setTimeout(() => {
            simulateBtn.textContent = '🎲 Simuler 1 an de données';
            simulateBtn.disabled = false;
          }, 2000);
        }
      }
    });
  }
}

/**
 * Recalculer les statistiques avec le nouveau mix énergétique
 */
async function recalculateStats() {
  try {
    const result = await chrome.storage.local.get(['conversationHistory']);
    const history = result.conversationHistory || [];
    
    if (history.length === 0) return;
    
    // Obtenir l'intensité carbone
    const intensity = carbonIntensityData.countries[currentCountry]?.intensity || 480;
    
    // Recalculer toutes les entrées
    let totalCO2 = 0;
    
    for (const entry of history) {
      // Convertir l'énergie en CO₂ avec le nouveau mix
      const energyKwh = entry.energyJoules / 3600000;
      const co2Grams = energyKwh * intensity;
      totalCO2 += co2Grams;
    }
    
    // Mettre à jour les stats
    const currentResult = await chrome.storage.local.get(['currentSession', 'totalStats']);
    
    if (currentResult.currentSession) {
      const energyKwh = currentResult.currentSession.energyJoules / 3600000;
      currentResult.currentSession.co2Grams = energyKwh * intensity;
    }
    
    if (currentResult.totalStats) {
      currentResult.totalStats.co2Grams = totalCO2;
    }
    
    await chrome.storage.local.set({
      currentSession: currentResult.currentSession,
      totalStats: currentResult.totalStats
    });
    
  } catch (error) {
    console.error('Erreur de recalcul:', error);
  }
}

// Initialiser au chargement
document.addEventListener('DOMContentLoaded', init);
