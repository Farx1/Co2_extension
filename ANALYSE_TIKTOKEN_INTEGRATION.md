# 🔍 Analyse : Intégration de Tiktoken pour un Comptage de Tokens Précis

## 📋 Contexte

Le projet **chatgpt-token-cost-analysis** (levysoft) utilise **tiktoken** (la librairie officielle d'OpenAI) pour calculer précisément le nombre de tokens, au lieu d'estimations approximatives.

## 🎯 Avantages Potentiels

### 1. **Précision du Comptage de Tokens**
- ✅ **Actuellement** : Estimation basée sur `chars/4`, `mots*0.75`, etc. (imprécise)
- ✅ **Avec tiktoken** : Comptage exact selon l'encodage réel d'OpenAI (cl100k_base pour GPT-4, p50k_base pour GPT-3.5)
- ✅ **Impact** : Calculs CO2 et énergie beaucoup plus précis

### 2. **Séparation Prompt/Réponse**
- Le projet parse les exports JSON de ChatGPT qui ont une structure claire :
  ```json
  {
    "messages": [
      {"role": "user", "content": "..."},
      {"role": "assistant", "content": "..."}
    ]
  }
  ```
- Notre extension utilise déjà `data-message-author-role` pour ChatGPT, ce qui est similaire

### 3. **Support Multi-Modèles**
- Tiktoken supporte différents encodages selon le modèle :
  - `cl100k_base` : GPT-4, GPT-3.5-turbo
  - `p50k_base` : GPT-3, Codex
  - `r50k_base` : Davinci, Curie, etc.

## 🔧 Options d'Intégration

### Option 1 : **js-tiktoken** (Recommandé)
- 📦 Package : `js-tiktoken` ou `@tiktoken/tokenizer`
- ✅ Avantages :
  - Implémentation JavaScript native
  - Compatible navigateur (peut être bundlé)
  - Support des encodages OpenAI
- ⚠️ Inconvénients :
  - Taille du bundle (~200-500 KB)
  - Nécessite un build step

### Option 2 : **API Backend** (Alternative)
- Créer un endpoint sur le serveur Express qui utilise tiktoken Python
- ✅ Avantages :
  - Pas d'augmentation de taille du bundle
  - Utilise la librairie officielle Python
- ⚠️ Inconvénients :
  - Nécessite une connexion réseau
  - Latence supplémentaire
  - Nécessite que le serveur soit en ligne

### Option 3 : **Hybride** (Meilleur compromis)
- Utiliser tiktoken JS pour les calculs en temps réel
- Garder l'estimation actuelle comme fallback si tiktoken n'est pas disponible
- ✅ Avantages :
  - Précision maximale quand disponible
  - Fallback robuste
  - Pas de dépendance réseau

## 📊 Comparaison Estimation vs Tiktoken

### Exemple de texte :
```
"Bonjour, comment allez-vous ? Je voudrais créer une fonction Python qui calcule le nombre de tokens."
```

**Estimation actuelle** :
- Chars: 95
- Estimation: `95 / 4 = 24 tokens` (approximatif)

**Tiktoken (cl100k_base)** :
- Tokens réels: ~28 tokens (plus précis)

**Différence** : Pour des conversations longues, l'écart peut être significatif (10-20% d'erreur).

## 🚀 Plan d'Implémentation Recommandé

### Phase 1 : Intégration de js-tiktoken
1. Installer `@tiktoken/tokenizer` ou `js-tiktoken`
2. Créer un module `token-counter.js` qui :
   - Détecte le modèle utilisé
   - Charge l'encodage approprié
   - Compte les tokens précisément
3. Remplacer `estimateTokens()` par `countTokensWithTiktoken()` dans `content.js`

### Phase 2 : Fallback Intelligent
- Si tiktoken n'est pas disponible → utiliser l'estimation actuelle
- Si les données interceptées contiennent les vrais tokens → utiliser ceux-ci (priorité maximale)

### Phase 3 : Optimisation
- Lazy loading de tiktoken (charger seulement quand nécessaire)
- Cache des encodages pour éviter les rechargements

## 📝 Code Exemple

```javascript
// token-counter.js
import { encoding_for_model } from '@tiktoken/tokenizer';

let tokenizerCache = {};

function getTokenizerForModel(modelName) {
  if (tokenizerCache[modelName]) {
    return tokenizerCache[modelName];
  }
  
  // Mapper les noms de modèles aux encodages
  const modelToEncoding = {
    'gpt-4': 'cl100k_base',
    'gpt-4-turbo': 'cl100k_base',
    'gpt-3.5-turbo': 'cl100k_base',
    'gpt-3': 'p50k_base',
  };
  
  const encodingName = modelToEncoding[modelName] || 'cl100k_base';
  const tokenizer = encoding_for_model(modelName);
  tokenizerCache[modelName] = tokenizer;
  
  return tokenizer;
}

export function countTokens(text, modelName = 'gpt-4') {
  if (!text) return 0;
  
  try {
    const tokenizer = getTokenizerForModel(modelName);
    const tokens = tokenizer.encode(text);
    return tokens.length;
  } catch (error) {
    console.warn('Erreur tiktoken, fallback sur estimation:', error);
    // Fallback sur l'estimation actuelle
    return estimateTokensFallback(text);
  }
}
```

## ⚖️ Décision

**Recommandation** : **Option 3 (Hybride)** avec intégration progressive :
1. Commencer par intégrer js-tiktoken pour les cas où on a le modèle détecté
2. Garder l'estimation actuelle comme fallback
3. Prioriser toujours les tokens interceptés (les plus précis)

## 🔗 Références

- [chatgpt-token-cost-analysis](https://github.com/levysoft/chatgpt-token-cost-analysis)
- [js-tiktoken npm](https://www.npmjs.com/package/js-tiktoken)
- [@tiktoken/tokenizer npm](https://www.npmjs.com/package/@tiktoken/tokenizer)
- [OpenAI Tiktoken](https://github.com/openai/tiktoken)

