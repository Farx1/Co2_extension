/**
 * Dashboard Enhancements - Nouvelles fonctionnalités
 * Prédictions long terme, conseils, et comparaisons par paliers
 */

/**
 * Générer des conseils basés sur la consommation
 */
function generateAdvice(totalEnergyKwh, monthlyEnergyKwh, annualEnergyKwh, totalCO2kg) {
  const adviceSection = document.getElementById('advice-section');
  const adviceContent = document.getElementById('advice-content');
  if (!adviceSection || !adviceContent) return;
  
  const advice = [];
  
  // Déterminer le palier de l'utilisateur
  let userTier = 'personne_normale';
  if (monthlyEnergyKwh >= REFERENCE_TIERS.power_user.monthly_kWh) {
    userTier = 'power_user';
  } else if (monthlyEnergyKwh >= REFERENCE_TIERS.entreprise.monthly_kWh) {
    userTier = 'entreprise';
  } else if (monthlyEnergyKwh >= REFERENCE_TIERS.developpeur.monthly_kWh) {
    userTier = 'developpeur';
  }
  
  const currentTier = REFERENCE_TIERS[userTier];
  
  // Conseils généraux
  if (monthlyEnergyKwh < REFERENCE_TIERS.developpeur.monthly_kWh) {
    advice.push({
      type: 'success',
      icon: '✅',
      title: 'Consommation modérée',
      message: `Votre consommation (${monthlyEnergyKwh.toFixed(2)} kWh/mois) est en dessous de la moyenne des développeurs. Vous pouvez continuer à utiliser l'IA sans problème.`
    });
  } else if (monthlyEnergyKwh < REFERENCE_TIERS.entreprise.monthly_kWh) {
    advice.push({
      type: 'info',
      icon: 'ℹ️',
      title: 'Consommation dans la moyenne',
      message: `Votre consommation (${monthlyEnergyKwh.toFixed(2)} kWh/mois) correspond à celle d'un développeur actif. C'est normal pour un usage professionnel régulier.`
    });
  } else {
    advice.push({
      type: 'warning',
      icon: '⚠️',
      title: 'Consommation élevée',
      message: `Votre consommation (${monthlyEnergyKwh.toFixed(2)} kWh/mois) est élevée. Considérez optimiser vos requêtes ou réduire la fréquence d'utilisation.`
    });
  }
  
  // Conseils spécifiques
  if (annualEnergyKwh > 50) {
    advice.push({
      type: 'warning',
      icon: '💡',
      title: 'Optimisation recommandée',
      message: `Avec ${annualEnergyKwh.toFixed(1)} kWh/an prévus, pensez à : utiliser des modèles plus efficaces, regrouper vos requêtes, ou utiliser des réponses plus courtes quand possible.`
    });
  }
  
  if (totalCO2kg > 10) {
    advice.push({
      type: 'info',
      icon: '🌱',
      title: 'Impact environnemental',
      message: `Votre empreinte carbone prévue est de ${(annualEnergyKwh * 0.48).toFixed(2)} kg CO₂/an. Pour compenser, plantez ~${Math.ceil(annualEnergyKwh * 0.48 / 20)} arbres ou utilisez des mix énergétiques plus propres (ex: France, Suède).`
    });
  }
  
  // Afficher les conseils
  adviceContent.innerHTML = advice.map(a => `
    <div style="padding: 15px; margin-bottom: 15px; border-left: 4px solid ${a.type === 'success' ? '#4CAF50' : a.type === 'warning' ? '#FF9800' : '#2196F3'}; background: #f8f9fa; border-radius: 4px;">
      <div style="font-weight: 600; margin-bottom: 5px;">${a.icon} ${a.title}</div>
      <div style="color: #666; font-size: 14px;">${a.message}</div>
    </div>
  `).join('');
  
  adviceSection.style.display = 'block';
}

/**
 * Charger le graphique d'évolution de la consommation avec prédictions
 */
