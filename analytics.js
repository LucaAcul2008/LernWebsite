/**
 * Analytics Module for Study Companion
 * Visualizes study progress and stats
 */

const Analytics = (function() {
    // Chart references
    let studyTimeChart = null;
    let quizPerformanceChart = null;
    let materialProgressChart = null;
    
    // Initialize analytics
    function init() {
        console.log('Initializing analytics module');
        
        // Get data for charts
        loadData();
        
        // Render charts if analytics page is active
        if (document.querySelector('#analytics.page.active')) {
            renderCharts();
        }
        
        // Add page change listener
        document.querySelectorAll('.nav-links li').forEach(navItem => {
            navItem.addEventListener('click', () => {
                if (navItem.getAttribute('data-page') === 'analytics') {
                    // Small delay to ensure DOM is ready
                    setTimeout(renderCharts, 100);
                }
            });
        });
    }
    
    // Load analytics data
    function loadData() {
        // Will be implemented to gather data from various modules
        console.log('Analytics data loaded');
    }
    
    // Render all charts
    function renderCharts() {
        renderStudyTimeChart();
        renderQuizPerformanceChart();
        renderMaterialProgressChart();
    }
    
    // Study time chart (placeholder implementation)
    function renderStudyTimeChart() {
        const ctx = document.getElementById('study-time-chart');
        if (!ctx) return;
        
        // Clear existing chart
        if (studyTimeChart) studyTimeChart.destroy();
        
        // Create chart with placeholder data
        studyTimeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
                datasets: [{
                    label: 'Studienminuten',
                    data: [30, 45, 60, 120, 30, 90, 45],
                    backgroundColor: '#4361ee'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Minuten'
                        }
                    }
                }
            }
        });
    }
    
    // Quiz performance chart (placeholder implementation)
    function renderQuizPerformanceChart() {
        const ctx = document.getElementById('quiz-performance-chart');
        if (!ctx) return;
        
        // Clear existing chart
        if (quizPerformanceChart) quizPerformanceChart.destroy();
        
        // Create chart with placeholder data
        quizPerformanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Quiz 1', 'Quiz 2', 'Quiz 3', 'Quiz 4', 'Quiz 5'],
                datasets: [{
                    label: 'Punktzahl (%)',
                    data: [65, 70, 75, 80, 85],
                    borderColor: '#4cc9f0',
                    tension: 0.3,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Punktzahl (%)'
                        }
                    }
                }
            }
        });
    }
    
    // Material progress chart (placeholder implementation)
    function renderMaterialProgressChart() {
        const ctx = document.getElementById('material-progress-chart');
        if (!ctx) return;
        
        // Clear existing chart
        if (materialProgressChart) materialProgressChart.destroy();
        
        // Create chart with placeholder data
        materialProgressChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Abgeschlossen', 'In Bearbeitung', 'Unbearbeitet'],
                datasets: [{
                    data: [3, 2, 5],
                    backgroundColor: ['#4cc9f0', '#4361ee', '#e5e5e5']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
    
    // Return public API
    return {
        init: init
    };
})();

// Initialize analytics when document is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize with a delay to ensure other modules are loaded
    setTimeout(function() {
        Analytics.init();
    }, 500);
});