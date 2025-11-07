/**
 * Track Sustainability - Content Script (Version Améliorée)
 * Détecte et analyse les conversations avec les LLM
 * - Intercepte les requêtes réseau pour récupérer les vraies données
 * - Détecte les messages via le DOM avec sélecteurs robustes
 * - Gère les messages en streaming
 * - Détecte le modèle réel utilisé
 */

console.log('🌱 Track Sustainability - Content Script chargé');

// Configuration par plateforme avec sélecteurs améliorés
const PLATFORMS = {
  'chatgpt.com': {
    name: 'ChatGPT',
    defaultModel: 'gpt-4',
    selectors: {
      messages: '[data-message-author-role], [class*="group"][class*="w-full"], [role="article"]',
      userMessage: '[data-message-author-role="user"], [class*="group"][class*="user"]',
      assistantMessage: '[data-message-author-role="assistant"], [class*="group"][class*="assistant"]',
      messageText: '.markdown, [class*="markdown"], .prose, [class*="prose"]',
      messageContainer: '[data-testid*="conversation"], main, [role="main"]',
      modelSelector: '[data-model], select[aria-label*="model"], button[aria-label*="model"]'
    }
  },
  'claude.ai': {
    name: 'Claude',
    defaultModel: 'claude-3.5-sonnet',
    selectors: {
      messages: '[data-test-render-count], [class*="Message"], [class*="message"]',
      userMessage: '[class*="UserMessage"], [data-author="user"], [class*="user"]',
      assistantMessage: '[class*="AssistantMessage"], [data-author="assistant"], [class*="assistant"], [class*="claude"]',
      messageText: '.whitespace-pre-wrap, [class*="message-text"], [class*="MessageText"]',
      messageContainer: '[class*="Conversation"], main, [role="main"]',
      modelSelector: '[data-model], select[aria-label*="model"], button[aria-label*="model"]'
    }
  },
  'gemini.google.com': {
    name: 'Gemini',
    defaultModel: 'gemini-1.5-pro',
    selectors: {
      messages: '[data-message-id], [class*="message"], [class*="Message"]',
      userMessage: '[data-author="user"], [class*="user"], [class*="User"]',
      assistantMessage: '[data-author="model"], [class*="model"], [class*="Model"]',
      messageText: '[class*="content"], [class*="text"], [class*="Content"]',
      messageContainer: '[class*="conversation"], main, [role="main"]',
      modelSelector: '[data-model], select[aria-label*="model"], button[aria-label*="model"]'
    }
  }
};

// Détecter la plateforme actuelle
const currentDomain = window.location.hostname;
const platform = PLATFORMS[currentDomain];

if (!platform) {
  console.log('⚠️ Plateforme non supportée:', currentDomain);
}

// Variables globales
let lastMessageCount = 0;
let isInitialized = false;
let interceptedDataCache = new Map(); // Cache des données interceptées
let processedMessages = new Set(); // Déduplication (en mémoire)
let processedMessagesPersistent = new Set(); // Déduplication persistante (stockée) - initialisé dans loadProcessedMessages
let pendingAssistantMessages = new Map(); // Map: messageId -> { element, text, timeout } - pour debounce des messages assistant
let detectedModel = null; // Modèle détecté
let conversationId = null; // ID de la conversation actuelle

/**
 * Injecter le network interceptor dans la page
 */
async function injectNetworkInterceptor() {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('network-interceptor.js');
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log('✓ Network Interceptor injecté');
  } catch (error) {
    console.error('Erreur injection network interceptor:', error);
  }
}

/**
 * Écouter les événements des données interceptées
 */
function setupInterceptorListener() {
  window.addEventListener('ts_intercepted', (event) => {
    const data = event.detail;
    console.log('📡 Données interceptées reçues:', data);
    
    // Stocker dans le cache
    const key = `${data.platform}-${data.timestamp}`;
    interceptedDataCache.set(key, data);
    
    // Mettre à jour le modèle détecté
    if (data.model) {
      detectedModel = data.model;
      console.log('✓ Modèle détecté:', detectedModel);
    }
    
    // Si on a les tokens, traiter directement
    if (data.promptTokens && data.responseTokens) {
      processInterceptedData(data);
    }
  });
  
  // Vérifier aussi localStorage pour les données interceptées
  setInterval(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('ts_intercepted_'));
    for (const key of keys) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        const cacheKey = `${data.platform}-${data.timestamp}`;
        if (!interceptedDataCache.has(cacheKey)) {
          interceptedDataCache.set(cacheKey, data);
          if (data.model) detectedModel = data.model;
          if (data.promptTokens && data.responseTokens) {
            processInterceptedData(data);
          }
        }
      } catch (e) {
        // Ignorer les erreurs
      }
    }
  }, 1000);
}

/**
 * Traiter les données interceptées
 */
async function processInterceptedData(data) {
  try {
    // Vérifier si on a déjà traité cette requête
    // Utiliser un hash basé sur les tokens et le modèle (plus stable que timestamp)
    const hash = `${conversationId}-${data.platform}-${data.model || 'unknown'}-${data.promptTokens}-${data.responseTokens}`;
    
    if (processedMessages.has(hash) || processedMessagesPersistent.has(hash)) {
      console.log('⏭️ Données interceptées déjà traitées, ignorées');
      return;
    }
    
    // Marquer comme traité
    processedMessages.add(hash);
    await saveProcessedMessage(hash);
    
    console.log('📊 Traitement données interceptées:', {
      model: data.model,
      promptTokens: data.promptTokens,
      responseTokens: data.responseTokens
    });
    
    // Envoyer au background pour calcul avec toutes les métriques
    await chrome.runtime.sendMessage({
      type: 'NEW_EXCHANGE',
      data: {
        platform: data.platform,
        model: data.model || detectedModel || platform.defaultModel,
        promptTokens: data.promptTokens,
        responseTokens: data.responseTokens,
        totalDuration: data.totalDuration,
        responseDuration: data.responseDuration,
        wordCount: data.wordCount,
        readingTime: data.readingTime,
        timestamp: data.timestamp || Date.now()
      }
    });
  } catch (error) {
    console.error('Erreur traitement données interceptées:', error);
  }
}

/**
 * Détecter le modèle depuis le DOM
 */
function detectModelFromDOM() {
  if (!platform) return null;
  
  try {
    // Chercher dans les sélecteurs spécifiques
    const modelEl = document.querySelector(platform.selectors.modelSelector);
    if (modelEl) {
      const modelText = modelEl.textContent || modelEl.value || modelEl.getAttribute('data-model');
      if (modelText) {
        const normalized = modelText.toLowerCase().trim();
        // Extraire le nom du modèle
        if (normalized.includes('gpt-4')) return 'gpt-4';
        if (normalized.includes('gpt-3.5')) return 'gpt-3.5-turbo';
        if (normalized.includes('claude-3.5')) return 'claude-3.5-sonnet';
        if (normalized.includes('claude-3-opus')) return 'claude-3-opus';
        if (normalized.includes('claude-3-sonnet')) return 'claude-3-sonnet';
        if (normalized.includes('gemini-1.5-pro')) return 'gemini-1.5-pro';
        if (normalized.includes('gemini-pro')) return 'gemini-pro';
      }
    }
    
    // Chercher dans le texte de la page
    const pageText = document.body.textContent.toLowerCase();
    if (pageText.includes('gpt-4')) return 'gpt-4';
    if (pageText.includes('gpt-3.5')) return 'gpt-3.5-turbo';
    if (pageText.includes('claude-3.5')) return 'claude-3.5-sonnet';
    
    return null;
  } catch (error) {
    console.error('Erreur détection modèle DOM:', error);
    return null;
  }
}

/**
 * Initialiser le content script
 */
async function init() {
  if (!platform) return;
  
  console.log(`✓ Plateforme détectée: ${platform.name}`);
  
  // Réinitialiser la session actuelle au démarrage (nouvelle page/actualisation)
  // Le total cumulé reste intact
  await chrome.runtime.sendMessage({
    type: 'RESET_SESSION_ONLY'
  });
  console.log('✓ Session actuelle réinitialisée au démarrage');
  
  // Générer ou récupérer l'ID de conversation
  conversationId = generateConversationId();
  console.log('✓ ID Conversation:', conversationId);
  
  // Charger les messages déjà traités pour cette conversation
  await loadProcessedMessages();
  
  // Injecter le network interceptor
  await injectNetworkInterceptor();
  
  // Configurer l'écouteur pour les données interceptées
  setupInterceptorListener();
  
  // Détecter le modèle initial
  setTimeout(() => {
    const domModel = detectModelFromDOM();
    if (domModel) {
      detectedModel = domModel;
      console.log('✓ Modèle détecté depuis DOM:', detectedModel);
    }
  }, 2000);
  
  // Marquer comme actif
  await chrome.storage.local.set({ isActive: true });
  
  // Observer les changements dans le DOM
  observeMessages();
  
  // Écouter les messages du popup/background
  setupMessageListener();
  
  isInitialized = true;
}

/**
 * Configurer l'écouteur de messages pour les commandes du popup
 */