async function loadConsumptionTrendChart() {
  const ctx = document.getElementById('chart-consumption-trend');
  if (!ctx || !datasetData || datasetData.length === 0) return;
  
  // Déterminer si on doit grouper par jour ou par mois
  // Si on a plus de 60 jours de données, grouper par mois pour mieux voir les fluctuations
  const timestamps = datasetData.map(row => row.timestamp || Date.now()).filter(Boolean);
  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);
  const daysDiff = (maxTimestamp - minTimestamp) / (1000 * 60 * 60 * 24);
  const groupByMonth = daysDiff > 60; // Grouper par mois si plus de 60 jours
  
  console.log('📊 Groupement données:', { daysDiff, groupByMonth, dataLength: datasetData.length });
  
  let groupedData = {};
  let historicalLabels = [];
  let historicalData = [];
  
  if (groupByMonth) {
    // Grouper par mois
    datasetData.forEach(row => {
      // Normaliser le timestamp
      let timestamp = row.timestamp;
      if (typeof timestamp === 'string') {
        timestamp = parseInt(timestamp);
      }
      if (!timestamp || isNaN(timestamp)) {
        timestamp = Date.now();
      }
      
      const date = new Date(timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groupedData[monthKey]) {
        groupedData[monthKey] = { energy: 0, count: 0, exchanges: [] };
      }
      const energy = parseFloat(row.energy_consumption_llm_total) || 0;
      groupedData[monthKey].energy += energy;
      groupedData[monthKey].count++;
      groupedData[monthKey].exchanges.push(row);
    });
    
    console.log('📊 Groupement par mois:', {
      totalMonths: Object.keys(groupedData).length,
      months: Object.keys(groupedData).sort(),
      energyByMonth: Object.keys(groupedData).sort().map(m => ({
        month: m,
        energy: groupedData[m].energy,
        energyKwh: (groupedData[m].energy / 3600000).toExponential(3),
        count: groupedData[m].count
      }))
    });
    
    const sortedMonths = Object.keys(groupedData).sort();
    historicalLabels = sortedMonths.map(m => {
      const [year, month] = m.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    });
    // Créer un tableau complet pour tous les mois de la période
    const allMonthsInRange = [];
    const startDate = new Date(Math.min(...timestamps));
    const endDate = new Date(Math.max(...timestamps));
    
    let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (currentDate <= endDate) {
      const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      allMonthsInRange.push(monthKey);
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    historicalLabels = allMonthsInRange.map(m => {
      const [year, month] = m.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
    });
    
    historicalData = allMonthsInRange.map(m => {
      if (groupedData[m]) {
        const energyJoules = groupedData[m].energy;
        const energyKwh = energyJoules / 3600000;
        return energyKwh;
      } else {
        // Mois sans données : retourner null pour l'afficher comme une lacune
        return null;
      }
    });
  } else {
    // Grouper par jour
    datasetData.forEach(row => {
      // Normaliser le timestamp
      let timestamp = row.timestamp;
      if (typeof timestamp === 'string') {
        timestamp = parseInt(timestamp);
      }
      if (!timestamp || isNaN(timestamp)) {
        timestamp = Date.now();
      }
      
      const date = new Date(timestamp);
      const dayKey = date.toISOString().split('T')[0];
      if (!groupedData[dayKey]) {
        groupedData[dayKey] = { energy: 0, count: 0, exchanges: [] };
      }
      const energy = parseFloat(row.energy_consumption_llm_total) || 0;
      groupedData[dayKey].energy += energy;
      groupedData[dayKey].count++;
      groupedData[dayKey].exchanges.push(row);
    });
    
    console.log('📊 Groupement par jour:', {
      totalDays: Object.keys(groupedData).length,
      sampleDays: Object.keys(groupedData).sort().slice(0, 10),
      energyByDay: Object.keys(groupedData).sort().slice(0, 10).map(d => ({
        day: d,
        energy: groupedData[d].energy,
        energyKwh: (groupedData[d].energy / 3600000).toExponential(3),
        count: groupedData[d].count
      }))
    });
    
    const sortedDays = Object.keys(groupedData).sort();
    // Créer un tableau complet pour tous les jours de la période
    const allDaysInRange = [];
    const startDate = new Date(Math.min(...timestamps));
    const endDate = new Date(Math.max(...timestamps));
    
    let currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0);
    while (currentDate <= endDate) {
      const dayKey = currentDate.toISOString().split('T')[0];
      allDaysInRange.push(dayKey);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    historicalLabels = allDaysInRange.map(d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
    historicalData = allDaysInRange.map(d => {
      if (groupedData[d]) {
        const energyJoules = groupedData[d].energy;
        const energyKwh = energyJoules / 3600000;
        return energyKwh;
      } else {
        // Jour sans données : retourner null pour l'afficher comme une lacune
        return null;
      }
    });
  }
  
  // Calculer les stats AVANT le filtrage pour le debug
  const rawMaxEnergy = historicalData.length > 0 ? Math.max(...historicalData) : 0;
  const rawMinEnergy = historicalData.length > 0 ? Math.min(...historicalData.filter(d => d > 0)) : 0;
  
  console.log('📊 Données groupées:', {
    labelsCount: historicalLabels.length,
    dataCount: historicalData.length,
    sampleData: historicalData.slice(0, 5),
    sampleDataRaw: historicalData.slice(0, 5).map(d => d.toExponential(3)),
    totalEnergy: historicalData.reduce((a, b) => a + b, 0),
    totalEnergyRaw: historicalData.reduce((a, b) => a + b, 0).toExponential(3),
    maxEnergy: rawMaxEnergy,
    maxEnergyRaw: rawMaxEnergy.toExponential(3),
    minEnergy: rawMinEnergy || 0,
    minEnergyRaw: rawMinEnergy ? rawMinEnergy.toExponential(3) : '0'
  });
  
  // Calculer les statistiques pour les prédictions
  const avgDailyEnergy = historicalData.length > 0 
    ? historicalData.reduce((a, b) => a + b, 0) / historicalData.length 
    : 0;
  const stdDev = historicalData.length > 1
    ? Math.sqrt(historicalData.reduce((sum, val) => sum + Math.pow(val - avgDailyEnergy, 2), 0) / (historicalData.length - 1))
    : avgDailyEnergy * 0.3; // Estimation si pas assez de données
  
  // Générer des prédictions pour les prochains jours/mois selon le groupement
  const today = new Date();
  const predictionPeriods = groupByMonth ? 12 : 30; // 12 mois ou 30 jours
  const predictionLabels = [];
  const predictionData = [];
  const predictionUpper = [];
  const predictionLower = [];
  
  // Scénarios de projets - basés sur les données historiques réelles
  // Les scénarios génèrent des prédictions qui suivent les patterns historiques avec des variations
  const scenarios = {
    conservative: { 
      name: 'Projet Modéré',
      // Réduction de 20% par rapport à la moyenne historique
      trendMultiplier: 0.8,
      // Variations plus faibles
      volatilityMultiplier: 0.7,
      // Variation aléatoire réduite
      randomVariation: 0.15
    },
    normal: { 
      name: 'Projet Normal',
      // Même niveau que la moyenne historique
      trendMultiplier: 1.0,
      // Variations normales
      volatilityMultiplier: 1.0,
      // Variation aléatoire normale
      randomVariation: 0.25
    },
    intensive: { 
      name: 'Projet Intensif',
      // Augmentation de 30% par rapport à la moyenne historique
      trendMultiplier: 1.3,
      // Variations plus importantes
      volatilityMultiplier: 1.2,
      // Variation aléatoire plus importante
      randomVariation: 0.35
    }
  };
  
  // Obtenir le scénario sélectionné depuis le sélecteur
  const scenarioSelect = document.getElementById('scenario-select');
  const scenarioKey = scenarioSelect ? scenarioSelect.value : 'normal';
  const selectedScenario = scenarios[scenarioKey] || scenarios.normal;
  
  // Calculer la tendance basée sur les données historiques réelles
  let trend = 0;
  let historicalPattern = [];
  
  if (historicalData.length >= 2) {
    // Calculer la tendance linéaire
    const firstHalf = historicalData.slice(0, Math.floor(historicalData.length / 2));
    const secondHalf = historicalData.slice(Math.floor(historicalData.length / 2));
    const avgFirst = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : avgDailyEnergy;
    const avgSecond = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : avgDailyEnergy;
    trend = (avgSecond - avgFirst) / Math.max(1, firstHalf.length); // Tendance par période
    
    // Créer un pattern basé sur les variations historiques
    historicalPattern = historicalData.map((val, idx) => {
      const relativeValue = avgDailyEnergy > 0 ? val / avgDailyEnergy : 1;
      return relativeValue;
    });
  } else {
    // Si pas assez de données, utiliser un pattern constant
    historicalPattern = [1.0];
  }
  
  // Base de prédiction : utiliser la moyenne historique réelle (pas de multiplication excessive)
  let basePrediction = avgDailyEnergy * selectedScenario.trendMultiplier;
  
  // Si la moyenne est 0 ou très petite, utiliser une estimation basée sur les tokens si disponible
  if (basePrediction === 0 || basePrediction < 0.000000001) {
    // Essayer d'estimer à partir des données disponibles
    if (datasetData && datasetData.length > 0) {
      const totalTokens = datasetData.reduce((sum, d) => 
        sum + (parseInt(d.prompt_token_length || 0) + parseInt(d.response_token_length || 0)), 0);
      const avgTokensPerPeriod = totalTokens / Math.max(1, historicalData.length);
      // Estimation: ~0.00001 Joules par token
      basePrediction = (avgTokensPerPeriod * 0.00001) / 3600000; // Convertir en kWh
      basePrediction = basePrediction * selectedScenario.trendMultiplier;
    }
  }
  
  console.log('📊 Calcul prédictions scénario:', {
    scenario: selectedScenario.name,
    avgDailyEnergy,
    basePrediction,
    trend,
    stdDev,
    historicalPatternLength: historicalPattern.length,
    historicalPatternSample: historicalPattern.slice(0, 5)
  });
  
  // Générer les prédictions avec variabilité basée sur les patterns historiques
  for (let i = 1; i <= predictionPeriods; i++) {
    let futureDate;
    let label;
    
    if (groupByMonth) {
      // Prédictions mensuelles
      futureDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
      label = futureDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
      // Pour les prédictions mensuelles, utiliser la moyenne mensuelle historique
      basePrediction = avgDailyEnergy * 30 * selectedScenario.trendMultiplier;
    } else {
      // Prédictions quotidiennes
      futureDate = new Date(today);
      futureDate.setDate(today.getDate() + i);
      label = futureDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      // Appliquer la tendance avec le multiplicateur du scénario
      basePrediction += trend * selectedScenario.trendMultiplier;
    }
    
    predictionLabels.push(label);
    
    // Utiliser le pattern historique pour générer des variations réalistes
    // Si on a un pattern historique, l'utiliser de manière cyclique
    let patternMultiplier = 1.0;
    if (historicalPattern.length > 0) {
      const patternIndex = (i - 1) % historicalPattern.length;
      patternMultiplier = historicalPattern[patternIndex] || 1.0;
    }
    
    // Ajouter des variations saisonnières pour plus de réalisme
    let seasonalMultiplier = 1.0;
    if (groupByMonth) {
      // Variations saisonnières mensuelles (plus en hiver, moins en été)
      const monthIndex = futureDate.getMonth();
      const seasonalPattern = [
        1.2, // Janvier (hiver)
        1.1, // Février
        1.0, // Mars
        0.9, // Avril
        0.8, // Mai
        0.7, // Juin (été)
        0.6, // Juillet
        0.7, // Août
        0.9, // Septembre
        1.0, // Octobre
        1.1, // Novembre
        1.2  // Décembre
      ];
      seasonalMultiplier = seasonalPattern[monthIndex] || 1.0;
    } else {
      // Variations saisonnières quotidiennes (plus subtiles)
      const dayOfYear = Math.floor((futureDate - new Date(futureDate.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
      // Sinusoïde pour créer des variations saisonnières
      seasonalMultiplier = 1.0 + 0.3 * Math.sin((dayOfYear / 365) * 2 * Math.PI - Math.PI / 2); // Minimum en été, maximum en hiver
    }
    
    // Ajouter de la variabilité aléatoire (distribution normale approximative)
    // Utiliser plusieurs sources de variation pour plus de réalisme
    const randomFactor1 = (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2; // Centré sur 0
    const randomFactor2 = (Math.random() + Math.random() - 1); // Autre source de variation
    const combinedRandomFactor = (randomFactor1 * 0.7 + randomFactor2 * 0.3); // Combiner les deux
    
    // Utiliser la volatilité historique réelle, ajustée par le scénario
    const volatility = stdDev * selectedScenario.volatilityMultiplier * (groupByMonth ? 30 : 1);
    
    // Variation aléatoire basée sur la volatilité historique
    const volatilityVariation = combinedRandomFactor * volatility;
    
    // Variation aléatoire supplémentaire pour plus de fluctuations
    const randomVariation = combinedRandomFactor * selectedScenario.randomVariation * (groupByMonth ? avgDailyEnergy * 30 : avgDailyEnergy);
    
    // Variation cyclique pour simuler des patterns hebdomadaires (si groupement par jour)
    let weeklyVariation = 0;
    if (!groupByMonth) {
      const dayOfWeek = futureDate.getDay();
      // Moins d'activité le weekend
      const weeklyPattern = [1.0, 1.1, 1.1, 1.1, 1.1, 0.8, 0.7]; // Dimanche à Samedi
      weeklyVariation = (weeklyPattern[dayOfWeek] - 1.0) * avgDailyEnergy * 0.2;
    }
    
    // Prédiction = base * pattern historique * saisonnier + variations aléatoires + variation hebdomadaire
    const predictedValue = Math.max(0, 
      basePrediction * patternMultiplier * seasonalMultiplier + 
      volatilityVariation + 
      randomVariation + 
      weeklyVariation
    );
    
    predictionData.push(parseFloat(predictedValue.toFixed(6)));
    
    // Calculer les bornes de confiance (intervalle de confiance à 80%)
    // Utiliser la volatilité réelle avec une marge plus large pour refléter les variations
    const baseConfidenceInterval = 1.28 * volatility * selectedScenario.volatilityMultiplier;
    // Ajouter une marge supplémentaire basée sur la variation aléatoire
    const additionalMargin = Math.abs(randomVariation) * 0.5;
    const confidenceInterval = baseConfidenceInterval + additionalMargin;
    predictionUpper.push(parseFloat((predictedValue + confidenceInterval).toFixed(6)));
    predictionLower.push(parseFloat(Math.max(0, predictedValue - confidenceInterval).toFixed(6)));
  }
  
  // Trouver le max et min pour adapter l'échelle du graphique
  // Filtrer les valeurs null et prendre le max de toutes les données (historique + prédictions)
  // Inclure aussi les valeurs 0 pour avoir une échelle complète
  const allDataValues = [
    ...historicalData.filter(d => d !== null && d !== undefined && !isNaN(d)),
    ...predictionData.filter(d => d !== null && d !== undefined && !isNaN(d)),
    ...predictionUpper.filter(d => d !== null && d !== undefined && !isNaN(d)),
    ...predictionLower.filter(d => d !== null && d !== undefined && !isNaN(d))
  ];
  
  const maxEnergy = allDataValues.length > 0 ? Math.max(...allDataValues) : 0;
  const minEnergy = allDataValues.length > 0 ? Math.min(...allDataValues) : 0;
  
  // Calculer le max pour l'échelle : valeur max + 10%
  // Utiliser les données réelles même si elles sont très petites
  let scaleMax;
  if (maxEnergy > 0) {
    scaleMax = maxEnergy * 1.1;
  } else if (rawMaxEnergy > 0) {
    // Utiliser rawMaxEnergy si maxEnergy est 0 mais qu'on a des données
    scaleMax = rawMaxEnergy * 1.1;
  } else if (avgDailyEnergy > 0) {
    scaleMax = avgDailyEnergy * 1.1;
  } else {
    // Si tout est vraiment à 0, utiliser une valeur très petite pour forcer l'utilisation de µWh ou nWh
    // Cela permettra de voir les fluctuations même si les valeurs sont proches de 0
    scaleMax = 0.0000000001; // 0.1 nWh - très petite valeur pour forcer nWh
  }
  
  // S'assurer que scaleMax n'est jamais 0
  if (scaleMax === 0 || isNaN(scaleMax)) {
    scaleMax = 0.0000000001; // Forcer nWh si problème
  }
  
  console.log('📊 Calcul échelle graphique:', {
    maxEnergy,
    minEnergy,
    scaleMax,
    avgDailyEnergy,
    allDataValuesCount: allDataValues.length,
    sampleValues: allDataValues.slice(0, 5)
  });
  
  // Déterminer l'unité adaptée pour l'affichage (basée sur scaleMax pour avoir une bonne visibilité)
  // Ajouter des unités plus petites pour les très petites valeurs (µWh, nWh)
  let energyUnit = 'kWh';
  let energyMultiplier = 1;
  let energyLabel = 'Énergie (kWh)';
  
  console.log('🔍 Détermination unité pour scaleMax:', scaleMax);
  
  if (scaleMax >= 0.001) {
    // >= 1 Wh : utiliser kWh
    energyUnit = 'kWh';
    energyMultiplier = 1;
    energyLabel = 'Énergie (kWh)';
  } else if (scaleMax >= 0.000001) {
    // >= 1 mWh : utiliser Wh
    energyUnit = 'Wh';
    energyMultiplier = 1000;
    energyLabel = 'Énergie (Wh)';
  } else if (scaleMax >= 0.000000001) {
    // >= 1 µWh : utiliser mWh
    energyUnit = 'mWh';
    energyMultiplier = 1000000;
    energyLabel = 'Énergie (mWh)';
  } else if (scaleMax >= 0.000000000001) {
    // >= 1 nWh : utiliser µWh
    energyUnit = 'µWh';
    energyMultiplier = 1000000000;
    energyLabel = 'Énergie (µWh)';
  } else {
    // < 1 nWh : utiliser nWh
    energyUnit = 'nWh';
    energyMultiplier = 1000000000000;
    energyLabel = 'Énergie (nWh)';
  }
  
  console.log('✅ Unité sélectionnée:', { energyUnit, energyMultiplier, energyLabel, scaleMax });
  
  console.log('📊 Adaptation échelle graphique:', {
    maxEnergy,
    minEnergy,
    energyUnit,
    energyMultiplier,
    sampleHistorical: historicalData.slice(0, 3),
    samplePrediction: predictionData.slice(0, 3)
  });
  
  // Combiner historique et prédictions
  const allLabels = [...historicalLabels, ...predictionLabels];
  const allHistoricalData = [...historicalData, ...new Array(predictionPeriods).fill(null)];
  const allPredictionData = [...new Array(historicalLabels.length).fill(null), ...predictionData];
  const allPredictionUpper = [...new Array(historicalLabels.length).fill(null), ...predictionUpper];
  const allPredictionLower = [...new Array(historicalLabels.length).fill(null), ...predictionLower];
  
  // Mettre à l'échelle toutes les données pour l'affichage
  const allHistoricalDataScaled = allHistoricalData.map(d => d !== null ? d * energyMultiplier : null);
  const allPredictionDataScaled = allPredictionData.map(d => d !== null ? d * energyMultiplier : null);
  const allPredictionUpperScaled = allPredictionUpper.map(d => d !== null ? d * energyMultiplier : null);
  const allPredictionLowerScaled = allPredictionLower.map(d => d !== null ? d * energyMultiplier : null);
  
  if (charts['consumption-trend']) {
    charts['consumption-trend'].destroy();
  }
  
  charts['consumption-trend'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        {
          label: 'Consommation Historique',
          data: allHistoricalDataScaled,
          borderColor: '#667eea',
          backgroundColor: 'rgba(102, 126, 234, 0.1)',
          tension: 0.4,
          fill: false,
          pointRadius: 3,
          pointHoverRadius: 5
        },
        {
          label: 'Prédiction (Scénario: ' + selectedScenario.name + ')',
          data: allPredictionDataScaled,
          borderColor: '#FF9800',
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          borderDash: [5, 5],
          tension: 0.4,
          fill: false,
          pointRadius: 2,
          pointHoverRadius: 4
        },
        {
          label: 'Borne Supérieure (80% confiance)',
          data: allPredictionUpperScaled,
          borderColor: 'rgba(255, 152, 0, 0.3)',
          backgroundColor: 'rgba(255, 152, 0, 0.05)',
          borderDash: [2, 2],
          tension: 0.4,
          fill: '+1', // Remplir jusqu'au dataset suivant
          pointRadius: 0,
          pointHoverRadius: 0
        },
        {
          label: 'Borne Inférieure (80% confiance)',
          data: allPredictionLowerScaled,
          borderColor: 'rgba(255, 152, 0, 0.3)',
          backgroundColor: 'rgba(255, 152, 0, 0.05)',
          borderDash: [2, 2],
          tension: 0.4,
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: true,
          position: 'top'
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                // Convertir de l'unité affichée vers kWh pour le tooltip
                const valueInKwh = context.parsed.y / energyMultiplier;
                label += context.parsed.y.toFixed(4) + ' ' + energyUnit;
                // Afficher aussi en kWh si différent
                if (energyUnit !== 'kWh') {
                  label += ` (${valueInKwh.toFixed(6)} kWh)`;
                }
              }
              return label;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: energyLabel
          },
          // Adapter l'échelle selon les données : max réel + 10%
          suggestedMax: scaleMax * energyMultiplier,
          ticks: {
            callback: function(value) {
              return value.toFixed(4) + ' ' + energyUnit;
            }
          }
        },
        x: {
          ticks: {
            maxRotation: 45,
            minRotation: 45
          }
        }
      }
    }
  });
  
  // Ajouter une ligne verticale pour séparer historique et prédictions
  const chart = charts['consumption-trend'];
  const originalDraw = chart.draw.bind(chart);
  chart.draw = function() {
    originalDraw();
    if (chart.ctx) {
      const meta = chart.getDatasetMeta(0);
      if (meta && meta.data && meta.data.length > 0 && historicalLabels.length > 0) {
        const lastHistoricalIndex = historicalLabels.length - 1;
        const lastHistoricalPoint = meta.data[lastHistoricalIndex];
        if (lastHistoricalPoint) {
          chart.ctx.save();
          chart.ctx.strokeStyle = '#999';
          chart.ctx.lineWidth = 2;
          chart.ctx.setLineDash([5, 5]);
          chart.ctx.beginPath();
          chart.ctx.moveTo(lastHistoricalPoint.x, chart.chartArea.top);
          chart.ctx.lineTo(lastHistoricalPoint.x, chart.chartArea.bottom);
          chart.ctx.stroke();
          chart.ctx.restore();
        }
      }
    }
  };
  chart.update();
}

