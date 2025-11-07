/**
 * Dashboard Analytics - Logique principale
 */

// Variables globales
let charts = {};
let datasetData = null;

// Paliers de référence pour la consommation énergétique (kWh/mois)
// Basés sur des estimations moyennes pour différents types d'utilisateurs d'IA
/**
 * Formater l'énergie avec l'unité adaptée automatiquement
 */
function formatEnergyAdaptive(energyJoules) {
  if (!energyJoules || energyJoules === 0 || isNaN(energyJoules)) {
    return { value: '0', unit: 'J', display: '0 J' };
  }
  
  // Convertir en différentes unités
  const energyKwh = energyJoules / 3600000;
  const energyKj = energyJoules / 1000;
  const energyMj = energyJoules / 1000000;
  
  // Choisir l'unité la plus appropriée (ajouter µWh et nWh pour les très petites valeurs)
  if (energyKwh >= 0.001) {
    // >= 1 Wh : utiliser kWh
    return {
      value: energyKwh.toFixed(4),
      unit: 'kWh',
      display: `${energyKwh.toFixed(4)} kWh`,
      joules: energyJoules
    };
  } else if (energyKwh >= 0.000001) {
    // >= 1 mWh : utiliser Wh
    const wh = energyKwh * 1000;
    return {
      value: wh.toFixed(4),
      unit: 'Wh',
      display: `${wh.toFixed(4)} Wh`,
      joules: energyJoules
    };
  } else if (energyKwh >= 0.000000001) {
    // >= 1 µWh : utiliser mWh
    const mwh = energyKwh * 1000000;
    return {
      value: mwh.toFixed(4),
      unit: 'mWh',
      display: `${mwh.toFixed(4)} mWh`,
      joules: energyJoules
    };
  } else if (energyKwh >= 0.000000000001) {
    // >= 1 nWh : utiliser µWh
    const uwh = energyKwh * 1000000000;
    return {
      value: uwh.toFixed(4),
      unit: 'µWh',
      display: `${uwh.toFixed(4)} µWh`,
      joules: energyJoules
    };
  } else if (energyKj >= 0.1) {
    // >= 100 J : utiliser kJ (fallback si très petit en kWh mais grand en J)
    return {
      value: energyKj.toFixed(2),
      unit: 'kJ',
      display: `${energyKj.toFixed(2)} kJ`,
      joules: energyJoules
    };
  } else if (energyJoules >= 1) {
    // >= 1 J : utiliser J
    return {
      value: energyJoules.toFixed(2),
      unit: 'J',
      display: `${energyJoules.toFixed(2)} J`,
      joules: energyJoules
    };
  } else if (energyMj >= 0.001) {
    // >= 1 mJ : utiliser mJ
    const mj = energyJoules * 1000;
    return {
      value: mj.toFixed(2),
      unit: 'mJ',
      display: `${mj.toFixed(2)} mJ`,
      joules: energyJoules
    };
  } else {
    // Très petit : utiliser nWh ou µJ selon le contexte
    if (energyKwh > 0) {
      // Si on a une valeur en kWh (même très petite), utiliser nWh
      const nwh = energyKwh * 1000000000000;
      return {
        value: nwh.toFixed(4),
        unit: 'nWh',
        display: `${nwh.toFixed(4)} nWh`,
        joules: energyJoules
      };
    } else {
      // Sinon utiliser µJ
      const uj = energyJoules * 1000000;
      return {
        value: uj.toFixed(2),
        unit: 'µJ',
        display: `${uj.toFixed(2)} µJ`,
        joules: energyJoules
      };
    }
  }
}

const REFERENCE_TIERS = {
  'personne_normale': {
    name: '👤 Personne Normale',
    description: 'Utilisation occasionnelle d\'IA (quelques requêtes par semaine)',
    monthly_kWh: 0.5, // ~15-20 requêtes/mois, ~0.025 kWh par requête
    color: '#4CAF50'
  },
  'developpeur': {
    name: '💻 Développeur',
    description: 'Utilisation régulière pour le développement (plusieurs requêtes par jour)',
    monthly_kWh: 2.5, // ~100-150 requêtes/mois
    color: '#2196F3'
  },
  'entreprise': {
    name: '🏢 Entreprise',
    description: 'Utilisation intensive pour des projets professionnels (dizaines de requêtes par jour)',
    monthly_kWh: 10.0, // ~400-500 requêtes/mois
    color: '#FF9800'
  },
  'power_user': {
    name: '⚡ Power User',
    description: 'Utilisation très intensive (centaines de requêtes par jour)',
    monthly_kWh: 30.0, // ~1000+ requêtes/mois
    color: '#F44336'
  }
};

/**
 * Charger les données locales depuis chrome.storage et les convertir au format datasetData
 */
async function loadLocalDatasetData() {
  try {
    const result = await chrome.storage.local.get(['conversationHistory', 'watsonxSyncQueue']);
    const history = result.conversationHistory || [];
    const queue = result.watsonxSyncQueue || [];
    
    console.log('📊 Chargement données locales:', {
      historyLength: history.length,
      queueLength: queue.length,
      firstHistoryItem: history[0] ? Object.keys(history[0]) : null,
      sampleHistoryItem: history[0]
    });
    
    // Fonction simple de prédiction d'énergie locale (fallback)
    function predictEnergyLocalSimple(params) {
      const { modelName, promptTokens, responseTokens } = params;
      
      // Coefficients simplifiés basés sur la taille du modèle (valeurs mises à jour pour être réalistes)
      const modelSizes = {
        'gpt-4': { base: 2.0, perToken: 0.015 },
        'gpt-4-turbo': { base: 1.5, perToken: 0.012 },
        'gpt-3.5': { base: 0.5, perToken: 0.003 },
        'gpt-3.5-turbo': { base: 0.5, perToken: 0.003 },
        'claude-3-opus': { base: 3.0, perToken: 0.018 },
        'claude-3-sonnet': { base: 1.2, perToken: 0.010 },
        'claude-3-haiku': { base: 0.6, perToken: 0.005 },
        'gemini-pro': { base: 0.8, perToken: 0.008 },
        'default': { base: 0.8, perToken: 0.008 }
      };
      
      // Détecter la taille du modèle
      let modelData = modelSizes.default;
      for (const [key, value] of Object.entries(modelSizes)) {
        if (modelName && modelName.toLowerCase().includes(key.toLowerCase())) {
          modelData = value;
          break;
        }
      }
      
      // Calcul simplifié: base + (tokens × énergie_par_token)
      // Plus de poids aux tokens de réponse
      const promptWeight = 0.3;
      const responseWeight = 1.0;
      
      const energy = modelData.base + 
                     (promptTokens * modelData.perToken * promptWeight) + 
                     (responseTokens * modelData.perToken * responseWeight);
      
      return Math.max(0, energy);
    }
    
    // Importer la fonction de prédiction d'énergie si disponible
    let predictEnergyLocal = null;
    if (typeof predictEnergy === 'function') {
      predictEnergyLocal = predictEnergy;
    } else if (window.predictEnergy) {
      predictEnergyLocal = window.predictEnergy;
    } else {
      // Utiliser la fonction simple en fallback
      predictEnergyLocal = predictEnergyLocalSimple;
    }
    
    // Combiner les deux sources et convertir au format attendu
    // Utiliser energy_consumption_llm_total en priorité, puis energyJoules
    // Convertir en Promise.all pour gérer les prédictions asynchrones
    const allDataPromises = [...history, ...queue].map(async (exchange) => {
      let energyJoules = parseFloat(exchange.energy_consumption_llm_total) || parseFloat(exchange.energyJoules) || 0;
      let co2Grams = parseFloat(exchange.co2_grams) || parseFloat(exchange.co2Grams) || 0;
      
      // Si pas d'énergie ou énergie très petite (< 0.01 J) mais qu'on a des tokens, recalculer
      if (energyJoules === 0 || energyJoules < 0.01) {
        const promptTokens = exchange.prompt_token_length || exchange.promptTokens || 0;
        const responseTokens = exchange.response_token_length || exchange.responseTokens || 0;
        const model = exchange.model_name || exchange.model || 'gpt-4';
        const totalDuration = exchange.total_duration || exchange.totalDuration || null;
        const responseDuration = exchange.response_duration || exchange.responseDuration || null;
        const wordCount = exchange.word_count || exchange.wordCount || null;
        const readingTime = exchange.reading_time || exchange.readingTime || null;
        
        if (promptTokens > 0 || responseTokens > 0) {
          try {
            // PRIORITÉ: Utiliser la fonction predictEnergy complète (Watsonx → serveur local → modèle local)
            // Cette fonction gère automatiquement le mode de prédiction configuré
            if (typeof predictEnergy === 'function') {
              // Vérifier si on a toutes les données pour Watsonx/serveur local
              const hasAllData = totalDuration !== null && 
                                 responseDuration !== null && 
                                 wordCount !== null && 
                                 readingTime !== null &&
                                 !isNaN(totalDuration) && 
                                 !isNaN(responseDuration) && 
                                 !isNaN(wordCount) && 
                                 !isNaN(readingTime);
              
              if (hasAllData) {
                // Utiliser predictEnergy avec toutes les données (essaiera Watsonx, serveur local, puis modèle local)
                energyJoules = await predictEnergy(
                  model,
                  promptTokens,
                  responseTokens,
                  totalDuration,
                  responseDuration,
                  wordCount,
                  readingTime
                );
                console.log('✅ Énergie recalculée avec predictEnergy (Watsonx/serveur/local):', {
                  id: exchange.id,
                  model,
                  energyJoules: energyJoules.toFixed(8),
                  source: 'predictEnergy (full)'
                });
              } else {
                // Données incomplètes, utiliser le modèle local simple
                if (predictEnergyLocal) {
                  energyJoules = predictEnergyLocal({
                    modelName: model,
                    promptTokens: promptTokens,
                    responseTokens: responseTokens
                  });
                  console.log('✅ Énergie recalculée avec modèle local (données incomplètes):', {
                    id: exchange.id,
                    model,
                    energyJoules: energyJoules.toFixed(8),
                    source: 'local (incomplete data)'
                  });
                }
              }
            } else if (predictEnergyLocal) {
              // Fallback vers modèle local simple
              energyJoules = predictEnergyLocal({
                modelName: model,
                promptTokens: promptTokens,
                responseTokens: responseTokens
              });
              console.log('✅ Énergie recalculée avec modèle local (fallback):', {
                id: exchange.id,
                model,
                energyJoules: energyJoules.toFixed(8),
                source: 'local (fallback)'
              });
            }
            
            // Recalculer CO₂ si nécessaire
            if (energyJoules > 0 && co2Grams === 0) {
              const energyKwh = energyJoules / 3600000;
              const globalIntensity = 480; // gCO₂/kWh
              co2Grams = energyKwh * globalIntensity;
            }
          } catch (error) {
            console.warn('⚠️ Erreur recalcul énergie:', error);
            // En cas d'erreur, essayer le modèle local simple
            if (predictEnergyLocal) {
              try {
                energyJoules = predictEnergyLocal({
                  modelName: model,
                  promptTokens: promptTokens,
                  responseTokens: responseTokens
                });
                if (energyJoules > 0 && co2Grams === 0) {
                  const energyKwh = energyJoules / 3600000;
                  const globalIntensity = 480;
                  co2Grams = energyKwh * globalIntensity;
                }
              } catch (fallbackError) {
                console.warn('⚠️ Erreur même avec modèle local:', fallbackError);
              }
            }
          }
        }
      }
      
      return {
        model_name: exchange.model_name || exchange.model || 'unknown',
        hardware_type: exchange.hardware_type || 'unknown',
        prompt_token_length: exchange.prompt_token_length || exchange.promptTokens || 0,
        response_token_length: exchange.response_token_length || exchange.responseTokens || 0,
        total_duration: exchange.total_duration || exchange.totalDuration || 0,
        response_duration: exchange.response_duration || exchange.responseDuration || 0,
        word_count: exchange.word_count || exchange.wordCount || 0,
        reading_time: exchange.reading_time || exchange.readingTime || 0,
        energy_consumption_llm_total: energyJoules,
        energy_consumption_llm_cpu: exchange.energyCpu || 0,
        energy_consumption_llm_gpu: exchange.energyGpu || 0,
        co2_grams: co2Grams,
        platform: exchange.platform || 'unknown',
        timestamp: exchange.timestamp || (exchange.id ? parseInt(exchange.id.split('-')[1]) : Date.now())
      };
    });
    
    // Attendre que toutes les prédictions asynchrones soient terminées
    const allData = await Promise.all(allDataPromises);
    
    console.log('📊 Données converties:', {
      totalItems: allData.length,
      totalEnergy: allData.reduce((sum, d) => sum + (d.energy_consumption_llm_total || 0), 0),
      totalCO2: allData.reduce((sum, d) => sum + (d.co2_grams || 0), 0),
      sampleItem: allData[0]
    });
    
    return allData;
  } catch (error) {
    console.error('Erreur chargement données locales:', error);
    return [];
  }
}

// Exposer la fonction globalement pour qu'elle soit accessible depuis dashboard-enhancements.js
window.loadLocalDatasetData = loadLocalDatasetData;

let carbonIntensityData = null;

// Les scripts Watsonx sont maintenant chargés directement dans dashboard.html
// Vérifier qu'ils sont disponibles après le chargement de la page
(function checkWatsonxScripts() {
  // Attendre que tous les scripts soient chargés
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(checkWatsonxScripts, 100);
    });
    return;
  }
  
  // Vérifier après un court délai pour laisser les scripts s'exécuter
  setTimeout(() => {
    if (window.watsonxConfig) {
      console.log('✓ watsonx-config.js chargé');
    } else {
      console.warn('⚠️ watsonx-config.js non disponible');
    }
    
    if (window.WatsonxService) {
      console.log('✓ watsonx-service.js chargé et WatsonxService disponible');
    } else {
      console.warn('⚠️ watsonx-service.js chargé mais WatsonxService non disponible');
      // Attendre encore un peu
      setTimeout(() => {
        if (window.WatsonxService) {
          console.log('✓ WatsonxService disponible après attente supplémentaire');
        } else {
          console.error('❌ WatsonxService toujours non disponible');
          console.error('Vérifiez la console pour des erreurs dans watsonx-service.js');
        }
      }, 2000);
    }
  }, 500);
})();

// Initialisation
// Vérifier si le DOM est déjà chargé (car dashboard.js peut être chargé après DOMContentLoaded)
async function initDashboard() {
  console.log('🌱 Dashboard initialisé');
  
  // Attendre que WatsonxService soit disponible
  for (let i = 0; i < 20; i++) {
    await new Promise(resolve => setTimeout(resolve, 200));
    if (window.WatsonxService) {
      console.log('✓ Scripts Watsonx chargés, service disponible');
      console.log('✓ Méthodes disponibles:', Object.keys(window.WatsonxService));
      break;
    } else if (i === 19) {
      console.error('❌ WatsonxService toujours non disponible après 20 tentatives');
      console.error('Vérifiez la console pour des erreurs dans watsonx-service.js');
    }
  }
  
  // Charger les données d'intensité carbone
  try {
    const response = await fetch(chrome.runtime.getURL('data/carbon_intensity.json'));
    carbonIntensityData = await response.json();
    console.log('✓ Données carbone chargées');
  } catch (error) {
    console.error('❌ Erreur chargement carbone:', error);
  }
  
  // Charger la configuration Watsonx
  await loadConfig();
  
  // Ne plus charger de datasets - on utilise uniquement le modèle déployé pour les prédictions
  // Les données sont collectées localement et peuvent être utilisées pour tester le modèle
  
  // Vérifier si Watsonx est configuré et déclencher automatiquement le test d'authentification
  const configResult = await chrome.storage.local.get(['watsonxConfig']);
  if (configResult.watsonxConfig && 
      configResult.watsonxConfig.apiKey && 
      configResult.watsonxConfig.projectId && 
      configResult.watsonxConfig.deploymentId) {
    console.log('🔄 Watsonx configuré, déclenchement automatique du test d\'authentification...');
    // Attendre un peu que tout soit initialisé
    setTimeout(async () => {
      await testWatsonxConnection();
    }, 1000);
  }
  
  // Ajouter les event listeners pour les onglets (plus robuste que onclick)
  setupTabListeners();
  
  // Ajouter les event listeners pour les boutons de configuration
  setupConfigButtons();
  
  // Ajouter l'event listener pour le bouton de comparaison
  setupCompareButton();
  
  // Ajouter les event listeners pour les prédictions
  setupPredictionsButtons();
  
  // Configurer le toggle de mode de prédiction
  setupPredictionModeToggle();
  
  // Écouter les changements dans chrome.storage pour mettre à jour le dashboard en temps réel
  setupRealtimeUpdates();
  
  // Écouter les messages du background pour les mises à jour automatiques
  setupMessageListener();
  
  // S'assurer que l'onglet overview est visible par défaut
  const overviewTab = document.getElementById('overview');
  if (overviewTab) {
    overviewTab.classList.add('active');
    overviewTab.style.display = 'block';
    overviewTab.style.visibility = 'visible';
    // Charger les données de l'onglet overview au démarrage
    loadOverview();
  }
  
  // Vérifier que l'onglet config existe et est accessible
  const configTab = document.getElementById('config');
  const configNavTab = document.querySelector('.nav-tab[data-tab="config"]');
  if (configTab && configNavTab) {
    console.log('✓ Onglet config trouvé dans le DOM');
    console.log('✓ Nav-tab config trouvé:', configNavTab);
  } else {
    console.error('❌ Onglet config ou nav-tab config non trouvé');
    console.error('configTab:', configTab);
    console.error('configNavTab:', configNavTab);
  }
}

// Exécuter l'initialisation immédiatement si le DOM est déjà chargé, sinon attendre DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboard);
} else {
  // DOM déjà chargé, exécuter immédiatement
  initDashboard();
}

/**
 * Configurer les boutons de configuration
 */
function setupConfigButtons() {
  // Bouton Sauvegarder
  const saveBtn = document.getElementById('btn-save-config');
  if (saveBtn) {
    saveBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('💾 Clic sur Sauvegarder Configuration');
      await saveWatsonxConfigDashboard();
    });
  }
  
  // Bouton Tester
  const testBtn = document.getElementById('btn-test-connection');
  if (testBtn) {
    testBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔍 Clic sur Tester la Connexion');
      await testWatsonxConnection();
    });
  }
  
  // Bouton Simulation
  const simulateBtn = document.getElementById('btn-simulate-data');
  if (simulateBtn) {
    simulateBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🎲 Clic sur Simuler 1 an de données');
      
      if (confirm('🎲 Voulez-vous générer des données simulées sur 1 an ?\n\n' +
                  'Cela ajoutera environ 3000 échanges avec des variations mensuelles réalistes.\n\n' +
                  'Les données existantes seront conservées.')) {
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
            showStatus(
              `✅ Simulation terminée avec succès !\n\n` +
              `📊 ${response.exchangesAdded} échanges ajoutés\n` +
              `📈 Total: ${response.totalExchanges} échanges\n` +
              `⚡ Énergie totale: ${(response.totalEnergy / 3600000).toFixed(4)} kWh\n` +
              `🌍 CO₂ total: ${(response.totalCO2 / 1000).toFixed(4)} kg\n\n` +
              `Rechargez les onglets pour voir les graphiques !`,
              'success',
              'config-status'
            );
            
            // Recharger les données après un court délai
            setTimeout(async () => {
              await loadLocalDatasetData();
              await loadOverview();
              // Recharger aussi les autres onglets si nécessaire
              const currentTab = document.querySelector('.nav-tab.active')?.getAttribute('data-tab');
              if (currentTab === 'compare') {
                if (typeof window.loadRecentPromptsComparison === 'function') {
                  await window.loadRecentPromptsComparison();
                }
              }
            }, 1000);
            
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
          showStatus('❌ Erreur lors de la simulation: ' + errorMessage, 'error', 'config-status');
          setTimeout(() => {
            simulateBtn.textContent = '🎲 Simuler 1 an de données';
            simulateBtn.disabled = false;
          }, 2000);
        }
      }
    });
  }
  
  // Bouton Lister - SUPPRIMÉ (plus de datasets)
  
  // Bouton Synchroniser (si présent)
  const syncBtn = document.getElementById('btn-sync-data');
  if (syncBtn) {
    syncBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('🔄 Clic sur Synchroniser les Données');
      await syncQueueToWatsonx();
    });
  }
  
  console.log('✓ Boutons de configuration configurés');
}

