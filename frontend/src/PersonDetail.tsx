import { useState, useEffect } from "react";
import { Tooltip as BadgeTooltip } from "./components/Tooltip";
import { useParams, Link } from "react-router-dom";
import { AlertTriangle, Calendar, ArrowLeft, TrendingDown } from "lucide-react";
import { formatDisplayName } from "./utils/formatName";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface PersonStatsData {
  email: string;
  displayName: string;
  totalMeetings: number;
  monitoredMeetings: number;
  lateCount: number;
  noShowCount: number;
  lateRate: number;
  avgMinutesLate: number;
  maxMinutesLate: number;
  totalMinutesLate: number;
  currentStreak: number;
  maxStreak: number;
  cameraTrackedMeetings: number;
  cameraOffCount: number;
  cameraOffRate: number;
  avgCameraOnRatio: number | null;
  meetings: {
    meetingId: string;
    title: string;
    startTime: string;
    joinTime: string | null;
    minutesLate: number | null;
    wasLate: boolean;
    durationMin: number | null;
    neverJoined: boolean;
    cameraOnRatio: number | null;
    cameraOff: boolean;
  }[];
}

export default function PersonDetail({ token }: { token: string }) {
  const { email } = useParams();
  const [data, setData] = useState<PersonStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPerson = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "/api";
        const res = await fetch(`${API_URL}/people/${encodeURIComponent(email || "")}/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Failed to load person details.");
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
  }, [email, token]);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading person details...</div>;
  if (error || !data) return (
    <div className="glass-panel" style={{ textAlign: "center", margin: "40px auto", maxWidth: 400 }}>
      <AlertTriangle color="var(--danger)" style={{ marginBottom: 16 }} size={48} />
      <h3>Error Loading Person</h3>
      <p style={{ color: "var(--text-secondary)" }}>{error || "Not found"}</p>
      <Link to="/" className="btn-primary" style={{ display: "inline-block", marginTop: 16, textDecoration: "none" }}>Back to Dashboard</Link>
    </div>
  );

  // Group lateness by week for the past 12 weeks for the chart
  const computeTrendData = () => {
    const weeks: { weekStart: Date; totalMins: number; count: number }[] = [];
    const now = new Date();
    // Initialize last 12 weeks
    for (let i = 11; i >= 0; i--) {
      const w = new Date(now);
      w.setUTCDate(w.getUTCDate() - (w.getUTCDay() === 0 ? 6 : w.getUTCDay() - 1) - i * 7);
      w.setUTCHours(0, 0, 0, 0);
      weeks.push({ weekStart: w, totalMins: 0, count: 0 });
    }
    
    for (const m of data.meetings) {
      if (m.wasLate && m.minutesLate) {
        const mDate = new Date(m.startTime);
        const weekBucket = weeks.find((w, i) => {
           const nextWindow = i < 11 ? weeks[i + 1].weekStart : new Date();
           return mDate >= w.weekStart && mDate < nextWindow;
        });
        if (weekBucket) {
           weekBucket.totalMins += m.minutesLate;
           weekBucket.count++;
        }
      }
    }

    return weeks.map(w => ({
      name: w.weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      avgMins: w.count > 0 ? Math.round(w.totalMins / w.count) : 0
    }));
  };

  const trendData = computeTrendData();
  const latenessOnly = data.meetings.filter(m => m.wasLate || m.neverJoined);
  const cameraOffMeetings = data.meetings.filter(m => m.cameraOff);

  return (
    <div>
      <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", textDecoration: "none", marginBottom: 24, fontSize: "0.875rem", fontWeight: 500 }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: "0 0 8px 0", fontSize: "2rem", display: "flex", alignItems: "center", gap: 12 }}>
            {data.displayName}
            {data.lateRate > 24 && (
              <BadgeTooltip text="Late to more than 24% of their meetings in the last 7 days.">
                <span style={{ background: 'rgba(255, 68, 68, 0.1)', color: 'var(--danger)', padding: '4px 8px', borderRadius: 4, fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'help' }}>Tardy</span>
              </BadgeTooltip>
            )}
          </h1>
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>{data.email}</p>
        </div>
        <Link to={`/report?person=${encodeURIComponent(data.email)}`} style={{ background: "var(--primary-color)", color: "white", padding: "8px 16px", borderRadius: 8, textDecoration: "none", fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={16} /> Generate Report
        </Link>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 24, marginBottom: 32 }}>
        <div className="glass-panel">
          <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: 8 }}>Late Rate</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: data.lateRate > 20 ? 'var(--danger)' : 'var(--success)' }}>
            {data.lateRate}%
          </div>
        </div>
        <div className="glass-panel">
          <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: 8, cursor: 'help' }} data-tooltip-below="The total number of minutes that you wasted of other people's time.">Avg / Total Mins Late</div>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>
            {data.avgMinutesLate} <span style={{ fontSize: "1rem", color: "var(--text-secondary)", fontWeight: 400 }}>/ {data.totalMinutesLate}</span>
          </div>
        </div>
        <div className="glass-panel">
          <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: 8 }}>Current / Best Streak</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--primary-color)" }}>
            {data.currentStreak} <span style={{ fontSize: "1rem", color: "var(--text-secondary)", fontWeight: 400 }}>/ {data.maxStreak}</span>
          </div>
        </div>
        <div className="glass-panel">
          <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: 8 }}>No Shows</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: data.noShowCount > 0 ? "var(--danger)" : "var(--text-primary)" }}>
            {data.noShowCount}
          </div>
        </div>
        <div className="glass-panel">
          <div style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: 8, cursor: 'help' }} data-tooltip-below="% of tracked meetings this person spent less than half the time sending video.">Camera Off Rate</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: data.cameraOffRate > 50 ? 'var(--danger)' : data.cameraOffRate > 0 ? 'var(--warning, #ffaa00)' : 'var(--success)' }}>
            {data.cameraTrackedMeetings > 0 ? `${data.cameraOffRate}%` : '—'}
          </div>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 24, marginBottom: 32 }}>
         <h3 style={{ margin: "0 0 24px 0", fontSize: "1.25rem", display: "flex", alignItems: "center", gap: 8 }}>
           <TrendingDown color="var(--primary-color)" /> Lateness Trend (Past 12 Weeks)
         </h3>
         <div style={{ height: 300, width: "100%" }}>
           <ResponsiveContainer width="100%" height="100%">
             <BarChart data={trendData}>
               <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
               <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
               <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--bg-card-border)', borderRadius: 8 }} />
               <Bar dataKey="avgMins" name="Avg Mins Late" fill="var(--warning, #ffaa00)" radius={[4, 4, 0, 0]} />
             </BarChart>
           </ResponsiveContainer>
         </div>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
        <div style={{ padding: 24, borderBottom: "1px solid var(--bg-card-border)" }}>
           <h3 style={{ margin: 0, fontSize: "1.25rem", display: "flex", alignItems: "center", gap: 8 }}>
             <AlertTriangle color="var(--danger)" size={20} /> Lateness & No Shows
           </h3>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
             <tr style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>Day & Date</th>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>Start Time</th>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>End Time</th>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>Status</th>
             </tr>
          </thead>
          <tbody>
            {latenessOnly.map((m, i) => {
               const start = new Date(m.startTime);
               const end = m.durationMin != null ? new Date(start.getTime() + m.durationMin * 60000) : null;
               return (
               <tr key={m.meetingId} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--bg-card-border)' }}>
                 <td style={{ padding: '16px 24px', fontWeight: 600 }}>
                    {start.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                 </td>
                 <td style={{ padding: '16px 24px', color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                 </td>
                 <td style={{ padding: '16px 24px', color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    {end ? end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}
                 </td>
                 <td style={{ padding: '16px 24px' }}>
                    {m.neverJoined ? (
                      <span style={{ color: 'var(--danger)', fontWeight: 600 }}>No Show</span>
                    ) : (
                      <span style={{ color: 'var(--warning, #ffaa00)', fontWeight: 600 }}>Late ({m.minutesLate}m)</span>
                    )}
                 </td>
               </tr>
               );
            })}
            {latenessOnly.length === 0 && (
               <tr>
                 <td colSpan={4} style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--success)' }}>
                   Perfect record! No lateness or no shows.
                 </td>
               </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', marginBottom: 32 }}>
        <div style={{ padding: 24, borderBottom: "1px solid var(--bg-card-border)" }}>
           <h3 style={{ margin: 0, fontSize: "1.25rem", display: "flex", alignItems: "center", gap: 8 }}>
             <AlertTriangle color="var(--warning, #ffaa00)" size={20} /> Camera Off
           </h3>
           <p style={{ margin: "8px 0 0 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
             Meetings where video-on time was below the threshold. Based on Google Meet's reported send-video duration, not a live toggle log — someone turning their camera off and back on nets out the same.
           </p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
             <tr style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>Day & Date</th>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>Start Time</th>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>Camera On %</th>
             </tr>
          </thead>
          <tbody>
            {cameraOffMeetings.map((m, i) => {
               const start = new Date(m.startTime);
               return (
               <tr key={m.meetingId} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--bg-card-border)' }}>
                 <td style={{ padding: '16px 24px', fontWeight: 600 }}>
                    {start.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                 </td>
                 <td style={{ padding: '16px 24px', color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    {start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                 </td>
                 <td style={{ padding: '16px 24px' }}>
                    <span style={{ color: 'var(--warning, #ffaa00)', fontWeight: 600 }}>
                      {m.cameraOnRatio != null ? `${Math.round(m.cameraOnRatio * 100)}%` : '—'}
                    </span>
                 </td>
               </tr>
               );
            })}
            {cameraOffMeetings.length === 0 && (
               <tr>
                 <td colSpan={3} style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--success)' }}>
                   No camera-off meetings in this period{data.cameraTrackedMeetings === 0 ? ' (no camera data tracked yet)' : ''}.
                 </td>
               </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
