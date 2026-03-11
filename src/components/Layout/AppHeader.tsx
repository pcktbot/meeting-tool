import { useNavigate, useLocation } from "react-router-dom";
import "./AppHeader.css";

const NAV_ITEMS = [
  { path: "/", label: "New Meeting" },
  { path: "/highlights", label: "Highlights" },
  { path: "/contributions", label: "Contributions" },
] as const;

export function AppHeader() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/" || location.pathname.startsWith("/meeting/");
    }
    return location.pathname === path;
  };

  return (
    <header className="app-header">
      <span className="app-header-title">Meeting Tool</span>
      <nav className="app-header-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            className={`app-header-link ${isActive(item.path) ? "app-header-link--active" : ""}`}
            onClick={() => navigate(item.path)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <button
        className="app-header-settings"
        onClick={() => navigate("/settings")}
        title="Settings"
      >
        &#9881;
      </button>
    </header>
  );
}