/**
 * Configurer les event listeners pour les onglets
 */
function setupTabListeners() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    // Enlever l'ancien onclick si présent
    tab.removeAttribute('onclick');
    
    // Ajouter un event listener
    tab.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Extraire le nom de l'onglet depuis l'attribut data-tab
      const tabName = this.getAttribute('data-tab');
      
      if (tabName) {
        console.log(`🖱️ Clic sur onglet: ${tabName}`);
        switchTab(tabName, this);
      } else {
        console.error('❌ Attribut data-tab manquant sur l\'onglet:', this);
      }
    });
  });
  
  console.log(`✓ ${document.querySelectorAll('.nav-tab').length} onglets configurés`);
}

/**
 * Charger un script dynamiquement
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    // Vérifier si le script est déjà chargé
    const existingScript = document.querySelector(`script[src="${src}"]`);
    if (existingScript) {
      console.log('✓ Script déjà chargé:', src);
      // Attendre un peu et vérifier si le service est disponible
      setTimeout(() => {
        if (src.includes('watsonx-service.js') && window.WatsonxService) {
          console.log('✓ WatsonxService disponible après vérification');
          resolve();
        } else if (src.includes('watsonx-service.js')) {
          // Le script est chargé mais le service n'est pas disponible
          // Attendre plus longtemps - le script peut prendre du temps à s'exécuter
          console.log('⚠️ Script chargé mais service non disponible, attente supplémentaire...');
          setTimeout(() => {
            if (window.WatsonxService) {
              console.log('✓ WatsonxService disponible après attente');
              resolve();
            } else {
              console.error('❌ WatsonxService toujours non disponible');
              console.error('Vérifiez la console pour des erreurs dans watsonx-service.js');
              // Ne pas rejeter, juste résoudre pour continuer
              resolve();
            }
          }, 2000);
        } else {
          resolve();
        }
      }, 200);
      return;
    }
    
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      console.log('✓ Script chargé:', src);
      // Attendre plus longtemps pour que le script s'exécute complètement
      setTimeout(() => {
        if (src.includes('watsonx-service.js')) {
          // Vérifier que WatsonxService est disponible
          if (window.WatsonxService) {
            console.log('✓ WatsonxService disponible après chargement');
            resolve();
          } else {
            // Le script est chargé mais le service n'est pas disponible
            // Attendre plus longtemps - le script peut prendre du temps à s'exécuter
            console.warn('⚠️ Script chargé mais WatsonxService non disponible, attente supplémentaire...');
            setTimeout(() => {
              if (window.WatsonxService) {
                console.log('✓ WatsonxService disponible après attente');
                resolve();
              } else {
                console.error('❌ WatsonxService toujours non disponible');
                console.error('Vérifiez la console pour des erreurs dans watsonx-service.js');
                // Ne pas rejeter, juste résoudre pour continuer
                resolve();
              }
            }, 2000);
          }
        } else {
          resolve();
        }
      }, 300);
    };
    script.onerror = (error) => {
      console.error('❌ Erreur chargement script:', src, error);
      reject(new Error(`Erreur chargement script: ${src}`));
    };
    document.head.appendChild(script);
  });
}

/**
 * Changer d'onglet
 */
function switchTab(tabName, clickedElement) {
  console.log(`🔄 Changement vers onglet: ${tabName}`);
  
  // Masquer tous les onglets
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
    tab.style.display = 'none'; // Forcer la masquage
  });
  
  // Masquer tous les nav-tabs
  document.querySelectorAll('.nav-tab').forEach(nav => {
    nav.classList.remove('active');
  });
  
  // Afficher l'onglet sélectionné
  const tabElement = document.getElementById(tabName);
  if (tabElement) {
    tabElement.classList.add('active');
    // Forcer l'affichage pour s'assurer que ça fonctionne
    tabElement.style.display = 'block';
    tabElement.style.visibility = 'visible';
    console.log(`✓ Onglet "${tabName}" affiché (display: ${tabElement.style.display})`);
    
    // Vérifier que l'onglet est vraiment visible
    setTimeout(() => {
      const isVisible = tabElement.offsetHeight > 0 && tabElement.offsetWidth > 0;
      console.log(`✓ Onglet "${tabName}" visible: ${isVisible}, dimensions: ${tabElement.offsetWidth}x${tabElement.offsetHeight}`);
      if (!isVisible) {
        console.warn(`⚠️ Onglet "${tabName}" semble masqué malgré display:block`);
      }
    }, 100);
  } else {
    console.error(`❌ Onglet "${tabName}" non trouvé dans le DOM`);
    console.error('Onglets disponibles:', Array.from(document.querySelectorAll('.tab-content')).map(t => t.id));
  }
  
  // Mettre à jour l'onglet navbar actif
  if (clickedElement) {
    clickedElement.classList.add('active');
    console.log(`✓ Nav-tab "${tabName}" activé`);
  } else {
    // Si pas d'élément passé, trouver par l'attribut data-tab
    const navTab = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
    if (navTab) {
      navTab.classList.add('active');
      console.log(`✓ Nav-tab "${tabName}" trouvé et activé`);
    } else {
      console.warn(`⚠️ Nav-tab "${tabName}" non trouvé`);
    }
  }
  
  // Charger les données de l'onglet
  if (tabName === 'overview') {
    loadOverview();
  } else if (tabName === 'compare') {
    // Vérifier si la fonction est disponible (peut être dans dashboard-enhancements.js)
    if (typeof loadRecentPromptsComparison === 'function') {
      loadRecentPromptsComparison();
    } else if (window.loadRecentPromptsComparison) {
      window.loadRecentPromptsComparison();
    } else {
      console.warn('⚠️ loadRecentPromptsComparison non disponible, réessai dans 500ms...');
      setTimeout(() => {
        if (typeof loadRecentPromptsComparison === 'function') {
          loadRecentPromptsComparison();
        } else if (window.loadRecentPromptsComparison) {
          window.loadRecentPromptsComparison();
        } else {
          console.error('❌ loadRecentPromptsComparison toujours non disponible');
        }
      }, 500);
    }
  } else if (tabName === 'energy') {
    if (typeof loadEnergyComparisonNew === 'function') {
      loadEnergyComparisonNew();
    } else {
      loadEnergyComparison();
    }
  } else if (tabName === 'predictions') {
    loadPredictionsInterface();
  }
}

/**
 * Charger la configuration depuis le storage
 */
async function loadConfig() {
  try {
    const result = await chrome.storage.local.get(['watsonxConfig']);
    if (result.watsonxConfig) {
      document.getElementById('config-api-key').value = result.watsonxConfig.apiKey || '';
      document.getElementById('config-api-url').value = result.watsonxConfig.apiUrl || 'https://eu-de.ml.cloud.ibm.com';
      document.getElementById('config-project-id').value = result.watsonxConfig.projectId || 'dc953834-0683-4609-bdbb-2c775b573883';
      const deploymentIdInput = document.getElementById('config-deployment-id');
      if (deploymentIdInput) {
        deploymentIdInput.value = result.watsonxConfig.deploymentId || '';
      }
    } else {
      // Pré-remplir avec les valeurs par défaut si aucune config n'existe
      const projectIdInput = document.getElementById('config-project-id');
      if (projectIdInput && !projectIdInput.value) {
        projectIdInput.value = 'dc953834-0683-4609-bdbb-2c775b573883';
      }
      const apiUrlSelect = document.getElementById('config-api-url');
      if (apiUrlSelect) {
        // Sélectionner EU Germany par défaut
        const euDeOption = Array.from(apiUrlSelect.options).find(opt => opt.value.includes('eu-de'));
        if (euDeOption) {
          apiUrlSelect.value = euDeOption.value;
        }
      }
    }
  } catch (error) {
    console.error('Erreur chargement config:', error);
  }
}

/**
 * Vérifier si Watsonx est configuré
 */
async function checkWatsonxConfig() {
  try {
    const result = await chrome.storage.local.get(['watsonxConfig']);
    return result.watsonxConfig && 
           result.watsonxConfig.apiKey && 
           result.watsonxConfig.projectId;
  } catch (error) {
    return false;
  }
}

/**
 * Sauvegarder la configuration Watsonx (dashboard.js - ne pas confondre avec watsonx-config.js)
 */
async function saveWatsonxConfigDashboard() {
  const apiKeyInput = document.getElementById('config-api-key');
  const apiUrlSelect = document.getElementById('config-api-url');
  const projectIdInput = document.getElementById('config-project-id');
  const deploymentIdInput = document.getElementById('config-deployment-id');
  
  // Nettoyer agressivement la clé API : supprimer tous les espaces, guillemets, etc.
  let apiKey = apiKeyInput?.value || '';
  if (typeof apiKey === 'string') {
    // Supprimer tous les espaces (y compris les espaces insécables)
    apiKey = apiKey.replace(/\s+/g, '');
    // Supprimer les guillemets au début et à la fin
    apiKey = apiKey.replace(/^["']+|["']+$/g, '');
    // Trim final
    apiKey = apiKey.trim();
  }
  
  const config = {
    apiKey: apiKey || '',
    apiUrl: apiUrlSelect?.value || apiUrlSelect?.options[apiUrlSelect.selectedIndex]?.value || 'https://us-south.ml.cloud.ibm.com',
    projectId: projectIdInput?.value.trim() || '',
    deploymentId: deploymentIdInput?.value.trim() || null
  };
  
  console.log('💾 Configuration à sauvegarder:', {
    apiUrl: config.apiUrl,
    projectId: config.projectId,
    hasApiKey: !!config.apiKey,
    hasDeploymentId: !!config.deploymentId
  });
  
  if (!config.apiKey || !config.projectId) {
    showStatus('⚠️ Veuillez remplir au moins API Key et Project ID', 'error');
    return false;
  }
  
  try {
    // Sauvegarder dans chrome.storage.local
    await chrome.storage.local.set({ watsonxConfig: config });
    
    // Vérifier immédiatement que la sauvegarde a fonctionné
    const verification = await chrome.storage.local.get(['watsonxConfig']);
    if (!verification.watsonxConfig || verification.watsonxConfig.projectId !== config.projectId) {
      throw new Error('Échec de la vérification de la sauvegarde');
    }
    
    // Mettre à jour la variable globale dans watsonx-service.js si disponible
    if (window.WatsonxService && window.WatsonxService.updateConfig) {
      window.WatsonxService.updateConfig(config);
      console.log('✓ Configuration mise à jour dans WatsonxService');
    } else {
      console.warn('⚠️ WatsonxService.updateConfig non disponible');
    }
    
    // Vérifier que l'API key est bien sauvegardée (sans l'afficher complètement)
    const apiKeyLength = config.apiKey ? config.apiKey.length : 0;
    const apiKeyPrefix = config.apiKey ? config.apiKey.substring(0, 15) + '...' : 'vide';
    
    console.log('✓ Configuration Watsonx sauvegardée et vérifiée:', {
      apiKeyLength: apiKeyLength,
      apiKeyPrefix: apiKeyPrefix,
      apiUrl: config.apiUrl,
      projectId: config.projectId,
      deploymentId: config.deploymentId
    });
    
    showStatus('✅ Configuration sauvegardée !', 'success');
    
    // Ne plus charger de datasets - on utilise uniquement le modèle déployé pour les prédictions
    
    return true;
  } catch (error) {
    console.error('❌ Erreur sauvegarde config:', error);
    showStatus('❌ Erreur sauvegarde: ' + error.message, 'error');
    return false;
  }
}

/**
 * Lister les datasets disponibles - SUPPRIMÉ
 * On n'utilise plus les datasets, uniquement le modèle déployé pour les prédictions
 */
async function listDatasets() {
  showStatus('ℹ️ Cette fonctionnalité a été supprimée. Utilisez l\'onglet "Prédictions ML" pour tester le modèle déployé avec vos données locales.', 'info');
}

/**
 * Tester la connexion Watsonx (teste uniquement l'authentification, pas les datasets)
 */
async function testWatsonxConnection() {
  showStatus('🔍 Test d\'authentification en cours...', 'info');
  
  try {
    // Sauvegarder d'abord
    const saved = await saveWatsonxConfigDashboard();
    if (!saved) {
      return; // La sauvegarde a échoué
    }
    
    // Attendre un peu pour que la configuration soit bien sauvegardée
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Vérifier que la configuration est bien sauvegardée
    const checkConfig = await chrome.storage.local.get(['watsonxConfig']);
    if (!checkConfig.watsonxConfig) {
      showStatus('❌ Configuration non trouvée après sauvegarde', 'error');
      return;
    }
    
    console.log('✓ Configuration vérifiée:', {
      hasApiKey: !!checkConfig.watsonxConfig.apiKey,
      hasProjectId: !!checkConfig.watsonxConfig.projectId,
      hasDeploymentId: !!checkConfig.watsonxConfig.deploymentId,
      apiUrl: checkConfig.watsonxConfig.apiUrl
    });
    
    // Tester uniquement l'authentification (obtenir un token IAM)
    if (window.WatsonxService && window.WatsonxService.getAuthToken) {
      try {
        // Mettre à jour la config dans le service
        if (window.WatsonxService.updateConfig) {
          window.WatsonxService.updateConfig(checkConfig.watsonxConfig);
        }
        
        // Tester l'obtention d'un token IAM
        const token = await window.WatsonxService.getAuthToken();
        if (token) {
          const deploymentInfo = checkConfig.watsonxConfig.deploymentId 
            ? `\n✅ Deployment ID configuré: ${checkConfig.watsonxConfig.deploymentId}`
            : '\n⚠️ Deployment ID non configuré - Configurez-le pour utiliser le modèle déployé';
          showStatus(`✅ Authentification réussie !${deploymentInfo}`, 'success');
          
          // Si le Deployment ID est configuré, calculer la prédiction annuelle et mettre à jour toutes les prédictions
          if (checkConfig.watsonxConfig.deploymentId) {
            console.log('🔄 Mise à jour des prédictions après test d\'authentification...');
            // Recharger les données avec les nouvelles prédictions
            await loadOverview();
            // Calculer aussi la prédiction annuelle détaillée
            await calculateAnnualPrediction();
            showStatus('✅ Prédictions mises à jour avec le modèle Watsonx', 'success');
          }
        } else {
          showStatus('❌ Échec de l\'authentification - Token non obtenu', 'error');
        }
      } catch (authError) {
        console.error('❌ Erreur authentification:', authError);
        showStatus(`❌ Erreur authentification: ${authError.message}`, 'error');
      }
    } else {
      showStatus('❌ Service Watsonx non disponible - Rechargez la page', 'error');
    }
  } catch (error) {
    console.error('❌ Erreur test connexion:', error);
    showStatus('❌ Erreur: ' + error.message, 'error');
  }
}

/**
 * Valider les données avant l'envoi à Watsonx
 */
function validatePredictionData(data) {
  const requiredFields = [
    { name: 'totalDuration', label: 'Durée totale', min: 0 },
    { name: 'promptTokens', label: 'Tokens du prompt', min: 0 },
    { name: 'responseTokens', label: 'Tokens de la réponse', min: 0 },
    { name: 'responseDuration', label: 'Durée de réponse', min: 0 },
    { name: 'wordCount', label: 'Nombre de mots', min: 0 },
    { name: 'readingTime', label: 'Temps de lecture', min: 0 }
  ];
  
  const missingFields = [];
  const invalidFields = [];
  
  requiredFields.forEach(field => {
    const value = data[field.name];
    if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
      missingFields.push(field.label);
    } else if (value < field.min) {
      invalidFields.push(`${field.label} (valeur: ${value}, minimum: ${field.min})`);
    }
  });
  
  if (missingFields.length > 0 || invalidFields.length > 0) {
    let message = 'Certaines données sont manquantes ou invalides:';
    if (missingFields.length > 0) {
      message += `\n- Champs manquants: ${missingFields.join(', ')}`;
    }
    if (invalidFields.length > 0) {
      message += `\n- Champs invalides: ${invalidFields.join(', ')}`;
    }
    return {
      isValid: false,
      message: message,
      missingFields: missingFields,
      invalidFields: invalidFields
    };
  }
  
  return { isValid: true };
}

/**
 * Créer le formulaire de saisie manuelle
 */
function createManualInputForm(prefilledData = {}) {
  return `
    <div id="manual-input-form" style="margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
      <h4 style="margin-bottom: 15px;">📝 Saisie manuelle des données</h4>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
        <div>
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Durée totale (nanosecondes)</label>
          <input type="number" id="manual-total-duration" class="config-input" 
                 value="${prefilledData.totalDuration || ''}" 
                 placeholder="Ex: 1000000000" step="1" min="0">
        </div>
        <div>
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Tokens du prompt</label>
          <input type="number" id="manual-prompt-tokens" class="config-input" 
                 value="${prefilledData.promptTokens || ''}" 
                 placeholder="Ex: 100" step="1" min="0">
        </div>
        <div>
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Tokens de la réponse</label>
          <input type="number" id="manual-response-tokens" class="config-input" 
                 value="${prefilledData.responseTokens || ''}" 
                 placeholder="Ex: 500" step="1" min="0">
        </div>
        <div>
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Durée de réponse (nanosecondes)</label>
          <input type="number" id="manual-response-duration" class="config-input" 
                 value="${prefilledData.responseDuration || ''}" 
                 placeholder="Ex: 5000000000" step="1" min="0">
        </div>
        <div>
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Nombre de mots</label>
          <input type="number" id="manual-word-count" class="config-input" 
                 value="${prefilledData.wordCount || ''}" 
                 placeholder="Ex: 250" step="1" min="0">
        </div>
        <div>
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Temps de lecture (secondes)</label>
          <input type="number" id="manual-reading-time" class="config-input" 
                 value="${prefilledData.readingTime || ''}" 
                 placeholder="Ex: 60" step="0.1" min="0">
        </div>
      </div>
      <button id="btn-submit-manual-data" class="btn btn-primary" style="width: 100%; margin-top: 20px;">
        🚀 Calculer la prédiction avec ces données
      </button>
    </div>
  `;
}

/**
 * Configurer le formulaire de saisie manuelle
 */
function setupManualInputForm() {
  // Supprimer les anciens event listeners
  const oldBtn = document.getElementById('btn-submit-manual-data');
  if (oldBtn) {
    oldBtn.replaceWith(oldBtn.cloneNode(true));
  }
  
  const submitBtn = document.getElementById('btn-submit-manual-data');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const manualData = {
        totalDuration: parseFloat(document.getElementById('manual-total-duration')?.value || 0),
        promptTokens: parseFloat(document.getElementById('manual-prompt-tokens')?.value || 0),
        responseTokens: parseFloat(document.getElementById('manual-response-tokens')?.value || 0),
        responseDuration: parseFloat(document.getElementById('manual-response-duration')?.value || 0),
        wordCount: parseFloat(document.getElementById('manual-word-count')?.value || 0),
        readingTime: parseFloat(document.getElementById('manual-reading-time')?.value || 0)
      };
      
      // Valider les données saisies
      const validation = validatePredictionData(manualData);
      if (!validation.isValid) {
        alert('⚠️ Données invalides:\n\n' + validation.message + '\n\nVeuillez corriger les valeurs saisies.');
        return;
      }
      
      // Utiliser ces données pour la prédiction
      await calculateAnnualPredictionWithData(manualData);
    });
  }
}

