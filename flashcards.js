document.addEventListener("DOMContentLoaded", function () {
  if (!window.app || typeof window.app.showNotification !== 'function') {
    console.error("Flashcards: App-Objekt (window.app) oder window.app.showNotification ist nicht gefunden/initialisiert!");
    const flashcardsPage = document.getElementById("flashcards");
    if (flashcardsPage) {
        flashcardsPage.innerHTML = "<p class='error-message'>Fehler: Flashcard-Modul konnte nicht korrekt geladen werden. Die Hauptanwendung ist möglicherweise nicht bereit.</p>";
    }
    return;
  }

  let flashcardSets = [];
  let currentSet = null; 
  let currentCardIndex = 0;
  let editingSet = null; 

  // DOM Element references
  const flashcardsPageView = document.getElementById("flashcards");
  const setsView = document.getElementById("flashcard-sets-view");
  const editorView = document.getElementById("flashcard-set-editor-view");
  const studyView = document.getElementById("flashcard-study-view");

  const createSetBtn = document.getElementById("create-flashcard-set-btn");
  const setsContainer = document.getElementById("flashcard-sets-container");

  const setNameInput = document.getElementById("flashcard-set-name");
  const cardsEditorContainer = document.getElementById("flashcards-editor-container");
  const addCardToSetBtn = document.getElementById("add-flashcard-to-set-btn");
  const saveSetBtn = document.getElementById("save-flashcard-set-btn"); 
  const cancelSetEditBtn = document.getElementById("cancel-flashcard-set-edit-btn");
  const editorTitleEl = document.getElementById("flashcard-set-editor-title");

  const studySetNameEl = document.getElementById("flashcard-study-set-name");
  const flashcardEl = document.querySelector("#flashcard-study-view .flashcard");
  const cardQuestionEl = document.getElementById("flashcard-question");
  const cardAnswerEl = document.getElementById("flashcard-answer");
  const prevCardBtn = document.getElementById("flashcard-prev-btn");
  const flipCardBtn = document.getElementById("flashcard-flip-btn");
  const nextCardBtn = document.getElementById("flashcard-next-btn");
  const finishSessionBtn = document.getElementById("finish-flashcard-session-btn");

  const srsControlsContainer = document.getElementById("flashcard-srs-controls");
  const srsButtons = srsControlsContainer ? srsControlsContainer.querySelectorAll(".btn-srs") : [];

  // --- Helper Functions ---
  function generateUniqueId(prefix = 'id-') {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  function escapeHtml(unsafe) {
    if (typeof unsafe !== "string") {
      console.warn("escapeHtml: Input was not a string, returning empty string. Input:", unsafe);
      return "";
    }
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // --- Core Flashcard Logic: Load & Save ---
  function loadFlashcardSets() {
    const storedSets = localStorage.getItem("flashcard-sets");
    let setsNeedResave = false;
    if (storedSets) {
      try {
        flashcardSets = JSON.parse(storedSets);
        if (!Array.isArray(flashcardSets)) flashcardSets = [];
        
        flashcardSets.forEach(set => {
          set.id = set.id || generateUniqueId('set-'); // Ensure set has an ID
          if (set.cards && Array.isArray(set.cards)) {
            set.cards.forEach(card => {
              if (!card.cardId) { // Assign unique ID to each card if missing
                card.cardId = generateUniqueId('card-');
                setsNeedResave = true; 
              }
              card.interval = card.interval ?? 0;
              card.repetitions = card.repetitions ?? 0;
              card.easeFactor = card.easeFactor ?? 2.5;
              card.dueDate = card.dueDate ?? new Date().toISOString();
              card.questionImage = card.questionImage ?? null;
              card.answerImage = card.answerImage ?? null;
            });
          } else {
            set.cards = []; // Ensure cards array exists
          }
        });
      } catch (e) {
        console.error("Fehler beim Parsen der Lernkarten-Sets aus localStorage:", e);
        window.app.showNotification("Ladefehler", "Gespeicherte Lernkarten konnten nicht gelesen werden.", "error");
        flashcardSets = [];
      }
    }
    if (setsNeedResave) {
        console.log("Einige Karten hatten keine IDs, IDs wurden generiert und Sets werden neu gespeichert.");
        saveFlashcardSets(); // Save back if IDs were generated
    }
    renderFlashcardSets();
  }

  function saveFlashcardSets() {
    try {
      localStorage.setItem("flashcard-sets", JSON.stringify(flashcardSets));
    } catch (e) {
      console.error("Fehler beim Speichern der Lernkarten-Sets in localStorage:", e);
      window.app.showNotification("Speicherfehler", "Lernkarten konnten nicht gespeichert werden (evtl. Speicher voll).", "error");
    }
  }

  // --- UI Rendering ---
  function renderFlashcardSets() {
    if (!setsContainer) {
        console.error("renderFlashcardSets: setsContainer nicht gefunden.");
        window.app.showNotification("UI Fehler", "Bereich zur Anzeige der Sets nicht gefunden.", "error");
        return;
    }
    setsContainer.innerHTML = "";
    if (flashcardSets.length === 0) {
      setsContainer.innerHTML = '<p class="empty-state"><i class="fas fa-layer-group"></i> Noch keine Lernkarten-Sets erstellt.</p>';
      return;
    }
    flashcardSets.forEach((set) => {
      const setCard = document.createElement("div");
      setCard.className = "material-card flashcard-set-card";
      setCard.dataset.setId = set.id; // Store set ID for easier access if needed
      setCard.innerHTML = `
        <div class="material-icon"><i class="fas fa-layer-group"></i></div>
        <div class="material-info">
            <h3>${escapeHtml(set.name)}</h3>
            <p>${set.cards ? set.cards.length : 0} Karte(n)</p>
        </div>
        <div class="flashcard-set-actions">
            <button class="btn-primary start-study-btn" title="Lernsession starten"><i class="fas fa-play"></i> Lernen</button>
            <button class="btn-secondary edit-set-btn" title="Set bearbeiten"><i class="fas fa-edit"></i> Bearbeiten</button>
            <button class="btn-danger delete-set-btn" title="Set löschen"><i class="fas fa-trash"></i> Löschen</button>
        </div>`;
      // Event listeners are more robust if attached to specific buttons with data attributes
      setCard.querySelector(".start-study-btn").addEventListener("click", (e) => { e.stopPropagation(); startStudySession(set.id); });
      setCard.querySelector(".edit-set-btn").addEventListener("click", (e) => { e.stopPropagation(); openSetEditor(set.id); });
      setCard.querySelector(".delete-set-btn").addEventListener("click", (e) => { e.stopPropagation(); deleteFlashcardSet(set.id); });
      setsContainer.appendChild(setCard);
    });
  }

  function openSetEditor(setId = null) {
    editingSet = setId ? flashcardSets.find((s) => s.id === setId) : null;

    if (!setNameInput || !cardsEditorContainer || !editorTitleEl) {
        console.error("openSetEditor: Wichtige Editor DOM Elemente nicht gefunden.");
        window.app.showNotification("UI Fehler", "Lernkarten-Editor konnte nicht initialisiert werden.", "error");
        return;
    }

    setNameInput.value = editingSet ? editingSet.name : "";
    cardsEditorContainer.innerHTML = "";
    editorTitleEl.textContent = editingSet ? "Lernkarten-Set bearbeiten" : "Lernkarten-Set erstellen";
    
    // Clear any previous AI info messages
    const existingInfo = editorView ? editorView.querySelector(".editor-info-message") : null;
    if (existingInfo) existingInfo.remove();

    if (editingSet && editingSet.cards) {
      editingSet.cards.forEach((card) => addCardEditFields(card)); // Pass the whole card object
    } else {
      addCardEditFields(); 
    }
    showView("editor");
  }

  function addCardEditFields(cardData = {}) { // Expects a card object or empty for new
    if (!cardsEditorContainer) {
        console.error("addCardEditFields: cardsEditorContainer ist nicht verfügbar.");
        window.app.showNotification("UI Fehler", "Kann keine neue Karte zum Editor hinzufügen.", "error");
        return;
    }
    const { 
        question = "", answer = "", 
        questionImage = null, answerImage = null, 
        cardId = null // Keep existing cardId if passed
    } = cardData;

    const cardFieldDiv = document.createElement("div");
    cardFieldDiv.className = "flashcard-edit-item";
    if (cardId) cardFieldDiv.dataset.cardId = cardId; // Store cardId on the element for saving

    const uniqueHtmlId = generateUniqueId('field-');
    cardFieldDiv.innerHTML = `
        <div class="flashcard-edit-side">
            <label for="${uniqueHtmlId}-q-text">Vorderseite (Text)</label>
            <textarea id="${uniqueHtmlId}-q-text" class="flashcard-edit-question" placeholder="Vorderseite (Frage/Begriff - Markdown unterstützt)">${escapeHtml(question)}</textarea>
            <label for="${uniqueHtmlId}-q-img">Vorderseite (Bild)</label>
            <input type="file" id="${uniqueHtmlId}-q-img" class="flashcard-edit-image flashcard-edit-question-image" accept="image/*">
            <img src="${questionImage || "#"}" class="flashcard-edit-image-preview flashcard-question-image-preview" alt="Vorschau Fragebild" style="${questionImage ? '' : 'display:none;'}">
            <button class="remove-image-btn btn-text-danger" style="${questionImage ? '' : 'display:none;'}" data-target="question">Bild entfernen</button>
        </div>
        <div class="flashcard-edit-side">
            <label for="${uniqueHtmlId}-a-text">Rückseite (Text)</label>
            <textarea id="${uniqueHtmlId}-a-text" class="flashcard-edit-answer" placeholder="Rückseite (Antwort/Definition - Markdown unterstützt)">${escapeHtml(answer)}</textarea>
            <label for="${uniqueHtmlId}-a-img">Rückseite (Bild)</label>
            <input type="file" id="${uniqueHtmlId}-a-img" class="flashcard-edit-image flashcard-edit-answer-image" accept="image/*">
            <img src="${answerImage || "#"}" class="flashcard-edit-image-preview flashcard-answer-image-preview" alt="Vorschau Antwortbild" style="${answerImage ? '' : 'display:none;'}">
            <button class="remove-image-btn btn-text-danger" style="${answerImage ? '' : 'display:none;'}" data-target="answer">Bild entfernen</button>
        </div>
        <button class="remove-card-edit-btn btn-text-danger" title="Diese Karte entfernen"><i class="fas fa-times"></i> Karte entfernen</button>`;
    
    cardFieldDiv.querySelectorAll('.flashcard-edit-image').forEach(input => {
      input.addEventListener('change', function(event) {
        const file = event.target.files[0];
        const preview = event.target.nextElementSibling; 
        const removeButton = preview.nextElementSibling; 
        if (file) {
          const reader = new FileReader();
          reader.onload = function(e) { 
            preview.src = e.target.result; 
            preview.style.display = 'block'; 
            preview.dataset.hasImage = 'true';
            if (removeButton) removeButton.style.display = 'inline-block'; 
          }
          reader.readAsDataURL(file);
        } else { 
          if (!preview.dataset.hasImage || preview.src.endsWith('#')) {
            preview.src = '#';
            preview.style.display = 'none';
            delete preview.dataset.hasImage;
            if (removeButton) removeButton.style.display = 'none';
          }
        }
      });
    });

    cardFieldDiv.querySelectorAll('.remove-image-btn').forEach(button => {
      button.addEventListener('click', function(event) {
        const targetType = event.target.dataset.target; 
        const fileInput = cardFieldDiv.querySelector(`.flashcard-edit-${targetType}-image`);
        const preview = cardFieldDiv.querySelector(`.flashcard-${targetType}-image-preview`);
        if (fileInput) fileInput.value = ''; 
        if (preview) {
            preview.src = '#';
            preview.style.display = 'none';
            delete preview.dataset.hasImage; 
        }
        event.target.style.display = 'none'; 
      });
    });

    const removeBtn = cardFieldDiv.querySelector('.remove-card-edit-btn');
    if (removeBtn) removeBtn.addEventListener('click', () => cardFieldDiv.remove());
    
    cardsEditorContainer.appendChild(cardFieldDiv);
    if (questionImage) cardFieldDiv.querySelector('.flashcard-question-image-preview').dataset.hasImage = 'true';
    if (answerImage) cardFieldDiv.querySelector('.flashcard-answer-image-preview').dataset.hasImage = 'true';
  }

  function saveCurrentSet() { 
    if (!setNameInput || !cardsEditorContainer) {
        console.error("saveCurrentSet: Editor DOM Elemente nicht gefunden.");
        window.app.showNotification("Fehler", "Speichern fehlgeschlagen (Editor nicht bereit).", "error");
        return;
    }
    const name = setNameInput.value.trim();
    if (!name) {
      window.app.showNotification("Eingabefehler", "Bitte gib einen Namen für das Set ein.", "warning");
      return;
    }
    const cardElements = cardsEditorContainer.querySelectorAll('.flashcard-edit-item');
    const cards = [];
    cardElements.forEach((cardEl) => { 
      const questionText = cardEl.querySelector('.flashcard-edit-question').value;
      const answerText = cardEl.querySelector('.flashcard-edit-answer').value;
      
      const questionImagePreview = cardEl.querySelector('.flashcard-question-image-preview');
      const answerImagePreview = cardEl.querySelector('.flashcard-answer-image-preview');

      const questionImage = (questionImagePreview && questionImagePreview.style.display !== 'none' && !questionImagePreview.src.endsWith('#')) ? questionImagePreview.src : null;
      const answerImage = (answerImagePreview && answerImagePreview.style.display !== 'none' && !answerImagePreview.src.endsWith('#')) ? answerImagePreview.src : null;

      if (questionText || answerText || questionImage || answerImage) {
        const existingCardId = cardEl.dataset.cardId;
        let srsData = { interval: 0, repetitions: 0, easeFactor: 2.5, dueDate: new Date().toISOString() };

        if (editingSet && existingCardId) { // If editing an existing card, try to preserve its SRS data
            const originalCard = editingSet.cards.find(c => c.cardId === existingCardId);
            if (originalCard) {
                srsData = { 
                    interval: originalCard.interval, 
                    repetitions: originalCard.repetitions, 
                    easeFactor: originalCard.easeFactor, 
                    dueDate: originalCard.dueDate 
                };
            }
        }
        cards.push({
          cardId: existingCardId || generateUniqueId('card-'), // Use existing or generate new ID
          question: questionText, 
          answer: answerText, 
          questionImage: questionImage, 
          answerImage: answerImage,
          ...srsData
        });
      }
    });

    if (cards.length === 0) {
      window.app.showNotification("Eingabefehler", "Bitte füge mindestens eine gültige Lernkarte hinzu.", "warning");
      return;
    }

    if (editingSet) {
      editingSet.name = name; 
      editingSet.cards = cards;
    } else {
      const newSet = { 
        id: generateUniqueId('set-'), 
        name: name, 
        cards: cards 
      };
      flashcardSets.push(newSet);
    }
    
    saveFlashcardSets(); 
    renderFlashcardSets(); 
    showView('sets');
    window.app.showNotification("Gespeichert", `Lernkarten-Set "${escapeHtml(name)}" erfolgreich gespeichert.`, "success");
    editingSet = null; 
  }

  function deleteFlashcardSet(setId) {
    const setToDelete = flashcardSets.find((set) => set.id === setId);
    if (!setToDelete) {
        console.warn("deleteFlashcardSet: Zu löschendes Set nicht gefunden mit ID:", setId);
        window.app.showNotification("Fehler", "Set zum Löschen nicht gefunden.", "error");
        return;
    }
    if (confirm(`Möchtest du das Lernkarten-Set "${escapeHtml(setToDelete.name)}" wirklich löschen? Alle Karten darin gehen verloren.`)) {
      flashcardSets = flashcardSets.filter((set) => set.id !== setId);
      saveFlashcardSets(); 
      renderFlashcardSets();
      window.app.showNotification("Gelöscht", `Lernkarten-Set "${escapeHtml(setToDelete.name)}" gelöscht.`, "success");
    }
  }

  // --- Study Session Logic ---
  function startStudySession(setId) {
    const setForStudy = flashcardSets.find((set) => set.id === setId);
    if (!setForStudy || !setForStudy.cards || setForStudy.cards.length === 0) {
      window.app.showNotification("Info", "Dieses Set ist leer oder kann nicht zum Lernen geöffnet werden.", "info");
      showView("sets"); 
      return;
    }

    const today = new Date(); 
    today.setHours(0, 0, 0, 0);
    
    const dueCards = setForStudy.cards.filter((card) => {
      if (!card.dueDate) return true; 
      const dueDate = new Date(card.dueDate); 
      dueDate.setHours(0, 0, 0, 0);
      return dueDate <= today;
    });

    if (dueCards.length === 0) {
      window.app.showNotification("Info", `Keine Karten in "${escapeHtml(setForStudy.name)}" sind heute fällig. Gut gemacht!`, "info");
      showView("sets"); 
      return;
    }

    currentSet = { 
        ...setForStudy, 
        shuffledCards: [...dueCards].sort(() => Math.random() - 0.5) 
    };
    currentCardIndex = 0;

    if (!studySetNameEl || !cardQuestionEl || !cardAnswerEl || !flashcardEl) {
        console.error("startStudySession: Wichtige UI-Elemente für die Lernansicht nicht gefunden.");
        window.app.showNotification("UI Fehler", "Lernansicht konnte nicht korrekt initialisiert werden.", "error");
        showView("sets");
        return;
    }
    studySetNameEl.textContent = `Lernen: ${escapeHtml(currentSet.name)} (${currentSet.shuffledCards.length} fällige Karten)`;
    
    displayCurrentCard();
    showView("study");
  }

  function displayCurrentCard() {
    if (!currentSet || !currentSet.shuffledCards || currentSet.shuffledCards.length === 0) {
      if (studyView && !studyView.classList.contains("hidden")) { 
        if (cardQuestionEl) cardQuestionEl.innerHTML = '<p class="empty-state">Keine Karten mehr in dieser Lernsession.</p>';
        if (cardAnswerEl) cardAnswerEl.innerHTML = "";
        if (flashcardEl) flashcardEl.classList.remove("is-flipped");
        if (prevCardBtn) prevCardBtn.disabled = true;
        if (nextCardBtn) nextCardBtn.disabled = true;
        if (flipCardBtn) flipCardBtn.disabled = true;
        if (srsControlsContainer) srsControlsContainer.classList.add("hidden");
      }
      return;
    }

    const card = currentSet.shuffledCards[currentCardIndex];
    if (!card) {
        console.error("displayCurrentCard: Aktuelle Karte ist undefined bei Index", currentCardIndex);
        window.app.showNotification("Fehler", "Konnte die nächste Karte nicht laden.", "error");
        showStudySummary(); // Attempt to gracefully end session
        return;
    }
    
    let questionHTML = "";
    if (card.questionImage) questionHTML += `<img src="${card.questionImage}" alt="Fragebild" class="flashcard-image">`;
    if (typeof marked !== "undefined" && marked.parse) questionHTML += marked.parse(card.question || "");
    else questionHTML += escapeHtml(card.question || ""); 
    cardQuestionEl.innerHTML = questionHTML;
    
    let answerHTML = "";
    if (card.answerImage) answerHTML += `<img src="${card.answerImage}" alt="Antwortbild" class="flashcard-image">`;
    if (typeof marked !== "undefined" && marked.parse) answerHTML += marked.parse(card.answer || "");
    else answerHTML += escapeHtml(card.answer || ""); 
    cardAnswerEl.innerHTML = answerHTML;

    flashcardEl.classList.remove("is-flipped");
    if (srsControlsContainer) srsControlsContainer.classList.add("hidden"); 
    if (flipCardBtn) { flipCardBtn.classList.remove("hidden"); flipCardBtn.disabled = false; }
    if (prevCardBtn) prevCardBtn.disabled = currentCardIndex === 0;
    if (nextCardBtn) nextCardBtn.disabled = currentCardIndex === currentSet.shuffledCards.length - 1;
  }

  function flipCurrentCard() {
    if (!flashcardEl) { console.error("flipCurrentCard: flashcardEl nicht gefunden."); return; }
    flashcardEl.classList.toggle("is-flipped");
    if (flashcardEl.classList.contains("is-flipped")) {
      if (srsControlsContainer) srsControlsContainer.classList.remove("hidden");
      if (flipCardBtn) flipCardBtn.classList.add("hidden");
    } else {
      if (srsControlsContainer) srsControlsContainer.classList.add("hidden");
      if (flipCardBtn) flipCardBtn.classList.remove("hidden");
    }
  }
  
  function showNextCard() { 
    if (currentSet && currentSet.shuffledCards && currentCardIndex < currentSet.shuffledCards.length - 1) {
      currentCardIndex++; 
      displayCurrentCard();
    } else { 
      showStudySummary(); 
    }
  }

  function showPrevCard() {
    if (currentSet && currentSet.shuffledCards && currentCardIndex > 0) {
      currentCardIndex--; 
      displayCurrentCard();
    }
  }

  function showStudySummary() {
    if (currentSet && window.app && window.app.showNotification) { // Check currentSet before accessing its name
      window.app.showNotification("Session beendet", `Du hast die fälligen Karten für "${escapeHtml(currentSet.name)}" durchgearbeitet.`, "info");
    } else if (!currentSet && window.app && window.app.showNotification) {
        window.app.showNotification("Session beendet", "Lernsession abgeschlossen.", "info");
    }
    showView('sets'); 
    currentSet = null; 
    if (srsControlsContainer) srsControlsContainer.classList.add('hidden');
    if (flipCardBtn) flipCardBtn.classList.remove('hidden'); 
  }

  // --- SRS Logic ---
  function updateSRSData(cardToUpdate, quality) { 
    if (!cardToUpdate) {
        console.error("updateSRSData: cardToUpdate ist undefined");
        window.app.showNotification("SRS Fehler", "Karte für Update nicht gefunden.", "error");
        return;
    }
    cardToUpdate.repetitions = cardToUpdate.repetitions ?? 0;
    cardToUpdate.easeFactor = cardToUpdate.easeFactor ?? 2.5;
    cardToUpdate.interval = cardToUpdate.interval ?? 0;

    if (quality < 3) { 
      cardToUpdate.repetitions = 0; 
      cardToUpdate.interval = 1; 
    } else { 
      cardToUpdate.repetitions += 1;
      if (cardToUpdate.repetitions === 1) cardToUpdate.interval = 1;
      else if (cardToUpdate.repetitions === 2) cardToUpdate.interval = 6;
      else cardToUpdate.interval = Math.round(cardToUpdate.interval * cardToUpdate.easeFactor);
    }
    cardToUpdate.easeFactor = cardToUpdate.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (cardToUpdate.easeFactor < 1.3) cardToUpdate.easeFactor = 1.3; 
    
    const today = new Date(); 
    today.setHours(0, 0, 0, 0);
    const nextDueDate = new Date(today); 
    nextDueDate.setDate(today.getDate() + cardToUpdate.interval);
    cardToUpdate.dueDate = nextDueDate.toISOString();
    console.log(`SRS Updated: CardID=${cardToUpdate.cardId}, Q=${quality}, Reps=${cardToUpdate.repetitions}, EF=${cardToUpdate.easeFactor.toFixed(2)}, Interval=${cardToUpdate.interval} days, Due=${cardToUpdate.dueDate.substring(0,10)}`);
  }

  function handleSRSRating(quality) {
    if (!currentSet || !currentSet.shuffledCards || currentSet.shuffledCards.length === 0 || !currentSet.shuffledCards[currentCardIndex]) {
        console.warn("handleSRSRating: Ungültiger Status für SRS-Bewertung.");
        window.app.showNotification("Fehler", "Bewertung konnte nicht verarbeitet werden.", "error");
        return;
    }
    
    const cardFromShuffledList = currentSet.shuffledCards[currentCardIndex];
    if (!cardFromShuffledList.cardId) {
        console.error("handleSRSRating: Karte in Lernsession hat keine cardId!", cardFromShuffledList);
        window.app.showNotification("SRS Fehler", "Kartenidentifikation fehlgeschlagen.", "error");
        showNextCard(); // Try to move on
        return;
    }

    const originalSetData = flashcardSets.find(set => set.id === currentSet.id);
    if (originalSetData && originalSetData.cards) {
        let originalCardInSet = originalSetData.cards.find(c => c.cardId === cardFromShuffledList.cardId);
        
        if (originalCardInSet) {
            updateSRSData(originalCardInSet, quality);
        } else { 
            console.warn(`SRS: Originalkarte mit ID ${cardFromShuffledList.cardId} im Set ${originalSetData.name} (ID: ${originalSetData.id}) nicht gefunden. SRS-Daten werden nicht dauerhaft gespeichert.`);
            window.app.showNotification("Warnung", "SRS-Fortschritt für diese Karte konnte nicht im Hauptset gespeichert werden.", "warning");
            // Optionally, update the card in shuffledCards if you want temporary effect for the session, but it won't persist.
            // updateSRSData(cardFromShuffledList, quality); 
        }
    } else {
        console.warn("SRS: Original-Set nicht gefunden für Update. Set-ID:", currentSet.id);
        window.app.showNotification("SRS Fehler", "Original-Set für Update nicht gefunden.", "error");
    }
    saveFlashcardSets(); 
    showNextCard();
  }

  // --- View Management ---
  function showView(viewName) {
    const views = { sets: setsView, editor: editorView, study: studyView };
    let foundActiveView = false;

    for (const key in views) {
        if (views[key]) {
            views[key].classList.add("hidden");
        } else {
            console.warn(`showView: Ansichts-Element '${key}View' nicht im DOM gefunden.`);
        }
    }

    if (views[viewName]) {
        views[viewName].classList.remove("hidden");
        foundActiveView = true;
    } else {
        console.error(`showView: Unbekannter Ansichtsname '${viewName}' oder Ansichts-Element nicht gefunden.`);
        window.app.showNotification("UI Fehler", `Ansicht '${viewName}' konnte nicht angezeigt werden.`, "error");
        // Fallback to sets view if requested view is invalid and setsView exists
        if (setsView) setsView.classList.remove("hidden");
    }
  }
  
  // --- AI Card Generation Integration ---
  function prepareEditorWithAICards(sourceMaterialName, cardsData) {
    editingSet = null; 
    
    if (!setNameInput || !cardsEditorContainer || !editorTitleEl || !editorView) {
        console.error("prepareEditorWithAICards: Wichtige Editor DOM Elemente nicht gefunden.");
        window.app.showNotification("Systemfehler", "Editor für KI-Karten konnte nicht vorbereitet werden.", "error");
        return;
    }
    
    setNameInput.value = `KI-Karten für: ${escapeHtml(sourceMaterialName)}`;
    cardsEditorContainer.innerHTML = ""; // Clear previous cards
    
    // Remove any existing info messages then add new one
    const existingInfoMessages = editorView.querySelectorAll(".editor-info-message"); 
    existingInfoMessages.forEach(msg => msg.remove());

    const editorInfoMessage = document.createElement("p"); 
    editorInfoMessage.className = "editor-info-message"; 
    editorInfoMessage.innerHTML = '<i class="fas fa-info-circle"></i> Dies sind KI-generierte Lernkarten. Bitte überprüfe und bearbeite sie bei Bedarf, bevor du sie speicherst.';
    
    // Insert after title, or at top of editor view as fallback
    if (editorTitleEl.nextSibling) {
        editorTitleEl.parentNode.insertBefore(editorInfoMessage, editorTitleEl.nextSibling);
    } else {
        editorTitleEl.parentNode.appendChild(editorInfoMessage);
    }
    
    if (cardsData && Array.isArray(cardsData) && cardsData.length > 0) {
      cardsData.forEach(card => { 
        if (card && typeof card.question === "string" && typeof card.answer === "string") {
          addCardEditFields({ // Pass as object for addCardEditFields
              question: card.question, 
              answer: card.answer, 
              // AI cards are text-only by default from this function
              questionImage: null, 
              answerImage: null 
            }); 
        } else {
          console.warn("Ungültiges Kartenformat von KI erhalten:", card); 
        }
      });
    } else { 
      addCardEditFields(); // Add one empty card for manual input
      window.app.showNotification("Info", "KI konnte keine Karten generieren oder lieferte ein leeres Ergebnis. Bitte manuell erstellen.", "info"); 
    }
    
    editorTitleEl.textContent = "KI-generiertes Lernkarten-Set (Entwurf)";
    showView("editor");
  }

  // --- Event Listeners Setup ---
  // Check for button existence before adding listeners
  if (createSetBtn) createSetBtn.addEventListener("click", () => openSetEditor());
  else console.warn("Event Listener Setup: createSetBtn nicht gefunden.");

  if (addCardToSetBtn) addCardToSetBtn.addEventListener("click", () => addCardEditFields()); // No card data for brand new card
  else console.warn("Event Listener Setup: addCardToSetBtn nicht gefunden.");

  if (saveSetBtn) saveSetBtn.addEventListener("click", saveCurrentSet);
  else console.warn("Event Listener Setup: saveSetBtn nicht gefunden.");

  if (cancelSetEditBtn) cancelSetEditBtn.addEventListener("click", () => { editingSet = null; showView("sets"); });
  else console.warn("Event Listener Setup: cancelSetEditBtn nicht gefunden.");
  
  if (flipCardBtn) flipCardBtn.addEventListener("click", flipCurrentCard);
  else console.warn("Event Listener Setup: flipCardBtn nicht gefunden.");

  if (nextCardBtn) nextCardBtn.addEventListener("click", showNextCard);
  else console.warn("Event Listener Setup: nextCardBtn nicht gefunden.");

  if (prevCardBtn) prevCardBtn.addEventListener("click", showPrevCard);
  else console.warn("Event Listener Setup: prevCardBtn nicht gefunden.");

  if (finishSessionBtn) finishSessionBtn.addEventListener("click", showStudySummary);
  else console.warn("Event Listener Setup: finishSessionBtn nicht gefunden.");
  
  srsButtons.forEach((button) => {
    button.addEventListener("click", function () {
      const quality = parseInt(this.dataset.quality, 10);
      if (!isNaN(quality) && quality >= 0 && quality <= 5) { // Validate quality range
        handleSRSRating(quality);
      } else {
        console.error("Ungültige SRS-Qualität:", this.dataset.quality);
        window.app.showNotification("Fehler", "Ungültige SRS Bewertung.", "error");
      }
    });
  });

  // --- Initialization ---
  loadFlashcardSets(); 
  showView("sets");   

  if (window.app) {
    window.app.flashcards = {
      prepareEditorWithAICards: prepareEditorWithAICards,
      openSetEditor: openSetEditor,
      startStudySession: startStudySession,
      loadSets: loadFlashcardSets, 
    };
    console.log("Flashcards module (improved version) initialized and attached to window.app.");
  } else {
    // This should have been caught at the top, but as a safeguard:
    console.error("Flashcards: window.app nicht definiert nach Initialisierung. Flashcard-Methoden können nicht angehängt werden.");
  }
});