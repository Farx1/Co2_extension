/**
 * Track Sustainability - Background Service Worker
 * Gère les calculs d'énergie et de CO₂
 */

console.log('🌱 Track Sustainability - Background Service Worker démarré');

// Variables globales
let modelData = null;
let carbonIntensityData = null;
let isInitialized = false;
let watsonxService = null;

/**
 * Convertir les données Watsonx en format modèle simplifié
 */
function convertWatsonxToModelFormat(watsonxData) {
  // Calculer les moyennes par taille de modèle
  const bySize = {
    '2b': { energy: [], base: [] },
    '7b': { energy: [], base: [] },
    '8b': { energy: [], base: [] },
    '70b': { energy: [], base: [] }
  };
  
  watsonxData.forEach(row => {
    const size = detectModelSizeFromData(row.model_name || row.model);
    if (bySize[size]) {
      const tokens = (parseFloat(row.prompt_token_length) || 0) + 
                    (parseFloat(row.response_token_length) || 0);
      const energy = parseFloat(row.energy_consumption_llm_total) || 0;
      
      if (tokens > 0) {
        bySize[size].energy.push(energy / tokens);
      }
      bySize[size].base.push(energy);
    }
  });
  
  // Calculer les moyennes
  const energyPerToken = {};
  const baseEnergy = {};
  
  Object.entries(bySize).forEach(([size, data]) => {
    if (data.energy.length > 0) {
      energyPerToken[size] = data.energy.reduce((a, b) => a + b, 0) / data.energy.length;
    }
    if (data.base.length > 0) {
      baseEnergy[size] = data.base.reduce((a, b) => a + b, 0) / data.base.length;
    }
  });
  
  return {
    model_type: 'watsonx_dataset',
    version: '1.0.0',
    description: 'Modèle depuis dataset Watsonx',
    performance: { r2: 0.984, mae: 0.000014, mse: 5.01e-09 },
    energy_per_token: energyPerToken,
    base_energy: baseEnergy,
    model_mappings: modelData?.model_mappings || {},
    default_size: '7b'
  };
}

/**
 * Détecter la taille du modèle depuis les données
 */
function detectModelSizeFromData(modelName) {
  if (!modelName) return '7b';
  const name = modelName.toLowerCase();
  if (name.includes('70b') || name.includes('34b')) return '70b';
  if (name.includes('8b')) return '8b';
  if (name.includes('7b') || name.includes('13b')) return '7b';
  if (name.includes('2b')) return '2b';
  return '7b';
}

/**
 * Initialiser le service worker
 */
async function init() {
  try {
    // Note: Watsonx ne peut pas être chargé dans le service worker avec importScripts
    // car cela n'est autorisé qu'à l'installation. On utilisera le modèle local
    // et laisser le dashboard gérer Watsonx directement.
    console.log('ℹ️ Service worker - utilisation du modèle local (Watsonx géré par dashboard)');
    
    // Fallback: Charger le modèle simplifié local
    if (!modelData) {
      const modelResponse = await fetch(chrome.runtime.getURL('data/model_simplified.json'));
      modelData = await modelResponse.json();
      console.log('✓ Modèle chargé (local):', modelData.model_type);
    }
    
    // Charger les données d'intensité carbone
    const carbonResponse = await fetch(chrome.runtime.getURL('data/carbon_intensity.json'));
    carbonIntensityData = await carbonResponse.json();
    console.log('✓ Données carbone chargées');
    
    // Initialiser le storage si nécessaire
    const result = await chrome.storage.local.get([
      'currentSession',
      'totalStats',
      'conversationHistory',
      'selectedCountry'
    ]);
    
    if (!result.currentSession) {
      await chrome.storage.local.set({
        currentSession: {
          requests: 0,
          promptTokens: 0,
          responseTokens: 0,
          energyJoules: 0,
          co2Grams: 0
        }
      });
    }
    
    if (!result.totalStats) {
      await chrome.storage.local.set({
        totalStats: {
          requests: 0,
          tokens: 0,
          co2Grams: 0
        }
      });
    }
    
    if (!result.conversationHistory) {
      await chrome.storage.local.set({ conversationHistory: [] });
    }
    
    if (!result.selectedCountry) {
      await chrome.storage.local.set({ selectedCountry: 'global_average' });
    }
    
    // Initialiser la queue de synchronisation Watsonx
    if (!result.watsonxSyncQueue) {
      await chrome.storage.local.set({ watsonxSyncQueue: [] });
    }
    
    // Démarrer la synchronisation périodique avec Watsonx
    startWatsonxSync();
    
    isInitialized = true;
    console.log('✓ Service worker initialisé');
    
  } catch (error) {
    console.error('❌ Erreur d\'initialisation:', error);
  }
}

