# 🌱 Track Sustainability - CO₂ Impact Tracker for LLMs IBM ESILV Hackathon

Extension Chrome pour estimer et visualiser l'impact carbone (CO₂) de vos requêtes aux modèles de langage (LLM).

## 📋 Description

Track Sustainability analyse en temps réel vos conversations avec ChatGPT pour estimer la consommation énergétique et les émissions de CO₂ associées. L'extension utilise un modèle de machine learning entraîné sur des données réelles de consommation énergétique de modèles open-source, avec intégration Watsonx pour des prédictions avancées.

### ✨ Fonctionnalités

- **Détection automatique** des conversations sur ChatGPT
- **Estimation précise** de la consommation énergétique basée sur un modèle ML (R² = 0.8704)
- **Intégration Watsonx** pour des prédictions avec modèle déployé
- **Conversion en CO₂** avec choix du mix énergétique par pays (30+ pays disponibles)
- **Tracking cumulatif** des statistiques de toutes vos conversations
- **Dashboard complet** avec graphiques, prédictions long terme et comparaisons
- **Équivalences concrètes** (km en voiture, emails, arbres nécessaires)
- **Interface intuitive** avec statistiques en temps réel

### 🎯 Modèles supportés

L'extension détecte automatiquement les modèles OpenAI utilisés sur ChatGPT :

- **GPT-4o** (testé et validé)
- **GPT-4** / **GPT-4 Turbo**
- **GPT-3.5 Turbo**

Les estimations d'énergie sont basées sur un modèle ML entraîné sur des données réelles de consommation énergétique, permettant d'estimer l'impact même pour les modèles propriétaires comme GPT-4o.

## 🚀 Installation

### Option 1 : Installation en mode développeur (recommandé)

1. **Télécharger l'extension**
   ```bash
   # Cloner le repository
   git clone https://github.com/Farx1/hackathon_IBM_DIA_23.git
   cd hackathon_IBM_DIA_23/track-sustainability-extension/client/public
   ```

2. **Ouvrir Chrome**
   - Aller dans `chrome://extensions/`
   - Activer le **Mode développeur** (en haut à droite)

3. **Charger l'extension**
   - Cliquer sur **"Charger l'extension non empaquetée"**
   - Sélectionner le dossier `client/public`

4. **Vérifier l'installation**
   - L'icône 🌱 devrait apparaître dans la barre d'outils
   - Cliquer dessus pour ouvrir le popup

### Option 2 : Package Chrome (.zip)

```bash
# Créer un package
cd track-sustainability-extension/client/public
zip -r track-sustainability.zip . -x "*.git*" -x "node_modules/*"
```

Puis charger le fichier .zip dans Chrome.

## 📊 Ouvrir le Dashboard

### Méthode 1 : Depuis l'Extension (Recommandé)

1. **Ouvrir Chrome**
2. **Cliquer sur l'icône de l'extension** 🌱 dans la barre d'outils
3. **Dans le popup**, cliquer sur le bouton **"📊 Ouvrir le Dashboard Analytics"**
4. Le dashboard s'ouvre dans un nouvel onglet

### Méthode 2 : Depuis la Page des Extensions

1. Aller dans `chrome://extensions/`
2. Trouver **"Track Sustainability - CO₂ Impact Tracker for LLMs"**
3. Cliquer sur **"Options"** ou **"Détails"** → **"Options de l'extension"**
4. Le dashboard s'ouvre

### Méthode 3 : URL Directe

1. Ouvrir un nouvel onglet dans Chrome
2. Taper dans la barre d'adresse :
   ```
   chrome-extension://[EXTENSION_ID]/dashboard.html
   ```
   
   Pour trouver l'ID de l'extension :
   - Aller dans `chrome://extensions/`
   - Activer le "Mode développeur"
   - L'ID s'affiche sous le nom de l'extension

## 📊 Utilisation

1. **Ouvrir ChatGPT**
   - Aller sur chat.openai.com

2. **Commencer une conversation**
   - L'extension détecte automatiquement vos échanges
   - Le statut passe à "✅ Conversation active détectée"

3. **Consulter les statistiques**
   - Cliquer sur l'icône de l'extension pour voir le popup
   - Ouvrir le dashboard pour des statistiques détaillées

4. **Configurer Watsonx pour des prédictions avancées**
   - Ouvrir le dashboard
   - Aller dans l'onglet "Configuration"
   - Entrer votre API Key, Project ID et Deployment ID Watsonx
   - Cliquer sur "Tester l'Authentification"
   - Les prédictions utiliseront automatiquement le modèle Watsonx
   - Découvrez les fonctions supplémentaires qui permettent une meilleur utilisation de norte projet !

## 🔬 Méthodologie

### Modèle de prédiction

L'extension utilise plusieurs méthodes de prédiction :

1. **Modèle Watsonx** (si configuré) : Modèle ML déployé sur IBM Watsonx
2. **Modèle Random Forest local** : Modèle entraîné localement
3. **Modèle simplifié** : Estimation basée sur les tokens et le modèle

