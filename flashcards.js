/**
 * Flashcards Module
 * Implements a spaced repetition flashcard system for effective learning
 * @version 1.2.0
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
    const cardFlipSound = new Audio();
    cardFlipSound.src = 'sounds/card-flip.mp3';
    cardFlipSound.onerror = () => console.warn('Could not load card flip sound');
    
    const correctAnswerSound = new Audio();
    correctAnswerSound.src = 'sounds/correct-answer.mp3';
    correctAnswerSound.onerror = () => console.warn('Could not load correct answer sound');
    
    const wrongAnswerSound = new Audio();
    wrongAnswerSound.src = 'sounds/wrong-answer.mp3';
    wrongAnswerSound.onerror = () => console.warn('Could not load wrong answer sound');
    
    // DOM Elements - use querySelector instead of getElementById for better error tolerance
    const flashcardsPage = document.querySelector('#flashcards');
    const flashcardSetsContainer = document.querySelector('#flashcard-sets-container');
    
    // Initialize the module
    function init() {
        // Load saved flashcard sets
        loadFlashcards();
        
        // Set up event listeners
        const createSetBtn = document.querySelector('#create-flashcard-set');
        const autoGenerateBtn = document.querySelector('#auto-generate-cards');
        
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
    
    // Load flashcards from localStorage with improved error handling
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
                    if (!set.cards) set.cards = []; // Ensure cards array exists
                    
                    set.cards.forEach(card => {
                        if (card.lastReviewed) {
                            card.lastReviewed = new Date(card.lastReviewed);
                        }
                        // Ensure mastery exists
                        if (typeof card.mastery !== 'number') card.mastery = 0;
                    });
                });
            }
        } catch (err) {
            console.error('Error loading flashcards:', err);
            flashcardSets = [];
            // Attempt to recover corrupted data
            try {
                localStorage.removeItem('flashcardSets');
            } catch (e) {
                console.error('Failed to remove corrupted flashcard data', e);
            }
        }
    }
    
    // Rest of the functions remain the same...
    
    // Play sound with proper error handling
    function playSound(soundObj) {
        if (soundObj) {
            soundObj.currentTime = 0;
            soundObj.play().catch(err => console.log('Could not play sound:', err));
        }
    }
    
    // Modified to use the playSound helper
    function flipCard() {
        isCardFlipped = !isCardFlipped;
        
        const cardElement = document.getElementById('current-card');
        if (cardElement) {
            if (isCardFlipped) {
                cardElement.classList.add('flipped');
                
                // Play flip sound with error handling
                playSound(cardFlipSound);
                
                // Show confidence buttons in review mode
                if (studyMode === 'review' && confidenceButtons) {
                    confidenceButtons.style.display = 'block';
                }
                
                // Update card's last reviewed date
                if (currentSetIndex >= 0 && currentCardIndex >= 0) {
                    const card = flashcardSets[currentSetIndex]?.cards.find(
                        c => c.id === cardsToReview[currentCardIndex]?.id
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