function setupMessageListener() {
  // Vérifier si le listener existe déjà pour éviter les doublons
  if (window.tsMessageListenerSetup) {
    console.log('⚠️ Message listener déjà configuré');
    return;
  }
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SCAN_CONVERSATION') {
      // Forcer un scan de tous les messages de la conversation actuelle
      const forceRescan = message.forceRescan || false; // Option pour forcer le re-traitement
      console.log('🔍 Scan manuel de la conversation demandé', forceRescan ? '(force rescan)' : '');
      
      // S'assurer que le script est initialisé
      (async () => {
        try {
          if (!isInitialized && platform) {
            console.log('⚠️ Script non initialisé, initialisation rapide...');
            // Initialisation minimale pour le scan
            if (!processedMessagesPersistent.size) {
              await loadProcessedMessages();
            }
            isInitialized = true;
          }
          
          // Si forceRescan est activé, réinitialiser les messages traités pour cette conversation
          if (forceRescan) {
            console.log('🔄 Réinitialisation des messages traités pour cette conversation...');
            processedMessages.clear();
            processedMessagesPersistent.clear();
            
            // Supprimer aussi du storage
            const result = await chrome.storage.local.get(['processedMessagesMap']);
            const storedMap = result.processedMessagesMap || {};
            delete storedMap[conversationId];
            await chrome.storage.local.set({ processedMessagesMap: storedMap });
            console.log('✓ Messages traités réinitialisés pour cette conversation');
            
            // S'assurer que conversationId est défini avant de scanner
            if (!conversationId) {
              conversationId = generateConversationId();
            }
          } else {
            // Si pas de forceRescan, charger les messages traités si nécessaire
            if (!processedMessagesPersistent.size) {
              await loadProcessedMessages();
            }
          }
          
          const result = await scanConversation(forceRescan);
          sendResponse(result);
        } catch (error) {
          console.error('❌ Erreur scan conversation:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      
      return true; // Indique qu'on va répondre de manière asynchrone
    }
    
    // Retourner false pour les autres messages (pas de réponse asynchrone)
    return false;
  });
  
  window.tsMessageListenerSetup = true;
  console.log('✓ Message listener configuré');
}

/**
 * Scanner manuellement toute la conversation actuelle
 * @param {boolean} forceRescan - Si true, ignore le cache des messages traités et re-traite tout
 */
async function scanConversation(forceRescan = false) {
  try {
    if (!platform) {
      return { success: false, error: 'Plateforme non supportée' };
    }
    
    console.log('🔍 Démarrage du scan manuel de la conversation...', forceRescan ? '(force rescan activé)' : '');
    
    // S'assurer que l'initialisation est faite si nécessaire
    if (!isInitialized) {
      console.log('⚠️ Script non initialisé, initialisation en cours...');
      await init();
      // Attendre un peu que l'initialisation soit complète
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Trouver tous les messages dans la page
    const allMessages = findMessages();
    
    if (allMessages.length === 0) {
      console.log('⚠️ Aucun message trouvé dans la conversation');
      return { success: true, scanned: 0, message: 'Aucun message trouvé' };
    }
    
    console.log(`📊 ${allMessages.length} messages trouvés, analyse en cours...`);
    
    // Analyser tous les messages (la fonction analyzeMessages gère la déduplication sauf si forceRescan)
    const newMessagesCount = await analyzeMessages(allMessages, forceRescan);
    
    console.log(`✅ Scan terminé: ${newMessagesCount} nouveau(x) message(s) analysé(s) sur ${allMessages.length} total`);
    
    return {
      success: true,
      scanned: newMessagesCount,
      total: allMessages.length,
      message: `${newMessagesCount} nouveau(x) message(s) analysé(s) sur ${allMessages.length} total`
    };
    
  } catch (error) {
    console.error('❌ Erreur lors du scan:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Générer un ID unique pour la conversation actuelle
 */
function generateConversationId() {
  // Essayer de trouver un ID depuis l'URL
  const url = window.location.href;
  const urlMatch = url.match(/\/c\/([a-zA-Z0-9-]+)/) || url.match(/conversation\/([a-zA-Z0-9-]+)/);
  if (urlMatch) {
    return `conv-${urlMatch[1]}`;
  }
  
  // Sinon, utiliser l'URL complète comme ID
  const urlHash = btoa(url).substring(0, 32);
  return `conv-${urlHash}`;
}

/**
 * Charger les messages déjà traités depuis le storage
 */
async function loadProcessedMessages() {
  try {
    // Initialiser le Set (même si vide)
    processedMessagesPersistent = new Set();
    
    const result = await chrome.storage.local.get(['processedMessagesMap']);
    const storedMap = result.processedMessagesMap || {};
    
    // Charger les messages de cette conversation
    if (storedMap[conversationId] && Array.isArray(storedMap[conversationId])) {
      processedMessagesPersistent = new Set(storedMap[conversationId]);
      console.log(`✓ ${processedMessagesPersistent.size} messages déjà traités pour cette conversation`);
    } else {
      console.log('✓ Aucun message précédemment traité pour cette conversation');
    }
  } catch (error) {
    console.error('Erreur chargement messages traités:', error);
    processedMessagesPersistent = new Set(); // Fallback
  }
}

/**
 * Sauvegarder un message comme traité
 */
async function saveProcessedMessage(hash) {
  try {
    processedMessagesPersistent.add(hash);
    
    // Sauvegarder dans le storage
    const result = await chrome.storage.local.get(['processedMessagesMap']);
    const storedMap = result.processedMessagesMap || {};
    storedMap[conversationId] = Array.from(processedMessagesPersistent);
    
    // Limiter à 1000 messages par conversation pour éviter le stockage excessif
    if (storedMap[conversationId].length > 1000) {
      storedMap[conversationId] = storedMap[conversationId].slice(-1000);
      processedMessagesPersistent = new Set(storedMap[conversationId]);
    }
    
    await chrome.storage.local.set({ processedMessagesMap: storedMap });
  } catch (error) {
    console.error('Erreur sauvegarde message traité:', error);
  }
}

// Debounce pour limiter la fréquence des vérifications
let checkMessagesTimeout = null;

/**
 * Helper function pour trouver un parent correspondant à un sélecteur (remplace closest)
 */
function findParentMatching(element, selector) {
  // Protection: vérifier que element est un Element valide
  if (!element) {
    return null;
  }
  
  // Si element n'est pas un Element, essayer de trouver le parent Element
  let currentElement = element;
  if (!(currentElement instanceof Element)) {
    if (currentElement && currentElement.nodeType && currentElement.parentNode) {
      let parent = currentElement.parentNode;
      while (parent && parent.nodeType !== Node.ELEMENT_NODE) {
        parent = parent.parentNode;
      }
      if (parent instanceof Element) {
        currentElement = parent;
      } else {
        return null;
      }
    } else {
      return null;
    }
  }
  
  // Si c'est un sélecteur simple comme 'textarea', 'input'
  if (selector === 'textarea' || selector === 'input') {
    let current = currentElement;
    while (current) {
      if (current.tagName === selector.toUpperCase()) {
        return current;
      }
      current = current.parentElement;
      if (!current || current === document.body) break;
    }
    return null;
  }
  
  // Si c'est un sélecteur d'attribut comme '[data-message-author-role="assistant"]' ou 'div[data-message-author-role="assistant"]'
  if (selector.includes('[data-message-author-role')) {
    const match = selector.match(/\[data-message-author-role="?(\w+)"?\]/);
    const tagMatch = selector.match(/^(\w+)\[/);
    const tagName = tagMatch ? tagMatch[1].toUpperCase() : null;
    
    if (match) {
      const role = match[1];
      let current = currentElement;
      while (current) {
        // Si un tagName est spécifié (ex: 'div'), vérifier qu'on est sur le bon tag
        if ((!tagName || current.tagName === tagName) &&
            current.hasAttribute('data-message-author-role') && 
            current.getAttribute('data-message-author-role') === role) {
          return current;
        }
        current = current.parentElement;
        if (!current || current === document.body) break;
      }
    }
    return null;
  }
  
  // Si c'est un sélecteur d'attribut simple comme '[contenteditable="true"]'
  if (selector.includes('[contenteditable')) {
    let current = currentElement;
    while (current) {
      if (current.hasAttribute('contenteditable') && 
          current.getAttribute('contenteditable') === 'true') {
        return current;
      }
      current = current.parentElement;
      if (!current || current === document.body) break;
    }
    return null;
  }
  
  // Si c'est un sélecteur de role comme '[role="textbox"]'
  if (selector.includes('[role=')) {
    const match = selector.match(/\[role="?(\w+)"?\]/);
    if (match) {
      const role = match[1];
      let current = currentElement;
      while (current) {
        if (current.hasAttribute('role') && 
            current.getAttribute('role') === role) {
          return current;
        }
        current = current.parentElement;
        if (!current || current === document.body) break;
      }
    }
    return null;
  }
  
  return null;
}

/**
 * Observer les nouveaux messages
 */
function observeMessages() {
  // Observer le conteneur de messages
  const observer = new MutationObserver((mutations) => {
    // Filtrer les mutations pour ignorer celles de la zone de saisie ET des messages assistant
    const hasRelevantChanges = mutations.some(mutation => {
      const target = mutation.target;
      
      // Protection: ignorer si target n'existe pas ou n'a pas les propriétés attendues
      if (!target) {
        return false;
      }
      
      // Obtenir l'élément cible (si target n'est pas un Element, essayer de trouver un parent Element)
      let targetElement = null;
      if (target instanceof Element) {
        targetElement = target;
      } else if (target.nodeType !== undefined) {
        // C'est un Text node, Comment, ou autre type de node - chercher le parent Element
        let currentNode = target.parentNode;
        let depth = 0;
        while (currentNode && currentNode.nodeType !== Node.ELEMENT_NODE && depth < 10) {
          currentNode = currentNode.parentNode;
          depth++;
        }
        if (currentNode instanceof Element) {
          targetElement = currentNode;
        }
      }
      
      // Si on n'a pas d'élément valide, ignorer cette mutation
      if (!targetElement || !(targetElement instanceof Element)) {
        return false;
      }
      
      // IGNORER: Les changements dans les zones de saisie, textarea, input
      if (targetElement.tagName === 'TEXTAREA' || targetElement.tagName === 'INPUT') {
        return false;
      }
      
      // Vérifier si l'élément ou un parent est un textarea/input
      if (findParentMatching(targetElement, 'textarea') || 
          findParentMatching(targetElement, 'input')) {
        return false;
      }
      
      // Vérifier si l'élément ou un parent a contenteditable="true" et role="textbox"
      const contentEditable = findParentMatching(targetElement, '[contenteditable="true"]');
      const textbox = findParentMatching(targetElement, '[role="textbox"]');
      if (contentEditable && textbox) {
        return false;
      }
      
      // IGNORER: Tous les changements dans les conteneurs de messages assistant
      // ChatGPT écrit ses réponses dans ces éléments, on ne veut pas déclencher d'analyse pendant l'écriture
      const assistantContainer = findParentMatching(targetElement, 'div[data-message-author-role="assistant"]');
      if (assistantContainer) {
        // C'est un changement dans un message assistant - IGNORER
        return false;
      }
      
      // IGNORER: Les changements de caractères dans des éléments non-messages
      if (mutation.type === 'characterData') {
        const parent = targetElement.parentElement;
        if (!parent || !parent.hasAttribute('data-message-author-role')) {
          return false;
        }
        // Si c'est un changement de caractères dans un message assistant, ignorer aussi
        if (parent.getAttribute('data-message-author-role') === 'assistant') {
          return false;
        }
      }
      
      return true;
    });
    
    if (!hasRelevantChanges) return;
    
    // Debounce pour checkForNewMessages (500ms)
    if (checkMessagesTimeout) {
      clearTimeout(checkMessagesTimeout);
    }
    checkMessagesTimeout = setTimeout(() => {
    checkForNewMessages();
    }, 500);
    
  });
  
  // Observer tout le body pour capturer les changements
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  
  // Vérification initiale
  setTimeout(() => checkForNewMessages(), 2000);
}

/**
 * [FONCTION OBSOLÈTE - REMPLACÉE PAR DEBOUNCE]
 * Cette fonction n'est plus utilisée - on utilise maintenant un système de debounce simple
 */
function observeStopButton_OBSOLETE() {
  // Fonction pour vérifier l'état du bouton
  function checkStopButton() {
    // Essayer plusieurs sélecteurs pour être sûr de trouver le bouton
    const stopButton1 = document.querySelector('button[data-testid="stop-button"]');
    const stopButton2 = document.querySelector('button[aria-label="Arrêter le streaming"]');
    const stopButton3 = document.querySelector('button[aria-label*="Arrêter"]');
    const stopButton4 = document.querySelector('button.composer-submit-btn[data-testid="stop-button"]');
    const stopButton = stopButton1 || stopButton2 || stopButton3 || stopButton4;
    
    // Vérifier que le bouton existe ET est visible
    const buttonExists = stopButton !== null && stopButton.offsetParent !== null;
    
    // Si le bouton apparaît (streaming commence)
    if (buttonExists && !isCurrentlyStreaming) {
      console.log('🟢 Streaming DÉMARRÉ (bouton stop détecté) - isCurrentlyStreaming = true');
      isCurrentlyStreaming = true;
    }
    
    // Si le bouton disparaît (streaming terminé)
    if (!buttonExists && isCurrentlyStreaming) {
      console.log('🔴 Streaming TERMINÉ (bouton stop disparu) - isCurrentlyStreaming = false');
      isCurrentlyStreaming = false;
      
      // Traiter tous les messages en streaming qui sont maintenant terminés
      // Attendre un peu pour s'assurer que le texte final est bien là
      setTimeout(() => {
        checkStreamingMessages();
      }, 200);
    }
    
    // Log périodique pour debug (seulement si le flag change)
    if (buttonExists !== isCurrentlyStreaming) {
      console.log('⚠️ État incohérent détecté - buttonExists:', buttonExists, 'isCurrentlyStreaming:', isCurrentlyStreaming);
    }
  }
  
  // Vérification initiale
  checkStopButton();
  
  // Observer les changements dans le DOM pour détecter l'apparition/disparition du bouton
  if (stopButtonObserver) {
    stopButtonObserver.disconnect();
  }
  
  stopButtonObserver = new MutationObserver((mutations) => {
    // Vérifier seulement si c'est une mutation pertinente (ajout/suppression d'éléments)
    const hasRelevantChange = mutations.some(mutation => {
      return mutation.type === 'childList' || 
             (mutation.type === 'attributes' && 
              (mutation.attributeName === 'aria-label' || 
               mutation.attributeName === 'data-testid' || 
               mutation.attributeName === 'class'));
    });
    
    if (hasRelevantChange) {
      checkStopButton();
    }
  });
  
  // Observer la zone du composer (où se trouve le bouton)
  // Essayer plusieurs sélecteurs pour trouver la zone du bouton
  const composerArea = document.querySelector('form') || 
                      document.querySelector('[role="textbox"]')?.closest('div')?.parentElement ||
                      document.querySelector('div[data-testid*="composer"]') ||
                      document.querySelector('div[class*="composer"]') ||
                      document.body;
  
  stopButtonObserver.observe(composerArea || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-label', 'data-testid', 'class']
  });
  
  // Vérifier périodiquement aussi (au cas où l'observer rate quelque chose)
  // Intervalle plus court pour une détection plus rapide
  setInterval(checkStopButton, 200);
}

/**
 * Vérifier s'il y a de nouveaux messages (version améliorée avec déduplication)
 */
async function checkForNewMessages() {
  try {
    // Trouver tous les messages
    const messages = findMessages();
    
    if (messages.length === 0) return;
    
    // Filtrer seulement les messages vraiment nouveaux (pas déjà traités)
    // IMPORTANT: Vérifier TOUS les messages, pas seulement ceux après lastMessageCount
    // car lors du scroll, des messages anciens peuvent réapparaître
    const newMessages = [];
    let processedCount = 0;
    
    for (const messageEl of messages) {
      const text = extractMessageText(messageEl);
      if (!text || text.trim().length === 0) continue;
      
      const hash = generateMessageHash(messageEl, text);
      if (!hash) continue;
      
      // Pour les messages assistant, TOUJOURS les ignorer dans checkForNewMessages
      // Ils seront gérés uniquement par le debounce dans analyzeMessages
      // Cela évite de créer plusieurs timeouts pour le même message
      if (isAssistantMessage(messageEl)) {
        const messageId = generateMessageId(messageEl);
        
        // Si le message est déjà en attente dans le debounce, l'ignorer COMPLÈTEMENT
        // Peu importe le hash, on ne veut pas le re-traiter
        if (pendingAssistantMessages.has(messageId)) {
          processedCount++;
          continue;
        }
        
        // Si c'est un nouveau message assistant (pas encore dans pendingAssistantMessages),
        // l'ajouter à newMessages UNE SEULE FOIS pour qu'il soit géré par analyzeMessages
        // qui créera le debounce. Mais seulement si aucun hash de ce message n'a été traité.
        // On vérifie tous les hashes possibles de ce message en regardant les messages traités
        // qui ont le même messageId (mais c'est complexe, donc on utilise une approche plus simple)
        
        // Approche simple: si le message n'est pas dans pendingAssistantMessages ET
        // qu'aucun hash similaire n'a été traité, l'ajouter
        const isAlreadyProcessed = Array.from(processedMessagesPersistent).some(h => {
          // Vérifier si ce hash pourrait être du même message (approximation)
          return h.includes(messageId.substring(0, 20)) || h.includes(text.substring(0, 30));
        });
        
        if (!isAlreadyProcessed && !processedMessages.has(hash) && !processedMessagesPersistent.has(hash)) {
          newMessages.push(messageEl);
        } else {
          processedCount++;
        }
        continue; // Ne pas continuer avec le traitement normal
      }
      
      // Vérifier dans les deux sets (mémoire + persistants)
      if (!processedMessages.has(hash) && !processedMessagesPersistent.has(hash)) {
        newMessages.push(messageEl);
      } else {
        processedCount++;
      }
    }
    
    if (newMessages.length > 0) {
      console.log(`📨 ${newMessages.length} nouveaux messages détectés (${messages.length} total, ${processedCount} déjà traités)`);
      await analyzeMessages(newMessages);
    }
      
    // Mettre à jour lastMessageCount pour référence
      lastMessageCount = messages.length;
  } catch (error) {
    console.error('Erreur lors de la vérification des messages:', error);
  }
}

/**
 * [FONCTION OBSOLÈTE - REMPLACÉE PAR DEBOUNCE]
 * Cette fonction n'est plus utilisée - on utilise maintenant un système de debounce simple
 */
function checkStreamingMessages_OBSOLETE() {
  // Fonction obsolète - remplacée par le système de debounce
}

/**
 * [FONCTION OBSOLÈTE - REMPLACÉE PAR processAssistantMessage]
 * Cette fonction n'est plus utilisée
 */
async function processCompleteStreamingMessage_OBSOLETE(messageData) {
  const element = messageData.element;
  const text = messageData.text;
  
  // Vérifier si déjà traité
  const hash = generateMessageHash(element, text);
  if (!hash) return;
  
  // Si le message a déjà été traité (marqué pendant le streaming), on ne le traite pas à nouveau
  // Sauf si c'est la première fois qu'on le voit complet
  if (processedMessages.has(hash) || processedMessagesPersistent.has(hash)) {
    // Vérifier si c'est juste qu'il a été marqué pendant le streaming mais pas encore traité complètement
    // On peut le traiter maintenant car c'est la version complète
    console.log('✅ Message streaming complet (déjà marqué, traitement final):', hash.substring(0, 50));
  } else {
    // Marquer comme traité
    processedMessages.add(hash);
    await saveProcessedMessage(hash);
  }
  
  // Estimer les tokens
  const tokens = estimateTokens(text);
  
  // Récupérer le dernier prompt
  const result = await chrome.storage.local.get(['lastPrompt']);
  const promptTokens = result.lastPrompt?.tokens || 0;
  
  console.log(`✅ Message streaming complet: ${tokens} tokens`);
  
  // Calculer wordCount et readingTime pour le message streaming
  const responseWordCount = countWords(text);
  const responseReadingTime = calculateReadingTime(responseWordCount);
  
  // Envoyer au background pour calcul
  // Note: Pour les messages streaming, on n'a pas toutes les métriques (durées, mots, etc.)
  // On utilisera le modèle local pour ces cas
  await chrome.runtime.sendMessage({
    type: 'NEW_EXCHANGE',
    data: {
      platform: platform.name,
      model: detectedModel || platform.defaultModel,
      promptTokens,
      responseTokens: tokens,
      totalDuration: null, // Non disponible pour streaming
      responseDuration: null,
      wordCount: responseWordCount || 0,
      readingTime: responseReadingTime || 0,
      timestamp: Date.now()
    }
  });
}

/**
 * Générer un ID unique et stable pour un message
 */
function generateMessageId(element) {
  // 1. Pour ChatGPT avec data-message-author-role, utiliser data-message-id en priorité
  if (element.hasAttribute('data-message-author-role')) {
    const messageId = element.getAttribute('data-message-id');
    if (messageId) {
      return `stable-${messageId}`;
    }
  }
  
  // 2. Essayer d'utiliser des attributs stables (ne changent pas lors du scroll)
  const stableId = element.getAttribute('id') || 
                   element.getAttribute('data-message-id') ||
                   element.getAttribute('data-testid') ||
                   element.getAttribute('data-test-render-count') ||
                   element.getAttribute('data-id');
  
  if (stableId) {
    return `stable-${stableId}`;
  }
  
  // 2. Essayer de trouver un ID dans les parents
  let parent = element.parentElement;
  let depth = 0;
  while (parent && depth < 5) {
    const parentId = parent.getAttribute('id') || 
                     parent.getAttribute('data-message-id') ||
                     parent.getAttribute('data-testid');
    if (parentId) {
      // Trouver l'index de cet élément parmi ses frères
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element);
      return `parent-${parentId}-${index}`;
    }
    parent = parent.parentElement;
    depth++;
  }
  
  // 3. Utiliser le contenu du message comme identifiant (plus stable)
  const text = extractMessageText(element);
  if (text && text.length > 20) {
    // Créer un hash simple du contenu
    const textHash = text.substring(0, 50).replace(/\s+/g, '').toLowerCase();
    const role = isUserMessage(element) ? 'user' : 'assistant';
    return `content-${role}-${textHash.substring(0, 30)}`;
  }
  
  // 4. Fallback: utiliser la position dans le DOM (peut changer lors du scroll)
  const allMessages = findMessages();
  const messageIndex = allMessages.indexOf(element);
  return `fallback-${messageIndex}`;
}

/**
 * Générer un hash stable pour déduplication
 * Priorité: data-message-id (ChatGPT) > contenu normalisé
 */
function generateMessageHash(element, text) {
  if (!text || text.trim().length === 0) {
    return null;
  }
  
  const role = isUserMessage(element) ? 'user' : 'assistant';
  
  // Pour ChatGPT, utiliser data-message-id en priorité (le plus fiable)
  if (element.hasAttribute('data-message-author-role')) {
    const messageId = element.getAttribute('data-message-id');
    if (messageId) {
      // Hash basé sur l'ID stable + conversation + role
      return `${conversationId}-${role}-${messageId}`;
    }
  }
  
  // Fallback: utiliser un hash basé sur le contenu
  // Normaliser le texte: supprimer les espaces multiples, convertir en minuscules
  const normalizedText = text.trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .substring(0, 200); // Utiliser plus de caractères pour plus de précision
  
  // Créer un hash simple mais stable
  let hash = 0;
  for (let i = 0; i < normalizedText.length; i++) {
    const char = normalizedText.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convertir en 32-bit integer
  }
  
  // Combiner role + hash du contenu
  return `${conversationId}-${role}-${Math.abs(hash)}`;
}

/**
 * Filtrer les éléments UI et titres de snippets (non-messages)
 */
function isUIMessage(element) {
  // IMPORTANT: Ne jamais exclure les éléments avec data-message-author-role
  // Ce sont des vrais messages, pas de l'UI
  if (element.hasAttribute('data-message-author-role')) {
    return false;
  }
  
  // Ne jamais exclure les éléments qui sont dans un conteneur avec data-message-author-role
  if (element instanceof Element && typeof element.closest === 'function') {
    try {
      if (element.closest('[data-message-author-role]')) {
        return false;
      }
    } catch (error) {
      console.warn('Erreur lors de l\'appel à closest() dans isUIMessage:', error, element);
      // En cas d'erreur, continuer le traitement normal
    }
  }
  
  const text = element.textContent || '';
  const html = element.outerHTML || '';
  const trimmedText = text.trim();
  
  // Si le texte est très long (> 100 caractères), c'est probablement un vrai message
  if (trimmedText.length > 100) {
    return false;
  }
  
  // Patterns d'éléments UI à exclure (ChatGPT spécifiques)
  // Seulement pour les éléments très courts et avec des patterns UI spécifiques
  const uiPatterns = [
    'Nouveau chat',
    'Ctrl Shift O',
    'Rechercher des chats',
    'Ctrl K',
    'Chat éphémère',
    'Ce chat n\'est pas',
    'sidebar',
    'navigation',
    'menu',
    'toolbar',
    'button',
    'header',
    'footer',
    '[role="button"]',
    '[role="navigation"]',
    '[role="menu"]'
  ];
  
  // Vérifier si le texte contient des patterns UI
  const lowerText = trimmedText.toLowerCase();
  const lowerHTML = html.toLowerCase();
  
  for (const pattern of uiPatterns) {
    const lowerPattern = pattern.toLowerCase();
    if (lowerText.includes(lowerPattern) || lowerHTML.includes(lowerPattern)) {
      return true;
    }
  }
  
  // Détection spécifique pour les messages UI de ChatGPT
  // Si le texte contient plusieurs de ces patterns, c'est probablement de l'UI
  const chatgptUIPatterns = ['nouveau chat', 'ctrl shift', 'rechercher', 'chat éphémère'];
  let matchCount = 0;
  for (const pattern of chatgptUIPatterns) {
    if (lowerText.includes(pattern)) {
      matchCount++;
    }
  }
  // Si 2+ patterns UI détectés, c'est de l'UI
  if (matchCount >= 2) {
    return true;
  }
  
  // Détecter les titres de snippets/code blocks
  // Patterns: "Blender 4 · python", "JavaScript", "```python", "Code:", etc.
  const snippetTitlePatterns = [
    /^[A-Z][a-z]+ \d+/,  // "Blender 4", "Python 3", etc.
    /^[A-Z][a-z]+ · [a-z]+/i,  // "Blender 4 · python"
    /^```[a-z]*\s*$/i,  // "```python" seul
    /^[A-Z][a-z]+:$/,  // "Code:", "Python:", etc.
    /^[a-z]+ \d+\.\d+$/i,  // "python 3.9", "blender 4.2"
    /^[A-Z][a-z]+\s*·\s*[a-z]+/i,  // "Blender · python"
  ];
  
  for (const pattern of snippetTitlePatterns) {
    if (pattern.test(trimmedText)) {
      return true;
    }
  }
  
  // Messages qui ressemblent à des titres de code blocks
  // Format: "Langage · extension" ou "Langage Version"
  if (trimmedText.length < 50 && (
    trimmedText.includes(' · ') ||
    /^[A-Z][a-z]+\s+\d+/.test(trimmedText) ||
    /^[a-z]+\s*\d+\.\d+/.test(trimmedText)
  )) {
    // Mais pas si ça contient du vrai contenu de code
    if (!trimmedText.includes('\n') && !trimmedText.includes('{') && !trimmedText.includes('(')) {
      return true;
    }
  }
  
  // Vérifier les attributs ARIA
  const role = element.getAttribute('role');
  if (role && ['button', 'navigation', 'menu', 'menubar', 'toolbar', 'heading'].includes(role)) {
    return true;
  }
  
  // Vérifier les classes UI communes
  const classes = element.className || '';
  if (typeof classes === 'string') {
    const uiClasses = ['sidebar', 'navigation', 'menu', 'toolbar', 'header', 'footer', 'button', 'title', 'heading', 'label', 'caption'];
    for (const uiClass of uiClasses) {
      if (classes.toLowerCase().includes(uiClass)) {
        return true;
      }
    }
    
    // Détecter les classes de titres de code blocks
    if (classes.toLowerCase().includes('code-title') || 
        classes.toLowerCase().includes('snippet-title') ||
        classes.toLowerCase().includes('filename') ||
        classes.toLowerCase().includes('language-label')) {
      return true;
    }
  }
  
  // Vérifier si c'est un élément de titre HTML
  const tagName = element.tagName ? element.tagName.toLowerCase() : '';
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'caption', 'legend'].includes(tagName)) {
    // Si c'est très court et ressemble à un titre de snippet, exclure
    if (trimmedText.length < 50 && (trimmedText.includes(' · ') || /^[A-Z][a-z]+\s+\d+/.test(trimmedText))) {
      return true;
    }
  }
  
  // Messages qui commencent par des patterns UI (très probablement de l'UI)
  if (trimmedText.length > 0) {
    const firstChars = trimmedText.substring(0, 50).toLowerCase();
    if (firstChars.includes('nouveau chat') || 
        firstChars.includes('rechercher des chats') ||
        firstChars.includes('ctrl shift') ||
        firstChars.includes('chat éphémère') ||
        firstChars.includes('ce chat n\'est pas')) {
      return true;
    }
  }
  
  // Messages très courts sont probablement des UI (sauf code)
  if (trimmedText.length < 20 && !trimmedText.includes('```') && !trimmedText.match(/[a-z]{10,}/i)) {
    return true;
  }
  
  // Messages qui sont juste des séparateurs ou des labels
  if (trimmedText.length < 30 && (
    trimmedText.match(/^[·\-_=]+$/) ||  // Séparateurs
    trimmedText.match(/^[A-Z][a-z]+\s*$/)  // Un seul mot capitalisé
  )) {
    return true;
  }
  
  // Messages qui contiennent principalement des raccourcis clavier ou instructions UI
  const uiInstructionPatterns = ['ctrl', 'shift', 'alt', 'cmd', '⌘', '⌃', '⌥'];
  let uiInstructionCount = 0;
  for (const pattern of uiInstructionPatterns) {
    if (lowerText.includes(pattern)) {
      uiInstructionCount++;
    }
  }
  // Si beaucoup de raccourcis clavier, c'est probablement de l'UI
  if (uiInstructionCount >= 2 && trimmedText.length < 200) {
    return true;
  }
  
  return false;
}

/**
 * Trouver tous les messages dans la page (en excluant les éléments UI)
 * Version améliorée pour ChatGPT utilisant data-message-author-role
 */
function findMessages() {
  const messages = [];
  
  try {
    // Pour ChatGPT, utiliser la méthode précise avec data-message-author-role
    if (platform && platform.name === 'ChatGPT') {
      // Exclure explicitement les éléments <hr> et autres éléments non-messages
      const messageNodes = document.querySelectorAll("div[data-message-author-role]:not(hr):not([data-start]):not([data-end])");
      
      if (messageNodes.length > 0) {
        // Filtrer les éléments UI et valider les messages
        const filtered = Array.from(messageNodes).filter(node => {
          // IMPORTANT: Si l'élément a data-message-author-role, c'est un vrai message
          // Ne jamais l'exclure comme UI - c'est le conteneur principal du message
          if (node.hasAttribute('data-message-author-role')) {
            // Ignorer seulement les <hr> avec data-message-author-role (ne devrait pas arriver)
            if (node.tagName === 'HR') {
              return false;
            }
            
            // Vérifier seulement qu'il a du contenu
            const text = node.innerText || node.textContent || '';
            if (!text || text.trim().length < 5) {
              return false;
            }
            return true;
          }
          
          // Vérifier que node est un Element valide
          if (!(node instanceof Element)) {
            return false;
          }
          
          // Ignorer les éléments <hr> et autres éléments de séparation (sauf s'ils sont dans un message)
          if (node.tagName === 'HR') {
            return false;
          }
          
          // Ignorer les éléments qui ne sont pas des divs (sauf exceptions)
          if (node.tagName !== 'DIV') {
            // Vérifier que closest est disponible
            if (typeof node.closest !== 'function') {
              return false;
            }
            try {
              if (!node.closest('div[data-message-author-role]')) {
                return false;
              }
            } catch (error) {
              // Ne pas logger pour éviter le spam dans la console
              return false;
            }
          }
          
          // Pour les autres éléments, vérifier s'ils sont dans un conteneur de message
          if (!(node instanceof Element) || typeof node.closest !== 'function') {
            return false;
          }
          let messageContainer = null;
          try {
            messageContainer = node.closest('[data-message-author-role]');
          } catch (error) {
            console.warn('Erreur lors de l\'appel à closest() pour messageContainer:', error, node);
            return false;
          }
          if (messageContainer) {
            // C'est un sous-élément d'un message (comme <p data-start="..." data-end="...">)
            // Ne pas l'exclure - on utilisera le conteneur parent pour extraire le texte
            // Mais on ne veut pas traiter les sous-éléments comme des messages séparés
            // Donc on retourne false ici car on traitera le conteneur parent
            return false;
          }
          
          // Ignorer les éléments UI (vérifier AVANT extraction pour performance)
          if (isUIMessage(node)) {
            return false;
          }
          
          // Vérifier que c'est un vrai message (a du contenu significatif)
          const text = node.innerText || node.textContent || '';
          if (!text || text.trim().length < 10) {
            return false;
          }
          
          // Vérifier à nouveau après extraction (le texte extrait peut révéler que c'est de l'UI)
          const extractedLower = text.toLowerCase();
          const extractedTrimmed = text.trim();
          
          // Détection stricte des messages UI ChatGPT (seulement pour les très courts)
          const isChatGPTUI = (
            extractedTrimmed.length < 200 && (
              (extractedLower.includes('nouveau chat') && extractedLower.includes('ctrl shift')) ||
              (extractedLower.includes('nouveau chat') && extractedLower.includes('rechercher')) ||
              (extractedLower.includes('chat éphémère') && extractedLower.length < 100) ||
              (extractedLower.startsWith('nouveau chat') && extractedLower.includes('ctrl')) ||
              (extractedLower.includes('par quoi commençons-nous') && extractedLower.includes('chat éphémère'))
            )
          );
          
          // Détection des messages avec beaucoup de raccourcis clavier (UI)
          // Seulement pour les très courts messages
          const keyboardShortcuts = ['ctrl', 'shift', 'alt', 'cmd', '⌘'];
          const shortcutCount = keyboardShortcuts.filter(s => extractedLower.includes(s)).length;
          const isInstructionUI = shortcutCount >= 2 && extractedTrimmed.length < 150;
          
          if (isChatGPTUI || isInstructionUI) {
            return false;
          }
          
          return true;
        });
        
        if (filtered.length > 0) {
          return filtered;
        }
      }
    }
    
    // Pour les autres plateformes, utiliser la méthode originale
    // Essayer différents sélecteurs selon la plateforme
    const selectors = [
      platform.selectors.messages,
      '[role="article"]',
      '.message',
      '[data-testid*="message"]',
      '[class*="Message"]',
      '[class*="message"]'
    ];
    
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        // Filtrer les éléments UI
        const filtered = Array.from(elements).filter(el => {
          // Ignorer les éléments UI (vérifier AVANT extraction pour performance)
          if (isUIMessage(el)) {
            console.log('⏭️ Élément UI exclu:', el.textContent?.substring(0, 50) || 'N/A');
            return false;
          }
          
          // Vérifier que c'est un vrai message (a du contenu significatif)
          const text = extractMessageText(el);
          if (!text || text.trim().length < 10) {
            return false;
          }
          
          // Vérifier à nouveau après extraction (le texte extrait peut révéler que c'est de l'UI)
          const extractedLower = text.toLowerCase();
          const extractedTrimmed = text.trim();
          
          // Détection stricte des messages UI ChatGPT
          const isChatGPTUI = (
            (extractedLower.includes('nouveau chat') && extractedLower.includes('ctrl shift')) ||
            (extractedLower.includes('nouveau chat') && extractedLower.includes('rechercher')) ||
            (extractedLower.includes('chat éphémère') && extractedLower.length < 200) ||
            (extractedLower.startsWith('nouveau chat') && extractedLower.includes('ctrl')) ||
            (extractedLower.includes('par quoi commençons-nous') && extractedLower.includes('chat éphémère'))
          );
          
          // Détection des messages avec beaucoup de raccourcis clavier (UI)
          const keyboardShortcuts = ['ctrl', 'shift', 'alt', 'cmd', '⌘'];
          const shortcutCount = keyboardShortcuts.filter(s => extractedLower.includes(s)).length;
          const isInstructionUI = shortcutCount >= 2 && extractedTrimmed.length < 300;
          
          if (isChatGPTUI || isInstructionUI) {
            return false;
          }
          
          return true;
        });
        
        if (filtered.length > 0) {
          return filtered;
        }
      }
    }
  } catch (error) {
    console.error('Erreur lors de la recherche de messages:', error);
  }
  
  return messages;
}

