import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Grid, AlertTriangle } from "lucide-react";
import { formatDisplayName } from "./utils/formatName";

interface HeatmapData {
  meetings: { id: string; title: string; startTime: string }[];
  people: {
    email: string;
    displayName: string;
    attendance: Record<string, "on-time" | "late" | "no-show">;
  }[];
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getCellColor(onTime: number, late: number, noShow: number): string {
  const total = onTime + late + noShow;
  if (total === 0) return "rgba(255,255,255,0.05)";
  const score = (onTime + 0.5 * late) / total;
  if (score >= 0.9) return "var(--success)";
  if (score >= 0.7) return "#88cc44";
  if (score >= 0.5) return "var(--warning, #ffaa00)";
  if (score >= 0.3) return "#ff6600";
  return "var(--danger)";
}

export default function MeetingHeatmap({ token }: { token: string }) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHeatmap = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "/api";
        const res = await fetch(`${API_URL}/heatmap`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Failed to load heatmap.");
        const json = await res.json();
        json.people = json.people.map((p: any) => ({ ...p, displayName: formatDisplayName(p.displayName) }));
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchHeatmap();
  }, [token]);

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading heatmap...</div>;
  if (error || !data) return (
    <div className="glass-panel" style={{ textAlign: "center", margin: "40px auto", maxWidth: 400 }}>
      <AlertTriangle color="var(--danger)" style={{ marginBottom: 16 }} size={48} />
      <h3>Error Loading Heatmap</h3>
      <p style={{ color: "var(--text-secondary)" }}>{error}</p>
    </div>
  );

  // Always show Mon–Fri columns regardless of whether meetings exist on each day
  const daysWithMeetings = [1, 2, 3, 4, 5];

  // Build meetingId -> dayOfWeek lookup
  const meetingDay: Record<string, number> = {};
  data.meetings.forEach(m => {
    meetingDay[m.id] = new Date(m.startTime).getDay();
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 12, margin: 0 }}>
          <Grid color="var(--primary-color)" /> Punctuality Heatmap
        </h2>
      </div>

      <div className="glass-panel" style={{ padding: 0, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', textAlign: 'left', minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', position: 'sticky', left: 0, zIndex: 2, minWidth: 200, borderBottom: '1px solid var(--bg-card-border)' }}>
                Employee
              </th>
              {daysWithMeetings.map(day => (
                <th key={day} style={{ padding: '16px 24px', background: 'rgba(255,255,255,0.02)', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--bg-card-border)', minWidth: 72 }}>
                  {DAY_NAMES[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.people.map((p, i) => (
              <tr key={p.email} style={{ borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '12px 16px', position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1, borderRight: '1px solid var(--bg-card-border)' }}>
                  <Link to={`/people/${encodeURIComponent(p.email)}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 600 }}>
                    {p.displayName}
                  </Link>
                </td>
                {daysWithMeetings.map(day => {
                  const counts = { onTime: 0, late: 0, noShow: 0 };
                  data.meetings.forEach(m => {
                    if (meetingDay[m.id] === day) {
                      const status = p.attendance[m.id];
                      if (status === 'on-time') counts.onTime++;
                      else if (status === 'late') counts.late++;
                      else if (status === 'no-show') counts.noShow++;
                    }
                  });
                  const total = counts.onTime + counts.late + counts.noShow;
                  const tooltip = total > 0
                    ? `${DAY_FULL[day]}: ${counts.onTime} on-time, ${counts.late} late, ${counts.noShow} no-show`
                    : `${DAY_FULL[day]}: no meetings`;
                  return (
                    <td key={day} style={{ padding: '8px', textAlign: 'center' }}>
                      <div style={{
                        width: '100%', height: 40, borderRadius: 4,
                        background: getCellColor(counts.onTime, counts.late, counts.noShow),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)',
                        textShadow: '0 1px 2px rgba(0,0,0,0.4)'
                      }} title={tooltip}>
                        {total > 0 ? `${counts.onTime}/${total}` : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: "0.875rem", color: "var(--text-secondary)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 16, height: 16, background: "var(--success)", borderRadius: 4 }} /> On Time
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 16, height: 16, background: "var(--warning, #ffaa00)", borderRadius: 4 }} /> Late
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 16, height: 16, background: "var(--danger)", borderRadius: 4 }} /> No Show
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 16, height: 16, background: "rgba(255,255,255,0.05)", borderRadius: 4 }} /> No Meetings
        </div>
      </div>
    </div>
  );
}