/**
 * Calculer la prédiction annuelle avec des données spécifiques
 */
async function calculateAnnualPredictionWithData(data) {
  const annualPredictionContent = document.getElementById('annual-prediction-content');
  if (!annualPredictionContent) return;
  
  // Afficher un indicateur de chargement
  annualPredictionContent.innerHTML = `
    <div style="padding: 40px; text-align: center;">
      <div class="spinner"></div>
      <p style="margin-top: 20px;">Calcul de la prédiction en cours...</p>
    </div>
  `;
  
  try {
    const predictionMode = await getPredictionMode();
    let energyPerExchange = null;
    let predictionSource = 'local';
    
    // Si mode watsonx, utiliser Watsonx uniquement
    if (predictionMode === 'watsonx') {
      if (window.WatsonxService && window.WatsonxService.predictEnergyWithDeployedModel) {
        try {
          energyPerExchange = await window.WatsonxService.predictEnergyWithDeployedModel({
            totalDuration: data.totalDuration,
            promptTokens: data.promptTokens,
            responseTokens: data.responseTokens,
            responseDuration: data.responseDuration,
            wordCount: data.wordCount,
            readingTime: data.readingTime
          });
          
          if (energyPerExchange !== null && !isNaN(energyPerExchange) && energyPerExchange >= 0) {
            predictionSource = 'deployed';
          } else {
            throw new Error('Prédiction Watsonx échouée - Résultat invalide');
          }
        } catch (error) {
          console.error('❌ Erreur prédiction modèle déployé (mode watsonx):', error);
          // Ne pas fallback en mode watsonx
          annualPredictionContent.innerHTML = `
            <div style="padding: 20px; background: #f8d7da; border-radius: 8px; color: #721c24;">
              <p><strong>❌ Erreur de prédiction Watsonx</strong></p>
              <p style="margin-top: 10px; font-size: 14px;">
                Le mode "Watsonx Direct" est activé mais la prédiction a échoué.
                <br><br>
                <strong>Erreur:</strong> ${error.message}
                <br><br>
                <strong>Données envoyées:</strong>
                <ul style="margin-top: 10px; padding-left: 20px;">
                  <li>totalDuration: ${data.totalDuration}</li>
                  <li>promptTokens: ${data.promptTokens}</li>
                  <li>responseTokens: ${data.responseTokens}</li>
                  <li>responseDuration: ${data.responseDuration}</li>
                  <li>wordCount: ${data.wordCount}</li>
                  <li>readingTime: ${data.readingTime}</li>
                </ul>
              </p>
            </div>
          `;
          return;
        }
      }
    }
    
    // Si pas de prédiction Watsonx ou mode local, utiliser le modèle local
    if (energyPerExchange === null || isNaN(energyPerExchange) || energyPerExchange === 0) {
      try {
        energyPerExchange = await predictEnergy(
          'unknown',
          data.promptTokens,
          data.responseTokens,
          data.totalDuration,
          data.responseDuration,
          data.wordCount,
          data.readingTime
        );
        
        if (!energyPerExchange || energyPerExchange === 0 || isNaN(energyPerExchange)) {
          const totalTokens = data.promptTokens + data.responseTokens;
          energyPerExchange = totalTokens > 0 ? totalTokens * 0.00001 : 0.001;
        }
        
        predictionSource = 'local';
      } catch (error) {
        console.warn('⚠️ Erreur prédiction locale:', error);
        const totalTokens = data.promptTokens + data.responseTokens;
        energyPerExchange = totalTokens > 0 ? totalTokens * 0.00001 : 0.001;
        predictionSource = 'local';
      }
    }
    
    // Calculer les projections annuelles (utiliser des valeurs par défaut pour les projections)
    const exchangesPerDay = 4; // Valeur par défaut
    const daysInYear = 365;
    const projectedExchanges = exchangesPerDay * daysInYear;
    
    const yearlyEnergyJoules = energyPerExchange * projectedExchanges;
    const yearlyEnergyKwh = yearlyEnergyJoules / 3600000;
    
    const globalIntensity = carbonIntensityData?.countries?.global_average?.intensity || 480;
    const yearlyCO2Kg = yearlyEnergyKwh * globalIntensity / 1000;
    
    // Afficher les résultats
    annualPredictionContent.innerHTML = `
      <div style="padding: 20px; background: #d1ecf1; border-radius: 8px; color: #0c5460;">
        <h3 style="margin-bottom: 15px;">📊 Prédiction Annuelle</h3>
        <div class="stats-grid" style="margin-top: 20px;">
          <div class="stat-card">
            <h3>Énergie (kWh/an)</h3>
            <div class="value">${yearlyEnergyKwh.toFixed(4)}</div>
          </div>
          <div class="stat-card">
            <h3>CO₂ (kg/an)</h3>
            <div class="value">${yearlyCO2Kg.toFixed(4)}</div>
          </div>
          <div class="stat-card">
            <h3>Énergie par échange</h3>
            <div class="value">${(energyPerExchange / 1000).toFixed(6)}</div>
            <span class="unit">J</span>
          </div>
          <div class="stat-card">
            <h3>Source</h3>
            <div class="value">${predictionSource === 'deployed' ? '🤖 Watsonx' : '💻 Local'}</div>
          </div>
        </div>
        <p style="margin-top: 20px; font-size: 14px; color: #666;">
          <strong>Note:</strong> Cette prédiction est basée sur les données saisies manuellement.
          <br>
          Pour des prédictions plus précises, collectez des données réelles en utilisant l'extension sur ChatGPT, Claude ou Gemini.
        </p>
      </div>
    `;
  } catch (error) {
    console.error('❌ Erreur calcul prédiction avec données manuelles:', error);
    annualPredictionContent.innerHTML = `
      <div style="padding: 20px; background: #f8d7da; border-radius: 8px; color: #721c24;">
        <p><strong>❌ Erreur lors du calcul</strong></p>
        <p style="margin-top: 10px; font-size: 14px;">${error.message}</p>
      </div>
    `;
  }
}

/**
 * Calculer une prédiction annuelle basée sur les données collectées
 */
async function calculateAnnualPrediction() {
  const annualPredictionDiv = document.getElementById('annual-prediction');
  const annualPredictionContent = document.getElementById('annual-prediction-content');
  
  if (!annualPredictionDiv || !annualPredictionContent) {
    console.warn('⚠️ Éléments de prédiction annuelle non trouvés');
    return;
  }
  
  annualPredictionDiv.style.display = 'block';
  annualPredictionContent.innerHTML = '<p style="color: #666;">📊 Calcul de la prédiction annuelle en cours...</p>';
  
  try {
    // Charger les données depuis chrome.storage
    const result = await chrome.storage.local.get(['conversationHistory', 'watsonxSyncQueue']);
    const history = result.conversationHistory || [];
    const queue = result.watsonxSyncQueue || [];
    const allData = [...history, ...queue];
    
    if (allData.length === 0) {
      annualPredictionContent.innerHTML = `
        <div style="padding: 20px; background: #fff3cd; border-radius: 8px; color: #856404;">
          <p><strong>⚠️ Aucune donnée disponible</strong></p>
          <p style="margin-top: 10px; font-size: 14px;">
            Les données seront collectées automatiquement lors de vos interactions avec ChatGPT, Claude ou Gemini.
            Revenez après quelques échanges pour voir la prédiction annuelle.
          </p>
        </div>
      `;
      return;
    }
    
    // Filtrer les données valides
    const validData = allData.filter(item => {
      return (item.prompt_token_length !== undefined || item.promptTokens !== undefined) && 
             (item.response_token_length !== undefined || item.responseTokens !== undefined) &&
             (item.total_duration !== undefined || item.totalDuration !== undefined);
    });
    
    if (validData.length === 0) {
      annualPredictionContent.innerHTML = `
        <div style="padding: 20px; background: #fff3cd; border-radius: 8px; color: #856404;">
          <p><strong>⚠️ Données incomplètes</strong></p>
          <p style="margin-top: 10px; font-size: 14px;">
            Les données collectées ne contiennent pas toutes les informations nécessaires pour la prédiction.
          </p>
        </div>
      `;
      return;
    }
    
    // Calculer les statistiques sur la période collectée
    const normalizeNumber = (val, defaultValue = 0) => {
      if (val === null || val === undefined) return defaultValue;
      if (typeof val === 'number') return isNaN(val) ? defaultValue : val;
      const parsed = parseFloat(val);
      return isNaN(parsed) ? defaultValue : parsed;
    };
    
    let totalPromptTokens = 0;
    let totalResponseTokens = 0;
    let totalDuration = 0;
    let totalResponseDuration = 0;
    let totalWordCount = 0;
    let totalReadingTime = 0;
    let dataCount = 0;
    
    validData.forEach(item => {
      const promptTokens = normalizeNumber(item.prompt_token_length || item.promptTokens, 0);
      const responseTokens = normalizeNumber(item.response_token_length || item.responseTokens, 0);
      const duration = normalizeNumber(item.total_duration || item.totalDuration, 0);
      const responseDuration = normalizeNumber(item.response_duration || item.responseDuration, 0);
      const wordCount = normalizeNumber(item.word_count || item.wordCount, 0);
      const readingTime = normalizeNumber(item.reading_time || item.readingTime, 0);
      
      totalPromptTokens += promptTokens;
      totalResponseTokens += responseTokens;
      totalDuration += duration;
      totalResponseDuration += responseDuration;
      totalWordCount += wordCount;
      totalReadingTime += readingTime;
      dataCount++;
    });
    
    // Calculer les moyennes
    const avgPromptTokens = dataCount > 0 ? totalPromptTokens / dataCount : 0;
    const avgResponseTokens = dataCount > 0 ? totalResponseTokens / dataCount : 0;
    const avgDuration = dataCount > 0 ? totalDuration / dataCount : 0;
    const avgResponseDuration = dataCount > 0 ? totalResponseDuration / dataCount : 0;
    const avgWordCount = dataCount > 0 ? totalWordCount / dataCount : 0;
    const avgReadingTime = dataCount > 0 ? totalReadingTime / dataCount : 0;
    
    // Calculer la période de collecte (en jours)
    const timestamps = validData
      .map(item => item.timestamp || Date.now())
      .filter(ts => ts > 0);
    
    const minTimestamp = Math.min(...timestamps);
    const maxTimestamp = Math.max(...timestamps);
    const periodDays = Math.max(1, (maxTimestamp - minTimestamp) / (1000 * 60 * 60 * 24)); // Au moins 1 jour
    
    // Estimer le nombre d'échanges par jour
    // Si on a peu de données (moins de 7 jours), utiliser une estimation basée sur la moyenne
    let exchangesPerDay = dataCount / periodDays;
    
    // Si période très courte (< 1 jour), estimer à partir de la fréquence observée
    if (periodDays < 1) {
      // Si on a plusieurs échanges en moins d'un jour, extrapoler
      exchangesPerDay = dataCount * 1.5; // Estimation conservatrice
    }
    
    // Minimum: au moins 1 échange par jour si on a des données
    if (exchangesPerDay < 1 && dataCount > 0) {
      exchangesPerDay = 1;
    }
    
    // Projeter sur 1 an (365 jours)
    const daysInYear = 365;
    const projectedExchanges = Math.round(exchangesPerDay * daysInYear);
    
    // Calculer les totaux projetés pour 1 an
    const yearlyPromptTokens = Math.round(avgPromptTokens * projectedExchanges);
    const yearlyResponseTokens = Math.round(avgResponseTokens * projectedExchanges);
    const yearlyDuration = avgDuration * projectedExchanges;
    const yearlyResponseDuration = avgResponseDuration * projectedExchanges;
    const yearlyWordCount = Math.round(avgWordCount * projectedExchanges);
    const yearlyReadingTime = avgReadingTime * projectedExchanges;
    
    // Faire une prédiction avec le modèle déployé pour un échange moyen
    let energyPerExchange = null;
    let predictionSource = 'local';
    
    // Obtenir le mode de prédiction choisi
    const predictionMode = await getPredictionMode();
    
    // Vérifier que nous avons des données valides avant de faire la prédiction
    if (dataCount === 0 || (avgPromptTokens === 0 && avgResponseTokens === 0)) {
      annualPredictionContent.innerHTML = `
        <div style="padding: 20px; background: #fff3cd; border-radius: 8px; color: #856404;">
          <p><strong>⚠️ Données insuffisantes</strong></p>
          <p style="margin-top: 10px; font-size: 14px;">
            Il n'y a pas encore assez de données collectées pour faire une prédiction annuelle.
            <br><br>
            <strong>Données disponibles:</strong> ${dataCount} échange(s)
            <br><br>
            Utilisez l'extension sur ChatGPT ou d'autres LLMs pour collecter des données, ou entrez les valeurs manuellement ci-dessous.
          </p>
          ${createManualInputForm()}
        </div>
      `;
      setupManualInputForm();
      return;
    }
    
    // Valider les données avant l'envoi à Watsonx
    const dataValidation = validatePredictionData({
      totalDuration: avgDuration,
      promptTokens: avgPromptTokens,
      responseTokens: avgResponseTokens,
      responseDuration: avgResponseDuration,
      wordCount: avgWordCount,
      readingTime: avgReadingTime
    });
    
    if (!dataValidation.isValid) {
      annualPredictionContent.innerHTML = `
        <div style="padding: 20px; background: #fff3cd; border-radius: 8px; color: #856404;">
          <p><strong>⚠️ Données incomplètes pour la prédiction</strong></p>
          <p style="margin-top: 10px; font-size: 14px;">
            ${dataValidation.message}
            <br><br>
            <strong>Données collectées:</strong>
            <ul style="margin-top: 10px; padding-left: 20px;">
              <li>Durée totale: ${avgDuration > 0 ? avgDuration.toFixed(2) + ' ns' : '❌ Manquante'}</li>
              <li>Tokens prompt: ${avgPromptTokens > 0 ? avgPromptTokens.toFixed(1) : '❌ Manquants'}</li>
              <li>Tokens réponse: ${avgResponseTokens > 0 ? avgResponseTokens.toFixed(1) : '❌ Manquants'}</li>
              <li>Durée réponse: ${avgResponseDuration > 0 ? avgResponseDuration.toFixed(2) + ' ns' : '❌ Manquante'}</li>
              <li>Nombre de mots: ${avgWordCount > 0 ? avgWordCount.toFixed(1) : '❌ Manquant'}</li>
              <li>Temps de lecture: ${avgReadingTime > 0 ? avgReadingTime.toFixed(2) + ' s' : '❌ Manquant'}</li>
            </ul>
            <br>
            Vous pouvez entrer les valeurs manuellement ci-dessous pour compléter les données manquantes.
          </p>
          ${createManualInputForm({
            totalDuration: avgDuration,
            promptTokens: avgPromptTokens,
            responseTokens: avgResponseTokens,
            responseDuration: avgResponseDuration,
            wordCount: avgWordCount,
            readingTime: avgReadingTime
          })}
        </div>
      `;
      setupManualInputForm();
      return;
    }
    
    // Si mode watsonx, utiliser Watsonx uniquement (pas de fallback)
    if (predictionMode === 'watsonx') {
      if (window.WatsonxService && window.WatsonxService.predictEnergyWithDeployedModel) {
        try {
          energyPerExchange = await window.WatsonxService.predictEnergyWithDeployedModel({
            totalDuration: avgDuration,
            promptTokens: avgPromptTokens,
            responseTokens: avgResponseTokens,
            responseDuration: avgResponseDuration,
            wordCount: avgWordCount,
            readingTime: avgReadingTime
          });
          
          if (energyPerExchange !== null && !isNaN(energyPerExchange) && energyPerExchange >= 0) {
            predictionSource = 'deployed';
          } else {
            throw new Error('Prédiction Watsonx échouée - Résultat invalide');
          }
        } catch (error) {
          console.error('❌ Erreur prédiction modèle déployé (mode watsonx):', error);
          // Afficher un message d'erreur dans l'interface avec plus de détails
          const errorMessage = error.message || 'Erreur inconnue';
          annualPredictionContent.innerHTML = `
            <div style="padding: 20px; background: #f8d7da; border-radius: 8px; color: #721c24;">
              <p><strong>❌ Erreur de prédiction Watsonx</strong></p>
              <p style="margin-top: 10px; font-size: 14px;">
                Le mode "Watsonx Direct" est activé mais la prédiction a échoué.
                <br><br>
                <strong>Erreur:</strong> ${errorMessage}
                <br><br>
                <strong>Données envoyées:</strong>
                <ul style="margin-top: 10px; padding-left: 20px; font-size: 12px;">
                  <li>totalDuration: ${avgDuration}</li>
                  <li>promptTokens: ${avgPromptTokens}</li>
                  <li>responseTokens: ${avgResponseTokens}</li>
                  <li>responseDuration: ${avgResponseDuration}</li>
                  <li>wordCount: ${avgWordCount}</li>
                  <li>readingTime: ${avgReadingTime}</li>
                </ul>
                <br>
                Vérifiez :
                <ul style="margin-top: 10px; padding-left: 20px;">
                  <li>Que le Deployment ID est correct</li>
                  <li>Que l'API Key est valide</li>
                  <li>Que le format des données correspond au modèle entraîné</li>
                  <li>Que le modèle est bien déployé et accessible</li>
                  <li>Consultez la console pour plus de détails sur l'erreur</li>
                </ul>
              </p>
            </div>
          `;
          return; // Ne pas continuer avec le calcul
        }
      } else {
        annualPredictionContent.innerHTML = `
          <div style="padding: 20px; background: #fff3cd; border-radius: 8px; color: #856404;">
            <p><strong>⚠️ Service Watsonx non disponible</strong></p>
            <p style="margin-top: 10px; font-size: 14px;">
              Le mode "Watsonx Direct" est activé mais le service Watsonx n'est pas disponible.
              Rechargez la page pour réessayer.
            </p>
          </div>
        `;
        return;
      }
    } else {
      // Mode serveur ou autre : essayer serveur puis Watsonx puis local
      // Essayer d'abord le serveur local si mode serveur
      if (predictionMode === 'server' && window.ServerPredictor) {
        try {
          energyPerExchange = await window.ServerPredictor.predict({
            totalDuration: avgDuration,
            promptTokens: avgPromptTokens,
            responseTokens: avgResponseTokens,
            responseDuration: avgResponseDuration,
            wordCount: avgWordCount,
            readingTime: avgReadingTime
          });
          
          if (energyPerExchange !== null && !isNaN(energyPerExchange)) {
            predictionSource = 'server';
          }
        } catch (error) {
          console.warn('⚠️ Erreur prédiction serveur, fallback vers Watsonx:', error);
        }
      }
      
      // Fallback vers le modèle déployé Watsonx
      if ((energyPerExchange === null || isNaN(energyPerExchange)) && 
          window.WatsonxService && 
          window.WatsonxService.predictEnergyWithDeployedModel) {
        try {
          energyPerExchange = await window.WatsonxService.predictEnergyWithDeployedModel({
            totalDuration: avgDuration,
            promptTokens: avgPromptTokens,
            responseTokens: avgResponseTokens,
            responseDuration: avgResponseDuration,
            wordCount: avgWordCount,
            readingTime: avgReadingTime
          });
          
          if (energyPerExchange !== null && !isNaN(energyPerExchange)) {
            predictionSource = 'deployed';
          }
        } catch (error) {
          console.warn('⚠️ Erreur prédiction modèle déployé:', error);
        }
      }
      
      // Fallback vers le modèle local
      if (energyPerExchange === null || isNaN(energyPerExchange) || energyPerExchange === 0) {
        try {
          // Utiliser des valeurs par défaut si certaines sont manquantes
          const safeAvgDuration = avgDuration || 0;
          const safeAvgResponseDuration = avgResponseDuration || 0;
          const safeAvgWordCount = avgWordCount || 0;
          const safeAvgReadingTime = avgReadingTime || 0;
          
          energyPerExchange = await predictEnergy(
            'unknown',
            avgPromptTokens,
            avgResponseTokens,
            safeAvgDuration,
            safeAvgResponseDuration,
            safeAvgWordCount,
            safeAvgReadingTime
          );
          
          // Si toujours 0 ou null, utiliser une estimation basique basée sur les tokens
          if (!energyPerExchange || energyPerExchange === 0 || isNaN(energyPerExchange)) {
            console.log('⚠️ Prédiction locale retournée 0, utilisation estimation basique');
            // Estimation basique: ~0.00001 Joules par token (valeur conservatrice)
            const totalTokens = avgPromptTokens + avgResponseTokens;
            energyPerExchange = totalTokens * 0.00001;
            
            // Si toujours 0 (pas de tokens), utiliser une valeur minimale
            if (energyPerExchange === 0) {
              energyPerExchange = 0.001; // 0.001 Joules minimum pour un échange
            }
          }
          
          predictionSource = 'local';
        } catch (error) {
          console.warn('⚠️ Erreur prédiction locale:', error);
          // Estimation de secours basée uniquement sur les tokens
          const totalTokens = avgPromptTokens + avgResponseTokens;
          energyPerExchange = totalTokens > 0 ? totalTokens * 0.00001 : 0.001;
          predictionSource = 'local';
        }
      }
    }
    
    // S'assurer qu'on a toujours une valeur valide
    if (!energyPerExchange || isNaN(energyPerExchange) || energyPerExchange === 0) {
      console.warn('⚠️ Aucune prédiction valide, utilisation estimation minimale');
      const totalTokens = avgPromptTokens + avgResponseTokens;
      energyPerExchange = totalTokens > 0 ? totalTokens * 0.00001 : 0.001;
      predictionSource = 'local';
    }
    
    // Calculer l'énergie totale pour 1 an
    const yearlyEnergyJoules = energyPerExchange * projectedExchanges;
    const yearlyEnergyKwh = yearlyEnergyJoules / 3600000;
    
    // Calculer le CO₂ (intensité carbone moyenne globale: 480 g CO₂/kWh)
    const carbonIntensity = 480;
    const yearlyCO2Grams = yearlyEnergyKwh * carbonIntensity;
    const yearlyCO2Kg = yearlyCO2Grams / 1000;
    
    // Afficher les résultats
    annualPredictionContent.innerHTML = `
      <div style="margin-bottom: 20px;">
        <h4 style="color: #333; margin-bottom: 15px;">📈 Statistiques de Collecte</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
            <strong style="color: #666; font-size: 12px;">Échanges Collectés</strong>
            <div style="font-size: 24px; margin-top: 5px; color: #667eea;">${dataCount}</div>
          </div>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
            <strong style="color: #666; font-size: 12px;">Période</strong>
            <div style="font-size: 18px; margin-top: 5px; color: #667eea;">${periodDays.toFixed(1)} jours</div>
          </div>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
            <strong style="color: #666; font-size: 12px;">Échanges/Jour</strong>
            <div style="font-size: 18px; margin-top: 5px; color: #667eea;">${exchangesPerDay.toFixed(1)}</div>
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h4 style="color: #333; margin-bottom: 15px;">📊 Projection sur 1 An</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
            <strong style="color: #666; font-size: 12px;">Échanges Projetés</strong>
            <div style="font-size: 24px; margin-top: 5px; color: #667eea;">${projectedExchanges.toLocaleString()}</div>
          </div>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
            <strong style="color: #666; font-size: 12px;">Tokens Prompt</strong>
            <div style="font-size: 18px; margin-top: 5px; color: #667eea;">${yearlyPromptTokens.toLocaleString()}</div>
          </div>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
            <strong style="color: #666; font-size: 12px;">Tokens Réponse</strong>
            <div style="font-size: 18px; margin-top: 5px; color: #667eea;">${yearlyResponseTokens.toLocaleString()}</div>
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <h4 style="color: #333; margin-bottom: 15px;">⚡ Prédiction d'Énergie et CO₂</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
          <div style="background: #e7f3ff; padding: 20px; border-radius: 8px; border: 2px solid #0066cc;">
            <strong style="color: #0066cc; font-size: 14px;">Énergie Totale</strong>
            <div style="font-size: 28px; margin-top: 10px; color: #0066cc; font-weight: bold;">
              ${yearlyEnergyKwh.toFixed(4)} kWh
            </div>
            <div style="font-size: 14px; margin-top: 5px; color: #666;">
              ${yearlyEnergyJoules.toFixed(2)} J
            </div>
          </div>
          <div style="background: #fff3cd; padding: 20px; border-radius: 8px; border: 2px solid #856404;">
            <strong style="color: #856404; font-size: 14px;">CO₂ Émis</strong>
            <div style="font-size: 28px; margin-top: 10px; color: #856404; font-weight: bold;">
              ${yearlyCO2Kg.toFixed(3)} kg
            </div>
            <div style="font-size: 14px; margin-top: 5px; color: #666;">
              ${yearlyCO2Grams.toFixed(2)} g
            </div>
          </div>
          <div style="background: #d4edda; padding: 20px; border-radius: 8px; border: 2px solid #28a745;">
            <strong style="color: #28a745; font-size: 14px;">Énergie par Échange</strong>
            <div style="font-size: 20px; margin-top: 10px; color: #28a745; font-weight: bold;">
              ${(energyPerExchange / 3600000).toFixed(8)} kWh
            </div>
            <div style="font-size: 12px; margin-top: 5px; color: #666;">
              Source: ${predictionSource === 'server' ? '🖥️ Serveur Local' : predictionSource === 'deployed' ? '☁️ Modèle Déployé' : '🌲 Modèle Local'}
            </div>
          </div>
        </div>
      </div>
      
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 20px;">
        <p style="color: #666; font-size: 13px; margin: 0;">
          <strong>Note:</strong> Cette projection est basée sur vos données collectées sur ${periodDays.toFixed(1)} jours (${dataCount} échanges).
          Les valeurs sont calculées en supposant que votre utilisation reste constante sur une année complète.
        </p>
      </div>
    `;
    
    console.log('✅ Prédiction annuelle calculée:', {
      dataCount,
      periodDays,
      projectedExchanges,
      yearlyEnergyKwh,
      yearlyCO2Kg,
      predictionSource
    });
    
  } catch (error) {
    console.error('❌ Erreur calcul prédiction annuelle:', error);
    annualPredictionContent.innerHTML = `
      <div style="padding: 20px; background: #f8d7da; border-radius: 8px; color: #721c24;">
        <p><strong>❌ Erreur lors du calcul</strong></p>
        <p style="margin-top: 10px; font-size: 14px;">${error.message}</p>
      </div>
    `;
  }
}