/**
 * Détecter la taille du modèle depuis son nom
 */
function detectModelSize(modelName) {
  if (!modelData) return '7b';
  
  const normalizedName = modelName.toLowerCase().trim();
  
  // Chercher dans les mappings
  for (const [key, size] of Object.entries(modelData.model_mappings)) {
    if (normalizedName.includes(key.toLowerCase())) {
      return size;
    }
  }
  
  // Extraire la taille depuis le nom
  if (normalizedName.includes('70b')) return '70b';
  if (normalizedName.includes('34b')) return '70b';
  if (normalizedName.includes('13b')) return '7b';
  if (normalizedName.includes('8b')) return '8b';
  if (normalizedName.includes('7b')) return '7b';
  if (normalizedName.includes('2b')) return '2b';
  
  return modelData.default_size;
}

/**
 * Prédire la consommation énergétique
 */
function predictEnergy(modelName, promptTokens, responseTokens) {
  if (!modelData) {
    console.error('Modèle non initialisé');
    return 0;
  }
  
  const modelSize = detectModelSize(modelName);
  const totalTokens = promptTokens + responseTokens;
  
  // Énergie de base
  const baseEnergy = modelData.base_energy[modelSize] || modelData.base_energy['7b'];
  
  // Énergie par token
  const energyPerToken = modelData.energy_per_token[modelSize] || modelData.energy_per_token['7b'];
  
  // Formule: base + (prompt × 0.3 × énergie/token) + (response × 1.0 × énergie/token)
  const promptWeight = 0.3;
  const responseWeight = 1.0;
  
  const energy = baseEnergy + 
                 (promptTokens * energyPerToken * promptWeight) + 
                 (responseTokens * energyPerToken * responseWeight);
  
  return Math.max(0, energy);
}

/**
 * Convertir l'énergie en CO₂
 */
function energyToCO2(energyJoules, carbonIntensity) {
  // Convertir Joules en kWh
  const energyKwh = energyJoules / 3600000;
  
  // Calculer le CO₂ en grammes
  const co2Grams = energyKwh * carbonIntensity;
  
  return {
    co2Grams,
    co2Kg: co2Grams / 1000,
    energyKwh,
    energyJoules
  };
}

/**
 * Obtenir le token IAM depuis IBM Cloud (pour service worker)
 */
