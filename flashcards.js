document.addEventListener('DOMContentLoaded', function () {
    if (!window.app) {
        console.error("Flashcards: App-Objekt nicht gefunden!");
        return;
    }

    let flashcardSets = [];
    let currentSet = null;
    let currentCardIndex = 0;
    let editingSet = null; // Zum Speichern des Sets, das gerade bearbeitet wird

    const flashcardsPageView = document.getElementById('flashcards');
    const setsView = document.getElementById('flashcard-sets-view');
    const editorView = document.getElementById('flashcard-set-editor-view');
    const studyView = document.getElementById('flashcard-study-view');

    const createSetBtn = document.getElementById('create-flashcard-set-btn');
    const setsContainer = document.getElementById('flashcard-sets-container');
    
    const setNameInput = document.getElementById('flashcard-set-name');
    const cardsEditorContainer = document.getElementById('flashcards-editor-container');
    const addCardToSetBtn = document.getElementById('add-flashcard-to-set-btn');
    const saveSetBtn = document.getElementById('save-flashcard-set-btn');
    const cancelSetEditBtn = document.getElementById('cancel-flashcard-set-edit-btn');

    const studySetNameEl = document.getElementById('flashcard-study-set-name');
    const flashcardEl = document.querySelector('#flashcard-study-view .flashcard');
    const cardQuestionEl = document.getElementById('flashcard-question');
    const cardAnswerEl = document.getElementById('flashcard-answer');
    const prevCardBtn = document.getElementById('flashcard-prev-btn');
    const flipCardBtn = document.getElementById('flashcard-flip-btn');
    const nextCardBtn = document.getElementById('flashcard-next-btn');
    const finishSessionBtn = document.getElementById('finish-flashcard-session-btn');

    function loadFlashcardSets() {
        const storedSets = localStorage.getItem('flashcard-sets');
        if (storedSets) {
            flashcardSets = JSON.parse(storedSets);
        }
        renderFlashcardSets();
    }

    function saveFlashcardSets() {
        localStorage.setItem('flashcard-sets', JSON.stringify(flashcardSets));
    }

    function renderFlashcardSets() {
        if (!setsContainer) return;
        setsContainer.innerHTML = '';
        if (flashcardSets.length === 0) {
            setsContainer.innerHTML = '<p class="empty-state">Noch keine Lernkarten-Sets erstellt.</p>';
            return;
        }

        flashcardSets.forEach(set => {
            const setCard = document.createElement('div');
            setCard.className = 'material-card flashcard-set-card'; // Wiederverwendung der Klasse für ähnliches Aussehen
            setCard.innerHTML = `
                <div class="material-icon"><i class="fas fa-layer-group"></i></div>
                <div class="material-info">
                    <h3>${app.escapeHtml(set.name)}</h3>
                    <p>${set.cards.length} Karte(n)</p>
                </div>
                <div class="flashcard-set-actions">
                    <button class="btn-primary start-study-btn" data-set-id="${set.id}"><i class="fas fa-play"></i> Lernen</button>
                    <button class="btn-secondary edit-set-btn" data-set-id="${set.id}"><i class="fas fa-edit"></i> Bearbeiten</button>
                    <button class="btn-danger delete-set-btn" data-set-id="${set.id}"><i class="fas fa-trash"></i> Löschen</button>
                </div>
            `;
            setCard.querySelector('.start-study-btn').addEventListener('click', () => startStudySession(set.id));
            setCard.querySelector('.edit-set-btn').addEventListener('click', () => openSetEditor(set.id));
            setCard.querySelector('.delete-set-btn').addEventListener('click', () => deleteFlashcardSet(set.id));
            setsContainer.appendChild(setCard);
        });
    }

    function openSetEditor(setId = null) {
        editingSet = setId ? flashcardSets.find(s => s.id === setId) : null;
        
        setNameInput.value = editingSet ? editingSet.name : '';
        cardsEditorContainer.innerHTML = ''; // Clear previous cards

        if (editingSet) {
            document.getElementById('flashcard-set-editor-title').textContent = "Lernkarten-Set bearbeiten";
            editingSet.cards.forEach(card => addCardEditFields(card.question, card.answer));
        } else {
            document.getElementById('flashcard-set-editor-title').textContent = "Lernkarten-Set erstellen";
            addCardEditFields(); // Add one empty card to start
        }
        
        showView('editor');
    }

    function addCardEditFields(question = '', answer = '') {
        const cardFieldDiv = document.createElement('div');
        cardFieldDiv.className = 'flashcard-edit-item';
        cardFieldDiv.innerHTML = `
            <textarea class="flashcard-edit-question" placeholder="Vorderseite (Frage/Begriff)">${app.escapeHtml(question)}</textarea>
            <textarea class="flashcard-edit-answer" placeholder="Rückseite (Antwort/Definition)">${app.escapeHtml(answer)}</textarea>
            <button class="remove-card-edit-btn btn-text-danger"><i class="fas fa-times"></i> Karte entfernen</button>
        `;
        cardFieldDiv.querySelector('.remove-card-edit-btn').addEventListener('click', () => cardFieldDiv.remove());
        cardsEditorContainer.appendChild(cardFieldDiv);
    }

    function saveCurrentSet() {
        const name = setNameInput.value.trim();
        if (!name) {
            app.showNotification("Fehler", "Bitte gib einen Namen für das Set ein.", "error");
            return;
        }

        const cardElements = cardsEditorContainer.querySelectorAll('.flashcard-edit-item');
        const cards = [];
        cardElements.forEach(el => {
            const question = el.querySelector('.flashcard-edit-question').value.trim();
            const answer = el.querySelector('.flashcard-edit-answer').value.trim();
            if (question && answer) {
                cards.push({ question, answer });
            }
        });

        if (cards.length === 0) {
            app.showNotification("Fehler", "Bitte füge mindestens eine gültige Lernkarte hinzu.", "error");
            return;
        }

        if (editingSet) { // Update existing set
            editingSet.name = name;
            editingSet.cards = cards;
        } else { // Create new set
            const newSet = {
                id: 'fs-' + Date.now().toString(),
                name: name,
                cards: cards
            };
            flashcardSets.push(newSet);
        }
        
        saveFlashcardSets();
        renderFlashcardSets();
        showView('sets');
        app.showNotification("Gespeichert", "Lernkarten-Set erfolgreich gespeichert.", "success");
    }
    
    function deleteFlashcardSet(setId) {
        if (confirm("Möchtest du dieses Lernkarten-Set wirklich löschen?")) {
            flashcardSets = flashcardSets.filter(set => set.id !== setId);
            saveFlashcardSets();
            renderFlashcardSets();
            app.showNotification("Gelöscht", "Lernkarten-Set gelöscht.", "success");
        }
    }

    function startStudySession(setId) {
        currentSet = flashcardSets.find(set => set.id === setId);
        if (!currentSet || currentSet.cards.length === 0) {
            app.showNotification("Fehler", "Dieses Set ist leer oder ungültig.", "error");
            return;
        }
        currentCardIndex = 0;
        studySetNameEl.textContent = `Lernen: ${app.escapeHtml(currentSet.name)}`;
        displayCurrentCard();
        showView('study');
    }

    function displayCurrentCard() {
        if (!currentSet) return;
        const card = currentSet.cards[currentCardIndex];
        cardQuestionEl.textContent = card.question;
        cardAnswerEl.textContent = card.answer;
        flashcardEl.classList.remove('is-flipped');

        prevCardBtn.disabled = currentCardIndex === 0;
        nextCardBtn.disabled = currentCardIndex === currentSet.cards.length - 1;
    }

    function flipCurrentCard() {
        flashcardEl.classList.toggle('is-flipped');
    }

    function showNextCard() {
        if (currentSet && currentCardIndex < currentSet.cards.length - 1) {
            currentCardIndex++;
            displayCurrentCard();
        }
    }

    function showPrevCard() {
        if (currentSet && currentCardIndex > 0) {
            currentCardIndex--;
            displayCurrentCard();
        }
    }
    
    function showStudySummary() {
        app.showNotification("Session beendet", `Du hast das Set "${currentSet.name}" durchgearbeitet.`, "info");
        showView('sets');
        currentSet = null;
    }

    function showView(viewName) {
        setsView.classList.add('hidden');
        editorView.classList.add('hidden');
        studyView.classList.add('hidden');

        if (viewName === 'sets') setsView.classList.remove('hidden');
        else if (viewName === 'editor') editorView.classList.remove('hidden');
        else if (viewName === 'study') studyView.classList.remove('hidden');
    }

    // Event Listeners
    if (createSetBtn) createSetBtn.addEventListener('click', () => openSetEditor());
    if (addCardToSetBtn) addCardToSetBtn.addEventListener('click', () => addCardEditFields());
    if (saveSetBtn) saveSetBtn.addEventListener('click', saveCurrentSet);
    if (cancelSetEditBtn) cancelSetEditBtn.addEventListener('click', () => showView('sets'));
    
    if (flipCardBtn) flipCardBtn.addEventListener('click', flipCurrentCard);
    if (nextCardBtn) nextCardBtn.addEventListener('click', showNextCard);
    if (prevCardBtn) prevCardBtn.addEventListener('click', showPrevCard);
    if (finishSessionBtn) finishSessionBtn.addEventListener('click', showStudySummary);


   // Define escapeHtml utility function first
    const escapeHtml = window.app && typeof window.app.escapeHtml === 'function' 
        ? window.app.escapeHtml 
        : function(unsafe) { // Fallback simple escape
            return unsafe
                 .replace(/&/g, "&amp;")
                 .replace(/</g, "&lt;")
                 .replace(/>/g, "&gt;")
                 .replace(/"/g, "&quot;")
                 .replace(/'/g, "&#039;");
        };

    // Initialisierung
    loadFlashcardSets();
    if (setsView && editorView && studyView && !editorView.classList.contains('hidden') && !studyView.classList.contains('hidden')) {
      showView('sets'); // Standardansicht nur setzen, wenn nicht schon eine andere aktiv ist (z.B. durch deep link)
    }

    // Initialisierung
    loadFlashcardSets();
    showView('sets'); // Standardansicht

    


    function loadFlashcardSets() {
        const storedSets = localStorage.getItem('flashcard-sets');
        if (storedSets) {
            try {
                flashcardSets = JSON.parse(storedSets);
                if (!Array.isArray(flashcardSets)) flashcardSets = [];
            } catch (e) {
                console.error("Fehler beim Parsen der Lernkarten-Sets aus localStorage:", e);
                flashcardSets = [];
            }
        }
        renderFlashcardSets();
    }

    function saveFlashcardSets() {
        try {
            localStorage.setItem('flashcard-sets', JSON.stringify(flashcardSets));
        } catch (e) {
            console.error("Fehler beim Speichern der Lernkarten-Sets in localStorage:", e);
            if (window.app && window.app.showNotification) {
                window.app.showNotification("Speicherfehler", "Lernkarten konnten nicht gespeichert werden (evtl. Speicher voll).", "error");
            }
        }
    }

    function renderFlashcardSets() {
        if (!setsContainer) return;
        setsContainer.innerHTML = '';
        if (flashcardSets.length === 0) {
            setsContainer.innerHTML = '<p class="empty-state"><i class="fas fa-layer-group"></i> Noch keine Lernkarten-Sets erstellt.</p>';
            return;
        }

        flashcardSets.forEach(set => {
            const setCard = document.createElement('div');
            setCard.className = 'material-card flashcard-set-card'; 
            setCard.innerHTML = `
                <div class="material-icon"><i class="fas fa-layer-group"></i></div>
                <div class="material-info">
                    <h3>${escapeHtml(set.name)}</h3>
                    <p>${set.cards ? set.cards.length : 0} Karte(n)</p>
                </div>
                <div class="flashcard-set-actions">
                    <button class="btn-primary start-study-btn" data-set-id="${set.id}" title="Lernsession starten"><i class="fas fa-play"></i> Lernen</button>
                    <button class="btn-secondary edit-set-btn" data-set-id="${set.id}" title="Set bearbeiten"><i class="fas fa-edit"></i> Bearbeiten</button>
                    <button class="btn-danger delete-set-btn" data-set-id="${set.id}" title="Set löschen"><i class="fas fa-trash"></i> Löschen</button>
                </div>
            `;
            setCard.querySelector('.start-study-btn').addEventListener('click', (e) => { e.stopPropagation(); startStudySession(set.id); });
            setCard.querySelector('.edit-set-btn').addEventListener('click', (e) => { e.stopPropagation(); openSetEditor(set.id); });
            setCard.querySelector('.delete-set-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteFlashcardSet(set.id); });
            setsContainer.appendChild(setCard);
        });
    }

    function openSetEditor(setId = null) {
        editingSet = setId ? flashcardSets.find(s => s.id === setId) : null;
        
        setNameInput.value = editingSet ? editingSet.name : '';
        cardsEditorContainer.innerHTML = ''; 

        if (editingSet && editingSet.cards) {
            document.getElementById('flashcard-set-editor-title').textContent = "Lernkarten-Set bearbeiten";
            editingSet.cards.forEach(card => addCardEditFields(card.question, card.answer));
        } else {
            document.getElementById('flashcard-set-editor-title').textContent = "Lernkarten-Set erstellen";
            addCardEditFields(); 
        }
        
        showView('editor');
    }

    function addCardEditFields(question = '', answer = '') {
        const cardFieldDiv = document.createElement('div');
        cardFieldDiv.className = 'flashcard-edit-item';
        cardFieldDiv.innerHTML = `
            <textarea class="flashcard-edit-question" placeholder="Vorderseite (Frage/Begriff)">${escapeHtml(question)}</textarea>
            <textarea class="flashcard-edit-answer" placeholder="Rückseite (Antwort/Definition)">${escapeHtml(answer)}</textarea>
            <button class="remove-card-edit-btn btn-text-danger" title="Diese Karte entfernen"><i class="fas fa-times"></i> Karte entfernen</button>
        `;
        cardFieldDiv.querySelector('.remove-card-edit-btn').addEventListener('click', () => cardFieldDiv.remove());
        cardsEditorContainer.appendChild(cardFieldDiv);
    }

    function saveCurrentSet() {
        const name = setNameInput.value.trim();
        if (!name) {
            app.showNotification("Fehler", "Bitte gib einen Namen für das Set ein.", "error");
            return;
        }

        const cardElements = cardsEditorContainer.querySelectorAll('.flashcard-edit-item');
        const cards = [];
        cardElements.forEach(el => {
            const question = el.querySelector('.flashcard-edit-question').value.trim();
            const answer = el.querySelector('.flashcard-edit-answer').value.trim();
            if (question && answer) { // Nur Karten mit Inhalt speichern
                cards.push({ question, answer });
            }
        });

        if (cards.length === 0) {
            app.showNotification("Fehler", "Bitte füge mindestens eine gültige Lernkarte hinzu (Vorder- und Rückseite ausgefüllt).", "error");
            return;
        }

        if (editingSet) { 
            editingSet.name = name;
            editingSet.cards = cards;
        } else { 
            const newSet = {
                id: 'fs-' + Date.now().toString(),
                name: name,
                cards: cards
            };
            flashcardSets.push(newSet);
        }
        
        saveFlashcardSets();
        renderFlashcardSets();
        showView('sets');
        app.showNotification("Gespeichert", `Lernkarten-Set "${escapeHtml(name)}" erfolgreich gespeichert.`, "success");
        editingSet = null; // Reset editing state
    }
    
    function deleteFlashcardSet(setId) {
        const setToDelete = flashcardSets.find(set => set.id === setId);
        if (!setToDelete) return;

        if (confirm(`Möchtest du das Lernkarten-Set "${escapeHtml(setToDelete.name)}" wirklich löschen?`)) {
            flashcardSets = flashcardSets.filter(set => set.id !== setId);
            saveFlashcardSets();
            renderFlashcardSets();
            app.showNotification("Gelöscht", `Lernkarten-Set "${escapeHtml(setToDelete.name)}" gelöscht.`, "success");
        }
    }

    function startStudySession(setId) {
        currentSet = flashcardSets.find(set => set.id === setId);
        if (!currentSet || !currentSet.cards || currentSet.cards.length === 0) {
            app.showNotification("Fehler", "Dieses Set ist leer oder ungültig.", "error");
            showView('sets'); // Zurück zur Übersicht, falls Set nicht gestartet werden kann
            return;
        }
        currentCardIndex = 0;
        // Karten mischen für jede neue Session (optional, aber oft gewünscht)
        currentSet.shuffledCards = [...currentSet.cards].sort(() => Math.random() - 0.5);

        studySetNameEl.textContent = `Lernen: ${escapeHtml(currentSet.name)}`;
        displayCurrentCard();
        showView('study');
    }

    function displayCurrentCard() {
        if (!currentSet || !currentSet.shuffledCards || currentSet.shuffledCards.length === 0) return;
        const card = currentSet.shuffledCards[currentCardIndex];
        cardQuestionEl.textContent = card.question;
        cardAnswerEl.textContent = card.answer;
        flashcardEl.classList.remove('is-flipped');

        prevCardBtn.disabled = currentCardIndex === 0;
        nextCardBtn.disabled = currentCardIndex === currentSet.shuffledCards.length - 1;
    }

// ... (flipCurrentCard, showNextCard, showPrevCard, showStudySummary, showView bleiben ähnlich) ...
    function flipCurrentCard() {
        if (!flashcardEl) return;
        flashcardEl.classList.toggle('is-flipped');
    }

    function showNextCard() {
        if (currentSet && currentSet.shuffledCards && currentCardIndex < currentSet.shuffledCards.length - 1) {
            currentCardIndex++;
            displayCurrentCard();
        }
    }

    function showPrevCard() {
        if (currentSet && currentSet.shuffledCards && currentCardIndex > 0) {
            currentCardIndex--;
            displayCurrentCard();
        }
    }
    
    function showStudySummary() {
        if (currentSet && window.app && window.app.showNotification) {
            app.showNotification("Session beendet", `Du hast das Set "${escapeHtml(currentSet.name)}" durchgearbeitet.`, "info");
        }
        showView('sets');
        currentSet = null; // Wichtig: currentSet zurücksetzen
    }

    function showView(viewName) {
        // Ensure elements exist before trying to manipulate classList
        if (setsView) setsView.classList.add('hidden');
        if (editorView) editorView.classList.add('hidden');
        if (studyView) studyView.classList.add('hidden');

        if (viewName === 'sets' && setsView) setsView.classList.remove('hidden');
        else if (viewName === 'editor' && editorView) editorView.classList.remove('hidden');
        else if (viewName === 'study' && studyView) studyView.classList.remove('hidden');
    }
    
    function prepareEditorWithAICards(sourceMaterialName, cardsData) {
        editingSet = null; // KI-Karten erstellen immer ein neues Set (oder Entwurf)
        setNameInput.value = `KI-Karten für: ${escapeHtml(sourceMaterialName)}`;
        cardsEditorContainer.innerHTML = ''; // Vorherige Karten löschen

        // HINWEIS FÜR DEN BENUTZER EINFÜGEN
        const editorInfoMessage = document.createElement('p');
        editorInfoMessage.className = 'editor-info-message'; // Klasse für Styling hinzufügen
        editorInfoMessage.innerHTML = '<i class="fas fa-info-circle"></i> Dies sind KI-generierte Lernkarten. Bitte überprüfe und bearbeite sie bei Bedarf, bevor du sie speicherst.';
        // Stelle sicher, dass die Nachricht vor den Kartenfeldern, aber innerhalb des Editor-Containers platziert wird.
        // Du könntest sie auch direkt über 'cardsEditorContainer' platzieren, je nach gewünschtem Layout.
        if (editorView && editorView.querySelector('#flashcard-set-editor-title')) { // Finde ein Element, vor dem es eingefügt werden kann
            editorView.querySelector('#flashcard-set-editor-title').insertAdjacentElement('afterend', editorInfoMessage);
        } else { // Fallback, falls das obige Element nicht da ist
            cardsEditorContainer.insertAdjacentElement('beforebegin', editorInfoMessage);
        }


        if (cardsData && Array.isArray(cardsData) && cardsData.length > 0) {
            cardsData.forEach(card => {
                if (card && typeof card.question === 'string' && typeof card.answer === 'string') {
                    addCardEditFields(card.question, card.answer);
                } else {
                    console.warn("Ungültiges Kartenformat von KI erhalten:", card);
                }
            });
        } else {
            addCardEditFields(); // Füge eine leere Karte hinzu, wenn KI nichts liefert
            if (window.app && window.app.showNotification) {
                app.showNotification("Info", "KI konnte keine Karten generieren oder das Format war unerwartet. Bitte manuell erstellen oder anpassen.", "info");
            }
        }
        const editorTitleEl = document.getElementById('flashcard-set-editor-title');
        if (editorTitleEl) editorTitleEl.textContent = "KI-generiertes Lernkarten-Set (Entwurf)";
        
        // Entferne eine eventuell vorhandene alte Info-Nachricht, bevor eine neue Ansicht gezeigt wird
        // (oder stelle sicher, dass sie nur einmal hinzugefügt wird)
        // Dies ist eine einfache Implementierung; eine robustere Lösung würde die Nachricht beim Verlassen des Editors entfernen.
        const existingInfoMessages = editorView ? editorView.querySelectorAll('.editor-info-message') : [];
        if (existingInfoMessages.length > 1) { // Wenn mehr als eine da ist (durch mehrfaches Aufrufen)
            for(let i = 0; i < existingInfoMessages.length -1; i++) {
                existingInfoMessages[i].remove();
            }
        }

        showView('editor');
    }


  

    // Initialisierung
    loadFlashcardSets();
    if (setsView && !editorView.classList.contains('hidden') && !studyView.classList.contains('hidden')) {
      showView('sets'); // Standardansicht nur setzen, wenn nicht schon eine andere aktiv ist (z.B. durch deep link)
    }
    
    // Mache Funktionen für app.js zugänglich
  window.app.flashcards = { 
        prepareEditorWithAICards: prepareEditorWithAICards,
        openSetEditor: openSetEditor,
        startStudySession: startStudySession 
    };
    console.log("Flashcards module initialized and attached to window.app.");
    
});
    
    // Mache einige Funktionen für app.js zugänglich, falls nötig
    // window.app.flashcards = { startStudySession, openSetEditor };
