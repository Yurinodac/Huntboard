import { Link, Route, Routes } from "react-router-dom";

function HomePage() {
  return <h1>Job tracker</h1>;
}

function ApplicationsPage() {
  return <h1>Applications</h1>;
}

function GmailPage() {
  return <h1>Gmail</h1>;
}

export default function App() {
  return (
    <>
      <nav>
        <Link to="/">Home</Link> | <Link to="/applications">Applications</Link> |{" "}
        <Link to="/gmail">Gmail</Link>
      </nav>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/gmail" element={<GmailPage />} />
      </Routes>
    </>
  );
}