/**
 * Afficher un message de statut
 */
function showStatus(message, type = 'info', targetId = 'config-status') {
  const statusDiv = document.getElementById(targetId);
  if (!statusDiv) {
    console.warn(`⚠️ Élément ${targetId} non trouvé pour afficher le statut`);
    return;
  }
  statusDiv.innerHTML = `<div class="${type === 'error' ? 'error' : ''}" style="padding: 15px; border-radius: 8px; background: ${type === 'success' ? '#d4edda' : type === 'error' ? '#f8d7da' : '#d1ecf1'}; color: ${type === 'success' ? '#155724' : type === 'error' ? '#721c24' : '#0c5460'};">${message}</div>`;
}

/**
 * Afficher que la configuration est nécessaire
 */
function showConfigNeeded() {
  document.querySelectorAll('.tab-content').forEach(tab => {
    if (tab.id !== 'config') {
      tab.innerHTML = '<div class="error"><h3>⚠️ Configuration Watsonx requise</h3><p>Veuillez configurer Watsonx dans l\'onglet Configuration pour utiliser le dashboard.</p></div>';
    }
  });
}

/**
 * Synchroniser la queue locale vers Watsonx
 * Avec rate limiting pour respecter les limites API (max 8 calls/seconde)
 */
async function syncQueueToWatsonx() {
  try {
    showStatus('🔄 Synchronisation en cours...', 'info');
    
    // Récupérer la queue
    const result = await chrome.storage.local.get(['watsonxSyncQueue', 'watsonxConfig']);
    const queue = result.watsonxSyncQueue || [];
    
    if (queue.length === 0) {
      showStatus('✅ Aucune donnée à synchroniser', 'success');
      return;
    }
    
    // Vérifier la configuration
    const config = result.watsonxConfig;
    if (!config || !config.apiKey || !config.projectId) {
      showStatus('❌ Configuration Watsonx requise', 'error');
      return;
    }
    
    // Vérifier et charger WatsonxService si nécessaire
    if (!window.WatsonxService) {
      console.log('⚠️ WatsonxService non disponible, tentative de chargement...');
      try {
        const watsonxServiceUrl = chrome.runtime.getURL('watsonx-service.js');
        await loadScript(watsonxServiceUrl);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        if (!window.WatsonxService) {
          showStatus('❌ Service Watsonx non disponible. Veuillez recharger la page.', 'error');
          return;
        }
      } catch (loadError) {
        console.error('❌ Erreur chargement WatsonxService:', loadError);
        showStatus('❌ Erreur: Service Watsonx non disponible. Veuillez recharger la page.', 'error');
        return;
      }
    }
    
    await window.WatsonxService.initWatsonxService();
    
    // Grouper les données pour réduire les appels API
    // Envoyer tout en un seul batch (max 1000 échanges) pour minimiser les appels
    const maxExchangesPerCall = 1000;
    const dataToSend = queue.slice(0, maxExchangesPerCall);
    const remaining = queue.slice(maxExchangesPerCall);
    
    showStatus(`📤 Envoi de ${dataToSend.length} échanges à Watsonx...`, 'info');
    
    // Envoyer avec rate limiting (géré par sendDataToWatsonx)
    const syncResult = await window.WatsonxService.sendDataToWatsonx(dataToSend);
    
    if (syncResult.success) {
      // Mettre à jour la queue
      await chrome.storage.local.set({ 
        watsonxSyncQueue: remaining,
        lastWatsonxSync: Date.now()
      });
      
      const message = remaining.length > 0
        ? `✅ ${dataToSend.length} échanges envoyés, ${remaining.length} restants en queue`
        : `✅ ${dataToSend.length} échanges synchronisés avec succès`;
      
      showStatus(message, 'success');
      console.log(message);
    } else {
      throw new Error('Échec de l\'envoi');
    }
    
  } catch (error) {
    console.error('❌ Erreur synchronisation:', error);
    showStatus(`❌ Erreur: ${error.message}`, 'error');
  }
}

/**
 * Charger toutes les données - SUPPRIMÉ
 * On n'utilise plus les datasets, uniquement le modèle déployé pour les prédictions
 * Les données sont collectées localement et peuvent être utilisées pour tester le modèle
 */
async function loadAllData() {
  // Charger la vue d'ensemble avec les données locales
  await loadOverview();
}

/**
 * Charger la vue d'ensemble avec prédictions long terme et conseils
 */
