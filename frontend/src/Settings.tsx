import { useState, useEffect } from "react";
import { Lock, Eye, EyeOff, Trash2, Plus, Search, Star } from "lucide-react";
import { formatDisplayName } from "./utils/formatName";

interface AttendeeSetting {
  email: string;
  displayName: string;
  hidden: boolean;
  isLeadership: boolean;
}

interface ExclusionRule {
  id: string;
  name: string;
  pattern: string;
  matchCount: number;
  createdAt: string;
}

export default function Settings({ token }: { token: string }) {
  const [adminPassword, setAdminPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const [people, setPeople] = useState<AttendeeSetting[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [savingEmail, setSavingEmail] = useState<string | null>(null);

  // Exclusion rules state
  const [rules, setRules] = useState<ExclusionRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [newRuleName, setNewRuleName] = useState("");
  const [newRulePattern, setNewRulePattern] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewBreakdown, setPreviewBreakdown] = useState<{ term: string; isNot: boolean; matchCount: number }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [addRuleError, setAddRuleError] = useState("");

  const API_URL = import.meta.env.VITE_API_URL || "/api";

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch(`${API_URL}/settings/auth`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: adminPassword }),
      });
      if (res.ok) {
        setAuthenticated(true);
      } else {
        setAuthError("Invalid admin password");
      }
    } catch {
      setAuthError("Network error");
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!authenticated) return;

    setLoadingPeople(true);
    fetch(`${API_URL}/settings/people`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setPeople(data))
      .finally(() => setLoadingPeople(false));

    setLoadingRules(true);
    fetch(`${API_URL}/settings/exclusion-rules`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setRules(data))
      .finally(() => setLoadingRules(false));
  }, [authenticated]);

  // Live preview: debounce pattern input and fetch match count + breakdown
  useEffect(() => {
    if (!newRulePattern.trim()) {
      setPreviewCount(null);
      setPreviewBreakdown([]);
      return;
    }
    setPreviewLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_URL}/settings/exclusion-rules/preview?pattern=${encodeURIComponent(newRulePattern)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        setPreviewCount(data.matchCount);
        setPreviewBreakdown(data.breakdown ?? []);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [newRulePattern]);

  const toggleLeadership = async (email: string, isLeadership: boolean) => {
    setSavingEmail(email);
    try {
      await fetch(`${API_URL}/settings/people/${encodeURIComponent(email)}/leadership`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isLeadership, adminPassword }),
      });
      setPeople((prev) =>
        prev.map((p) => (p.email === email ? { ...p, isLeadership } : p))
      );
    } finally {
      setSavingEmail(null);
    }
  };

  const toggleHidden = async (email: string, hidden: boolean) => {
    setSavingEmail(email);
    try {
      await fetch(`${API_URL}/settings/people/${encodeURIComponent(email)}/hidden`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ hidden, adminPassword }),
      });
      setPeople((prev) =>
        prev.map((p) => (p.email === email ? { ...p, hidden } : p))
      );
    } finally {
      setSavingEmail(null);
    }
  };

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRulePattern.trim()) return;
    setAddingRule(true);
    setAddRuleError("");
    try {
      const res = await fetch(`${API_URL}/settings/exclusion-rules`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newRuleName, pattern: newRulePattern, adminPassword }),
      });
      if (!res.ok) {
        const err = await res.json();
        setAddRuleError(err.error || "Failed to add rule");
        return;
      }
      // Reload rules with updated match counts
      const rulesRes = await fetch(`${API_URL}/settings/exclusion-rules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRules(await rulesRes.json());
      setNewRuleName("");
      setNewRulePattern("");
      setPreviewCount(null);
    } finally {
      setAddingRule(false);
    }
  };

  const deleteRule = async (id: string) => {
    setDeletingRuleId(id);
    try {
      await fetch(`${API_URL}/settings/exclusion-rules/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminPassword }),
      });
      setRules((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeletingRuleId(null);
    }
  };

  if (!authenticated) {
    return (
      <div style={{ display: "flex", justifyContent: "center", paddingTop: 60 }}>
        <div className="glass-panel" style={{ width: "100%", maxWidth: 400, textAlign: "center" }}>
          <div style={{ marginBottom: 24 }}>
            <Lock size={32} color="var(--primary-color)" style={{ marginBottom: 12 }} />
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Admin Settings</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: 8 }}>
              Enter the admin password to manage employee visibility.
            </p>
          </div>
          <form onSubmit={handleAdminLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <input
              type="password"
              placeholder="Admin password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              required
              autoFocus
            />
            {authError && (
              <p style={{ color: "var(--danger)", fontSize: "0.875rem", margin: 0 }}>{authError}</p>
            )}
            <button type="submit" className="btn-primary" disabled={authLoading}>
              {authLoading ? "Verifying..." : "Unlock Settings"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      {/* Employee Visibility */}
      <div>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Employee Visibility</h2>
          <p style={{ color: "var(--text-secondary)", marginTop: 8, fontSize: "0.875rem" }}>
            Hidden employees are excluded from all dashboards, leaderboards, and reports.
          </p>
        </div>

        {loadingPeople ? (
          <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
        ) : (
          <div className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
            {people.map((person, i) => {
              const isSaving = savingEmail === person.email;
              return (
                <div
                  key={person.email}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 20px",
                    borderBottom: i < people.length - 1 ? "1px solid var(--bg-card-border)" : "none",
                    opacity: isSaving ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>
                      {formatDisplayName(person.displayName)}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      {person.email}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => toggleLeadership(person.email, !person.isLeadership)}
                    disabled={isSaving}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: "1px solid",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      background: person.isLeadership
                        ? "rgba(33,150,243,0.12)"
                        : "rgba(255,255,255,0.05)",
                      borderColor: person.isLeadership
                        ? "var(--primary-color)"
                        : "var(--bg-card-border)",
                      color: person.isLeadership ? "var(--primary-color)" : "var(--text-secondary)",
                    }}
                  >
                    <Star size={14} />
                    Leadership
                  </button>
                  <button
                    onClick={() => toggleHidden(person.email, !person.hidden)}
                    disabled={isSaving}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 14px",
                      borderRadius: 6,
                      border: "1px solid",
                      cursor: "pointer",
                      fontSize: "0.8rem",
                      fontWeight: 500,
                      background: person.hidden
                        ? "rgba(241,90,36,0.1)"
                        : "rgba(255,255,255,0.05)",
                      borderColor: person.hidden
                        ? "var(--primary-color)"
                        : "var(--bg-card-border)",
                      color: person.hidden ? "var(--primary-color)" : "var(--text-secondary)",
                    }}
                  >
                    {person.hidden ? (
                      <><EyeOff size={14} /> Hidden</>
                    ) : (
                      <><Eye size={14} /> Visible</>
                    )}
                  </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Meeting Exclusion Rules */}
      <div>
        <div style={{ marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Meeting Exclusion Rules</h2>
          <p style={{ color: "var(--text-secondary)", marginTop: 8, fontSize: "0.875rem" }}>
            Meetings matching these patterns are excluded from all dashboards and reports.
            Use spaces for AND, <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 3 }}>OR</code> between groups,
            and <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 3 }}>-word</code> to exclude a term.
          </p>
        </div>

        {/* Existing rules */}
        {loadingRules ? (
          <p style={{ color: "var(--text-secondary)" }}>Loading...</p>
        ) : rules.length > 0 ? (
          <div className="glass-panel" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
            {rules.map((rule, i) => {
              const isDeleting = deletingRuleId === rule.id;
              return (
                <div
                  key={rule.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 20px",
                    borderBottom: i < rules.length - 1 ? "1px solid var(--bg-card-border)" : "none",
                    opacity: isDeleting ? 0.4 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {rule.name && (
                      <div style={{ fontWeight: 500, fontSize: "0.9rem", marginBottom: 2 }}>
                        {rule.name}
                      </div>
                    )}
                    <code
                      style={{
                        fontSize: "0.8rem",
                        background: "rgba(255,255,255,0.06)",
                        padding: "2px 8px",
                        borderRadius: 4,
                        color: "var(--primary-color)",
                        display: "inline-block",
                      }}
                    >
                      {rule.pattern}
                    </code>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, marginLeft: 16 }}>
                    <span
                      style={{
                        fontSize: "0.78rem",
                        color: rule.matchCount > 0 ? "var(--text-secondary)" : "var(--text-muted, var(--text-secondary))",
                        background: "rgba(255,255,255,0.05)",
                        padding: "3px 10px",
                        borderRadius: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {rule.matchCount} meeting{rule.matchCount !== 1 ? "s" : ""} excluded
                    </span>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      disabled={isDeleting}
                      title="Delete rule"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 30,
                        height: 30,
                        borderRadius: 6,
                        border: "1px solid var(--bg-card-border)",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--text-secondary)",
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: 16 }}>
            No exclusion rules yet.
          </p>
        )}

        {/* Add new rule form */}
        <div className="glass-panel">
          <h3 style={{ margin: "0 0 16px", fontSize: "1rem", fontWeight: 600 }}>Add Rule</h3>
          <form onSubmit={addRule} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="text"
              placeholder='Label (optional) — e.g. "Interview Blocks"'
              value={newRuleName}
              onChange={(e) => setNewRuleName(e.target.value)}
            />
            <div>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder='Pattern — e.g. "interview block" or "standup OR daily"'
                  value={newRulePattern}
                  onChange={(e) => setNewRulePattern(e.target.value)}
                  required
                  style={{ width: "100%", paddingRight: previewCount !== null || previewLoading ? 180 : undefined, boxSizing: "border-box" }}
                />
                {(previewLoading || previewCount !== null) && (
                  <span
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      fontSize: "0.78rem",
                      color: previewLoading
                        ? "var(--text-secondary)"
                        : previewCount === 0
                        ? "var(--text-secondary)"
                        : "var(--primary-color)",
                      pointerEvents: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {previewLoading ? (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Search size={12} /> Counting...
                      </span>
                    ) : (
                      `${previewCount} meeting${previewCount !== 1 ? "s" : ""} would be excluded`
                    )}
                  </span>
                )}
              </div>

              {/* Per-term breakdown — shown when there are multiple terms */}
              {!previewLoading && previewBreakdown.length > 1 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {previewBreakdown.map(({ term, isNot, matchCount }) => (
                    <span
                      key={term}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: "0.75rem",
                        padding: "3px 9px",
                        borderRadius: 12,
                        background: matchCount === 0 && !isNot
                          ? "rgba(239,68,68,0.12)"
                          : "rgba(255,255,255,0.06)",
                        border: "1px solid",
                        borderColor: matchCount === 0 && !isNot
                          ? "rgba(239,68,68,0.4)"
                          : "var(--bg-card-border)",
                        color: matchCount === 0 && !isNot
                          ? "#f87171"
                          : "var(--text-secondary)",
                      }}
                    >
                      <code style={{ fontSize: "inherit", color: "inherit" }}>{term}</code>
                      <span style={{ opacity: 0.7 }}>
                        {isNot ? `${matchCount} excluded` : `${matchCount} match${matchCount !== 1 ? "es" : ""}`}
                      </span>
                    </span>
                  ))}
                  {previewBreakdown.length > 1 && (
                    <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", alignSelf: "center", opacity: 0.6 }}>
                      (all terms must match)
                    </span>
                  )}
                </div>
              )}
            </div>

            {addRuleError && (
              <p style={{ color: "var(--danger)", fontSize: "0.875rem", margin: 0 }}>{addRuleError}</p>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={addingRule || !newRulePattern.trim()}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Plus size={15} />
              {addingRule ? "Adding..." : "Add Exclusion Rule"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