/**
 * Charger le graphique de prédiction long terme
 */
function loadLongTermPredictionChart(monthlyEnergyKwh) {
  const ctx = document.getElementById('chart-long-term-prediction');
  if (!ctx || !datasetData || datasetData.length === 0) return;
  
  // Grouper les données historiques par mois pour calculer les variations
  const byMonth = {};
  datasetData.forEach(row => {
    const date = new Date(row.timestamp || Date.now());
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[monthKey]) {
      byMonth[monthKey] = { energy: 0, count: 0 };
    }
    const energy = parseFloat(row.energy_consumption_llm_total) || 0;
    byMonth[monthKey].energy += energy;
    byMonth[monthKey].count++;
  });
  
  // Calculer la moyenne mensuelle historique
  const sortedMonths = Object.keys(byMonth).sort();
  const historicalMonthly = sortedMonths.map(m => byMonth[m].energy / 3600000); // Convertir en kWh
  const avgHistoricalMonthly = historicalMonthly.length > 0 
    ? historicalMonthly.reduce((a, b) => a + b, 0) / historicalMonthly.length 
    : monthlyEnergyKwh;
  
  // Calculer les variations mensuelles (multiplicateurs par rapport à la moyenne)
  const monthlyMultipliers = historicalMonthly.map(val => val / avgHistoricalMonthly || 1);
  
  // Générer les prédictions pour les 12 prochains mois avec variations
  const months = [];
  const predicted = [];
  const currentMonth = new Date();
  
  // Utiliser les variations historiques pour projeter les prédictions
  for (let i = 0; i < 12; i++) {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + i, 1);
    months.push(date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }));
    
    // Appliquer un multiplicateur basé sur les variations historiques
    // Utiliser un pattern cyclique si on a des données historiques
    let multiplier = 1;
    if (monthlyMultipliers.length > 0) {
      // Utiliser le multiplicateur du même mois de l'année précédente si disponible
      const monthIndex = date.getMonth();
      const historicalMonthIndex = monthIndex % monthlyMultipliers.length;
      multiplier = monthlyMultipliers[historicalMonthIndex] || 1;
      
      // Ajouter une petite variation aléatoire pour plus de réalisme
      multiplier += (Math.random() - 0.5) * 0.2; // Variation de ±10%
      multiplier = Math.max(0.5, Math.min(1.5, multiplier)); // Limiter entre 0.5 et 1.5
    }
    
    predicted.push(monthlyEnergyKwh * multiplier);
  }
  
  console.log('📊 Prédictions long terme:', {
    avgHistoricalMonthly,
    monthlyEnergyKwh,
    monthlyMultipliers: monthlyMultipliers.slice(0, 5),
    predicted: predicted.slice(0, 5),
    maxPredicted: Math.max(...predicted, 0)
  });
  
  // Déterminer l'unité adaptée pour l'affichage
  const maxPredicted = Math.max(...predicted, 0);
  // Calculer le max pour l'échelle : valeur max + 10%
  const scaleMax = maxPredicted > 0 ? maxPredicted * 1.1 : (monthlyEnergyKwh > 0 ? monthlyEnergyKwh * 1.1 : 0.001);
  
  let energyUnit = 'kWh';
  let energyMultiplier = 1;
  let energyLabel = 'Énergie (kWh)';
  
  if (scaleMax >= 0.001) {
    // >= 1 Wh : utiliser kWh
    energyUnit = 'kWh';
    energyMultiplier = 1;
    energyLabel = 'Énergie (kWh)';
  } else if (scaleMax >= 0.000001) {
    // >= 1 mWh : utiliser Wh
    energyUnit = 'Wh';
    energyMultiplier = 1000;
    energyLabel = 'Énergie (Wh)';
  } else if (scaleMax >= 0.000000001) {
    // >= 1 µWh : utiliser mWh
    energyUnit = 'mWh';
    energyMultiplier = 1000000;
    energyLabel = 'Énergie (mWh)';
  } else if (scaleMax >= 0.000000000001) {
    // >= 1 nWh : utiliser µWh
    energyUnit = 'µWh';
    energyMultiplier = 1000000000;
    energyLabel = 'Énergie (µWh)';
  } else {
    // < 1 nWh : utiliser nWh
    energyUnit = 'nWh';
    energyMultiplier = 1000000000000;
    energyLabel = 'Énergie (nWh)';
  }
  
  console.log('📊 Calcul échelle prédiction long terme:', {
    maxPredicted,
    scaleMax,
    monthlyEnergyKwh,
    energyUnit,
    energyMultiplier
  });
  
  // Convertir les prédictions pour l'affichage
  const predictedScaled = predicted.map(p => p * energyMultiplier);
  
  if (charts['long-term-prediction']) {
    charts['long-term-prediction'].destroy();
  }
  
  charts['long-term-prediction'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: `Prédiction (${energyUnit})`,
        data: predictedScaled,
        backgroundColor: 'rgba(102, 126, 234, 0.8)',
        borderColor: '#667eea',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              const valueInKwh = context.parsed.y / energyMultiplier;
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              label += context.parsed.y.toFixed(4) + ' ' + energyUnit;
              if (energyUnit !== 'kWh') {
                label += ` (${valueInKwh.toFixed(6)} kWh)`;
              }
              return label;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: energyLabel
          },
          suggestedMax: scaleMax * energyMultiplier, // max réel + 10%
          ticks: {
            callback: function(value) {
              return value.toFixed(4) + ' ' + energyUnit;
            }
          }
        }
      }
    }
  });
}

