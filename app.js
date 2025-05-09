const originalFetch = window.fetch;
window.fetch = function (url, options) {
  if (typeof url === "string" && url.includes("/api/ollama")) {
    console.warn("REDIRECTED API CALL: Using /api/ai instead of /api/ollama");
    url = url.replace("/api/ollama", "/api/ai");
  }
  return originalFetch(url, options);
};

document.addEventListener("DOMContentLoaded", function () {
  // Initialize the application
  window.app = {
    materials: [],
    quizzes: [],
    exams: [],
    currentMaterial: null,
    currentQuiz: null,
    wrongQuestions: [],
    apiEndpoint: "http://localhost:3000", // Points to your local Ollama server

    init: function () {
      this.loadData();
      this.setupEventListeners();
      this.updateUI();
      this.showPage("dashboard");
    },

    loadData: function () {
      // Load data from localStorage
      try {
        const materials = localStorage.getItem("study-materials");
        const quizzes = localStorage.getItem("study-quizzes");
        const exams = localStorage.getItem("study-exams");
        const wrongQuestions = localStorage.getItem("wrong-questions");

        if (materials) this.materials = JSON.parse(materials);
        if (quizzes) this.quizzes = JSON.parse(quizzes);
        if (exams) this.exams = JSON.parse(exams);
        if (wrongQuestions) this.wrongQuestions = JSON.parse(wrongQuestions);

        // Load PDF data from IndexedDB if available
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
    
      this.currentMaterial = material; // Set currentMaterial
    
      // Show the material page first to ensure elements exist
      this.showPage("material-viewer"); // Make sure this ID matches your HTML
    
      // Update material title
      const materialTitleEl = document.getElementById("material-title");
      if (materialTitleEl) {
        materialTitleEl.textContent = material.name;
      } else {
        console.warn("Element 'material-title' nicht gefunden.");
      }
    
      // Update button state based on completion
      const completeBtn = document.getElementById("mark-completed-btn");
      if (completeBtn) {
        completeBtn.innerHTML = material.completed
          ? '<i class="fas fa-times"></i> Als unvollständig markieren'
          : '<i class="fas fa-check"></i> Als abgeschlossen markieren';
        completeBtn.disabled = false; // Ensure button is enabled
      } else {
        console.warn("Element 'mark-completed-btn' nicht gefunden.");
      }
    
      // Load notes
      const notesEditor = document.getElementById("notes-editor");
      if (notesEditor) {
        notesEditor.value = material.notes || "";
      } else {
        console.warn("Element 'notes-editor' nicht gefunden.");
      }
    
      // Check if summary exists and update UI
      const summaryTextElement = document.getElementById("summary-text");
      const summaryContentContainer = document.getElementById("summary-content");
      const summaryTabButton = document.querySelector('#material-viewer .tabs .tab[data-tab="summary"]'); // Präziserer Selektor

      if (summaryTextElement && summaryContentContainer) {
        if (material.summary) {
          summaryTextElement.innerHTML = this.formatChatResponse ? this.formatChatResponse(material.summary) : material.summary;
          if (summaryTabButton) { // HIER DIE PRÜFUNG HINZUFÜGEN
            summaryTabButton.classList.add("has-content");
          } else {
            console.warn("Summary-Tab-Button nicht gefunden, um 'has-content' zu setzen.");
          }
        } else {
          summaryTextElement.innerHTML = `
            <div class="empty-state">
              <p>Noch keine Zusammenfassung vorhanden.</p>
              <button id="generate-summary-empty-state-btn" class="btn-primary">
                <i class="fas fa-magic"></i> Zusammenfassung erstellen
              </button>
            </div>
          `;
          if (summaryTabButton) { // HIER DIE PRÜFUNG HINZUFÜGEN
            summaryTabButton.classList.remove("has-content");
          } else {
            console.warn("Summary-Tab-Button nicht gefunden, um 'has-content' zu entfernen.");
          }
          const genSummaryEmptyStateBtn = document.getElementById('generate-summary-empty-state-btn');
          if (genSummaryEmptyStateBtn) {
            const newBtn = genSummaryEmptyStateBtn.cloneNode(true);
            genSummaryEmptyStateBtn.parentNode.replaceChild(newBtn, genSummaryEmptyStateBtn);
            newBtn.addEventListener("click", () => this.generateSummary(material));
          }
        }
      } else {
        console.warn("Elemente 'summary-text' oder 'summary-content' nicht gefunden.");
      }
    
      // Show loading state for PDF
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
        return;
      }

      // Die PDF-Rendering-Logik wird von pdf-fix.js übernommen,
      // das die renderPdf-Funktion auf window.app patcht.
      // Stelle sicher, dass this.renderPdf hier die gepatchte Version ist.
      if (typeof this.renderPdf === 'function') {
        this.renderPdf(material); // Diese Funktion sollte die Daten aus der DB laden und rendern
      } else {
          console.error("this.renderPdf ist keine Funktion. pdf-fix.js hat sie nicht korrekt gepatcht.");
          if (pdfContainer) {
            pdfContainer.innerHTML = `<div class="error-message"><p>Fehler beim Initialisieren der PDF-Anzeige.</p></div>`;
          }
      }
        
      // Activate the PDF tab by default
      // Stelle sicher, dass activateTab existiert und korrekt funktioniert
      if (typeof this.activateTab === 'function') {
        this.activateTab('pdf');
      } else {
        console.warn("this.activateTab ist keine Funktion.");
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

      if (typeof pdfjsLib === 'undefined' || !window.pdfjsLib.getDocument) {
        console.error("PDF.js library (pdfjsLib) not found or not initialized.");
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
              console.error("renderPdf: PDF data not found in IndexedDB for ID:", material.id);
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
            console.error("renderPdf: Error loading PDF from IndexedDB:", error);
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

    setupEventListeners: function () {
      // Navigation
      document.querySelectorAll(".nav-links li").forEach((item) => {
        item.addEventListener("click", () => {
          const page = item.getAttribute("data-page");
          this.showPage(page);
        });
      });

      const regenerateSummaryBtn = document.getElementById("regenerate-summary");
      if (regenerateSummaryBtn) {
        regenerateSummaryBtn.addEventListener("click", () => {
          if (this.currentMaterial) {
            delete this.currentMaterial.summary; // Summary aus dem Speicher entfernen
            if (this.db) { // Summary aus IndexedDB entfernen
              try {
                const transaction = this.db.transaction(["summaries"], "readwrite");
                const store = transaction.objectStore("summaries");
                store.delete(this.currentMaterial.id);
              } catch (e) { console.error("Fehler beim Löschen der Zusammenfassung aus IDB:", e); }
            }
            this.generateSummary(this.currentMaterial); // Neue generieren
          }
        });
      } else {
        console.warn("Button 'regenerate-summary' nicht gefunden.");
      }

      // PDF Upload
      const uploadArea = document.getElementById("upload-area");
      const pdfUpload = document.getElementById("pdf-upload");

      if (uploadArea && pdfUpload) {
        uploadArea.addEventListener("click", () => {
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
              this.showNotification("Error", "Bitte lade eine PDF-Datei hoch", "error");
            }
          }
        });

        pdfUpload.addEventListener("change", (e) => {
          if (e.target.files.length > 0) {
            const file = e.target.files[0];
            if (file.type === "application/pdf") {
              this.processPdfFile(file);
            } else {
              this.showNotification("Error", "Bitte lade eine PDF-Datei hoch", "error");
            }
          }
        });
      } else {
        console.warn("'upload-area' oder 'pdf-upload' nicht gefunden.");
      }

      // Material viewer back button
      const backBtnMaterialViewer = document.querySelector("#material-viewer .back-btn, #material-viewer #back-to-materials-btn"); // Flexibler Selektor
      if (backBtnMaterialViewer) {
        backBtnMaterialViewer.addEventListener("click", () => {
          this.showPage("materials");
        });
      } else {
        console.warn("Back-Button im Material Viewer nicht gefunden.");
      }

      // Material tabs
      document.querySelectorAll("#material-viewer .tabs .tab").forEach((tab) => {
        // Verwende eine Arrow Function, um den 'this'-Kontext beizubehalten
        tab.addEventListener("click", () => { // GEÄNDERT ZU ARROW FUNCTION
          const tabId = tab.getAttribute("data-tab");
          if (typeof this.activateTab === 'function') { // Prüfen ob activateTab existiert
            this.activateTab(tabId); 
          } else {
            console.error("this.activateTab ist keine Funktion in setupEventListeners für Material-Tabs.");
          }

          // Wenn Zusammenfassung-Tab geklickt wird und keine Zusammenfassung da ist, generiere sie
          if (tabId === "summary" && this.currentMaterial && !this.currentMaterial.summary) {
            if (typeof this.generateSummary === 'function') { // Prüfen ob generateSummary existiert
                this.generateSummary(this.currentMaterial);
            } else {
                console.error("this.generateSummary ist keine Funktion.");
            }
          }
        });
      });

      // Generate summary button (im Material Header)
      const generateSummaryHeaderBtn = document.getElementById("generate-summary-btn");
      if (generateSummaryHeaderBtn) {
        generateSummaryHeaderBtn.addEventListener("click", () => {
          if (this.currentMaterial) {
            this.generateSummary(this.currentMaterial);
          }
        });
      } else {
        console.warn("Button 'generate-summary-btn' im Header nicht gefunden.");
      }

      // Generate quiz button (im Material Header)
      const generateQuizHeaderBtn = document.getElementById("generate-quiz-btn");
      if (generateQuizHeaderBtn) {
        generateQuizHeaderBtn.addEventListener("click", () => {
          if (this.currentMaterial) {
            this.generateQuiz(this.currentMaterial);
          }
        });
      } else {
        console.warn("Button 'generate-quiz-btn' im Header nicht gefunden.");
      }
      
      // Save notes button
      const saveNotesBtn = document.getElementById("save-notes-btn");
      if (saveNotesBtn) {
        saveNotesBtn.addEventListener("click", () => {
          if (this.currentMaterial) {
            const notesEditor = document.getElementById("notes-editor");
            if (notesEditor) {
              this.currentMaterial.notes = notesEditor.value;
              this.saveData(); // Speichert alle Daten, inkl. Notizen im materials Array
              this.showNotification("Gespeichert", "Notizen erfolgreich gespeichert.", "success");
            }
          }
        });
      } else {
          console.warn("Button 'save-notes-btn' nicht gefunden.");
      }


      // Mark as completed button
      const markCompletedBtn = document.getElementById("mark-completed-btn");
      if (markCompletedBtn) {
        markCompletedBtn.addEventListener("click", () => {
          if (this.currentMaterial) {
            this.currentMaterial.completed = !this.currentMaterial.completed; // Toggle completed state
            this.saveData();
            // this.updateUI(); // updateUI wird oft global aufgerufen, ggf. spezifischeres Update
            
            // Button Text und Zustand direkt aktualisieren
            markCompletedBtn.innerHTML = this.currentMaterial.completed ?
              '<i class="fas fa-times"></i> Als unvollständig markieren' :
              '<i class="fas fa-check"></i> Als abgeschlossen markieren';
            
            this.showNotification("Status geändert", `Material als ${this.currentMaterial.completed ? 'abgeschlossen' : 'unvollständig'} markiert!`, "success");
          }
        });
      } else {
        console.warn("Button 'mark-completed-btn' nicht gefunden.");
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
        retryIncorrectBtn.addEventListener("click", () => this.retryIncorrectQuestions());
      }
      const backToQuizzesBtn = document.getElementById("back-to-quizzes");
      if (backToQuizzesBtn) {
        backToQuizzesBtn.addEventListener("click", () => {
          const quizResults = document.getElementById("quiz-results");
          const quizList = document.getElementById("quiz-list");
          if (quizResults) quizResults.classList.add("hidden");
          if (quizList) quizList.classList.remove("hidden");
        });
      }
      const exitQuizBtn = document.getElementById("exit-quiz");
      if (exitQuizBtn) {
        exitQuizBtn.addEventListener("click", () => {
          if (confirm("Möchtest du das Quiz wirklich verlassen? Dein Fortschritt wird nicht gespeichert.")) {
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
      // ... (Restliche Event Listener mit Null-Prüfungen versehen) ...
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

      // Update exams list
      this.updateExamsList();

      // Update quizzes list
      this.updateQuizzesList();
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
      document.getElementById("loading-message").textContent = "Verarbeite deine PDF...";

      // ID und Name HIER definieren, damit sie im reader.onload Scope verfügbar sind
      const materialId = Date.now().toString();
      const materialName = file.name.replace(/\.pdf$/i, ""); // Entfernt .pdf am Ende, case-insensitive

      // Das newMaterial Objekt hier ist nur für die Metadaten,
      // die eigentlichen PDF-Daten (fileData) werden separat behandelt.
      // Das 'content' Feld wird später durch extractPdfContent gefüllt.
      // const newMaterialShell = { // Dieses Objekt wird eigentlich erst nach dem Laden der Datei komplettiert
      //   id: materialId,
      //   name: materialName,
      //   fileName: file.name,
      //   dateAdded: new Date().toISOString(),
      //   completed: false,
      //   summary: null,
      //   content: "", // Wird durch extractPdfContent gefüllt
      //   // pages: [], // pages wird durch pdf.js Analyse gefüllt, falls implementiert
      //   fileAvailable: true, // Annahme, da gerade hochgeladen
      //   type: 'pdf'
      // };

      const reader = new FileReader();
      reader.onload = async (e) => {
        const fileData = e.target.result; // ArrayBuffer
        try {
            let extractedContentForAI = "";
            if (this.extractPdfContent) {
                try {
                    extractedContentForAI = await this.extractPdfContent(fileData);
                    console.log("PDF-Inhalt für AI extrahiert, Länge:", extractedContentForAI.length);
                } catch (extractError) {
                    console.warn("Konnte PDF-Inhalt für AI nicht extrahieren:", extractError);
                }
            }

            // Stelle sicher, dass savePdfToDB von pdf-fix.js bereitgestellt wird
            if (typeof this.savePdfToDB === 'function') {
                await this.savePdfToDB(materialId, fileData); // materialId ist jetzt definiert
            } else {
                console.error("savePdfToDB ist keine Funktion. Wurde pdf-fix.js korrekt geladen?");
                throw new Error("PDF Speicherfunktion nicht verfügbar.");
            }

            const newMaterial = { // newMaterial Objekt hier erstellen, NACHDEM alles da ist
                id: materialId, // materialId ist jetzt definiert
                name: materialName, // materialName ist jetzt definiert
                type: 'pdf',
                fileName: file.name, // fileName hinzufügen
                dateAdded: new Date().toISOString(), // dateAdded hinzufügen
                content: extractedContentForAI,
                summary: '', // oder null
                notes: '',
                completed: false,
                quizAttempts: []
                // fileData hier nicht speichern, es ist in IndexedDB
            };
            this.materials.push(newMaterial);
            this.saveData(); // Speichert Metadaten (ohne fileData) in localStorage
            this.updateMaterialsList();
            this.showNotification("Erfolg", `${materialName} erfolgreich hochgeladen.`, "success");
        } catch (error) {
            console.error("Fehler beim Verarbeiten der PDF-Datei:", error);
            this.showNotification("Fehler", `PDF konnte nicht verarbeitet werden: ${error.message}`, "error");
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

      // reader.readAsDataURL(file); // Du solltest readAsArrayBuffer verwenden für PDF.js
      reader.readAsArrayBuffer(file);
    },

    extractPdfContent: async function (fileData) {
      console.log("extractPdfContent: Versuche, PDF-Inhalt zu extrahieren.");
      if (typeof pdfjsLib === "undefined" || !pdfjsLib.getDocument) {
        // Überprüfung hinzugefügt
        console.error(
          "extractPdfContent: pdfjsLib ist nicht definiert oder nicht korrekt initialisiert!"
        );
        throw new ReferenceError("pdfjsLib is not defined or not ready");
      }

      try {
        const pdf = await pdfjsLib.getDocument({ data: fileData }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText +=
            textContent.items.map((item) => item.str).join(" ") + "\n";
        }
        console.log("extractPdfContent: Inhaltsextraktion erfolgreich.");
        return fullText.trim();
      } catch (error) {
        console.error(
          "extractPdfContent: Fehler beim Extrahieren des PDF-Inhalts:",
          error
        );
        // Gib den spezifischen Fehler weiter, damit die aufrufende Funktion ihn behandeln kann
        throw error; // Wichtig, um den Fehler an die aufrufende Funktion weiterzugeben
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

  

    // Replace your generateSummary function with this one
    generateSummary: function (material) {
      const statusEl = document.getElementById("summary-status");

      // First check if summary is in the material object
      if (material.summary) {
        console.log("Using in-memory summary for:", material.name);
        document.getElementById("summary-content").innerHTML =
          this.formatChatResponse(material.summary);
        statusEl.innerHTML = "✓ Zusammenfassung geladen";
        statusEl.className = "summary-status saved";
        return Promise.resolve();
      }

      // If not in memory, try to load from IndexedDB
      return this.getSummaryFromIndexedDB(material.id).then((summaryText) => {
        if (summaryText) {
          console.log(
            "Loading saved summary from IndexedDB for:",
            material.name
          );
          // Save it to the material object for future use
          material.summary = summaryText;
          document.getElementById("summary-content").innerHTML =
            this.formatChatResponse(summaryText);
          statusEl.innerHTML = "✓ Zusammenfassung aus Speicher geladen";
          statusEl.className = "summary-status saved";
          return Promise.resolve();
        }

        // If not in IndexedDB, generate a new summary
        document.getElementById("summary-content").innerHTML =
          '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Zusammenfassung wird generiert...</div>';
        statusEl.innerHTML = "Generiere neue Zusammenfassung...";
        statusEl.className = "summary-status";

        return this.callOllamaAPI({
          action: "summarize",
          material: {
            id: material.id,
            name: material.name,
            content: material.content.substring(0, 10000), // Limit content for API
          },
        })
          .then((response) => {
            console.log(
              "Summary response received, length:",
              response.summary?.length || 0
            );

            if (response && response.success && response.summary) {
              // Save to memory
              material.summary = response.summary;

              // Format and display
              const formattedSummary = this.formatChatResponse(
                response.summary
              );
              document.getElementById("summary-content").innerHTML =
                formattedSummary;

              // Save to IndexedDB (this doesn't affect localStorage limits)
              this.saveSummaryToIndexedDB(material.id, response.summary)
                .then(() => {
                  console.log("Summary saved to IndexedDB");
                  statusEl.innerHTML = "✓ Neue Zusammenfassung gespeichert";
                  statusEl.className = "summary-status saved";
                })
                .catch((err) => {
                  console.error("Failed to save summary to IndexedDB:", err);
                  statusEl.innerHTML = "⚠️ Zusammenfassung nicht gespeichert";
                  statusEl.className = "summary-status error";
                });

              // Also try localStorage saving but don't rely on it
              try {
                this.saveData();
              } catch (e) {
                console.warn(
                  "Could not save summary to localStorage (expected):",
                  e
                );
              }

              return response.summary;
            } else {
              throw new Error("Invalid summary response");
            }
          })
          .catch((error) => {
            console.error("Summary generation error:", error);
            document.getElementById("summary-content").innerHTML =
              '<div class="error-message">Fehler beim Erstellen der Zusammenfassung</div>';

            statusEl.innerHTML = "❌ API-Fehler: " + error.message;
            statusEl.className = "summary-status error";

            this.showNotification(
              "API Fehler",
              "Die Zusammenfassung konnte nicht generiert werden: " +
                error.message,
              "error"
            );
          });
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
      // Replace line breaks with HTML <br>
      text = text.replace(/\n/g, "<br>");

      // Format markdown-style lists
      text = text.replace(/^\s*[*-]\s+(.+)$/gm, "<li>$1</li>");
      text = text.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");

      // Format markdown-style headers
      text = text.replace(/^#\s+(.+)$/gm, "<h3>$1</h3>");
      text = text.replace(/^##\s+(.+)$/gm, "<h4>$1</h4>");
      text = text.replace(/^###\s+(.+)$/gm, "<h5>$1</h5>");

      // Format bold text
      text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");

      // Format italic text
      text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
      text = text.replace(/_(.+?)_/g, "<em>$1</em>");

      return text; // YOU WERE MISSING THIS RETURN STATEMENT
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

    getIconForNotificationType: function (type) {
      switch (type) {
        case "success":
          return "fa-check-circle";
        case "error":
          return "fa-exclamation-circle";
        case "warning":
          return "fa-exclamation-triangle";
        case "info":
        default:
          return "fa-info-circle";
      }
    },
  };

  // Enhance showPage function to handle alternative IDs
  const originalShowPage = app.showPage;
  app.showPage = function (pageId) {
    console.log(`Attempting to show page: ${pageId}`);

    // Handle material view ID inconsistency
    if (pageId === "material-view") {
      console.log("Redirecting to material-viewer");
      pageId = "material-viewer";
    }

    // Check if page exists before trying to show it
    const page = document.getElementById(pageId);
    if (!page) {
      console.error(`Page with ID "${pageId}" not found. Adding safety div.`);

      // Create a placeholder element to prevent errors
      const placeholder = document.createElement("div");
      placeholder.id = pageId;
      placeholder.classList.add("page");
      placeholder.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i>
        <p>Fehler: Diese Seite konnte nicht geladen werden.</p>
        <button class="btn-primary" onclick="app.showPage('dashboard')">
          Zurück zum Dashboard
        </button>
      </div>
    `;

      // Add to main content
      const mainContent = document.querySelector(".main-content");
      if (mainContent) {
        mainContent.appendChild(placeholder);
      }

      // Now we can proceed with showing the page
      return originalShowPage.call(this, pageId);
    }

    return originalShowPage.call(this, pageId);
  };
  // Initialize the application
  window.app.init();
});