async function loadOverview() {
  try {
    const loading = document.getElementById('overview-loading');
    const content = document.getElementById('overview-content');
    
    // Charger les données locales
    datasetData = await loadLocalDatasetData();
    
    if (!datasetData || datasetData.length === 0) {
      loading.innerHTML = `
        <div style="padding: 40px; text-align: center;">
          <h3>📊 Aucune donnée disponible</h3>
          <p style="margin: 20px 0; color: #666;">
            Les données seront collectées automatiquement lors de vos interactions avec ChatGPT, Claude ou Gemini.
            <br><br>
            Utilisez l'extension sur ces plateformes pour commencer à collecter des données.
          </p>
        </div>
      `;
      return;
    }
    
    // Calculer les statistiques
    const totalMeasures = datasetData.length;
    
    console.log('📊 Calcul statistiques vue d\'ensemble:', {
      totalMeasures,
      sampleRow: datasetData[0],
      allEnergyValues: datasetData.slice(0, 5).map(r => r.energy_consumption_llm_total)
    });
    
    // Calculer les moyennes pour la prédiction du modèle
    let avgPromptTokens = 0;
    let avgResponseTokens = 0;
    let avgTotalDuration = 0;
    let avgResponseDuration = 0;
    let avgWordCount = 0;
    let avgReadingTime = 0;
    
    // Compter les échanges avec énergie pour statistiques
    let rowsWithEnergy = 0;
    datasetData.forEach((row, index) => {
      const energy = parseFloat(row.energy_consumption_llm_total) || 0;
      if (energy > 0) {
        rowsWithEnergy++;
      }
    });
    
    // Calculer les moyennes depuis les données
    if (totalMeasures > 0) {
      avgPromptTokens = datasetData.reduce((sum, d) => sum + (parseInt(d.prompt_token_length || d.promptTokens || 0)), 0) / totalMeasures;
      avgResponseTokens = datasetData.reduce((sum, d) => sum + (parseInt(d.response_token_length || d.responseTokens || 0)), 0) / totalMeasures;
      avgTotalDuration = datasetData.reduce((sum, d) => sum + (parseFloat(d.total_duration || d.totalDuration || 0)), 0) / totalMeasures;
      avgResponseDuration = datasetData.reduce((sum, d) => sum + (parseFloat(d.response_duration || d.responseDuration || 0)), 0) / totalMeasures;
      avgWordCount = datasetData.reduce((sum, d) => sum + (parseInt(d.word_count || d.wordCount || 0)), 0) / totalMeasures;
      avgReadingTime = datasetData.reduce((sum, d) => sum + (parseFloat(d.reading_time || d.readingTime || 0)), 0) / totalMeasures;
    }
    
    // Calculer l'énergie par échange avec le modèle (Watsonx → serveur local → modèle local)
    let energyPerExchange = 0;
    let predictionSource = 'local';
    const globalIntensity = carbonIntensityData?.countries?.global_average?.intensity || 480;
    
    // Vérifier si on a toutes les données pour Watsonx/serveur local
    const hasAllData = avgTotalDuration > 0 && avgResponseDuration > 0 && avgWordCount > 0 && avgReadingTime > 0;
    
    if (hasAllData && typeof predictEnergy === 'function') {
      try {
        // Obtenir le mode de prédiction
        const predictionMode = await getPredictionMode();
        
        // Essayer Watsonx si configuré
        if (predictionMode === 'watsonx' && window.WatsonxService && window.WatsonxService.predictEnergyWithDeployedModel) {
          try {
            energyPerExchange = await window.WatsonxService.predictEnergyWithDeployedModel({
              totalDuration: avgTotalDuration,
              promptTokens: avgPromptTokens,
              responseTokens: avgResponseTokens,
              responseDuration: avgResponseDuration,
              wordCount: avgWordCount,
              readingTime: avgReadingTime
            });
            if (energyPerExchange !== null && !isNaN(energyPerExchange) && energyPerExchange > 0) {
              predictionSource = 'deployed';
            }
          } catch (error) {
            console.warn('⚠️ Erreur prédiction Watsonx dans vue d\'ensemble, fallback:', error);
          }
        }
        
        // Essayer serveur local si mode server
        if (energyPerExchange === 0 && predictionMode === 'server' && window.ServerPredictor) {
          try {
            energyPerExchange = await window.ServerPredictor.predict({
              totalDuration: avgTotalDuration,
              promptTokens: avgPromptTokens,
              responseTokens: avgResponseTokens,
              responseDuration: avgResponseDuration,
              wordCount: avgWordCount,
              readingTime: avgReadingTime
            });
            if (energyPerExchange !== null && !isNaN(energyPerExchange) && energyPerExchange > 0) {
              predictionSource = 'server';
            }
          } catch (error) {
            console.warn('⚠️ Erreur prédiction serveur local dans vue d\'ensemble, fallback:', error);
          }
        }
        
        // Fallback vers predictEnergy complète
        if (energyPerExchange === 0) {
          energyPerExchange = await predictEnergy(
            'unknown',
            avgPromptTokens,
            avgResponseTokens,
            avgTotalDuration,
            avgResponseDuration,
            avgWordCount,
            avgReadingTime
          );
        }
      } catch (error) {
        console.warn('⚠️ Erreur prédiction dans vue d\'ensemble, utilisation moyenne historique:', error);
      }
    }
    
    // Si toujours 0, utiliser la moyenne historique par échange
    if (energyPerExchange === 0 || isNaN(energyPerExchange)) {
      const historicalTotalEnergy = datasetData.reduce((sum, d) => sum + (parseFloat(d.energy_consumption_llm_total) || 0), 0);
      energyPerExchange = totalMeasures > 0 ? historicalTotalEnergy / totalMeasures : 0;
      predictionSource = 'historical';
    }
    
    // Calculer l'énergie totale et CO₂ total depuis les prédictions du modèle
    // Utiliser l'énergie prédite par échange × nombre total d'échanges
    const totalEnergyJoules = energyPerExchange * totalMeasures;
    const totalEnergyKwhCalculated = totalEnergyJoules / 3600000;
    const totalCO2 = totalEnergyKwhCalculated * globalIntensity; // en grammes
    const totalCO2KgCalculated = totalCO2 / 1000;
    
    console.log('📊 Résultats calculs (basés sur prédictions du modèle):', {
      totalMeasures,
      energyPerExchange,
      energyPerExchangeKwh: energyPerExchange / 3600000,
      totalEnergyJoules,
      totalEnergyKwh: totalEnergyKwhCalculated,
      totalCO2Grams: totalCO2,
      totalCO2Kg: totalCO2KgCalculated,
      carbonIntensity: globalIntensity,
      predictionSource,
      formula: `${totalMeasures} échanges × ${(energyPerExchange / 3600000).toFixed(8)} kWh/échange = ${totalEnergyKwhCalculated.toFixed(6)} kWh`,
      co2Formula: `${totalEnergyKwhCalculated.toFixed(6)} kWh × ${globalIntensity} gCO₂/kWh = ${totalCO2.toFixed(2)} g`
    });
    
    const totalEnergyKwh = totalEnergyJoules / 3600000;
    
    console.log('📊 Calculs énergie vue d\'ensemble:', {
      totalEnergyJoules,
      totalEnergyKwh,
      totalMeasures,
      avgPerExchange: totalMeasures > 0 ? totalEnergyJoules / totalMeasures : 0
    });
    
    // Calculer la période de collecte (en jours)
    const timestamps = datasetData.map(d => d.timestamp || Date.now()).filter(Boolean);
    const minTimestamp = Math.min(...timestamps);
    const maxTimestamp = Math.max(...timestamps);
    let daysDiff = Math.max(1, (maxTimestamp - minTimestamp) / (1000 * 60 * 60 * 24));
    
    // Si période très courte (< 1 jour), estimer à partir de la fréquence observée
    if (daysDiff < 1 && totalMeasures > 0) {
      // Si on a plusieurs échanges en moins d'un jour, extrapoler
      daysDiff = Math.max(1, totalMeasures / 1.5); // Estimation conservatrice
    }
    
    const daysInMonth = 30;
    
    // Calculer la consommation mensuelle moyenne
    let monthlyEnergyKwh = (totalEnergyKwh / daysDiff) * daysInMonth;
    
    // Si pas assez de données, utiliser une estimation basée sur la moyenne par échange
    if (totalMeasures > 0 && monthlyEnergyKwh === 0) {
      const avgEnergyPerExchange = totalEnergyKwh / totalMeasures;
      // Estimation: 4 échanges par jour en moyenne
      monthlyEnergyKwh = avgEnergyPerExchange * 4 * daysInMonth;
    }
    
    // Estimer le nombre d'échanges par jour pour la prédiction annuelle
    const exchangesPerDayForPrediction = daysDiff > 0 ? totalMeasures / daysDiff : 7.7; // Utiliser la valeur observée
    const projectedExchanges = Math.round(exchangesPerDayForPrediction * 365);
    
    // Calculer la prédiction annuelle en utilisant la même énergie par échange que pour le total
    // (déjà calculée ci-dessus avec le modèle Watsonx/serveur local/modèle local)
    const annualEnergyJoules = energyPerExchange * projectedExchanges;
    let annualEnergyKwh = annualEnergyJoules / 3600000;
    
    // Recalculer monthlyEnergyKwh depuis annualEnergyKwh pour cohérence
    monthlyEnergyKwh = annualEnergyKwh / 12;
    
    console.log('📊 Prédiction annuelle vue d\'ensemble (basée sur prédictions du modèle):', {
      avgPromptTokens,
      avgResponseTokens,
      exchangesPerDay: exchangesPerDayForPrediction,
      projectedExchanges,
      energyPerExchange,
      energyPerExchangeKwh: energyPerExchange / 3600000,
      annualEnergyKwh,
      predictionSource,
      formula: `${projectedExchanges} échanges × ${(energyPerExchange / 3600000).toFixed(8)} kWh/échange = ${annualEnergyKwh.toFixed(6)} kWh`
    });
    
    // Calculer les statistiques supplémentaires
    let totalTokens = 0;
    let totalPromptTokens = 0;
    let totalResponseTokens = 0;
    datasetData.forEach(row => {
      const promptTokens = parseInt(row.prompt_token_length || row.promptTokens || 0);
      const responseTokens = parseInt(row.response_token_length || row.responseTokens || 0);
      totalPromptTokens += promptTokens;
      totalResponseTokens += responseTokens;
      totalTokens += promptTokens + responseTokens;
    });
    
    const avgEnergyPerExchangeJoules = totalMeasures > 0 ? totalEnergyJoules / totalMeasures : 0;
    const avgEnergyPerExchange = avgEnergyPerExchangeJoules / 3600000; // en kWh
    const avgTokensPerExchange = totalMeasures > 0 ? totalTokens / totalMeasures : 0;
    const exchangesPerDay = daysDiff > 0 ? totalMeasures / daysDiff : 0;
    
    // Calculer les statistiques par plateforme
    const platformStats = {};
    const globalIntensityForStats = carbonIntensityData?.countries?.global_average?.intensity || 480;
    datasetData.forEach(row => {
      const platform = row.platform || 'unknown';
      if (!platformStats[platform]) {
        platformStats[platform] = { count: 0, energy: 0, tokens: 0, co2: 0 };
      }
      platformStats[platform].count++;
      const energy = parseFloat(row.energy_consumption_llm_total) || 0;
      platformStats[platform].energy += energy;
      platformStats[platform].tokens += parseInt(row.prompt_token_length || row.promptTokens || 0) + 
                                         parseInt(row.response_token_length || row.responseTokens || 0);
      // Recalculer CO₂ depuis l'énergie pour garantir la cohérence
      if (energy > 0) {
        const energyKwh = energy / 3600000;
        platformStats[platform].co2 += energyKwh * globalIntensityForStats;
      } else if (row.co2_grams) {
        platformStats[platform].co2 += parseFloat(row.co2_grams) || 0;
      }
    });
    
    // Calculer les statistiques par modèle
    const modelStats = {};
    const globalIntensityForModelStats = carbonIntensityData?.countries?.global_average?.intensity || 480;
    datasetData.forEach(row => {
      const model = row.model_name || row.model || 'unknown';
      if (!modelStats[model]) {
        modelStats[model] = { count: 0, energy: 0, tokens: 0, co2: 0 };
      }
      modelStats[model].count++;
      const energy = parseFloat(row.energy_consumption_llm_total) || 0;
      modelStats[model].energy += energy;
      modelStats[model].tokens += parseInt(row.prompt_token_length || row.promptTokens || 0) + 
                                   parseInt(row.response_token_length || row.responseTokens || 0);
      // Recalculer CO₂ depuis l'énergie pour garantir la cohérence
      if (energy > 0) {
        const energyKwh = energy / 3600000;
        modelStats[model].co2 += energyKwh * globalIntensityForModelStats;
      } else if (row.co2_grams) {
        modelStats[model].co2 += parseFloat(row.co2_grams) || 0;
      }
    });
    
    // Mettre à jour les stats principales
    const totalMeasuresEl = document.getElementById('total-measures');
    const totalEnergyEl = document.getElementById('total-energy');
    const totalCO2El = document.getElementById('total-co2');
    const annualPredictionEl = document.getElementById('annual-prediction-energy');
    
    if (totalMeasuresEl) {
      totalMeasuresEl.textContent = totalMeasures.toLocaleString();
      const subtitle = document.getElementById('total-measures-subtitle');
      if (subtitle) {
        subtitle.textContent = `~${exchangesPerDay.toFixed(1)} échanges/jour`;
      }
    }
    if (totalEnergyEl) {
      // Utiliser le formatage adaptatif
      const energyFormatted = formatEnergyAdaptive(totalEnergyJoules);
      totalEnergyEl.textContent = energyFormatted.value;
      const subtitle = document.getElementById('total-energy-subtitle');
      if (subtitle) {
        // Afficher aussi en Joules pour référence
        subtitle.textContent = `${energyFormatted.unit} (${totalEnergyJoules.toFixed(1)} J)`;
      }
      // Mettre à jour l'unité dans le label si présent
      const totalEnergyUnitEl = document.querySelector('#total-energy').nextElementSibling;
      if (totalEnergyUnitEl && totalEnergyUnitEl.classList.contains('unit')) {
        totalEnergyUnitEl.textContent = energyFormatted.unit;
      }
    }
    if (totalCO2El) {
      const totalCO2Kg = totalCO2 / 1000;
      // Si très petit (< 0.01 kg), afficher avec plus de décimales ou en grammes
      if (totalCO2Kg < 0.01 && totalCO2Kg > 0) {
        // Afficher avec 4 décimales pour les très petites valeurs
        totalCO2El.textContent = totalCO2Kg.toFixed(4);
      } else if (totalCO2Kg >= 0.01) {
        // Afficher avec 2 décimales pour les valeurs normales
        totalCO2El.textContent = totalCO2Kg.toFixed(2);
      } else {
        // Si 0, afficher 0.00
        totalCO2El.textContent = '0.00';
      }
      const subtitle = document.getElementById('total-co2-subtitle');
      if (subtitle) {
        // Toujours afficher en grammes dans le sous-titre
        subtitle.textContent = `${totalCO2.toFixed(0)} g`;
      }
    }
    if (annualPredictionEl) {
      // Utiliser le formatage adaptatif pour l'énergie annuelle
      const annualEnergyJoules = annualEnergyKwh * 3600000;
      const annualFormatted = formatEnergyAdaptive(annualEnergyJoules);
      annualPredictionEl.textContent = annualFormatted.value;
      const subtitle = document.getElementById('annual-prediction-subtitle');
      if (subtitle) {
        // Calculer le CO₂ depuis l'énergie annuelle avec l'intensité carbone globale
        const globalIntensityForAnnual = carbonIntensityData?.countries?.global_average?.intensity || 480;
        const co2Grams = annualEnergyKwh * globalIntensityForAnnual;
        const co2Kg = co2Grams / 1000;
        // Afficher avec plus de décimales si très petit
        if (co2Kg < 0.01 && co2Kg > 0) {
          subtitle.textContent = `${annualFormatted.unit}/an (~${co2Kg.toFixed(4)} kg CO₂/an)`;
        } else {
          subtitle.textContent = `${annualFormatted.unit}/an (~${co2Kg.toFixed(2)} kg CO₂/an)`;
        }
      }
      // Mettre à jour l'unité dans le label si présent
      const annualUnitEl = document.querySelector('#annual-prediction-energy').nextElementSibling;
      if (annualUnitEl && annualUnitEl.classList.contains('unit')) {
        annualUnitEl.textContent = `${annualFormatted.unit}/an`;
      }
    }
    
    // Mettre à jour les stats détaillées
    const monthlyEnergyEl = document.getElementById('monthly-energy');
    const totalTokensEl = document.getElementById('total-tokens');
    const avgEnergyEl = document.getElementById('avg-energy-per-exchange');
    const collectionPeriodEl = document.getElementById('collection-period');
    
    if (monthlyEnergyEl) {
      // Utiliser le formatage adaptatif pour l'énergie mensuelle
      const monthlyEnergyJoules = monthlyEnergyKwh * 3600000;
      const monthlyFormatted = formatEnergyAdaptive(monthlyEnergyJoules);
      monthlyEnergyEl.textContent = monthlyFormatted.value;
      const subtitle = document.getElementById('monthly-energy-subtitle');
      if (subtitle) {
        // Calculer le CO₂ depuis l'énergie mensuelle avec l'intensité carbone globale
        const globalIntensityForMonthly = carbonIntensityData?.countries?.global_average?.intensity || 480;
        const co2Grams = monthlyEnergyKwh * globalIntensityForMonthly;
        const co2Kg = co2Grams / 1000;
        // Afficher avec plus de décimales si très petit
        if (co2Kg < 0.01 && co2Kg > 0) {
          subtitle.textContent = `${monthlyFormatted.unit}/mois (~${co2Kg.toFixed(4)} kg CO₂/mois)`;
        } else {
          subtitle.textContent = `${monthlyFormatted.unit}/mois (~${co2Kg.toFixed(2)} kg CO₂/mois)`;
        }
      }
      // Mettre à jour l'unité dans le label si présent
      const monthlyUnitEl = document.querySelector('#monthly-energy').nextElementSibling;
      if (monthlyUnitEl && monthlyUnitEl.classList.contains('unit')) {
        monthlyUnitEl.textContent = `${monthlyFormatted.unit}/mois`;
      }
    }
    if (totalTokensEl) {
      totalTokensEl.textContent = totalTokens.toLocaleString();
      const subtitle = document.getElementById('total-tokens-subtitle');
      if (subtitle) {
        subtitle.textContent = `${totalPromptTokens.toLocaleString()} prompt + ${totalResponseTokens.toLocaleString()} réponse`;
      }
    }
    if (avgEnergyEl) {
      // Utiliser le formatage adaptatif pour l'énergie moyenne
      const avgEnergyFormatted = formatEnergyAdaptive(avgEnergyPerExchangeJoules);
      avgEnergyEl.textContent = avgEnergyFormatted.value;
      const subtitle = document.getElementById('avg-energy-subtitle');
      if (subtitle) {
        subtitle.textContent = `${avgEnergyFormatted.unit} (${avgEnergyPerExchangeJoules.toFixed(2)} J)`;
      }
      // Mettre à jour l'unité dans le label si présent
      const avgEnergyLabel = document.querySelector('[for="avg-energy"]');
      if (avgEnergyLabel && avgEnergyLabel.textContent.includes('kWh')) {
        avgEnergyLabel.textContent = avgEnergyLabel.textContent.replace('kWh', avgEnergyFormatted.unit);
      }
    }
    const avgTokensEl = document.getElementById('avg-tokens-per-exchange');
    if (avgTokensEl) {
      avgTokensEl.textContent = avgTokensPerExchange.toFixed(0);
      const subtitle = document.getElementById('avg-tokens-subtitle');
      if (subtitle) {
        subtitle.textContent = `~${avgTokensPerExchange.toFixed(0)} tokens/échange`;
      }
    }
    if (collectionPeriodEl) {
      collectionPeriodEl.textContent = Math.round(daysDiff);
      const subtitle = document.getElementById('collection-period-subtitle');
      if (subtitle) {
        const startDate = new Date(minTimestamp);
        const endDate = new Date(maxTimestamp);
        subtitle.textContent = `${startDate.toLocaleDateString('fr-FR')} → ${endDate.toLocaleDateString('fr-FR')}`;
      }
    }
    
    // Afficher les statistiques par plateforme
    displayPlatformStats(platformStats, totalMeasures, totalEnergyKwh, totalCO2 / 1000);
    
    // Afficher les statistiques par modèle
    displayModelStats(modelStats, totalMeasures, totalEnergyKwh, totalCO2 / 1000);
    
    // Générer les conseils
    generateAdvice(totalEnergyKwh, monthlyEnergyKwh, annualEnergyKwh, totalCO2 / 1000);
    
    // Charger les graphiques
    loadConsumptionTrendChart();
    loadLongTermPredictionChart(monthlyEnergyKwh);
    loadReferenceComparisonChart(monthlyEnergyKwh);
    
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';
  } catch (error) {
    console.error('Erreur chargement vue d\'ensemble:', error);
    const loading = document.getElementById('overview-loading');
    if (loading) {
      loading.innerHTML = `<div style="padding: 20px; color: red;">Erreur: ${error.message}</div>`;
    }
  }
}

/**
 * Afficher les statistiques par plateforme
 */
function displayPlatformStats(platformStats, totalMeasures, totalEnergyKwh, totalCO2kg) {
  const platformStatsEl = document.getElementById('platform-stats');
  if (!platformStatsEl) return;
  
  const platforms = Object.keys(platformStats).sort((a, b) => platformStats[b].count - platformStats[a].count);
  
  if (platforms.length === 0) {
    platformStatsEl.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">Aucune donnée de plateforme disponible</p>';
    return;
  }
  
  platformStatsEl.innerHTML = platforms.map(platform => {
    const stats = platformStats[platform];
    const energyJoules = stats.energy;
    const energyKwh = energyJoules / 3600000;
    const percentage = totalMeasures > 0 ? (stats.count / totalMeasures * 100).toFixed(1) : 0;
    const energyPercentage = totalEnergyKwh > 0 ? (energyKwh / totalEnergyKwh * 100).toFixed(1) : 0;
    
    return `
      <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-left: 4px solid #667eea;">
        <h4 style="margin-bottom: 15px; color: #333;">${platform}</h4>
        <div style="margin-bottom: 10px;">
          <strong>Échanges:</strong> ${stats.count.toLocaleString()} (${percentage}%)
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Énergie:</strong> ${formatEnergyAdaptive(energyJoules).display} (${energyPercentage}%)
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Tokens:</strong> ${stats.tokens.toLocaleString()}
        </div>
        <div>
          <strong>CO₂:</strong> ${(stats.co2 / 1000).toFixed(3)} kg
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Afficher les statistiques par modèle
 */
function displayModelStats(modelStats, totalMeasures, totalEnergyKwh, totalCO2kg) {
  const modelStatsEl = document.getElementById('model-stats');
  if (!modelStatsEl) return;
  
  const models = Object.keys(modelStats).sort((a, b) => modelStats[b].count - modelStats[a].count);
  
  if (models.length === 0) {
    modelStatsEl.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">Aucune donnée de modèle disponible</p>';
    return;
  }
  
  modelStatsEl.innerHTML = models.map(model => {
    const stats = modelStats[model];
    const energyJoules = stats.energy;
    const energyKwh = energyJoules / 3600000;
    const percentage = totalMeasures > 0 ? (stats.count / totalMeasures * 100).toFixed(1) : 0;
    const energyPercentage = totalEnergyKwh > 0 ? (energyKwh / totalEnergyKwh * 100).toFixed(1) : 0;
    const avgEnergyPerExchangeJoules = stats.count > 0 ? energyJoules / stats.count : 0;
    
    return `
      <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-left: 4px solid #764ba2;">
        <h4 style="margin-bottom: 15px; color: #333;">${model}</h4>
        <div style="margin-bottom: 10px;">
          <strong>Échanges:</strong> ${stats.count.toLocaleString()} (${percentage}%)
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Énergie:</strong> ${formatEnergyAdaptive(energyJoules).display} (${energyPercentage}%)
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Énergie/échange:</strong> ${formatEnergyAdaptive(avgEnergyPerExchangeJoules).display}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Tokens:</strong> ${stats.tokens.toLocaleString()}
        </div>
        <div>
          <strong>CO₂:</strong> ${(stats.co2 / 1000).toFixed(3)} kg
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Charger le graphique énergie par modèle
 */
function loadEnergyModelsChart() {
  const ctx = document.getElementById('chart-energy-models');
  if (!ctx) return;
  
  // Grouper par modèle
  const byModel = {};
  datasetData.forEach(row => {
    const model = row.model_name || row.model || 'unknown';
    if (!byModel[model]) {
      byModel[model] = { total: 0, count: 0 };
    }
    byModel[model].total += parseFloat(row.energy_consumption_llm_total) || 0;
    byModel[model].count++;
  });
  
  const labels = Object.keys(byModel);
  const data = labels.map(model => byModel[model].total / byModel[model].count);
  
  if (charts['energy-models']) {
    charts['energy-models'].destroy();
  }
  
  charts['energy-models'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Énergie moyenne (J)',
        data: data,
        backgroundColor: 'rgba(102, 126, 234, 0.8)',
        borderColor: 'rgba(102, 126, 234, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Énergie (Joules)'
          }
        }
      }
    }
  });
}

/**
 * Charger le graphique modèles vs GPUs
 */
function loadModelsGPUsChart() {
  const ctx = document.getElementById('chart-models-gpus');
  if (!ctx) return;
  
  // Grouper par modèle et hardware
  const dataMap = {};
  datasetData.forEach(row => {
    const model = row.model_name || row.model || 'unknown';
    const hardware = row.hardware_type || 'unknown';
    const key = `${model}-${hardware}`;
    
    if (!dataMap[key]) {
      dataMap[key] = { model, hardware, total: 0, count: 0 };
    }
    dataMap[key].total += parseFloat(row.energy_consumption_llm_total) || 0;
    dataMap[key].count++;
  });
  
  // Préparer les données pour le graphique
  const hardwareTypes = [...new Set(datasetData.map(d => d.hardware_type).filter(Boolean))];
  const models = [...new Set(datasetData.map(d => d.model_name || d.model).filter(Boolean))];
  
  const datasets = hardwareTypes.map((hardware, index) => {
    const data = models.map(model => {
      const key = `${model}-${hardware}`;
      const item = dataMap[key];
      return item ? item.total / item.count : 0;
    });
    
    const colors = [
      'rgba(102, 126, 234, 0.8)',
      'rgba(118, 75, 162, 0.8)',
      'rgba(255, 99, 132, 0.8)',
      'rgba(54, 162, 235, 0.8)'
    ];
    
    return {
      label: hardware,
      data: data,
      backgroundColor: colors[index % colors.length],
      borderColor: colors[index % colors.length].replace('0.8', '1'),
      borderWidth: 1
    };
  });
  
  if (charts['models-gpus']) {
    charts['models-gpus'].destroy();
  }
  
  charts['models-gpus'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: models,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Énergie moyenne (J)'
          }
        }
      }
    }
  });
}

/**
 * Charger la comparaison des modèles
 */
