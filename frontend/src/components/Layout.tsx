import { useState, useRef, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Calendar, BarChart2, Search as SearchIcon, Users, Settings } from "lucide-react";
import { formatDisplayName } from "../utils/formatName";

export default function Layout({ onLogout }: { onLogout: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{people: any[], meetings: any[]} | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchResults(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchSearch = async () => {
      if (!searchQuery.trim()) {
        setSearchResults(null);
        return;
      }
      try {
        const token = localStorage.getItem("dashboard_token");
        const API_URL = import.meta.env.VITE_API_URL || "/api";
        const res = await fetch(`${API_URL}/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const json = await res.json();
          json.people = json.people.map((p: any) => ({ ...p, displayName: formatDisplayName(p.displayName) }));
          setSearchResults(json);
        }
      } catch (err) {
        console.error(err);
      }
    };
    const timeout = setTimeout(fetchSearch, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const navLinkStyle = (path: string) => ({
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    textDecoration: "none",
    color: location.pathname === path ? "var(--primary-color)" : "var(--text-secondary)",
    fontWeight: location.pathname === path ? 600 : 500,
    borderBottom: location.pathname === path ? "2px solid var(--primary-color)" : "2px solid transparent",
  });

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 20px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "30px 0 20px", borderBottom: "1px solid var(--bg-card-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <h1 style={{ fontSize: "1.5rem", margin: 0, display: "flex", alignItems: "center", gap: 8, color: "var(--text-primary)" }}>
              <Calendar color="var(--primary-color)" size={24} />
              Presence Tracker
            </h1>
          </Link>

          <nav style={{ display: "flex", gap: "16px" }}>
            <Link to="/" style={navLinkStyle("/")}>
              <BarChart2 size={18} /> Dashboard
            </Link>
<Link to="/heatmap" style={navLinkStyle("/heatmap")}>
              <Users size={18} /> Heatmap
            </Link>
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Phase 4 Search Bar */}
          <div ref={searchRef} style={{ position: "relative" }}>
            <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--bg-card-border)", padding: "6px 12px", borderRadius: 6, display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", width: 250 }}>
              <SearchIcon size={16} />
              <input 
                type="text" 
                placeholder="Search people..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ background: "transparent", border: "none", color: "var(--text-primary)", outline: "none", width: "100%", fontSize: "0.875rem" }}
              />
            </div>
            
            {searchResults && searchResults.people.length > 0 && (
              <div className="glass-panel" style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, width: 350, padding: 0, zIndex: 100, border: "1px solid var(--primary-color)" }}>
                {searchResults.people.length > 0 && (
                  <div>
                    <div style={{ padding: "8px 16px", background: "rgba(255,255,255,0.05)", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>People</div>
                    {searchResults.people.map(p => (
                      <div 
                        key={p.email} 
                        onClick={() => { navigate(`/people/${encodeURIComponent(p.email)}`); setSearchResults(null); setSearchQuery(""); }}
                        style={{ padding: "12px 16px", cursor: "pointer", borderBottom: "1px solid var(--bg-card-border)", display: "flex", alignItems: "center", gap: 12 }}
                      >
                        <Users size={16} color="var(--primary-color)" />
                        <div>
                          <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>{p.displayName}</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{p.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <Link
            to="/settings"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: location.pathname === "/settings" ? "var(--primary-color)" : "var(--text-secondary)",
              textDecoration: "none",
              fontSize: "0.875rem",
            }}
            title="Settings"
          >
            <Settings size={16} />
          </Link>

          <button
            onClick={onLogout}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", color: "var(--text-secondary)", fontSize: "0.875rem", border: "none", cursor: "pointer" }}
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </header>
      
      <main style={{ padding: "40px 0" }}>
        <Outlet />
      </main>
    </div>
  );
}
