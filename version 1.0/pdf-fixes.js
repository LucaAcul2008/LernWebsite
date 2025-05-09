// pdf-fixes.js - PDF rendering error handling and improvements
document.addEventListener('DOMContentLoaded', function() {
    if (!window.app) return;
    
    // Enhanced PDF opening with error handling
    const originalOpenMaterial = app.openMaterial;
    app.openMaterial = function(materialId) {
      console.log(`Enhanced openMaterial called for: ${materialId}`);
      
      // Find the material
      const material = this.materials.find(m => m.id === materialId);
      if (!material) {
        console.error(`Material with ID ${materialId} not found`);
        this.showNotification("Error", "Material nicht gefunden", "error");
        return;
      }
      
      // Set current material
      this.currentMaterial = material;
      
      // Show the material viewer page first to ensure elements exist
      this.showPage('material-viewer');
      
      // Update material title with safety check
      const titleElement = document.getElementById('material-title');
      if (titleElement) {
        titleElement.textContent = material.name;
      }
      
      // Update button state based on completion
      const completeBtn = document.getElementById('mark-completed-btn');
      if (completeBtn) {
        completeBtn.innerHTML = material.completed ? 
          '<i class="fas fa-times"></i> Als unvollständig markieren' :
          '<i class="fas fa-check"></i> Als abgeschlossen markieren';
      }
      
      // Show PDF loading state
      const pdfContainer = document.getElementById('pdf-renderer');
      if (pdfContainer) {
        pdfContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>PDF wird geladen...</p></div>';
      }
      
      // Load notes with safety check
      const notesEditor = document.getElementById('notes-editor');
      if (notesEditor) {
        notesEditor.value = material.notes || '';
      }
      
      // Check and show summary if it exists
      console.log("Material has summary?", !!material.summary);
      const summaryText = document.getElementById("summary-text");
      if (summaryText) {
        if (material.summary) {
          summaryText.innerHTML = typeof marked !== 'undefined' ? 
            marked.parse(material.summary) : material.summary;
        } else {
          summaryText.innerHTML = `
            <div class="empty-state">
              <p>Noch keine Zusammenfassung vorhanden.</p>
              <button class="btn-primary" onclick="app.generateSummary(app.currentMaterial)">
                <i class="fas fa-magic"></i> Zusammenfassung erstellen
              </button>
            </div>
          `;
        }
      }
      
      // Try to get PDF data from IndexedDB or show error
      this.getPdfFromIndexedDB(material.id)
        .then(fileData => {
          if (!fileData) {
            throw new Error("No PDF data available");
          }
          material.fileData = fileData;
          this.renderPdf(material);
        })
        .catch(err => {
          console.error("Error retrieving PDF data:", err);
          if (pdfContainer) {
            pdfContainer.innerHTML = `
              <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Fehler beim Öffnen des Dokuments: ${err.message || 'Unbekannter Fehler'}</p>
                <p>Versuche das PDF erneut hochzuladen.</p>
              </div>
            `;
          }
        });
    };
  });