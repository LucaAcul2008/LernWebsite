// /**
//  * Study Timer Module
//  * Implements a Pomodoro timer for focused study sessions
//  * Fixed version that prevents multiple intervals and button issues
//  */

// const StudyTimer = (function() {
//     // Timer settings and state
//     let timerInterval = null;
//     let secondsRemaining = 25 * 60; // 25 minutes
//     let isBreakTime = false;
//     let isPaused = true;
//     let totalStudyTime = 0;
//     let currentSession = 0;
//     let startTime = null;
//     let currentTask = '';

//     // Timer sounds
//     const timerCompleteSound = new Audio('sounds/timer-complete.mp3');
    
//     // DOM Elements
//     const timerDisplay = document.querySelector('.timer-display');
//     const startTimerBtn = document.getElementById('start-timer');
//     const pauseTimerBtn = document.getElementById('pause-timer');
//     const resetTimerBtn = document.getElementById('reset-timer');
//     const pomodoroModeCheckbox = document.getElementById('pomodoro-mode');
//     const pomodoroTaskSelect = document.getElementById('pomodoro-task');
//     const totalStudyTimeDisplay = document.getElementById('total-study-time');

//     // Initialize
//     function init() {
//         console.log('Timer initializing...');
        
//         // Set initial display
//         updateTimerDisplay();
        
//         // Load saved study time
//         loadStudyTime();
        
//         // Update task dropdown
//         updateTaskDropdown();
        
//         // Fix initial button states - we use disabled attribute, not class
//         pauseTimerBtn.disabled = true; // Initially disabled
//         startTimerBtn.disabled = false;
//         resetTimerBtn.disabled = false;
        
//         // Remove any disabled classes that might interfere
//         startTimerBtn.classList.remove('disabled');
//         pauseTimerBtn.classList.remove('disabled'); 
//         resetTimerBtn.classList.remove('disabled');
        
//         // Event listeners
//         startTimerBtn.addEventListener('click', startTimer);
//         pauseTimerBtn.addEventListener('click', pauseTimer);
//         resetTimerBtn.addEventListener('click', resetTimer);
//         pomodoroModeCheckbox.addEventListener('change', togglePomodoroMode);
//         pomodoroTaskSelect.addEventListener('change', selectTask);
        
//         console.log('Timer initialized with buttons:', {
//             start: startTimerBtn.disabled ? 'disabled' : 'enabled',
//             pause: pauseTimerBtn.disabled ? 'disabled' : 'enabled',
//             reset: resetTimerBtn.disabled ? 'disabled' : 'enabled'
//         });
//     }

//     // Update timer display
//     function updateTimerDisplay() {
//         const minutes = Math.floor(secondsRemaining / 60);
//         const seconds = secondsRemaining % 60;
//         timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
//         // Update timer color based on state
//         if (isBreakTime) {
//             timerDisplay.classList.add('break-time');
//         } else {
//             timerDisplay.classList.remove('break-time');
//         }
//     }

//     // Start the timer
//     function startTimer() {
//         console.log('Start timer clicked');
        
//         // IMPORTANT: Clear any existing interval to prevent multiple timers
//         if (timerInterval) {
//             console.log('Clearing previous interval');
//             clearInterval(timerInterval);
//             timerInterval = null;
//         }
        
//         if (!startTime) {
//             startTime = new Date();
//         }
        
//         isPaused = false;
        
//         // Update button states using disabled attribute
//         startTimerBtn.disabled = true;
//         pauseTimerBtn.disabled = false;
        
//         // If there's no task selected, create one
//         if (!currentTask && pomodoroTaskSelect.value === '') {
//             currentTask = `Study Session ${new Date().toLocaleString()}`;
//         } else if (!currentTask) {
//             currentTask = pomodoroTaskSelect.value;
//         }
        
//         console.log('Starting new timer interval');
        
//         timerInterval = setInterval(function() {
//             secondsRemaining--;
            
//             if (secondsRemaining < 0) {
//                 console.log('Timer reached zero');
//                 clearInterval(timerInterval);
//                 timerInterval = null;
                
//                 try {
//                     timerCompleteSound.play();
//                 } catch (err) {
//                     console.warn('Could not play sound:', err);
//                 }
                
//                 // Handle Pomodoro cycle
//                 if (pomodoroModeCheckbox && pomodoroModeCheckbox.checked) {
//                     console.log('Pomodoro mode active, toggling state');
                    
//                     if (!isBreakTime) {
//                         // Transition to break time
//                         isBreakTime = true;
//                         secondsRemaining = 5 * 60; // 5 minute break
//                         document.title = "Break Time! - Study Companion";
//                         notifyUser("Break Time!", "Time for a 5 minute break.");
//                     } else {
//                         // Transition back to work time
//                         isBreakTime = false;
//                         secondsRemaining = 25 * 60; // 25 minute work period
//                         document.title = "Study Time - Study Companion";
//                         notifyUser("Study Time", "Time to get back to work!");
//                     }
                    
