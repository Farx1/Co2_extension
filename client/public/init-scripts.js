/**
 * Initialisation des scripts Watsonx
 * Ce fichier est chargé directement depuis dashboard.html
 * Il charge ensuite les autres scripts dans le bon ordre
 */

(function() {
  // Vérifier que chrome.runtime est disponible
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    console.log('🔵 init-scripts.js: Démarrage du chargement des scripts');
    
    const watsonxConfigScript = document.createElement('script');
    watsonxConfigScript.src = chrome.runtime.getURL('watsonx-config.js');
    watsonxConfigScript.onload = () => {
      console.log('✓ watsonx-config.js chargé');
      
      const watsonxServiceScript = document.createElement('script');
      watsonxServiceScript.src = chrome.runtime.getURL('watsonx-service.js');
      watsonxServiceScript.type = 'text/javascript';
      watsonxServiceScript.onerror = (error) => {
        console.error('❌ Erreur chargement watsonx-service.js:', error);
        console.error('Détails:', error.message, error.filename, error.lineno);
        loadDashboard();
      };
      watsonxServiceScript.onload = () => {
        console.log('✓ watsonx-service.js chargé (onload déclenché)');
        console.log('🔍 Vérification immédiate de window.WatsonxService:', typeof window.WatsonxService);
        
        // Charger le prédicteur Random Forest après watsonx-service
        const randomForestScript = document.createElement('script');
        randomForestScript.src = chrome.runtime.getURL('random-forest-predictor.js');
        randomForestScript.onload = () => {
          console.log('✓ random-forest-predictor.js chargé');
          
          // Charger le prédicteur serveur après Random Forest
          const serverPredictorScript = document.createElement('script');
          serverPredictorScript.src = chrome.runtime.getURL('server-predictor.js');
          serverPredictorScript.onload = () => {
            console.log('✓ server-predictor.js chargé');
          };
          serverPredictorScript.onerror = (error) => {
            console.warn('⚠️ Erreur chargement server-predictor.js:', error);
          };
          document.head.appendChild(serverPredictorScript);
        };
        randomForestScript.onerror = (error) => {
          console.warn('⚠️ Erreur chargement random-forest-predictor.js:', error);
        };
        document.head.appendChild(randomForestScript);
        
        // Attendre plus longtemps pour que le script s'exécute complètement
        setTimeout(() => {
          console.log('🔍 Vérification après 1s de window.WatsonxService:', typeof window.WatsonxService);
          if (window.WatsonxService) {
            console.log('✓ WatsonxService disponible');
            loadDashboard();
          } else {
            console.warn('⚠️ WatsonxService non disponible après 1s, nouvelle tentative...');
            // Attendre encore un peu
            setTimeout(() => {
              console.log('🔍 Vérification après 2s de window.WatsonxService:', typeof window.WatsonxService);
              if (window.WatsonxService) {
                console.log('✓ WatsonxService disponible après 2s');
                loadDashboard();
              } else {
                console.error('❌ WatsonxService toujours non disponible après 2s');
                console.error('Vérifiez la console pour des erreurs dans watsonx-service.js');
                // Vérifier si le script a des erreurs
                const scripts = document.querySelectorAll('script[src*="watsonx-service.js"]');
                console.log('🔍 Scripts watsonx-service.js trouvés:', scripts.length);
                scripts.forEach((script, index) => {
                  console.log(`  Script ${index}:`, script.src, 'Erreur:', script.onerror ? 'Oui' : 'Non');
                });
                // Charger dashboard.js quand même
                loadDashboard();
              }
            }, 1000);
          }
        }, 1000);
      };
      
      function loadDashboard() {
        // Vérifier si dashboard.js n'est pas déjà chargé
        if (document.querySelector('script[src*="dashboard.js"]')) {
          console.log('✓ dashboard.js déjà chargé');
          return;
        }
        
        const dashboardScript = document.createElement('script');
        dashboardScript.src = chrome.runtime.getURL('dashboard.js');
        dashboardScript.onload = () => {
          console.log('✓ dashboard.js chargé');
          // Charger dashboard-enhancements.js après dashboard.js
          const enhancementsScript = document.createElement('script');
          enhancementsScript.src = chrome.runtime.getURL('dashboard-enhancements.js');
          enhancementsScript.onload = () => {
            console.log('✓ dashboard-enhancements.js chargé');
          };
          enhancementsScript.onerror = (error) => {
            console.error('❌ Erreur chargement dashboard-enhancements.js:', error);
          };
          document.head.appendChild(enhancementsScript);
        };
        dashboardScript.onerror = (error) => {
          console.error('❌ Erreur chargement dashboard.js:', error);
        };
        document.head.appendChild(dashboardScript);
      }
      document.head.appendChild(watsonxServiceScript);
    };
    watsonxConfigScript.onerror = (error) => {
      console.error('❌ Erreur chargement watsonx-config.js:', error);
      // Essayer de charger watsonx-service.js quand même
      const watsonxServiceScript = document.createElement('script');
      watsonxServiceScript.src = chrome.runtime.getURL('watsonx-service.js');
      watsonxServiceScript.onload = () => {
        const dashboardScript = document.createElement('script');
        dashboardScript.src = chrome.runtime.getURL('dashboard.js');
        dashboardScript.onload = () => {
          // Charger dashboard-enhancements.js après dashboard.js
          const enhancementsScript = document.createElement('script');
          enhancementsScript.src = chrome.runtime.getURL('dashboard-enhancements.js');
          document.head.appendChild(enhancementsScript);
        };
        document.head.appendChild(dashboardScript);
      };
      document.head.appendChild(watsonxServiceScript);
    };
    document.head.appendChild(watsonxConfigScript);
  } else {
    console.error('❌ chrome.runtime.getURL non disponible');
    // Charger dashboard.js quand même
    const dashboardScript = document.createElement('script');
    dashboardScript.src = 'dashboard.js';
    dashboardScript.onload = () => {
      const enhancementsScript = document.createElement('script');
      enhancementsScript.src = 'dashboard-enhancements.js';
      document.head.appendChild(enhancementsScript);
    };
    document.head.appendChild(dashboardScript);
  }
})();

