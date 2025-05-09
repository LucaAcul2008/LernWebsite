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

    

    // Save PDF data to IndexedDB
    savePdfToIndexedDB: function (materialId, fileData) {
      return this.initIndexedDB().then(() => {
        return new Promise((resolve, reject) => {
          try {
            const transaction = this.db.transaction(["pdfs"], "readwrite"); // Changed from pdfFiles to pdfs
            const store = transaction.objectStore("pdfs"); // Changed from pdfFiles to pdfs

            const request = store.put({ id: materialId, data: fileData });

            request.onsuccess = () => resolve(true);
            request.onerror = (event) => {
              console.error(
                "Error saving PDF to IndexedDB:",
                event.target?.error || "Unknown error"
              );
              reject(event.target?.error || new Error("Failed to save PDF"));
            };
          } catch (error) {
            console.error("Transaction error in savePdfToIndexedDB:", error);
            reject(error);
          }
        });
      });
    },
    // Load PDF data from IndexedDB
    // In your app.js file
    getPdfFromIndexedDB: function (materialId) {
      return new Promise((resolve, reject) => {
        if (!this.db) {
          reject(new Error("Database not initialized"));
          return;
        }

        try {
          const transaction = this.db.transaction(["pdfs"], "readonly");
          const store = transaction.objectStore("pdfs");
          const request = store.get(materialId);

          request.onerror = (event) => {
            console.error("Error fetching PDF:", event.target.error);
            reject(event.target.error || new Error("Failed to fetch PDF data"));
          };

          request.onsuccess = (event) => {
            const result = event.target.result;
            if (result && result.data) {
              resolve(result.data);
            } else {
              console.warn("PDF data not found for ID:", materialId);
              reject(new Error("PDF not found"));
            }
          };
        } catch (error) {
          console.error("Transaction error:", error);
          reject(error);
        }
      });
    },

    // Then update your openMaterial function
    openMaterial: function (materialId) {
      // First ensure material exists
      const material = this.materials.find((m) => m.id === materialId);
      if (!material) {
        this.showNotification("Error", "Material nicht gefunden", "error");
        return;
      }

      this.currentMaterial = material;
      document.getElementById("material-title").textContent = material.name;

      // Update button state based on completion
      const completeBtn = document.getElementById("mark-completed-btn");
      if (completeBtn) {
        completeBtn.innerHTML = material.completed
          ? '<i class="fas fa-times"></i> Als unvollständig markieren'
          : '<i class="fas fa-check"></i> Als abgeschlossen markieren';
      }

      this.showPage("material-viewer");

      // Show loading state immediately
      const pdfContainer = document.getElementById("pdf-renderer");
      if (pdfContainer) {
        pdfContainer.innerHTML =
          '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>PDF wird geladen...</p></div>';
      }

      // Load notes
      document.getElementById("notes-editor").value = material.notes || "";

      // Check if summary exists and update UI
      console.log("Material has summary?", !!material.summary);
      const summaryText = document.getElementById("summary-text");
      if (summaryText) {
        if (material.summary) {
          summaryText.innerHTML =
            typeof marked !== "undefined"
              ? marked.parse(material.summary)
              : material.summary;
        } else {
          summaryText.innerHTML = `
        <div class="empty-state">
          <p>Noch keine Zusammenfassung vorhanden.</p>
          <button id="generate-summary-btn" class="btn-primary">
            <i class="fas fa-magic"></i> Zusammenfassung erstellen
          </button>
        </div>
      `;

          // Add event listener for the generate button
          const genSummaryBtn = document.getElementById("generate-summary-btn");
          if (genSummaryBtn) {
            genSummaryBtn.addEventListener("click", () =>
              this.generateSummary(material)
            );
          }
        }
      }

      // Load PDF data
      this.getPdfFromIndexedDB(material.id)
        .then((fileData) => {
          if (!fileData) {
            throw new Error("No PDF data available");
          }
          material.fileData = fileData;
          this.renderPdf(material);
        })
        .catch((err) => {
          console.error("Error retrieving PDF data:", err);
          if (pdfContainer) {
            pdfContainer.innerHTML = `
          <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Fehler beim Öffnen des Dokuments: ${
              err.message || "Unbekannter Fehler"
            }</p>
          </div>
        `;
          }
          this.showNotification(
            "Error",
            "Fehler beim Öffnen des Dokuments.",
            "error"
          );
        });
    },

    // Finally update your renderPdf function
    renderPdf: function (material) {
      const pdfContainer = document.getElementById("pdf-renderer");
      if (!pdfContainer) return;

      pdfContainer.innerHTML =
        '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>PDF wird geladen...</p></div>';

      // Ensure PDF.js is available
      if (!window.pdfjsLib) {
        console.error("PDF.js library not found");
        pdfContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i>
        <p>PDF.js Bibliothek konnte nicht geladen werden.</p>
      </div>
    `;
        return;
      }

      // Check if fileData exists and is valid
      if (!material || !material.fileData) {
        console.error("No PDF data available for this material");
        pdfContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i>
        <p>PDF konnte nicht geladen werden. Keine gültigen Daten vorhanden.</p>
      </div>
    `;
        return;
      }

      // Use PDF.js to render the PDF with proper error handling
      try {
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
            renderPage(pdf, 1, pagesContainer);

            // Add page navigation if multiple pages
            if (pdf.numPages > 1) {
              addPageNavigation(pdf, pagesContainer);
            }
          })
          .catch((error) => {
            console.error("Error loading PDF:", error);
            pdfContainer.innerHTML = `
          <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            <p>PDF konnte nicht geladen werden: ${
              error.message || "Unbekannter Fehler"
            }</p>
          </div>
        `;
          });
      } catch (error) {
        console.error("Exception in PDF rendering:", error);
        pdfContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i>
        <p>PDF konnte nicht verarbeitet werden: ${
          error.message || "Unbekannter Fehler"
        }</p>
      </div>
    `;
      }

      // Helper function to render a specific page
      function renderPage(pdf, pageNumber, container) {
        pdf.getPage(pageNumber).then((page) => {
          const viewport = page.getViewport({ scale: 1.5 });

          const pageContainer = document.createElement("div");
          pageContainer.className = "pdf-page";
          pageContainer.dataset.pageNumber = pageNumber;
          container.appendChild(pageContainer);

          const canvas = document.createElement("canvas");
          pageContainer.appendChild(canvas);

          const context = canvas.getContext("2d");
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };

          page.render(renderContext);
        });
      }

      // Helper function to add page navigation
      function addPageNavigation(pdf, container) {
        const pageNav = document.createElement("div");
        pageNav.className = "pdf-navigation";

        const prevButton = document.createElement("button");
        prevButton.className = "btn-secondary";
        prevButton.innerHTML =
          '<i class="fas fa-arrow-left"></i> Vorherige Seite';
        prevButton.disabled = true;

        const nextButton = document.createElement("button");
        nextButton.className = "btn-primary";
        nextButton.innerHTML =
          'Nächste Seite <i class="fas fa-arrow-right"></i>';

        const pageInfo = document.createElement("span");
        pageInfo.className = "page-info";
        pageInfo.textContent = `Seite 1 von ${pdf.numPages}`;

        pageNav.appendChild(prevButton);
        pageNav.appendChild(pageInfo);
        pageNav.appendChild(nextButton);

        pdfContainer.appendChild(pageNav);

        let currentPage = 1;

        prevButton.addEventListener("click", () => {
          if (currentPage > 1) {
            currentPage--;
            updatePageNavigation();
            scrollToPage(currentPage);
          }
        });

        nextButton.addEventListener("click", () => {
          if (currentPage < pdf.numPages) {
            currentPage++;
            // Render the next page if it doesn't exist yet
            if (
              !container.querySelector(
                `.pdf-page[data-page-number="${currentPage}"]`
              )
            ) {
              renderPage(pdf, currentPage, container);
            }
            updatePageNavigation();
            scrollToPage(currentPage);
          }
        });

        function updatePageNavigation() {
          pageInfo.textContent = `Seite ${currentPage} von ${pdf.numPages}`;
          prevButton.disabled = currentPage === 1;
          nextButton.disabled = currentPage === pdf.numPages;
        }

        function scrollToPage(pageNumber) {
          const pageElement = container.querySelector(
            `.pdf-page[data-page-number="${pageNumber}"]`
          );
          if (pageElement) {
            pageElement.scrollIntoView({ behavior: "smooth" });
          }
        }
      }
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

      // Update the handler for the regenerate button
      document
        .getElementById("regenerate-summary")
        ?.addEventListener("click", () => {
          if (this.currentMaterial) {
            // Delete existing summary from memory
            delete this.currentMaterial.summary;

            // Also delete from IndexedDB
            if (this.db) {
              const transaction = this.db.transaction(
                ["summaries"],
                "readwrite"
              );
              const store = transaction.objectStore("summaries");
              store.delete(this.currentMaterial.id);
            }

            // Generate a new one
            this.generateSummary(this.currentMaterial);
          }
        });

      // PDF Upload
      const uploadArea = document.getElementById("upload-area");
      const pdfUpload = document.getElementById("pdf-upload");

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
            this.proceFgssPdfFile(file);
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
      });

      document
        .getElementById("regenerate-summary")
        ?.addEventListener("click", () => {
          if (this.currentMaterial) {
            // Delete existing summary
            delete this.currentMaterial.summary;
            // Generate a new one
            this.generateSummary(this.currentMaterial);
          }
        });

      // Material viewer back button
      document.querySelector(".back-btn").addEventListener("click", () => {
        this.showPage("materials");
      });

      // Material tabs
      document.querySelectorAll(".material-tabs .tab").forEach((tab) => {
        tab.addEventListener("click", () => {
          const tabId = tab.getAttribute("data-tab");
          document
            .querySelectorAll(".material-tabs .tab")
            .forEach((t) => t.classList.remove("active"));
          document
            .querySelectorAll(".tab-pane")
            .forEach((p) => p.classList.remove("active"));

          tab.classList.add("active");
          document.getElementById(tabId + "-content").classList.add("active");

          // If summary tab is clicked, generate summary if it doesn't exist
          if (
            tabId === "summary" &&
            this.currentMaterial &&
            !this.currentMaterial.summary
          ) {
            this.generateSummary(this.currentMaterial);
          }
        });
      });

      // Generate quiz button
      document
        .getElementById("start-quiz-btn")
        .addEventListener("click", () => {
          if (this.currentMaterial) {
            this.generateQuiz(this.currentMaterial);
          }
        });

      // Mark as completed button
      document
        .getElementById("mark-completed-btn")
        .addEventListener("click", () => {
          if (this.currentMaterial) {
            this.currentMaterial.completed = true;
            this.saveData();
            this.updateUI();

            // Update button
            const btn = document.getElementById("mark-completed-btn");
            btn.innerHTML = '<i class="fas fa-check"></i> Abgeschlossen';
            btn.disabled = true;

            this.showNotification(
              "Success",
              "Material als abgeschlossen markiert!",
              "success"
            );
          }
        });

      // Quiz navigation
      document.getElementById("next-question").addEventListener("click", () => {
        this.nextQuestion();
      });

      document.getElementById("finish-quiz").addEventListener("click", () => {
        this.finishQuiz();
      });

      document
        .getElementById("retry-incorrect")
        .addEventListener("click", () => {
          this.retryIncorrectQuestions();
        });

      document
        .getElementById("back-to-quizzes")
        .addEventListener("click", () => {
          document.getElementById("quiz-results").classList.add("hidden");
          document.getElementById("quiz-list").classList.remove("hidden");
        });

      // Add exit quiz button
      document.getElementById("exit-quiz").addEventListener("click", () => {
        if (
          confirm(
            "Möchtest du das Quiz wirklich verlassen? Dein Fortschritt wird nicht gespeichert."
          )
        ) {
          this.exitQuiz();
        }
      });

      // Exam form
      document.getElementById("exam-form").addEventListener("submit", (e) => {
        e.preventDefault();
        this.addExam();
      });

      // AI Chat
      document.getElementById("send-message").addEventListener("click", () => {
        this.sendMessage();
      });

      document
        .getElementById("user-message")
        .addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
          }
        });
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
      // Show loading modal
      document.getElementById("loading-modal").classList.add("active");
      document.getElementById("loading-message").textContent =
        "Verarbeite deine PDF...";

      // Create a new material object with basic info
      const newMaterial = {
        id: Date.now().toString(),
        name: file.name.replace(".pdf", ""),
        fileName: file.name,
        dateAdded: new Date().toISOString(),
        completed: false,
        summary: null,
        content: "",
        pages: [],
        fileAvailable: true,
      };

      // Convert file to data URL for storage
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileData = e.target.result;

        // Use PDF.js to extract text content
        this.extractPdfContent(newMaterial, fileData)
          .then(() => {
            // Save the PDF data to IndexedDB
            return this.savePdfToIndexedDB(newMaterial.id, fileData);
          })
          .then(() => {
            // Add the material to our list (without the fileData for localStorage)
            this.materials.push(newMaterial);
            if (!this.saveData()) {
              throw new Error("Failed to save data");
            }

            // Update UI
            this.updateUI();

            // Hide loading modal
            document.getElementById("loading-modal").classList.remove("active");

            // Notify user
            this.showNotification(
              "Success",
              "PDF erfolgreich verarbeitet!",
              "success"
            );
          })
          .catch((error) => {
            console.error("Error processing PDF:", error);
            document.getElementById("loading-modal").classList.remove("active");
            this.showNotification(
              "Error",
              "Fehler beim Verarbeiten des PDFs. Bitte versuche es erneut.",
              "error"
            );
          });
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

      reader.readAsDataURL(file);
    },

    extractPdfContent: async function (material, fileData) {
      try {
        // Load the PDF using PDF.js
        const loadingTask = pdfjsLib.getDocument(fileData);
        const pdf = await loadingTask.promise;

        let fullText = "";
        material.pages = [];

        // Read each page
        for (let i = 1; i <= pdf.numPages; i++) {
          document.getElementById(
            "loading-message"
          ).textContent = `Verarbeite Seite ${i} von ${pdf.numPages}...`;

          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();

          // Extract text from page
          const pageText = textContent.items.map((item) => item.str).join(" ");
          fullText += pageText + " ";

          // Store page text
          material.pages.push({
            pageNumber: i,
            text: pageText,
          });

          // Get a thumbnail for display
          if (i === 1) {
            const viewport = page.getViewport({ scale: 0.5 });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d");
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
              canvasContext: context,
              viewport: viewport,
            }).promise;

            material.thumbnail = canvas.toDataURL("image/jpeg", 0.5); // Reduced quality for storage
          }
        }

        // Store the full text content
        material.content = fullText;
        return true;
      } catch (error) {
        console.error("Failed to extract PDF content:", error);
        throw error;
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

    openMaterial: function (materialId) {
      console.log("Opening material:", materialId);
      const material = this.materials.find((m) => m.id === materialId);
      if (!material) {
        console.error("Material not found:", materialId);
        return;
      }

      console.log("Material has summary?", !!material.summary);

      // Show the material page
      this.showPage("material-view");

      // Render the PDF
      this.renderPdf(material);

      // Clear previous content
      document.getElementById("summary-content").innerHTML = "";

      // If we have a saved summary, show it immediately
      if (material.summary) {
        document.getElementById("summary-tab").classList.add("has-content");
        document.getElementById("summary-content").innerHTML =
          this.formatChatResponse(material.summary);
      } else {
        document.getElementById("summary-tab").classList.remove("has-content");
      }

      // Show loading indicator
      document.getElementById("loading-modal").classList.add("active");
      document.getElementById("loading-message").textContent =
        "Lade Dokument...";

      // Check if material is available in IndexedDB
      if (!material.fileAvailable) {
        document.getElementById("loading-modal").classList.remove("active");
        this.showNotification(
          "Error",
          "PDF-Datei nicht verfügbar. Bitte lade die PDF erneut hoch.",
          "error"
        );
        return;
      }

      // Fetch PDF data from IndexedDB
      this.getPdfFromIndexedDB(material.id)
        .then((fileData) => {
          if (!fileData) {
            document.getElementById("loading-modal").classList.remove("active");
            this.showNotification(
              "Error",
              "PDF-Datei konnte nicht geladen werden. Bitte lade die PDF erneut hoch.",
              "error"
            );
            return;
          }

          // Store fileData temporarily for rendering
          this.currentMaterial.fileData = fileData;

          // Update material viewer
          document.getElementById("material-title").textContent = material.name;

          // Reset tabs
          document
            .querySelectorAll(".material-tabs .tab")
            .forEach((t) => t.classList.remove("active"));
          document
            .querySelectorAll(".tab-pane")
            .forEach((p) => p.classList.remove("active"));
          document
            .querySelector('.material-tabs .tab[data-tab="original"]')
            .classList.add("active");
          document.getElementById("original-content").classList.add("active");

          // Set mark as completed button state
          const completeBtn = document.getElementById("mark-completed-btn");
          if (material.completed) {
            completeBtn.innerHTML =
              '<i class="fas fa-check"></i> Abgeschlossen';
            completeBtn.disabled = true;
          } else {
            completeBtn.innerHTML =
              '<i class="fas fa-check"></i> Als abgeschlossen markieren';
            completeBtn.disabled = false;
          }

          // Render the PDF
          this.renderPdf(this.currentMaterial);

          // Hide loading modal
          document.getElementById("loading-modal").classList.remove("active");

          // Show the material viewer page
          this.showPage("material-viewer");
        })
        .catch((err) => {
          console.error("Error opening material:", err);
          document.getElementById("loading-modal").classList.remove("active");
          this.showNotification(
            "Error",
            "Fehler beim Öffnen des Dokuments.",
            "error"
          );
        });
    },

    // In app.js - Update the renderPdf function
    renderPdf: function (material) {
      const pdfContainer = document.getElementById("pdf-renderer");
      if (!pdfContainer) return;

      pdfContainer.innerHTML =
        '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>PDF wird geladen...</p></div>';

      // Check if fileData exists and is valid
      if (!material || !material.fileData) {
        console.error("No PDF data available for this material");
        pdfContainer.innerHTML = `
          <div class="error-message">
              <i class="fas fa-exclamation-triangle"></i>
              <p>PDF konnte nicht geladen werden. Keine gültigen Daten vorhanden.</p>
          </div>
      `;
        return;
      }

      // Use PDF.js to render the PDF with proper error handling
      try {
        pdfjsLib
          .getDocument({ data: material.fileData }) // Pass as an object with data property
          .promise.then((pdf) => {
            // Rest of your rendering code...
            pdfContainer.innerHTML = "";

            // Create container for pages
            const pagesContainer = document.createElement("div");
            pagesContainer.className = "pdf-pages";
            pdfContainer.appendChild(pagesContainer);

            // Render first page
            pdf.getPage(1).then((page) => {
              // Your existing rendering code
            });
          })
          .catch((error) => {
            console.error("Error loading PDF:", error);
            pdfContainer.innerHTML = `
                  <div class="error-message">
                      <i class="fas fa-exclamation-triangle"></i>
                      <p>PDF konnte nicht geladen werden: ${error.message}</p>
                  </div>
              `;
          });
      } catch (error) {
        console.error("Exception in PDF rendering:", error);
        pdfContainer.innerHTML = `
          <div class="error-message">
              <i class="fas fa-exclamation-triangle"></i>
              <p>PDF konnte nicht geladen werden: ${error.message}</p>
          </div>
      `;
      }
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
    initIndexedDB: function() {
      return new Promise((resolve, reject) => {
        try {
          console.log("Initializing IndexedDB...");
          
          if (!window.indexedDB) {
            const error = new Error("IndexedDB not supported in this browser");
            console.error(error);
            reject(error);
            return;
          }
          
          const request = window.indexedDB.open("StudyCompanionDB", 2);
          
          request.onerror = (event) => {
            // FIXED: Use error instead of errorCode
            const error = event.target.error || new Error("Unknown IndexedDB error");
            console.error("IndexedDB error:", error);
            reject(error);
          };
          
          request.onupgradeneeded = (event) => {
            console.log("Upgrading IndexedDB schema...");
            const db = event.target.result;
            
            // Use consistent store name "pdfs"
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
            console.log("IndexedDB initialized successfully");
            this.db = event.target.result;
            resolve(this.db);
          };
        } catch (error) {
          console.error("Exception during IndexedDB initialization:", error);
          reject(error);
        }
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
