console.log("PDF Fix [V2] loading...");

document.addEventListener('DOMContentLoaded', function() {
  // Warte etwas, um sicherzustellen, dass app.js geladen und window.app initialisiert ist
  setTimeout(() => {
    if (!window.app) {
      console.error("PDF Fix [V2]: window.app ist nicht initialisiert!");
      return;
    }
    if (!window.pdfjsLib) {
      console.error("PDF Fix [V2]: pdfjsLib ist nicht geladen!");
      return;
    }

    console.log("PDF Fix [V2]: Initialisiere PDF System...");

    // 1. PDF.js Worker konfigurieren
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';
      console.log("PDF Fix [V2]: PDF.js worker konfiguriert.");
    } catch (e) {
      console.error("PDF Fix [V2]: Fehler bei Konfiguration des PDF.js workers:", e);
      return;
    }

    // 2. IndexedDB Funktionen für die App überschreiben/definieren
    const DB_NAME = "StudyCompanionPDFsDB";
    const DB_VERSION = 1;
    const PDF_STORE_NAME = "pdfStore";

    window.app.initPdfDB = function() {
      return new Promise((resolve, reject) => {
        console.log(`PDF Fix [V2]: Initialisiere IndexedDB '${DB_NAME}' Version ${DB_VERSION}`);
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
          console.log("PDF Fix [V2]: IndexedDB onupgradeneeded");
          const db = event.target.result;
          if (!db.objectStoreNames.contains(PDF_STORE_NAME)) {
            db.createObjectStore(PDF_STORE_NAME, { keyPath: "id" });
            console.log(`PDF Fix [V2]: Object store '${PDF_STORE_NAME}' erstellt.`);
          }
        };

        request.onsuccess = (event) => {
          console.log("PDF Fix [V2]: IndexedDB erfolgreich geöffnet.");
          resolve(event.target.result);
        };

        request.onerror = (event) => {
          console.error("PDF Fix [V2]: IndexedDB Fehler:", event.target.error);
          reject(event.target.error);
        };
      });
    };

    window.app.savePdfToDB = function(materialId, fileData) {
      console.log(`PDF Fix [V2]: Speichere PDF für ID '${materialId}'`);
      return window.app.initPdfDB().then(db => {
        return new Promise((resolve, reject) => {
          try {
            const transaction = db.transaction([PDF_STORE_NAME], "readwrite");
            const store = transaction.objectStore(PDF_STORE_NAME);
            const request = store.put({ id: materialId, data: fileData });

            request.onsuccess = () => {
              console.log(`PDF Fix [V2]: PDF '${materialId}' erfolgreich gespeichert.`);
              resolve(true);
            };
            request.onerror = (event) => {
              console.error(`PDF Fix [V2]: Fehler beim Speichern von PDF '${materialId}':`, event.target.error);
              reject(event.target.error);
            };
          } catch (e) {
            console.error(`PDF Fix [V2]: Transaktionsfehler beim Speichern von PDF '${materialId}':`, e);
            reject(e);
          }
        });
      });
    };

    window.app.getPdfFromDB = function(materialId) {
      console.log(`PDF Fix [V2]: Lade PDF für ID '${materialId}'`);
      return window.app.initPdfDB().then(db => {
        return new Promise((resolve, reject) => {
          try {
            const transaction = db.transaction([PDF_STORE_NAME], "readonly");
            const store = transaction.objectStore(PDF_STORE_NAME);
            const request = store.get(materialId);

            request.onsuccess = (event) => {
              if (event.target.result && event.target.result.data) {
                console.log(`PDF Fix [V2]: PDF '${materialId}' erfolgreich geladen.`);
                resolve(event.target.result.data);
              } else {
                console.warn(`PDF Fix [V2]: PDF '${materialId}' nicht in DB gefunden.`);
                resolve(null);
              }
            };
            request.onerror = (event) => {
              console.error(`PDF Fix [V2]: Fehler beim Laden von PDF '${materialId}':`, event.target.error);
              reject(event.target.error);
            };
          } catch (e) {
            console.error(`PDF Fix [V2]: Transaktionsfehler beim Laden von PDF '${materialId}':`, e);
            reject(e);
          }
        });
      });
    };

    // 3. PDF Render Funktion für die App überschreiben/definieren
    window.app.renderPdf = function(material) {
      console.log(`PDF Fix [V2]: Rendere PDF für Material ID '${material.id}'`);
      const pdfContainer = document.getElementById("pdf-renderer");

      if (!pdfContainer) {
        console.error("PDF Fix [V2]: PDF-Container 'pdf-renderer' nicht im DOM gefunden!");
        return;
      }
      pdfContainer.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i><p>PDF wird geladen...</p></div>';

      const displayPdf = (pdfData) => {
        if (!pdfData) {
           pdfContainer.innerHTML = `<div class="error-message"><p>PDF-Daten für '${material.name}' nicht verfügbar.</p></div>`;
           return;
        }
        try {
          window.pdfjsLib.getDocument({ data: pdfData }).promise.then(pdfDoc => {
            console.log(`PDF Fix [V2]: PDF Dokument '${material.name}' geladen, ${pdfDoc.numPages} Seiten.`);
            pdfContainer.innerHTML = ''; // Alten Inhalt leeren

            // Canvas für jede Seite erstellen und rendern
            for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
              pdfDoc.getPage(pageNum).then(page => {
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                canvas.style.marginBottom = "10px";

                pdfContainer.appendChild(canvas);

                const renderContext = {
                  canvasContext: context,
                  viewport: viewport
                };
                page.render(renderContext).promise.then(() => {
                  console.log(`PDF Fix [V2]: Seite ${pageNum} von '${material.name}' gerendert.`);
                }).catch(renderErr => {
                  console.error(`PDF Fix [V2]: Fehler beim Rendern von Seite ${pageNum} von '${material.name}':`, renderErr);
                });
              });
            }
          }).catch(docError => {
            console.error(`PDF Fix [V2]: Fehler beim Laden des PDF Dokuments '${material.name}':`, docError);
            pdfContainer.innerHTML = `<div class="error-message"><p>Fehler beim Öffnen des PDFs '${material.name}'. Ist es eine valide PDF-Datei?</p><p>${docError.message}</p></div>`;
          });
        } catch (e) {
          console.error(`PDF Fix [V2]: Kritischer Fehler beim Anzeigen des PDFs '${material.name}':`, e);
          pdfContainer.innerHTML = `<div class="error-message"><p>Kritischer Fehler beim Anzeigen des PDFs.</p></div>`;
        }
      };

      if (material.fileData) {
        console.log(`PDF Fix [V2]: Verwende PDF-Daten aus dem Materialobjekt für '${material.name}'.`);
        displayPdf(material.fileData);
      } else {
        console.log(`PDF Fix [V2]: Lade PDF-Daten aus DB für '${material.name}'.`);
        window.app.getPdfFromDB(material.id).then(fileData => {
          if (fileData) {
            material.fileData = fileData; // Für späteren Gebrauch cachen
            displayPdf(fileData);
          } else {
            pdfContainer.innerHTML = `<div class="error-message"><p>PDF '${material.name}' konnte nicht aus der Datenbank geladen werden. Bitte neu hochladen.</p></div>`;
          }
        }).catch(dbError => {
          console.error(`PDF Fix [V2]: Fehler beim Laden des PDFs '${material.name}' aus der DB:`, dbError);
          pdfContainer.innerHTML = `<div class="error-message"><p>Fehler beim Zugriff auf die PDF-Datenbank.</p></div>`;
        });
      }
    };

    if (window.app.processPdfFile) { // Geändert von handleFileUpload
        const originalProcessPdfFile = window.app.processPdfFile;
        window.app.processPdfFile = async function(file) { // Parameter ist 'file'
            console.log("PDF Fix [V2]: processPdfFile aufgerufen.");
            // const file = event.target.files[0]; // Nicht mehr nötig, 'file' wird direkt übergeben

            if (file && file.type === "application/pdf") {
                const materialId = Date.now().toString(); // ID hier generieren
                const materialName = file.name.replace(/\.pdf$/i, ""); // Name hier generieren

                const reader = new FileReader();
                reader.onload = async (e) => {
                    const fileData = e.target.result; // ArrayBuffer
                    try {
                        // PDF-Inhalt für die AI extrahieren (optional)
                        let extractedContentForAI = "";
                        if (window.app.extractPdfContent) {
                            try {
                                extractedContentForAI = await window.app.extractPdfContent(fileData);
                            } catch (extractError) {
                                console.warn("PDF Fix [V2]: Konnte PDF-Inhalt für AI nicht extrahieren:", extractError);
                            }
                        }

                        await window.app.savePdfToDB(materialId, fileData); // Benutze die neue DB Funktion

                        const newMaterial = {
                            id: materialId,
                            name: materialName,
                            type: 'pdf',
                            fileName: file.name, // ADDED
                            dateAdded: new Date().toISOString(), // ADDED
                            content: extractedContentForAI,
                            summary: '',
                            notes: '',
                            completed: false,
                            quizAttempts: [],
                            fileAvailable: true // ADDED
                            // fileData nicht hier speichern, wird bei Bedarf geladen
                        };
                        window.app.materials.push(newMaterial);
                        window.app.saveData();
                        window.app.updateMaterialsList();
                        window.app.showNotification("Erfolg", `${materialName} erfolgreich hochgeladen.`, "success");
                    } catch (error) {
                        console.error("PDF Fix [V2]: Fehler beim Speichern des PDFs nach Upload:", error);
                        window.app.showNotification("Fehler", "PDF konnte nicht gespeichert werden.", "error");
                    }
                };
                reader.readAsArrayBuffer(file);
                // event.target.value = ""; // Input zurücksetzen, falls 'event' hier verfügbar wäre
            } else {
                window.app.showNotification("Fehler", "Bitte eine PDF-Datei auswählen.", "error");
            }
        };
        console.log("PDF Fix [V2]: app.processPdfFile wurde gepatcht.");
    } else {
        console.warn("PDF Fix [V2]: app.processPdfFile konnte nicht gefunden und gepatcht werden.");
    }


    console.log("PDF Fix [V2]: Alle PDF-Funktionen wurden aktualisiert/überschrieben.");
    // Optional: UI neu laden oder eine Testfunktion aufrufen
    if (window.app.currentMaterial && window.app.currentPage === 'material-viewer') {
      // window.app.renderPdf(window.app.currentMaterial);
    }

  }, 1000); // Timeout, um sicherzustellen, dass app.js etc. geladen sind
});