/**
 * Charger le graphique de comparaison avec les références
 */
function loadReferenceComparisonChart(monthlyEnergyKwh) {
  const ctx = document.getElementById('chart-reference-comparison');
  if (!ctx) return;
  
  const tiers = Object.values(REFERENCE_TIERS);
  const labels = tiers.map(t => t.name);
  const referenceData = tiers.map(t => t.monthly_kWh);
  const userData = new Array(tiers.length).fill(monthlyEnergyKwh);
  
  if (charts['reference-comparison']) {
    charts['reference-comparison'].destroy();
  }
  
  charts['reference-comparison'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Votre consommation',
          data: userData,
          backgroundColor: 'rgba(102, 126, 234, 0.8)',
          borderColor: '#667eea',
          borderWidth: 1
        },
        {
          label: 'Moyennes de référence',
          data: referenceData,
          backgroundColor: 'rgba(200, 200, 200, 0.6)',
          borderColor: '#999',
          borderWidth: 1,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Énergie (kWh/mois)'
          }
        }
      }
    }
  });
}

/**
 * Charger la comparaison des derniers prompts
 */
async function loadRecentPromptsComparison() {
  console.log('🚀 loadRecentPromptsComparison appelée');
  
  try {
    const loading = document.getElementById('compare-loading');
    const empty = document.getElementById('compare-empty');
    const results = document.getElementById('compare-results');
    
    console.log('📋 Éléments DOM:', {
      loading: !!loading,
      empty: !!empty,
      results: !!results
    });
    
    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (results) results.style.display = 'none';
    
    console.log('📊 Chargement des données locales...');
    // Charger les données locales (peut être dans dashboard.js)
    let loadDataFn = null;
    if (typeof loadLocalDatasetData === 'function') {
      loadDataFn = loadLocalDatasetData;
    } else if (window.loadLocalDatasetData) {
      loadDataFn = window.loadLocalDatasetData;
    } else {
      console.error('❌ loadLocalDatasetData non disponible');
      if (loading) loading.style.display = 'none';
      if (empty) {
        empty.innerHTML = `
          <p>❌ Erreur: Fonction loadLocalDatasetData non disponible</p>
          <p style="margin-top: 10px; font-size: 14px; color: #666;">
            Veuillez recharger la page.
          </p>
        `;
        empty.style.display = 'block';
      }
      return;
    }
    
    const data = await loadDataFn();
    
    console.log('📊 Données chargées pour comparaison:', {
      totalItems: data.length,
      sampleItems: data.slice(0, 3).map(d => ({
        timestamp: d.timestamp,
        platform: d.platform,
        tokens: (d.prompt_token_length || 0) + (d.response_token_length || 0),
        energy: d.energy_consumption_llm_total
      }))
    });
    
    if (!data || data.length === 0) {
      if (loading) loading.style.display = 'none';
      if (empty) {
        empty.innerHTML = `
          <p>📭 Aucune donnée disponible pour la comparaison.</p>
          <p style="margin-top: 10px; font-size: 14px; color: #666;">
            Utilisez l'extension sur ChatGPT, Claude ou Gemini pour collecter des données.
            <br><br>
            Les messages sont automatiquement scannés depuis <code>div[data-message-author-role]</code>.
          </p>
        `;
        empty.style.display = 'block';
      }
      return;
    }
    
    // Trier par timestamp (plus récent en premier) et prendre les 4 derniers
    const recentExchanges = data
      .map(exchange => {
        // Normaliser le timestamp (peut être un nombre ou une string)
        let normalizedTimestamp = typeof exchange.timestamp === 'number' 
          ? exchange.timestamp 
          : (typeof exchange.timestamp === 'string' 
              ? parseInt(exchange.timestamp) 
              : (exchange.id && exchange.id.includes('-') 
                  ? parseInt(exchange.id.split('-')[1]) 
                  : Date.now()));
        
        // Si le timestamp est invalide, utiliser Date.now() comme fallback
        if (!normalizedTimestamp || isNaN(normalizedTimestamp) || normalizedTimestamp <= 0) {
          normalizedTimestamp = Date.now();
        }
        
        return {
          ...exchange,
          normalizedTimestamp
        };
      })
      .sort((a, b) => (b.normalizedTimestamp || 0) - (a.normalizedTimestamp || 0))
      .slice(0, 4);
    
    console.log('📊 Derniers échanges sélectionnés:', {
      count: recentExchanges.length,
      exchanges: recentExchanges.map(e => ({
        timestamp: e.normalizedTimestamp,
        platform: e.platform,
        model: e.model_name || e.model,
        tokens: (e.prompt_token_length || 0) + (e.response_token_length || 0),
        energy: e.energy_consumption_llm_total,
        date: new Date(e.normalizedTimestamp).toLocaleString('fr-FR')
      }))
    });
    
    if (recentExchanges.length < 1) {
      if (loading) loading.style.display = 'none';
      if (empty) {
        empty.innerHTML = `
          <p>📭 Aucun échange valide trouvé.</p>
          <p style="margin-top: 10px; font-size: 14px; color: #666;">
            Les données collectées ne contiennent pas d'échanges valides avec des timestamps.
          </p>
        `;
        empty.style.display = 'block';
      }
      return;
    }
    
    // Afficher les résultats
    displayRecentPromptsComparison(recentExchanges);
    
    if (loading) loading.style.display = 'none';
    if (results) results.style.display = 'block';
  } catch (error) {
    console.error('Erreur chargement comparaison prompts:', error);
    const loading = document.getElementById('compare-loading');
    if (loading) {
      loading.innerHTML = `<div style="padding: 20px; color: red;">Erreur: ${error.message}</div>`;
      loading.style.display = 'block';
    }
  }
}