async function getIAMTokenForBackground() {
  try {
    // Vérifier le cache
    const tokenCache = await chrome.storage.local.get(['watsonxIamToken', 'watsonxIamTokenExpiry']);
    if (tokenCache.watsonxIamToken && tokenCache.watsonxIamTokenExpiry && 
        Date.now() < tokenCache.watsonxIamTokenExpiry) {
      return tokenCache.watsonxIamToken;
    }
    
    // Obtenir la config
    const configResult = await chrome.storage.local.get(['watsonxConfig']);
    const config = configResult.watsonxConfig;
    
    if (!config?.apiKey) {
      throw new Error('API Key Watsonx non configurée');
    }
    
    // Nettoyer la clé API
    let apiKey = String(config.apiKey).replace(/\s+/g, '').replace(/^["']+|["']+$/g, '').trim();
    
    if (!apiKey || apiKey.length < 20) {
      throw new Error('API Key invalide');
    }
    
    // Obtenir le token IAM
    return new Promise((resolve, reject) => {
      const req = new XMLHttpRequest();
      const requestBody = `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${encodeURIComponent(apiKey)}`;
      
      req.addEventListener('load', () => {
        try {
          if (req.status !== 200) {
            reject(new Error(`Erreur HTTP ${req.status}: ${req.responseText?.substring(0, 200)}`));
            return;
          }
          
          const tokenResponse = JSON.parse(req.responseText);
          const accessToken = tokenResponse.access_token;
          
          if (!accessToken) {
            reject(new Error('Token IAM non reçu'));
            return;
          }
          
          // Mettre en cache (50 minutes)
          const expiryTime = Date.now() + (50 * 60 * 1000);
          chrome.storage.local.set({
            watsonxIamToken: accessToken,
            watsonxIamTokenExpiry: expiryTime
          });
          
          resolve(accessToken);
        } catch (ex) {
          reject(new Error('Erreur parsing token: ' + ex.message));
        }
      });
      
      req.addEventListener('error', () => reject(new Error('Erreur réseau')));
      req.addEventListener('timeout', () => reject(new Error('Timeout')));
      
      req.timeout = 10000;
      req.open('POST', 'https://iam.cloud.ibm.com/identity/token');
      req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      req.setRequestHeader('Accept', 'application/json');
      req.send(requestBody);
    });
  } catch (error) {
    console.error('❌ Erreur obtention token IAM:', error);
    throw error;
  }
}

/**
 * Prédire l'énergie avec le modèle déployé Watsonx (pour service worker)
 */
async function predictEnergyWithWatsonx(params) {
  // Vérifier la configuration (en dehors du try pour être accessible dans le catch)
  const watsonxConfigResult = await chrome.storage.local.get(['watsonxConfig', 'predictionMode']);
  const config = watsonxConfigResult.watsonxConfig;
  const currentPredictionMode = watsonxConfigResult.predictionMode || 'watsonx';
  
  try {
    
    // Si mode serveur, ne pas utiliser Watsonx directement
    if (currentPredictionMode === 'server') {
      return null;
    }
    
    if (!config?.deploymentId || !config?.apiKey || !config?.projectId) {
      return null; // Pas configuré, utiliser le modèle local
    }
    
    // Obtenir le token
    const token = await getIAMTokenForBackground();
    const baseUrl = config.apiUrl || 'https://eu-de.ml.cloud.ibm.com';
    
    // Extraire la région
    const regionMatch = baseUrl.match(/https:\/\/([^.]+)\.(ml|dataplatform)\.cloud\.ibm\.com/);
    const region = regionMatch ? regionMatch[1] : 'eu-de';
    
    // Endpoints (publics en premier, éviter les endpoints privés depuis le service worker)
    // Note: Les endpoints privés peuvent ne pas être accessibles depuis le service worker à cause de CORS
    // Le paramètre version est REQUIS pour l'API Watson ML
    const projectIdParam = config.projectId ? `project_id=${encodeURIComponent(config.projectId)}` : '';
    const versionParam = 'version=2021-05-01';
    
    // Construire les URLs avec le paramètre version TOUJOURS présent
    const endpoints = [];
    
    // 1. Avec version ET project_id dans l'URL
    if (projectIdParam) {
      endpoints.push(`${baseUrl}/ml/v4/deployments/${config.deploymentId}/predictions?${versionParam}&${projectIdParam}`);
    }
    
    // 2. Avec version seulement (project_id dans headers)
    endpoints.push(`${baseUrl}/ml/v4/deployments/${config.deploymentId}/predictions?${versionParam}`);
    
    // 3. Essayer avec version dans l'URL et project_id dans headers (fallback)
    if (projectIdParam) {
      endpoints.push(`${baseUrl}/ml/v4/deployments/${config.deploymentId}/predictions?${versionParam}`);
    }
    
    console.log('🔗 Endpoints Watsonx à essayer:', endpoints);
    
    // Préparer le payload
    const inputFields = [
      'total_duration',
      'prompt_token_length',
      'response_token_length',
      'response_duration',
      'word_count',
      'reading_time'
    ];
    
    const inputValues = [
      typeof params.totalDuration === 'number' ? params.totalDuration : (parseFloat(params.totalDuration) || 0),
      typeof params.promptTokens === 'number' ? params.promptTokens : (parseInt(params.promptTokens) || 0),
      typeof params.responseTokens === 'number' ? params.responseTokens : (parseInt(params.responseTokens) || 0),
      typeof params.responseDuration === 'number' ? params.responseDuration : (parseFloat(params.responseDuration) || 0),
      typeof params.wordCount === 'number' ? params.wordCount : (parseInt(params.wordCount) || 0),
      typeof params.readingTime === 'number' ? params.readingTime : (parseFloat(params.readingTime) || 0)
    ];
    
    const payload = {
      input_data: [{
        fields: inputFields,
        values: [inputValues]
      }]
    };
    
    // Essayer chaque endpoint
    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      try {
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Délai entre tentatives
        }
        
        const headers = {
          'Accept': 'application/json',
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json;charset=UTF-8'
        };
        
        // Ajouter le Project ID dans les headers (requis pour certaines APIs Watson ML)
        if (config.projectId) {
          headers['X-Project-Id'] = config.projectId;
        }
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(60000) // 60 secondes
        });
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => `HTTP ${response.status}`);
          console.warn(`⚠️ Erreur HTTP ${response.status} avec ${endpoint}:`, errorText.substring(0, 200));
          continue; // Essayer le prochain endpoint
        }
        
        const result = await response.json();
        
        // Extraire la prédiction
        let energyJoules = null;
        if (result.predictions && result.predictions.length > 0) {
          const prediction = result.predictions[0];
          if (Array.isArray(prediction.values) && prediction.values.length > 0) {
            energyJoules = prediction.values[0];
          } else if (typeof prediction === 'number') {
            energyJoules = prediction;
          } else if (prediction.energy_joules) {
            energyJoules = prediction.energy_joules;
          } else if (prediction.energy) {
            energyJoules = prediction.energy;
          }
        } else if (result.values && Array.isArray(result.values) && result.values.length > 0) {
          energyJoules = result.values[0];
        } else if (typeof result === 'number') {
          energyJoules = result;
        }
        
        if (energyJoules !== null && typeof energyJoules === 'number' && energyJoules >= 0) {
          console.log(`✅ Prédiction Watsonx: ${energyJoules.toFixed(8)} J`);
          return energyJoules;
        }
      } catch (error) {
        const errorMsg = error.message || String(error);
        
        // Pour les erreurs "Failed to fetch", c'est probablement un problème CORS ou réseau
        // Essayer le prochain endpoint
        if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || 
            errorMsg.includes('CORS') || errorMsg.includes('fetch')) {
          console.warn(`⚠️ Erreur réseau/CORS avec ${endpoint}, essai suivant...`);
          continue;
        }
        
        if (errorMsg.includes('Timeout') || errorMsg.includes('timeout') || 
            errorMsg.includes('CONNECTION') || errorMsg.includes('ERR_CONNECTION')) {
          console.warn(`⚠️ Timeout/connexion avec ${endpoint}, essai suivant...`);
          continue;
        }
        
        if (errorMsg.includes('400') || errorMsg.includes('Bad Request')) {
          console.error('❌ Erreur 400 - Format de données invalide');
          // Pour les erreurs 400, obtenir plus de détails si possible
          if (error.response) {
            try {
              const errorResponse = await error.response.json().catch(() => null);
              if (errorResponse) {
                console.error('❌ Détails erreur 400:', JSON.stringify(errorResponse, null, 2));
              }
            } catch (e) {
              // Ignorer
            }
          }
          throw error; // Ne pas continuer, le problème est le même partout
        }
        
        console.warn(`⚠️ Erreur avec ${endpoint}:`, errorMsg);
        continue;
      }
    }
    
    // Si on arrive ici, tous les endpoints ont échoué
    // Si mode watsonx, lancer une erreur au lieu de retourner null
    if (currentPredictionMode === 'watsonx') {
      throw new Error('Tous les endpoints Watsonx ont échoué. Vérifiez la configuration et le format des données.');
    }
    
    return null; // Tous les endpoints ont échoué (mode non-watsonx)
  } catch (error) {
    // Si mode watsonx, propager l'erreur au lieu de retourner null
    // Note: currentPredictionMode est déjà défini dans le scope try
    if (currentPredictionMode === 'watsonx') {
      console.error('❌ Erreur prédiction Watsonx (mode watsonx):', error.message);
      throw error; // Propager l'erreur pour que handleNewExchange sache qu'il ne faut pas faire de fallback
    }
    
    console.warn('⚠️ Erreur prédiction Watsonx:', error.message);
    return null;
  }
}