/**
 * Analyser les nouveaux messages
 * @param {Array} messages - Liste des éléments DOM de messages
 * @param {boolean} forceRescan - Si true, ignore le cache et re-traite tous les messages
 * @returns {Promise<number>} - Nombre de nouveaux messages traités
 */
async function analyzeMessages(messages, forceRescan = false) {
  let newMessagesCount = 0;
  
  for (const messageEl of messages) {
    try {
      // Générer un hash pour déduplication
      const text = extractMessageText(messageEl);
      if (!text || text.trim().length === 0) continue;
      
      const hash = generateMessageHash(messageEl, text);
      if (!hash) continue;
      
      // Vérifier dans les deux sets (mémoire + persistants) sauf si forceRescan
      if (!forceRescan && (processedMessages.has(hash) || processedMessagesPersistent.has(hash))) {
        console.log('⏭️ Message déjà traité, ignoré:', hash.substring(0, 50));
        continue; // Déjà traité
      }
      
      // Si forceRescan, retirer le hash du cache pour le re-traiter
      if (forceRescan) {
        processedMessages.delete(hash);
        processedMessagesPersistent.delete(hash);
      }
      
      // Déterminer le type de message (user ou assistant)
      const isUser = isUserMessage(messageEl);
      const isAssistant = isAssistantMessage(messageEl);
      
      if (!isUser && !isAssistant) continue;
      
      // RÈGLE SIMPLE: Pour les messages assistant, utiliser un debounce
      // TOUS les messages assistant passent par le debounce, sans exception
      if (isAssistant) {
        const messageId = generateMessageId(messageEl);
        
        // Si le message est déjà en attente, annuler le timeout précédent et en créer un nouveau
        // avec le texte mis à jour
        if (pendingAssistantMessages.has(messageId)) {
          const pending = pendingAssistantMessages.get(messageId);
          clearTimeout(pending.timeout);
          console.log('🔄 Message assistant déjà en attente, timeout précédent annulé');
        } else {
          console.log('🆕 Nouveau message assistant détecté, création du debounce');
        }
        
        // Toujours créer/mettre à jour le timeout pour ce message
        // Le timeout sera annulé et recréé à chaque fois que le texte change
        const processMessage = async () => {
          // Vérifier que le message existe toujours
          if (!messageEl || !messageEl.isConnected) {
            pendingAssistantMessages.delete(messageId);
            return;
          }
          
          const currentText = extractMessageText(messageEl);
          if (!currentText || currentText.trim().length === 0) {
            pendingAssistantMessages.delete(messageId);
            return;
          }
          
          // Vérifier que le texte n'a pas changé depuis qu'on a créé le timeout
          // (tolérance de 5 caractères pour les petits changements finaux)
          const textDiff = Math.abs(currentText.length - text.length);
          if (textDiff > 5) {
            // Le texte a changé, ne pas traiter (probablement encore en streaming)
            // Recréer le timeout avec le nouveau texte
            const newTimeout = setTimeout(processMessage, 2000);
            pendingAssistantMessages.set(messageId, {
              element: messageEl,
              text: currentText,
              timeout: newTimeout,
              lastUpdate: Date.now()
            });
            return;
          }
          
          // Vérifier une dernière fois que le texte est vraiment stable
          // Attendre encore 500ms et vérifier à nouveau
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Vérifier que le message n'a pas été supprimé entre-temps
          if (!messageEl || !messageEl.isConnected) {
            pendingAssistantMessages.delete(messageId);
            return;
          }
          
          const finalText = extractMessageText(messageEl);
          if (!finalText || finalText !== currentText) {
            // Le texte a encore changé, ne pas traiter
            return;
          }
          
          // Vérifier qu'on est toujours le timeout actif (pas un autre timeout qui a pris le relais)
          const currentPending = pendingAssistantMessages.get(messageId);
          if (!currentPending || currentPending.timeout !== timeout) {
            // Un autre timeout a été créé, ne pas traiter
            return;
          }
          
          // Le texte est vraiment stable, on peut traiter
          pendingAssistantMessages.delete(messageId);
          
          // Vérifier qu'on ne l'a pas déjà traité
          const currentHash = generateMessageHash(messageEl, finalText);
          if (processedMessages.has(currentHash) || processedMessagesPersistent.has(currentHash)) {
            return; // Déjà traité
          }
          
          // Traiter le message maintenant (UNE SEULE FOIS)
          await processAssistantMessage(messageEl, finalText, currentHash);
        };
        
        const timeout = setTimeout(processMessage, 2000); // Attendre 2 secondes sans changement
        
        // Stocker/mettre à jour le timeout
        pendingAssistantMessages.set(messageId, {
          element: messageEl,
          text: text,
          timeout: timeout,
          lastUpdate: Date.now()
        });
        
        // Ne JAMAIS traiter directement, toujours attendre le debounce
        continue;
      }
      
      // Marquer comme traité (seulement pour les messages utilisateur, les assistant sont gérés par le debounce)
      processedMessages.add(hash);
      await saveProcessedMessage(hash);
      newMessagesCount++;
      
      // Estimer les tokens
      const tokens = estimateTokens(text);
      
      // Log détaillé pour diagnostic (seulement pour les messages utilisateur)
      if (isUser) {
        console.log(`📝 Message utilisateur:`, {
          tokens,
          textLength: text.length,
          words: text.trim().split(/\s+/).length,
          preview: text.substring(0, 50) + '...'
        });
      }
      
      if (isUser) {
        // Pour ChatGPT avec data-message-author-role="user", c'est un vrai message
        // Vérifier seulement qu'on a du contenu significatif (au moins 3 caractères)
        if (text.trim().length < 3) {
          console.log('⏭️ Message utilisateur ignoré (contenu insuffisant):', text.substring(0, 50));
          continue;
        }
        
        // RÉINITIALISER LA SESSION à chaque nouveau prompt utilisateur
        await chrome.runtime.sendMessage({
          type: 'RESET_SESSION_ONLY'
        });
        console.log('🔄 Session réinitialisée (nouveau prompt détecté)');
        
        // Stocker le prompt pour l'associer à la réponse
        await chrome.storage.local.set({ lastPrompt: { text, tokens } });
        console.log(`💾 Prompt stocké: ${tokens} tokens`);
      }
      // Note: Les messages assistant sont traités uniquement via le debounce (processAssistantMessage)
      // Pas de traitement direct ici pour éviter les doublons pendant le streaming
    } catch (error) {
      console.error('Erreur lors de l\'analyse d\'un message:', error);
    }
  }
  
  return newMessagesCount;
}

