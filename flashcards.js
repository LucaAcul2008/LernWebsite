/**
 * Flashcards Module
 * Implements a spaced repetition flashcard system for effective learning
 * @version 1.3.0
 */

const Flashcards = (function() {
    // Flashcard data and state
    let flashcardSets = [];
    let currentSetIndex = -1;
    let currentCardIndex = 0;
    let isCardFlipped = false;
    let studyMode = 'learn'; // 'learn', 'review', 'test'
    let cardsToReview = [];
    
    // Sound effects - preload with error handling
    const cardFlipSound = new Audio('sounds/card-flip.mp3');
    const correctAnswerSound = new Audio('sounds/correct-answer.mp3');
    const wrongAnswerSound = new Audio('sounds/wrong-answer.mp3');
    
    // DOM Elements
    const flashcardsPage = document.querySelector('#flashcards');
    const flashcardSetsContainer = document.querySelector('#flashcard-sets-container');
    const studyContainer = document.querySelector('#flashcard-study-container');
    const confidenceButtons = document.querySelector('#confidence-buttons');
    
    // Initialize the module
    function init() {
        console.log('Initializing Flashcards module...');
        
        // Load saved flashcard sets
        loadFlashcards();
        
        // Set up event listeners
        const createSetBtn = document.querySelector('#create-flashcard-set');
        const autoGenerateBtn = document.querySelector('#auto-generate-cards');
        const createSetForm = document.querySelector('#create-set-form');
        const generateCardsForm = document.querySelector('#generate-cards-form');
        
        if (createSetBtn) {
            createSetBtn.addEventListener('click', () => showModal('create-set-modal'));
        }
        
        if (autoGenerateBtn) {
            autoGenerateBtn.addEventListener('click', () => showModal('generate-cards-modal'));
        }
        
        if (createSetForm) {
            createSetForm.addEventListener('submit', handleCreateSetFormSubmit);
        }
        
        if (generateCardsForm) {
            generateCardsForm.addEventListener('submit', handleGenerateCardsFormSubmit);
        }
        
        // Set up modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal').forEach(modal => {
                    modal.classList.remove('active');
                });
            });
        });
        
        // Set up overlay click to close modals
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    document.querySelectorAll('.modal').forEach(modal => {
                        modal.classList.remove('active');
                    });
                }
            });
        });
        
        // Initial UI update
        updateFlashcardSetsUI();
        
        console.log('Flashcards module initialized');
    }
    
    // Show a modal by ID
    function showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    }
    
    // Handle form submission for creating a new set
    function handleCreateSetFormSubmit(event) {
        event.preventDefault();
        
        const setNameInput = document.getElementById('set-name');
        const setName = setNameInput ? setNameInput.value.trim() : '';
        
        if (!setName) {
            alert('Bitte gib einen Namen für das Kartenset ein.');
            return;
        }
        
        // Create empty flashcard set
        createFlashcardSet(setName, [
            { id: generateUniqueId(), front: 'Vorderseite 1', back: 'Rückseite 1', mastery: 0 },
            { id: generateUniqueId(), front: 'Vorderseite 2', back: 'Rückseite 2', mastery: 0 }
        ]);
        
        // Close modal
        document.getElementById('create-set-modal').classList.remove('active');
        
        // Clear form
        if (setNameInput) {
            setNameInput.value = '';
        }
    }
    
    // Handle form submission for generating cards
    function handleGenerateCardsFormSubmit(event) {
        event.preventDefault();
        
        const materialSelect = document.getElementById('material-for-cards');
        const materialId = materialSelect ? materialSelect.value : '';
        
        if (!materialId) {
            alert('Bitte wähle ein Lernmaterial aus.');
            return;
        }
        
        // Generate cards from selected material
        generateCardsFromMaterial(materialId);
        
        // Close modal
        document.getElementById('generate-cards-modal').classList.remove('active');
    }

    // Create a new flashcard set
    function createFlashcardSet(name, cards) {
        console.log('Creating new flashcard set:', name);
        
        const newSet = {
            id: generateUniqueId(),
            name: name,
            cards: cards || [],
            created: new Date().toISOString(),
            lastModified: new Date().toISOString()
        };
        
        // Add new set to the array
        flashcardSets.push(newSet);
        
        // Save to localStorage
        saveFlashcards();
        
        // Update the UI
        updateFlashcardSetsUI();
        
        return newSet;
    }
    
    // Generate cards from learning material using AI
    function generateCardsFromMaterial(materialId) {
        console.log('Generating cards from material:', materialId);
        
        // Find the selected material
        let materials = [];
        try {
            materials = JSON.parse(localStorage.getItem('materials')) || [];
        } catch (err) {
            console.error('Error loading materials:', err);
        }
        
        const material = materials.find(m => m.id === materialId);
        if (!material) {
            alert('Das ausgewählte Material wurde nicht gefunden.');
            return;
        }
        
        // Show loading indicator
        const loadingElement = document.getElementById('flashcard-loading');
        if (loadingElement) {
            loadingElement.style.display = 'flex';
        }
        
        // Make API call to generate flashcards
        fetch('/api/ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'generateFlashcards',
                material: material
            })
        })
        .then(response => response.json())
        .then(data => {
            // Hide loading indicator
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
            
            if (data.success && Array.isArray(data.flashcards)) {
                // Map API response to card format
                const cards = data.flashcards.map(card => ({
                    id: generateUniqueId(),
                    front: card.front || card.question || '',
                    back: card.back || card.answer || '',
                    mastery: 0,
                    lastReviewed: null
                }));
                
                // Create new set with the generated cards
                const setName = `${material.name} - Karteikarten`;
                const newSet = createFlashcardSet(setName, cards);
                
                alert(`${cards.length} Karteikarten wurden erfolgreich erstellt!`);
            } else {
                console.error('Error generating flashcards:', data.error || 'Unknown error');
                alert('Fehler bei der Generierung der Karteikarten. Bitte versuche es später erneut.');
            }
        })
        .catch(error => {
            console.error('API call failed:', error);
            
            // Hide loading indicator
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
            
            alert('Es ist ein Fehler aufgetreten. Bitte versuche es später erneut.');
        });
    }
    
    // Start a study session with the selected set
    function startStudySession(setId, mode = 'learn') {
        console.log('Starting study session:', setId, mode);
        
        // Find the set index
        currentSetIndex = flashcardSets.findIndex(set => set.id === setId);
        
        if (currentSetIndex === -1) {
            alert('Kartenset nicht gefunden.');
            return;
        }
        
        studyMode = mode;
        currentCardIndex = 0;
        isCardFlipped = false;
        
        // Prepare cards based on study mode
        prepareCardsForStudy();
        
        // Show study interface
        showStudyInterface();
    }
    
    // Prepare cards for study based on mode
    function prepareCardsForStudy() {
        const currentSet = flashcardSets[currentSetIndex];
        if (!currentSet || !Array.isArray(currentSet.cards)) {
            cardsToReview = [];
            return;
        }
        
        switch (studyMode) {
            case 'review':
                // For review mode, select cards that need review based on mastery level
                cardsToReview = currentSet.cards
                    .filter(card => card.mastery < 5)
                    .sort((a, b) => (a.mastery || 0) - (b.mastery || 0));
                break;
                
            case 'test':
                // For test mode, randomly select up to 20 cards
                cardsToReview = [...currentSet.cards]
                    .sort(() => Math.random() - 0.5)
                    .slice(0, 20);
                break;
                
            case 'learn':
            default:
                // For learn mode, use all cards in original order
                cardsToReview = [...currentSet.cards];
                break;
        }
        
        // If no cards to review, use all cards
        if (cardsToReview.length === 0) {
            cardsToReview = [...currentSet.cards];
        }
        
        console.log(`Prepared ${cardsToReview.length} cards for ${studyMode} mode`);
    }
    
    // Show the study interface
    function showStudyInterface() {
        if (!flashcardsPage || !studyContainer) return;
        
        // Hide sets container, show study container
        const setsView = document.getElementById('flashcard-sets-view');
        if (setsView) setsView.style.display = 'none';
        
        studyContainer.style.display = 'block';
        
        // Update UI
        updateStudyInterface();
    }
    
    // Update the study interface with current card
    function updateStudyInterface() {
        const currentSet = flashcardSets[currentSetIndex];
        if (!currentSet || !studyContainer) return;
        
        // Update set name and progress
        const setNameElement = studyContainer.querySelector('.study-set-name');
        const progressElement = studyContainer.querySelector('.study-progress');
        
        if (setNameElement) {
            setNameElement.textContent = currentSet.name;
        }
        
        if (progressElement) {
            const progress = cardsToReview.length > 0 ? 
                Math.round(((currentCardIndex + 1) / cardsToReview.length) * 100) : 0;
            progressElement.textContent = `${currentCardIndex + 1}/${cardsToReview.length} (${progress}%)`;
        }
        
        // Update card content
        const cardElement = document.getElementById('current-card');
        if (!cardElement || currentCardIndex >= cardsToReview.length) return;
        
        const currentCard = cardsToReview[currentCardIndex];
        
        const frontContent = cardElement.querySelector('.card-front .card-content');
        const backContent = cardElement.querySelector('.card-back .card-content');
        
        if (frontContent) {
            frontContent.innerHTML = currentCard.front;
        }
        
        if (backContent) {
            backContent.innerHTML = currentCard.back;
        }
        
        // Reset card flip state
        isCardFlipped = false;
        cardElement.classList.remove('flipped');
        
        // Hide confidence buttons initially
        if (confidenceButtons) {
            confidenceButtons.style.display = 'none';
        }
    }
    
    // Flip the current flashcard
    function flipCard() {
        isCardFlipped = !isCardFlipped;
        
        const cardElement = document.getElementById('current-card');
        if (!cardElement) return;
        
        if (isCardFlipped) {
            cardElement.classList.add('flipped');
            playSound(cardFlipSound);
            
            // Show confidence buttons in review mode
            if (studyMode === 'review' && confidenceButtons) {
                confidenceButtons.style.display = 'flex';
            }
        } else {
            cardElement.classList.remove('flipped');
            
            // Hide confidence buttons
            if (confidenceButtons) {
                confidenceButtons.style.display = 'none';
            }
        }
    }
    
    // Move to the next card
    function nextCard() {
        if (currentCardIndex < cardsToReview.length - 1) {
            currentCardIndex++;
            updateStudyInterface();
        } else {
            // End of session
            endStudySession();
        }
    }
    
    // Move to the previous card
    function prevCard() {
        if (currentCardIndex > 0) {
            currentCardIndex--;
            updateStudyInterface();
        }
    }
    
    // End the study session
    function endStudySession() {
        // Update set's last reviewed date
        if (currentSetIndex >= 0 && flashcardSets[currentSetIndex]) {
            flashcardSets[currentSetIndex].lastReviewed = new Date().toISOString();
            saveFlashcards();
        }
        
        // Show summary
        showStudySummary();
        
        // Reset state
        currentSetIndex = -1;
        currentCardIndex = 0;
        cardsToReview = [];
    }
    
    // Show study session summary
    function showStudySummary() {
        // Implementation depends on your UI design
        alert('Lernsession abgeschlossen!');
        
        // Return to sets view
        const setsView = document.getElementById('flashcard-sets-view');
        if (setsView) setsView.style.display = 'block';
        
        if (studyContainer) {
            studyContainer.style.display = 'none';
        }
    }
    
    // Update mastery level based on confidence
    function updateMastery(confidenceLevel) {
        if (currentSetIndex < 0 || currentCardIndex >= cardsToReview.length) return;
        
        const currentCardId = cardsToReview[currentCardIndex].id;
        const cardIndex = flashcardSets[currentSetIndex].cards.findIndex(c => c.id === currentCardId);
        
        if (cardIndex >= 0) {
            const card = flashcardSets[currentSetIndex].cards[cardIndex];
            
            // Update mastery based on confidence level (0=low, 1=medium, 2=high)
            switch (confidenceLevel) {
                case 0: // Low confidence
                    card.mastery = Math.max(0, (card.mastery || 0) - 1);
                    playSound(wrongAnswerSound);
                    break;
                    
                case 1: // Medium confidence
                    // Keep mastery the same
                    break;
                    
                case 2: // High confidence
                    card.mastery = Math.min(5, (card.mastery || 0) + 1);
                    playSound(correctAnswerSound);
                    break;
            }
            
            // Update last reviewed time
            card.lastReviewed = new Date().toISOString();
            
            // Save changes
            saveFlashcards();
        }
        
        // Move to next card after rating
        nextCard();
    }
    
    // Edit an existing flashcard set
    function editFlashcardSet(setId) {
        const setIndex = flashcardSets.findIndex(set => set.id === setId);
        
        if (setIndex === -1) {
            alert('Kartenset nicht gefunden.');
            return;
        }
        
        // Show edit modal (implementation depends on your UI)
        showEditModal(flashcardSets[setIndex]);
    }
    
    // Show edit modal for a flashcard set
    function showEditModal(set) {
        // Implementation depends on your UI design
        const editModal = document.getElementById('edit-set-modal');
        if (!editModal) return;
        
        // Populate form fields
        const setNameInput = editModal.querySelector('#edit-set-name');
        const cardsContainer = editModal.querySelector('#edit-cards-container');
        
        if (setNameInput) {
            setNameInput.value = set.name;
        }
        
        if (cardsContainer) {
            // Clear existing cards
            cardsContainer.innerHTML = '';
            
            // Add each card to the form
            set.cards.forEach(card => {
                const cardElement = document.createElement('div');
                cardElement.className = 'edit-card';
                cardElement.innerHTML = `
                    <div class="card-side">
                        <label>Vorderseite:</label>
                        <textarea data-card-id="${card.id}" data-side="front">${card.front}</textarea>
                    </div>
                    <div class="card-side">
                        <label>Rückseite:</label>
                        <textarea data-card-id="${card.id}" data-side="back">${card.back}</textarea>
                    </div>
                    <button type="button" class="delete-card" data-card-id="${card.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
                
                cardsContainer.appendChild(cardElement);
            });
            
            // Add delete button event listeners
            cardsContainer.querySelectorAll('.delete-card').forEach(btn => {
                btn.addEventListener('click', function() {
                    const cardId = this.getAttribute('data-card-id');
                    this.closest('.edit-card').remove();
                });
            });
            
            // Add "Add Card" button
            const addCardBtn = document.createElement('button');
            addCardBtn.type = 'button';
            addCardBtn.className = 'btn-secondary add-card';
            addCardBtn.innerHTML = '<i class="fas fa-plus"></i> Neue Karte hinzufügen';
            addCardBtn.addEventListener('click', function() {
                const newCardId = generateUniqueId();
                const cardElement = document.createElement('div');
                cardElement.className = 'edit-card';
                cardElement.innerHTML = `
                    <div class="card-side">
                        <label>Vorderseite:</label>
                        <textarea data-card-id="${newCardId}" data-side="front"></textarea>
                    </div>
                    <div class="card-side">
                        <label>Rückseite:</label>
                        <textarea data-card-id="${newCardId}" data-side="back"></textarea>
                    </div>
                    <button type="button" class="delete-card" data-card-id="${newCardId}">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
                
                cardsContainer.insertBefore(cardElement, this);
                
                // Add delete button event listener
                cardElement.querySelector('.delete-card').addEventListener('click', function() {
                    cardElement.remove();
                });
            });
            
            cardsContainer.appendChild(addCardBtn);
        }
        
        // Set up save button
        const saveButton = editModal.querySelector('#save-edited-set');
        if (saveButton) {
            // Remove existing event listeners
            const newSaveButton = saveButton.cloneNode(true);
            saveButton.parentNode.replaceChild(newSaveButton, saveButton);
            
            // Add new event listener
            newSaveButton.addEventListener('click', function() {
                saveEditedSet(set.id);
            });
        }
        
        // Show the modal
        editModal.classList.add('active');
    }
    
    // Save edited flashcard set
    function saveEditedSet(setId) {
        const editModal = document.getElementById('edit-set-modal');
        if (!editModal) return;
        
        const setNameInput = editModal.querySelector('#edit-set-name');
        const setName = setNameInput ? setNameInput.value.trim() : '';
        
        if (!setName) {
            alert('Bitte gib einen Namen für das Kartenset ein.');
            return;
        }
        
        const setIndex = flashcardSets.findIndex(set => set.id === setId);
        if (setIndex === -1) {
            alert('Kartenset nicht gefunden.');
            return;
        }
        
        // Update set name
        flashcardSets[setIndex].name = setName;
        
        // Update cards
        const cards = [];
        editModal.querySelectorAll('.edit-card').forEach(cardElement => {
            const frontTextarea = cardElement.querySelector('textarea[data-side="front"]');
            const backTextarea = cardElement.querySelector('textarea[data-side="back"]');
            const cardId = frontTextarea ? frontTextarea.getAttribute('data-card-id') : null;
            
            if (frontTextarea && backTextarea && cardId) {
                const front = frontTextarea.value.trim();
                const back = backTextarea.value.trim();
                
                // Only add cards that have content
                if (front || back) {
                    // Find existing card to preserve mastery and review data
                    const existingCard = flashcardSets[setIndex].cards.find(c => c.id === cardId);
                    
                    cards.push({
                        id: cardId,
                        front: front,
                        back: back,
                        mastery: existingCard ? existingCard.mastery || 0 : 0,
                        lastReviewed: existingCard ? existingCard.lastReviewed : null
                    });
                }
            }
        });
        
        // Update the set
        flashcardSets[setIndex].cards = cards;
        flashcardSets[setIndex].lastModified = new Date().toISOString();
        
        // Save changes
        saveFlashcards();
        
        // Update UI
        updateFlashcardSetsUI();
        
        // Close modal
        editModal.classList.remove('active');
    }
    
    // Delete a flashcard set
    function deleteFlashcardSet(setId) {
        if (confirm('Bist du sicher, dass du dieses Kartenset löschen willst? Diese Aktion kann nicht rückgängig gemacht werden.')) {
            const setIndex = flashcardSets.findIndex(set => set.id === setId);
            
            if (setIndex !== -1) {
                flashcardSets.splice(setIndex, 1);
                saveFlashcards();
                updateFlashcardSetsUI();
            }
        }
    }
    
    // Save flashcards to localStorage
    function saveFlashcards() {
        try {
            localStorage.setItem('flashcardSets', JSON.stringify(flashcardSets));
            console.log('Flashcards saved successfully');
        } catch (err) {
            console.error('Error saving flashcards:', err);
        }
    }
    
    // Load flashcards from localStorage
    function loadFlashcards() {
        try {
            const savedSets = localStorage.getItem('flashcardSets');
            if (savedSets) {
                flashcardSets = JSON.parse(savedSets);
            }
        } catch (err) {
            console.error('Error loading flashcards:', err);
            flashcardSets = [];
        }
    }
    
    // Update the UI with flashcard sets
    function updateFlashcardSetsUI() {
        if (!flashcardSetsContainer) {
            console.warn('Flashcard sets container not found');
            return;
        }
        
        // Clear existing content
        flashcardSetsContainer.innerHTML = '';
        
        // Show empty state if no sets
        if (flashcardSets.length === 0) {
            flashcardSetsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-layer-group"></i>
                    <p>Keine Karteikarten-Sets vorhanden</p>
                    <p>Erstelle ein neues Set oder generiere automatisch Karteikarten aus deinen Lernmaterialien</p>
                </div>
            `;
            return;
        }
        
        // Create UI for each set
        flashcardSets.forEach(set => {
            const setElement = document.createElement('div');
            setElement.className = 'flashcard-set-card';
            setElement.innerHTML = `
                <h3>${set.name}</h3>
                <p>${set.cards.length} Karten</p>
                <div class="card-actions">
                    <button class="btn-primary start-study" data-set-id="${set.id}">
                        <i class="fas fa-play"></i> Lernen
                    </button>
                    <button class="btn-secondary edit-set" data-set-id="${set.id}">
                        <i class="fas fa-edit"></i> Bearbeiten
                    </button>
                    <button class="btn-danger delete-set" data-set-id="${set.id}">
                        <i class="fas fa-trash"></i> Löschen
                    </button>
                </div>
            `;
            
            flashcardSetsContainer.appendChild(setElement);
        });
        
        // Add event listeners to the buttons
        flashcardSetsContainer.querySelectorAll('.start-study').forEach(button => {
            button.addEventListener('click', function() {
                const setId = this.getAttribute('data-set-id');
                startStudySession(setId, 'learn');
            });
        });
        
        flashcardSetsContainer.querySelectorAll('.edit-set').forEach(button => {
            button.addEventListener('click', function() {
                const setId = this.getAttribute('data-set-id');
                editFlashcardSet(setId);
            });
        });
        
        flashcardSetsContainer.querySelectorAll('.delete-set').forEach(button => {
            button.addEventListener('click', function() {
                const setId = this.getAttribute('data-set-id');
                deleteFlashcardSet(setId);
            });
        });
    }
    
    // Helper functions
    
    // Generate a unique ID
    function generateUniqueId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    }
    
    // Play sound with proper error handling
    function playSound(sound) {
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(err => console.warn('Could not play sound:', err));
        }
    }
    
    // Helper to update the flashcardSets array directly (for legacy function compatibility)
    function updateFlashcardSetsList() {
        updateFlashcardSetsUI();
    }
    
    // Public API
    return {
        init: init,
        createSet: createFlashcardSet,
        createFlashcardSet: createFlashcardSet,
        generateFromMaterial: generateCardsFromMaterial,
        startStudy: startStudySession,
        editSet: editFlashcardSet,
        deleteSet: deleteFlashcardSet,
        flipCard: flipCard,
        nextCard: nextCard,
        prevCard: prevCard,
        updateMastery: updateMastery
    };
})();

// Initialize the module when document is ready
document.addEventListener('DOMContentLoaded', function() {
    Flashcards.init();
});