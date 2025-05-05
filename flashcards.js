/**
 * Flashcards Module
 * Implements a spaced repetition flashcard system for effective learning
 */

const Flashcards = (function() {
    // Flashcard data and state
    let flashcardSets = [];
    let currentSetIndex = -1;
    let currentCardIndex = 0;
    let isCardFlipped = false;
    let studyMode = 'learn'; // 'learn', 'review', 'test'
    let cardsToReview = [];
    
    // Sound effects
    const cardFlipSound = new Audio('sounds/card-flip.mp3');
    const correctAnswerSound = new Audio('sounds/correct-answer.mp3');
    const wrongAnswerSound = new Audio('sounds/wrong-answer.mp3');
    
    // DOM Elements
    const flashcardsPage = document.getElementById('flashcards');
    const flashcardSetsContainer = document.getElementById('flashcard-sets-container');
    const createSetBtn = document.getElementById('create-flashcard-set');
    const autoGenerateBtn = document.getElementById('auto-generate-cards');
    
    // Study mode elements (will be created dynamically)
    let studyContainer, cardFront, cardBack, nextCardBtn, prevCardBtn, flipCardBtn;
    let confidenceButtons, progressBar, exitStudyBtn;
    
    // Initialize the module
    function init() {
        // Load saved flashcard sets
        loadFlashcards();
        
        // Set up event listeners
        if (createSetBtn) {
            createSetBtn.addEventListener('click', showCreateSetModal);
        }
        
        if (autoGenerateBtn) {
            autoGenerateBtn.addEventListener('click', showAutoGenerateModal);
        }
        
        // Initial UI update
        updateFlashcardSetsUI();
        
        console.log('Flashcards module initialized');
    }
    
    // Load flashcards from localStorage
    function loadFlashcards() {
        try {
            const savedSets = localStorage.getItem('flashcardSets');
            if (savedSets) {
                flashcardSets = JSON.parse(savedSets);
                // Update last reviewed dates to Date objects
                flashcardSets.forEach(set => {
                    if (set.lastReviewed) {
                        set.lastReviewed = new Date(set.lastReviewed);
                    }
                    set.cards.forEach(card => {
                        if (card.lastReviewed) {
                            card.lastReviewed = new Date(card.lastReviewed);
                        }
                    });
                });
            }
        } catch (err) {
            console.error('Error loading flashcards:', err);
            flashcardSets = [];
        }
    }
    
    // Save flashcards to localStorage
    function saveFlashcards() {
        try {
            localStorage.setItem('flashcardSets', JSON.stringify(flashcardSets));
        } catch (err) {
            console.error('Error saving flashcards:', err);
            showNotification('Fehler', 'Karteikarten konnten nicht gespeichert werden', 'error');
        }
    }
    
    // Update the flashcard sets UI
    function updateFlashcardSetsUI() {
        if (!flashcardSetsContainer) return;
        
        // Clear the container
        flashcardSetsContainer.innerHTML = '';
        
        if (flashcardSets.length === 0) {
            // Show empty state
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                <i class="fas fa-clone"></i>
                <h3>Keine Karteikarten</h3>
                <p>Erstelle ein neues Kartenset oder generiere automatisch Karten aus deinen Lernmaterialien.</p>
            `;
            flashcardSetsContainer.appendChild(emptyState);
            return;
        }
        
        // Create card for each set
        flashcardSets.forEach((set, index) => {
            const setElement = document.createElement('div');
            setElement.className = 'flashcard-set';
            
            // Calculate due status and class
            let statusClass = '';
            let statusText = '';
            
            if (set.cards.length === 0) {
                statusClass = 'status-empty';
                statusText = 'Leer';
            } else if (!set.lastReviewed) {
                statusClass = 'status-new';
                statusText = 'Neu';
            } else {
                const daysAgo = Math.floor((new Date() - new Date(set.lastReviewed)) / (1000 * 60 * 60 * 24));
                if (daysAgo >= 3) {
                    statusClass = 'status-due';
                    statusText = 'Fällig';
                } else {
                    statusClass = 'status-reviewed';
                    statusText = 'Aktuell';
                }
            }
            
            // Calculate mastery percentage
            let masteryPercent = 0;
            if (set.cards.length > 0) {
                const totalMastery = set.cards.reduce((sum, card) => sum + (card.mastery || 0), 0);
                masteryPercent = Math.round((totalMastery / set.cards.length) * 100);
            }
            
            setElement.innerHTML = `
                <div class="set-header">
                    <span class="set-status ${statusClass}">${statusText}</span>
                    <div class="set-actions">
                        <button class="edit-set-btn" data-index="${index}" aria-label="Set bearbeiten">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete-set-btn" data-index="${index}" aria-label="Set löschen">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <h3>${set.title}</h3>
                <div class="set-info">
                    <span>${set.cards.length} Karten</span>
                    <span class="set-subject">${set.subject || 'Allgemein'}</span>
                </div>
                <div class="set-mastery">
                    <div class="mastery-bar">
                        <div class="mastery-progress" style="width: ${masteryPercent}%"></div>
                    </div>
                    <span class="mastery-label">${masteryPercent}% Beherrschung</span>
                </div>
                <div class="set-actions">
                    <button class="study-set-btn" data-index="${index}">
                        <i class="fas fa-play"></i> Lernen
                    </button>
                    <button class="review-set-btn" data-index="${index}">
                        <i class="fas fa-sync"></i> Wiederholen
                    </button>
                </div>
            `;
            
            flashcardSetsContainer.appendChild(setElement);
            
            // Add event listeners to buttons
            const studyBtn = setElement.querySelector('.study-set-btn');
            const reviewBtn = setElement.querySelector('.review-set-btn');
            const editBtn = setElement.querySelector('.edit-set-btn');
            const deleteBtn = setElement.querySelector('.delete-set-btn');
            
            studyBtn.addEventListener('click', () => startStudySession(index, 'learn'));
            reviewBtn.addEventListener('click', () => startStudySession(index, 'review'));
            editBtn.addEventListener('click', () => editFlashcardSet(index));
            deleteBtn.addEventListener('click', () => confirmDeleteSet(index));
        });
    }
    
    // Show create flashcard set modal
    function showCreateSetModal() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'create-flashcard-modal';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Neues Kartenset erstellen</h2>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="create-set-form">
                        <div class="form-group">
                            <label for="set-title">Titel</label>
                            <input type="text" id="set-title" placeholder="z.B. Mathematik Grundlagen" required>
                        </div>
                        <div class="form-group">
                            <label for="set-subject">Fach</label>
                            <input type="text" id="set-subject" placeholder="z.B. Mathematik">
                        </div>
                        <div class="form-group">
                            <label for="set-description">Beschreibung (optional)</label>
                            <textarea id="set-description" placeholder="Beschreibe dein Kartenset..."></textarea>
                        </div>
                        <button type="submit" class="btn-primary">Kartenset erstellen</button>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // Close button functionality
        const closeBtn = modal.querySelector('.close-modal');
        closeBtn.addEventListener('click', () => {
            closeModal(modal);
        });
        
        // Form submission
        const form = modal.querySelector('#create-set-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const title = document.getElementById('set-title').value;
            const subject = document.getElementById('set-subject').value;
            const description = document.getElementById('set-description').value;
            
            createFlashcardSet(title, subject, description);
            closeModal(modal);
        });
    }
    
    // Show auto-generate cards modal
    function showAutoGenerateModal() {
        // Get materials to select from
        const materials = JSON.parse(localStorage.getItem('materials')) || [];
        
        if (materials.length === 0) {
            showNotification('Keine Materialien', 'Du musst zuerst Lernmaterialien hochladen', 'warning');
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'auto-generate-modal';
        
        let materialsOptions = materials.map(material => 
            `<option value="${material.id}">${material.name}</option>`
        ).join('');
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Karteikarten automatisch erstellen</h2>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="auto-generate-form">
                        <div class="form-group">
                            <label for="material-select">Material auswählen</label>
                            <select id="material-select" required>
                                <option value="">-- Wähle ein Material --</option>
                                ${materialsOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="set-title-auto">Titel des Kartensets</label>
                            <input type="text" id="set-title-auto" placeholder="Wird automatisch ausgefüllt" required>
                        </div>
                        <div class="form-group">
                            <label for="cards-number">Anzahl der Karten</label>
                            <input type="number" id="cards-number" min="5" max="50" value="20" required>
                        </div>
                        <div class="form-group">
                            <label for="difficulty-level">Schwierigkeitsgrad</label>
                            <select id="difficulty-level">
                                <option value="mixed">Gemischt</option>
                                <option value="basic">Grundlagen</option>
                                <option value="advanced">Fortgeschritten</option>
                            </select>
                        </div>
                        <button type="submit" class="btn-primary">
                            <i class="fas fa-magic"></i> Karten generieren
                        </button>
                    </form>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // Close button functionality
        const closeBtn = modal.querySelector('.close-modal');
        closeBtn.addEventListener('click', () => {
            closeModal(modal);
        });
        
        // Auto-update title when material is selected
        const materialSelect = document.getElementById('material-select');
        const titleInput = document.getElementById('set-title-auto');
        
        materialSelect.addEventListener('change', () => {
            if (materialSelect.value) {
                const selectedMaterial = materials.find(m => m.id === materialSelect.value);
                if (selectedMaterial) {
                    titleInput.value = `${selectedMaterial.name} - Karteikarten`;
                }
            } else {
                titleInput.value = '';
            }
        });
        
        // Form submission
        const form = modal.querySelector('#auto-generate-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const materialId = document.getElementById('material-select').value;
            const title = document.getElementById('set-title-auto').value;
            const numCards = parseInt(document.getElementById('cards-number').value);
            const difficulty = document.getElementById('difficulty-level').value;
            
            generateCardsFromMaterial(materialId, title, numCards, difficulty);
            closeModal(modal);
            
            // Show loading indicator
            showLoading('Generiere Karteikarten...');
        });
    }
    
    // Create a new flashcard set
    function createFlashcardSet(title, subject, description = '') {
        const newSet = {
            id: generateUniqueId(),
            title: title,
            subject: subject,
            description: description,
            dateCreated: new Date(),
            lastReviewed: null,
            cards: [],
            tags: []
        };
        
        flashcardSets.push(newSet);
        saveFlashcards();
        updateFlashcardSetsUI();
        
        showNotification('Kartenset erstellt', 'Neues Kartenset wurde erfolgreich erstellt', 'success');
        
        // Open the edit mode to add cards
        editFlashcardSet(flashcardSets.length - 1);
    }
    
    // Edit a flashcard set
    function editFlashcardSet(index) {
        const set = flashcardSets[index];
        
        const modal = document.createElement('div');
        modal.className = 'modal large-modal';
        modal.id = 'edit-flashcard-modal';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Kartenset bearbeiten: ${set.title}</h2>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="edit-set-container">
                        <div class="set-details">
                            <div class="form-group">
                                <label for="edit-set-title">Titel</label>
                                <input type="text" id="edit-set-title" value="${set.title}" required>
                            </div>
                            <div class="form-group">
                                <label for="edit-set-subject">Fach</label>
                                <input type="text" id="edit-set-subject" value="${set.subject || ''}">
                            </div>
                            <div class="form-group">
                                <label for="edit-set-description">Beschreibung</label>
                                <textarea id="edit-set-description">${set.description || ''}</textarea>
                            </div>
                        </div>
                        
                        <div class="cards-editor">
                            <h3>Karten <span id="card-count">(${set.cards.length})</span></h3>
                            <button id="add-card-btn" class="btn-primary">
                                <i class="fas fa-plus"></i> Neue Karte
                            </button>
                            
                            <div class="cards-list" id="cards-list">
                                <!-- Cards will be loaded here -->
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-actions">
                        <button id="save-set-btn" class="btn-primary">Speichern</button>
                        <button id="cancel-edit-btn" class="btn-secondary">Abbrechen</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // Fill the cards list
        const cardsList = modal.querySelector('#cards-list');
        renderCardsList(cardsList, set.cards);
        
        // Close button functionality
        const closeBtn = modal.querySelector('.close-modal');
        closeBtn.addEventListener('click', () => {
            if (confirmUnsavedChanges()) {
                closeModal(modal);
            }
        });
        
        // Add new card
        const addCardBtn = modal.querySelector('#add-card-btn');
        addCardBtn.addEventListener('click', () => {
            set.cards.push({
                id: generateUniqueId(),
                front: '',
                back: '',
                mastery: 0,
                lastReviewed: null
            });
            renderCardsList(cardsList, set.cards);
        });
        
        // Save changes
        const saveBtn = modal.querySelector('#save-set-btn');
        saveBtn.addEventListener('click', () => {
            // Update set details
            set.title = document.getElementById('edit-set-title').value;
            set.subject = document.getElementById('edit-set-subject').value;
            set.description = document.getElementById('edit-set-description').value;
            
            // Update cards content from inputs
            const cardFronts = modal.querySelectorAll('.card-front');
            const cardBacks = modal.querySelectorAll('.card-back');
            
            cardFronts.forEach((frontEl, i) => {
                if (i < set.cards.length) {
                    set.cards[i].front = frontEl.value;
                }
            });
            
            cardBacks.forEach((backEl, i) => {
                if (i < set.cards.length) {
                    set.cards[i].back = backEl.value;
                }
            });
            
            // Filter out empty cards
            set.cards = set.cards.filter(card => card.front.trim() !== '' || card.back.trim() !== '');
            
            // Save and update UI
            saveFlashcards();
            updateFlashcardSetsUI();
            
            closeModal(modal);
            showNotification('Änderungen gespeichert', 'Deine Änderungen wurden gespeichert', 'success');
        });
        
        // Cancel button
        const cancelBtn = modal.querySelector('#cancel-edit-btn');
        cancelBtn.addEventListener('click', () => {
            if (confirmUnsavedChanges()) {
                closeModal(modal);
            }
        });
    }
    
    // Render the cards list in edit mode
    function renderCardsList(container, cards) {
        container.innerHTML = '';
        
        if (cards.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-cards-state';
            emptyState.innerHTML = `
                <p>Keine Karten vorhanden. Füge neue Karten hinzu.</p>
            `;
            container.appendChild(emptyState);
            return;
        }
        
        cards.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'edit-card';
            cardEl.setAttribute('data-card-id', card.id);
            
            cardEl.innerHTML = `
                <div class="card-number">${index + 1}</div>
                <div class="card-content">
                    <div class="form-group">
                        <label>Vorderseite</label>
                        <textarea class="card-front" placeholder="Frage oder Begriff">${card.front || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Rückseite</label>
                        <textarea class="card-back" placeholder="Antwort oder Definition">${card.back || ''}</textarea>
                    </div>
                </div>
                <div class="card-actions">
                    <button class="move-card-up" data-index="${index}" aria-label="Nach oben">
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button class="move-card-down" data-index="${index}" aria-label="Nach unten">
                        <i class="fas fa-arrow-down"></i>
                    </button>
                    <button class="delete-card" data-index="${index}" aria-label="Löschen">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            container.appendChild(cardEl);
            
            // Add event listeners
            const upBtn = cardEl.querySelector('.move-card-up');
            const downBtn = cardEl.querySelector('.move-card-down');
            const deleteBtn = cardEl.querySelector('.delete-card');
            
            upBtn.addEventListener('click', () => {
                if (index > 0) {
                    // Swap with previous card
                    [cards[index - 1], cards[index]] = [cards[index], cards[index - 1]];
                    renderCardsList(container, cards);
                }
            });
            
            downBtn.addEventListener('click', () => {
                if (index < cards.length - 1) {
                    // Swap with next card
                    [cards[index], cards[index + 1]] = [cards[index + 1], cards[index]];
                    renderCardsList(container, cards);
                }
            });
            
            deleteBtn.addEventListener('click', () => {
                // Remove card
                cards.splice(index, 1);
                renderCardsList(container, cards);
                
                // Update card count
                const cardCount = document.getElementById('card-count');
                if (cardCount) {
                    cardCount.textContent = `(${cards.length})`;
                }
            });
        });
    }
    
    // Start study session
    function startStudySession(setIndex, mode) {
        currentSetIndex = setIndex;
        const set = flashcardSets[setIndex];
        
        if (!set || set.cards.length === 0) {
            showNotification('Keine Karten', 'Dieses Set enthält keine Karten zum Lernen', 'warning');
            return;
        }
        
        // Setup study mode
        studyMode = mode;
        currentCardIndex = 0;
        isCardFlipped = false;
        
        // Prepare cards for review mode
        if (mode === 'review') {
            // Sort by mastery level (lowest first) and last reviewed (oldest first)
            cardsToReview = [...set.cards].sort((a, b) => {
                // First by mastery
                if ((a.mastery || 0) !== (b.mastery || 0)) {
                    return (a.mastery || 0) - (b.mastery || 0);
                }
                
                // Then by last reviewed date (oldest first)
                if (!a.lastReviewed) return -1;
                if (!b.lastReviewed) return 1;
                return new Date(a.lastReviewed) - new Date(b.lastReviewed);
            });
        } else {
            // Use original order for learn mode
            cardsToReview = [...set.cards];
        }
        
        // Create the study mode UI
        createStudyModeUI(set);
        
        // Update the first card
        updateCardDisplay();
        
        // Update set last reviewed time
        set.lastReviewed = new Date();
        saveFlashcards();
    }
    
    // Create study mode UI
    function createStudyModeUI(set) {
        // Hide the flashcards list
        if (flashcardSetsContainer) {
            flashcardSetsContainer.style.display = 'none';
        }
        
        // Create or get the study container
        let studyContainerExists = document.getElementById('flashcard-study-container');
        
        if (!studyContainerExists) {
            studyContainer = document.createElement('div');
            studyContainer.id = 'flashcard-study-container';
            studyContainer.className = 'flashcard-study-container';
            
            // Add to the flashcards page
            if (flashcardsPage) {
                flashcardsPage.appendChild(studyContainer);
            }
        } else {
            studyContainer = studyContainerExists;
            studyContainer.style.display = 'block';
        }
        
        // Populate the study container
        studyContainer.innerHTML = `
            <div class="study-header">
                <h2>${set.title}</h2>
                <div class="study-progress">
                    <span id="card-progress">Karte 1/${cardsToReview.length}</span>
                    <div class="progress-bar">
                        <div class="progress" id="study-progress-bar" style="width: ${100 / cardsToReview.length}%"></div>
                    </div>
                </div>
                <button id="exit-study-btn" class="btn-secondary">
                    <i class="fas fa-times"></i> Beenden
                </button>
            </div>
            
            <div class="flashcard-container">
                <div class="flashcard" id="current-card">
                    <div class="card-front"></div>
                    <div class="card-back"></div>
                </div>
            </div>
            
            <div class="study-controls">
                <button id="prev-card-btn" class="btn-secondary" disabled>
                    <i class="fas fa-chevron-left"></i> Zurück
                </button>
                <button id="flip-card-btn" class="btn-primary">
                    <i class="fas fa-sync"></i> Umdrehen
                </button>
                <button id="next-card-btn" class="btn-secondary">
                    Weiter <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            
            <div class="confidence-controls" style="display: none;">
                <p>Wie gut kannst du diese Karte?</p>
                <div class="confidence-buttons">
                    <button class="confidence-btn" data-level="1">
                        <i class="far fa-frown"></i>
                        <span>Nicht gewusst</span>
                    </button>
                    <button class="confidence-btn" data-level="2">
                        <i class="far fa-meh"></i>
                        <span>Unsicher</span>
                    </button>
                    <button class="confidence-btn" data-level="3">
                        <i class="far fa-smile"></i>
                        <span>Gewusst</span>
                    </button>
                    <button class="confidence-btn" data-level="4">
                        <i class="far fa-grin-stars"></i>
                        <span>Perfekt</span>
                    </button>
                </div>
            </div>
        `;
        
        // Get references to UI elements
        const card = document.getElementById('current-card');
        cardFront = card.querySelector('.card-front');
        cardBack = card.querySelector('.card-back');
        
        prevCardBtn = document.getElementById('prev-card-btn');
        nextCardBtn = document.getElementById('next-card-btn');
        flipCardBtn = document.getElementById('flip-card-btn');
        exitStudyBtn = document.getElementById('exit-study-btn');
        
        progressBar = document.getElementById('study-progress-bar');
        confidenceButtons = document.querySelector('.confidence-controls');
        
        // Add event listeners
        prevCardBtn.addEventListener('click', previousCard);
        nextCardBtn.addEventListener('click', nextCard);
        flipCardBtn.addEventListener('click', flipCard);
        exitStudyBtn.addEventListener('click', exitStudyMode);
        
        // Add event listeners for confidence buttons
        const confBtns = document.querySelectorAll('.confidence-btn');
        confBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const level = parseInt(btn.getAttribute('data-level'));
                recordConfidence(level);
            });
        });
    }
    
    // Update card display
    function updateCardDisplay() {
        if (currentCardIndex < 0 || currentCardIndex >= cardsToReview.length) {
            return;
        }
        
        const card = cardsToReview[currentCardIndex];
        
        // Update UI elements
        if (cardFront) cardFront.innerHTML = card.front;
        if (cardBack) cardBack.innerHTML = card.back;
        
        // Update progress indicators
        const cardProgress = document.getElementById('card-progress');
        if (cardProgress) {
            cardProgress.textContent = `Karte ${currentCardIndex + 1}/${cardsToReview.length}`;
        }
        
        if (progressBar) {
            const progressPercent = ((currentCardIndex + 1) / cardsToReview.length) * 100;
            progressBar.style.width = `${progressPercent}%`;
        }
        
        // Reset card state
        isCardFlipped = false;
        
        // Update button states
        if (prevCardBtn) {
            prevCardBtn.disabled = currentCardIndex === 0;
        }
        
        if (nextCardBtn) {
            nextCardBtn.disabled = currentCardIndex === cardsToReview.length - 1 && !isCardFlipped;
        }
        
        // Hide confidence buttons until card is flipped
        if (confidenceButtons) {
            confidenceButtons.style.display = 'none';
        }
        
        // Reset card flip state
        const cardElement = document.getElementById('current-card');
        if (cardElement) {
            cardElement.classList.remove('flipped');
        }
    }
    
    // Flip the current card
    function flipCard() {
        isCardFlipped = !isCardFlipped;
        
        const cardElement = document.getElementById('current-card');
        if (cardElement) {
            if (isCardFlipped) {
                cardElement.classList.add('flipped');
                
                // Play flip sound
                if (cardFlipSound) {
                    cardFlipSound.currentTime = 0;
                    cardFlipSound.play().catch(err => console.log('Could not play sound:', err));
                }
                
                // Show confidence buttons in review mode
                if (studyMode === 'review' && confidenceButtons) {
                    confidenceButtons.style.display = 'block';
                }
                
                // Update card's last reviewed date
                if (currentSetIndex >= 0 && currentCardIndex >= 0) {
                    const card = flashcardSets[currentSetIndex].cards.find(
                        c => c.id === cardsToReview[currentCardIndex].id
                    );
                    
                    if (card) {
                        card.lastReviewed = new Date();
                        saveFlashcards();
                    }
                }
            } else {
                cardElement.classList.remove('flipped');
                
                // Hide confidence buttons
                if (confidenceButtons) {
                    confidenceButtons.style.display = 'none';
                }
            }
        }
    }
    
    // Go to the next card
    function nextCard() {
        if (currentCardIndex < cardsToReview.length - 1) {
            currentCardIndex++;
            updateCardDisplay();
        } else {
            // End of deck
            finishStudySession();
        }
    }
    
    // Go to the previous card
    function previousCard() {
        if (currentCardIndex > 0) {
            currentCardIndex--;
            updateCardDisplay();
        }
    }
    
    // Record confidence level and update spaced repetition
    function recordConfidence(level) {
        if (currentSetIndex < 0 || currentCardIndex < 0) return;
        
        // Find the actual card in the set (not just the review copy)
        const cardId = cardsToReview[currentCardIndex].id;
        const card = flashcardSets[currentSetIndex].cards.find(c => c.id === cardId);
        
        if (!card) return;
        
        // Update mastery level based on confidence
        // Mastery ranges from 0 to 100
        switch (level) {
            case 1: // Not at all
                card.mastery = Math.max(0, (card.mastery || 0) - 10);
                break;
            case 2: // Somewhat
                card.mastery = Math.min(40, (card.mastery || 0) + 5);
                break;
            case 3: // Well
                card.mastery = Math.min(70, (card.mastery || 0) + 15);
                break;
            case 4: // Perfect
                card.mastery = Math.min(100, (card.mastery || 0) + 25);
                break;
        }
        
        // Update last reviewed timestamp
        card.lastReviewed = new Date();
        
        // Play sound based on confidence
        if (level >= 3) {
            correctAnswerSound.currentTime = 0;
            correctAnswerSound.play().catch(err => console.log('Could not play sound:', err));
        } else {
            wrongAnswerSound.currentTime = 0;
            wrongAnswerSound.play().catch(err => console.log('Could not play sound:', err));
        }
        
        // Save changes
        saveFlashcards();
        
        // Go to next card
        nextCard();
    }
    
    // Finish study session
    function finishStudySession() {
        // Calculate results
        let totalMastery = 0;
        const set = flashcardSets[currentSetIndex];
        
        set.cards.forEach(card => {
            totalMastery += (card.mastery || 0);
        });
        
        const avgMastery = Math.round(totalMastery / set.cards.length);
        
        // Show results modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'study-results-modal';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Lerneinheit abgeschlossen!</h2>
                    <button class="close-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="results-summary">
                        <div class="result-stat">
                            <div class="result-value">${set.cards.length}</div>
                            <div class="result-label">Karten</div>
                        </div>
                        <div class="result-stat">
                            <div class="result-value">${avgMastery}%</div>
                            <div class="result-label">Beherrschung</div>
                        </div>
                    </div>
                    
                    <div class="mastery-gauge">
                        <div class="gauge-chart">
                            <div class="gauge-fill" style="transform: rotate(${avgMastery * 1.8}deg)"></div>
                            <div class="gauge-center">${avgMastery}%</div>
                        </div>
                    </div>
                    
                    <div class="results-message">
                        ${getResultsMessage(avgMastery)}
                    </div>
                    
                    <div class="modal-actions">
                        <button id="results-continue-btn" class="btn-primary">Fertig</button>
                        <button id="results-restart-btn" class="btn-secondary">Wiederholen</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('show');
        }, 10);
        
        // Close button functionality
        const closeBtn = modal.querySelector('.close-modal');
        closeBtn.addEventListener('click', () => {
            closeModal(modal);
            exitStudyMode();
        });
        
        // Continue button
        const continueBtn = modal.querySelector('#results-continue-btn');
        continueBtn.addEventListener('click', () => {
            closeModal(modal);
            exitStudyMode();
        });
        
        // Restart button
        const restartBtn = modal.querySelector('#results-restart-btn');
        restartBtn.addEventListener('click', () => {
            closeModal(modal);
            startStudySession(currentSetIndex, studyMode);
        });
    }
    
    // Exit study mode
    function exitStudyMode() {
        // Hide study container
        if (studyContainer) {
            studyContainer.style.display = 'none';
        }
        
        // Show flashcard sets container
        if (flashcardSetsContainer) {
            flashcardSetsContainer.style.display = 'grid';
        }
        
        // Reset state
        currentSetIndex = -1;
        currentCardIndex = 0;
        cardsToReview = [];
        
        // Update UI
        updateFlashcardSetsUI();
    }
    
    // Generate flashcards from learning material using AI
    function generateCardsFromMaterial(materialId, title, numCards, difficulty) {
        const materials = JSON.parse(localStorage.getItem('materials')) || [];
        const material = materials.find(m => m.id === materialId);
        
        if (!material) {
            hideLoading();
            showNotification('Fehler', 'Material nicht gefunden', 'error');
            return;
        }
        
        // Prepare the API request
        const requestData = {
            action: 'generateFlashcards',
            material: {
                name: material.name,
                content: material.content.substring(0, 12000) // Limit content size
            },
            numCards: numCards,
            difficulty: difficulty
        };
        
        // Call the API
        fetch('http://localhost:3000/api/ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (!data.success || !data.flashcards) {
                throw new Error('Invalid response format');
            }
            
            // Create the flashcard set with the generated cards
            const newSet = {
                id: generateUniqueId(),
                title: title,
                subject: material.subject || 'Allgemein',
                description: `Automatisch generiert aus "${material.name}"`,
                dateCreated: new Date(),
                lastReviewed: null,
                cards: data.flashcards.map(card => ({
                    id: generateUniqueId(),
                    front: card.front,
                    back: card.back,
                    mastery: 0,
                    lastReviewed: null
                })),
                tags: [material.subject || 'Allgemein', 'AI-generiert']
            };
            
            // Add the new set to our collection
            flashcardSets.push(newSet);
            saveFlashcards();
            updateFlashcardSetsUI();
            
            hideLoading();
            showNotification(
                'Kartenset erstellt', 
                `${newSet.cards.length} Karten wurden erfolgreich generiert`, 
                'success'
            );
        })
        .catch(error => {
            console.error('Error generating flashcards:', error);
            hideLoading();
            
            // Fallback: Create a set with placeholder cards
            createFallbackFlashcardSet(material, title, numCards);
        });
    }
    
    // Create a fallback flashcard set if the AI generation fails
    function createFallbackFlashcardSet(material, title, numCards) {
        // Extract potential flashcard content
        const sentences = material.content.split(/[.!?]/)
            .filter(s => s.trim().length > 20)
            .filter(s => !s.includes('http'));
        
        // Create a basic set with simple cards
        const newSet = {
            id: generateUniqueId(),
            title: title,
            subject: material.subject || 'Allgemein',
            description: `Generiert aus "${material.name}" (Fallback-Modus)`,
            dateCreated: new Date(),
            lastReviewed: null,
            cards: [],
            tags: [material.subject || 'Allgemein', 'Fallback']
        };
        
        // Create some simple cards
        const actualNumCards = Math.min(numCards, sentences.length / 2, 10);
        for (let i = 0; i < actualNumCards; i++) {
            const sentenceIndex = Math.floor(Math.random() * (sentences.length - 1));
            const sentence = sentences[sentenceIndex].trim();
            
            if (sentence.length > 10) {
                const words = sentence.split(' ');
                const pivot = Math.floor(words.length / 2);
                
                const front = words.slice(0, pivot).join(' ') + '...';
                const back = sentence;
                
                newSet.cards.push({
                    id: generateUniqueId(),
                    front: front,
                    back: back,
                    mastery: 0,
                    lastReviewed: null
                });
            }
        }
        
        // Add a note card
        newSet.cards.push({
            id: generateUniqueId(),
            front: 'Hinweis zur Karteikartengenerierung',
            back: 'Diese Karten wurden im Fallback-Modus erstellt. Du kannst diese Karten bearbeiten, um sie zu verbessern.',
            mastery: 0,
            lastReviewed: null
        });
        
        // Add the new set
        flashcardSets.push(newSet);
        saveFlashcards();
        updateFlashcardSetsUI();
        
        showNotification(
            'Fallback-Kartenset erstellt', 
            'Karten wurden im Fallback-Modus erstellt. Bearbeite sie für bessere Qualität.', 
            'warning'
        );
    }
    
    // Confirm delete flashcard set
    function confirmDeleteSet(index) {
        const set = flashcardSets[index];
        
        if (!set) return;
        
        if (confirm(`Möchtest du das Kartenset "${set.title}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
            flashcardSets.splice(index, 1);
            saveFlashcards();
            updateFlashcardSetsUI();
            showNotification('Kartenset gelöscht', 'Das Kartenset wurde erfolgreich gelöscht', 'info');
        }
    }
    
    // Helper function to close a modal
    function closeModal(modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
    
    // Helper function to confirm unsaved changes
    function confirmUnsavedChanges() {
        return confirm('Es gibt ungespeicherte Änderungen. Möchtest du wirklich abbrechen?');
    }
    
    // Helper function to generate unique ID
    function generateUniqueId() {
        return 'fc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    // Helper function to get results message based on mastery
    function getResultsMessage(mastery) {
        if (mastery >= 90) {
            return '<h3>Hervorragend! 🎓</h3><p>Du beherrschst dieses Thema ausgezeichnet. Konzentriere dich nun auf andere Themen.</p>';
        } else if (mastery >= 70) {
            return '<h3>Sehr gut! 👏</h3><p>Du machst großartige Fortschritte. Ein paar weitere Wiederholungen, und du wirst dieses Thema perfekt beherrschen.</p>';
        } else if (mastery >= 50) {
            return '<h3>Guter Fortschritt! 👍</h3><p>Du bist auf dem richtigen Weg. Regelmäßiges Wiederholen wird dein Wissen weiter festigen.</p>';
        } else {
            return '<h3>Ein guter Anfang! 🌱</h3><p>Du hast begonnen, dieses Thema zu lernen. Regelmäßiges Üben wird zu schnellen Fortschritten führen.</p>';
        }
    }
    
    // Show notification (depends on app's notification system)
    function showNotification(title, message, type = 'info') {
        // Try to use the app's notification system if available
        if (window.app && typeof window.app.showNotification === 'function') {
            window.app.showNotification(title, message, type);
            return;
        }
        
        // Simple fallback alert
        alert(`${title}: ${message}`);
    }
    
    // Show loading indicator
    function showLoading(message = 'Lädt...') {
        const loadingEl = document.createElement('div');
        loadingEl.className = 'loading-overlay';
        loadingEl.id = 'flashcard-loading';
        
        loadingEl.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-spin"></i>
                <p>${message}</p>
            </div>
        `;
        
        document.body.appendChild(loadingEl);
    }
    
    // Hide loading indicator
    function hideLoading() {
        const loadingEl = document.getElementById('flashcard-loading');
        if (loadingEl) {
            loadingEl.remove();
        }
    }
    
    // Public API
    return {
        init: init,
        createSet: createFlashcardSet,
        generateFromMaterial: generateCardsFromMaterial,
        startStudy: startStudySession
    };
})();

// Initialize the module when document is ready
document.addEventListener('DOMContentLoaded', function() {
    Flashcards.init();
});