/**
 * Traiter un message assistant (appelé après debounce)
 */
async function processAssistantMessage(messageEl, text, hash) {
  try {
    // Marquer comme traité
    processedMessages.add(hash);
    await saveProcessedMessage(hash);
    
    // Estimer les tokens
    const tokens = estimateTokens(text);
    
    console.log(`✅ Message assistant (stabilisé après debounce):`, {
      tokens,
      textLength: text.length,
      words: text.trim().split(/\s+/).length,
      preview: text.substring(0, 50) + '...'
    });
    
    // Vérifier d'abord si on a des données interceptées
    const interceptedData = findInterceptedData();
    if (interceptedData && interceptedData.responseTokens) {
      // Utiliser les données interceptées (plus précises)
      console.log('✅ Utilisation des données interceptées:', {
        promptTokens: interceptedData.promptTokens,
        responseTokens: interceptedData.responseTokens,
        model: interceptedData.model
      });
      await processInterceptedData(interceptedData);
      return;
    }
    
    // Sinon, utiliser les données DOM
        const result = await chrome.storage.local.get(['lastPrompt']);
        const promptTokens = result.lastPrompt?.tokens || 0;
        const responseTokens = tokens;
    
    // Calculer les métriques supplémentaires pour améliorer la prédiction
    const wordCount = countWords(text);
    const readingTime = calculateReadingTime(wordCount);
    
    // Estimer les durées (en nanosecondes)
    const estimatedTotalDuration = Math.max(100000000, responseTokens * 1000000); // Au moins 100ms
    const estimatedResponseDuration = estimatedTotalDuration * 0.8; // 80% du temps pour la réponse
    
    console.log(`📊 Utilisation estimation DOM:`, {
      promptTokens,
      responseTokens,
      wordCount,
      readingTime,
      estimatedTotalDuration,
      estimatedResponseDuration,
      model: detectedModel || platform.defaultModel
    });
        
        // Envoyer au background pour calcul
        await chrome.runtime.sendMessage({
          type: 'NEW_EXCHANGE',
          data: {
            platform: platform.name,
        model: detectedModel || platform.defaultModel,
            promptTokens,
            responseTokens,
        totalDuration: estimatedTotalDuration,
        responseDuration: estimatedResponseDuration,
        wordCount: wordCount,
        readingTime: readingTime,
            timestamp: Date.now()
          }
        });
    } catch (error) {
    console.error('Erreur lors du traitement du message assistant:', error);
  }
}