/**
 * Afficher la comparaison des derniers prompts
 */
function displayRecentPromptsComparison(exchanges) {
  const statsGrid = document.getElementById('compare-stats');
  const compareGrid = document.getElementById('compare-grid');
  const chartCanvas = document.getElementById('chart-compare-metrics');
  
  if (!statsGrid || !compareGrid) return;
  
  // Calculer les stats globales (avec recalcul si nécessaire)
  let totalEnergy = 0;
  exchanges.forEach((exchange, idx) => {
    let energy = parseFloat(exchange.energy_consumption_llm_total) || 0;
    const tokens = parseInt(exchange.prompt_token_length || 0) + parseInt(exchange.response_token_length || 0);
    const model = exchange.model_name || exchange.model || 'gpt-4';
    
    console.log(`📊 Échange ${idx + 1}:`, {
      energy,
      tokens,
      model,
      promptTokens: exchange.prompt_token_length || exchange.promptTokens,
      responseTokens: exchange.response_token_length || exchange.responseTokens
    });
    
    // Si pas d'énergie ou énergie très petite (< 0.01 Joules) mais qu'on a des tokens, recalculer
    // 0.01 Joules = 2.78e-9 kWh, ce qui est négligeable
    if ((energy === 0 || energy < 0.01) && tokens > 0) {
      const modelSizes = {
        'gpt-4': { base: 0.5, perToken: 0.0001 },
        'gpt-4-turbo': { base: 0.4, perToken: 0.00008 },
        'gpt-4o': { base: 0.45, perToken: 0.00009 },
        'gpt-3.5': { base: 0.1, perToken: 0.00005 },
        'claude-3-opus': { base: 0.6, perToken: 0.00012 },
        'claude-3-sonnet': { base: 0.3, perToken: 0.00008 },
        'claude-3-haiku': { base: 0.15, perToken: 0.00005 },
        'gemini-pro': { base: 0.2, perToken: 0.00006 },
        'default': { base: 0.2, perToken: 0.00006 }
      };
      
      let modelData = modelSizes.default;
      for (const [key, value] of Object.entries(modelSizes)) {
        if (model.toLowerCase().includes(key.toLowerCase())) {
          modelData = value;
          break;
        }
      }
      
      const promptTokens = parseInt(exchange.prompt_token_length || exchange.promptTokens || 0);
      const responseTokens = parseInt(exchange.response_token_length || exchange.responseTokens || 0);
      const oldEnergy = energy;
      energy = modelData.base + 
               (promptTokens * modelData.perToken * 0.3) + 
               (responseTokens * modelData.perToken * 1.0);
      energy = Math.max(0, energy);
      
      console.log(`✅ Énergie recalculée pour échange ${idx + 1}:`, {
        oldEnergy,
        newEnergy: energy,
        model,
        promptTokens,
        responseTokens,
        modelData
      });
    }
    
    totalEnergy += energy;
  });
  
  const totalTokens = exchanges.reduce((sum, e) => sum + (parseInt(e.prompt_token_length || 0) + parseInt(e.response_token_length || 0)), 0);
  const avgEnergy = totalEnergy / exchanges.length / 3600000; // en kWh
  const avgEnergyJoules = totalEnergy / exchanges.length; // en Joules
  
  console.log('📊 Stats calculées pour comparaison:', {
    totalEnergy,
    totalEnergyKwh: totalEnergy / 3600000,
    avgEnergy,
    avgEnergyJoules,
    exchangesCount: exchanges.length
  });
  
  // Formater l'énergie moyenne pour l'affichage
  let avgEnergyDisplay = '';
  let avgEnergySubtitle = '';
  if (avgEnergy < 0.0001) {
    if (avgEnergy < 1e-6) {
      avgEnergyDisplay = avgEnergy.toExponential(2);
      avgEnergySubtitle = `<div style="font-size: 0.8em; color: #666; margin-top: 5px;">(${avgEnergyJoules.toFixed(6)} J)</div>`;
    } else {
      avgEnergyDisplay = avgEnergy.toFixed(8);
      avgEnergySubtitle = `<div style="font-size: 0.8em; color: #666; margin-top: 5px;">(${avgEnergyJoules.toFixed(3)} J)</div>`;
    }
  } else {
    avgEnergyDisplay = avgEnergy.toFixed(4);
  }
  
  statsGrid.innerHTML = `
    <div class="stat-card">
      <h3>Nombre de Prompts</h3>
      <div class="value">${exchanges.length}</div>
    </div>
    <div class="stat-card">
      <h3>Énergie Moyenne</h3>
      <div class="value">${avgEnergyDisplay}</div>
      <span class="unit">kWh</span>
      ${avgEnergySubtitle}
    </div>
    <div class="stat-card">
      <h3>Total Tokens</h3>
      <div class="value">${totalTokens.toLocaleString()}</div>
    </div>
  `;
  
  // Afficher chaque prompt
  compareGrid.innerHTML = exchanges.map((exchange, index) => {
    let energy = parseFloat(exchange.energy_consumption_llm_total) || 0;
    const tokens = parseInt(exchange.prompt_token_length || 0) + parseInt(exchange.response_token_length || 0);
    
    // Normaliser le timestamp pour l'affichage
    let timestamp = exchange.timestamp || exchange.normalizedTimestamp;
    if (typeof timestamp === 'string') {
      timestamp = parseInt(timestamp);
    }
    if (!timestamp || isNaN(timestamp)) {
      // Essayer d'extraire depuis l'ID si présent
      if (exchange.id && exchange.id.includes('-')) {
        const parts = exchange.id.split('-');
        if (parts.length > 1) {
          timestamp = parseInt(parts[1]);
        }
      }
      if (!timestamp || isNaN(timestamp)) {
        timestamp = Date.now();
      }
    }
    
    const date = new Date(timestamp);
    
    // Si pas d'énergie ou énergie très petite (< 0.01 Joules) mais qu'on a des tokens, recalculer
    if ((energy === 0 || energy < 0.01) && tokens > 0) {
      const model = exchange.model_name || exchange.model || 'gpt-4';
      // Fonction simple de prédiction locale
      const modelSizes = {
        'gpt-4': { base: 0.5, perToken: 0.0001 },
        'gpt-4-turbo': { base: 0.4, perToken: 0.00008 },
        'gpt-4o': { base: 0.45, perToken: 0.00009 },
        'gpt-3.5': { base: 0.1, perToken: 0.00005 },
        'claude-3-opus': { base: 0.6, perToken: 0.00012 },
        'claude-3-sonnet': { base: 0.3, perToken: 0.00008 },
        'claude-3-haiku': { base: 0.15, perToken: 0.00005 },
        'gemini-pro': { base: 0.2, perToken: 0.00006 },
        'default': { base: 0.2, perToken: 0.00006 }
      };
      
      let modelData = modelSizes.default;
      for (const [key, value] of Object.entries(modelSizes)) {
        if (model.toLowerCase().includes(key.toLowerCase())) {
          modelData = value;
          break;
        }
      }
      
      const promptTokens = parseInt(exchange.prompt_token_length || exchange.promptTokens || 0);
      const responseTokens = parseInt(exchange.response_token_length || exchange.responseTokens || 0);
      const oldEnergy = energy;
      energy = modelData.base + 
               (promptTokens * modelData.perToken * 0.3) + 
               (responseTokens * modelData.perToken * 1.0);
      energy = Math.max(0, energy);
      
      console.log(`✅ Énergie recalculée pour prompt #${exchanges.length - index}:`, {
        oldEnergy,
        newEnergy: energy,
        model,
        promptTokens,
        responseTokens
      });
    }
    
    const energyKwh = energy / 3600000;
    const co2Kg = (energyKwh * 480) / 1000;
    
    // Formater l'énergie pour l'affichage
    let energyDisplay = '';
    if (energyKwh < 0.0001) {
      // Très petite valeur, afficher en notation scientifique ou en mJ
      if (energyKwh < 1e-6) {
        energyDisplay = `${energyKwh.toExponential(2)} kWh <span style="font-size: 0.9em; color: #666;">(${energy.toFixed(6)} J)</span>`;
      } else {
        energyDisplay = `${energyKwh.toFixed(8)} kWh <span style="font-size: 0.9em; color: #666;">(${(energy * 1000).toFixed(3)} mJ)</span>`;
      }
    } else {
      energyDisplay = `${energyKwh.toFixed(4)} kWh`;
    }
    
    // Formater le CO₂ pour l'affichage
    let co2Display = '';
    if (co2Kg < 0.0001) {
      if (co2Kg < 1e-6) {
        co2Display = `${co2Kg.toExponential(2)} kg <span style="font-size: 0.9em; color: #666;">(${(co2Kg * 1000).toFixed(6)} g)</span>`;
      } else {
        co2Display = `${co2Kg.toFixed(8)} kg <span style="font-size: 0.9em; color: #666;">(${(co2Kg * 1000).toFixed(3)} g)</span>`;
      }
    } else {
      co2Display = `${co2Kg.toFixed(4)} kg`;
    }
    
    return `
      <div style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h4 style="margin-bottom: 15px;">Prompt #${exchanges.length - index}</h4>
        <div style="margin-bottom: 10px;">
          <strong>Date:</strong> ${date.toLocaleDateString('fr-FR')} ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Plateforme:</strong> ${exchange.platform || 'Unknown'}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Modèle:</strong> ${exchange.model_name || exchange.model || 'Unknown'}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Tokens:</strong> ${tokens.toLocaleString()}
        </div>
        <div style="margin-bottom: 10px;">
          <strong>Énergie:</strong> <span style="font-weight: 600;">${energyDisplay}</span>
        </div>
        <div>
          <strong>CO₂:</strong> <span style="font-weight: 600;">${co2Display}</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Créer le graphique de comparaison
  if (chartCanvas) {
    const labels = exchanges.map((_, i) => `Prompt #${exchanges.length - i}`);
    
    // Recalculer l'énergie pour le graphique aussi
    const energyData = exchanges.map(e => {
      let energy = parseFloat(e.energy_consumption_llm_total) || 0;
      const tokens = parseInt(e.prompt_token_length || 0) + parseInt(e.response_token_length || 0);
      
      // Si pas d'énergie ou énergie très petite, recalculer
      if ((energy === 0 || energy < 0.01) && tokens > 0) {
        const model = e.model_name || e.model || 'gpt-4';
        const modelSizes = {
          'gpt-4': { base: 0.5, perToken: 0.0001 },
          'gpt-4-turbo': { base: 0.4, perToken: 0.00008 },
          'gpt-3.5': { base: 0.1, perToken: 0.00005 },
          'claude-3-opus': { base: 0.6, perToken: 0.00012 },
          'claude-3-sonnet': { base: 0.3, perToken: 0.00008 },
          'claude-3-haiku': { base: 0.15, perToken: 0.00005 },
          'gemini-pro': { base: 0.2, perToken: 0.00006 },
          'default': { base: 0.2, perToken: 0.00006 }
        };
        
        let modelData = modelSizes.default;
        for (const [key, value] of Object.entries(modelSizes)) {
          if (model.toLowerCase().includes(key.toLowerCase())) {
            modelData = value;
            break;
          }
        }
        
        const promptTokens = parseInt(e.prompt_token_length || 0);
        const responseTokens = parseInt(e.response_token_length || 0);
        energy = modelData.base + 
                 (promptTokens * modelData.perToken * 0.3) + 
                 (responseTokens * modelData.perToken * 1.0);
        energy = Math.max(0, energy);
      }
      
      return energy / 3600000;
    });
    
    const tokensData = exchanges.map(e => parseInt(e.prompt_token_length || 0) + parseInt(e.response_token_length || 0));
    
    if (charts['compare-metrics']) {
      charts['compare-metrics'].destroy();
    }
    
    charts['compare-metrics'] = new Chart(chartCanvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Énergie (kWh)',
            data: energyData,
            backgroundColor: 'rgba(102, 126, 234, 0.8)',
            yAxisID: 'y'
          },
          {
            label: 'Tokens',
            data: tokensData,
            backgroundColor: 'rgba(118, 75, 162, 0.8)',
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
            position: 'left',
            title: {
              display: true,
              text: 'Énergie (kWh)'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Tokens'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });
  }
}

/**
 * Charger la comparaison énergétique avec les paliers
 */
async function loadEnergyComparisonNew() {
  try {
    const loading = document.getElementById('energy-loading');
    const empty = document.getElementById('energy-empty');
    const results = document.getElementById('energy-comparison-results');
    
    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (results) results.style.display = 'none';
    
    // Charger les données locales
    const data = await loadLocalDatasetData();
    
    if (!data || data.length === 0) {
      if (loading) loading.style.display = 'none';
      if (empty) empty.style.display = 'block';
      return;
    }
    
    // Calculer la consommation mensuelle
    const totalEnergyJoules = data.reduce((sum, e) => sum + (parseFloat(e.energy_consumption_llm_total) || 0), 0);
    const totalEnergyKwh = totalEnergyJoules / 3600000;
    
    const timestamps = data.map(d => d.timestamp || Date.now()).filter(Boolean);
    const minTimestamp = Math.min(...timestamps);
    const maxTimestamp = Math.max(...timestamps);
    const daysDiff = Math.max(1, (maxTimestamp - minTimestamp) / (1000 * 60 * 60 * 24));
    const monthlyEnergyKwh = (totalEnergyKwh / daysDiff) * 30;
    
    console.log('📊 Calcul consommation mensuelle:', {
      totalEnergyJoules,
      totalEnergyKwh,
      daysDiff,
      monthlyEnergyKwh,
      dataLength: data.length
    });
    
    // Obtenir le mix énergétique sélectionné
    const mixSelect = document.getElementById('filter-energy-mix');
    const selectedMix = mixSelect ? mixSelect.value : 'global_average';
    const intensity = carbonIntensityData?.countries?.[selectedMix]?.intensity || 480;
    
    // Créer les graphiques
    createEnergyComparisonChart(monthlyEnergyKwh);
    createCO2PaliersChart(monthlyEnergyKwh, intensity);
    displayPaliersDetails(monthlyEnergyKwh, intensity);
    
    if (loading) loading.style.display = 'none';
    if (results) results.style.display = 'block';
  } catch (error) {
    console.error('Erreur chargement comparaison énergétique:', error);
    const loading = document.getElementById('energy-loading');
    if (loading) {
      loading.innerHTML = `<div style="padding: 20px; color: red;">Erreur: ${error.message}</div>`;
      loading.style.display = 'block';
    }
  }
}

/**
 * Créer le graphique de comparaison énergétique
 */
function createEnergyComparisonChart(monthlyEnergyKwh) {
  const ctx = document.getElementById('chart-energy-comparison');
  if (!ctx) {
    console.warn('⚠️ Canvas chart-energy-comparison non trouvé');
    return;
  }
  
  // Vérifier que monthlyEnergyKwh est valide
  if (!monthlyEnergyKwh || isNaN(monthlyEnergyKwh) || monthlyEnergyKwh < 0) {
    console.warn('⚠️ monthlyEnergyKwh invalide:', monthlyEnergyKwh);
    monthlyEnergyKwh = 0;
  }
  
  const tiers = Object.values(REFERENCE_TIERS);
  const labels = tiers.map(t => t.name);
  const referenceData = tiers.map(t => t.monthly_kWh);
  // Créer un tableau avec la valeur de l'utilisateur pour chaque palier
  const userData = tiers.map(() => monthlyEnergyKwh);
  
  console.log('📊 Création graphique comparaison:', {
    monthlyEnergyKwh,
    userData,
    referenceData,
    labels
  });
  
  if (charts['energy-comparison']) {
    charts['energy-comparison'].destroy();
  }
  
  charts['energy-comparison'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Votre consommation',
          data: userData,
          backgroundColor: 'rgba(102, 126, 234, 0.8)',
          borderColor: '#667eea',
          borderWidth: 2,
          order: 1 // Afficher en premier (devant)
        },
        {
          label: 'Moyennes de référence',
          data: referenceData,
          backgroundColor: 'rgba(200, 200, 200, 0.6)',
          borderColor: '#999',
          borderWidth: 1,
          borderDash: [5, 5],
          order: 2 // Afficher en second (derrière)
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top'
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Énergie (kWh/mois)'
          }
        },
        x: {
          stacked: false // Ne pas empiler les barres
        }
      }
    }
  });
}

