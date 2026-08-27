import { useState, useEffect } from "react";
import "./index.css";
import Login from "./Login";
import Dashboard from "./Dashboard";

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import PersonDetail from "./PersonDetail";
import ReportExport from "./ReportExport";
import MeetingHeatmap from "./MeetingHeatmap";
import MultiPersonCompare from "./MultiPersonCompare";
import Settings from "./Settings";

function App() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("dashboard_token");
    if (saved) {
      setToken(saved);
    }
  }, []);

  const handleLogin = (password: string) => {
    setToken(password);
    localStorage.setItem("dashboard_token", password);
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem("dashboard_token");
  };

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout onLogout={handleLogout} />}>
          <Route index element={<Dashboard token={token} />} />
<Route path="people/:email" element={<PersonDetail token={token} />} />
          <Route path="heatmap" element={<MeetingHeatmap token={token} />} />
          <Route path="report" element={<ReportExport token={token} />} />
          <Route path="compare" element={<MultiPersonCompare token={token} />} />
          <Route path="settings" element={<Settings token={token} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