async function loadModelComparison() {
  try {
    // Charger les données locales
    datasetData = await loadLocalDatasetData();
    
    if (!datasetData || datasetData.length === 0) {
      const modelsContent = document.getElementById('models-content');
      if (modelsContent) {
        modelsContent.innerHTML = `
          <div style="padding: 40px; text-align: center;">
            <h3>📊 Aucune donnée disponible</h3>
            <p style="margin: 20px 0; color: #666;">
              Les données seront collectées automatiquement lors de vos interactions avec ChatGPT, Claude ou Gemini.
            </p>
          </div>
        `;
      }
      return;
    }
    
    const hardwareFilter = document.getElementById('filter-hardware-models')?.value || 'all';
    const sizeFilter = document.getElementById('filter-size-models')?.value || 'all';
    
    // Calculer les statistiques par modèle depuis les données locales
    const byModel = {};
    datasetData.forEach(row => {
      // Appliquer le filtre hardware
      if (hardwareFilter !== 'all' && row.hardware_type !== hardwareFilter) {
        return;
      }
      
      const model = row.model_name || row.model || 'unknown';
      if (!byModel[model]) {
        byModel[model] = {
          model,
          count: 0,
          totalEnergy: 0,
          totalTokens: 0,
          avgEnergyPerToken: 0,
          hardwareTypes: new Set()
        };
      }
      
      const stats = byModel[model];
      stats.count++;
      stats.totalEnergy += parseFloat(row.energy_consumption_llm_total || row.energyJoules || 0);
      stats.totalTokens += parseFloat(row.prompt_token_length || row.promptTokens || 0) + 
                          parseFloat(row.response_token_length || row.responseTokens || 0);
      
      if (row.hardware_type) {
        stats.hardwareTypes.add(row.hardware_type);
      }
    });
    
    // Calculer les moyennes
    let stats = Object.values(byModel).map(s => ({
      ...s,
      avgEnergyPerToken: s.totalTokens > 0 ? s.totalEnergy / s.totalTokens : 0,
      hardwareTypes: Array.from(s.hardwareTypes)
    }));
    
    // Filtrer par taille si nécessaire
    if (sizeFilter !== 'all') {
      stats = stats.filter(s => {
        const size = detectModelSize(s.model);
        return size === sizeFilter;
      });
    }
    
    // Mettre à jour le graphique
    updateEnergyPerTokenChart(stats);
    
    // Mettre à jour le tableau
    updateModelsTable(stats);
  } catch (error) {
    console.error('Erreur chargement comparaison modèles:', error);
  }
}

/**
 * Charger la comparaison des hardware
 */
async function loadHardwareComparison() {
  try {
    // Charger les données locales
    datasetData = await loadLocalDatasetData();
    
    if (!datasetData || datasetData.length === 0) {
      const hardwareContent = document.getElementById('hardware-content');
      if (hardwareContent) {
        hardwareContent.innerHTML = `
          <div style="padding: 40px; text-align: center;">
            <h3>📊 Aucune donnée disponible</h3>
            <p style="margin: 20px 0; color: #666;">
              Les données seront collectées automatiquement lors de vos interactions avec ChatGPT, Claude ou Gemini.
            </p>
          </div>
        `;
      }
      return;
    }
    
    const modelFilter = document.getElementById('filter-model-hardware')?.value || 'all';
    
    // Calculer les statistiques par hardware depuis les données locales
    const byHardware = {};
    datasetData.forEach(row => {
      // Appliquer le filtre modèle
      if (modelFilter !== 'all' && (row.model_name || row.model) !== modelFilter) {
        return;
      }
      
      const hardware = row.hardware_type || 'unknown';
      if (!byHardware[hardware]) {
        byHardware[hardware] = {
          hardware,
          count: 0,
          totalEnergy: 0,
          avgEnergy: 0,
          models: new Set()
        };
      }
      
      const stats = byHardware[hardware];
      stats.count++;
      stats.totalEnergy += parseFloat(row.energy_consumption_llm_total || row.energyJoules || 0);
      
      if (row.model_name || row.model) {
        stats.models.add(row.model_name || row.model);
      }
    });
    
    // Calculer les moyennes
    const stats = Object.values(byHardware).map(s => ({
      ...s,
      avgEnergy: s.count > 0 ? s.totalEnergy / s.count : 0,
      models: Array.from(s.models)
    }));
    
    // Mettre à jour le graphique
    updateHardwareChart(stats);
    
    // Mettre à jour le tableau
    updateHardwareTable(stats);
  } catch (error) {
    console.error('Erreur chargement comparaison hardware:', error);
  }
}

/**
 * Charger la comparaison des mix énergétiques
 */
async function loadEnergyComparison() {
  try {
    // Charger les données locales
    datasetData = await loadLocalDatasetData();
    
    // Vérifier que les éléments existent
    const countrySelect = document.getElementById('filter-energy-mix');
    const modelSelect = document.getElementById('filter-model-energy');
    
    if (!countrySelect || !modelSelect) {
      console.warn('⚠️ Filtres non disponibles pour loadEnergyComparison');
      return;
    }
    
    if (!datasetData || datasetData.length === 0) {
      const energyContent = document.getElementById('energy-content');
      if (energyContent) {
        energyContent.innerHTML = `
          <div style="padding: 40px; text-align: center;">
            <h3>📊 Aucune donnée disponible</h3>
            <p style="margin: 20px 0; color: #666;">
              Les données seront collectées automatiquement lors de vos interactions avec ChatGPT, Claude ou Gemini.
            </p>
          </div>
        `;
      }
      return;
    }
    
    const country = countrySelect.value;
    const modelFilter = modelSelect.value;
    
    // Calculer le CO₂ pour chaque pays
    const countries = Object.keys(carbonIntensityData?.countries || {});
    const co2Data = [];
    
    datasetData.forEach(row => {
      if (modelFilter !== 'all' && (row.model_name || row.model) !== modelFilter) {
        return;
      }
      
      // Utiliser co2_grams si disponible, sinon calculer depuis l'énergie
      let energy = parseFloat(row.energy_consumption_llm_total || row.energyJoules || 0);
      const energyKwh = energy / 3600000;
      
      countries.forEach(countryCode => {
        const intensity = carbonIntensityData.countries[countryCode]?.intensity || 480;
        const co2 = energyKwh * intensity;
        
        if (!co2Data[countryCode]) {
          co2Data[countryCode] = {
            country: countryCode,
            intensity: intensity,
            total: 0,
            count: 0
          };
        }
        co2Data[countryCode].total += co2;
        co2Data[countryCode].count++;
      });
    });
    
    // Mettre à jour les graphiques
    updateCO2CountriesChart(Object.values(co2Data));
    updateCO2ImpactChart(Object.values(co2Data));
  } catch (error) {
    console.error('Erreur chargement comparaison énergie:', error);
  }
}

/**
 * Configurer le bouton de comparaison
 */
function setupCompareButton() {
  const compareBtn = document.getElementById('btn-compare-models');
  if (compareBtn) {
    compareBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await compareModels();
    });
  }
}

/**
 * Configurer les boutons de prédictions
 */
function setupPredictionsButtons() {
  // Radio buttons pour choisir la source de données
  document.querySelectorAll('input[name="data-source"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const source = e.target.value;
      const localSection = document.getElementById('local-data-section');
      const importSection = document.getElementById('import-data-section');
      
      if (source === 'local') {
        localSection.style.display = 'block';
        importSection.style.display = 'none';
      } else {
        localSection.style.display = 'none';
        importSection.style.display = 'block';
      }
    });
  });
  
  // Radio buttons pour choisir le modèle de prédiction
  document.querySelectorAll('input[name="prediction-model"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const model = e.target.value;
      if (model === 'server') {
        await checkServerStatus();
      } else {
        // Masquer le statut du serveur si un autre modèle est sélectionné
        const serverStatusDiv = document.getElementById('server-status');
        if (serverStatusDiv) {
          serverStatusDiv.style.display = 'none';
        }
      }
    });
  });
  
  // Bouton charger données locales
  const loadLocalBtn = document.getElementById('btn-load-local-data');
  if (loadLocalBtn) {
    loadLocalBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await loadLocalData();
    });
  }
  
  // Bouton lancer prédictions
  const runPredictionsBtn = document.getElementById('btn-run-predictions');
  if (runPredictionsBtn) {
    runPredictionsBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await runPredictions();
    });
  }
  
  // Input fichier CSV
  const csvInput = document.getElementById('csv-file-input');
  if (csvInput) {
    csvInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        console.log('📁 Fichier CSV sélectionné:', file.name);
      }
    });
  }
  
  console.log('✓ Boutons de prédictions configurés');
}

/**
 * Configurer le toggle de mode de prédiction
 */
function setupPredictionModeToggle() {
  // Charger le mode sauvegardé
  chrome.storage.local.get(['predictionMode'], (result) => {
    const savedMode = result.predictionMode || 'watsonx';
    const serverRadio = document.getElementById('toggle-server');
    const watsonxRadio = document.getElementById('toggle-watsonx');
    const toggleStatus = document.getElementById('toggle-status');
    
    if (serverRadio && watsonxRadio && toggleStatus) {
      if (savedMode === 'server') {
        serverRadio.checked = true;
        toggleStatus.textContent = 'Mode: Serveur Local (localhost:3000)';
        toggleStatus.style.background = '#d1ecf1';
        toggleStatus.style.color = '#0c5460';
      } else {
        watsonxRadio.checked = true;
        toggleStatus.textContent = 'Mode: Watsonx Direct';
        toggleStatus.style.background = '#e7f3ff';
        toggleStatus.style.color = '#0066cc';
      }
    }
  });
  
  // Écouter les changements
  document.querySelectorAll('input[name="prediction-mode"]').forEach(radio => {
    radio.addEventListener('change', async (e) => {
      const mode = e.target.value;
      await chrome.storage.local.set({ predictionMode: mode });
      
      const toggleStatus = document.getElementById('toggle-status');
      if (toggleStatus) {
        if (mode === 'server') {
          toggleStatus.textContent = 'Mode: Serveur Local (localhost:3000)';
          toggleStatus.style.background = '#d1ecf1';
          toggleStatus.style.color = '#0c5460';
        } else {
          toggleStatus.textContent = 'Mode: Watsonx Direct';
          toggleStatus.style.background = '#e7f3ff';
          toggleStatus.style.color = '#0066cc';
        }
      }
      
      console.log(`✓ Mode de prédiction changé: ${mode}`);
    });
  });
  
  console.log('✓ Toggle de mode de prédiction configuré');
}

/**
 * Obtenir le mode de prédiction actuel
 */
async function getPredictionMode() {
  const result = await chrome.storage.local.get(['predictionMode']);
  return result.predictionMode || 'watsonx';
}

/**
 * Configurer l'écouteur de messages du background
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_PREDICTIONS') {
      console.log('🔄 Message UPDATE_PREDICTIONS reçu, mise à jour des prédictions...');
      // Recharger les données avec les nouvelles prédictions
      loadOverview().then(() => {
        console.log('✅ Prédictions mises à jour');
      }).catch(error => {
        console.error('❌ Erreur mise à jour prédictions:', error);
      });
      sendResponse({ success: true });
      return true;
    }
  });
}

/**
 * Configurer les mises à jour en temps réel du dashboard
 */
function setupRealtimeUpdates() {
  // Écouter les changements dans chrome.storage
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    
    // Si conversationHistory ou currentSession change, mettre à jour l'affichage
    if (changes.conversationHistory || changes.currentSession || changes.totalStats) {
      const activeTab = document.querySelector('.tab-content.active');
      
      // Si une mise à jour des prédictions est nécessaire, la déclencher
      if (changes.predictionsNeedUpdate && changes.predictionsNeedUpdate.newValue === true) {
        console.log('🔄 Mise à jour automatique des prédictions déclenchée');
        // Réinitialiser le flag
        chrome.storage.local.set({ predictionsNeedUpdate: false });
        // Recharger les données et recalculer les prédictions
        if (activeTab && activeTab.id === 'overview-tab') {
          loadOverview();
        } else {
          // Si on n'est pas sur l'onglet overview, recharger quand même les données
          loadOverview();
        }
      }
      if (activeTab) {
        const tabId = activeTab.id;
        
        // Recharger les données selon l'onglet actif
        if (tabId === 'overview') {
          loadAllData();
        } else if (tabId === 'predictions') {
          // Recharger les données locales si on est dans l'onglet prédictions
          if (document.getElementById('local-data-section')?.style.display !== 'none') {
            loadLocalData();
          }
        }
      }
    }
  });
  
  console.log('✓ Mises à jour en temps réel configurées');
}

// Variable pour stocker les données chargées
let loadedPredictionData = [];

/**
 * Charger l'interface de prédictions
 */
function loadPredictionsInterface() {
  console.log('🔮 Interface de prédictions chargée');
  // Réinitialiser les données
  loadedPredictionData = [];
  document.getElementById('predictions-results').style.display = 'none';
  document.getElementById('local-data-info').textContent = '';
  
  // Vérifier le statut du serveur si l'option serveur est sélectionnée
  const serverOption = document.querySelector('input[name="prediction-model"][value="server"]');
  if (serverOption && serverOption.checked && window.ServerPredictor) {
    checkServerStatus();
  }
}

/**
 * Vérifier le statut du serveur local
 */
async function checkServerStatus() {
  if (!window.ServerPredictor) {
    return;
  }
  
  try {
    const health = await window.ServerPredictor.checkHealth();
    const serverStatusDiv = document.getElementById('server-status');
    const serverStatusText = document.getElementById('server-status-text');
    
    if (serverStatusDiv && serverStatusText) {
      if (health && health.hasConfig) {
        serverStatusDiv.style.display = 'block';
        serverStatusDiv.style.background = '#d4edda';
        serverStatusText.textContent = `✅ Serveur connecté (Région: ${health.region || 'N/A'})`;
      } else if (health) {
        serverStatusDiv.style.display = 'block';
        serverStatusDiv.style.background = '#fff3cd';
        serverStatusText.textContent = '⚠️ Serveur connecté mais configuration incomplète. Vérifiez le fichier .env';
      } else {
        serverStatusDiv.style.display = 'block';
        serverStatusDiv.style.background = '#f8d7da';
        serverStatusText.textContent = '❌ Serveur non disponible. Démarrez le serveur avec "npm run dev" ou "npm start"';
      }
    }
  } catch (error) {
    console.warn('⚠️ Erreur vérification serveur:', error);
    const serverStatusDiv = document.getElementById('server-status');
    const serverStatusText = document.getElementById('server-status-text');
    if (serverStatusDiv && serverStatusText) {
      serverStatusDiv.style.display = 'block';
      serverStatusDiv.style.background = '#f8d7da';
      serverStatusText.textContent = '❌ Serveur non disponible. Démarrez le serveur avec "npm run dev" ou "npm start"';
    }
  }
}

/**
 * Charger les données locales depuis chrome.storage
 */
