document.addEventListener('DOMContentLoaded', function() {
    if (!window.app) return;
  
    // Fix the original generateSummary function if it hasn't been fixed already
    if (!app.originalGenerateSummary) {
      app.originalGenerateSummary = app.generateSummary;
      
      app.generateSummary = function(material) {
        console.log("Fixed generateSummary called for material:", material?.name);
        
        if (!material) {
          console.error("No material provided for summary generation");
          return;
        }
        
        // Get required elements
        const summaryContent = document.getElementById('summary-content');
        const loadingSpinner = summaryContent?.querySelector('.loading-spinner');
        const summaryText = document.getElementById('summary-text');
        
        if (!summaryText) {
          console.error("Summary text element not found");
          // Create the element if it doesn't exist
          const container = document.getElementById('summary-content');
          if (container) {
            const newSummaryText = document.createElement('div');
            newSummaryText.id = 'summary-text';
            container.appendChild(newSummaryText);
            console.log("Created missing summary-text element");
          }
        }
        
        // Show loading state
        if (loadingSpinner) {
          loadingSpinner.classList.remove('hidden');
        } else {
          console.log("Loading spinner not found, creating one");
          
          // Create a loading spinner if it doesn't exist
          if (summaryContent && !summaryContent.querySelector('.loading-spinner')) {
            const spinner = document.createElement('div');
            spinner.className = 'loading-spinner';
            spinner.innerHTML = '<i class="fas fa-spinner fa-spin"></i><p>Zusammenfassung wird erstellt...</p>';
            summaryContent.insertBefore(spinner, summaryContent.firstChild);
          }
        }
        
        // Original function logic
        try {
          this.originalGenerateSummary(material);
        } catch (error) {
          console.error("Error in original generateSummary:", error);
          // Fallback error handling
          if (summaryText) {
            summaryText.innerHTML = `
              <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Fehler bei der Zusammenfassung: ${error.message || "Unbekannter Fehler"}</p>
                <button class="btn-primary retry-summary">Erneut versuchen</button>
              </div>
            `;
            
            // Add event listener to retry button
            const retryBtn = summaryText.querySelector('.retry-summary');
            if (retryBtn) {
              retryBtn.addEventListener('click', () => this.generateSummary(material));
            }
          }
        }
      };
    }
  });
  
  console.log("Summary fixes loaded");