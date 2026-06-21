import ThemeToggle from './ThemeToggle.jsx';

export default function Topbar({ title, meta, controls }) {
  return (
    <header className="topbar">
      <span className="topbar-title">{title}</span>
      <div className="topbar-divider" />
      <span className="topbar-meta">{meta}</span>
      <div className="topbar-right">
        {controls}
        <ThemeToggle />
      </div>
    </header>
  );
}
