import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { AlertTriangle, Printer, ArrowLeft } from "lucide-react";
import { formatDisplayName } from "./utils/formatName";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";

export default function ReportExport({ token }: { token: string }) {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("person");
  // The backend doesn't support since/until for /people/:email/stats yet, 
  // but we can filter the returned `meetings` on the UI since they are returned.
  const sinceStr = searchParams.get("since");
  const untilStr = searchParams.get("until");

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPerson = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "/api";
        const res = await fetch(`${API_URL}/people/${encodeURIComponent(email || "")}/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Failed to load report data.");
        const json = await res.json();
        json.displayName = formatDisplayName(json.displayName);
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    if (email) fetchPerson();
    else {
      setError("No person email provided the URL parameters.");
      setLoading(false);
    }
  }, [email, token]);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Generating Report...</div>;
  if (error || !data) return (
    <div className="glass-panel" style={{ textAlign: "center", margin: "40px auto", maxWidth: 400 }}>
      <AlertTriangle color="var(--danger)" style={{ marginBottom: 16 }} size={48} />
      <h3>Error Loading Report</h3>
      <p style={{ color: "var(--text-secondary)" }}>{error}</p>
    </div>
  );

  let meetings = data.meetings;
  if (sinceStr) {
     const since = new Date(sinceStr).getTime();
     meetings = meetings.filter((m: any) => new Date(m.startTime).getTime() >= since);
  }
  if (untilStr) {
     const until = new Date(untilStr).getTime();
     meetings = meetings.filter((m: any) => new Date(m.startTime).getTime() <= until);
  }

  const monitored = meetings.filter((m: any) => m.joinTime !== null || m.minutesLate !== null);
  const lateCount = meetings.filter((m: any) => m.wasLate).length;
  const noShowCount = meetings.filter((m: any) => m.noShow).length;
  const lateRate = monitored.length > 0 ? Math.round((lateCount / monitored.length) * 100) : 0;
  
  const lateMins = meetings.filter((m: any) => m.wasLate && m.minutesLate !== null).map((m: any) => m.minutesLate!);
  const avgMinutesLate = lateMins.length > 0 ? Math.round(lateMins.reduce((s: number, n: number) => s + n, 0) / lateMins.length) : 0;

  // Group lateness for the simple chart
  const byDay: Record<string, number> = {};
  for (const m of meetings) {
     const date = new Date(m.startTime).toLocaleDateString();
     if (!byDay[date]) byDay[date] = 0;
     if (m.wasLate && m.minutesLate) byDay[date] += m.minutesLate;
  }
  const chartData = Object.entries(byDay).map(([date, mins]) => ({ name: date, mins })).slice(0, 14).reverse();

  return (
    <div style={{ background: "white", color: "black", margin: "-40px 0", padding: "40px 20px", minHeight: "100vh" }}>
      <div className="no-print" style={{ marginBottom: 32, display: "flex", justifyContent: "space-between" }}>
        <Link to={`/people/${encodeURIComponent(email || "")}`} style={{ color: "var(--primary-color)", textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
           <ArrowLeft size={16} /> Back to Profile
        </Link>
        <button onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--primary-color)", color: "white", border: "none", padding: "8px 16px", borderRadius: 6, cursor: "pointer" }}>
          <Printer size={16} /> Print Report
        </button>
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <header style={{ borderBottom: "2px solid #eee", paddingBottom: 24, marginBottom: 32, textAlign: "center" }}>
          <h1 style={{ margin: "0 0 8px 0" }}>Punctuality Report</h1>
          <h2 style={{ margin: "0 0 16px 0", fontWeight: 400, color: "#555" }}>{data.displayName} ({data.email})</h2>
          <div style={{ fontSize: "0.875rem", color: "#888" }}>
            Period: {sinceStr ? new Date(sinceStr).toLocaleDateString() : 'All Time'} 
            {" "}—{" "} 
            {untilStr ? new Date(untilStr).toLocaleDateString() : 'Present'}
          </div>
        </header>

        <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 40 }}>
          <div style={{ textAlign: "center" }}>
             <div style={{ fontSize: "0.875rem", color: "#666", textTransform: "uppercase" }}>Meetings</div>
             <div style={{ fontSize: "2rem", fontWeight: 700 }}>{meetings.length}</div>
          </div>
          <div style={{ textAlign: "center" }}>
             <div style={{ fontSize: "0.875rem", color: "#666", textTransform: "uppercase" }}>Late Rate</div>
             <div style={{ fontSize: "2rem", fontWeight: 700 }}>{lateRate}%</div>
          </div>
          <div style={{ textAlign: "center" }}>
             <div style={{ fontSize: "0.875rem", color: "#666", textTransform: "uppercase" }}>Avg Mins Late</div>
             <div style={{ fontSize: "2rem", fontWeight: 700 }}>{avgMinutesLate}</div>
          </div>
          <div style={{ textAlign: "center" }}>
             <div style={{ fontSize: "0.875rem", color: "#666", textTransform: "uppercase" }}>No Shows</div>
             <div style={{ fontSize: "2rem", fontWeight: 700 }}>{noShowCount}</div>
          </div>
        </div>

        {chartData.length > 0 && (
          <div style={{ marginBottom: 40, height: 200 }}>
            <h3 style={{ borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 16 }}>Lateness Trend (Minutes)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                 <XAxis dataKey="name" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                 <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                 <Bar dataKey="mins" fill="#333" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <h3 style={{ borderBottom: "1px solid #eee", paddingBottom: 8, marginBottom: 16 }}>Detailed Incidents (Lateness &amp; No Shows)</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
          <thead>
            <tr style={{ background: "#f9f9f9" }}>
               <th style={{ padding: "8px 10px", borderBottom: "1px solid #ddd", textAlign: "left" }}>Date</th>
               <th style={{ padding: "8px 10px", borderBottom: "1px solid #ddd", textAlign: "left" }}>Start Time</th>
               <th style={{ padding: "8px 10px", borderBottom: "1px solid #ddd", textAlign: "left" }}>End Time</th>
               <th style={{ padding: "8px 10px", borderBottom: "1px solid #ddd", textAlign: "center" }}>Late?</th>
               <th style={{ padding: "8px 10px", borderBottom: "1px solid #ddd", textAlign: "center" }}>Mins Late</th>
               <th style={{ padding: "8px 10px", borderBottom: "1px solid #ddd", textAlign: "center" }}>No Show?</th>
            </tr>
          </thead>
          <tbody>
             {meetings.filter((m: any) => m.wasLate || m.noShow).map((m: any) => {
               const start = new Date(m.startTime);
               const end = new Date(m.endTime);
               const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
               const fmtDate = (d: Date) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
               return (
                 <tr key={m.meetingId}>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #eee" }}>{fmtDate(start)}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #eee" }}>{fmtTime(start)}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #eee" }}>{fmtTime(end)}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                      {m.wasLate ? <span style={{ color: "#c0392b", fontWeight: 600 }}>Yes</span> : <span style={{ color: "#27ae60" }}>No</span>}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                      {m.noShow ? "—" : m.minutesLate != null ? `${m.minutesLate}m` : "0m"}
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #eee", textAlign: "center" }}>
                      {m.noShow ? <span style={{ color: "#c0392b", fontWeight: 600 }}>Yes</span> : <span style={{ color: "#27ae60" }}>No</span>}
                    </td>
                 </tr>
               );
             })}
             {meetings.filter((m: any) => m.wasLate || m.noShow).length === 0 && (
                <tr><td colSpan={6} style={{ padding: 16, textAlign: "center" }}>No incidents to display.</td></tr>
             )}
          </tbody>
        </table>

        <footer style={{ marginTop: 60, paddingTop: 24, borderTop: "1px solid #eee", textAlign: "center", color: "#888", fontSize: "0.75rem" }}>
          <p>Confidential — internal use only.</p>
          <p>Generated by Presence Tracker on {new Date().toLocaleString()}</p>
        </footer>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>
    </div>
  );
}