/**
 * Trouver les données interceptées les plus récentes
 */
function findInterceptedData() {
  let latestData = null;
  let latestTimestamp = 0;
  
  for (const [key, data] of interceptedDataCache.entries()) {
    if (data.timestamp > latestTimestamp && data.responseTokens) {
      latestTimestamp = data.timestamp;
      latestData = data;
    }
  }
  
  // Nettoyer le cache (garder seulement les 20 dernières entrées)
  if (interceptedDataCache.size > 20) {
    const entries = Array.from(interceptedDataCache.entries())
      .sort((a, b) => b[1].timestamp - a[1].timestamp)
      .slice(0, 20);
    interceptedDataCache.clear();
    entries.forEach(([key, value]) => interceptedDataCache.set(key, value));
  }
  
  return latestData;
}

/**
 * Vérifier si c'est un message utilisateur
 */
function isUserMessage(element) {
  // Pour ChatGPT avec data-message-author-role, méthode directe
  if (element.hasAttribute('data-message-author-role')) {
    const role = element.getAttribute('data-message-author-role');
    if (role === 'user') {
      // Vérifier aussi qu'on a un vrai message utilisateur (pas juste un élément vide)
      // Chercher spécifiquement la classe user-message-bubble-color ou un contenu significatif
      let hasUserBubble = element.querySelector('.user-message-bubble-color') !== null ||
                            element.classList.contains('user-message-bubble-color');
      if (!hasUserBubble && element instanceof Element && typeof element.closest === 'function') {
        try {
          hasUserBubble = element.closest('.user-message-bubble-color') !== null;
        } catch (error) {
          console.warn('Erreur lors de l\'appel à closest() dans isUserMessage:', error, element);
        }
      }
      
      const text = element.innerText || element.textContent || '';
      const hasContent = text.trim().length >= 5; // Au moins 5 caractères
      
      // Si on a la classe user-message-bubble-color, c'est définitivement un message utilisateur
      if (hasUserBubble) {
        return true;
      }
      
      // Sinon, vérifier qu'on a du contenu ET que ce n'est pas un élément de séparation
      if (hasContent && element.tagName !== 'HR' && !element.hasAttribute('data-start')) {
        return true;
      }
      
      return false;
    }
    return false;
  }
  
  // Vérifier si l'élément ou un parent a la classe user-message-bubble-color
  let hasUserBubble = element.querySelector('.user-message-bubble-color') !== null ||
                        element.classList.contains('user-message-bubble-color');
  if (!hasUserBubble && element instanceof Element && typeof element.closest === 'function') {
    try {
      hasUserBubble = element.closest('.user-message-bubble-color') !== null;
    } catch (error) {
      console.warn('Erreur lors de l\'appel à closest() dans isUserMessage (2):', error, element);
    }
  }
  
  if (hasUserBubble) {
    return true;
  }
  
  const html = element.outerHTML.toLowerCase();
  const classes = element.classList.toString().toLowerCase();
  
  return (
    element.matches(platform.selectors.userMessage) ||
    element.matches('[data-message-author-role="user"]') ||
    element.matches('[data-author="user"]') ||
    html.includes('user') ||
    html.includes('human') ||
    classes.includes('user') ||
    classes.includes('human')
  );
}

