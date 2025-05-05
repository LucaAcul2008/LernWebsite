/**
 * Theme Toggle Module
 * Handles switching between light and dark themes
 */
(function() {
    // Execute when DOM is fully loaded
    document.addEventListener('DOMContentLoaded', function() {
      console.log('Theme toggle initializing');
      
      // Get the toggle button
      const themeToggle = document.getElementById('theme-toggle');
      
      if (!themeToggle) {
        console.error('Theme toggle button not found in DOM');
        return;
      }
      
      // Set up icons
      const moonIcon = '<i class="fas fa-moon"></i>';
      const sunIcon = '<i class="fas fa-sun"></i>';
      
      // Apply saved theme or use system preference
      function applyTheme() {
        const savedTheme = localStorage.getItem('theme');
        
        if (savedTheme === 'dark') {
          document.body.classList.add('dark-mode');
          themeToggle.innerHTML = sunIcon;
          console.log('Applied dark theme from saved preference');
        } else if (savedTheme === 'light') {
          document.body.classList.remove('dark-mode');
          themeToggle.innerHTML = moonIcon;
          console.log('Applied light theme from saved preference');
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.body.classList.add('dark-mode');
          themeToggle.innerHTML = sunIcon;
          console.log('Applied dark theme from system preference');
        }
      }
      
      // Toggle between themes
      function toggleTheme() {
        if (document.body.classList.contains('dark-mode')) {
          // Switch to light mode
          document.body.classList.remove('dark-mode');
          localStorage.setItem('theme', 'light');
          themeToggle.innerHTML = moonIcon;
          console.log('Switched to light theme');
        } else {
          // Switch to dark mode
          document.body.classList.add('dark-mode');
          localStorage.setItem('theme', 'dark');
          themeToggle.innerHTML = sunIcon;
          console.log('Switched to dark theme');
        }
      }
      
      // Add click event
      themeToggle.addEventListener('click', toggleTheme);
      
      // Apply theme immediately
      applyTheme();
      
      // Listen for system preference changes
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
      }
    });
  })();