document.addEventListener('DOMContentLoaded', function() {
    if (!window.app) {
      console.error("App object not found");
      return;
    }
  
    // Replace the initIndexedDB method with a version-aware implementation
    app.initIndexedDB = function() {
      console.log("Enhanced IndexedDB initialization");
      
      return new Promise((resolve, reject) => {
        // First, try to detect the current version
        const checkRequest = window.indexedDB.open("StudyCompanionDB");
        
        checkRequest.onsuccess = (event) => {
          const db = event.target.result;
          const currentVersion = db.version;
          db.close();
          
          console.log("Detected existing database version:", currentVersion);
          
          // Now open with the correct version and increment if needed
          const version = currentVersion + 1; // Increment version to force upgrade
          const request = window.indexedDB.open("StudyCompanionDB", version);
          
          request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject(event.target.error || new Error("Failed to open database"));
          };
          
          request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create object stores if they don't exist
            if (!db.objectStoreNames.contains("pdfs")) {
              console.log("Creating pdfs object store");
              db.createObjectStore("pdfs", { keyPath: "id" });
            }
            
            if (!db.objectStoreNames.contains("summaries")) {
              console.log("Creating summaries object store");
              db.createObjectStore("summaries", { keyPath: "id" });
            }
          };
          
          request.onsuccess = (event) => {
            this.db = event.target.result;
            console.log("IndexedDB initialized successfully with version:", this.db.version);
            
            // Double check that our stores exist
            if (!Array.from(this.db.objectStoreNames).includes('pdfs')) {
              console.error("pdfs object store still doesn't exist!");
              this.db.close();
              // Force database deletion and recreation as a last resort
              const deleteRequest = indexedDB.deleteDatabase("StudyCompanionDB");
              deleteRequest.onsuccess = () => {
                console.log("Database deleted, will recreate");
                this.initIndexedDB().then(resolve).catch(reject);
              };
              return;
            }
            
            resolve(this.db);
          };
        };
        
        checkRequest.onerror = (event) => {
          console.error("Error checking database version:", event.target.error);
          reject(event.target.error);
        };
      });
    };
    
    // Enhanced PDF storage method
    const originalSavePdf = app.savePdfToIndexedDB;
    app.savePdfToIndexedDB = function(materialId, fileData) {
      console.log("Enhanced savePdfToIndexedDB called for material:", materialId);
      
      if (!this.db) {
        console.log("Database not initialized, initializing now...");
        return this.initIndexedDB()
          .then(() => originalSavePdf.call(this, materialId, fileData))
          .catch(error => {
            console.error("Failed to initialize database:", error);
            this.showNotification("Storage Error", "Failed to store PDF data. Please try again.", "error");
            throw error;
          });
      }
      
      return originalSavePdf.call(this, materialId, fileData);
    };
  
    // Fix the generateSummary function to avoid null element errors
    const originalGenerateSummary = app.generateSummary;
    app.generateSummary = function(material) {
      console.log("Enhanced generateSummary called for material:", material?.name);
      
      // Get the elements
      const summaryContent = document.getElementById('summary-content');
      const loadingSpinner = summaryContent?.querySelector('.loading-spinner');
      const summaryText = document.getElementById('summary-text');
      
      if (!summaryContent || !summaryText) {
        console.error("Required summary elements not found in the DOM");
        this.showNotification("Error", "Zusammenfassung kann nicht erstellt werden", "error");
        return;
      }
      
      // Show loading spinner
      if (loadingSpinner) loadingSpinner.classList.remove("hidden");
      summaryText.innerHTML = "";
      
      console.log("Material has summary?", !!material?.summary);
      
      // Call your API
      this.callOllamaAPI({
        action: "summarize",
        material: {
          id: material.id,
          name: material.name,
          content: material.content.substring(0, 20000), // Increased token limit
        },
      })
      .then((response) => {
        if (!response || !response.success) {
          throw new Error("Failed to generate summary");
        }
  
        material.summary = response.summary;
  
        // Hide loading spinner
        if (loadingSpinner) {
          loadingSpinner.classList.add("hidden");
        }
            
        // Use marked.js to parse markdown to HTML
        if (summaryText) {
          summaryText.innerHTML = typeof marked !== 'undefined' ? 
            marked.parse(material.summary) : material.summary;
        }
  
        // Save the updated material
        this.saveData();
      })
      .catch((error) => {
        console.error("Error generating summary:", error);
        if (loadingSpinner) {
          loadingSpinner.classList.add("hidden");
        }
        
        if (summaryText) {
          summaryText.innerHTML = `
            <div class="error-message">
              <i class="fas fa-exclamation-triangle"></i>
              <p>Fehler bei der Zusammenfassung: ${error.message || "Unbekannter Fehler"}</p>
              <button class="btn-primary retry-summary" onclick="app.generateSummary(app.currentMaterial)">
                Erneut versuchen
              </button>
            </div>
          `;
        }
      });
    };
  });
  
  console.log("IndexedDB fixes loaded");