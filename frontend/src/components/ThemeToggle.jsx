import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem('theme') || 'dark'
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  }, [theme]);

  return (
    <button
      className="theme-toggle"
      onClick={() => setTheme(t => {
        if (t === 'dark') return 'light';
        if (t === 'light') return 'ops-black';
        return 'dark';
      })}
      aria-label="Toggle theme"
      title={`Active Theme: ${theme.toUpperCase()}`}
    >
      <i className={`ti ${theme === 'dark' ? 'ti-moon' : theme === 'light' ? 'ti-sun' : 'ti-contrast'}`} />
    </button>
  );
}