/**
 * Traiter un nouvel échange
 */
async function handleNewExchange(data) {
  try {
    if (!isInitialized) {
      console.log('⏳ En attente de l\'initialisation...');
      await init();
    }
    
    const { 
      platform, 
      model, 
      promptTokens, 
      responseTokens, 
      totalDuration,
      responseDuration,
      wordCount,
      readingTime,
      timestamp 
    } = data;
    
    console.log(`📊 Nouvel échange: ${platform} (${model})`);
    console.log(`  Prompt: ${promptTokens} tokens`);
    console.log(`  Réponse: ${responseTokens} tokens`);
    if (totalDuration) console.log(`  Durée totale: ${totalDuration} ns`);
    if (wordCount) console.log(`  Mots: ${wordCount}`);
    if (readingTime) console.log(`  Temps de lecture: ${readingTime} s`);
    
    // Vérifier le mode de prédiction
    const predictionModeResult = await chrome.storage.local.get(['predictionMode']);
    const predictionMode = predictionModeResult.predictionMode || 'watsonx';
    
    // Essayer d'abord Watsonx si configuré et si on a toutes les données
    let energyJoules = null;
    let predictionSource = 'local';
    let predictionError = null;
    
    // Vérifier si on a toutes les données nécessaires pour Watsonx
    const hasAllWatsonxData = totalDuration !== null && 
                                totalDuration !== undefined && 
                                responseDuration !== null && 
                                responseDuration !== undefined && 
                                wordCount !== null && 
                                wordCount !== undefined && 
                                readingTime !== null && 
                                readingTime !== undefined &&
                                !isNaN(totalDuration) && 
                                !isNaN(responseDuration) && 
                                !isNaN(wordCount) && 
                                !isNaN(readingTime);
    
    if (hasAllWatsonxData && predictionMode === 'watsonx') {
      try {
        energyJoules = await predictEnergyWithWatsonx({
          totalDuration,
          promptTokens,
          responseTokens,
          responseDuration,
          wordCount,
          readingTime
        });
        
        if (energyJoules !== null && !isNaN(energyJoules) && energyJoules > 0) {
          predictionSource = 'watsonx';
          console.log(`  ✅ Énergie (Watsonx): ${energyJoules.toFixed(8)} J`);
        } else {
          // Prédiction Watsonx retournée null ou 0, utiliser fallback local
          console.warn('  ⚠️ Prédiction Watsonx retournée invalide, fallback vers modèle local');
          predictionError = 'Prédiction Watsonx invalide';
        }
      } catch (error) {
        predictionError = error.message;
        console.warn('⚠️ Erreur prédiction Watsonx, fallback vers modèle local:', error.message);
      }
    } else if (predictionMode === 'watsonx' && !hasAllWatsonxData) {
      // Mode watsonx mais données incomplètes, utiliser fallback local
      console.warn('  ⚠️ Mode Watsonx activé mais données incomplètes, utilisation du modèle local');
      console.warn('  Données manquantes:', {
        totalDuration: totalDuration === null || totalDuration === undefined || isNaN(totalDuration),
        responseDuration: responseDuration === null || responseDuration === undefined || isNaN(responseDuration),
        wordCount: wordCount === null || wordCount === undefined || isNaN(wordCount),
        readingTime: readingTime === null || readingTime === undefined || isNaN(readingTime)
      });
    }
    
    // Fallback vers le modèle local si nécessaire
    if (energyJoules === null || isNaN(energyJoules) || energyJoules === 0) {
      energyJoules = predictEnergy(model, promptTokens, responseTokens);
      console.log(`  ⚡ Énergie (local): ${energyJoules.toFixed(8)} J`);
      predictionSource = 'local';
    }
    
    // Obtenir l'intensité carbone
    const result = await chrome.storage.local.get(['selectedCountry']);
    const country = result.selectedCountry || 'global_average';
    const carbonIntensity = carbonIntensityData.countries[country]?.intensity || 480;
    
    // Convertir en CO₂
    const co2Data = energyToCO2(energyJoules, carbonIntensity);
    console.log(`  CO₂: ${co2Data.co2Grams.toFixed(6)} g (${country})`);
    
    // Créer l'objet échange pour le stockage
    const exchangeData = {
      platform,
      model,
      promptTokens,
      responseTokens,
      totalDuration,
      responseDuration,
      wordCount,
      readingTime,
      energyJoules,
      co2Grams: co2Data.co2Grams,
      timestamp,
      predictionSource,
      // Format normalisé pour compatibilité
      prompt_token_length: promptTokens,
      response_token_length: responseTokens,
      total_duration: totalDuration,
      response_duration: responseDuration,
      word_count: wordCount,
      reading_time: readingTime
    };
    
    // Stocker le dernier échange (input actuel)
    await chrome.storage.local.set({ lastExchange: exchangeData });
    
    // Mettre à jour les statistiques
    await updateStats(exchangeData);
    
    console.log('✓ Statistiques mises à jour');
    
  } catch (error) {
    console.error('❌ Erreur lors du traitement:', error);
  }
}