Le modèle est entraîné sur le dataset [LLM Inference Energy Consumption](https://huggingface.co/datasets/ejhusom/llm-inference-energy-consumption) :
- **78,728 mesures** réelles de consommation énergétique
- **15 configurations** (modèles × hardware)
- **Performance** : R² = 0.8704, MSE = 0.002 J

**Note** : Les estimations sont basées sur des modèles open-source similaires. Pour GPT-4o, l'extension utilise des coefficients adaptés pour estimer la consommation énergétique.

### Formule de calcul

```
Énergie (J) = Énergie_base + (Tokens_prompt × 0.3 × E/token) + (Tokens_réponse × 1.0 × E/token)

CO₂ (g) = (Énergie_J / 3,600,000) × Intensité_carbone (gCO₂/kWh)
```

### Facteurs d'émission

Les facteurs d'émission CO₂ proviennent de sources officielles :
- **Ember Global Electricity Review 2024**
- **IEA (International Energy Agency)**
- **Our World in Data**

Exemples d'intensité carbone :
- 🇸🇪 Suède : 13 gCO₂/kWh (nucléaire + hydro)
- 🇫🇷 France : 52 gCO₂/kWh (nucléaire dominant)
- 🇺🇸 États-Unis : 369 gCO₂/kWh
- 🌍 Moyenne mondiale : 480 gCO₂/kWh
- 🇨🇳 Chine : 581 gCO₂/kWh
- 🇿🇦 Afrique du Sud : 750 gCO₂/kWh 

## 🛠️ Architecture technique

```
track-sustainability-extension/
├── client/
│   ├── public/                    # Extension Chrome
│   │   ├── manifest.json          # Configuration Chrome
│   │   ├── popup.html/js          # Interface utilisateur
│   │   ├── dashboard.html/js      # Dashboard complet
│   │   ├── content.js             # Détection des conversations
│   │   ├── background.js          # Service worker (calculs)
│   │   ├── predictor.js           # Modèle de prédiction
│   │   ├── watsonx-service.js     # Intégration Watsonx
│   │   ├── data/
│   │   │   ├── model_simplified.json      # Modèle ML
│   │   │   └── carbon_intensity.json     # Facteurs CO₂
│   │   └── icon-*.png             # Icônes
├── server/
│   └── index.ts                   # Serveur Express pour proxy Watsonx
├── shared/
│   └── const.ts                   # Constantes partagées
├── docs/                          # Documentation et graphiques
└── certification/                 # Certifications (à ajouter)
```

### Technologies utilisées

- **Manifest V3** (Chrome Extensions)
- **Machine Learning** : Gradient Boosting, Random Forest
- **IBM Watsonx** : Modèles ML déployés
- **Storage API** : Chrome Storage Local
- **Content Scripts** : Détection DOM
- **Service Workers** : Calculs en arrière-plan
- **Chart.js** : Visualisations de données
- **Express.js** : Serveur proxy pour Watsonx

## 📝 Développement

### Prérequis

- Node.js 18+
- Chrome/Chromium
- Python 3.11+ (pour l'entraînement du modèle)
- IBM Watsonx Account (pour les prédictions avancées)

### Installation des dépendances

```bash
cd track-sustainability-extension
pnpm install
```

### Lancer le serveur

```bash
cd server
npm install
npm run dev
```

Le serveur permet d'utiliser Watsonx de manière sécurisée en gardant les credentials côté serveur.

## 📚 Références

1. **Dataset** : [LLM Inference Energy Consumption](https://huggingface.co/datasets/ejhusom/llm-inference-energy-consumption)
2. **Paper** : "The Price of Prompting: Profiling Energy Use in Large Language Models Inference (MELODI)" (2024)
3. **Ember** : [Global Electricity Review 2024](https://ember-energy.org/latest-insights/global-electricity-review-2024/)
4. **IEA** : [Emissions Factors 2024](https://www.iea.org/data-and-statistics/data-product/emissions-factors-2024)
5. **IBM Watsonx** : [Documentation Watsonx](https://www.ibm.com/products/watsonx-ai)

## 🤝 Contribution

Les contributions sont les bienvenues ! Pour contribuer :

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 👥 Équipe

Ce projet a été développé par :

<div align="center">

**🌱 Track Sustainability Team 23**

| 👨‍💻 | 👨‍💻 | 👨‍💻 | 👨‍💻 | 👩‍💻 | 👩‍💻 |
|:---:|:---:|:---:|:---:|:---:|:---:|
| **Jules Sayad-Barth** | **Hugo Robin** | **Leo Demelle** | **Ghadi Salameh** | **Maria Katibi** | **Hector Mell Mariolle** |

</div>

---

## 📄 Licence

Ce projet est sous licence **CC BY-SA 4.0** (Creative Commons Attribution-ShareAlike 4.0).

Le dataset utilisé est également sous licence CC BY-SA 4.0.

---

**Fait avec 💚 pour un futur plus durable**
