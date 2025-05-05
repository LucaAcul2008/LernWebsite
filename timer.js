/**
 * Study Timer Module
 * Implements a Pomodoro timer for focused study sessions
 */

const StudyTimer = (function() {
    // Timer settings and state
    let timerInterval = null;
    let secondsRemaining = 25 * 60; // 25 minutes
    let isBreakTime = false;
    let isPaused = true;
    let totalStudyTime = 0;
    let currentSession = 0;
    let startTime = null;
    let currentTask = '';

    // Timer sounds
    const timerCompleteSound = new Audio('sounds/timer-complete.mp3');
    
    // DOM Elements
    const timerDisplay = document.querySelector('.timer-display');
    const startTimerBtn = document.getElementById('start-timer');
    const pauseTimerBtn = document.getElementById('pause-timer');
    const resetTimerBtn = document.getElementById('reset-timer');
    const pomodoroModeCheckbox = document.getElementById('pomodoro-mode');
    const pomodoroTaskSelect = document.getElementById('pomodoro-task');
    const totalStudyTimeDisplay = document.getElementById('total-study-time');

    // Initialize
    function init() {
        // Set initial display
        updateTimerDisplay();
        
        // Load saved study time
        loadStudyTime();
        
        // Update task dropdown
        updateTaskDropdown();
        
        // Event listeners
        startTimerBtn.addEventListener('click', startTimer);
        pauseTimerBtn.addEventListener('click', pauseTimer);
        resetTimerBtn.addEventListener('click', resetTimer);
        pomodoroModeCheckbox.addEventListener('change', togglePomodoroMode);
        pomodoroTaskSelect.addEventListener('change', selectTask);
    }

    // Update timer display
    function updateTimerDisplay() {
        const minutes = Math.floor(secondsRemaining / 60);
        const seconds = secondsRemaining % 60;
        timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // Update timer color based on state
        if (isBreakTime) {
            timerDisplay.classList.add('break-time');
        } else {
            timerDisplay.classList.remove('break-time');
        }
    }

    // Start the timer
    function startTimer() {
        if (!startTime) {
            startTime = new Date();
        }
        
        isPaused = false;
        startTimerBtn.classList.add('disabled');
        pauseTimerBtn.classList.remove('disabled');
        
        // If there's no task selected, create one
        if (!currentTask && pomodoroTaskSelect.value === '') {
            currentTask = `Study Session ${new Date().toLocaleString()}`;
        } else if (!currentTask) {
            currentTask = pomodoroTaskSelect.value;
        }
        
        timerInterval = setInterval(function() {
            secondsRemaining--;
            
            if (secondsRemaining < 0) {
                clearInterval(timerInterval);
                timerCompleteSound.play();
                
                // Handle Pomodoro cycle
                if (pomodoroModeCheckbox.checked) {
                    if (!isBreakTime) {
                        // Transition to break time
                        isBreakTime = true;
                        secondsRemaining = 5 * 60; // 5 minute break
                        document.title = "Break Time! - Study Companion";
                        notifyUser("Break Time!", "Time for a 5 minute break.");
                    } else {
                        // Transition back to work time
                        isBreakTime = false;
                        secondsRemaining = 25 * 60; // 25 minute work period
                        document.title = "Study Time - Study Companion";
                        notifyUser("Study Time", "Time to get back to work!");
                    }
                    startTimer(); // Continue the cycle
                } else {
                    // Normal timer ended
                    notifyUser("Timer Complete", "Your study session has ended.");
                    document.title = "Study Companion";
                    resetTimer();
                }
            } else {
                updateTimerDisplay();
            }
            
            // Update document title with countdown
            if (!isBreakTime) {
                const minutes = Math.floor(secondsRemaining / 60);
                const seconds = secondsRemaining % 60;
                document.title = `${minutes}:${seconds.toString().padStart(2, '0')} - Study Companion`;
            }
        }, 1000);
    }

    // Pause the timer
    function pauseTimer() {
        isPaused = true;
        clearInterval(timerInterval);
        startTimerBtn.classList.remove('disabled');
        pauseTimerBtn.classList.add('disabled');
        
        // Save study time so far
        if (startTime) {
            const now = new Date();
            const sessionTime = Math.floor((now - startTime) / 1000);
            totalStudyTime += sessionTime;
            saveStudyTime();
            startTime = null;
        }
        
        document.title = "Study Companion";
    }

    // Reset the timer
    function resetTimer() {
        isPaused = true;
        clearInterval(timerInterval);
        
        // Save study time
        if (startTime) {
            const now = new Date();
            const sessionTime = Math.floor((now - startTime) / 1000);
            totalStudyTime += sessionTime;
            saveStudyTime();
            startTime = null;
        }
        
        // Reset to work time
        isBreakTime = false;
        secondsRemaining = 25 * 60;
        currentTask = '';
        
        // Update UI
        updateTimerDisplay();
        startTimerBtn.classList.remove('disabled');
        pauseTimerBtn.classList.add('disabled');
        document.title = "Study Companion";
        
        // Reset task dropdown
        pomodoroTaskSelect.value = '';
    }

    // Toggle Pomodoro mode
    function togglePomodoroMode() {
        resetTimer();
    }

    // Select a task
    function selectTask() {
        currentTask = pomodoroTaskSelect.value;
    }

    // Update task dropdown with materials
    function updateTaskDropdown() {
        // Clear existing options
        while (pomodoroTaskSelect.options.length > 1) {
            pomodoroTaskSelect.remove(1);
        }
        
        // Get materials from app
        try {
            const materials = JSON.parse(localStorage.getItem('materials')) || [];
            materials.forEach(material => {
                const option = document.createElement('option');
                option.value = material.name;
                option.textContent = material.name;
                pomodoroTaskSelect.appendChild(option);
            });
        } catch (err) {
            console.error('Error loading materials for timer dropdown:', err);
        }
    }

    // Save study time to localStorage
    function saveStudyTime() {
        try {
            localStorage.setItem('totalStudyTime', totalStudyTime);
            
            // Save session history
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            
            let studySessions = JSON.parse(localStorage.getItem('studySessions') || '{}');
            if (!studySessions[todayStr]) {
                studySessions[todayStr] = 0;
            }
            
            // Add the current session time
            if (currentSession > 0) {
                studySessions[todayStr] += currentSession;
            }
            
            localStorage.setItem('studySessions', JSON.stringify(studySessions));
            
            // Update display
            updateTotalTimeDisplay();
        } catch (err) {
            console.error('Error saving study time:', err);
        }
    }

    // Load study time from localStorage
    function loadStudyTime() {
        try {
            totalStudyTime = parseInt(localStorage.getItem('totalStudyTime')) || 0;
            updateTotalTimeDisplay();
        } catch (err) {
            console.error('Error loading study time:', err);
            totalStudyTime = 0;
        }
    }

    // Update the total time display
    function updateTotalTimeDisplay() {
        const hours = Math.floor(totalStudyTime / 3600);
        totalStudyTimeDisplay.textContent = `${hours} Std`;
    }

    // Send browser notification
    function notifyUser(title, message) {
        // Check if browser supports notifications
        if (!("Notification" in window)) {
            alert(message);
            return;
        }
        
        // Check notification permission
        if (Notification.permission === "granted") {
            new Notification(title, { 
                body: message,
                icon: 'icons/icon-192.png'
            });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification(title, { 
                        body: message,
                        icon: 'icons/icon-192.png'
                    });
                }
            });
        }
    }

    // Public methods
    return {
        init: init,
        updateTaskDropdown: updateTaskDropdown
    };
})();

// Initialize timer when document is ready
document.addEventListener('DOMContentLoaded', function() {
    StudyTimer.init();
});