async function loadLocalData() {
  try {
    showStatus('📦 Chargement des données locales...', 'info', 'predictions-status');
    
    const result = await chrome.storage.local.get(['conversationHistory', 'watsonxSyncQueue']);
    
    const history = result.conversationHistory || [];
    const queue = result.watsonxSyncQueue || [];
    
    // Combiner les deux sources
    const allData = [...history, ...queue];
    
    if (allData.length === 0) {
      showStatus('⚠️ Aucune donnée locale trouvée. Les données seront collectées automatiquement lors de vos interactions avec ChatGPT, Claude ou Gemini.', 'error', 'predictions-status');
      document.getElementById('local-data-info').textContent = 'Aucune donnée disponible';
      return;
    }
    
    // Filtrer et formater les données pour les prédictions
    loadedPredictionData = allData
      .filter(item => {
        // Vérifier que les champs requis sont présents
        return (item.prompt_token_length !== undefined || item.promptTokens !== undefined) && 
               (item.response_token_length !== undefined || item.responseTokens !== undefined) &&
               (item.total_duration !== undefined || item.totalDuration !== undefined);
      })
      .map(item => {
        // Normaliser les valeurs pour s'assurer qu'elles sont des nombres
        const normalizeNumber = (val, defaultValue = 0) => {
          if (val === null || val === undefined) return defaultValue;
          if (typeof val === 'number') return isNaN(val) ? defaultValue : val;
          const parsed = parseFloat(val);
          return isNaN(parsed) ? defaultValue : parsed;
        };
        
        return {
          id: item.id || `pred-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          model_name: item.model_name || item.model || 'unknown',
          platform: item.platform || 'unknown',
          total_duration: normalizeNumber(item.total_duration || item.totalDuration, 0),
          prompt_token_length: normalizeNumber(item.prompt_token_length || item.promptTokens, 0),
          response_token_length: normalizeNumber(item.response_token_length || item.responseTokens, 0),
          response_duration: normalizeNumber(item.response_duration || item.responseDuration, 0),
          word_count: normalizeNumber(item.word_count || item.wordCount, 0),
          reading_time: normalizeNumber(item.reading_time || item.readingTime, 0),
          prediction_source: item.prediction_source || item.predictionSource || 'local',
          energy_joules: item.energy_joules || item.energyJoules || 0,
          co2_grams: item.co2_grams || item.co2Grams || 0,
          timestamp: item.timestamp || Date.now()
        };
      });
    
    showStatus(`✅ ${loadedPredictionData.length} échanges chargés depuis les données locales`, 'success', 'predictions-status');
    document.getElementById('local-data-info').textContent = `${loadedPredictionData.length} échanges disponibles pour les prédictions`;
    
    console.log('📦 Données locales chargées:', loadedPredictionData.length);
    
  } catch (error) {
    console.error('❌ Erreur chargement données locales:', error);
    showStatus('❌ Erreur lors du chargement des données locales: ' + error.message, 'error', 'predictions-status');
  }
}

/**
 * Importer un fichier CSV
 */
async function importCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        
        if (lines.length < 2) {
          reject(new Error('Le fichier CSV doit contenir au moins un en-tête et une ligne de données'));
          return;
        }
        
        // Parser l'en-tête
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        // Vérifier les colonnes requises
        const requiredFields = ['total_duration', 'prompt_token_length', 'response_token_length'];
        const missingFields = requiredFields.filter(field => !headers.includes(field));
        
        if (missingFields.length > 0) {
          reject(new Error(`Colonnes manquantes: ${missingFields.join(', ')}`));
          return;
        }
        
        // Parser les données
        const data = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
          const row = {};
          
          headers.forEach((header, index) => {
            const value = values[index] || '';
            // Convertir en nombre si possible
            if (value && !isNaN(value)) {
              row[header] = parseFloat(value);
            } else {
              row[header] = value;
            }
          });
          
          // Vérifier que les champs requis sont présents
          if (row.total_duration !== undefined && 
              row.prompt_token_length !== undefined && 
              row.response_token_length !== undefined) {
            data.push({
              id: `csv-${i}-${Date.now()}`,
              model_name: row.model_name || 'imported',
              platform: row.platform || 'imported',
              total_duration: row.total_duration || 0,
              prompt_token_length: row.prompt_token_length || 0,
              response_token_length: row.response_token_length || 0,
              response_duration: row.response_duration || null,
              word_count: row.word_count || 0,
              reading_time: row.reading_time || 0,
              timestamp: Date.now()
            });
          }
        }
        
        resolve(data);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Erreur lors de la lecture du fichier'));
    reader.readAsText(file);
  });
}

/**
 * Lancer les prédictions
 */
async function runPredictions() {
  try {
    const dataSource = document.querySelector('input[name="data-source"]:checked').value;
    const predictionModel = document.querySelector('input[name="prediction-model"]:checked')?.value || 'random-forest';
    
    let dataToPredict = [];
    
    if (dataSource === 'local') {
      if (loadedPredictionData.length === 0) {
        showStatus('⚠️ Veuillez d\'abord charger les données locales', 'error', 'predictions-status');
        return;
      }
      dataToPredict = loadedPredictionData;
    } else {
      // Importer depuis CSV
      const fileInput = document.getElementById('csv-file-input');
      const file = fileInput.files[0];
      
      if (!file) {
        showStatus('⚠️ Veuillez sélectionner un fichier CSV', 'error', 'predictions-status');
        return;
      }
      
      try {
        dataToPredict = await importCSV(file);
        showStatus(`✅ ${dataToPredict.length} lignes importées depuis le CSV`, 'success', 'predictions-status');
      } catch (error) {
        showStatus('❌ Erreur import CSV: ' + error.message, 'error', 'predictions-status');
        return;
      }
    }
    
    if (dataToPredict.length === 0) {
      showStatus('⚠️ Aucune donnée à prédire', 'error', 'predictions-status');
      return;
    }
    
    showStatus(`🔄 Traitement de ${dataToPredict.length} prédictions...`, 'info', 'predictions-status');
    
    // Déterminer quel modèle utiliser
    const config = await chrome.storage.local.get(['watsonxConfig']);
    const predictionMode = await getPredictionMode();
    const hasDeployedModel = (predictionModel === 'deployed' || predictionModel === 'server') && 
                            config.watsonxConfig?.deploymentId && 
                            window.WatsonxService?.predictEnergyWithDeployedModel;
    
    // Vérifier le serveur local si sélectionné ET si mode serveur
    if (predictionModel === 'server' && predictionMode === 'server') {
      if (window.ServerPredictor) {
        const health = await window.ServerPredictor.checkHealth();
        if (!health || !health.hasConfig) {
          showStatus('⚠️ Serveur local non disponible ou non configuré. Vérifiez que le serveur tourne et que le .env est configuré.', 'error', 'predictions-status');
          const serverStatusDiv = document.getElementById('server-status');
          const serverStatusText = document.getElementById('server-status-text');
          if (serverStatusDiv && serverStatusText) {
            serverStatusDiv.style.display = 'block';
            serverStatusDiv.style.background = '#fff3cd';
            serverStatusText.textContent = '⚠️ Serveur non disponible. Démarrez le serveur avec "npm run dev" ou "npm start"';
          }
        } else {
          showStatus('✅ Serveur local disponible', 'success', 'predictions-status');
          const serverStatusDiv = document.getElementById('server-status');
          const serverStatusText = document.getElementById('server-status-text');
          if (serverStatusDiv && serverStatusText) {
            serverStatusDiv.style.display = 'block';
            serverStatusDiv.style.background = '#d4edda';
            serverStatusText.textContent = `✅ Serveur connecté (Région: ${health.region || 'N/A'})`;
          }
        }
      } else {
        showStatus('⚠️ ServerPredictor non disponible. Chargez server-predictor.js', 'error', 'predictions-status');
      }
    } else if (predictionMode === 'watsonx') {
      showStatus('✅ Mode Watsonx Direct activé', 'success', 'predictions-status');
    }
    
    // Initialiser le modèle Random Forest si nécessaire
    if (predictionModel === 'random-forest' && window.RandomForestPredictor) {
      if (!window.RandomForestPredictor.isInitialized()) {
        showStatus('🔄 Initialisation du modèle Random Forest...', 'info', 'predictions-status');
        await window.RandomForestPredictor.init();
      }
    }
    
    if (predictionModel === 'deployed' && !hasDeployedModel) {
      showStatus('⚠️ Modèle déployé non configuré, utilisation du modèle Random Forest local', 'error', 'predictions-status');
    }
    
    // Traiter chaque échange
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < dataToPredict.length; i++) {
      const item = dataToPredict[i];
      
      try {
        let energyJoules = null;
        let predictionSource = 'local';
        
        // Obtenir le mode de prédiction choisi
        const predictionMode = await getPredictionMode();
        
        // Utiliser le modèle sélectionné selon le mode
        if (predictionModel === 'server' && predictionMode === 'server' && window.ServerPredictor) {
          try {
            // S'assurer que toutes les valeurs sont des nombres valides
            const totalDuration = typeof item.total_duration === 'number' ? item.total_duration : (parseFloat(item.total_duration) || 0);
            const promptTokens = typeof item.prompt_token_length === 'number' ? item.prompt_token_length : (parseInt(item.prompt_token_length) || 0);
            const responseTokens = typeof item.response_token_length === 'number' ? item.response_token_length : (parseInt(item.response_token_length) || 0);
            const responseDuration = typeof item.response_duration === 'number' ? item.response_duration : (parseFloat(item.response_duration) || 0);
            const wordCount = typeof item.word_count === 'number' ? item.word_count : (parseInt(item.word_count) || 0);
            const readingTime = typeof item.reading_time === 'number' ? item.reading_time : (parseFloat(item.reading_time) || 0);
            
            // Log pour debug
            console.log(`📊 Données envoyées au serveur pour ${item.id}:`, {
              totalDuration,
              promptTokens,
              responseTokens,
              responseDuration,
              wordCount,
              readingTime
            });
            
            energyJoules = await window.ServerPredictor.predict({
              totalDuration,
              promptTokens,
              responseTokens,
              responseDuration,
              wordCount,
              readingTime
            });
            
            if (energyJoules !== null && energyJoules !== undefined && !isNaN(energyJoules)) {
              predictionSource = 'server';
            } else {
              console.warn(`⚠️ Prédiction serveur retournée invalide pour ${item.id}:`, energyJoules);
            }
          } catch (error) {
            console.warn(`⚠️ Erreur prédiction serveur pour ${item.id}, fallback vers Watsonx:`, error);
          }
        }
        
        // Si mode Watsonx ou si serveur a échoué, utiliser Watsonx
        if ((predictionMode === 'watsonx' || (energyJoules === null || energyJoules === undefined)) && 
            (predictionModel === 'deployed' || predictionModel === 'server') && 
            hasDeployedModel) {
          try {
            energyJoules = await window.WatsonxService.predictEnergyWithDeployedModel({
              totalDuration: item.total_duration,
              promptTokens: item.prompt_token_length,
              responseTokens: item.response_token_length,
              responseDuration: item.response_duration || 0,
              wordCount: item.word_count || 0,
              readingTime: item.reading_time || 0
            });
            
            if (energyJoules !== null && energyJoules !== undefined) {
              predictionSource = 'deployed';
            }
          } catch (error) {
            console.warn(`⚠️ Erreur prédiction déployée pour ${item.id}:`, error);
          }
        }
        
        // Utiliser le modèle Random Forest ou fallback
        if (energyJoules === null || energyJoules === undefined) {
          energyJoules = await predictEnergy(
            item.model_name,
            item.prompt_token_length,
            item.response_token_length,
            item.total_duration,
            item.response_duration,
            item.word_count,
            item.reading_time
          );
          
          // Déterminer la source selon le modèle utilisé
          if (predictionModel === 'server' && predictionSource === 'server') {
            // Déjà défini
          } else if (predictionModel === 'random-forest' && window.RandomForestPredictor?.isInitialized()) {
            predictionSource = 'random-forest';
          } else if (predictionModel === 'simplified') {
            predictionSource = 'simplified';
          } else {
            predictionSource = 'local';
          }
        }
        
        // Calculer CO₂
        const carbonIntensity = 480; // Global average
        const energyKwh = energyJoules / 3600000;
        const co2Grams = energyKwh * carbonIntensity;
        
        results.push({
          ...item,
          energyJoules,
          co2Grams,
          predictionSource,
          success: true
        });
        
        successCount++;
        
        // Mettre à jour le statut toutes les 10 prédictions
        if ((i + 1) % 10 === 0 || i === dataToPredict.length - 1) {
          showStatus(`🔄 Traitement: ${i + 1}/${dataToPredict.length} (${successCount} réussies, ${errorCount} erreurs)`, 'info', 'predictions-status');
        }
        
      } catch (error) {
        console.error(`❌ Erreur prédiction pour ${item.id}:`, error);
        results.push({
          ...item,
          error: error.message,
          success: false
        });
        errorCount++;
      }
    }
    
    // Afficher les résultats
    displayPredictionsResults(results, predictionModel);
    
    showStatus(`✅ Prédictions terminées: ${successCount} réussies, ${errorCount} erreurs`, 'success', 'predictions-status');
    
  } catch (error) {
    console.error('❌ Erreur lors des prédictions:', error);
    showStatus('❌ Erreur: ' + error.message, 'error', 'predictions-status');
  }
}

/**
 * Afficher les résultats des prédictions
 */
function displayPredictionsResults(results, predictionModel) {
  const resultsDiv = document.getElementById('predictions-results');
  const statsDiv = document.getElementById('predictions-stats');
  const tableBody = document.getElementById('predictions-table-body');
  
  resultsDiv.style.display = 'block';
  
  // Calculer les statistiques
  const successful = results.filter(r => r.success);
  const totalEnergy = successful.reduce((sum, r) => sum + (r.energyJoules || 0), 0);
  const totalCO2 = successful.reduce((sum, r) => sum + (r.co2Grams || 0), 0);
  const serverCount = successful.filter(r => r.predictionSource === 'server').length;
  const deployedCount = successful.filter(r => r.predictionSource === 'deployed').length;
  const randomForestCount = successful.filter(r => r.predictionSource === 'random-forest').length;
  const simplifiedCount = successful.filter(r => r.predictionSource === 'simplified').length;
  const localCount = successful.filter(r => r.predictionSource === 'local').length;
  
  statsDiv.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
        <strong>Total Prédictions</strong>
        <div style="font-size: 24px; margin-top: 5px;">${results.length}</div>
      </div>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
        <strong>Réussies</strong>
        <div style="font-size: 24px; margin-top: 5px; color: #28a745;">${successful.length}</div>
      </div>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
        <strong>Énergie Totale</strong>
        <div style="font-size: 24px; margin-top: 5px;">${totalEnergy.toFixed(6)} J</div>
      </div>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
        <strong>CO₂ Total</strong>
        <div style="font-size: 24px; margin-top: 5px;">${totalCO2.toFixed(6)} g</div>
      </div>
      ${serverCount > 0 ? `
      <div style="background: #d1ecf1; padding: 15px; border-radius: 8px;">
        <strong>🖥️ Serveur Local</strong>
        <div style="font-size: 24px; margin-top: 5px; color: #0c5460;">${serverCount}</div>
      </div>
      ` : ''}
      ${randomForestCount > 0 ? `
      <div style="background: #d4edda; padding: 15px; border-radius: 8px;">
        <strong>🌲 Random Forest</strong>
        <div style="font-size: 24px; margin-top: 5px; color: #28a745;">${randomForestCount}</div>
      </div>
      ` : ''}
      ${deployedCount > 0 ? `
      <div style="background: #e7f3ff; padding: 15px; border-radius: 8px;">
        <strong>☁️ Modèle Déployé</strong>
        <div style="font-size: 24px; margin-top: 5px; color: #0066cc;">${deployedCount}</div>
      </div>
      ` : ''}
      ${simplifiedCount > 0 ? `
      <div style="background: #fff3cd; padding: 15px; border-radius: 8px;">
        <strong>📊 Modèle Simplifié</strong>
        <div style="font-size: 24px; margin-top: 5px; color: #856404;">${simplifiedCount}</div>
      </div>
      ` : ''}
    </div>
  `;
  
  // Remplir le tableau
  tableBody.innerHTML = results.map((result, index) => {
    if (!result.success) {
      return `
        <tr style="background: #fee;">
          <td style="padding: 10px; border: 1px solid #ddd;">${result.id || index + 1}</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${result.model_name || 'N/A'}</td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">-</td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: right; color: #c33;">Erreur</td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">-</td>
          <td style="padding: 10px; border: 1px solid #ddd;">${result.error || 'Erreur inconnue'}</td>
        </tr>
      `;
    }
    
    let sourceBadge = '';
    if (result.predictionSource === 'server') {
      sourceBadge = '<span style="background: #0c5460; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">🖥️ Serveur</span>';
    } else if (result.predictionSource === 'deployed') {
      sourceBadge = '<span style="background: #0066cc; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">☁️ Déployé</span>';
    } else if (result.predictionSource === 'random-forest') {
      sourceBadge = '<span style="background: #28a745; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">🌲 Random Forest</span>';
    } else if (result.predictionSource === 'simplified') {
      sourceBadge = '<span style="background: #856404; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">📊 Simplifié</span>';
    } else {
      sourceBadge = '<span style="background: #856404; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">Local</span>';
    }
    
    return `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd;">${result.id || index + 1}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${result.model_name || 'N/A'}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${(result.prompt_token_length || 0) + (result.response_token_length || 0)}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${(result.energyJoules || 0).toFixed(8)}</td>
        <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${(result.co2Grams || 0).toFixed(6)}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${sourceBadge}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Charger l'interface de comparaison de modèles
 */
async function loadModelComparisonInterface() {
  try {
    // Charger la liste des modèles disponibles depuis Watsonx
    await loadAvailableModels();
  } catch (error) {
    console.error('Erreur chargement interface comparaison:', error);
  }
}

/**
 * Charger les modèles disponibles depuis Watsonx
 */
async function loadAvailableModels() {
  try {
    // Modèles recommandés basés sur le guide
    const recommendedModels = [
      { id: 'granite-3-3-8b-instruct', name: 'IBM Granite 3.3 8B', provider: 'IBM', description: 'Modèle d\'entreprise optimisé' },
      { id: 'granite-3-2-8b-instruct', name: 'IBM Granite 3.2 8B', provider: 'IBM', description: 'Version stable' },
      { id: 'granite-3-2b-instruct', name: 'IBM Granite 3.2B', provider: 'IBM', description: 'Version légère' },
      { id: 'llama-3-3-70b-instruct', name: 'Meta Llama 3.3 70B', provider: 'Meta', description: 'Open-source performant' },
      { id: 'llama-3-405b-instruct', name: 'Meta Llama 3 405B', provider: 'Meta', description: 'Le plus puissant' },
      { id: 'mistral-medium-2505', name: 'Mistral Medium 2505', provider: 'Mistral AI', description: 'Rapide et efficace' },
      { id: 'mistral-small-3-1-24b-instruct', name: 'Mistral Small 3.1 24B', provider: 'Mistral AI', description: 'Équilibré' }
    ];
    
    const modelSelection = document.getElementById('model-selection');
    if (!modelSelection) return;
    
    modelSelection.innerHTML = recommendedModels.map(model => `
      <label style="display: flex; align-items: center; padding: 10px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; background: white;">
        <input type="checkbox" value="${model.id}" data-model-name="${model.name}" style="margin-right: 10px;">
        <div>
          <strong>${model.name}</strong><br>
          <small style="color: #666;">${model.provider} - ${model.description}</small>
        </div>
      </label>
    `).join('');
    
  } catch (error) {
    console.error('Erreur chargement modèles:', error);
  }
}

/**
 * Comparer les modèles sélectionnés
 */
async function compareModels() {
  try {
    const prompt = document.getElementById('compare-prompt')?.value?.trim();
    if (!prompt) {
      alert('Veuillez entrer un prompt');
      return;
    }
    
    // Récupérer les modèles sélectionnés
    const checkboxes = document.querySelectorAll('#model-selection input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
      alert('Veuillez sélectionner au moins un modèle');
      return;
    }
    
    const selectedModels = Array.from(checkboxes).map(cb => ({
      id: cb.value,
      name: cb.getAttribute('data-model-name')
    }));
    
    // Afficher le loading
    document.getElementById('compare-loading').style.display = 'block';
    document.getElementById('compare-results').style.display = 'none';
    
    // Vérifier et charger WatsonxService si nécessaire
    if (!window.WatsonxService) {
      console.log('⚠️ WatsonxService non disponible, tentative de chargement...');
      try {
        const watsonxServiceUrl = chrome.runtime.getURL('watsonx-service.js');
        await loadScript(watsonxServiceUrl);
        await new Promise(resolve => setTimeout(resolve, 200));
        
        if (!window.WatsonxService) {
          throw new Error('WatsonxService non disponible après chargement');
        }
      } catch (loadError) {
        console.error('❌ Erreur chargement WatsonxService:', loadError);
        throw new Error('Service Watsonx non disponible. Veuillez recharger la page.');
      }
    }
    
    await window.WatsonxService.initWatsonxService();
    
    // Envoyer le prompt à chaque modèle
    const results = await Promise.all(
      selectedModels.map(async (model) => {
        const startTime = Date.now();
        try {
          const result = await sendPromptToModel(model.id, prompt);
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          const responseText = result.text || result.response || '';
          const responseWordCount = countWords(responseText);
          const responseReadingTime = calculateReadingTime(responseWordCount); // En secondes
          
          return {
            modelId: model.id,
            modelName: model.name,
            prompt: prompt,
            response: responseText,
            responseTime: duration,
            totalDuration: duration * 1000000, // En nanosecondes
            promptTokens: result.usage?.prompt_tokens || estimateTokens(prompt),
            responseTokens: result.usage?.completion_tokens || estimateTokens(responseText),
            totalTokens: result.usage?.total_tokens || (estimateTokens(prompt) + estimateTokens(responseText)),
            wordCount: responseWordCount,
            readingTime: responseReadingTime, // En secondes
            responseDuration: null, // Non disponible depuis l'API de génération
            success: true,
            timestamp: Date.now()
          };
        } catch (error) {
          return {
            modelId: model.id,
            modelName: model.name,
            prompt: prompt,
            error: error.message,
            success: false,
            timestamp: Date.now()
          };
        }
      })
    );
    
    // Calculer les métriques CO2 et énergie
    const resultsWithMetrics = await Promise.all(results.map(async result => {
      if (!result.success) return result;
      
      // Utiliser le modèle déployé si disponible, sinon le modèle local
      const energyJoules = await predictEnergy(
        result.modelId, 
        result.promptTokens, 
        result.responseTokens,
        result.totalDuration,
        result.responseDuration || null, // responseDuration peut être null
        result.wordCount || null,
        result.readingTime || null
      );
      const carbonIntensity = 480; // Global average
      const energyKwh = energyJoules / 3600000;
      const co2Grams = energyKwh * carbonIntensity;
      
      return {
        ...result,
        energyJoules,
        co2Grams
      };
    }));
    
    // Afficher les résultats
    displayComparisonResults(resultsWithMetrics);
    
    // Enregistrer dans l'historique et envoyer à Watsonx
    await saveComparisonResults(resultsWithMetrics);
    
  } catch (error) {
    console.error('Erreur comparaison modèles:', error);
    alert(`Erreur: ${error.message}`);
  } finally {
    document.getElementById('compare-loading').style.display = 'none';
  }
}

/**
 * Envoyer un prompt à un modèle via Watsonx
 * Utilise XMLHttpRequest comme dans l'exemple IBM
 */
async function sendPromptToModel(modelId, prompt) {
  try {
    if (!window.WatsonxService) {
      throw new Error('Service Watsonx non disponible');
    }
    
    const config = await chrome.storage.local.get(['watsonxConfig']);
    const watsonxConfig = config.watsonxConfig;
    
    if (!watsonxConfig || !watsonxConfig.projectId) {
      throw new Error('Configuration Watsonx incomplète');
    }
    
    // Obtenir le token IAM
    const token = await window.WatsonxService.getAuthToken();
    
    // Mapper les IDs de modèles aux IDs Watsonx complets
    const modelMapping = {
      'granite-3-3-8b-instruct': 'ibm/granite-3-3-8b-instruct',
      'granite-3-2-8b-instruct': 'ibm/granite-3-2-8b-instruct',
      'granite-3-2b-instruct': 'ibm/granite-3-2b-instruct',
      'llama-3-3-70b-instruct': 'meta-llama/llama-3-3-70b-instruct',
      'llama-3-405b-instruct': 'meta-llama/llama-3-405b-instruct',
      'mistral-medium-2505': 'mistralai/mistral-medium',
      'mistral-small-3-1-24b-instruct': 'mistralai/mistral-small-2402'
    };
    
    const fullModelId = modelMapping[modelId] || modelId;
    
    // Essayer plusieurs endpoints possibles pour la génération de texte
    const baseUrl = watsonxConfig.apiUrl || 'https://eu-de.ml.cloud.ibm.com';
    const endpoints = [
      `${baseUrl}/ml/v4/generate/text?version=2024-11-19&project_id=${encodeURIComponent(watsonxConfig.projectId)}`,
      `${baseUrl}/ml/v4/generate/text?version=2024-10-20&project_id=${encodeURIComponent(watsonxConfig.projectId)}`,
      `${baseUrl}/ml/v4/generate/text?project_id=${encodeURIComponent(watsonxConfig.projectId)}`,
      `${baseUrl}/ml/v4/generate/text`
    ];
    
    // Format de requête selon la documentation Watsonx
    const requestBody = {
      model_id: fullModelId,
      input: prompt,
      parameters: {
        max_new_tokens: 1000,
        temperature: 0.7,
        decoding_method: 'greedy',
        repetition_penalty: 1.0
      },
      project_id: watsonxConfig.projectId
    };
    
    let lastError = null;
    for (const endpoint of endpoints) {
      try {
        console.log(`🔄 Essai avec endpoint: ${endpoint}`);
        
        // Utiliser XMLHttpRequest comme dans l'exemple IBM
        const result = await new Promise((resolve, reject) => {
          const oReq = new XMLHttpRequest();
          
          oReq.addEventListener('load', () => {
            try {
              const parsedResponse = JSON.parse(oReq.responseText);
              resolve(parsedResponse);
            } catch (ex) {
              console.error('❌ Erreur parsing response:', ex);
              reject(new Error('Erreur parsing response: ' + ex.message));
            }
          });
          
          oReq.addEventListener('error', (error) => {
            reject(new Error('Erreur réseau: ' + error));
          });
          
          oReq.open('POST', endpoint);
          oReq.setRequestHeader('Accept', 'application/json');
          oReq.setRequestHeader('Authorization', 'Bearer ' + token);
          oReq.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
          oReq.send(JSON.stringify(requestBody));
        });
        
        // Adapter le format de réponse selon l'API
        if (result.results && result.results[0] && result.results[0].generated_text) {
          return {
            text: result.results[0].generated_text,
            usage: result.results[0].input_token_count ? {
              prompt_tokens: result.results[0].input_token_count,
              completion_tokens: result.results[0].generated_token_count,
              total_tokens: (result.results[0].input_token_count || 0) + (result.results[0].generated_token_count || 0)
            } : undefined
          };
        } else if (result.generated_text) {
          return {
            text: result.generated_text,
            usage: result.usage
          };
        } else {
          // Retourner la réponse brute si le format est différent
          console.warn('⚠️ Format de réponse inattendu:', result);
          return {
            text: JSON.stringify(result),
            usage: undefined
          };
        }
      } catch (error) {
        lastError = error;
        console.log(`⚠️ Échec avec ${endpoint}:`, error.message);
      }
    }
    
    throw lastError || new Error('Aucun endpoint de génération disponible');
  } catch (error) {
    console.error('Erreur envoi prompt à modèle:', error);
    throw error;
  }
}

/**
 * Afficher les résultats de comparaison
 */
function displayComparisonResults(results) {
  const resultsDiv = document.getElementById('compare-results');
  const statsDiv = document.getElementById('compare-stats');
  const gridDiv = document.getElementById('compare-grid');
  
  if (!resultsDiv || !statsDiv || !gridDiv) return;
  
  resultsDiv.style.display = 'block';
  
  // Calculer les stats globales
  const successful = results.filter(r => r.success);
  const avgResponseTime = successful.reduce((sum, r) => sum + r.responseTime, 0) / successful.length;
  const totalTokens = successful.reduce((sum, r) => sum + r.totalTokens, 0);
  const totalCO2 = successful.reduce((sum, r) => sum + (r.co2Grams || 0), 0);
  
  // Afficher les stats
  statsDiv.innerHTML = `
    <div class="stat-card">
      <h3>Modèles Testés</h3>
      <div class="value">${successful.length}/${results.length}</div>
    </div>
    <div class="stat-card">
      <h3>Temps Moyen</h3>
      <div class="value">${avgResponseTime.toFixed(0)}<span class="unit">ms</span></div>
    </div>
    <div class="stat-card">
      <h3>Tokens Total</h3>
      <div class="value">${totalTokens}</div>
    </div>
    <div class="stat-card">
      <h3>CO₂ Émis</h3>
      <div class="value">${totalCO2.toFixed(6)}<span class="unit">g</span></div>
    </div>
  `;
  
  // Afficher les résultats par modèle
  gridDiv.innerHTML = results.map(result => `
    <div style="border: 1px solid #ddd; border-radius: 8px; padding: 20px; background: white;">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 15px;">
        <div>
          <h3 style="margin: 0; color: #667eea;">${result.modelName}</h3>
          <small style="color: #666;">${result.modelId}</small>
        </div>
        ${result.success ? 
          '<span style="background: #d4edda; color: #155724; padding: 4px 8px; border-radius: 4px; font-size: 12px;">✓ Succès</span>' :
          '<span style="background: #f8d7da; color: #721c24; padding: 4px 8px; border-radius: 4px; font-size: 12px;">✗ Erreur</span>'
        }
      </div>
      
      ${result.success ? `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin-bottom: 15px; max-height: 300px; overflow-y: auto;">
          <strong>Réponse:</strong>
          <p style="margin-top: 10px; white-space: pre-wrap;">${result.response}</p>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 12px;">
          <div>
            <strong>Temps:</strong> ${result.responseTime}ms
          </div>
          <div>
            <strong>Tokens:</strong> ${result.totalTokens}
          </div>
          <div>
            <strong>Prompt:</strong> ${result.promptTokens}
          </div>
          <div>
            <strong>Réponse:</strong> ${result.responseTokens}
          </div>
          <div>
            <strong>Mots:</strong> ${result.wordCount}
          </div>
          <div>
            <strong>Lecture:</strong> ${result.readingTime?.toFixed(2)} min
          </div>
          <div>
            <strong>Énergie:</strong> ${result.energyJoules?.toFixed(8)} J
          </div>
          <div>
            <strong>CO₂:</strong> ${result.co2Grams?.toFixed(6)} g
          </div>
        </div>
      ` : `
        <div style="background: #f8d7da; color: #721c24; padding: 15px; border-radius: 6px;">
          <strong>Erreur:</strong> ${result.error}
        </div>
      `}
    </div>
  `).join('');
  
  // Créer le graphique de comparaison
  createComparisonChart(results.filter(r => r.success));
}

/**
 * Créer un graphique de comparaison
 */
function createComparisonChart(results) {
  const ctx = document.getElementById('chart-compare-metrics');
  if (!ctx) return;
  
  if (window.compareChart) {
    window.compareChart.destroy();
  }
  
  window.compareChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: results.map(r => r.modelName),
      datasets: [
        {
          label: 'Temps de réponse (ms)',
          data: results.map(r => r.responseTime),
          backgroundColor: 'rgba(102, 126, 234, 0.6)',
          yAxisID: 'y'
        },
        {
          label: 'Tokens',
          data: results.map(r => r.totalTokens),
          backgroundColor: 'rgba(118, 75, 162, 0.6)',
          yAxisID: 'y1'
        },
        {
          label: 'CO₂ (g × 1000)',
          data: results.map(r => (r.co2Grams || 0) * 1000),
          backgroundColor: 'rgba(255, 99, 132, 0.6)',
          yAxisID: 'y2'
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Temps (ms)' }
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Tokens' },
          grid: { drawOnChartArea: false }
        },
        y2: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'CO₂ (g × 1000)' },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

/**
 * Sauvegarder les résultats de comparaison
 */
async function saveComparisonResults(results) {
  try {
    // Ajouter chaque résultat à la queue de synchronisation
    for (const result of results) {
      if (result.success) {
        await chrome.runtime.sendMessage({
          type: 'NEW_EXCHANGE',
          data: result
        });
      }
    }
  } catch (error) {
    console.error('Erreur sauvegarde résultats:', error);
  }
}

/**
 * Fonctions utilitaires
 */
function estimateTokens(text) {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  return Math.ceil(words * 0.75);
}

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function calculateReadingTime(wordCount) {
  if (!wordCount || wordCount <= 0) return 0;
  const wordsPerMinute = 200; // Vitesse de lecture moyenne
  // Convertir en secondes: (mots / 200 mots/min) * 60 sec/min
  return Math.ceil((wordCount / wordsPerMinute) * 60 * 100) / 100; // Arrondi à 2 décimales, en secondes
}

async function predictEnergy(modelId, promptTokens, responseTokens, totalDuration = null, responseDuration = null, wordCount = null, readingTime = null) {
  try {
    // Obtenir le mode de prédiction choisi
    const predictionMode = await getPredictionMode();
    
    // PRIORITÉ 1: Utiliser le serveur local si mode "server" et si on a toutes les données
    if (predictionMode === 'server' && 
        window.ServerPredictor && 
        totalDuration !== null && responseDuration !== null && wordCount !== null && readingTime !== null) {
      try {
        const serverPrediction = await window.ServerPredictor.predict({
          totalDuration: totalDuration,
          promptTokens: promptTokens,
          responseTokens: responseTokens,
          responseDuration: responseDuration,
          wordCount: wordCount,
          readingTime: readingTime
        });
        
        if (serverPrediction !== null && serverPrediction !== undefined && !isNaN(serverPrediction)) {
          console.log('✅ Prédiction depuis serveur local');
          return serverPrediction;
        }
      } catch (error) {
        console.warn('⚠️ Erreur avec serveur local, fallback vers Watsonx:', error);
      }
    }
    
    // PRIORITÉ 2: Essayer d'utiliser le modèle ML déployé dans Watsonx si configuré (mode watsonx ou fallback)
    if (predictionMode === 'watsonx' && window.WatsonxService && window.WatsonxService.predictEnergyWithDeployedModel) {
      try {
        // Si on a toutes les données nécessaires, utiliser le modèle déployé
        if (totalDuration !== null && responseDuration !== null && wordCount !== null && readingTime !== null) {
          const deployedPrediction = await window.WatsonxService.predictEnergyWithDeployedModel({
            totalDuration: totalDuration,
            promptTokens: promptTokens,
            responseTokens: responseTokens,
            responseDuration: responseDuration,
            wordCount: wordCount,
            readingTime: readingTime
          });
          
          if (deployedPrediction !== null && deployedPrediction !== undefined) {
            console.log('✅ Prédiction depuis modèle déployé Watsonx');
            return deployedPrediction;
          } else {
            // Si mode watsonx et prédiction échouée, lancer une erreur
            throw new Error('Prédiction Watsonx échouée - Vérifiez la configuration et le format des données');
          }
        } else {
          if (predictionMode === 'watsonx') {
            throw new Error('Données incomplètes pour le modèle déployé Watsonx');
          }
          console.log('⚠️ Données incomplètes pour le modèle déployé, utilisation du modèle local');
        }
      } catch (error) {
        if (predictionMode === 'watsonx') {
          console.error('❌ Erreur avec modèle déployé (mode watsonx):', error.message);
          throw error; // Propager l'erreur si mode watsonx
        }
        console.warn('⚠️ Erreur avec modèle déployé, fallback vers modèle local:', error);
      }
    }
    
    // PRIORITÉ 3: Utiliser le modèle Random Forest local si disponible et si on a toutes les données
    if (window.RandomForestPredictor && 
        totalDuration !== null && responseDuration !== null && wordCount !== null && readingTime !== null) {
      try {
        // S'assurer que le modèle est initialisé
        if (!window.RandomForestPredictor.isInitialized()) {
          await window.RandomForestPredictor.init();
        }
        
        if (window.RandomForestPredictor.isInitialized()) {
          const rfPrediction = window.RandomForestPredictor.predict({
            totalDuration: totalDuration,
            promptTokens: promptTokens,
            responseTokens: responseTokens,
            responseDuration: responseDuration,
            wordCount: wordCount,
            readingTime: readingTime
          });
          
          if (rfPrediction !== null && rfPrediction !== undefined && !isNaN(rfPrediction)) {
            console.log('✅ Prédiction depuis modèle Random Forest local');
            return rfPrediction;
          }
        }
      } catch (error) {
        console.warn('⚠️ Erreur avec modèle Random Forest, fallback vers modèle simplifié:', error);
      }
    }
    
    // PRIORITÉ 4: Utiliser predictor.js si disponible
    if (window.predictEnergy) {
      return await window.predictEnergy(modelId, promptTokens, responseTokens);
    }
    
    // PRIORITÉ 5: Charger le modèle simplifié directement
    try {
      const modelResponse = await fetch(chrome.runtime.getURL('data/model_simplified.json'));
      const modelData = await modelResponse.json();
      
      // Détecter la taille du modèle
      const normalizedName = modelId.toLowerCase();
      let size = '7b';
      if (normalizedName.includes('70b') || normalizedName.includes('405b')) size = '70b';
      else if (normalizedName.includes('8b') || normalizedName.includes('24b')) size = '8b';
      else if (normalizedName.includes('2b')) size = '2b';
      
      // Calculer l'énergie avec poids pour prompt et response
      const energyPerToken = modelData.energy_per_token?.[size] || 0.00001;
      const baseEnergy = modelData.base_energy?.[size] || 0;
      const totalTokens = promptTokens + responseTokens;
      
      // Utiliser la formule avec poids pour prompt et response
      const promptWeight = 0.3;
      const responseWeight = 1.0;
      const energy = baseEnergy + 
                     (promptTokens * energyPerToken * promptWeight) + 
                     (responseTokens * energyPerToken * responseWeight);
      
      // S'assurer qu'on retourne toujours une valeur valide
      if (energy > 0) {
        return energy;
      }
    } catch (e) {
      console.warn('⚠️ Erreur chargement modèle simplifié:', e);
    }
    
    // Fallback: estimation basique basée sur les tokens
    const totalTokens = promptTokens + responseTokens;
    if (totalTokens > 0) {
      // Estimation conservatrice: 0.00001 Joules par token avec poids
      const promptWeight = 0.3;
      const responseWeight = 1.0;
      return (promptTokens * 0.00001 * promptWeight) + (responseTokens * 0.00001 * responseWeight);
    }
    
    // Si aucun token, retourner une valeur minimale
    return 0.001; // 0.001 Joules minimum
  } catch (error) {
    console.warn('Erreur prédiction énergie, utilisation estimation basique:', error);
    const totalTokens = promptTokens + responseTokens;
    if (totalTokens > 0) {
      return totalTokens * 0.00001;
    }
    return 0.001; // Valeur minimale
  }
}

/**
 * Remplir les filtres
 */
function populateFilters() {
  if (!datasetData) return;
  
  // Hardware filter
  const hardwareSet = new Set(datasetData.map(d => d.hardware_type).filter(Boolean));
  const hardwareSelect = document.getElementById('filter-hardware-models');
  hardwareSet.forEach(h => {
    const option = document.createElement('option');
    option.value = h;
    option.textContent = h;
    hardwareSelect.appendChild(option);
  });
  
  // Model filters
  const modelSet = new Set(datasetData.map(d => d.model_name || d.model).filter(Boolean));
  const modelSelects = ['filter-model-hardware', 'filter-model-energy'];
  modelSet.forEach(m => {
    modelSelects.forEach(selectId => {
      const select = document.getElementById(selectId);
      if (select) {
        const option = document.createElement('option');
        option.value = m;
        option.textContent = m;
        select.appendChild(option);
      }
    });
  });
}

/**
 * Détecter la taille du modèle
 */
function detectModelSize(modelName) {
  if (!modelName) return 'unknown';
  const name = modelName.toLowerCase();
  if (name.includes('70b') || name.includes('34b')) return '70b';
  if (name.includes('8b')) return '8b';
  if (name.includes('7b') || name.includes('13b')) return '7b';
  if (name.includes('2b')) return '2b';
  return 'unknown';
}

/**
 * Mettre à jour le graphique énergie par token
 */
function updateEnergyPerTokenChart(stats) {
  const ctx = document.getElementById('chart-energy-per-token');
  if (!ctx) return;
  
  const labels = stats.map(s => s.model);
  const data = stats.map(s => s.avgEnergyPerToken);
  
  if (charts['energy-per-token']) {
    charts['energy-per-token'].destroy();
  }
  
  charts['energy-per-token'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Énergie par token (J)',
        data: data,
        backgroundColor: 'rgba(102, 126, 234, 0.8)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

/**
 * Mettre à jour le tableau des modèles
 */
function updateModelsTable(stats) {
  const tbody = document.getElementById('table-models-body');
  tbody.innerHTML = '';
  
  stats.forEach(stat => {
    const row = document.createElement('tr');
    const size = detectModelSize(stat.model);
    row.innerHTML = `
      <td>${stat.model}</td>
      <td>${size}</td>
      <td>${stat.avgEnergyPerToken.toExponential(2)}</td>
      <td>${stat.hardwareTypes.join(', ')}</td>
      <td>${(stat.totalEnergy / stat.count).toExponential(2)}</td>
    `;
    tbody.appendChild(row);
  });
}

/**
 * Mettre à jour le graphique hardware
 */
function updateHardwareChart(stats) {
  const ctx = document.getElementById('chart-energy-hardware');
  if (!ctx) return;
  
  const labels = stats.map(s => s.hardware);
  const data = stats.map(s => s.avgEnergy);
  
  if (charts['energy-hardware']) {
    charts['energy-hardware'].destroy();
  }
  
  charts['energy-hardware'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Énergie moyenne (J)',
        data: data,
        backgroundColor: 'rgba(118, 75, 162, 0.8)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

/**
 * Mettre à jour le tableau hardware
 */
function updateHardwareTable(stats) {
  const tbody = document.getElementById('table-hardware-body');
  tbody.innerHTML = '';
  
  stats.forEach(stat => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${stat.hardware}</td>
      <td>${stat.avgEnergy.toExponential(2)}</td>
      <td>${stat.count}</td>
      <td>${stat.models.join(', ')}</td>
    `;
    tbody.appendChild(row);
  });
}

/**
 * Mettre à jour le graphique CO₂ par pays
 */
function updateCO2CountriesChart(co2Data) {
  const ctx = document.getElementById('chart-co2-countries');
  if (!ctx) return;
  
  const labels = co2Data.map(d => carbonIntensityData.countries[d.country]?.name || d.country);
  const data = co2Data.map(d => d.total / d.count);
  
  if (charts['co2-countries']) {
    charts['co2-countries'].destroy();
  }
  
  charts['co2-countries'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'CO₂ moyen (g)',
        data: data,
        backgroundColor: 'rgba(255, 99, 132, 0.8)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

/**
 * Mettre à jour le graphique impact CO₂
 */
function updateCO2ImpactChart(co2Data) {
  const ctx = document.getElementById('chart-co2-impact');
  if (!ctx) return;
  
  const labels = co2Data.map(d => carbonIntensityData.countries[d.country]?.name || d.country);
  const intensities = co2Data.map(d => d.intensity);
  const co2Values = co2Data.map(d => d.total / d.count);
  
  if (charts['co2-impact']) {
    charts['co2-impact'].destroy();
  }
  
  charts['co2-impact'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Intensité carbone (gCO₂/kWh)',
          data: intensities,
          borderColor: 'rgba(102, 126, 234, 1)',
          yAxisID: 'y'
        },
        {
          label: 'CO₂ émis moyen (g)',
          data: co2Values,
          borderColor: 'rgba(255, 99, 132, 1)',
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left'
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  });
}

