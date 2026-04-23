import { useNavigate, useLocation } from "react-router-dom";
import "./AppHeader.css";

const NAV_ITEMS = [
  { path: "/", label: "Diary", icon: "✎" },
  { path: "/highlights", label: "Highlights", icon: "⌘" },
  { path: "/summaries", label: "Summaries", icon: "▤" },
] as const;

export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const handleRefresh = () => {
    globalThis.dispatchEvent(new CustomEvent("app-refresh"));
  };

  const isActive = (path: string) => {
    return path === "/"
      ? location.pathname === "/" || location.pathname === "/contributions"
      : location.pathname === path;
  };

  return (
    <header className="app-header">
      <span className="app-header-title">Daily Work Diary</span>
      <nav className="app-header-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            className={`app-header-link ${isActive(item.path) ? "app-header-link--active" : ""}`}
            onClick={() => navigate(item.path)}
          >
            <span className="app-header-link-icon" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="app-header-actions">
        <button
          className="app-header-action"
          onClick={handleRefresh}
          title="Refresh"
        >
          Refresh
        </button>
        <button
          className="app-header-action app-header-settings"
          onClick={() => navigate("/settings")}
          title="Settings"
        >
          &#9881;
        </button>
      </div>
    </header>
  );
}
