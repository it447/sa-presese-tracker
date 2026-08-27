import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { AlertTriangle, Users, ArrowLeft } from "lucide-react";
import { formatDisplayName } from "./utils/formatName";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function MultiPersonCompare({ token }: { token: string }) {
  const [searchParams] = useSearchParams();
  const p1Email = searchParams.get("p1");
  const p2Email = searchParams.get("p2");

  const [p1Data, setP1Data] = useState<any>(null);
  const [p2Data, setP2Data] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCompare = async () => {
      if (!p1Email || !p2Email) {
        setError("Please provide two people to compare via URL parameters p1 and p2.");
        setLoading(false);
        return;
      }

      try {
        const API_URL = import.meta.env.VITE_API_URL || "/api";
        const [res1, res2] = await Promise.all([
          fetch(`${API_URL}/people/${encodeURIComponent(p1Email)}/stats`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_URL}/people/${encodeURIComponent(p2Email)}/stats`, { headers: { Authorization: `Bearer ${token}` } })
        ]);

        if (!res1.ok || !res2.ok) throw new Error("Failed to load comparison data.");
        
        const data1 = await res1.json();
        const data2 = await res2.json();
        data1.displayName = formatDisplayName(data1.displayName);
        data2.displayName = formatDisplayName(data2.displayName);
        setP1Data(data1);
        setP2Data(data2);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchCompare();
  }, [p1Email, p2Email, token]);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading comparison...</div>;
  if (error || !p1Data || !p2Data) return (
    <div className="glass-panel" style={{ textAlign: "center", margin: "40px auto", maxWidth: 400 }}>
      <AlertTriangle color="var(--danger)" style={{ marginBottom: 16 }} size={48} />
      <h3>Comparison Error</h3>
      <p style={{ color: "var(--text-secondary)" }}>{error}</p>
      <Link to="/" className="btn-primary" style={{ display: "inline-block", marginTop: 16, textDecoration: "none" }}>Back to Dashboard</Link>
    </div>
  );

  const compareStats = [
    { name: "Late Rate (%)", [p1Data.displayName]: p1Data.lateRate, [p2Data.displayName]: p2Data.lateRate },
    { name: "Avg Mins Late", [p1Data.displayName]: p1Data.avgMinutesLate, [p2Data.displayName]: p2Data.avgMinutesLate },
    { name: "Total Mins Late", [p1Data.displayName]: p1Data.totalMinutesLate, [p2Data.displayName]: p2Data.totalMinutesLate },
    { name: "No Shows", [p1Data.displayName]: p1Data.noShowCount, [p2Data.displayName]: p2Data.noShowCount },
    { name: "Current Streak", [p1Data.displayName]: p1Data.currentStreak, [p2Data.displayName]: p2Data.currentStreak }
  ];

  return (
    <div>
      <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", textDecoration: "none", marginBottom: 24, fontSize: "0.875rem", fontWeight: 500 }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: "2rem", display: "flex", alignItems: "center", gap: 12 }}>
          <Users color="var(--primary-color)" /> Comparison
        </h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
         <div className="glass-panel" style={{ textAlign: "center" }}>
            <h2 style={{ color: "var(--primary-color)" }}>{p1Data.displayName}</h2>
            <div style={{ color: "var(--text-secondary)" }}>{p1Email}</div>
            <Link to={`/people/${encodeURIComponent(p1Email!)}`} style={{ display: "inline-block", marginTop: 16, color: "var(--text-primary)", textDecoration: "underline" }}>View Profile</Link>
         </div>
         <div className="glass-panel" style={{ textAlign: "center" }}>
            <h2 style={{ color: "var(--warning, #ffaa00)" }}>{p2Data.displayName}</h2>
            <div style={{ color: "var(--text-secondary)" }}>{p2Email}</div>
            <Link to={`/people/${encodeURIComponent(p2Email!)}`} style={{ display: "inline-block", marginTop: 16, color: "var(--text-primary)", textDecoration: "underline" }}>View Profile</Link>
         </div>
      </div>

      <div className="glass-panel" style={{ padding: 32 }}>
        <h3 style={{ margin: "0 0 24px 0" }}>Metrics Comparison</h3>
        <div style={{ height: 400, width: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={compareStats} layout="vertical" margin={{ left: 40, right: 20 }}>
              <XAxis type="number" stroke="var(--text-secondary)" tickLine={false} axisLine={false} />
              <YAxis dataKey="name" type="category" stroke="var(--text-secondary)" tickLine={false} axisLine={false} width={120} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--bg-card-border)', borderRadius: 8 }} />
              <Legend verticalAlign="top" height={36} />
              <Bar dataKey={p1Data.displayName} fill="var(--primary-color)" radius={[0, 4, 4, 0]} barSize={20} />
              <Bar dataKey={p2Data.displayName} fill="var(--warning, #ffaa00)" radius={[0, 4, 4, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
