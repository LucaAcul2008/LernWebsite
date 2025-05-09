document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('theme-toggle');
  const body = document.body;
  const moonIconClass = 'fa-moon'; // Klasse für das Mond-Icon
  const sunIconClass = 'fa-sun';   // Klasse für das Sonnen-Icon

  if (!themeToggleBtn) {
      console.error("Theme toggle button nicht gefunden!");
      return;
  }

  // Funktion zum Anwenden des Themes und Aktualisieren des Icons
  const applyTheme = (theme) => {
      if (theme === 'dark') {
          body.classList.add('dark-mode');
          themeToggleBtn.setAttribute('aria-label', 'Light mode aktivieren');
          // Icon ändern: fa-moon zu fa-sun
          const icon = themeToggleBtn.querySelector('i');
          if (icon) {
              icon.classList.remove(moonIconClass);
              icon.classList.add(sunIconClass);
          }
      } else {
          body.classList.remove('dark-mode');
          themeToggleBtn.setAttribute('aria-label', 'Dark mode aktivieren');
          // Icon ändern: fa-sun zu fa-moon
          const icon = themeToggleBtn.querySelector('i');
          if (icon) {
              icon.classList.remove(sunIconClass);
              icon.classList.add(moonIconClass);
          }
      }
  };

  // Event Listener für den Button
  themeToggleBtn.addEventListener('click', () => {
      const isDarkMode = body.classList.contains('dark-mode');
      if (isDarkMode) {
          applyTheme('light');
          localStorage.setItem('theme', 'light');
      } else {
          applyTheme('dark');
          localStorage.setItem('theme', 'dark');
      }
  });

  // Gespeichertes Theme beim Laden der Seite anwenden oder Systemeinstellung prüfen
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme) {
      applyTheme(savedTheme);
  } else if (prefersDark) {
      applyTheme('dark');
      // Optional: Systemeinstellung im localStorage speichern, wenn kein Theme explizit gewählt wurde
      // localStorage.setItem('theme', 'dark');
  } else {
      applyTheme('light'); // Standard ist Light Mode, falls nichts anderes gesetzt
  }

  // Auf Änderungen der Systemeinstellung hören (optional, aber gut für UX)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      // Nur anwenden, wenn der Benutzer nicht explizit ein Theme gewählt hat
      if (!localStorage.getItem('theme')) {
          applyTheme(e.matches ? 'dark' : 'light');
      }
  });
});