import { useState, useEffect } from "react";
import { Tooltip } from "./components/Tooltip";
import { Download, AlertTriangle, Users, Clock, TrendingDown, Link as LinkIcon, HelpCircle, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDisplayName } from "./utils/formatName";

export interface DashboardData {
  people: {
    email: string;
    displayName: string;
    meetings: number;
    lateCount: number;
    noShowCount: number;
    noShowRate: number;
    totalMinutesLate: number;
    lateRate: number;
    avgMinutesLate: number;
    isLeadership: boolean;
    cameraTrackedMeetings?: number;
    cameraOffCount?: number;
    cameraOffRate?: number;
    avgCameraOnRatio?: number | null;
  }[];
  totalMeetings: number;
  pendingMeetings: number;
  since: string;
}

export default function Dashboard({ token }: { token: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangePreset, setRangePreset] = useState<"last_7" | "last_30" | "all_time">("last_7");
  const [sortCol, setSortCol] = useState<"name" | "meetings" | "lateRate" | "totalMinutesLate" | "cameraOffRate">("lateRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir(col === "name" ? "asc" : "desc");
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const API_URL = import.meta.env.VITE_API_URL || "/api";
        
        let sinceDate = new Date();
        if (rangePreset === "last_7") {
          sinceDate.setUTCDate(sinceDate.getUTCDate() - 7);
        } else if (rangePreset === "last_30") {
          sinceDate.setUTCDate(sinceDate.getUTCDate() - 30);
        } else {
          sinceDate = new Date(0); // all time
        }

        const res = await fetch(`${API_URL}/dashboard/summary?since=${sinceDate.toISOString()}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (res.status === 401) {
          window.location.reload();
          return;
        }

        if (!res.ok) throw new Error("Failed to fetch data");

        const json = await res.json();
        json.people = json.people.map((p: any) => ({ ...p, displayName: formatDisplayName(p.displayName) }));
        setData(json);
      } catch (err: any) {
        setError(err.message || "Could not load dashboard.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [token, rangePreset]);

  const handleExportCsv = () => {
    if (!data?.people) return;
    const headers = ["Employee", "Email", "Meetings", "Late Rate (%)", "No Shows", "Avg Mins Late", "Total Mins Late", "Camera Off Rate (%)", "Camera Tracked Meetings"];
    const rows = data.people.map(p => [
      p.displayName, p.email, p.meetings.toString(), p.lateRate.toString(), p.noShowCount.toString(), p.avgMinutesLate.toString(), p.totalMinutesLate.toString(), (p.cameraOffRate ?? 0).toString(), (p.cameraTrackedMeetings ?? 0).toString()
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.map(cell => `"${cell}"`).join(","))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `presence_tracker_export_${rangePreset}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Loading dashboard...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div className="glass-panel" style={{ textAlign: 'center' }}>
          <AlertTriangle color="var(--danger)" size={48} style={{ marginBottom: 16 }} />
          <h2 style={{ marginBottom: 8 }}>Connection Error</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>{error}</p>
          <button onClick={() => window.location.reload()} className="btn-primary">Retry</button>
        </div>
      </div>
    );
  }

  const people = data?.people || [];

  const sortedPeople = [...people].sort((a, b) => {
    let cmp = 0;
    if (sortCol === "name") cmp = a.displayName.localeCompare(b.displayName);
    else if (sortCol === "meetings") cmp = a.meetings - b.meetings;
    else if (sortCol === "lateRate") cmp = a.lateRate - b.lateRate;
    else if (sortCol === "totalMinutesLate") cmp = a.totalMinutesLate - b.totalMinutesLate;
    else if (sortCol === "cameraOffRate") cmp = (a.cameraOffRate ?? 0) - (b.cameraOffRate ?? 0);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const sortIndicator = (col: typeof sortCol) =>
    sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  // Phase 5: Auto-Insights
  const withMeetings = people.filter(p => p.meetings > 0);
  // Excuse rebuttal
  const teamAvgLateRate = withMeetings.length > 0
    ? withMeetings.reduce((sum, p) => sum + p.lateRate, 0) / withMeetings.length
    : 0;
  // Sentence 1: most-booked non-leadership person below team avg
  const excuseRebuttal = [...withMeetings]
    .filter(p => !p.isLeadership && p.lateRate < teamAvgLateRate && p.meetings >= 3)
    .sort((a, b) => b.meetings - a.meetings)[0] ?? null;
  // Sentence 2: leadership person with the lowest late rate (min 3 meetings)
  const leadershipRebuttal = [...withMeetings]
    .filter(p => p.isLeadership && p.meetings >= 3 && p.email !== excuseRebuttal?.email)
    .sort((a, b) => a.lateRate - b.lateRate || b.meetings - a.meetings)[0] ?? null;

  const worstFourLate = [...withMeetings].sort((a, b) => b.lateRate - a.lateRate || b.lateCount - a.lateCount).slice(0, 4);
  const bestFourLate = [...withMeetings].sort((a, b) => a.lateRate - b.lateRate || b.meetings - a.meetings).slice(0, 4);
  const worstFourMissed = [...withMeetings].sort((a, b) => b.noShowRate - a.noShowRate || b.noShowCount - a.noShowCount).slice(0, 4);
  const bestFourMissed = [...withMeetings].sort((a, b) => a.noShowRate - b.noShowRate || b.meetings - a.meetings).slice(0, 4);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 32 }}>
        <div>
          <h1 style={{ margin: "0 0 8px 0", fontSize: "2rem" }}>Company Overview</h1>
          <p style={{ margin: 0, color: "var(--text-secondary)" }}>
            Showing data for {{ last_7: "the last 7 days", last_30: "the last 30 days", all_time: "all time" }[rangePreset]}.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: 16 }}>
          <select 
            value={rangePreset} 
            onChange={e => setRangePreset(e.target.value as any)}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-card-border)', color: 'var(--text-primary)', padding: '8px 16px', borderRadius: 8, outline: 'none', fontSize: '0.875rem' }}
          >
            <option value="last_7">Last 7 Days</option>
            <option value="last_30">Last 30 Days</option>
            <option value="all_time">All Time</option>
          </select>
          <button 
             onClick={handleExportCsv}
             style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-card)', border: '1px solid var(--primary-color)', color: 'var(--primary-color)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 32 }}>
         {/* Tardiness Section */}
         <div className="glass-panel" style={{ background: 'linear-gradient(45deg, rgba(33,150,243,0.1), rgba(0,200,83,0.05))', border: '1px solid rgba(33,150,243,0.2)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: "var(--primary-color)", display: "flex", alignItems: "center", gap: 8 }}>
               <TrendingDown size={18} /> People Who Are Bad At Time Management
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
               {([
                  { label: 'Constantly Late', color: 'var(--danger)', group: worstFourLate },
                  { label: 'Most Punctual', color: 'var(--success, #00c853)', group: bestFourLate },
               ] as const).map(({ label, color, group }) => (
                  <div key={label}>
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color }}>{label}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', textAlign: 'right', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                           Late
                           <span data-tooltip="Joined a meeting after its scheduled start time." style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center' }}><HelpCircle size={11} style={{ opacity: 0.5 }} /></span>
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', textAlign: 'right' }}>Total on Calendar</span>
                     </div>
                     {group.map(p => (
                        <div key={p.email} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px', alignItems: 'center', padding: '5px 0', borderTop: '1px solid var(--bg-card-border)' }}>
                           <span style={{ fontWeight: 600, color }}>{p.displayName}</span>
                           <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>{p.lateRate}%</span>
                           <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>{p.meetings}</span>
                        </div>
                     ))}
                  </div>
               ))}
            </div>
         </div>

         {/* Missed Meetings Section */}
         <div className="glass-panel" style={{ background: 'linear-gradient(45deg, rgba(33,150,243,0.1), rgba(0,200,83,0.05))', border: '1px solid rgba(33,150,243,0.2)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1rem', color: "var(--primary-color)", display: "flex", alignItems: "center", gap: 8 }}>
               <AlertTriangle size={18} /> People Who Like Appearing Busy
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
               {([
                  { label: 'Needs Improvement', color: 'var(--danger)', group: worstFourMissed },
                  { label: 'Best Attendance', color: 'var(--success, #00c853)', group: bestFourMissed },
               ] as const).map(({ label, color, group }) => (
                  <div key={label}>
                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color }}>{label}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', textAlign: 'right', display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                           Missed
                           <span data-tooltip="Invited to a meeting but never joined — no attendance was recorded." style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center' }}><HelpCircle size={11} style={{ opacity: 0.5 }} /></span>
                        </span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', textAlign: 'right' }}>Total on Calendar</span>
                     </div>
                     {group.map(p => (
                        <div key={p.email} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 110px', alignItems: 'center', padding: '5px 0', borderTop: '1px solid var(--bg-card-border)' }}>
                           <span style={{ fontWeight: 600, color }}>{p.displayName}</span>
                           <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>{p.noShowRate}%</span>
                           <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'right' }}>{p.meetings}</span>
                        </div>
                     ))}
                  </div>
               ))}
            </div>
         </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 40 }}>
        <div className="glass-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Users color="var(--primary-color)" />
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Team Members</h3>
          </div>
          <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: 0 }}>{people.length}</p>
        </div>
        
        <div className="glass-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Clock color="var(--primary-color)" />
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Meetings Analyzed</h3>
          </div>
          <p style={{ fontSize: '2.5rem', fontWeight: 700, margin: 0 }}>{data?.totalMeetings || 0}</p>
          {data?.pendingMeetings ? (
             <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 8 }}>
               + {data.pendingMeetings} pending processing
             </p>
          ) : null}
        </div>
      </div>

      {excuseRebuttal && (
        <div style={{ marginBottom: 16, padding: '16px 20px', borderRadius: 12, background: 'rgba(33,150,243,0.07)', border: '1px solid rgba(33,150,243,0.2)', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <ShieldCheck size={18} color="var(--primary-color)" style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-primary)' }}>There are no excuses.</strong>{' '}
            {excuseRebuttal.displayName} had <strong style={{ color: 'var(--text-primary)' }}>{excuseRebuttal.meetings} meetings</strong> on their calendar this period and was only late to <strong style={{ color: 'var(--text-primary)' }}>{excuseRebuttal.lateRate}%</strong> of them.
            {leadershipRebuttal && (
              <>{' '}{leadershipRebuttal.displayName} had <strong style={{ color: 'var(--text-primary)' }}>{leadershipRebuttal.meetings} meetings</strong> and was late to just <strong style={{ color: 'var(--text-primary)' }}>{leadershipRebuttal.lateRate}%</strong> of theirs.</>
            )}
          </p>
        </div>
      )}

      <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '24px', borderBottom: '1px solid var(--bg-card-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Leaderboard</h2>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                {([
                  { col: "name", label: "Employee" },
                  { col: "lateRate", label: "Late Rate" },
                  { col: "meetings", label: "Total Meetings On Cal" },
                ] as const).map(({ col, label }) => (
                  <th key={col} onClick={() => handleSort(col)} style={{ padding: '16px 24px', fontWeight: 500, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {label}{sortIndicator(col)}
                  </th>
                ))}
                <th onClick={() => handleSort("totalMinutesLate")} style={{ padding: '16px 24px', fontWeight: 500, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                  <span data-tooltip-below="The total number of minutes that you wasted of other people's time." style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Total Mins Wasted <HelpCircle size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
                  </span>{sortIndicator("totalMinutesLate")}
                </th>
                <th onClick={() => handleSort("cameraOffRate")} style={{ padding: '16px 24px', fontWeight: 500, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                  <span data-tooltip-below="% of tracked meetings this person spent less than half the time sending video." style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Camera Off <HelpCircle size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
                  </span>{sortIndicator("cameraOffRate")}
                </th>
                <th style={{ padding: '16px 24px', fontWeight: 500 }}>Profile</th>
              </tr>
            </thead>
            <tbody>
              {sortedPeople.map((person, i) => (
                <tr key={person.email} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--bg-card-border)' }}>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {person.displayName}
                      {person.lateRate > 24 && (
                        <Tooltip text="Late to more than 24% of their meetings in the last 7 days.">
                          <span style={{ background: 'rgba(255, 68, 68, 0.1)', color: 'var(--danger)', padding: '2px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'help' }}>Tardy</span>
                        </Tooltip>
                      )}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{person.email}</div>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <span style={{
                      color: person.lateRate > 20 ? 'var(--danger)' : person.lateRate > 0 ? 'var(--warning, #ffaa00)' : 'var(--success)',
                      fontWeight: 600
                    }}>
                      {person.lateRate}%
                    </span>
                  </td>
                  <td style={{ padding: '16px 24px' }}>{person.meetings}</td>
                  <td style={{ padding: '16px 24px' }}>
                     {person.totalMinutesLate > 0 ? (
                       <span style={{ fontWeight: 500, color: "var(--text-secondary)" }}>
                         {person.totalMinutesLate} mins
                       </span>
                     ) : '-'}
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    {(person.cameraTrackedMeetings ?? 0) > 0 ? (
                      <span style={{
                        color: (person.cameraOffRate ?? 0) > 50 ? 'var(--danger)' : (person.cameraOffRate ?? 0) > 0 ? 'var(--warning, #ffaa00)' : 'var(--success)',
                        fontWeight: 600
                      }}>
                        {person.cameraOffRate}%
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <Link to={`/people/${encodeURIComponent(person.email)}`} style={{ color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}>
                      <LinkIcon size={14} /> View
                    </Link>
                  </td>
                </tr>
              ))}
              {people.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    No meeting attendance data yet. The backend is syncing reports...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