//                     // Update display before starting again
//                     updateTimerDisplay();
                    
//                     // Continue the cycle - but do NOT create nested intervals
//                     startTimer(); 
//                 } else {
//                     // Normal timer ended
//                     notifyUser("Timer Complete", "Your study session has ended.");
//                     document.title = "Study Companion";
//                     resetTimer();
//                 }
//             } else {
//                 updateTimerDisplay();
                
//                 // Update document title with countdown
//                 if (!isBreakTime) {
//                     const minutes = Math.floor(secondsRemaining / 60);
//                     const seconds = secondsRemaining % 60;
//                     document.title = `${minutes}:${seconds.toString().padStart(2, '0')} - Study Companion`;
//                 }
//             }
//         }, 1000);
        
//         console.log('Timer started with interval ID:', timerInterval);
//     }

//     // Pause the timer
//     function pauseTimer() {
//         console.log('Pause timer clicked');
        
//         isPaused = true;
        
//         if (timerInterval) {
//             clearInterval(timerInterval);
//             timerInterval = null;
//             console.log('Timer paused');
//         } else {
//             console.log('No active timer to pause');
//         }
        
//         // Update button states using disabled attribute
//         startTimerBtn.disabled = false;
//         pauseTimerBtn.disabled = true;
        
//         // Save study time so far
//         if (startTime) {
//             const now = new Date();
//             const sessionTime = Math.floor((now - startTime) / 1000);
//             totalStudyTime += sessionTime;
//             currentSession = sessionTime;
//             saveStudyTime();
//             startTime = null;
//         }
        
//         document.title = "Study Companion";
//     }

//     // Reset the timer
//     function resetTimer() {
//         console.log('Reset timer clicked');
        
//         isPaused = true;
        
//         // Make sure any interval is cleared
//         if (timerInterval) {
//             clearInterval(timerInterval);
//             timerInterval = null;
//             console.log('Timer cleared during reset');
//         }
        
//         // Save study time
//         if (startTime) {
//             const now = new Date();
//             const sessionTime = Math.floor((now - startTime) / 1000);
//             totalStudyTime += sessionTime;
//             currentSession = sessionTime;
//             saveStudyTime();
//             startTime = null;
//         }
        
//         // Reset to work time
//         isBreakTime = false;
//         secondsRemaining = 25 * 60;
//         currentTask = '';
        
//         // Update UI
//         updateTimerDisplay();
        
//         // Update button states using disabled attribute
//         startTimerBtn.disabled = false;
//         pauseTimerBtn.disabled = true;
        
//         document.title = "Study Companion";
        
//         // Reset task dropdown
//         if (pomodoroTaskSelect) {
//             pomodoroTaskSelect.value = '';
//         }
        
//         console.log('Timer reset complete');
//     }

//     // Toggle Pomodoro mode
//     function togglePomodoroMode() {
//         resetTimer();
//     }

//     // Select a task
//     function selectTask() {
//         currentTask = pomodoroTaskSelect.value;
//         console.log('Selected task:', currentTask);
//     }

//     // Other functions remain the same...
//     function updateTaskDropdown() {
//         // Clear existing options
//         if (!pomodoroTaskSelect) return;
        
//         while (pomodoroTaskSelect.options.length > 1) {
//             pomodoroTaskSelect.remove(1);
//         }
        
//         // Get materials from app
//         try {
//             const materials = JSON.parse(localStorage.getItem('materials')) || [];
//             materials.forEach(material => {
//                 const option = document.createElement('option');
//                 option.value = material.name;
//                 option.textContent = material.name;
//                 pomodoroTaskSelect.appendChild(option);
//             });
//         } catch (err) {
//             console.error('Error loading materials for timer dropdown:', err);
//         }
//     }

//     function saveStudyTime() {
//         try {
//             localStorage.setItem('totalStudyTime', totalStudyTime);
            
//             // Save session history
//             const now = new Date();
//             const todayStr = now.toISOString().split('T')[0];
            
//             let studySessions = JSON.parse(localStorage.getItem('studySessions') || '{}');
//             if (!studySessions[todayStr]) {
//                 studySessions[todayStr] = 0;
//             }
            
//             // Add the current session time
//             if (currentSession > 0) {
//                 studySessions[todayStr] += currentSession;
//                 currentSession = 0; // Reset for next session
//             }
            
//             localStorage.setItem('studySessions', JSON.stringify(studySessions));
            