/**
 * Vérifier si c'est un message assistant
 */
function isAssistantMessage(element) {
  // Ignorer les éléments <hr> et autres éléments de séparation
  if (element.tagName === 'HR' || element.hasAttribute('data-start') || element.hasAttribute('data-end')) {
    return false;
  }
  
  // Pour ChatGPT avec data-message-author-role, méthode directe
  if (element.hasAttribute('data-message-author-role')) {
    const role = element.getAttribute('data-message-author-role');
    if (role === 'assistant') {
      // Vérifier qu'on a un vrai message assistant (pas juste un élément vide)
      const text = element.innerText || element.textContent || '';
      const hasContent = text.trim().length >= 10; // Au moins 10 caractères pour un message assistant
      
      // Vérifier que ce n'est pas un élément de séparation
      if (hasContent && element.tagName !== 'HR' && !element.hasAttribute('data-start')) {
        return true;
      }
      
      return false;
    }
    return false;
  }
  
  const html = element.outerHTML.toLowerCase();
  const classes = element.classList.toString().toLowerCase();
  
  return (
    element.matches(platform.selectors.assistantMessage) ||
    element.matches('[data-message-author-role="assistant"]') ||
    element.matches('[data-author="assistant"]') ||
    element.matches('[data-author="model"]') ||
    html.includes('assistant') ||
    html.includes('model') ||
    html.includes('claude') ||
    html.includes('gpt') ||
    html.includes('gemini') ||
    classes.includes('assistant') ||
    classes.includes('model') ||
    classes.includes('claude') ||
    classes.includes('gemini')
  );
}

