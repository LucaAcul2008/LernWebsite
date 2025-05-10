const originalFetch = window.fetch;
window.fetch = function (url, options) {
  if (typeof url === "string" && url.includes("/api/ollama")) {
    console.warn("REDIRECTED API CALL: Using /api/ai instead of /api/ollama");
    url = url.replace("/api/ollama", "/api/ai");
  }
  return originalFetch(url, options);
};

document.addEventListener("DOMContentLoaded", function () {
  console.log("DOMContentLoaded (app.js): Event gefeuert.");

  // Definiere alle Eigenschaften und Methoden, für die app.js zuständig ist
  const appCoreLogic = {
    materials: [],
    quizzes: [],
    exams: [],
    currentMaterial: null,
    currentQuiz: null,
    wrongQuestions: [],
    apiEndpoint: "http://localhost:3000", // Points to your local Ollama server
    db: null, // Für die IndexedDB Instanz
    _eventListenersInitialized: false, // Add this flag

    init: function () {
      console.log("App init: Initialisiere App...");
      this.loadData();
      this.initIndexedDB().then(() => {
        console.log("App init: IndexedDB initialisiert, lade PDF-Daten.");
        this.loadPdfDataFromIndexedDB();
      }).catch(error => {
        console.error("App init: Fehler bei der Initialisierung von IndexedDB:", error);
      });
      this.updateUI();
      this.showPage("dashboard");
      this.setupEventListeners(); // Called in init
      this.updatePomodoroTasksDropdown();
      console.log("App init: App Initialisierung abgeschlossen.");
    },
    

    loadData: function () {
      // Deine loadData Implementierung (siehe #attachment_app_js_context_1 Zeile 30)
      try {
        const materials = localStorage.getItem("study-materials");
        const quizzes = localStorage.getItem("study-quizzes");
        const exams = localStorage.getItem("study-exams");
        const wrongQuestions = localStorage.getItem("wrong-questions");

        if (materials) this.materials = JSON.parse(materials);
        if (quizzes) this.quizzes = JSON.parse(quizzes);
        if (exams) this.exams = JSON.parse(exams);
        if (wrongQuestions) this.wrongQuestions = JSON.parse(wrongQuestions);

        this.loadPdfDataFromIndexedDB();
      } catch (err) {
        console.error("Error loading data:", err);
        this.showNotification("Error", "Fehler beim Laden der Daten", "error");
      }
    },

    saveData: function () {
      try {
        // Check material sizes before saving
        this.materials.forEach((m) => {
          if (m.summary) {
            console.log(
              `Material summary size for ${m.name}: ${m.summary.length} characters`
            );
          }
        });

        // Create copies of the data without the large PDF content for localStorage
        const materialsCopy = this.materials.map((material) => {
          // Create a copy without the large fileData property
          const { fileData, ...materialWithoutFile } = material;
          return materialWithoutFile;
        });

        // Try to save and log the size
        const json = JSON.stringify(materialsCopy);
        console.log(`Total materials data size: ${json.length} bytes`);

        localStorage.setItem("study-materials", json);
        localStorage.setItem("study-quizzes", JSON.stringify(this.quizzes));
        localStorage.setItem("study-exams", JSON.stringify(this.exams));
        localStorage.setItem(
          "wrong-questions",
          JSON.stringify(this.wrongQuestions)
        );

        return true;
      } catch (err) {
        console.error("Error saving data:", err);
        this.showNotification(
          "Error",
          "Speicherlimit überschritten. Die Daten konnten nicht gespeichert werden.",
          "error"
        );
        return false;
      }
    },

    // Update your savePdfToIndexedDB function
    savePdfToIndexedDB: function (materialId, fileData) {
      console.log("Saving PDF to IndexedDB:", materialId);
      return this.initIndexedDB().then((db) => {
        return new Promise((resolve, reject) => {
          try {
            const transaction = db.transaction(["pdfs"], "readwrite");
            const store = transaction.objectStore("pdfs");

            console.log("Putting PDF data in store, size:", fileData.length);
            const request = store.put({ id: materialId, data: fileData });

            request.onsuccess = () => {
              console.log("PDF saved successfully to IndexedDB");
              resolve(true);
            };

            request.onerror = (event) => {
              console.error("Error saving PDF:", event.target.error);
              reject(event.target.error);
            };
          } catch (error) {
            console.error("Transaction error in savePdfToIndexedDB:", error);
            reject(error);
          }
        });
      });
    },

    // Update your getPdfFromIndexedDB function
    getPdfFromIndexedDB: function (materialId) {
      console.log("Getting PDF from IndexedDB:", materialId);
      return this.initIndexedDB().then((db) => {
        return new Promise((resolve, reject) => {
          try {
            const transaction = db.transaction(["pdfs"], "readonly");
            const store = transaction.objectStore("pdfs");
            const request = store.get(materialId);

            request.onsuccess = (event) => {
              const result = event.target.result;
              if (result && result.data) {
                console.log(
                  "PDF retrieved successfully, size:",
                  result.data.length
                );
                resolve(result.data);
              } else {
                console.warn("PDF not found in IndexedDB:", materialId);
                resolve(null);
              }
            };

            request.onerror = (event) => {
              console.error("Error retrieving PDF:", event.target.error);
              reject(event.target.error);
            };
          } catch (error) {
            console.error("Transaction error in getPdfFromIndexedDB:", error);
            reject(error);
          }
        });
      });
    },

    openMaterial: function (materialId) {
      console.log("Opening material:", materialId);
      const material = this.materials.find((m) => m.id === materialId);
      if (!material) {
        console.error("Material not found:", materialId);
        this.showNotification("Error", "Material nicht gefunden", "error");
        return;
      }

      this.currentMaterial = material;
      this.showPage("material-viewer");

      const materialTitleEl = document.getElementById("material-title");
      if (materialTitleEl) {
        materialTitleEl.textContent = material.name;
      } else {
        console.warn("Element 'material-title' nicht gefunden.");
      }

      const completeBtn = document.getElementById("mark-completed-btn");
      if (completeBtn) {
        completeBtn.innerHTML = material.completed
          ? '<i class="fas fa-times"></i> Als unvollständig markieren'
          : '<i class="fas fa-check"></i> Als abgeschlossen markieren';
        completeBtn.disabled = false;
      } else {
        console.warn("Element 'mark-completed-btn' nicht gefunden.");
      }

      const notesEditor = document.getElementById("notes-editor");
      if (notesEditor) {
        notesEditor.value = material.notes || "";
      } else {
        console.warn("Element 'notes-editor' nicht gefunden.");
      }

      // Zusammenfassung anzeigen oder "Erstellen"-Button
      const summaryTextContainerEl = document.getElementById(
        "summary-text-container"
      ); // Ziel für Zusammenfassung oder Button
      const summaryTabButton = document.querySelector(
        '#material-viewer .tabs .tab[data-tab="summary"]'
      );
      const statusEl = document.getElementById("summary-status"); // Für Statusmeldungen

      if (summaryTextContainerEl) {
        // Ladeindikator für Zusammenfassung anzeigen
        summaryTextContainerEl.innerHTML =
          '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Zusammenfassung wird geladen...</div>';
        if (statusEl) statusEl.innerHTML = "Lade Zusammenfassung...";

        if (material.summary && material.summary.trim() !== "") {
          // Wenn Zusammenfassung bereits im Speicher ist
          console.log(
            "openMaterial: Verwende Zusammenfassung aus dem Speicher."
          );
          summaryTextContainerEl.innerHTML = this.formatChatResponse
            ? this.formatChatResponse(material.summary)
            : material.summary;
          if (summaryTabButton) summaryTabButton.classList.add("has-content");
          if (statusEl) statusEl.innerHTML = "✓ Zusammenfassung geladen";
        } else {
          // Zusammenfassung ist nicht im Speicher, versuche aus IndexedDB zu laden
          console.log(
            "openMaterial: Versuche Zusammenfassung aus IndexedDB zu laden."
          );
          this.getSummaryFromIndexedDB(material.id)
            .then((savedSummary) => {
              if (savedSummary) {
                console.log(
                  "openMaterial: Zusammenfassung aus IndexedDB geladen."
                );
                material.summary = savedSummary; // In den Speicher laden für zukünftige Zugriffe
                summaryTextContainerEl.innerHTML = this.formatChatResponse
                  ? this.formatChatResponse(savedSummary)
                  : savedSummary;
                if (summaryTabButton)
                  summaryTabButton.classList.add("has-content");
                if (statusEl)
                  statusEl.innerHTML = "✓ Zusammenfassung aus Speicher geladen";
              } else {
                // Keine Zusammenfassung im Speicher und nicht in IndexedDB -> "Erstellen"-Button anzeigen
                console.log(
                  "openMaterial: Keine Zusammenfassung gefunden, zeige 'Erstellen'-Button."
                );
                summaryTextContainerEl.innerHTML = `
                <div class="empty-state">
                  <p>Noch keine Zusammenfassung für dieses Material vorhanden.</p>
                  <button id="create-summary-for-current-material-btn" class="btn-primary">
                    <i class="fas fa-magic"></i> Jetzt Zusammenfassung erstellen
                  </button>
                </div>
              `;
                if (summaryTabButton)
                  summaryTabButton.classList.remove("has-content");
                if (statusEl)
                  statusEl.innerHTML = "Keine Zusammenfassung vorhanden.";

                const createSummaryBtn = document.getElementById(
                  "create-summary-for-current-material-btn"
                );
                if (createSummaryBtn) {
                  const newBtn = createSummaryBtn.cloneNode(true);
                  createSummaryBtn.parentNode.replaceChild(
                    newBtn,
                    createSummaryBtn
                  );
                  newBtn.addEventListener("click", () => {
                    if (this.currentMaterial) {
                      this.generateSummary(this.currentMaterial);
                    }
                  });
                }
              }
            })
            .catch((err) => {
              console.error(
                "Fehler beim Laden der Zusammenfassung aus IndexedDB in openMaterial:",
                err
              );
              summaryTextContainerEl.innerHTML = `
              <div class="empty-state error-message">
                <p>Fehler beim Laden der gespeicherten Zusammenfassung.</p>
                <button id="create-summary-for-current-material-btn" class="btn-primary">
                  <i class="fas fa-magic"></i> Neue Zusammenfassung erstellen
                </button>
              </div>
            `;
              if (summaryTabButton)
                summaryTabButton.classList.remove("has-content");
              if (statusEl)
                statusEl.innerHTML =
                  "❌ Fehler beim Laden der Zusammenfassung.";
              const createSummaryBtn = document.getElementById(
                "create-summary-for-current-material-btn"
              );
              if (createSummaryBtn) {
                const newBtn = createSummaryBtn.cloneNode(true);
                createSummaryBtn.parentNode.replaceChild(
                  newBtn,
                  createSummaryBtn
                );
                newBtn.addEventListener("click", () => {
                  if (this.currentMaterial) {
                    this.generateSummary(this.currentMaterial);
                  }
                });
              }
            });
        }
      } else {
        console.warn(
          "Element 'summary-text-container' nicht gefunden in openMaterial."
        );
      }

      const pdfContainer = document.getElementById("pdf-renderer");
      if (pdfContainer) {
        pdfContainer.innerHTML =
          '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>PDF wird geladen...</p></div>';
      } else {
        console.warn("Element 'pdf-renderer' nicht gefunden.");
      }

      if (material.fileAvailable === false) {
        if (pdfContainer) {
          pdfContainer.innerHTML = `
              <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>PDF-Datei nicht im Speicher verfügbar. Bitte lade die PDF erneut hoch.</p>
              </div>`;
        }
        this.showNotification(
          "Error",
          "PDF-Datei nicht verfügbar. Bitte lade die PDF erneut hoch.",
          "error"
        );
        // Wichtig: Hier nicht einfach returnen, wenn PDF nicht da ist,
        // da Zusammenfassung und Notizen trotzdem funktionieren sollen.
        // Der PDF-Tab wird dann die Fehlermeldung anzeigen.
      }

      // PDF-Rendering nur starten, wenn die Datei als verfügbar markiert ist
      // und die renderPdf Funktion existiert.
      if (
        material.fileAvailable !== false &&
        typeof this.renderPdf === "function"
      ) {
        this.renderPdf(material);
      } else if (material.fileAvailable === false) {
        console.log("PDF nicht verfügbar, Rendering wird übersprungen.");
      } else if (typeof this.renderPdf !== "function") {
        console.error(
          "this.renderPdf ist keine Funktion. pdf-fix.js hat sie nicht korrekt gepatcht."
        );
        if (pdfContainer) {
          pdfContainer.innerHTML = `<div class="error-message"><p>Fehler beim Initialisieren der PDF-Anzeige.</p></div>`;
        }
      }

      if (typeof this.activateTab === "function") {
        this.activateTab("pdf"); // PDF-Tab standardmäßig aktivieren
      } else {
        console.warn("this.activateTab ist keine Funktion in openMaterial.");
      }
    },

    // Update your renderPdf function
    renderPdf: function (material) {
      const pdfContainer = document.getElementById("pdf-renderer");
      if (!pdfContainer) {
        console.error("PDF container 'pdf-renderer' not found for renderPdf");
        return;
      }

      console.log("renderPdf: Rendering PDF for material:", material.id);
      pdfContainer.innerHTML =
        '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>PDF wird gerendert...</p></div>';

      if (typeof pdfjsLib === "undefined" || !window.pdfjsLib.getDocument) {
        console.error(
          "PDF.js library (pdfjsLib) not found or not initialized."
        );
        pdfContainer.innerHTML = `
          <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>PDF.js Bibliothek konnte nicht geladen werden. Die PDF kann nicht angezeigt werden.</p>
          </div>`;
        return;
      }

      if (!material.fileData) {
        console.error(
          "renderPdf: No PDF data in material object for ID:",
          material.id,
          "Attempting to fetch."
        );
        // Attempt to fetch it again if somehow it's missing, though openMaterial should provide it
        this.getPdfFromIndexedDB(material.id)
          .then((fileData) => {
            if (!fileData) {
              console.error(
                "renderPdf: PDF data not found in IndexedDB for ID:",
                material.id
              );
              pdfContainer.innerHTML = `
                <div class="error-message">
                  <i class="fas fa-exclamation-triangle"></i>
                  <p>PDF konnte nicht geladen werden. Bitte lade die PDF erneut hoch.</p>
                </div>`;
              return;
            }
            material.fileData = fileData; // Store it
            this.renderPdfWithData(material, pdfContainer); // Retry rendering
          })
          .catch((error) => {
            console.error(
              "renderPdf: Error loading PDF from IndexedDB:",
              error
            );
            pdfContainer.innerHTML = `
              <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Fehler beim Laden des PDFs: ${error.message}</p>
              </div>`;
          });
      } else {
        // PDF data is already in memory, render it directly
        this.renderPdfWithData(material, pdfContainer);
      }
    },

    // Add this helper function for rendering
    renderPdfWithData: function (material, pdfContainer) {
      console.log("Rendering PDF with data, size:", material.fileData.length);

      // Use PDF.js to render the PDF
      pdfjsLib
        .getDocument({ data: material.fileData })
        .promise.then((pdf) => {
          console.log("PDF loaded successfully with", pdf.numPages, "pages");
          pdfContainer.innerHTML = "";

          // Create container for pages
          const pagesContainer = document.createElement("div");
          pagesContainer.className = "pdf-pages";
          pdfContainer.appendChild(pagesContainer);

          // Render first page initially
          this.renderPage(pdf, 1, pagesContainer);

          // Add page navigation
          this.addPageNavigation(pdf, pdfContainer);
        })
        .catch((err) => {
          console.error("Error rendering PDF:", err);
          pdfContainer.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Fehler beim Öffnen des Dokuments: ${
            err.message || "Unbekannter Fehler"
          }</p>
        </div>`;
        });
    },

    // Load all PDF data from IndexedDB into materials
    loadPdfDataFromIndexedDB: function () {
      // Only proceed if we have a browser with IndexedDB support
      if (!window.indexedDB) return;

      this.initIndexedDB()
        .then((db) => {
          try {
            const transaction = db.transaction(["pdfs"], "readonly"); // Changed from pdfFiles
            const store = transaction.objectStore("pdfs"); // Changed from pdfFiles
            const request = store.openCursor();

            request.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                // Find the material that matches this PDF ID
                const material = this.materials.find(
                  (m) => m.id === cursor.value.id
                );
                if (material) {
                  // Add a flag to indicate file is available in IndexedDB
                  material.fileAvailable = true;
                }
                cursor.continue();
              }
            };
          } catch (error) {
            console.error("Error in loadPdfDataFromIndexedDB:", error);
          }
        })
        .catch((err) => {
          console.error("Error loading PDFs from IndexedDB:", err);
        });
    },
    

    

    generateAIFlashcards: function (material) {
      // Deine komplette generateAIFlashcards Implementierung (siehe #attachment_app_js_context_1 Zeile 514)
      if (!material || !material.content) {
        this.showNotification(
          "Fehler",
          "Kein Materialinhalt zum Erstellen von Lernkarten vorhanden.",
          "error"
        );
        return;
      }
      this.showNotification(
        "Info",
        "Generiere Lernkarten mit KI... Dies kann einen Moment dauern.",
        "info"
      );

      this.callOllamaAPI({
        action: "generateFlashcards",
        material: {
          id: material.id,
          name: material.name,
          content: material.content,
        },
      })
        .then((response) => {
          console.log("generateAIFlashcards: Antwort von API erhalten:", response);
          if (
            response &&
            response.success &&
            response.flashcards &&
            response.flashcards.length > 0
          ) {
            this.showNotification(
              "Erfolg",
              `${response.flashcards.length} Lernkarten wurden von der KI erstellt.`,
              "success"
            );

            if (
              window.app &&
              window.app.flashcards &&
              typeof window.app.flashcards.prepareEditorWithAICards === "function"
            ) {
              this.showPage("flashcards");
              window.app.flashcards.prepareEditorWithAICards(
                material.name,
                response.flashcards
              );
            } else {
              console.error(
                "generateAIFlashcards FEHLER: Flashcard-Modul oder prepareEditorWithAICards-Funktion nicht verfügbar. window.app.flashcards:",
                window.app && window.app.flashcards ? window.app.flashcards : (window.app ? "window.app.flashcards ist undefined" : "window.app ist nicht definiert")
              );
              this.showNotification(
                "Fehler",
                "Lernkarten-Modul ist nicht bereit. Bitte versuche es später erneut oder lade die Seite neu.",
                "error"
              );
            }
          } else {
            let errorMessage = "KI konnte keine Lernkarten generieren oder das Format war unerwartet.";
            if (response && response.error) {
                errorMessage = response.error;
            } else if (response && response.success && (!response.flashcards || response.flashcards.length === 0)) {
                errorMessage = "Die KI hat keine Lernkarten für dieses Material zurückgegeben.";
            }
            console.error("generateAIFlashcards FEHLER:", errorMessage, "Antwort:", response);
            // throw new Error(errorMessage); // Besser: Notification anzeigen
            this.showNotification("Fehler bei KI-Antwort", errorMessage, "error");
          }
        })
        .catch((error) => {
          console.error("generateAIFlashcards FEHLER beim API-Aufruf:", error);
          this.showNotification(
            "Fehler bei KI-Anfrage",
            `Details: ${error.message || 'Unbekannter Fehler'}`,
            "error"
          );
        });
    },

    activateTab: function (tabIdToShow) {
      const viewer = document.getElementById("material-viewer");
      if (!viewer) {
        console.error(
          "activateTab FEHLER: Material Viewer Element ('material-viewer') nicht gefunden."
        );
        return;
      }
      console.log(`activateTab: Versuche Tab '${tabIdToShow}' zu aktivieren.`);

      // Alle Tab-Buttons deselektieren
      viewer.querySelectorAll(".tabs .tab").forEach((tab) => {
        tab.classList.remove("active");
      });
      // Alle Tab-Inhalte ausblenden
      viewer.querySelectorAll(".tab-content").forEach((content) => {
        content.classList.remove("active");
      });

      // Gewünschten Tab-Button aktivieren
      const tabButton = viewer.querySelector(
        `.tabs .tab[data-tab="${tabIdToShow}"]`
      );
      if (tabButton) {
        tabButton.classList.add("active");
        console.log(`activateTab: Tab-Button für '${tabIdToShow}' aktiviert.`);
      } else {
        console.warn(
          `activateTab WARNUNG: Tab-Button für '${tabIdToShow}' nicht gefunden.`
        );
      }

      // Gewünschten Tab-Inhalt anzeigen
      // Stelle sicher, dass deine Tab-Inhalte IDs wie "pdf-content", "summary-content" haben
      const tabContent = viewer.querySelector(`#${tabIdToShow}-content`);
      if (tabContent) {
        tabContent.classList.add("active");
        console.log(
          `activateTab: Tab-Inhalt für '${tabIdToShow}-content' aktiviert.`
        );
      } else {
        console.warn(
          `activateTab WARNUNG: Tab-Inhalt für '${tabIdToShow}-content' nicht gefunden.`
        );
        // Fallback, falls der spezifische Content-Div nicht existiert
        if (tabIdToShow === "pdf") {
          const pdfRenderer = document.getElementById("pdf-renderer");
          if (pdfRenderer) {
            const pdfRendererParent =
              pdfRenderer.closest(".tab-pane") ||
              pdfRenderer.closest(".tab-content");
            if (pdfRendererParent) pdfRendererParent.classList.add("active");
            else
              console.warn(
                "activateTab WARNUNG: Konnte übergeordnetes Tab-Pane für pdf-renderer nicht finden."
              );
          } else {
            console.warn(
              "activateTab WARNUNG: pdf-renderer nicht gefunden für Fallback."
            );
          }
        }
      }
    },

    setupEventListeners: function () {
      if (this._eventListenersInitialized) {
        console.warn("setupEventListeners: Listeners already initialized. Skipping to prevent duplicates.");
        // debugger; // You can uncomment this line to pause execution here and inspect
        return; // This is the crucial guard
      }
      console.log("setupEventListeners: Initializing listeners for the first time.");

      const self = this; // Sichere Referenz auf das 'app' Objekt

      // Navigation
      document.querySelectorAll(".nav-links li").forEach((item) => {
        item.addEventListener("click", function () {
          const page = this.getAttribute("data-page");
          self.showPage(page);
        });
      });

      // Button zum Neugenerieren der Zusammenfassung (im Material-Viewer)
      const regenerateSummaryBtn =
        document.getElementById("regenerate-summary");
      if (regenerateSummaryBtn) {
        regenerateSummaryBtn.addEventListener("click", () => {
          if (this.currentMaterial) {
            delete this.currentMaterial.summary;
            if (this.db && typeof this.deleteSummaryFromIndexedDB === 'function') {
                this.deleteSummaryFromIndexedDB(this.currentMaterial.id)
                    .then(() => console.log("Zusammenfassung aus IndexedDB gelöscht."))
                    .catch(err => console.error("Fehler beim Löschen der Zusammenfassung aus IDB:", err));
            } else if (this.db) {
                 try {
                    const transaction = this.db.transaction(["summaries"], "readwrite");
                    const store = transaction.objectStore("summaries");
                    store.delete(this.currentMaterial.id);
                } catch (e) {
                    console.error("Fehler beim Löschen der Zusammenfassung aus IDB (Fallback):", e);
                }
            }
            if (typeof this.generateSummary === "function") {
              this.generateSummary(this.currentMaterial);
            } else {
              console.error(
                "setupEventListeners FEHLER: this.generateSummary ist keine Funktion (regenerateSummaryBtn)."
              );
            }
          }
        });
      }

      // PDF Upload
      const uploadArea = document.getElementById("upload-area");
      const pdfUpload = document.getElementById("pdf-upload");

      if (uploadArea && pdfUpload) {
        uploadArea.addEventListener("click", () => {
          console.log("Upload area clicked, triggering pdfUpload.click()"); // Debug log
          pdfUpload.click();
        });

        uploadArea.addEventListener("dragover", (e) => {
          e.preventDefault();
          uploadArea.classList.add("drag-over");
        });

        uploadArea.addEventListener("dragleave", () => {
          uploadArea.classList.remove("drag-over");
        });

        uploadArea.addEventListener("drop", (e) => {
          e.preventDefault();
          uploadArea.classList.remove("drag-over");
          if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type === "application/pdf") {
              this.processPdfFile(file);
            } else {
              this.showNotification(
                "Error",
                "Bitte lade eine PDF-Datei hoch",
                "error"
              );
            }
          }
        });

        pdfUpload.addEventListener("change", (e) => {
          console.log("pdfUpload change event triggered"); // Debug log
          if (e.target.files.length > 0) {
            const file = e.target.files[0];
            if (file.type === "application/pdf") {
              this.processPdfFile(file);
            } else {
              this.showNotification(
                "Error",
                "Bitte lade eine PDF-Datei hoch",
                "error"
              );
            }
          }
          // Reset the file input's value to allow selecting the same file again if needed
          e.target.value = null;
        });
      } else {
        console.warn(
          "setupEventListeners WARNUNG: 'upload-area' oder 'pdf-upload' nicht gefunden."
        );
      }

      // Material viewer back button
      const backBtnMaterialViewer = document.querySelector(
        "#material-viewer .back-btn, #material-viewer #back-to-materials-btn"
      );
      if (backBtnMaterialViewer) {
        backBtnMaterialViewer.addEventListener("click", () => {
          this.showPage("materials");
        });
      } else {
        console.warn(
          "setupEventListeners WARNUNG: Back-Button im Material Viewer nicht gefunden."
        );
      }

      // Material tabs
      const materialViewerTabs = document.querySelectorAll(
        "#material-viewer .tabs .tab"
      );
      if (materialViewerTabs.length > 0) {
        materialViewerTabs.forEach((tab) => {
          tab.addEventListener("click", () => {
            const tabId = tab.getAttribute("data-tab");
            console.log(
              `setupEventListeners: Material-Tab '${tabId}' geklickt.`
            );
            if (typeof this.activateTab === "function") {
              this.activateTab(tabId);
            } else {
              console.error(
                "setupEventListeners FEHLER: this.activateTab ist keine Funktion (Material-Tabs). 'this' ist:",
                this
              );
            }

            if (
              tabId === "summary" &&
              this.currentMaterial &&
              !this.currentMaterial.summary
            ) {
              const summaryContainer = document.getElementById("summary-text-container");
              const isLoading = summaryContainer && summaryContainer.querySelector(".loading-spinner");
              if (!isLoading && typeof this.generateSummary === "function") {
                this.generateSummary(this.currentMaterial);
              } else if (isLoading) {
                console.log("Summary wird bereits generiert oder geladen.");
              } else {
                console.error(
                  "setupEventListeners FEHLER: this.generateSummary ist keine Funktion (Material-Tabs, Summary generieren)."
                );
              }
            }
          });
        });
      } else {
        console.warn(
          "setupEventListeners WARNUNG: Keine Material-Tabs (#material-viewer .tabs .tab) gefunden."
        );
      }

      // Generate summary button (im Material Header)
      const generateSummaryHeaderBtn = document.getElementById(
        "generate-summary-btn"
      );
      if (generateSummaryHeaderBtn) {
        generateSummaryHeaderBtn.addEventListener("click", () => {
          if (this.currentMaterial) {
            if (typeof this.generateSummary === "function") {
              this.generateSummary(this.currentMaterial);
            } else {
              console.error(
                "setupEventListeners FEHLER: this.generateSummary ist keine Funktion (generateSummaryHeaderBtn)."
              );
            }
          }
        });
      }

      // Generate quiz button (im Material Header)
      const generateQuizHeaderBtn =
        document.getElementById("generate-quiz-btn");
      if (generateQuizHeaderBtn) {
        generateQuizHeaderBtn.addEventListener("click", () => {
          if (this.currentMaterial) {
            this.generateQuiz(this.currentMaterial);
          }
        });
      } else {
        console.warn(
          "setupEventListeners WARNUNG: Button 'generate-quiz-btn' im Header nicht gefunden."
        );
      }

      // Generate AI Flashcards button (im Material Header)
      const generateFlashcardsAIBtn = document.getElementById(
        "generate-flashcards-ai-btn"
      );
      if (generateFlashcardsAIBtn) {
        generateFlashcardsAIBtn.addEventListener("click", () => {
          if (this.currentMaterial) {
            this.generateAIFlashcards(this.currentMaterial);
          } else {
            this.showNotification(
              "Fehler",
              "Kein Material ausgewählt, um Lernkarten zu erstellen.",
              "error"
            );
          }
        });
      } else {
          console.warn(
            "setupEventListeners WARNUNG: Button 'generate-flashcards-ai-btn' nicht gefunden."
        );
      }

      // Save notes button
      const saveNotesBtn = document.getElementById("save-notes-btn");
      if (saveNotesBtn) {
        saveNotesBtn.addEventListener("click", () => {
          if (this.currentMaterial) {
            const notesEditor = document.getElementById("notes-editor");
            if (notesEditor) {
              this.currentMaterial.notes = notesEditor.value;
              this.saveData();
              this.showNotification(
                "Gespeichert",
                "Notizen erfolgreich gespeichert.",
                "success"
              );
            } else {
              console.warn(
                "setupEventListeners WARNUNG: 'notes-editor' nicht gefunden beim Speichern der Notizen."
              );
            }
          }
        });
      } else {
        console.warn(
          "setupEventListeners WARNUNG: Button 'save-notes-btn' nicht gefunden."
        );
      }

      // Mark as completed button
      const markCompletedBtn = document.getElementById("mark-completed-btn");
      if (markCompletedBtn) {
        markCompletedBtn.addEventListener("click", () => {
          if (this.currentMaterial) {
            this.currentMaterial.completed = !this.currentMaterial.completed;
            this.saveData();
            markCompletedBtn.innerHTML = this.currentMaterial.completed
              ? '<i class="fas fa-times"></i> Als unvollständig markieren'
              : '<i class="fas fa-check"></i> Als abgeschlossen markieren';
            this.showNotification(
              "Status geändert",
              `Material als ${
                this.currentMaterial.completed
                  ? "abgeschlossen"
                  : "unvollständig"
              } markiert!`,
              "success"
            );
            this.updateUI();
          }
        });
      } else {
        console.warn(
          "setupEventListeners WARNUNG: Button 'mark-completed-btn' nicht gefunden."
        );
      }

      // Quiz navigation
      const nextQuestionBtn = document.getElementById("next-question");
      if (nextQuestionBtn) {
        nextQuestionBtn.addEventListener("click", () => this.nextQuestion());
      }
      const finishQuizBtn = document.getElementById("finish-quiz");
      if (finishQuizBtn) {
        finishQuizBtn.addEventListener("click", () => this.finishQuiz());
      }
      const retryIncorrectBtn = document.getElementById("retry-incorrect");
      if (retryIncorrectBtn) {
        retryIncorrectBtn.addEventListener("click", () =>
          this.retryIncorrectQuestions()
        );
      }
      const backToQuizzesBtn = document.getElementById("back-to-quizzes");
      if (backToQuizzesBtn) {
        backToQuizzesBtn.addEventListener("click", () => {
          this.showPage('quizzes');
          const quizResults = document.getElementById("quiz-results");
          const quizList = document.getElementById("quiz-list");
          const activeQuizView = document.getElementById("active-quiz");

          if (quizResults) quizResults.classList.add("hidden");
          if (activeQuizView) activeQuizView.classList.add("hidden");
          if (quizList) quizList.classList.remove("hidden");
        });
      }
      const exitQuizBtn = document.getElementById("exit-quiz");
      if (exitQuizBtn) {
        exitQuizBtn.addEventListener("click", () => {
          if (
            confirm(
              "Möchtest du das Quiz wirklich verlassen? Dein Fortschritt wird nicht gespeichert."
            )
          ) {
            this.exitQuiz();
          }
        });
      }

      // Exam form
      const examForm = document.getElementById("exam-form");
      if (examForm) {
        examForm.addEventListener("submit", (e) => {
          e.preventDefault();
          this.addExam();
        });
      }

      // AI Chat
      const sendMessageBtn = document.getElementById("send-message");
      if (sendMessageBtn) {
        sendMessageBtn.addEventListener("click", () => this.sendMessage());
      }
      const userMessageInput = document.getElementById("user-message");
      if (userMessageInput) {
        userMessageInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
          }
        });
      }
      
      this._eventListenersInitialized = true; // IMPORTANT: Set the flag to true at the VERY END of the function
      console.log("setupEventListeners: Listeners initialized and flag set to true.");
    },

    updateUI: function () {
      // Update dashboard stats
      document.getElementById("materials-count").textContent =
        this.materials.length;

      let completedMaterials = 0;
      this.materials.forEach((material) => {
        if (material.completed) completedMaterials++;
      });

      const progressPercent =
        this.materials.length > 0
          ? Math.round((completedMaterials / this.materials.length) * 100)
          : 0;

      document.getElementById("progress-percent").textContent = progressPercent;

      // Update next exam date
      const upcomingExams = this.exams
        .filter((exam) => {
          return new Date(exam.date) > new Date();
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      if (upcomingExams.length > 0) {
        const nextExam = upcomingExams[0];
        const examDate = new Date(nextExam.date);
        document.getElementById("next-exam-date").textContent = `${
          nextExam.name
        } am ${examDate.toLocaleDateString("de-DE")}`;
      } else {
        document.getElementById("next-exam-date").textContent =
          "Keine anstehend";
      }

      // Update study agenda
      this.updateStudyAgenda();

      // Update materials list
      this.updateMaterialsList();

      // Update exam materials dropdown
      this.updateExamMaterialsDropdown();
      this.updatePomodoroTasksDropdown(); // Call the new function here

      // Update exams list
      this.updateExamsList();

      // Update quizzes list
      this.updateQuizzesList();
    },

    // Add this new function to your app object
    updatePomodoroTasksDropdown: function() {
      const selectElement = document.getElementById('pomodoro-task');
      if (!selectElement) {
        console.warn("Pomodoro task select element ('pomodoro-task') not found.");
        return;
      }

      const currentValue = selectElement.value; // Preserve selected value if possible

      // Clear all options except the first one (default option)
      while (selectElement.options.length > 1) {
        selectElement.remove(selectElement.options.length - 1);
      }

      // Adjust the default option's text based on material availability
      if (selectElement.options.length > 0) { // Check if the default option exists
        selectElement.options[0].value = ""; // Ensure default option has empty value
        if (this.materials.length === 0) {
          selectElement.options[0].textContent = "Keine Materialien verfügbar";
        } else {
          selectElement.options[0].textContent = "-- Wähle Material --";
        }
      }

      // Populate with current materials if any
      if (this.materials.length > 0) {
        this.materials.forEach(material => {
          const option = document.createElement('option');
          option.value = material.id; // Use material ID as the value
          option.textContent = material.name;
          selectElement.appendChild(option);
        });
      }

      // Try to reselect the previous value if it still exists
      if (currentValue) {
        selectElement.value = currentValue;
      }
    },

    // Replace the line in showPage function with this:
    showPage: function (pageId) {
      // Change this line:
      const page = document.getElementById(pageId);
      if (!page) {
        console.error(`Error: Page with ID "${pageId}" not found.`);
        return;
      }

      // Fix the material-view vs material-viewer mismatch
      if (pageId === "material-view") {
        pageId = "material-viewer";
      }

      // Update navigation
      document.querySelectorAll(".nav-links li").forEach((item) => {
        item.classList.remove("active");
      });

      // Add this check to prevent the null error
      const navItem = document.querySelector(
        `.nav-links li[data-page="${pageId}"]`
      );
      if (navItem) {
        navItem.classList.add("active");
      }

      // Show selected page
      document.querySelectorAll(".page").forEach((page) => {
        page.classList.remove("active");
      });

      // Add a null check here
      const targetPage = document.getElementById(pageId);
      if (targetPage) {
        targetPage.classList.add("active");
      } else {
        console.error(`Error: Page with ID "${pageId}" not found.`);
        // Optionally, show a default page instead:
        const firstPage = document.querySelector(".page");
        if (firstPage) {
          firstPage.classList.add("active");
        }
      }
    },

    processPdfFile: function (file) {
      document.getElementById("loading-modal").classList.add("active");
      document.getElementById("loading-message").textContent =
        "Verarbeite deine PDF...";

      const materialId = Date.now().toString();
      const materialName = file.name.replace(/\.pdf$/i, "");

      const reader = new FileReader();
      reader.onload = async (e) => {
        const fileData = e.target.result; // ArrayBuffer
        try {
          let extractedContentForAI = "";
          if (this.extractPdfContent) {
            // Sicherstellen, dass die Funktion existiert
            try {
              extractedContentForAI = await this.extractPdfContent(fileData);
              this.materials.push(newMaterial);
              this.saveData();
              // this.updateMaterialsList(); // Wird durch updateUI() abgedeckt
              this.updateUI(); // Stellt sicher, dass ALLE UI-Teile, inkl. exam-materials dropdown, aktualisiert werden
              this.showNotification("Erfolg", `${materialName} erfolgreich hochgeladen und Inhalt extrahiert.`, "success");
              // Strikte Prüfung HIER: Wenn kein Text extrahiert wurde, ist das ein Fehler für die weitere Verarbeitung,
              // insbesondere für die Zusammenfassungsfunktion.
              if (
                !extractedContentForAI ||
                extractedContentForAI.trim() === ""
              ) {
                console.warn(
                  "processPdfFile: PDF-Inhaltsextraktion ergab keinen Text oder nur Leerraum. Material wird nicht für Zusammenfassungen/Quiz nutzbar sein."
                );
                // Wir werfen hier einen Fehler, da für die Kernfunktionen (Zusammenfassung, Quiz) Text benötigt wird.
                // Wenn PDFs ohne Text erlaubt sein sollen, aber dann bestimmte Funktionen deaktiviert, müsste die Logik hier anders sein.
                throw new Error(
                  "Der PDF-Inhalt konnte nicht extrahiert werden oder die PDF enthält keinen Text. Zusammenfassungs- und Quizfunktionen sind nicht verfügbar."
                );
              }
              console.log(
                "processPdfFile: PDF-Inhalt für AI extrahiert, Länge:",
                extractedContentForAI.length
              );
            } catch (extractError) {
              // Fehler von extractPdfContent direkt weiterleiten
              console.error(
                "processPdfFile: Fehler bei der PDF-Inhaltsextraktion:",
                extractError.message
              );
              this.showNotification("Fehler bei PDF-Verarbeitung", `PDF konnte nicht verarbeitet werden: ${error.message}`, "error");
              throw extractError; // Stellt sicher, dass der äußere catch-Block diesen Fehler behandelt
            } finally {
              document
                .getElementById("loading-modal")
                .classList.remove("active");
            }
          } else {
            console.error(
              "processPdfFile FEHLER: this.extractPdfContent ist keine Funktion. PDF-Inhalt kann nicht extrahiert werden."
            );
            throw new Error(
              "Funktion zur PDF-Inhaltsextraktion nicht verfügbar."
            );
          }

          // Speichere die PDF-Rohdaten in IndexedDB
          if (typeof this.savePdfToDB === "function") {
            // Bevorzugt, falls von pdf-fix.js gepatcht
            await this.savePdfToDB(materialId, fileData);
            console.log("PDF-Daten mit this.savePdfToDB gespeichert.");
          } else if (typeof this.savePdfToIndexedDB === "function") {
            // Fallback
            await this.savePdfToIndexedDB(materialId, fileData);
            console.log("PDF-Daten mit this.savePdfToIndexedDB gespeichert.");
          } else {
            console.error(
              "processPdfFile FEHLER: Keine geeignete Funktion zum Speichern von PDF-Daten in IndexedDB gefunden."
            );
            throw new Error("PDF Speicherfunktion (DB) nicht verfügbar.");
          }

          // Erstelle das Materialobjekt erst, wenn alle kritischen Schritte erfolgreich waren
          const newMaterial = {
            id: materialId,
            name: materialName,
            type: "pdf",
            fileName: file.name,
            dateAdded: new Date().toISOString(),
            content: extractedContentForAI, // Ist jetzt garantiert nicht leer, wenn dieser Punkt erreicht wird
            summary: "",
            notes: "",
            completed: false,
            quizAttempts: [],
            fileAvailable: true,
          };

          this.materials.push(newMaterial);
          this.saveData();
          this.updateMaterialsList();
          this.showNotification(
            "Erfolg",
            `${materialName} erfolgreich hochgeladen und Inhalt extrahiert.`,
            "success"
          );
        } catch (error) {
          // Fängt Fehler aus der Inhaltsextraktion oder DB-Speicherung
          console.error(
            "Fehler beim Verarbeiten der PDF-Datei in reader.onload:",
            error
          );
          this.showNotification(
            "Fehler bei PDF-Verarbeitung",
            `PDF konnte nicht verarbeitet werden: ${error.message}`,
            "error"
          );
          // Das Material wird in diesem Fehlerfall nicht zur Liste hinzugefügt.
        } finally {
          document.getElementById("loading-modal").classList.remove("active");
        }
      };

      reader.onerror = (error) => {
        console.error("Error reading file:", error);
        document.getElementById("loading-modal").classList.remove("active");
        this.showNotification(
          "Error",
          "Fehler beim Lesen der Datei. Bitte versuche es erneut.",
          "error"
        );
      };

      reader.readAsArrayBuffer(file);
    },

    extractPdfContent: async function (fileData) {
      console.log("extractPdfContent: Versuche, PDF-Inhalt zu extrahieren.");
      if (typeof pdfjsLib === "undefined" || !pdfjsLib.getDocument) {
        console.error(
          "extractPdfContent FEHLER: pdfjsLib ist nicht definiert oder nicht korrekt initialisiert!"
        );
        throw new Error(
          "PDF-Bibliothek (pdf.js) nicht geladen. Inhalt kann nicht extrahiert werden."
        );
      }

      try {
        // Konvertiere ArrayBuffer zu Uint8Array, falls es nicht bereits so ist
        const uint8array =
          fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);

        const loadingTask = pdfjsLib.getDocument({ data: uint8array });
        const pdf = await loadingTask.promise;
        console.log("extractPdfContent: PDF geladen, Seiten:", pdf.numPages);

        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item) => item.str).join(" ");
          fullText += pageText + "\n"; // Füge einen Zeilenumbruch zwischen den Seiten hinzu
        }

        if (!fullText || fullText.trim() === "") {
          console.warn(
            "extractPdfContent WARNUNG: Kein Textinhalt aus PDF extrahiert oder Inhalt ist leer."
          );
          // Wir werfen hier noch keinen Fehler, da eine PDF ohne Text legitim sein kann (z.B. nur Bilder).
          // Die Entscheidung, ob das Material ohne Text brauchbar ist, sollte in processPdfFile getroffen werden,
          // basierend darauf, ob Text für Funktionen wie Zusammenfassung zwingend erforderlich ist.
          // Für die Zusammenfassung ist es aber ein Problem, daher wird processPdfFile dies abfangen.
          return ""; // Gebe leeren String zurück, wenn kein Text gefunden wurde
        }

        console.log(
          "extractPdfContent: Inhaltsextraktion erfolgreich, Länge:",
          fullText.length
        );
        return fullText;
      } catch (error) {
        console.error(
          "extractPdfContent FEHLER beim Extrahieren von Text aus PDF:",
          error
        );
        // Gib einen spezifischeren Fehler weiter, der das Problem beschreibt
        if (error.name === "PasswordException") {
          throw new Error(
            "PDF ist passwortgeschützt. Inhalt kann nicht extrahiert werden."
          );
        } else if (error.name === "InvalidPDFException") {
          throw new Error("Ungültige oder beschädigte PDF-Datei.");
        }
        throw new Error(
          `Fehler beim Extrahieren des PDF-Inhalts: ${
            error.message || "Unbekannter Fehler"
          }`
        );
      }
    },

    updateMaterialsList: function () {
      const materialsContainer = document.querySelector(".materials-container");

      if (this.materials.length === 0) {
        materialsContainer.innerHTML =
          '<p class="empty-state">Noch keine Lernmaterialien hochgeladen.</p>';
        materialsContainer.classList.add("empty");
        return;
      }

      materialsContainer.classList.remove("empty");
      materialsContainer.innerHTML = "";

      this.materials.forEach((material) => {
        const materialCard = document.createElement("div");
        materialCard.className = "material-card";
        materialCard.setAttribute("data-id", material.id);

        let thumbnailHtml = '<i class="fas fa-file-pdf"></i>';
        if (material.thumbnail) {
          thumbnailHtml = `<img src="${material.thumbnail}" alt="PDF Thumbnail" class="pdf-thumbnail">`;
        }

        materialCard.innerHTML = `
                    <div class="material-icon">
                        ${thumbnailHtml}
                    </div>
                    <div class="material-info">
                        <h3>${material.name}</h3>
                        <p>Hinzugefügt am ${new Date(
                          material.dateAdded
                        ).toLocaleDateString("de-DE")}</p>
                        <small>${
                          material.pages ? material.pages.length : 0
                        } Seiten</small>
                    </div>
                    <div class="material-progress">
                        <p>${
                          material.completed
                            ? "Abgeschlossen"
                            : "In Bearbeitung"
                        }</p>
                        <div class="progress-bar">
                            <div class="progress" style="width: ${
                              material.completed ? "100%" : "0%"
                            }"></div>
                        </div>
                    </div>
                    <button class="delete-material" title="Material löschen">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;

        // Add click event to open material
        materialCard.addEventListener("click", (e) => {
          // Don't open material if delete button was clicked

          if (!e.target.closest(".delete-material")) {
            this.openMaterial(material.id);
          }
        });

        // Add delete functionality
        const deleteBtn = materialCard.querySelector(".delete-material");
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation(); // Prevent opening the material
          this.confirmDeleteMaterial(material.id);
        });

        materialsContainer.appendChild(materialCard);
      });
    },

    // Confirm material deletion with modal
    confirmDeleteMaterial: function (materialId) {
      const material = this.materials.find((m) => m.id === materialId);
      if (!material) return;

      // Create confirmation dialog
      const modal = document.createElement("div");
      modal.className = "modal active delete-confirm-modal";
      modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Material löschen</h2>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p>Möchtest du wirklich "${material.name}" löschen?</p>
                        <p>Diese Aktion kann nicht rückgängig gemacht werden. Alle zugehörigen Quizze werden ebenfalls gelöscht.</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary cancel-btn">Abbrechen</button>
                        <button class="btn-danger confirm-btn">Löschen</button>
                    </div>
                </div>
            `;

      document.body.appendChild(modal);

      // Add event listeners for closing and confirming
      modal
        .querySelector(".close-modal")
        .addEventListener("click", () => modal.remove());
      modal
        .querySelector(".cancel-btn")
        .addEventListener("click", () => modal.remove());
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.remove();
      });

      // Delete material when confirmed
      modal.querySelector(".confirm-btn").addEventListener("click", () => {
        this.deleteMaterial(materialId);
        modal.remove();
      });
    },

    // Delete material and related data
    deleteMaterial: function (materialId) {
      // Remove from IndexedDB
      if (this.db) {
        try {
          const transaction = this.db.transaction(["pdfs"], "readwrite"); // Changed from pdfFiles
          const store = transaction.objectStore("pdfs"); // Changed from pdfFiles
          store.delete(materialId);
        } catch (error) {
          console.error("Error deleting PDF from IndexedDB:", error);
        }
      }

      // Remove related quizzes
      this.quizzes = this.quizzes.filter(
        (quiz) => quiz.materialId !== materialId
      );

      // Remove material
      this.materials = this.materials.filter((m) => m.id !== materialId);

      // Save changes
      this.saveData();

      // Update UI
      this.updateUI();

      // Show notification
      this.showNotification(
        "Gelöscht",
        "Material wurde erfolgreich gelöscht",
        "success"
      );
    },

    generateSummary: function (material) {
      console.log(
        "generateSummary: Wird aufgerufen für Material:",
        material ? material.name : "UNDEFINIERT"
      );
      if (!material) {
        console.error("generateSummary FEHLER: Kein Materialobjekt übergeben.");
        return Promise.reject(
          new Error("Kein Materialobjekt für Zusammenfassung übergeben.")
        );
      }

      // Stelle sicher, dass die material-viewer Seite aktiv ist, BEVOR auf Elemente zugegriffen wird.
      // Es ist besser, wenn openMaterial dies sicherstellt und generateSummary nur aufgerufen wird,
      // wenn die Seite und Elemente garantiert existieren.
      const summaryContentEl = document.getElementById("summary-content");
      const statusEl = document.getElementById("summary-status");

      if (!summaryContentEl) {
        console.error(
          "generateSummary FEHLER: Element 'summary-content' nicht im DOM gefunden. Ist die material-viewer Seite aktiv und korrekt geladen?"
        );
        this.showNotification(
          "Systemfehler",
          "Anzeigebereich für Zusammenfassung nicht gefunden.",
          "error"
        );
        return Promise.reject(
          new Error("Element 'summary-content' not found.")
        );
      }
      if (!statusEl) {
        console.warn(
          "generateSummary WARNUNG: Element 'summary-status' nicht im DOM gefunden. Status wird nicht angezeigt."
        );
      }

      // Logik für die Zusammenfassung
      if (material.summary) {
        console.log(
          "generateSummary: Verwende vorhandene Zusammenfassung für:",
          material.name
        );
        summaryContentEl.innerHTML = this.formatChatResponse
          ? this.formatChatResponse(material.summary)
          : material.summary;
        if (statusEl) {
          statusEl.innerHTML = "✓ Zusammenfassung geladen";
          statusEl.className = "summary-status saved";
        }
        return Promise.resolve(material.summary); // Gebe die Zusammenfassung zurück
      }

      console.log(
        "generateSummary: Versuche Zusammenfassung aus IndexedDB zu laden für:",
        material.name
      );
      return this.getSummaryFromIndexedDB(material.id)
        .then((summaryText) => {
          if (summaryText) {
            console.log(
              "generateSummary: Gespeicherte Zusammenfassung aus IndexedDB geladen für:",
              material.name
            );
            material.summary = summaryText; // Im Objekt speichern für schnellen Zugriff
            summaryContentEl.innerHTML = this.formatChatResponse
              ? this.formatChatResponse(summaryText)
              : summaryText;
            if (statusEl) {
              statusEl.innerHTML = "✓ Zusammenfassung aus Speicher geladen";
              statusEl.className = "summary-status saved";
            }
            return summaryText; // Gebe die Zusammenfassung zurück
          }

          // Wenn nicht in IndexedDB, neue Zusammenfassung generieren
          console.log(
            "generateSummary: Keine gespeicherte Zusammenfassung gefunden, generiere neue für:",
            material.name
          );
          summaryContentEl.innerHTML =
            '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Zusammenfassung wird generiert...</div>';
          if (statusEl) {
            statusEl.innerHTML = "Generiere neue Zusammenfassung...";
            statusEl.className = "summary-status";
          }

          if (!material.content) {
            console.error(
              "generateSummary FEHLER: Material hat keinen 'content' zum Zusammenfassen.",
              material
            );
            summaryContentEl.innerHTML =
              '<div class="error-message">Fehler: Kein Inhalt zum Zusammenfassen vorhanden.</div>';
            if (statusEl) {
              statusEl.innerHTML = "❌ Fehler: Kein Inhalt";
              statusEl.className = "summary-status error";
            }
            return Promise.reject(
              new Error("Material content is missing for summary generation.")
            );
          }

          return this.callOllamaAPI({
            action: "summarize",
            material: {
              id: material.id,
              name: material.name,
              content: material.content.substring(0, 10000), // Limit für API
            },
          })
            .then((response) => {
              console.log(
                "generateSummary: API Antwort erhalten, Länge:",
                response.summary?.length || 0
              );
              if (response && response.success && response.summary) {
                material.summary = response.summary; // Im Objekt speichern
                const formattedSummary = this.formatChatResponse
                  ? this.formatChatResponse(response.summary)
                  : response.summary;
                summaryContentEl.innerHTML = formattedSummary;

                return this.saveSummaryToIndexedDB(
                  material.id,
                  response.summary
                )
                  .then(() => {
                    console.log(
                      "generateSummary: Zusammenfassung in IndexedDB gespeichert."
                    );
                    if (statusEl) {
                      statusEl.innerHTML = "✓ Neue Zusammenfassung gespeichert";
                      statusEl.className = "summary-status saved";
                    }
                    // Versuche auch in localStorage zu speichern (kann fehlschlagen)
                    this.saveData();
                    return response.summary; // Gebe die neue Zusammenfassung zurück
                  })
                  .catch((err) => {
                    console.error(
                      "generateSummary FEHLER: Konnte Zusammenfassung nicht in IndexedDB speichern:",
                      err
                    );
                    if (statusEl) {
                      statusEl.innerHTML =
                        "⚠️ Zusammenfassung nicht dauerhaft gespeichert";
                      statusEl.className = "summary-status error";
                    }
                    // Trotzdem die Zusammenfassung zurückgeben, da sie generiert wurde
                    return response.summary;
                  });
              } else {
                console.error(
                  "generateSummary FEHLER: Ungültige API Antwort für Zusammenfassung.",
                  response
                );
                throw new Error("Invalid summary response from API");
              }
            })
            .catch((error) => {
              console.error(
                "generateSummary FEHLER: Fehler bei der API-Anfrage oder Verarbeitung:",
                error
              );
              summaryContentEl.innerHTML =
                '<div class="error-message">Fehler beim Erstellen der Zusammenfassung. Bitte versuche es später erneut.</div>';
              if (statusEl) {
                statusEl.innerHTML = "❌ API-Fehler: " + error.message;
                statusEl.className = "summary-status error";
              }
              this.showNotification(
                "API Fehler",
                "Die Zusammenfassung konnte nicht generiert werden: " +
                  error.message,
                "error"
              );
              return Promise.reject(error); // Wichtig, um den Fehler in der Kette weiterzugeben
            });
        })
        .catch((dbError) => {
          console.error(
            "generateSummary FEHLER: Fehler beim Zugriff auf IndexedDB für Zusammenfassungen:",
            dbError
          );
          summaryContentEl.innerHTML =
            '<div class="error-message">Fehler beim Laden der gespeicherten Zusammenfassung.</div>';
          if (statusEl) {
            statusEl.innerHTML = "❌ DB-Fehler";
            statusEl.className = "summary-status error";
          }
          return Promise.reject(dbError);
        });
    },

    generateQuiz: function (material) {
      // Show loading modal
      document.getElementById("loading-modal").classList.add("active");
      document.getElementById("loading-message").textContent =
        "Erstelle Quiz basierend auf deinen Unterlagen...";

      // Send content to Ollama API through backend
      this.callOllamaAPI({
        action: "generateQuiz",
        material: {
          id: material.id,
          name: material.name,
          content: material.content.substring(0, 10000), // Limit content for API
        },
      })
        .then((response) => {
          if (
            !response ||
            !response.success ||
            !response.quiz ||
            !response.quiz.questions
          ) {
            throw new Error("Failed to generate quiz");
          }

          // Create the quiz object
          const quiz = {
            id: Date.now().toString(),
            materialId: material.id,
            materialName: material.name,
            dateCreated: new Date().toISOString(),
            completed: false,
            score: null,
            questions: response.quiz.questions.map((q, index) => ({
              id: `q${index + 1}`,
              text: q.question,
              options: q.options,
              correctAnswer: q.correctAnswerIndex,
              userAnswer: null,
            })),
          };

          // Add the quiz to our list
          this.quizzes.push(quiz);
          if (!this.saveData()) {
            throw new Error("Failed to save quiz data");
          }

          // Hide loading modal
          document.getElementById("loading-modal").classList.remove("active");

          // Start the quiz
          this.startQuiz(quiz.id);
        })
        .catch((error) => {
          console.error("Error generating quiz:", error);
          document.getElementById("loading-modal").classList.remove("active");
          this.showNotification(
            "Error",
            "Fehler beim Erstellen des Quiz. Bitte versuche es später erneut.",
            "error"
          );
        });
    },

    updateQuizzesList: function () {
      const quizContainer = document.querySelector(".quiz-container");

      if (this.quizzes.length === 0) {
        quizContainer.innerHTML =
          '<p class="empty-state">Keine Quiz verfügbar. Erstelle ein Quiz aus deinen Lernmaterialien.</p>';
        quizContainer.classList.add("empty");
        return;
      }

      quizContainer.classList.remove("empty");
      quizContainer.innerHTML = "";

      this.quizzes.forEach((quiz) => {
        const quizCard = document.createElement("div");
        quizCard.className = "material-card";
        quizCard.setAttribute("data-id", quiz.id);

        quizCard.innerHTML = `
                    <div class="material-icon">
                        <i class="fas fa-question-circle"></i>
                    </div>
                    <div class="material-info">
                        <h3>Quiz: ${quiz.materialName}</h3>
                        <p>Erstellt am ${new Date(
                          quiz.dateCreated
                        ).toLocaleDateString("de-DE")}</p>
                        <small>${
                          quiz.questions ? quiz.questions.length : 0
                        } Fragen</small>
                    </div>
                    <div class="material-progress">
                        <p>${
                          quiz.completed
                            ? `Punkte: ${quiz.score}%`
                            : "Nicht bearbeitet"
                        }</p>
                        <div class="progress-bar">
                            <div class="progress" style="width: ${
                              quiz.completed ? quiz.score + "%" : "0%"
                            }"></div>
                        </div>
                    </div>
                    <button class="delete-material" title="Quiz löschen">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `;

        // Add click event for starting the quiz
        quizCard.addEventListener("click", (e) => {
          // Don't start quiz if delete button was clicked
          if (!e.target.closest(".delete-material")) {
            this.startQuiz(quiz.id);
          }
        });

        // Add delete functionality
        const deleteBtn = quizCard.querySelector(".delete-material");
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation(); // Prevent starting the quiz
          this.confirmDeleteQuiz(quiz.id);
        });

        quizContainer.appendChild(quizCard);
      });
    },

    // Confirm quiz deletion
    confirmDeleteQuiz: function (quizId) {
      const quiz = this.quizzes.find((q) => q.id === quizId);
      if (!quiz) return;

      if (
        confirm(
          `Möchtest du wirklich das Quiz zu "${quiz.materialName}" löschen?`
        )
      ) {
        this.quizzes = this.quizzes.filter((q) => q.id !== quizId);
        this.saveData();
        this.updateUI();
        this.showNotification(
          "Gelöscht",
          "Quiz wurde erfolgreich gelöscht",
          "success"
        );
      }
    },

    startQuiz: function (quizId) {
      const quiz = this.quizzes.find((q) => q.id === quizId);
      if (!quiz) return;

      this.currentQuiz = quiz;
      this.currentQuiz.currentQuestionIndex = 0;

      // Reset user answers if quiz not completed
      if (!quiz.completed) {
        quiz.questions.forEach((q) => {
          q.userAnswer = null;
        });
      }

      // Show quiz page
      this.showPage("quizzes");

      // Hide quiz list, show active quiz
      document.getElementById("quiz-list").classList.add("hidden");
      document.getElementById("active-quiz").classList.remove("hidden");
      document.getElementById("quiz-results").classList.add("hidden");

      // Set quiz title
      document.getElementById(
        "quiz-title"
      ).textContent = `Quiz: ${quiz.materialName}`;

      // Show first question
      this.showQuestion(0);
    },

    exitQuiz: function () {
      // Reset current quiz
      this.currentQuiz = null;

      // Show quiz list, hide active quiz
      document.getElementById("quiz-list").classList.remove("hidden");
      document.getElementById("active-quiz").classList.add("hidden");
      document.getElementById("quiz-results").classList.add("hidden");
    },

    showQuestion: function (index) {
      const quiz = this.currentQuiz;
      const question = quiz.questions[index];

      // Update question counter
      document.getElementById("question-counter").textContent = `Frage ${
        index + 1
      }/${quiz.questions.length}`;

      // Update progress bar
      const progress = ((index + 1) / quiz.questions.length) * 100;
      document.querySelector(
        ".quiz-progress .progress"
      ).style.width = `${progress}%`;

      // Update question text
      document.getElementById("question-text").textContent = question.text;

      // Create options
      const optionsContainer = document.getElementById("options-container");
      optionsContainer.innerHTML = "";

      question.options.forEach((option, optionIndex) => {
        const optionElement = document.createElement("div");
        optionElement.className = "option";

        // If quiz is completed, show correct/incorrect answers
        if (quiz.completed) {
          if (optionIndex === question.correctAnswer) {
            optionElement.classList.add("correct");
          } else if (optionIndex === question.userAnswer) {
            optionElement.classList.add("incorrect");
          }
        } else if (question.userAnswer === optionIndex) {
          optionElement.classList.add("selected");
        }

        optionElement.textContent = option;

        // If quiz is not completed yet, make options clickable
        if (!quiz.completed) {
          optionElement.addEventListener("click", () => {
            // Select this option
            document
              .querySelectorAll(".option")
              .forEach((o) => o.classList.remove("selected"));
            optionElement.classList.add("selected");

            // Save user answer
            question.userAnswer = optionIndex;
          });
        }

        optionsContainer.appendChild(optionElement);
      });

      // Update next button text
      const nextButton = document.getElementById("next-question");
      const finishButton = document.getElementById("finish-quiz");

      if (index === quiz.questions.length - 1) {
        nextButton.classList.add("hidden");
        finishButton.classList.remove("hidden");
      } else {
        nextButton.classList.remove("hidden");
        finishButton.classList.add("hidden");
      }
    },

    nextQuestion: function () {
      const quiz = this.currentQuiz;
      const currentIndex = quiz.currentQuestionIndex;

      // Check if user selected an answer
      if (quiz.questions[currentIndex].userAnswer === null) {
        this.showNotification(
          "Info",
          "Bitte wähle eine Antwort aus bevor du fortfährst",
          "info"
        );
        return;
      }

      // Move to next question
      quiz.currentQuestionIndex++;
      this.showQuestion(quiz.currentQuestionIndex);
    },

    finishQuiz: function () {
      const quiz = this.currentQuiz;
      const lastQuestion = quiz.questions[quiz.questions.length - 1];

      // Check if user selected an answer for the last question
      if (lastQuestion.userAnswer === null) {
        this.showNotification(
          "Info",
          "Bitte wähle eine Antwort für die letzte Frage",
          "info"
        );
        return;
      }

      // Calculate score
      let correctCount = 0;
      let wrongQuestions = [];

      quiz.questions.forEach((question, index) => {
        if (question.userAnswer === question.correctAnswer) {
          correctCount++;
        } else {
          wrongQuestions.push({
            quizId: quiz.id,
            questionId: question.id,
            question: question.text,
            options: question.options,
            correctAnswer: question.correctAnswer,
            userAnswer: question.userAnswer,
          });
        }
      });

      const score = Math.round((correctCount / quiz.questions.length) * 100);

      // Update quiz
      quiz.completed = true;
      quiz.score = score;

      // Save wrong questions for review - but limit to prevent storage issues
      // Only keep the most recent 20 wrong questions
      this.wrongQuestions = [...this.wrongQuestions, ...wrongQuestions].slice(
        -20
      );
      if (!this.saveData()) {
        this.showNotification(
          "Warning",
          "Deine Ergebnisse konnten nicht gespeichert werden. Speicherplatzproblem.",
          "warning"
        );
      }

      // Show results
      document.getElementById("active-quiz").classList.add("hidden");
      document.getElementById("quiz-results").classList.remove("hidden");

      document.getElementById(
        "correct-count"
      ).textContent = `${correctCount}/${quiz.questions.length}`;
      document.getElementById("incorrect-count").textContent = `${
        quiz.questions.length - correctCount
      }/${quiz.questions.length}`;
      document.getElementById("score-percent").textContent = `${score}%`;

      // Show wrong questions
      const reviewContainer = document.getElementById("review-questions");
      reviewContainer.innerHTML = "";

      if (wrongQuestions.length === 0) {
        reviewContainer.innerHTML =
          '<p class="empty-state">Perfekte Punktzahl! Keine Fragen zu wiederholen.</p>';
      } else {
        wrongQuestions.forEach((q) => {
          const questionReview = document.createElement("div");
          questionReview.className = "question-review";

          questionReview.innerHTML = `
                        <h4>${q.question}</h4>
                        <p class="wrong-answer">Deine Antwort: ${
                          q.options[q.userAnswer]
                        }</p>
                        <p class="correct-answer">Richtige Antwort: ${
                          q.options[q.correctAnswer]
                        }</p>
                    `;

          reviewContainer.appendChild(questionReview);
        });
      }

      // Show a notification
      const message =
        score >= 70
          ? "Gut gemacht! Du hast das Quiz bestanden."
          : "Du solltest dieses Material nochmal wiederholen.";

      this.showNotification("Quiz abgeschlossen", message, "info");
    },

    retryIncorrectQuestions: function () {
      // Get wrong questions for the current material
      const materialWrongQuestions = this.wrongQuestions.filter(
        (q) => q.quizId === this.currentQuiz.id
      );

      if (materialWrongQuestions.length === 0) {
        this.showNotification(
          "Info",
          "Keine falschen Antworten zum Wiederholen",
          "info"
        );
        return;
      }

      // Create a new quiz from wrong questions
      const reviewQuiz = {
        id: "review-" + Date.now().toString(),
        materialId: this.currentQuiz.materialId,
        materialName: this.currentQuiz.materialName + " (Wiederholung)",
        dateCreated: new Date().toISOString(),
        completed: false,
        score: null,
        questions: materialWrongQuestions.map((q) => ({
          id: "rev-" + q.questionId,
          text: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          userAnswer: null,
        })),
      };

      // Add the quiz
      this.quizzes.push(reviewQuiz);
      if (!this.saveData()) {
        this.showNotification(
          "Warning",
          "Quiz konnte nicht gespeichert werden. Speicherplatzproblem.",
          "warning"
        );
        return;
      }

      // Start the new quiz
      this.startQuiz(reviewQuiz.id);

      this.showNotification(
        "Wiederholung",
        "Quiz mit deinen falsch beantworteten Fragen wurde erstellt",
        "info"
      );
    },

    addExam: function () {
      try {
        // Get form values
        const name = document.getElementById("exam-name").value.trim();
        const subject = document.getElementById("exam-subject").value.trim();
        const date = document.getElementById("exam-date").value;
        const time = document.getElementById("exam-time").value;

        // Validation
        if (!name || !subject || !date) {
          this.showNotification(
            "Fehler",
            "Bitte fülle alle Pflichtfelder aus",
            "error"
          );
          return;
        }

        // Get selected materials
        const materialsSelect = document.getElementById("exam-materials");
        const selectedMaterials = Array.from(
          materialsSelect.selectedOptions
        ).map((option) => option.value);

        // Create exam object
        const exam = {
          id: Date.now().toString(),
          name: name,
          subject: subject,
          date: date + (time ? `T${time}:00` : "T00:00:00"),
          materials: selectedMaterials,
        };

        // Add exam and save
        this.exams.push(exam);
        if (!this.saveData()) {
          throw new Error("Failed to save exam data");
        }

        // Reset form
        document.getElementById("exam-form").reset();

        // Update UI
        this.updateUI();

        this.saveData(); // Save data to IndexedDB

        // Notify user
        this.showNotification(
          "Erfolg",
          "Prüfung erfolgreich hinzugefügt!",
          "success"
        );

        // Generate study tips with Ollama
        if (selectedMaterials.length > 0) {
          this.getExamStudyTips(exam);
        }
      } catch (err) {
        console.error("Error adding exam:", err);
        this.showNotification(
          "Error",
          "Fehler beim Hinzufügen der Prüfung. Speicherplatzproblem.",
          "error"
        );
      }
    },

    getExamStudyTips: function (exam) {
      // Get materials for this exam
      const examMaterials = this.materials.filter((material) => {
        return exam.materials.includes(material.id);
      });

      if (examMaterials.length === 0) return;

      // Calculate days until exam
      const examDate = new Date(exam.date);
      const today = new Date();
      const daysLeft = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));

      // Get study tips from Ollama
      this.callOllamaAPI({
        action: "getStudyTips",
        exam: {
          name: exam.name,
          subject: exam.subject,
          daysLeft: daysLeft,
        },
        materials: examMaterials.map((m) => ({
          name: m.name,
          completed: m.completed,
        })),
      })
        .then((response) => {
          if (response && response.success && response.studyTips) {
            this.showNotification(
              "Study Tips",
              "Neue Lerntipps für deine Prüfung verfügbar!",
              "info"
            );

            // Store study tips with the exam
            exam.studyTips = response.studyTips;
            this.saveData();
          }
        })
        .catch((error) => {
          console.error("Error getting study tips:", error);
        });
    },

    updateExamMaterialsDropdown: function () {
      const select = document.getElementById("exam-materials");
      select.innerHTML = "";

      if (this.materials.length === 0) {
        const option = document.createElement("option");
        option.disabled = true;
        option.selected = true;
        option.textContent = "Keine Materialien verfügbar";
        select.appendChild(option);
        return;
      }

      this.materials.forEach((material) => {
        const option = document.createElement("option");
        option.value = material.id;
        option.textContent = material.name;
        select.appendChild(option);
      });
    },

    updateExamsList: function () {
      const examsContainer = document.getElementById("exams-container");

      if (this.exams.length === 0) {
        examsContainer.innerHTML =
          '<p class="empty-state">Noch keine Prüfungen geplant.</p>';
        return;
      }

      examsContainer.innerHTML = "";

      // Sort exams by date
      const sortedExams = [...this.exams].sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );

      sortedExams.forEach((exam) => {
        const examDate = new Date(exam.date);
        const today = new Date();
        const daysLeft = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));

        const examCard = document.createElement("div");
        examCard.className = "exam-card";

        let countdownClass = "";
        if (daysLeft < 3) countdownClass = "urgent";
        else if (daysLeft < 7) countdownClass = "warning";

        examCard.innerHTML = `
                    <div class="exam-info">
                        <h3>${exam.name}</h3>
                        <p class="exam-date"><i class="fas fa-calendar-day"></i> ${examDate.toLocaleDateString(
                          "de-DE"
                        )}</p>
                        <p class="exam-subject"><i class="fas fa-book"></i> ${
                          exam.subject
                        }</p>
                    </div>
                    <div class="exam-countdown ${countdownClass}">
                        <div class="countdown-value">${daysLeft}</div>
                        <div class="countdown-label">Tage übrig</div>
                    </div>
                `;

        // Add study tips button if available
        if (exam.studyTips) {
          const tipsBtn = document.createElement("button");
          tipsBtn.className = "show-tips-btn";
          tipsBtn.innerHTML = '<i class="fas fa-lightbulb"></i>';
          tipsBtn.title = "Lerntipps anzeigen";

          tipsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.showStudyTipsModal(exam);
          });

          examCard.appendChild(tipsBtn);
        }

        // Add delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-exam";
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm("Möchtest du diese Prüfung wirklich löschen?")) {
            this.deleteExam(exam.id);
          }
        });

        examCard.appendChild(deleteBtn);
        examsContainer.appendChild(examCard);
      });
    },

    showStudyTipsModal: function (exam) {
      // Create modal for displaying study tips
      const modal = document.createElement("div");
      modal.className = "modal active study-tips-modal";

      modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Lerntipps für: ${exam.name}</h2>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        ${exam.studyTips}
                    </div>
                    <div class="modal-footer">
                        <button class="btn-primary close-btn">Schließen</button>
                    </div>
                </div>
            `;

      document.body.appendChild(modal);

      // Add event listeners for closing
      modal.querySelector(".close-modal").addEventListener("click", () => {
        modal.remove();
      });

      modal.querySelector(".close-btn").addEventListener("click", () => {
        modal.remove();
      });

      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });
    },

    deleteExam: function (examId) {
      this.exams = this.exams.filter((exam) => exam.id !== examId);
      if (!this.saveData()) {
        this.showNotification(
          "Warning",
          "Prüfung wurde gelöscht, aber Änderungen konnten nicht gespeichert werden.",
          "warning"
        );
        return;
      }
      this.updateUI();
      this.showNotification("Gelöscht", "Prüfung wurde entfernt", "success");
    },

    updateStudyAgenda: function () {
      const agendaContainer = document.getElementById("agenda-container");

      // Check if we have upcoming exams
      const upcomingExams = this.exams
        .filter((exam) => {
          return new Date(exam.date) > new Date();
        })
        .sort((a, b) => new Date(a.date) - new Date(b.date));

      if (upcomingExams.length === 0) {
        agendaContainer.innerHTML =
          '<p class="empty-state">Keine anstehenden Prüfungen. Füge eine Prüfung hinzu, um einen Lernplan zu erstellen.</p>';
        return;
      }

      // For this prototype, we'll create a simple agenda based on the nearest exam
      const nextExam = upcomingExams[0];
      const examDate = new Date(nextExam.date);
      const today = new Date();
      const daysLeft = Math.ceil((examDate - today) / (1000 * 60 * 60 * 24));

      // Get materials for this exam
      const examMaterials = this.materials.filter((material) => {
        return nextExam.materials.includes(material.id);
      });

      // Generate agenda
      agendaContainer.innerHTML = "";

      // If we don't have an AI-generated study plan yet, generate one with Ollama
      if (!nextExam.studyPlan && daysLeft > 0 && examMaterials.length > 0) {
        this.callOllamaAPI({
          action: "generateStudyPlan",
          exam: {
            name: nextExam.name,
            subject: nextExam.subject,
            daysLeft: daysLeft,
          },
          materials: examMaterials.map((m) => ({
            name: m.name,
            completed: m.completed,
          })),
        })
          .then((response) => {
            if (response && response.success && response.studyPlan) {
              // Store study plan with the exam
              nextExam.studyPlan = response.studyPlan;
              this.saveData();

              // Update the agenda container with the new study plan
              agendaContainer.innerHTML = response.studyPlan;
            } else {
              this.showBasicAgenda(
                agendaContainer,
                nextExam,
                examMaterials,
                daysLeft
              );
            }
          })
          .catch((error) => {
            console.error("Error generating study plan:", error);
            this.showBasicAgenda(
              agendaContainer,
              nextExam,
              examMaterials,
              daysLeft
            );
          });
      } else if (nextExam.studyPlan) {
        // Show existing study plan
        agendaContainer.innerHTML = nextExam.studyPlan;
      } else {
        this.showBasicAgenda(
          agendaContainer,
          nextExam,
          examMaterials,
          daysLeft
        );
      }

      // Add urgent message if exam is very soon
      if (daysLeft < 3) {
        const urgentMessage = document.createElement("div");
        urgentMessage.className = "urgent-message";
        urgentMessage.innerHTML = `
                    <i class="fas fa-exclamation-circle"></i>
                    <div>
                        <strong>Achtung!</strong> Deine Prüfung "${nextExam.name}" findet in ${daysLeft} Tagen statt!
                        Widme heute so viel Zeit wie möglich dem Lernen.
                    </div>
                `;
        agendaContainer.appendChild(urgentMessage);
      }
    },

    showBasicAgenda: function (container, exam, materials, daysLeft) {
      // Generate a basic agenda when AI-generated one isn't available
      container.innerHTML = `
                <div class="agenda-header">
                    <p>Lernplan für: <strong>${exam.name}</strong> (in ${daysLeft} Tagen)</p>
                </div>
            `;

      const agendaItems = document.createElement("div");
      agendaItems.className = "agenda-items";

      // Create different days
      const dayLabels = ["Heute", "Morgen", "In 2 Tagen", "Später"];
      const dayValues = [0, 1, 2, 3];

      const completedMaterials = materials.filter((m) => m.completed).length;
      const progress =
        materials.length > 0
          ? Math.round((completedMaterials / materials.length) * 100)
          : 0;

      dayValues
        .slice(0, Math.min(dayValues.length, daysLeft))
        .forEach((day, index) => {
          const daySection = document.createElement("div");
          daySection.className = "agenda-day";

          daySection.innerHTML = `
                    <h3>${dayLabels[index]}</h3>
                    <ul>
                        ${
                          index === 0
                            ? `
                        <li>
                            Lernmaterialien durchsehen (${progress}% abgeschlossen)
                            ${
                              progress === 100
                                ? '<i class="fas fa-check"></i>'
                                : ""
                            }
                        </li>
                        `
                            : ""
                        }
                        
                        ${
                          index === 0
                            ? materials
                                .map(
                                  (m) => `
                        <li class="${m.completed ? "completed" : ""}">
                            "${m.name}" ${
                                    m.completed ? "wiederholen" : "bearbeiten"
                                  }
                            ${m.completed ? '<i class="fas fa-check"></i>' : ""}
                        </li>
                        `
                                )
                                .join("")
                            : ""
                        }
                        
                        ${
                          index === 1
                            ? `
                        <li>Übungsfragen bearbeiten</li>
                        <li>Zusammenfassungen erstellen</li>
                        `
                            : ""
                        }
                        
                        ${
                          index === 2
                            ? `
                        <li>Lernkarten durchgehen</li>
                        <li>Wiederholung der Schlüsselkonzepte</li>
                        `
                            : ""
                        }
                        
                        ${
                          index === 3
                            ? `
                        <li>Generalprobe durchführen</li>
                        <li>Entspannen und früh schlafen gehen</li>
                        `
                            : ""
                        }
                    </ul>
                `;

          agendaItems.appendChild(daySection);
        });

      container.appendChild(agendaItems);
    },

    // Add this function to your app object
    saveSummaryToIndexedDB: function (materialId, summaryText) {
      return this.initIndexedDB().then((db) => {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(["summaries"], "readwrite");
          const store = transaction.objectStore("summaries");

          const request = store.put({ id: materialId, summary: summaryText });

          request.onsuccess = () => resolve(true);
          request.onerror = () => {
            console.error("Error saving summary to IndexedDB");
            reject(request.error);
          };
        });
      });
    },

    // Add this function to get summaries from IndexedDB
    getSummaryFromIndexedDB: function (materialId) {
      return this.initIndexedDB().then((db) => {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(["summaries"], "readonly");
          const store = transaction.objectStore("summaries");

          const request = store.get(materialId);

          request.onsuccess = () => {
            if (request.result) {
              resolve(request.result.summary);
            } else {
              resolve(null);
            }
          };

          request.onerror = () => reject(request.error);
        });
      });
    },
    // Replace your initIndexedDB function with this
    initIndexedDB: function () {
      return new Promise((resolve, reject) => {
        console.log("Initializing IndexedDB...");
        const request = indexedDB.open("StudyCompanionDB", 3); // Increase version number

        request.onerror = (event) => {
          console.error("IndexedDB error:", event.target.errorCode);
          reject(event.target.errorCode);
        };

        request.onsuccess = (event) => {
          console.log("IndexedDB opened successfully");
          this.db = event.target.result;
          resolve(this.db);
        };

        request.onupgradeneeded = (event) => {
          console.log("Upgrading IndexedDB schema");
          const db = event.target.result;

          // Create consistent store names
          if (!db.objectStoreNames.contains("pdfs")) {
            console.log("Creating pdfs store");
            db.createObjectStore("pdfs", { keyPath: "id" });
          }

          if (!db.objectStoreNames.contains("summaries")) {
            console.log("Creating summaries store");
            db.createObjectStore("summaries", { keyPath: "id" });
          }
        };
      });
    },

    sendMessage: function () {
      const messageInput = document.getElementById("user-message");
      const chatMessages = document.getElementById("chat-messages");
      const message = messageInput.value.trim();

      if (!message) return;

      // Clear input
      messageInput.value = "";

      // Add user message to chat
      const userMessageElement = document.createElement("div");
      userMessageElement.className = "message user-message";
      userMessageElement.innerHTML = `<div class="message-bubble">${this.escapeHtml(
        message
      )}</div>`;
      chatMessages.appendChild(userMessageElement);

      // Show typing indicator
      const typingElement = document.createElement("div");
      typingElement.className = "message ai-message typing";
      typingElement.innerHTML = `
                <div class="message-bubble typing-dots">
                    <span></span><span></span><span></span>
                </div>
            `;
      chatMessages.appendChild(typingElement);

      // Scroll to bottom
      chatMessages.scrollTop = chatMessages.scrollHeight;

      // Get context for the AI
      const context = this.getChatContext();

      // Get the current material if we're viewing one
      let material = null;
      if (this.currentMaterial) {
        // Just send a subset of the content to avoid overloading the API
        const contentPreview = this.currentMaterial.content.substring(0, 1500);
        material = {
          id: this.currentMaterial.id,
          name: this.currentMaterial.name,
          content: contentPreview,
        };
      }

      // Call Ollama API
      this.callOllamaAPI({
        action: "chatMessage",
        message: message,
        context: context,
        material: material,
      })
        .then((response) => {
          // Remove typing indicator
          chatMessages.removeChild(typingElement);

          if (!response || !response.success) {
            throw new Error("Failed to get AI response");
          }

          // Add AI response to chat
          const aiMessageElement = document.createElement("div");
          aiMessageElement.className = "message ai-message";
          aiMessageElement.innerHTML = `<div class="message-bubble">${this.formatChatResponse(
            response.reply
          )}</div>`;
          chatMessages.appendChild(aiMessageElement);

          // Scroll to bottom
          chatMessages.scrollTop = chatMessages.scrollHeight;
        })
        .catch((error) => {
          // Remove typing indicator
          if (typingElement.parentNode) {
            chatMessages.removeChild(typingElement);
          }

          // Show error message
          const errorMessageElement = document.createElement("div");
          errorMessageElement.className = "message ai-message";
          errorMessageElement.innerHTML = `
                    <div class="message-bubble error">
                        Es tut mir leid, ich konnte deine Nachricht nicht verarbeiten. 
                        Bitte versuche es später erneut.
                    </div>
                `;
          chatMessages.appendChild(errorMessageElement);

          console.error("Error sending message:", error);

          // Scroll to bottom
          chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    },

    getChatContext: function () {
      // Prepare information about upcoming exams
      const today = new Date();
      const upcomingExams = this.exams
        .filter((exam) => {
          return new Date(exam.date) > today;
        })
        .map((exam) => {
          const examDate = new Date(exam.date);
          const daysLeft = Math.ceil(
            (examDate - today) / (1000 * 60 * 60 * 24)
          );
          return {
            name: exam.name,
            subject: exam.subject,
            daysLeft: daysLeft,
          };
        })
        .sort((a, b) => a.daysLeft - b.daysLeft);

      return {
        upcomingExams: upcomingExams,
      };
    },

    formatChatResponse: function (text) {
      // Format markdown-style headers FIRST (block elements)
      // Die Regel für ## ist hier bereits vorhanden und sollte nun korrekt funktionieren.
      text = text.replace(/^#\s+(.+)$/gm, "<h3>$1</h3>");
      text = text.replace(/^##\s+(.+)$/gm, "<h4>$1</h4>");
      text = text.replace(/^###\s+(.+)$/gm, "<h5>$1</h5>");

      // Format markdown-style lists (block elements)
      // Beachte: Die aktuelle Listenformatierung ist einfach gehalten.
      // Zeilen, die mit * oder - beginnen, werden in <li> umgewandelt.
      // Anschließend wird versucht, alle <li>-Elemente in ein einziges <ul> zu packen.
      // Dies funktioniert gut für einfache, zusammenhängende Listen.
      text = text.replace(/^\s*[*-]\s+(.+)$/gm, "<li>$1</li>");
      // Das /s Flag sorgt dafür, dass . auch Zeilenumbrüche matcht,
      // sodass eine Gruppe von <li>s, die durch \n getrennt sind, umschlossen wird.
      text = text.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");

      // Format bold text (inline elements)
      text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");

      // Format italic text (inline elements)
      text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
      text = text.replace(/_(.+?)_/g, "<em>$1</em>");

      // Replace line breaks with HTML <br> LAST
      text = text.replace(/\n/g, "<br>");

      return text;
    },

    escapeHtml: function (unsafe) {
      return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },

    // In app.js, update callOllamaAPI function
    // Check if the API is reachable
    callOllamaAPI: function (data) {
      const endpoint = this.apiEndpoint || "http://localhost:3000";

      console.log("Calling API with endpoint:", endpoint);

      return fetch(`${endpoint}/api/ai`, {
        // Changed from /api/ollama to /api/ai
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
          }
          return response.json();
        })
        .catch((error) => {
          console.error("API call failed:", error);
          this.showNotification(
            "API Error",
            "Verbindung zum AI-Server fehlgeschlagen. Überprüfe deine Internetverbindung.",
            "error"
          );
          throw error;
        });
    },

    showNotification: function (title, message, type = "info") {
      // Create notification container if it doesn't exist
      let container = document.querySelector(".notification-container");
      if (!container) {
        container = document.createElement("div");
        container.className = "notification-container";
        document.body.appendChild(container);
      }

      // Create notification
      const notification = document.createElement("div");
      notification.className = `notification ${type}`;

      notification.innerHTML = `
                <div class="notification-icon">
                    <i class="fas ${this.getIconForNotificationType(type)}"></i>
                </div>
                <div class="notification-content">
                    <h4>${title}</h4>
                    <p>${message}</p>
                </div>
                <button class="notification-close">&times;</button>
            `;

      container.appendChild(notification);

      // Add close event
      notification
        .querySelector(".notification-close")
        .addEventListener("click", () => {
          this.closeNotification(notification);
        });

      // Auto close after 5 seconds
      setTimeout(() => {
        this.closeNotification(notification);
      }, 5000);
    },

    closeNotification: function (notification) {
      notification.classList.add("hiding");
      setTimeout(() => {
        notification.remove();
      }, 300);
    },

    getIconForNotificationType: function (type) { // Example of the last method in appCoreLogic
      switch (type) {
        case "success": return "fa-check-circle";
        case "error": return "fa-exclamation-circle";
        case "warning": return "fa-exclamation-triangle";
        case "info": default: return "fa-info-circle";
      }
    },
  }; // End of appCoreLogic

 if (typeof window.app === 'undefined') {
    console.log("DOMContentLoaded (app.js): window.app nicht vorhanden, erstelle es.");
    window.app = {};
  } else {
    console.log("DOMContentLoaded (app.js): window.app bereits vorhanden, erweitere es.");
  }

  Object.assign(window.app, appCoreLogic);
  console.log("DOMContentLoaded (app.js): window.app wurde mit appCoreLogic erweitert.");

  // Enhance window.app.showPage function to handle alternative IDs and missing pages
  if (window.app && typeof window.app.showPage === 'function') {
    const originalShowPageGlobal = window.app.showPage;
    window.app.showPage = function (pageIdToShow) {
      console.log(`Attempting to show page (enhanced global): ${pageIdToShow}`);
      let currentPageId = pageIdToShow;

      // Handle material view ID inconsistency
      if (currentPageId === "material-view") {
        console.log("Redirecting global showPage to material-viewer");
        currentPageId = "material-viewer";
      }

      // Check if page exists before trying to show it; if not, create a placeholder
      const pageElement = document.getElementById(currentPageId);
      if (!pageElement) {
        console.error(`Page with ID "${currentPageId}" not found. Adding safety div.`);
        const placeholder = document.createElement("div");
        placeholder.id = currentPageId;
        placeholder.classList.add("page"); // Ensure it's treated as a page
        placeholder.innerHTML = `
          <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Fehler: Diese Seite konnte nicht geladen werden.</p>
            <button class="btn-primary" onclick="window.app.showPage('dashboard')">
              Zurück zum Dashboard
            </button>
          </div>`;
        const mainContent = document.querySelector(".main-content");
        if (mainContent) {
          // Remove existing placeholder for this ID if any, before adding
          const existingPlaceholder = mainContent.querySelector(`.page#${CSS.escape(currentPageId)}`);
          if (existingPlaceholder) {
            existingPlaceholder.remove();
          }
          mainContent.appendChild(placeholder);
        }
      }
      // Call the original function from appCoreLogic (now on window.app)
      // It should handle making 'currentPageId' visible and hiding others.
      return originalShowPageGlobal.call(window.app, currentPageId);
    };
    console.log("DOMContentLoaded (app.js): window.app.showPage wurde erweitert (mit Placeholder-Logik).");
  } else {
    console.error("DOMContentLoaded (app.js): window.app.showPage ist keine Funktion oder window.app nicht definiert, kann nicht erweitert werden.");
  }

  // Initialize the App ONCE, after window.app is fully configured.
  if (window.app && typeof window.app.init === 'function') {
    window.app.init();
  } else {
    console.error("DOMContentLoaded (app.js): App-Kern konnte nicht initialisiert werden. window.app.init ist nicht verfügbar.");
  }
}); // This is the single, correct closing brace for the DOMContentLoaded event listener.