/**
 * Mettre à jour les statistiques
 */
async function updateStats(exchangeData) {
  try {
    const result = await chrome.storage.local.get([
      'currentSession',
      'totalStats',
      'conversationHistory'
    ]);
    
    // Session actuelle
    const currentSession = result.currentSession || {
      requests: 0,
      promptTokens: 0,
      responseTokens: 0,
      energyJoules: 0,
      co2Grams: 0
    };
    
    currentSession.requests += 1;
    currentSession.promptTokens += exchangeData.promptTokens;
    currentSession.responseTokens += exchangeData.responseTokens;
    currentSession.energyJoules += exchangeData.energyJoules;
    currentSession.co2Grams += exchangeData.co2Grams;
    
    // Total cumulé
    const totalStats = result.totalStats || {
      requests: 0,
      tokens: 0,
      co2Grams: 0
    };
    
    totalStats.requests += 1;
    totalStats.tokens += exchangeData.promptTokens + exchangeData.responseTokens;
    totalStats.co2Grams += exchangeData.co2Grams;
    
    // Historique
    const conversationHistory = result.conversationHistory || [];
    
    // Normaliser les formats pour le modèle Watsonx:
    // - total_duration: nanosecondes
    // - response_duration: nanosecondes (convertir si nécessaire)
    // - reading_time: secondes (convertir de minutes si nécessaire)
    let normalizedResponseDuration = exchangeData.responseDuration;
    if (normalizedResponseDuration && typeof normalizedResponseDuration === 'number') {
      // Si la durée est en millisecondes (< 1e6), convertir en nanosecondes
      if (normalizedResponseDuration < 1000000) {
        normalizedResponseDuration = normalizedResponseDuration * 1000000;
      }
    }
    
    let normalizedReadingTime = exchangeData.readingTime;
    if (normalizedReadingTime && typeof normalizedReadingTime === 'number') {
      // Si le temps est en minutes (< 100), convertir en secondes
      if (normalizedReadingTime < 100) {
        normalizedReadingTime = normalizedReadingTime * 60;
      }
    }
    
    const exchangeRecord = {
      ...exchangeData,
      id: `exchange-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      // Normaliser les noms de colonnes pour correspondre au format Watsonx
      prompt_token_length: exchangeData.promptTokens || 0,
      response_token_length: exchangeData.responseTokens || 0,
      total_duration: exchangeData.totalDuration || 0, // Déjà en nanosecondes
      response_duration: normalizedResponseDuration || null, // En nanosecondes
      word_count: exchangeData.wordCount || 0,
      reading_time: normalizedReadingTime || 0, // En secondes
      model_name: exchangeData.model,
      platform: exchangeData.platform
    };
    conversationHistory.push(exchangeRecord);
    
    // Limiter l'historique à 1000 entrées
    if (conversationHistory.length > 1000) {
      conversationHistory.shift();
    }
    
    // Ajouter à la queue de synchronisation Watsonx
    await addToWatsonxSyncQueue(exchangeRecord);
    
    // Sauvegarder
    await chrome.storage.local.set({
      currentSession,
      totalStats,
      conversationHistory
    });
    
  } catch (error) {
    console.error('Erreur lors de la mise à jour des stats:', error);
  }
}

/**
 * Comparer les prédictions pour l'input actuel et le cumulé
 */
async function comparePredictions(data) {
  try {
    const { lastExchange, cumulativeStats } = data;
    
    // Le background n'a pas accès direct à WatsonxService
    // On va utiliser le modèle local pour la comparaison
    // Ou on peut retourner les données pour que le popup fasse la comparaison
    
    // Pour l'instant, on retourne les données nécessaires
    // Le popup pourra faire la comparaison s'il charge WatsonxService
    
    // Préparer les données pour l'input actuel
    const currentData = {
      totalDuration: lastExchange.total_duration || lastExchange.totalDuration || 0,
      promptTokens: lastExchange.prompt_token_length || lastExchange.promptTokens || 0,
      responseTokens: lastExchange.response_token_length || lastExchange.responseTokens || 0,
      responseDuration: lastExchange.response_duration || lastExchange.responseDuration || 0,
      wordCount: lastExchange.word_count || lastExchange.wordCount || 0,
      readingTime: lastExchange.reading_time || lastExchange.readingTime || 0
    };
    
    // Préparer les données pour le cumulé (moyennes)
    const historyResult = await chrome.storage.local.get(['conversationHistory']);
    const exchanges = historyResult.conversationHistory || [];
    
    if (exchanges.length === 0) {
      return { success: false, error: 'Aucun historique disponible' };
    }
    
    // Calculer les moyennes
    let totalDuration = 0, totalResponseDuration = 0, totalWordCount = 0, totalReadingTime = 0;
    let totalPromptTokens = 0, totalResponseTokens = 0;
    
    exchanges.forEach(ex => {
      totalDuration += ex.total_duration || ex.totalDuration || 0;
      totalResponseDuration += ex.response_duration || ex.responseDuration || 0;
      totalWordCount += ex.word_count || ex.wordCount || 0;
      totalReadingTime += ex.reading_time || ex.readingTime || 0;
      totalPromptTokens += ex.prompt_token_length || ex.promptTokens || 0;
      totalResponseTokens += ex.response_token_length || ex.responseTokens || 0;
    });
    
    const count = exchanges.length;
    const cumulativeData = {
      totalDuration: totalDuration / count,
      promptTokens: totalPromptTokens / count,
      responseTokens: totalResponseTokens / count,
      responseDuration: totalResponseDuration / count,
      wordCount: totalWordCount / count,
      readingTime: totalReadingTime / count
    };
    
    // Utiliser le modèle local pour la comparaison (le background a accès au modèle local)
    const currentPrediction = predictEnergy(
      lastExchange.model || 'unknown',
      currentData.promptTokens,
      currentData.responseTokens
    );
    
    const cumulativePrediction = predictEnergy(
      lastExchange.model || 'unknown',
      cumulativeData.promptTokens,
      cumulativeData.responseTokens
    );
    
    // Comparer les résultats
    let difference = 0;
    let percentDiff = 0;
    
    if (currentPrediction !== null && cumulativePrediction !== null && 
        currentPrediction > 0 && cumulativePrediction > 0) {
      difference = Math.abs(currentPrediction - cumulativePrediction);
      percentDiff = ((difference / Math.max(currentPrediction, cumulativePrediction)) * 100);
    }
    
    console.log('📊 Comparaison prédictions:', {
      current: currentPrediction,
      cumulative: cumulativePrediction,
      difference: difference.toFixed(6),
      percentDiff: percentDiff.toFixed(2) + '%'
    });
    
    return {
      success: true,
      currentPrediction: currentPrediction,
      cumulativePrediction: cumulativePrediction,
      difference: difference,
      percentDiff: percentDiff,
      currentData: currentData,
      cumulativeData: cumulativeData
    };
    
  } catch (error) {
    console.error('❌ Erreur comparaison prédictions:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Réinitialiser la session actuelle (sans toucher au total cumulé)
 */
async function resetCurrentSession() {
  await chrome.storage.local.set({
    currentSession: {
      requests: 0,
      promptTokens: 0,
      responseTokens: 0,
      energyJoules: 0,
      co2Grams: 0
    }
  });
  console.log('✓ Session actuelle réinitialisée');
}

/**
 * Réinitialiser toutes les statistiques (session + total cumulé)
 */
async function resetAllStats() {
  // Réinitialiser aussi les messages traités pour permettre un re-scan complet
  const result = await chrome.storage.local.get(['processedMessagesMap']);
  const processedMessagesMap = result.processedMessagesMap || {};
  
  // Option 1: Réinitialiser complètement (recommandé après une réinitialisation complète)
  // Option 2: Garder les messages traités mais permettre le re-scan via forceRescan
  // On choisit l'option 1 pour être cohérent avec la réinitialisation complète
  
  await chrome.storage.local.set({
    currentSession: {
      requests: 0,
      promptTokens: 0,
      responseTokens: 0,
      energyJoules: 0,
      co2Grams: 0
    },
    totalStats: {
      requests: 0,
      tokens: 0,
      co2Grams: 0
    },
    conversationHistory: [],
    lastExchange: null,
    processedMessagesMap: {}, // Réinitialiser aussi les messages traités
    // Enregistrer le timestamp de réinitialisation pour que le popup puisse détecter
    // et forcer le re-scan des messages lors du prochain scan manuel
    dataResetTimestamp: Date.now()
  });
  console.log('✓ Toutes les statistiques réinitialisées (y compris messages traités)');
}

// Écouter les messages
/**
 * Ajouter un échange à la queue de synchronisation Watsonx
 */
async function addToWatsonxSyncQueue(exchangeRecord) {
  try {
    const result = await chrome.storage.local.get(['watsonxSyncQueue']);
    const queue = result.watsonxSyncQueue || [];
    queue.push(exchangeRecord);
    await chrome.storage.local.set({ watsonxSyncQueue: queue });
    console.log(`📝 Échange ajouté à la queue Watsonx (${queue.length} en attente)`);
  } catch (error) {
    console.error('❌ Erreur ajout à la queue Watsonx:', error);
  }
}

/**
 * Rate limiter pour Watsonx API (max 8 calls/seconde)
 */
const watsonxRateLimiter = {
  calls: [],
  maxCallsPerSecond: 7, // Limiter à 7 pour être sûr (sous la limite de 8)
  minInterval: 1000 / 7, // ~143ms entre chaque appel
  
  async waitForSlot() {
    const now = Date.now();
    
    // Nettoyer les appels anciens (> 1 seconde)
    this.calls = this.calls.filter(timestamp => now - timestamp < 1000);
    
    // Si on a atteint la limite, attendre
    if (this.calls.length >= this.maxCallsPerSecond) {
      const oldestCall = Math.min(...this.calls);
      const waitTime = 1000 - (now - oldestCall) + 50; // +50ms de marge
      if (waitTime > 0) {
        console.log(`⏳ Rate limit: attente de ${waitTime.toFixed(0)}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.waitForSlot(); // Réessayer après l'attente
      }
    }
    
    // Enregistrer cet appel
    this.calls.push(Date.now());
  }
};