/**
 * Extraire TOUT le texte d'un message, y compris les blocs de code et snippets
 * Version améliorée pour capturer 100% du contenu
 * Pour ChatGPT, utilise directement innerText et innerHTML depuis data-message-author-role
 */
function extractMessageText(element) {
  try {
    // Pour ChatGPT avec data-message-author-role, utiliser la méthode directe
    if (platform && platform.name === 'ChatGPT' && element.hasAttribute('data-message-author-role')) {
      // Utiliser innerText pour le texte brut (sans HTML mais avec tout le contenu)
      // innerText préserve mieux les sauts de ligne et le formatage que textContent
      // Il inclut automatiquement tout le texte des sous-éléments, y compris les <p data-start="..." data-end="...">
      const text = element.innerText || element.textContent || '';
      
      // Si on a besoin du HTML aussi (pour les snippets), on peut l'utiliser
      // Mais pour le comptage de tokens, innerText suffit car il inclut tout le texte visible
      // y compris celui dans les code blocks et snippets
      
      // Nettoyer le texte (supprimer les espaces multiples mais garder les sauts de ligne)
      const cleaned = text
        .replace(/[ \t]+/g, ' ') // Remplacer espaces/tabs multiples par un seul espace
        .replace(/\n{3,}/g, '\n\n') // Limiter les sauts de ligne multiples
        .trim();
      
      if (cleaned.length > 0) {
        return cleaned;
      }
    }
    
    // Si l'élément est un sous-élément d'un message (comme <p data-start="..." data-end="...">)
    // mais n'a pas lui-même data-message-author-role, chercher le conteneur parent
    if (platform && platform.name === 'ChatGPT' && !element.hasAttribute('data-message-author-role')) {
      // Vérifier que element est un Element et que closest est disponible
      if (!(element instanceof Element) || typeof element.closest !== 'function') {
        return text;
      }
      let messageContainer = null;
      try {
        messageContainer = element.closest('[data-message-author-role]');
      } catch (error) {
        console.warn('Erreur lors de l\'appel à closest() pour messageContainer dans extractMessageText:', error, element);
        return text;
      }
      if (messageContainer) {
        // Utiliser innerText du conteneur parent pour capturer tout le contenu
        const text = messageContainer.innerText || messageContainer.textContent || '';
        const cleaned = text
          .replace(/[ \t]+/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        
        if (cleaned.length > 0) {
          return cleaned;
        }
      }
    }
    
    // Pour les autres plateformes ou éléments sans data-message-author-role, utiliser la méthode originale
    // Cloner l'élément pour manipulation sans affecter l'original
    const clone = element.cloneNode(true);
    
    // Supprimer les éléments UI non-textuels (boutons, icônes, etc.)
    const selectorsToRemove = [
      'button',
      '.button',
      '[role="button"]',
      'svg',
      'img',
      'video',
      'audio',
      '.copy-button',
      '.copy-code',
      '[class*="copy"]',
      '[class*="button"]',
      '[aria-label*="copy"]',
      '[aria-label*="Copy"]',
      '.toolbar',
      '.actions',
      '[class*="toolbar"]',
      '[class*="actions"]',
      // Titres de code blocks
      '[class*="code-title"]',
      '[class*="snippet-title"]',
      '[class*="filename"]',
      '[class*="language-label"]',
      '[class*="language-name"]',
      'label',
      'caption'
    ].join(', ');
    
    try {
      const elementsToRemove = clone.querySelectorAll(selectorsToRemove);
      elementsToRemove.forEach(el => el.remove());
      
      // Supprimer aussi les éléments qui ressemblent à des titres de snippets
      const allElements = clone.querySelectorAll('*');
      for (const el of allElements) {
        const text = el.textContent || '';
        const trimmed = text.trim();
        
        // Détecter les patterns de titres de snippets
        if (trimmed.length < 50 && (
          trimmed.includes(' · ') ||
          /^[A-Z][a-z]+\s+\d+/.test(trimmed) ||
          /^[A-Z][a-z]+\s*·\s*[a-z]+/i.test(trimmed) ||
          /^```[a-z]*\s*$/i.test(trimmed)
        )) {
          // Vérifier que ce n'est pas du vrai code
          if (!trimmed.includes('\n') && !trimmed.includes('{') && !trimmed.includes('(') && !trimmed.includes('import')) {
            el.remove();
          }
        }
      }
    } catch (e) {
      // Si les sélecteurs échouent, continuer quand même
    }
    
    // Méthode 1: Extraire tout le texte de manière récursive
    // Cela capture TOUT: texte, code, snippets, etc.
    function extractAllText(node) {
      let text = '';
      
      // Si c'est un nœud texte, ajouter son contenu
      if (node.nodeType === Node.TEXT_NODE) {
        const content = node.textContent.trim();
        if (content) {
          text += content + ' ';
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Pour les éléments de code, préserver les espaces et sauts de ligne
        const tagName = node.tagName.toLowerCase();
        if (tagName === 'pre' || tagName === 'code') {
          // Les blocs de code sont importants, les inclure
          const codeText = node.textContent || '';
          if (codeText.trim()) {
            text += '\n' + codeText + '\n';
          }
        } else {
          // Parcourir récursivement tous les enfants
          for (const child of node.childNodes) {
            text += extractAllText(child);
          }
        }
      }
      
      return text;
    }
    
    // Extraire tout le texte récursivement
    let fullText = extractAllText(clone);
    
    // Nettoyer le texte intelligemment
    // Préserver les blocs de code (qui ont des \n) mais nettoyer le texte normal
    const lines = fullText.split('\n');
    let cleanedLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Si la ligne ressemble à du code (beaucoup d'espaces, caractères spéciaux), la préserver
      const isCodeLine = line.includes('  ') || // Indentation
                        /[{}();=]/.test(line) || // Caractères de code
                        line.trim().startsWith('```') || // Markdown code block
                        line.trim().endsWith('```');
      
      if (isCodeLine) {
        // Préserver la ligne de code telle quelle
        cleanedLines.push(line);
      } else {
        // Nettoyer le texte normal (espaces multiples)
        const cleaned = line.replace(/\s+/g, ' ').trim();
        if (cleaned) {
          cleanedLines.push(cleaned);
        }
      }
    }
    
    // Rejoindre les lignes
    fullText = cleanedLines.join('\n');
    
    // Nettoyer les sauts de ligne multiples (mais garder au moins un saut entre blocs)
    fullText = fullText.replace(/\n{3,}/g, '\n\n').trim();
    
    // Si on a du texte significatif, le retourner
    if (fullText.length > 0) {
      return fullText;
    }
    
    // Méthode 2 (fallback): Utiliser textContent directement sur l'élément
    // Cela capture aussi tout le texte mais peut manquer certains éléments cachés
    const directText = element.textContent || element.innerText || '';
    const cleanedDirect = directText
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleanedDirect.length > 0) {
      return cleanedDirect;
    }
    
    // Méthode 3 (dernier recours): Chercher dans des conteneurs spécifiques
    const contentContainers = [
      platform.selectors.messageText,
      '.markdown',
      '.markdown-body',
      '.message-content',
      '.prose',
      '[class*="markdown"]',
      '[class*="content"]'
    ];
    
    for (const selector of contentContainers) {
      try {
        const containers = element.querySelectorAll(selector);
        let combinedText = '';
        
        for (const container of containers) {
          // Extraire aussi les blocs de code dans chaque conteneur
          const codeBlocks = container.querySelectorAll('pre, code');
          const regularText = container.textContent || '';
          
          // Ajouter le texte régulier
          combinedText += regularText + ' ';
          
          // Ajouter les blocs de code explicitement
          for (const codeBlock of codeBlocks) {
            const codeText = codeBlock.textContent || '';
            if (codeText.trim()) {
              combinedText += '\n' + codeText + '\n';
            }
          }
        }
        
        if (combinedText.trim().length > 0) {
          return combinedText
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .trim();
        }
      } catch (e) {
        // Ignorer les erreurs de sélecteur
      }
    }
    
    return '';
  } catch (error) {
    console.error('Erreur lors de l\'extraction du texte:', error);
    // Dernier recours: textContent brut
    try {
      return (element.textContent || element.innerText || '').trim();
    } catch (e) {
    return '';
    }
  }
}

/**
 * Estimer le nombre de tokens depuis le texte (version améliorée)
 * Utilise une formule plus précise basée sur les recherches OpenAI
 */
/**
 * Compter les mots dans un texte
 */
function countWords(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Calculer le temps de lecture (reading_time) en secondes
 * Basé sur une vitesse de lecture moyenne de 200 mots/minute
 */
function calculateReadingTime(wordCount) {
  if (!wordCount || wordCount <= 0) return 0;
  const wordsPerMinute = 200; // Vitesse de lecture moyenne
  // Convertir en secondes: (mots / 200 mots/min) * 60 sec/min
  return Math.ceil((wordCount / wordsPerMinute) * 60 * 100) / 100; // Arrondi à 2 décimales, en secondes
}

function estimateTokens(text) {
  if (!text) return 0;
  
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  
  // Compter les mots et caractères
  const words = trimmed.split(/\s+/).filter(w => w.length > 0).length;
  const chars = trimmed.length;
  
  // Détecter si c'est du markdown/code
  const hasCodeBlocks = trimmed.includes('```');
  const hasMarkdown = /[#*`{}[\]()]/.test(trimmed);
  const hasIndentation = trimmed.includes('    ') || trimmed.includes('\t');
  const isCodeOrMarkdown = hasCodeBlocks || (hasMarkdown && hasIndentation);
  
  // Compter les blocs de code
  const codeBlocks = (trimmed.match(/```[\s\S]*?```/g) || []);
  const codeLength = codeBlocks.reduce((sum, block) => sum + block.length, 0);
  const textLength = chars - codeLength;
  
  // Pour le code : ~1 token par 2-3 caractères (plus dense)
  // Pour le texte : ~1 token par 3.5-4 caractères
  // Pour le markdown : ~1 token par 3 caractères
  
  let estimatedTokens = 0;
  
  if (codeLength > 0) {
    // Code blocks: plus dense en tokens
    estimatedTokens += codeLength / 2.5; // ~1 token par 2.5 caractères pour le code
  }
  
  if (textLength > 0) {
    // Texte normal: estimation basée sur les mots et caractères
    const wordsInText = textLength > 0 ? Math.max(1, textLength / 5) : 0; // Estimation approximative
    const tokensFromWords = wordsInText * (isCodeOrMarkdown ? 1.2 : 0.9); // Plus de tokens pour markdown
    const tokensFromChars = textLength / (isCodeOrMarkdown ? 3.2 : 3.8); // Plus dense pour markdown
    
    // Moyenne pondérée
    const weight = textLength > 500 ? 0.6 : 0.5;
    estimatedTokens += (tokensFromWords * weight + tokensFromChars * (1 - weight));
  }
  
  // Si on a beaucoup de markdown (titres, listes, etc.), ajouter un bonus
  if (hasMarkdown && !hasCodeBlocks) {
    const markdownElements = (trimmed.match(/#{1,6}\s/g) || []).length + // Titres
                             (trimmed.match(/^\s*[-*+]\s/gm) || []).length + // Listes
                             (trimmed.match(/\*\*.*?\*\*/g) || []).length; // Gras
    estimatedTokens += markdownElements * 0.5; // Bonus pour chaque élément markdown
  }
  
  // Arrondir et s'assurer d'avoir au moins 1 token
  const finalEstimate = Math.ceil(estimatedTokens);
  
  // Pour les très longs textes, s'assurer qu'on n'a pas sous-estimé
  if (chars > 2000 && finalEstimate < chars / 5) {
    // Si l'estimation semble trop faible, utiliser une estimation plus conservatrice
    const conservativeEstimate = Math.ceil(chars / 3.5);
    return Math.max(finalEstimate, conservativeEstimate);
  }
  
  return Math.max(1, finalEstimate);
}

/**
 * Nettoyer et réinitialiser la session lors de la fermeture/actualisation
 * Note: beforeunload peut ne pas être fiable pour les appels async,
 * donc la réinitialisation se fait aussi dans init() au chargement
 */
window.addEventListener('beforeunload', () => {
  // Marquer comme inactif (synchrone)
  chrome.storage.local.set({ isActive: false });
  
  // Nettoyer les caches en mémoire
  interceptedDataCache.clear();
  processedMessages.clear(); // Ne pas vider processedMessagesPersistent (persistant)
  pendingAssistantMessages.clear();
  
  // Note: La réinitialisation de la session se fait dans init() au prochain chargement
  // pour être sûr que ça fonctionne
});

/**
 * Nettoyer les anciennes conversations (garde seulement les 10 dernières)
 */
async function cleanupOldConversations() {
  try {
    const result = await chrome.storage.local.get(['processedMessagesMap']);
    const storedMap = result.processedMessagesMap || {};
    
    const conversations = Object.keys(storedMap);
    if (conversations.length > 10) {
      // Garder seulement les 10 conversations les plus récentes
      // (basé sur le nombre de messages - plus récentes = plus de messages)
      const sorted = conversations.sort((a, b) => {
        return (storedMap[b]?.length || 0) - (storedMap[a]?.length || 0);
      });
      
      const toKeep = sorted.slice(0, 10);
      const cleaned = {};
      toKeep.forEach(key => {
        cleaned[key] = storedMap[key];
      });
      
      await chrome.storage.local.set({ processedMessagesMap: cleaned });
      console.log('✓ Nettoyage: conservé 10 conversations les plus récentes');
    }
  } catch (error) {
    console.error('Erreur nettoyage conversations:', error);
  }
}

// Nettoyer les anciennes conversations toutes les 5 minutes
setInterval(cleanupOldConversations, 5 * 60 * 1000);

/**
 * Détecter les changements d'URL (nouvelle conversation)
 */
let lastUrl = window.location.href;
async function checkUrlChange() {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    console.log('🔄 Changement d\'URL détecté, réinitialisation de la session...');
    lastUrl = currentUrl;
    lastMessageCount = 0;
    processedMessages.clear();
    pendingAssistantMessages.clear();
    interceptedDataCache.clear();
    conversationId = generateConversationId();
    
    // Réinitialiser la session actuelle (mais pas le total cumulé)
    await chrome.runtime.sendMessage({
      type: 'RESET_SESSION_ONLY'
    });
    
    await loadProcessedMessages();
  }
}

// Vérifier les changements d'URL toutes les secondes
setInterval(checkUrlChange, 1000);

// Écouter aussi les événements de navigation (pour les SPAs)
let lastPathname = window.location.pathname;
const urlObserver = new MutationObserver(() => {
  const currentPathname = window.location.pathname;
  if (currentPathname !== lastPathname) {
    checkUrlChange();
    lastPathname = currentPathname;
  }
});

// Configurer le listener de messages IMMÉDIATEMENT (même si le script n'est pas encore initialisé)
// Cela permet au popup de communiquer même si le script est injecté manuellement
setupMessageListener();

// Initialiser
if (platform) {
  // Attendre que la page soit chargée
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      // Observer les changements dans le body (pour détecter les changements d'URL dans les SPAs)
      urlObserver.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    init();
    urlObserver.observe(document.body, { childList: true, subtree: true });
  }
} else {
  // Même si la plateforme n'est pas supportée, le listener est déjà configuré
  // pour pouvoir répondre avec une erreur appropriée
}
