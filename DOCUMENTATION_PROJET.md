# 📊 Documentation du Projet Track Sustainability

Ce document regroupe les informations générales sur le projet, son évaluation et son résumé exécutif.

## 📋 Table des matières

1. [Résumé Exécutif](#résumé-exécutif)
2. [Résumé du Projet](#résumé-du-projet)
3. [Évaluation du Projet](#évaluation-du-projet)
4. [Modifications Effectuées](#modifications-effectuées)

---

## 🌱 Résumé Exécutif

### Projet

Extension Chrome pour estimer et visualiser l'impact carbone (CO₂) des requêtes envoyées aux modèles de langage (LLM).

### Résultats clés

#### Modèle ML
- **Performance** : R² = 0.8704 (87.04% de variance expliquée)
- **Algorithme** : Gradient Boosting
- **Dataset** : 78,728 mesures réelles de consommation énergétique
- **Features principales** : Longueur de réponse (47%), Total tokens (26%), Taille du modèle (20%)

#### Consommation énergétique

| Modèle | Énergie/token | Ratio vs 7B |
|--------|---------------|-------------|
| 2B (Gemma) | 0.000000189 J | 0.4× |
| 7B (LLaMA 3) | 0.000000460 J | 1× |
| 70B (GPT-4) | 0.000007753 J | 17× |

**Insight** : GPT-4 (70B) consomme **17× plus** d'énergie que GPT-3.5 (7B) pour la même réponse.

#### Facteurs CO₂

| Pays | Intensité (gCO₂/kWh) | Mix |
|------|----------------------|-----|
| 🇸🇪 Suède | 13 | Nucléaire + Hydro |
| 🇫🇷 France | 52 | Nucléaire (65%) |
| 🇺🇸 États-Unis | 369 | Mix |
| 🌍 Moyenne mondiale | 480 | Mix |
| 🇨🇳 Chine | 581 | Charbon (60%) |
| 🇵🇱 Pologne | 652 | Charbon (70%) |

---

## 📊 Résumé du Projet

### Vue d'ensemble

**Track Sustainability** est une extension Chrome qui estime et visualise l'impact carbone (CO₂) des requêtes envoyées aux modèles de langage (LLM). Le projet combine machine learning, analyse de données et développement web pour sensibiliser aux impacts environnementaux de l'IA.

### Objectifs atteints

✅ Analyse complète du dataset LLM energy consumption (78,728 mesures)
✅ Construction d'un modèle prédictif performant (R² = 0.8704)
✅ Développement d'une extension Chrome fonctionnelle
✅ Détection automatique de ChatGPT (GPT-4o testé et validé)
✅ Système de conversion CO₂ avec 30+ pays
✅ Interface utilisateur intuitive et responsive
✅ Documentation complète
✅ Intégration Watsonx pour prédictions avancées

### Résultats du modèle ML

#### Performance

| Métrique | Valeur |
|----------|--------|
| R² Score | 0.8704 |
| MSE | 0.002 J |
| Algorithme | Gradient Boosting |
| Features | 7 |
| Samples (train) | 62,982 |
| Samples (test) | 15,746 |

#### Features Importantes

1. **response_token_length** (47%) : Longueur de la réponse en tokens
2. **total_tokens** (26%) : Total des tokens (prompt + réponse)
3. **model_size** (20%) : Taille du modèle (2B, 7B, 70B)
4. **hardware_type** (5%) : Type de hardware
5. **prompt_token_length** (2%) : Longueur du prompt

### Technologies utilisées

- **Machine Learning** : scikit-learn (Gradient Boosting)
- **Extension Chrome** : Manifest V3, Content Scripts, Service Workers
- **Visualisation** : Chart.js
- **Intégration** : IBM Watsonx
- **Backend** : Node.js, Express.js

---

## 📊 Évaluation du Projet

### Objectifs Initiaux vs Réalisations

#### 1. Analyser la consommation énergétique d'un modèle open-source

**Statut** : ✅ **COMPLET**
- Dataset analysé : 78,728 mesures (vs 5,200 demandées)
- 7 modèles analysés (LLaMA, Gemma, CodeLlama)
- 4 types de hardware analysés

#### 2. Construire un modèle prédictif estimant l'énergie par token/requête

**Statut** : ✅ **COMPLET**
- Modèle Gradient Boosting avec R² = 0.8704
- Performance supérieure aux attentes
- Export en JavaScript pour l'extension

#### 3. Convertir l'énergie en CO₂e selon le mix énergétique

**Statut** : ✅ **COMPLET**
- 30+ pays disponibles (vs demandé)
- Facteurs d'émission basés sur Ember Global Electricity Review 2024
- Conversion automatique en temps réel

#### 4. Développer une interface interactive (extension Chrome)

**Statut** : ✅ **COMPLET**
- Extension Chrome fonctionnelle
- Interface moderne et intuitive
- Détection automatique ChatGPT (GPT-4o testé et validé)
- Dashboard complet avec graphiques

### Points Forts

1. **Modèle ML performant** : R² = 0.8704 (excellent)
2. **Dataset complet** : 78,728 mesures (vs 5,200 demandées)
3. **Interface utilisateur** : Moderne, intuitive, responsive
4. **Documentation** : Complète et détaillée
5. **Intégration Watsonx** : Prédictions avancées avec modèle déployé
6. **Précision des tokens** : Interception réseau pour données API réelles
7. **Interception réseau** : Support ChatGPT avec détection automatique du modèle
8. **Performance** : Chargement optimisé des données
9. **Robustesse** : Système de déduplication et gestion robuste des cas limites

---

## 📝 Modifications Effectuées

### Objectif

Améliorer la capacité de l'extension à scanner et analyser les messages de ChatGPT pour calculer précisément le facteur de CO2 généré par les prompts.

### Modifications Réalisées

#### 1. Ajout de l'Interception Réseau ⭐ (Critique)

**Fichier créé** : `client/public/network-interceptor.js`

**Fonctionnalité** : Intercepte les requêtes réseau (`fetch` et `XMLHttpRequest`) pour récupérer les **vraies données** depuis les APIs des plateformes :

- ✅ **Modèle réel utilisé** (gpt-4o, gpt-4, gpt-3.5-turbo)
- ✅ **Tokens exacts** (prompt_tokens, completion_tokens)
- ✅ **Contenu des messages** (pour validation)

**Avantages** :
- Données **100% précises** (pas d'estimation)
- Détection automatique du **modèle réel**
- Fonctionne même si la structure DOM change

#### 2. Amélioration de l'Extraction du Texte

**Fichier modifié** : `client/public/content.js`

**Améliorations** :
- ✅ Extraction récursive complète
- ✅ Préservation des blocs de code
- ✅ Gestion des messages multi-parties
- ✅ Nettoyage intelligent

#### 3. Système de Déduplication

**Fichier modifié** : `client/public/content.js`

**Fonctionnalités** :
- ✅ Hash stable basé sur le contenu
- ✅ Stockage persistant dans `chrome.storage.local`
- ✅ Isolation par conversation
- ✅ Nettoyage automatique

#### 4. Intégration Watsonx

**Fichiers créés** :
- `client/public/watsonx-config.js`
- `client/public/watsonx-service.js`

**Fonctionnalités** :
- ✅ Configuration Watsonx dans le dashboard
- ✅ Prédictions avec modèle déployé
- ✅ Fallback vers modèles locaux
- ✅ Serveur local pour sécurité

---

## 📈 Impact et Résultats

### Consommation énergétique par modèle

| Taille | Énergie/token | Exemple |
|--------|---------------|---------|
| 2B | 0.000000189 J | Gemma 2B |
| 7B | 0.000000460 J | LLaMA 3 8B, Mistral 7B |
| 70B | 0.000007753 J | GPT-4, Claude 3 Opus |

**Note** : Un modèle 70B consomme environ **40× plus** d'énergie par token qu'un modèle 7B.

### Équivalences CO₂

Pour 1000 requêtes à GPT-4 (moyenne 500 tokens/réponse) :

- **Énergie** : ~3.9 J
- **CO₂** (mix mondial) : ~0.52 g
- **Équivalent** : ~2.6 recherches Google

---

## 🎓 Contexte Académique

Ce projet a été développé dans le cadre d'un projet académique sur la **durabilité de l'IA** :

- **Objectif** : Sensibiliser aux impacts environnementaux des LLM
- **Dataset** : Hugging Face - ejhusom/llm-inference-energy-consumption
- **Expert** : Hernan Carrillo (Data & AI Scientist, Capgemini)

## 👥 Équipe

**🌱 Track Sustainability Team**

- **Jules Sayad-Barth**
- **Hugo Robin**
- **Leo Demelle**
- **Ghadi Salameh**
- **Maria Katibi**

---

## 📚 Références

1. **Dataset** : [LLM Inference Energy Consumption](https://huggingface.co/datasets/ejhusom/llm-inference-energy-consumption)
2. **Paper** : "The Price of Prompting: Profiling Energy Use in Large Language Models Inference" (2024)
3. **Ember** : [Global Electricity Review 2024](https://ember-energy.org/latest-insights/global-electricity-review-2024/)
4. **IEA** : [Emissions Factors 2024](https://www.iea.org/data-and-statistics/data-product/emissions-factors-2024)
5. **IBM Watsonx** : [Documentation Watsonx](https://www.ibm.com/products/watsonx-ai)

---

✅ **Le projet Track Sustainability est complet, fonctionnel et prêt pour utilisation et démonstration.**

