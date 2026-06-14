import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ApplicationDetail from "./pages/ApplicationDetail";
import ApplicationsList from "./pages/ApplicationsList";
import GmailPanel from "./pages/GmailPanel";
import AnalyticsPage from "./pages/AnalyticsPage";
import HomePage from "./pages/HomePage";
import ResumesPage from "./pages/ResumesPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/applications" element={<ApplicationsList />} />
        <Route path="/applications/new" element={<ApplicationDetail />} />
        <Route path="/applications/:id" element={<ApplicationDetail />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/gmail" element={<GmailPanel />} />
        <Route path="/resumes" element={<ResumesPage />} />
      </Route>
    </Routes>
  );
}