/**
 * Créer le graphique CO₂ par paliers
 */
function createCO2PaliersChart(monthlyEnergyKwh, intensity) {
  const ctx = document.getElementById('chart-co2-paliers');
  if (!ctx) return;
  
  const tiers = Object.values(REFERENCE_TIERS);
  const labels = tiers.map(t => t.name);
  const referenceCO2 = tiers.map(t => (t.monthly_kWh * intensity) / 1000); // en kg
  const userCO2 = new Array(tiers.length).fill((monthlyEnergyKwh * intensity) / 1000);
  
  if (charts['co2-paliers']) {
    charts['co2-paliers'].destroy();
  }
  
  charts['co2-paliers'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Votre CO₂',
          data: userCO2,
          backgroundColor: 'rgba(255, 99, 132, 0.8)',
          borderColor: '#F44336',
          borderWidth: 1
        },
        {
          label: 'CO₂ de référence',
          data: referenceCO2,
          backgroundColor: 'rgba(200, 200, 200, 0.6)',
          borderColor: '#999',
          borderWidth: 1,
          borderDash: [5, 5]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'CO₂ (kg/mois)'
          }
        }
      }
    }
  });
}

/**
 * Afficher les détails des paliers
 */
function displayPaliersDetails(monthlyEnergyKwh, intensity) {
  const detailsEl = document.getElementById('paliers-details');
  if (!detailsEl) return;
  
  const tiers = Object.values(REFERENCE_TIERS);
  const userTier = tiers.find(t => monthlyEnergyKwh <= t.monthly_kWh) || tiers[tiers.length - 1];
  
  detailsEl.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
      ${tiers.map(tier => {
        const isUserTier = tier === userTier;
        const diff = monthlyEnergyKwh - tier.monthly_kWh;
        const diffPercent = tier.monthly_kWh > 0 ? ((diff / tier.monthly_kWh) * 100).toFixed(1) : 0;
        
        return `
          <div style="padding: 15px; border-radius: 8px; border: 2px solid ${isUserTier ? tier.color : '#ddd'}; background: ${isUserTier ? tier.color + '15' : '#f8f9fa'};">
            <div style="font-weight: 600; margin-bottom: 8px; color: ${tier.color};">${tier.name}</div>
            <div style="font-size: 12px; color: #666; margin-bottom: 10px;">${tier.description}</div>
            <div style="margin-bottom: 5px;"><strong>Référence:</strong> ${tier.monthly_kWh} kWh/mois</div>
            <div style="margin-bottom: 5px;"><strong>CO₂:</strong> ${((tier.monthly_kWh * intensity) / 1000).toFixed(3)} kg/mois</div>
            ${isUserTier ? `<div style="margin-top: 10px; padding: 8px; background: ${tier.color}; color: white; border-radius: 4px; font-size: 12px; text-align: center;">Votre palier actuel</div>` : ''}
            ${!isUserTier ? `<div style="margin-top: 5px; font-size: 11px; color: #666;">Différence: ${diff > 0 ? '+' : ''}${diff.toFixed(2)} kWh (${diffPercent > 0 ? '+' : ''}${diffPercent}%)</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Fonction pour initialiser les event listeners
function initEventListeners() {
  console.log('🔧 Initialisation des event listeners pour dashboard-enhancements.js');
  
  const btnLoadRecent = document.getElementById('btn-load-recent-prompts');
  if (btnLoadRecent) {
    // Retirer l'ancien listener s'il existe
    btnLoadRecent.removeEventListener('click', loadRecentPromptsComparison);
    // Ajouter le nouveau listener
    btnLoadRecent.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('🖱️ Bouton "Charger les Derniers Prompts" cliqué');
      loadRecentPromptsComparison();
    });
    console.log('✅ Listener ajouté sur btn-load-recent-prompts');
  } else {
    console.warn('⚠️ Bouton btn-load-recent-prompts non trouvé');
  }
  
  const btnLoadEnergy = document.getElementById('btn-load-energy-comparison');
  if (btnLoadEnergy) {
    btnLoadEnergy.removeEventListener('click', loadEnergyComparisonNew);
    btnLoadEnergy.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('🖱️ Bouton "Charger Comparaison Énergétique" cliqué');
      if (typeof loadEnergyComparisonNew === 'function') {
        loadEnergyComparisonNew();
      }
    });
    console.log('✅ Listener ajouté sur btn-load-energy-comparison');
  }
  
  // Event listener pour le sélecteur de scénario
  const scenarioSelect = document.getElementById('scenario-select');
  if (scenarioSelect) {
    scenarioSelect.addEventListener('change', () => {
      // Recharger le graphique avec le nouveau scénario
      if (typeof loadConsumptionTrendChart === 'function') {
        loadConsumptionTrendChart();
      }
    });
  }
}

// Ajouter les event listeners au chargement (si DOM pas encore chargé)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initEventListeners);
} else {
  // DOM déjà chargé, initialiser immédiatement
  initEventListeners();
  
  // Réessayer après un court délai au cas où les éléments ne seraient pas encore créés
  setTimeout(() => {
    const btnLoadRecent = document.getElementById('btn-load-recent-prompts');
    if (btnLoadRecent && !btnLoadRecent.hasAttribute('data-listener-added')) {
      btnLoadRecent.setAttribute('data-listener-added', 'true');
      initEventListeners();
    }
  }, 500);
}

// Exposer la fonction globalement pour qu'elle soit accessible depuis dashboard.js
window.loadRecentPromptsComparison = loadRecentPromptsComparison;