//             // Update display
//             updateTotalTimeDisplay();
//         } catch (err) {
//             console.error('Error saving study time:', err);
//         }
//     }

//     function loadStudyTime() {
//         try {
//             totalStudyTime = parseInt(localStorage.getItem('totalStudyTime')) || 0;
//             updateTotalTimeDisplay();
//         } catch (err) {
//             console.error('Error loading study time:', err);
//             totalStudyTime = 0;
//         }
//     }

//     function updateTotalTimeDisplay() {
//         if (!totalStudyTimeDisplay) return;
//         const hours = Math.floor(totalStudyTime / 3600);
//         totalStudyTimeDisplay.textContent = `${hours} Std`;
//     }

//     function notifyUser(title, message) {
//         // Check if browser supports notifications
//         if (!("Notification" in window)) {
//             alert(message);
//             return;
//         }
        
//         // Check notification permission
//         if (Notification.permission === "granted") {
//             new Notification(title, { 
//                 body: message,
//                 icon: 'icons/icon-192.png'
//             });
//         } else if (Notification.permission !== "denied") {
//             Notification.requestPermission().then(permission => {
//                 if (permission === "granted") {
//                     new Notification(title, { 
//                         body: message,
//                         icon: 'icons/icon-192.png'
//                     });
//                 }
//             });
//         }
//     }

//     // Public methods
//     return {
//         init: init,
//         updateTaskDropdown: updateTaskDropdown
//     };
// })();

// // Initialize timer when document is ready
// document.addEventListener('DOMContentLoaded', function() {
//     // Make sure the buttons don't have the class "disabled"
//     const buttons = document.querySelectorAll('.timer-controls button');
//     buttons.forEach(button => button.classList.remove('disabled'));
    
//     StudyTimer.init();
// });

const Timer = (function() {
    // Private variables
    let timerInterval = null;
    let secondsRemaining = 25 * 60;
    let isBreakTime = false;
    let startTime = null;
    let isPaused = true;
    
    // Cache DOM elements
    const timerDisplay = document.querySelector('.timer-display');
    const startBtn = document.getElementById('start-timer');
    const pauseBtn = document.getElementById('pause-timer');
    const resetBtn = document.getElementById('reset-timer');
    const pomodoroCheck = document.getElementById('pomodoro-mode');
    
    // Initialize
    function init() {
        if (!timerDisplay || !startBtn || !pauseBtn || !resetBtn) {
            console.error('Timer elements not found!');
            return;
        }
        
        // Set initial state
        updateDisplay();
        
        // Set initial button states
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        resetBtn.disabled = false;
        
        // Remove any disabled classes
        startBtn.classList.remove('disabled');
        pauseBtn.classList.remove('disabled');
        resetBtn.classList.remove('disabled');
        
        // Add event listeners
        startBtn.addEventListener('click', start);
        pauseBtn.addEventListener('click', pause);
        resetBtn.addEventListener('click', reset);
        
        console.log('Timer initialized');
    }
    
    // Update display
    function updateDisplay() {
        const minutes = Math.floor(secondsRemaining / 60);
        const seconds = secondsRemaining % 60;
        timerDisplay.textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            
        // Update page title
        document.title = isPaused ? 
            "Study Timer" : 
            `${minutes}:${seconds.toString().padStart(2, '0')} - Study Timer`;
    }
    
    // Start timer
    function start() {
        console.log('Starting timer');
        
        // Prevent multiple intervals
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        isPaused = false;
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        
        if (!startTime) {
            startTime = new Date();
        }
        
        timerInterval = setInterval(() => {
            if (secondsRemaining > 0) {
                secondsRemaining--;
                updateDisplay();
            } else {
                handleTimerComplete();
            }
        }, 1000);
    }
    
    // Pause timer
    function pause() {
        console.log('Pausing timer');
        
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        isPaused = true;
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        
        updateDisplay();
    }
    
    // Reset timer
    function reset() {
        console.log('Resetting timer');
        
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        isPaused = true;
        secondsRemaining = 25 * 60;
        isBreakTime = false;
        startTime = null;
        
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        
        updateDisplay();
    }
    
    // Handle timer completion
    function handleTimerComplete() {
        clearInterval(timerInterval);
        timerInterval = null;
        
        if (pomodoroCheck && pomodoroCheck.checked) {
            isBreakTime = !isBreakTime;
            secondsRemaining = isBreakTime ? 5 * 60 : 25 * 60;
            
            // Notify user
            const message = isBreakTime ? 
                "Time for a break!" : 
                "Break's over - back to work!";
            alert(message);
            
            start(); // Restart timer for next phase
        } else {
            alert("Timer complete!");
            reset();
        }
    }
    
    // Public API
    return {
        init: init
    };
})();

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing timer...');
    Timer.init();
});