import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getAiStatus } from "../api/client";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/applications", label: "Applications" },
  { to: "/gmail", label: "Gmail" },
  { to: "/resumes", label: "Resumes" },
];

export default function Layout() {
  const [aiOn, setAiOn] = useState(false);

  useEffect(() => {
    getAiStatus()
      .then((s) => setAiOn(s.enabled))
      .catch(() => setAiOn(false));
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <NavLink to="/" className="sidebar__brand" end>
          Huntboard
          <span>Job search command center</span>
        </NavLink>
        <nav className="sidebar__nav" aria-label="Main">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `sidebar__link${isActive ? " sidebar__link--active" : ""}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        {aiOn ? (
          <p style={{ margin: 0, fontSize: "0.75rem", opacity: 0.85, lineHeight: 1.4 }}>
            ✦ AI assist on for imports &amp; Gmail
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: "0.75rem", opacity: 0.65, lineHeight: 1.4 }}>
            Add <code style={{ fontSize: "0.7rem" }}>ANTHROPIC_API_KEY</code> to .env for AI
          </p>
        )}
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
