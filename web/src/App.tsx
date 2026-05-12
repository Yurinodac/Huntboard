import { Link, Route, Routes } from "react-router-dom";
import ApplicationDetail from "./pages/ApplicationDetail";
import ApplicationsList from "./pages/ApplicationsList";

function HomePage() {
  return <h1>Job tracker</h1>;
}

function GmailPage() {
  return <h1>Gmail</h1>;
}

export default function App() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: 1.4 }}>
      <nav
        aria-label="Main navigation"
        style={{ borderBottom: "1px solid #ddd", padding: "12px 16px", marginBottom: 8 }}
      >
        <Link to="/">Home</Link> | <Link to="/applications">Applications</Link> |{" "}
        <Link to="/gmail">Gmail</Link>
      </nav>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/applications" element={<ApplicationsList />} />
        <Route path="/applications/new" element={<ApplicationDetail />} />
        <Route path="/applications/:id" element={<ApplicationDetail />} />
        <Route path="/gmail" element={<GmailPage />} />
      </Routes>
    </div>
  );
}
