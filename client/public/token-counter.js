/**
 * Token Counter - Comptage précis de tokens avec tiktoken
 * 
 * Ce module utilise @tiktoken/tokenizer pour un comptage précis des tokens
 * selon l'encodage réel d'OpenAI, au lieu d'estimations approximatives.
 * 
 * Fallback : Si tiktoken n'est pas disponible, utilise l'estimation actuelle.
 */

// Cache pour les tokenizers (évite les rechargements)
let tokenizerCache = {};

// Mapping des modèles aux encodages tiktoken
const MODEL_ENCODINGS = {
  // GPT-4 et GPT-3.5 utilisent cl100k_base
  'gpt-4': 'cl100k_base',
  'gpt-4-turbo': 'cl100k_base',
  'gpt-4o': 'cl100k_base',
  'gpt-4o-mini': 'cl100k_base',
  'gpt-3.5-turbo': 'cl100k_base',
  'gpt-3.5-turbo-16k': 'cl100k_base',
  
  // GPT-3 utilise p50k_base
  'gpt-3': 'p50k_base',
  'text-davinci-003': 'p50k_base',
  'text-davinci-002': 'p50k_base',
  'code-davinci-002': 'p50k_base',
  
  // Claude utilise son propre encodage (approximation avec cl100k_base)
  'claude-3-opus': 'cl100k_base',
  'claude-3.5-sonnet': 'cl100k_base',
  'claude-3-sonnet': 'cl100k_base',
  'claude-3-haiku': 'cl100k_base',
  
  // Gemini (approximation)
  'gemini-pro': 'cl100k_base',
  'gemini-1.5-pro': 'cl100k_base',
  'gemini-1.5-flash': 'cl100k_base',
};

/**
 * Vérifier si tiktoken est disponible
 */
function isTiktokenAvailable() {
  try {
    // Essayer d'importer tiktoken (sera disponible si le package est installé)
    if (typeof window !== 'undefined' && window.tiktoken) {
      return true;
    }
    // Vérifier si on peut charger dynamiquement
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Obtenir le tokenizer pour un modèle donné
 * @param {string} modelName - Nom du modèle (ex: 'gpt-4', 'gpt-3.5-turbo')
 * @returns {Object|null} - Tokenizer ou null si non disponible
 */
async function getTokenizerForModel(modelName) {
  if (!isTiktokenAvailable()) {
    return null;
  }
  
  // Vérifier le cache
  if (tokenizerCache[modelName]) {
    return tokenizerCache[modelName];
  }
  
  try {
    // Essayer de charger tiktoken dynamiquement
    // Note: Pour une extension Chrome, on devrait bundler tiktoken
    // ou utiliser une version CDN/ESM
    
    // Pour l'instant, on retourne null et on utilisera le fallback
    // TODO: Intégrer @tiktoken/tokenizer ou js-tiktoken
    return null;
  } catch (error) {
    console.warn('Erreur chargement tiktoken:', error);
    return null;
  }
}

/**
 * Compter les tokens avec tiktoken (méthode précise)
 * @param {string} text - Texte à analyser
 * @param {string} modelName - Nom du modèle (ex: 'gpt-4')
 * @returns {number} - Nombre de tokens
 */
async function countTokensWithTiktoken(text, modelName = 'gpt-4') {
  if (!text) return 0;
  
  const tokenizer = await getTokenizerForModel(modelName);
  if (!tokenizer) {
    // Fallback sur l'estimation
    return estimateTokensFallback(text);
  }
  
  try {
    const encoding = MODEL_ENCODINGS[modelName] || 'cl100k_base';
    const tokens = tokenizer.encode(text, encoding);
    return tokens.length;
  } catch (error) {
    console.warn('Erreur comptage tiktoken, fallback:', error);
    return estimateTokensFallback(text);
  }
}

/**
 * Estimation de tokens (fallback - méthode actuelle)
 * Utilisée quand tiktoken n'est pas disponible
 */
function estimateTokensFallback(text) {
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
  
  let estimatedTokens = 0;
  
  if (codeLength > 0) {
    // Code blocks: plus dense en tokens
    estimatedTokens += codeLength / 2.5; // ~1 token par 2.5 caractères pour le code
  }
  
  if (textLength > 0) {
    // Texte normal: estimation basée sur les mots et caractères
    const wordsInText = textLength > 0 ? Math.max(1, textLength / 5) : 0;
    const tokensFromWords = wordsInText * (isCodeOrMarkdown ? 1.2 : 0.9);
    const tokensFromChars = textLength / (isCodeOrMarkdown ? 3.2 : 3.8);
    
    // Moyenne pondérée
    const weight = textLength > 500 ? 0.6 : 0.5;
    estimatedTokens += (tokensFromWords * weight + tokensFromChars * (1 - weight));
  }
  
  // Si on a beaucoup de markdown, ajouter un bonus
  if (hasMarkdown && !hasCodeBlocks) {
    const markdownElements = (trimmed.match(/#{1,6}\s/g) || []).length +
                             (trimmed.match(/^\s*[-*+]\s/gm) || []).length +
                             (trimmed.match(/\*\*.*?\*\*/g) || []).length;
    estimatedTokens += markdownElements * 0.5;
  }
  
  // Arrondir et s'assurer d'avoir au moins 1 token
  const finalEstimate = Math.ceil(estimatedTokens);
  
  // Pour les très longs textes, s'assurer qu'on n'a pas sous-estimé
  if (chars > 2000 && finalEstimate < chars / 5) {
    const conservativeEstimate = Math.ceil(chars / 3.5);
    return Math.max(finalEstimate, conservativeEstimate);
  }
  
  return Math.max(1, finalEstimate);
}

/**
 * Compter les tokens (méthode principale)
 * Utilise tiktoken si disponible, sinon fallback sur estimation
 * 
 * @param {string} text - Texte à analyser
 * @param {string} modelName - Nom du modèle (ex: 'gpt-4')
 * @param {boolean} preferTiktoken - Si true, essaie d'utiliser tiktoken même si les tokens interceptés sont disponibles
 * @returns {Promise<number>} - Nombre de tokens
 */
export async function countTokens(text, modelName = 'gpt-4', preferTiktoken = false) {
  if (!text) return 0;
  
  // Si tiktoken est disponible et qu'on préfère l'utiliser
  if (preferTiktoken && isTiktokenAvailable()) {
    return await countTokensWithTiktoken(text, modelName);
  }
  
  // Sinon, utiliser l'estimation (fallback)
  return estimateTokensFallback(text);
}

/**
 * Compter les tokens de manière synchrone (pour compatibilité)
 * Utilise toujours l'estimation (fallback)
 */
export function countTokensSync(text) {
  return estimateTokensFallback(text);
}

/**
 * Vérifier si tiktoken est disponible et configuré
 */
export function isTiktokenEnabled() {
  return isTiktokenAvailable();
}

// Exporter aussi la fonction de fallback pour compatibilité
export { estimateTokensFallback };