/**
 * Synchroniser les données avec Watsonx
 */
async function syncToWatsonx() {
  try {
    const result = await chrome.storage.local.get(['watsonxSyncQueue', 'watsonxConfig', 'lastWatsonxSync']);
    const queue = result.watsonxSyncQueue || [];
    
    if (queue.length === 0) {
      return; // Rien à synchroniser
    }
    
    // Vérifier si Watsonx est configuré
    const config = result.watsonxConfig;
    if (!config || !config.apiKey || !config.projectId) {
      console.log('⚠️ Watsonx non configuré, données en queue locale');
      return;
    }
    
    // Limiter la fréquence de synchronisation (max 1 fois toutes les 2 minutes)
    const lastSync = result.lastWatsonxSync || 0;
    const timeSinceLastSync = Date.now() - lastSync;
    const minSyncInterval = 2 * 60 * 1000; // 2 minutes
    
    if (timeSinceLastSync < minSyncInterval) {
      const remainingTime = Math.ceil((minSyncInterval - timeSinceLastSync) / 1000);
      console.log(`⏳ Synchronisation limitée: ${remainingTime}s restantes avant la prochaine sync`);
      return;
    }
    
    console.log(`🔄 Synchronisation de ${queue.length} échanges avec Watsonx...`);
    
    // Grouper les données en un seul batch pour réduire les appels API
    // Au lieu de 10 par batch, on envoie tout en un seul appel (ou max 1000 échanges)
    const maxExchangesPerCall = 1000; // Limite pour éviter les payloads trop gros
    const dataToSend = queue.slice(0, maxExchangesPerCall);
    
    // Attendre un slot disponible dans le rate limiter
    await watsonxRateLimiter.waitForSlot();
    
    // Note: Dans un service worker, on ne peut pas charger watsonx-service.js directement
    // Les données sont stockées en queue et seront synchronisées via le dashboard
    // Le dashboard peut appeler WatsonxService.sendDataToWatsonx() pour envoyer les données
    // avec le rate limiting approprié
    console.log(`📊 ${dataToSend.length} échanges prêts à être envoyés (${queue.length} total en queue)`);
    console.log('💡 Les données seront synchronisées via le dashboard (ouvrir le dashboard pour synchroniser)');
    
    // Marquer la dernière tentative de synchronisation
    await chrome.storage.local.set({ lastWatsonxSync: Date.now() });
    
  } catch (error) {
    console.error('❌ Erreur synchronisation Watsonx:', error);
  }
}

