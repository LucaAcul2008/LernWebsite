/**
 * Audio Recorder Module
 * Enables recording and attaching audio notes to materials
 */

const AudioRecorder = (function() {
    // Recording state
    let mediaRecorder = null;
    let audioChunks = [];
    let recording = false;
    let duration = 0;
    let timerInterval = null;
    let currentMaterialId = null;
    let audioNotes = {};
    
    // DOM Elements
    let recordingsList = null;
    let recordTimer = null;
    
    /**
     * Initialize the audio recorder module
     */
    function init() {
        console.log('Initializing audio recorder module');
        
        // Load existing audio notes from localStorage
        loadAudioNotes();
        
        // Set up event listeners
        setupEventListeners();
    }
    
    /**
     * Set up event listeners for the audio recorder
     */
    function setupEventListeners() {
        // Find recorder button in materials view
        document.addEventListener('click', function(e) {
            if (e.target && e.target.id === 'record-audio-note' || 
                e.target.closest('#record-audio-note')) {
                // Get current material ID from app if available
                if (window.app && window.app.currentMaterial) {
                    currentMaterialId = window.app.currentMaterial.id;
                    showRecorderModal();
                } else {
                    console.warn('No material selected for recording');
                    if (window.app && window.app.showNotification) {
                        window.app.showNotification('Warning', 'Bitte wähle zuerst ein Material aus', 'warning');
                    } else {
                        alert('Bitte wähle zuerst ein Material aus');
                    }
                }
            }
        });
        
        // Audio recorder modal events
        document.addEventListener('click', function(e) {
            // Check if the recorder modal exists
            const modal = document.getElementById('audio-recorder-modal');
            if (!modal) return;
            
            // Start recording
            if (e.target && e.target.id === 'start-recording') {
                startRecording();
            }
            
            // Stop recording
            if (e.target && e.target.id === 'stop-recording') {
                stopRecording();
            }
            
            // Close modal (click on close button or outside)
            if (e.target.classList.contains('close-modal') || 
                (e.target === modal && !e.target.closest('.modal-content'))) {
                closeRecorderModal();
            }
            
            // Delete recording
            if (e.target.classList.contains('delete-recording') || 
                e.target.closest('.delete-recording')) {
                const recordingId = e.target.closest('.recording-item').dataset.id;
                deleteRecording(recordingId);
            }
            
            // Play recording
            if (e.target.classList.contains('play-recording') || 
                e.target.closest('.play-recording')) {
                const recordingId = e.target.closest('.recording-item').dataset.id;
                playRecording(recordingId);
            }
        });
    }
    
    /**
     * Show audio recorder modal
     */
    function showRecorderModal() {
        // Get or create modal
        let modal = document.getElementById('audio-recorder-modal');
        
        if (!modal) {
            console.warn('Audio recorder modal not found, creating one');
            modal = document.createElement('div');
            modal.id = 'audio-recorder-modal';
            modal.className = 'modal';
            
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>Audio Notiz aufnehmen</h2>
                        <button class="close-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="audio-recorder-interface">
                            <div class="record-timer">00:00</div>
                            <div class="record-controls">
                                <button id="start-recording" class="btn-primary"><i class="fas fa-microphone"></i> Aufnehmen</button>
                                <button id="stop-recording" class="btn-danger" disabled><i class="fas fa-stop"></i> Stoppen</button>
                            </div>
                            <div id="recordings-list" class="recordings-list"></div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
        }
        
        // Show modal
        modal.classList.add('active');
        
        // Set up DOM references
        recordingsList = document.getElementById('recordings-list');
        recordTimer = modal.querySelector('.record-timer');
        
        // Update recordings list for current material
        updateRecordingsList();
    }
    
    /**
     * Close audio recorder modal
     */
    function closeRecorderModal() {
        const modal = document.getElementById('audio-recorder-modal');
        if (modal) {
            // Stop recording if active
            if (recording) {
                stopRecording();
            }
            
            // Hide modal
            modal.classList.remove('active');
        }
    }
    
    /**
     * Start audio recording
     */
    function startRecording() {
        if (recording) return;
        
        // Request microphone access
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                // Initialize recorder
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                
                // Set up event handlers
                mediaRecorder.ondataavailable = e => {
                    audioChunks.push(e.data);
                };
                
                mediaRecorder.onstop = saveRecording;
                
                // Start recording
                mediaRecorder.start();
                recording = true;
                
                // Update UI
                document.getElementById('start-recording').disabled = true;
                document.getElementById('stop-recording').disabled = false;
                
                // Start timer
                duration = 0;
                updateTimer();
                timerInterval = setInterval(updateTimer, 1000);
                
                console.log('Recording started');
            })
            .catch(error => {
                console.error('Error accessing microphone:', error);
                
                // Show notification
                if (window.app && window.app.showNotification) {
                    window.app.showNotification('Error', 'Mikrofon konnte nicht aktiviert werden', 'error');
                } else {
                    alert('Mikrofon konnte nicht aktiviert werden');
                }
            });
    }
    
    /**
     * Stop audio recording
     */
    function stopRecording() {
        if (!recording || !mediaRecorder) return;
        
        // Stop MediaRecorder
        mediaRecorder.stop();
        recording = false;
        
        // Stop all audio tracks to release microphone
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        // Clear timer
        clearInterval(timerInterval);
        
        // Update UI
        document.getElementById('start-recording').disabled = false;
        document.getElementById('stop-recording').disabled = true;
        
        console.log('Recording stopped');
    }
    
    /**
     * Save the recorded audio
     */
    function saveRecording() {
        if (audioChunks.length === 0) return;
        
        // Create recording object
        const recordingId = `rec_${Date.now()}`;
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        
        // Convert to base64 for storage
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = function() {
            const base64data = reader.result;
            
            // Initialize material's audio notes array if needed
            if (!audioNotes[currentMaterialId]) {
                audioNotes[currentMaterialId] = [];
            }
            
            // Add new recording
            const newRecording = {
                id: recordingId,
                timestamp: new Date().toISOString(),
                duration: duration,
                audioData: base64data
            };
            
            audioNotes[currentMaterialId].push(newRecording);
            
            // Save to localStorage
            saveAudioNotes();
            
            // Update recordings list
            updateRecordingsList();
            
            // Show notification
            if (window.app && window.app.showNotification) {
                window.app.showNotification('Success', 'Audio Notiz gespeichert', 'success');
            }
        };
    }
    
    /**
     * Update the recordings list for the current material
     */
    function updateRecordingsList() {
        if (!recordingsList || !currentMaterialId) return;
        
        // Clear existing list
        recordingsList.innerHTML = '';
        
        // Get recordings for current material
        const materialRecordings = audioNotes[currentMaterialId] || [];
        
        if (materialRecordings.length === 0) {
            recordingsList.innerHTML = '<p class="empty-recordings">Keine Aufnahmen vorhanden</p>';
            return;
        }
        
        // Add recordings to list
        materialRecordings.forEach(recording => {
            const date = new Date(recording.timestamp);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            
            const recordingItem = document.createElement('div');
            recordingItem.className = 'recording-item';
            recordingItem.dataset.id = recording.id;
            
            const minutes = Math.floor(recording.duration / 60).toString().padStart(2, '0');
            const seconds = (recording.duration % 60).toString().padStart(2, '0');
            
            recordingItem.innerHTML = `
                <div class="recording-info">
                    <span class="recording-date">${formattedDate}</span>
                    <span class="recording-duration">${minutes}:${seconds}</span>
                </div>
                <div class="recording-actions">
                    <button class="play-recording" title="Abspielen">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="delete-recording" title="Löschen">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            recordingsList.appendChild(recordingItem);
        });
    }
    
    /**
     * Play a recording
     * @param {string} recordingId - ID of the recording to play
     */
    function playRecording(recordingId) {
        if (!currentMaterialId) return;
        
        // Find recording
        const materialRecordings = audioNotes[currentMaterialId] || [];
        const recording = materialRecordings.find(r => r.id === recordingId);
        
        if (!recording) return;
        
        // Create audio element and play
        const audio = new Audio(recording.audioData);
        audio.play();
    }
    
    /**
     * Delete a recording
     * @param {string} recordingId - ID of the recording to delete
     */
    function deleteRecording(recordingId) {
        if (!currentMaterialId || !audioNotes[currentMaterialId]) return;
        
        // Remove recording
        audioNotes[currentMaterialId] = audioNotes[currentMaterialId].filter(
            r => r.id !== recordingId
        );
        
        // Save changes
        saveAudioNotes();
        
        // Update UI
        updateRecordingsList();
        
        // Show notification
        if (window.app && window.app.showNotification) {
            window.app.showNotification('Info', 'Audio Notiz gelöscht', 'info');
        }
    }
    
    /**
     * Update the recording timer display
     */
    function updateTimer() {
        if (!recordTimer) return;
        
        duration++;
        const minutes = Math.floor(duration / 60).toString().padStart(2, '0');
        const seconds = (duration % 60).toString().padStart(2, '0');
        recordTimer.textContent = `${minutes}:${seconds}`;
    }
    
    /**
     * Save audio notes to localStorage
     */
    function saveAudioNotes() {
        try {
            // Create a copy without the actual audio data for localStorage check
            const notesMetadata = {};
            
            for (const materialId in audioNotes) {
                notesMetadata[materialId] = audioNotes[materialId].map(note => ({
                    id: note.id,
                    timestamp: note.timestamp,
                    duration: note.duration
                }));
            }
            
            // Check size (localStorage limit)
            const metadataSize = JSON.stringify(notesMetadata).length;
            const fullSize = JSON.stringify(audioNotes).length;
            
            if (fullSize > 4900000) { // Close to 5MB limit
                console.warn(`Audio notes storage is getting large: ${Math.round(fullSize/1024/1024)}MB`);
                
                // Try saving anyway
                localStorage.setItem('audio-notes', JSON.stringify(audioNotes));
                
                // Show warning
                if (window.app && window.app.showNotification) {
                    window.app.showNotification(
                        'Warning', 
                        'Audio-Notizen verbrauchen viel Speicherplatz. Ältere Notizen werden bald automatisch entfernt.', 
                        'warning'
                    );
                }
            } else {
                localStorage.setItem('audio-notes', JSON.stringify(audioNotes));
            }
        } catch (e) {
            console.error('Error saving audio notes:', e);
            
            if (e.name === 'QuotaExceededError') {
                // Delete oldest recordings to free space
                pruneOldRecordings();
                
                // Try saving again
                try {
                    localStorage.setItem('audio-notes', JSON.stringify(audioNotes));
                } catch (e2) {
                    console.error('Failed to save audio notes even after pruning:', e2);
                }
            }
        }
    }
    
    /**
     * Load audio notes from localStorage
     */
    function loadAudioNotes() {
        try {
            const saved = localStorage.getItem('audio-notes');
            if (saved) {
                audioNotes = JSON.parse(saved);
            }
        } catch (e) {
            console.error('Error loading audio notes:', e);
            audioNotes = {};
        }
    }
    
    /**
     * Delete oldest recordings to free up storage space
     */
    function pruneOldRecordings() {
        console.log('Pruning old audio recordings to save space');
        
        // Flatten all recordings into a single array with material ID
        const allRecordings = [];
        
        for (const materialId in audioNotes) {
            audioNotes[materialId].forEach(recording => {
                allRecordings.push({
                    materialId,
                    recording
                });
            });
        }
        
        // Sort by timestamp (oldest first)
        allRecordings.sort((a, b) => 
            new Date(a.recording.timestamp) - new Date(b.recording.timestamp)
        );
        
        // Delete oldest 30% of recordings
        const deleteCount = Math.ceil(allRecordings.length * 0.3);
        
        for (let i = 0; i < deleteCount; i++) {
            if (i < allRecordings.length) {
                const item = allRecordings[i];
                audioNotes[item.materialId] = audioNotes[item.materialId].filter(
                    r => r.id !== item.recording.id
                );
            }
        }
        
        // Show notification
        if (window.app && window.app.showNotification) {
            window.app.showNotification(
                'Info', 
                `${deleteCount} ältere Audio-Notizen wurden gelöscht, um Speicherplatz freizugeben`, 
                'info'
            );
        }
    }
    
    /**
     * Get audio notes for a specific material
     * @param {string} materialId - Material ID
     * @returns {Array} - Audio notes for the material
     */
    function getAudioNotesForMaterial(materialId) {
        return audioNotes[materialId] || [];
    }
    
    // Return public API
    return {
        init: init,
        getAudioNotesForMaterial: getAudioNotesForMaterial
    };
})();

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize with a delay to ensure other modules are loaded
    setTimeout(function() {
        AudioRecorder.init();
    }, 500);
});