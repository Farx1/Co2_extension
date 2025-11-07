/**
 * Track Sustainability - Network Interceptor
 * Intercepte les requêtes réseau pour récupérer les vraies données (modèle, tokens)
 * 
 * Ce script est injecté dans la page pour intercepter fetch et XMLHttpRequest
 */

(function() {
  'use strict';
  
  console.log('🌱 Network Interceptor initialisé');
  
  // Stockage pour les données interceptées
  const interceptedData = {
    lastRequest: null,
    lastResponse: null,
    conversationHistory: [],
    requestTimestamps: new Map() // Pour calculer les durées
  };
  
  /**
   * Détecter la plateforme
   */
  function getPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('chatgpt.com')) return 'chatgpt';
    if (hostname.includes('claude.ai')) return 'claude';
    if (hostname.includes('gemini.google.com')) return 'gemini';
    return null;
  }
  
  /**
   * Calculer le temps de lecture (reading_time) en secondes
   * Basé sur une vitesse de lecture moyenne de 200 mots/minute = 3.33 mots/seconde
   */
  function calculateReadingTime(wordCount) {
    if (!wordCount || wordCount <= 0) return 0;
    const wordsPerMinute = 200; // Vitesse de lecture moyenne
    // Convertir en secondes: (mots / 200 mots/min) * 60 sec/min
    return Math.ceil((wordCount / wordsPerMinute) * 60 * 100) / 100; // Arrondi à 2 décimales, en secondes
  }
  
  /**
   * Compter les mots dans un texte
   */
  function countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }
  
  /**
   * Extraire les données d'une requête ChatGPT
   */
  function extractChatGPTData(url, requestBody, responseBody) {
    try {
      let model = null;
      let promptTokens = null;
      let responseTokens = null;
      let promptText = null;
      let responseText = null;
      let totalDuration = null;
      let responseDuration = null;
      let requestStartTime = null;
      
      // Extraire depuis la requête
      if (requestBody) {
        const request = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
        
        if (request.model) {
          model = request.model;
        }
        
        if (request.messages && request.messages.length > 0) {
          // Prendre le dernier message utilisateur
          const userMessages = request.messages.filter(m => m.role === 'user');
          if (userMessages.length > 0) {
            promptText = userMessages[userMessages.length - 1].content;
          }
        }
      }
      
      // Extraire depuis la réponse (streaming ou complète)
      if (responseBody) {
        // Si c'est une réponse streaming, parser ligne par ligne
        if (typeof responseBody === 'string' && responseBody.includes('data: ')) {
          const lines = responseBody.split('\n');
          let lastChunk = null;
          let hasUsage = false;
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.substring(6);
                if (jsonStr === '[DONE]') continue;
                
                const data = JSON.parse(jsonStr);
                
                // Format 1: data.message.content (ChatGPT nouveau format)
                if (data.message) {
                  lastChunk = data;
                  if (data.message.content && typeof data.message.content === 'string') {
                    responseText = (responseText || '') + data.message.content;
                  } else if (data.message.content && Array.isArray(data.message.content)) {
                    // Contenu peut être un array de parts
                    for (const part of data.message.content) {
                      if (part.type === 'text' && part.text) {
                        responseText = (responseText || '') + part.text;
                      }
                    }
                  }
                  if (data.message.metadata && data.message.metadata.model_slug) {
                    model = data.message.metadata.model_slug;
                  }
                  if (data.message.metadata && data.message.metadata.model) {
                    model = data.message.metadata.model;
                  }
                }
                
                // Format 2: data.choices (format OpenAI standard)
                if (data.choices && data.choices[0]) {
                  const choice = data.choices[0];
                  if (choice.delta && choice.delta.content) {
                    responseText = (responseText || '') + choice.delta.content;
                  }
                  if (choice.message && choice.message.content) {
                    responseText = (responseText || '') + choice.message.content;
                  }
                }
                
                // Tokens (format 1: usage direct)
                if (data.usage) {
                  promptTokens = data.usage.prompt_tokens || promptTokens;
                  responseTokens = data.usage.completion_tokens || responseTokens;
                  hasUsage = true;
                }
                
                // Tokens (format 2: dans message.metadata)
                if (data.message && data.message.metadata) {
                  if (data.message.metadata.usage) {
                    promptTokens = data.message.metadata.usage.prompt_tokens || promptTokens;
                    responseTokens = data.message.metadata.usage.completion_tokens || responseTokens;
                    hasUsage = true;
                  }
                }
                
                // Modèle (format 3: dans message.author)
                if (data.message && data.message.author) {
                  if (data.message.author.name) {
                    model = data.message.author.name;
                  }
                }
              } catch (e) {
                // Ignorer les erreurs de parsing
              }
            }
          }
          
          // Si pas de tokens dans le streaming, essayer de les estimer depuis le texte
          if (!hasUsage && responseText) {
            console.log('⚠️ Pas de tokens dans la réponse streaming, estimation nécessaire');
          }
        } else {
          // Réponse complète
          try {
            const response = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
            
            // Modèle
            if (response.model) model = response.model;
            
            // Tokens
            if (response.usage) {
              promptTokens = response.usage.prompt_tokens;
              responseTokens = response.usage.completion_tokens;
            }
            
            // Contenu
            if (response.choices && response.choices[0] && response.choices[0].message) {
              responseText = response.choices[0].message.content;
            }
            
            // Format alternatif: message direct
            if (response.message && response.message.content) {
              responseText = response.message.content;
            }
          } catch (e) {
            // Pas un JSON valide
          }
        }
      }
      
      // Calculer les durées si disponibles
      const requestId = url + (requestBody ? JSON.stringify(requestBody).substring(0, 50) : '');
      if (interceptedData.requestTimestamps.has(requestId)) {
        requestStartTime = interceptedData.requestTimestamps.get(requestId);
        const durationMs = Date.now() - requestStartTime;
        totalDuration = durationMs * 1000000; // Convertir en nanosecondes (ms * 1,000,000)
        interceptedData.requestTimestamps.delete(requestId);
      }
      
      // Si la réponse contient des métadonnées de durée
      if (responseBody && typeof responseBody === 'string') {
        try {
          // Chercher dans les chunks streaming
          const lines = responseBody.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                if (data.message && data.message.metadata) {
                  if (data.message.metadata.duration) {
                    totalDuration = data.message.metadata.duration;
                  }
                  if (data.message.metadata.response_duration) {
                    // S'assurer que response_duration est en nanosecondes
                    let duration = data.message.metadata.response_duration;
                    // Si la durée est en millisecondes (< 1e6), convertir en nanosecondes
                    if (typeof duration === 'number' && duration < 1000000) {
                      responseDuration = duration * 1000000;
                    } else {
                      responseDuration = duration;
                    }
                  }
                }
              } catch (e) {
                // Ignorer
              }
            }
          }
        } catch (e) {
          // Ignorer
        }
      }
      
      // Calculer word_count et reading_time
      const wordCount = countWords(responseText || '');
      const readingTime = calculateReadingTime(wordCount);
      
      return {
        platform: 'ChatGPT',
        model,
        promptTokens,
        responseTokens,
        promptText,
        responseText,
        totalDuration,
        responseDuration,
        wordCount,
        readingTime,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Erreur extraction ChatGPT:', error);
      return null;
    }
  }
  
  /**
   * Extraire les données d'une requête Claude
   */
  function extractClaudeData(url, requestBody, responseBody) {
    try {
      let model = null;
      let promptTokens = null;
      let responseTokens = null;
      let promptText = null;
      let responseText = null;
      
      // Extraire depuis la requête
      if (requestBody) {
        const request = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
        
        if (request.model) {
          model = request.model;
        }
        
        if (request.input) {
          promptText = typeof request.input === 'string' ? request.input : request.input.content;
        }
      }
      
      // Extraire depuis la réponse
      if (responseBody) {
        try {
          const response = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
          
          if (response.model) model = response.model;
          if (response.usage) {
            promptTokens = response.usage.input_tokens;
            responseTokens = response.usage.output_tokens;
          }
          if (response.content && response.content[0]) {
            responseText = response.content[0].text;
          }
        } catch (e) {
          // Réponse streaming ou autre format
          if (typeof responseBody === 'string' && responseBody.includes('event: ')) {
            // Format SSE streaming
            const lines = responseBody.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  if (data.content_block && data.content_block.text) {
                    responseText = (responseText || '') + data.content_block.text;
                  }
                  if (data.usage) {
                    promptTokens = data.usage.input_tokens;
                    responseTokens = data.usage.output_tokens;
                  }
                } catch (e) {
                  // Ignorer
                }
              }
            }
          }
        }
      }
      
      // Calculer word_count et reading_time
      const wordCount = countWords(responseText || '');
      const readingTime = calculateReadingTime(wordCount);
      
      // Calculer les durées
      const requestId = url + (requestBody ? JSON.stringify(requestBody).substring(0, 50) : '');
      let totalDuration = null;
      let responseDuration = null;
      if (interceptedData.requestTimestamps.has(requestId)) {
        const requestStartTime = interceptedData.requestTimestamps.get(requestId);
        const durationMs = Date.now() - requestStartTime;
        totalDuration = durationMs * 1000000; // Convertir en nanosecondes (ms * 1,000,000)
        interceptedData.requestTimestamps.delete(requestId);
      }
      
      return {
        platform: 'Claude',
        model,
        promptTokens,
        responseTokens,
        promptText,
        responseText,
        totalDuration,
        responseDuration,
        wordCount,
        readingTime,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Erreur extraction Claude:', error);
      return null;
    }
  }
  
  /**
   * Extraire les données d'une requête Gemini
   */
  function extractGeminiData(url, requestBody, responseBody) {
    try {
      let model = null;
      let promptTokens = null;
      let responseTokens = null;
      let promptText = null;
      let responseText = null;
      
      // Extraire le modèle depuis l'URL
      const modelMatch = url.match(/models\/([^:]+)/);
      if (modelMatch) {
        model = modelMatch[1];
      }
      
      // Extraire depuis la requête
      if (requestBody) {
        const request = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
        
        if (request.contents && request.contents.length > 0) {
          const lastContent = request.contents[request.contents.length - 1];
          if (lastContent.parts && lastContent.parts[0]) {
            promptText = lastContent.parts[0].text;
          }
        }
      }
      
      // Extraire depuis la réponse
      if (responseBody) {
        try {
          const response = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
          
          if (response.model) model = response.model;
          if (response.usageMetadata) {
            promptTokens = response.usageMetadata.promptTokenCount;
            responseTokens = response.usageMetadata.candidatesTokenCount;
          }
          if (response.candidates && response.candidates[0] && response.candidates[0].content) {
            if (response.candidates[0].content.parts && response.candidates[0].content.parts[0]) {
              responseText = response.candidates[0].content.parts[0].text;
            }
          }
        } catch (e) {
          // Pas un JSON valide
        }
      }
      
      // Calculer word_count et reading_time
      const wordCount = countWords(responseText || '');
      const readingTime = calculateReadingTime(wordCount);
      
      // Calculer les durées
      const requestId = url + (requestBody ? JSON.stringify(requestBody).substring(0, 50) : '');
      let totalDuration = null;
      let responseDuration = null;
      if (interceptedData.requestTimestamps.has(requestId)) {
        const requestStartTime = interceptedData.requestTimestamps.get(requestId);
        const durationMs = Date.now() - requestStartTime;
        totalDuration = durationMs * 1000000; // Convertir en nanosecondes (ms * 1,000,000)
        interceptedData.requestTimestamps.delete(requestId);
      }
      
      return {
        platform: 'Gemini',
        model,
        promptTokens,
        responseTokens,
        promptText,
        responseText,
        totalDuration,
        responseDuration,
        wordCount,
        readingTime,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Erreur extraction Gemini:', error);
      return null;
    }
  }
  
  /**
   * Intercepter fetch
   */
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    // Extraire l'URL de manière sécurisée
    let url = args[0];
    let options = args[1] || {};
    
    // Si url est un Request object, extraire l'URL et les options
    if (url instanceof Request) {
      const requestObj = url;
      url = requestObj.url;
      // Si options n'est pas fourni explicitement, utiliser les options du Request
      if (!args[1]) {
        options = {
          method: requestObj.method || 'GET',
          headers: requestObj.headers,
          body: requestObj.body,
          mode: requestObj.mode,
          credentials: requestObj.credentials,
          cache: requestObj.cache,
          redirect: requestObj.redirect,
          referrer: requestObj.referrer,
          integrity: requestObj.integrity
        };
      }
    }
    
    // Vérifier que url est une string avant d'appeler includes()
    if (typeof url !== 'string' || !url) {
      // Si ce n'est pas une string valide, passer directement à l'original fetch
      return originalFetch.apply(this, args);
    }
    
    // Intercepter seulement les URLs pertinentes
    const platform = getPlatform();
    if (!platform) {
      return originalFetch.apply(this, args);
    }
    
    // URLs pertinentes pour ChatGPT (exclure /resume et autres endpoints non-pertinents)
    const isRelevant = 
      (url.includes('/backend-api/conversation') && !url.includes('/resume') && !url.includes('/history')) ||
      (url.includes('/backend-api/f/conversation') && !url.includes('/resume')) ||
      url.includes('/backend-api/chat') ||
      url.includes('/api/conversation') ||
      url.includes('/api/chat') ||
      url.includes('anthropic.com') ||
      url.includes('generativelanguage.googleapis.com');
    
    if (!isRelevant) {
      return originalFetch.apply(this, args);
    }
    
    console.log('🔍 Interception fetch:', url);
    
    // Capturer le body de la requête
    let requestBody = null;
    if (options.body) {
      requestBody = options.body;
      // Si c'est une string, essayer de la parser
      if (typeof requestBody === 'string') {
        try {
          requestBody = JSON.parse(requestBody);
        } catch (e) {
          // Garder la string originale
        }
      }
    }
    
    // Exécuter la requête
    const response = await originalFetch.apply(this, args);
    
    // Cloner la réponse pour pouvoir lire le body sans affecter la réponse originale
    const clonedResponse = response.clone();
    
    // Lire le body de manière asynchrone
    clonedResponse.text().then(responseText => {
      let extractedData = null;
      
      if (platform === 'chatgpt') {
        extractedData = extractChatGPTData(url, requestBody, responseText);
      } else if (platform === 'claude') {
        extractedData = extractClaudeData(url, requestBody, responseText);
      } else if (platform === 'gemini') {
        extractedData = extractGeminiData(url, requestBody, responseText);
      }
      
      if (extractedData) {
        // Log même si pas complet pour diagnostic
        if (extractedData.model || extractedData.promptTokens || extractedData.responseTokens || extractedData.responseText) {
          console.log('✅ Données interceptées:', {
            model: extractedData.model || 'non détecté',
            promptTokens: extractedData.promptTokens || 'non détecté',
            responseTokens: extractedData.responseTokens || 'non détecté',
            responseLength: extractedData.responseText ? extractedData.responseText.length : 0,
            url: url.substring(0, 100)
          });
        }
        
        // Stocker seulement si on a des données utiles (tokens ou modèle)
        if (extractedData.model || extractedData.promptTokens || extractedData.responseTokens) {
          // Stocker dans localStorage pour que content.js puisse y accéder
          const key = `ts_intercepted_${Date.now()}`;
          localStorage.setItem(key, JSON.stringify(extractedData));
          
          // Nettoyer les anciennes entrées (garder seulement les 10 dernières)
          const keys = Object.keys(localStorage).filter(k => k.startsWith('ts_intercepted_'));
          if (keys.length > 10) {
            keys.sort().slice(0, keys.length - 10).forEach(k => localStorage.removeItem(k));
          }
          
          // Émettre un événement personnalisé
          window.dispatchEvent(new CustomEvent('ts_intercepted', {
            detail: extractedData
          }));
        } else {
          console.log('⚠️ Données interceptées mais tokens/modèle manquants:', {
            url: url.substring(0, 100),
            hasResponseText: !!extractedData.responseText,
            responseLength: extractedData.responseText ? extractedData.responseText.length : 0
          });
        }
      }
    }).catch(err => {
      console.error('Erreur lecture réponse:', err);
    });
    
    return response;
  };
  
  /**
   * Intercepter XMLHttpRequest
   */
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    // Vérifier que url est une string
    if (typeof url === 'string') {
      this._ts_url = url;
    } else {
      this._ts_url = null;
    }
    this._ts_method = method;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const url = this._ts_url;
    const method = this._ts_method;
    const platform = getPlatform();
    
    // Vérifier que url est une string valide avant d'appeler includes()
    if (!url || typeof url !== 'string') {
      return originalXHRSend.apply(this, [body]);
    }
    
    // URLs pertinentes pour ChatGPT (exclure /resume et autres endpoints non-pertinents)
    const isXHRRelevant = 
      (url.includes('/backend-api/conversation') && !url.includes('/resume') && !url.includes('/history')) ||
      (url.includes('/backend-api/f/conversation') && !url.includes('/resume')) ||
      url.includes('/backend-api/chat') ||
      url.includes('/api/conversation') ||
      url.includes('/api/chat') ||
      url.includes('anthropic.com') ||
      url.includes('generativelanguage.googleapis.com');
    
    if (platform && isXHRRelevant) {
      console.log('🔍 Interception XHR:', url);
      
      // Intercepter la réponse
      this.addEventListener('readystatechange', function() {
        if (this.readyState === 4 && this.status >= 200 && this.status < 300) {
          try {
            const responseText = this.responseText;
            let extractedData = null;
            
            if (platform === 'chatgpt') {
              extractedData = extractChatGPTData(url, body, responseText);
            } else if (platform === 'claude') {
              extractedData = extractClaudeData(url, body, responseText);
            } else if (platform === 'gemini') {
              extractedData = extractGeminiData(url, body, responseText);
            }
            
            if (extractedData) {
              // Log même si pas complet pour diagnostic
              if (extractedData.model || extractedData.promptTokens || extractedData.responseTokens || extractedData.responseText) {
                console.log('✅ Données interceptées (XHR):', {
                  model: extractedData.model || 'non détecté',
                  promptTokens: extractedData.promptTokens || 'non détecté',
                  responseTokens: extractedData.responseTokens || 'non détecté',
                  responseLength: extractedData.responseText ? extractedData.responseText.length : 0,
                  url: url.substring(0, 100)
                });
              }
              
              // Stocker seulement si on a des données utiles
              if (extractedData.model || extractedData.promptTokens || extractedData.responseTokens) {
                const key = `ts_intercepted_${Date.now()}`;
                localStorage.setItem(key, JSON.stringify(extractedData));
                
                window.dispatchEvent(new CustomEvent('ts_intercepted', {
                  detail: extractedData
                }));
              } else {
                console.log('⚠️ Données interceptées (XHR) mais tokens/modèle manquants');
              }
            }
          } catch (error) {
            console.error('Erreur interception XHR:', error);
          }
        }
      });
    }
    
    return originalXHRSend.apply(this, [body]);
  };
  
  console.log('✓ Network Interceptor configuré');
})();