/**
 * Démarrer la synchronisation périodique avec Watsonx
 */
function startWatsonxSync() {
  // Synchroniser toutes les 5 minutes
  setInterval(async () => {
    await syncToWatsonx();
  }, 5 * 60 * 1000);
  
  // Synchroniser immédiatement au démarrage
  setTimeout(async () => {
    await syncToWatsonx();
  }, 10000); // Attendre 10 secondes après le démarrage
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NEW_EXCHANGE') {
    handleNewExchange(message.data).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Erreur:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Indique qu'on va répondre de manière asynchrone
  }
  
  if (message.type === 'RESET_SESSION') {
    resetCurrentSession().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === 'COMPARE_PREDICTIONS') {
    comparePredictions(message.data).then((result) => {
      sendResponse(result);
    }).catch((error) => {
      console.error('Erreur comparaison:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (message.type === 'RESET_SESSION_ONLY') {
    // Réinitialiser seulement la session actuelle (pas le total cumulé)
    resetCurrentSession().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === 'RESET_ALL_STATS') {
    // Réinitialiser toutes les statistiques (session + total)
    resetAllStats().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Initialiser au démarrage
init();

// Réinitialiser la session quand une nouvelle page/conversation est chargée
// Mais NE PAS réinitialiser le total cumulé
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const url = tab.url || '';
    if (url.includes('chatgpt.com') || 
        url.includes('claude.ai') || 
        url.includes('gemini.google.com')) {
      // Nouvelle page chargée, réinitialiser seulement la session actuelle
      console.log('📄 Nouvelle page détectée, réinitialisation de la session...');
      resetCurrentSession();
    }
  }
});

// Réinitialiser aussi quand un onglet est fermé (pour être sûr)
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  // Note: On ne peut pas réinitialiser ici car on n'a pas accès à l'URL
  // La réinitialisation se fait dans beforeunload du content script
});
