"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// ─── Stress color helper ──────────────────────────────────────────────────────
function stressColor(score) {
  if (score > 0.6) return "#EF4444";
  if (score > 0.3) return "#F59E0B";
  return "#10B981";
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div style={{ background: '#0A0F1E', minHeight: '100vh' }} />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawSessionId = searchParams.get("session") || (typeof window !== "undefined" ? localStorage.getItem("current_session_id") : "") || "";

  const [inputSessionId, setInputSessionId] = useState("");
  const [sessionId, setSessionId] = useState(rawSessionId);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!sessionId && searchParams.get("session")) {
      setSessionId(searchParams.get("session"));
    }
  }, [searchParams, sessionId]);

  // Session data
  const [transcript, setTranscript] = useState("");
  const [ageEstimate, setAgeEstimate] = useState(0);
  const [ageMismatch, setAgeMismatch] = useState(false);
  const [emotion, setEmotion] = useState("neutral");
  const [stressScore, setStressScore] = useState(0);
  const [isLive, setIsLive] = useState(null);
  const [geoData, setGeoData] = useState({
    browser_city: "",
    ip_city: "",
    fraud_flag: false,
  });
  const [fraudFlags, setFraudFlags] = useState([]);
  const [kycForm, setKycForm] = useState(null);
  const [offer, setOffer] = useState(null);

  const transcriptBoxRef = useRef(null);

  // Word count
  const wordCount = transcript
    ? transcript.trim().split(/\s+/).filter(Boolean).length
    : 0;

  // ─── Polling ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;

    const poll = async () => {
      try {
        const res = await fetch(
          `http://localhost:8001/api/session/${sessionId}`
        );
        const session = await res.json();
        setTranscript(session.transcript || "");
        setAgeEstimate(session.age_estimate || 0);
        setAgeMismatch(session.age_mismatch || false);
        setEmotion(session.emotion || "neutral");
        setStressScore(session.stress_score || 0);
        setIsLive(session.is_live);
        setGeoData(session.geo_data || {});
        setFraudFlags(session.fraud_flags || []);
        setKycForm(session.kyc_form || null);
        setOffer(session.offer || null);
      } catch (e) {
        console.log("Polling error:", e);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop =
        transcriptBoxRef.current.scrollHeight;
    }
  }, [transcript]);

  // Handle session input
  const handleMonitor = () => {
    if (inputSessionId.trim()) {
      setSessionId(inputSessionId.trim());
      router.push("/dashboard?session=" + inputSessionId.trim());
    }
  };

  // ─── KYC row helper ───────────────────────────────────────────────────────
  const kycRow = (label, value, isConsent = false) => {
    const hasValue =
      value !== null && value !== undefined && value !== "" && value !== 0;
    const displayVal = isConsent
      ? hasValue && value
        ? "YES"
        : "NO"
      : hasValue
      ? String(value)
      : "—";

    return (
      <tr>
        <td
          style={{
            padding: "10px 12px",
            color: "#9CA3AF",
            fontSize: "0.875rem",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {label}
        </td>
        <td
          style={{
            padding: "10px 12px",
            color: hasValue ? "#F9FAFB" : "#4B5563",
            fontSize: "0.875rem",
            fontWeight: hasValue ? 500 : 400,
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {displayVal}
        </td>
        <td
          style={{
            padding: "10px 12px",
            textAlign: "right",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <span style={{ fontSize: "0.9rem" }}>
            {hasValue ? (
              <span style={{ color: "#10B981" }}>✓</span>
            ) : (
              <span style={{ color: "#374151" }}>○</span>
            )}
          </span>
        </td>
      </tr>
    );
  };

  if (!mounted) return null;

  if (!sessionId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0A0F1E",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "20px",
        }}
      >
        <div
          className="glass-card"
          style={{ padding: "40px", maxWidth: "440px", width: "100%", textAlign: "center" }}
        >
          <h1
            style={{
              color: "#F9FAFB",
              fontSize: "1.5rem",
              fontWeight: 700,
              marginBottom: "8px",
            }}
          >
            Agent Dashboard
          </h1>
          <p
            style={{
              color: "#9CA3AF",
              fontSize: "0.875rem",
              marginBottom: "24px",
            }}
          >
            Enter Session ID to monitor
          </p>
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              id="session-id-input"
              value={inputSessionId}
              onChange={(e) => setInputSessionId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleMonitor()}
              placeholder="Session ID..."
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "10px",
                padding: "10px 14px",
                color: "#F9FAFB",
                fontSize: "0.9rem",
                outline: "none",
              }}
            />
            <button
              onClick={handleMonitor}
              className="btn-gradient"
              style={{ padding: "10px 20px", fontSize: "0.9rem" }}
            >
              Monitor →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0A0F1E" }}>
      {/* Top Nav */}
      <nav
        style={{
          background: "#111827",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        {/* Left */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #F5C842, #F5A623)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "0.75rem",
              color: "#0A0F1E",
            }}
          >
            PF
          </div>
          <span style={{ color: "#F9FAFB", fontWeight: 600, fontSize: "0.95rem" }}>
            Agent Dashboard
          </span>
        </div>

        {/* Center */}
        <span
          style={{
            color: "#9CA3AF",
            fontSize: "0.8rem",
            fontFamily: "monospace",
            background: "rgba(255,255,255,0.04)",
            padding: "4px 12px",
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          Session: {sessionId}
        </span>

        {/* Right */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <div
              className="pulse-dot"
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#10B981",
              }}
            />
            <span style={{ color: "#10B981", fontSize: "0.8rem" }}>Live</span>
          </div>
          <a
            href={`/call?session=${sessionId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#3B82F6",
              fontSize: "0.8rem",
              textDecoration: "none",
              border: "1px solid rgba(59,130,246,0.4)",
              padding: "6px 14px",
              borderRadius: "8px",
            }}
          >
            Open Customer View ↗
          </a>
        </div>
      </nav>

      {/* Main Grid */}
      <div
        style={{
          padding: "24px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
        }}
      >
        {/* ── LEFT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Transcript Card */}
          <div className="glass-card" style={{ padding: "20px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "12px",
              }}
            >
              <div
                className="pulse-dot"
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#10B981",
                }}
              />
              <span
                style={{
                  color: "#F9FAFB",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                }}
              >
                Live Transcript
              </span>
            </div>
            <div
              ref={transcriptBoxRef}
              style={{
                background: "#0D1117",
                borderRadius: "8px",
                height: "300px",
                overflowY: "auto",
                padding: "12px",
                fontFamily: "monospace",
                fontSize: "0.8rem",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
              }}
              className="terminal-text"
            >
              {transcript ||
                "> Waiting for customer to speak...\n> Polling every 3 seconds..."}
            </div>
            <p
              style={{
                color: "#9CA3AF",
                fontSize: "0.75rem",
                margin: "10px 0 0",
                textAlign: "right",
              }}
            >
              {wordCount} words captured
            </p>
          </div>

          {/* KYC Extracted Data Card */}
          <div className="glass-card" style={{ padding: "20px" }}>
            <h3
              style={{
                color: "#F9FAFB",
                fontSize: "0.95rem",
                fontWeight: 600,
                margin: "0 0 16px",
              }}
            >
              Auto-Extracted KYC Data
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {kycRow(
                  "Monthly Income",
                  kycForm?.applicant_income
                    ? `₹${Number(kycForm.applicant_income).toLocaleString("en-IN")}`
                    : null
                )}
                {kycRow("Employment Type", kycForm?.employment_type)}
                {kycRow("Loan Purpose", kycForm?.purpose_of_loan)}
                {kycRow("Verbal Consent", kycForm?.verbal_consent, true)}
              </tbody>
            </table>
            <p
              style={{
                color: "#6B7280",
                fontSize: "0.75rem",
                margin: "12px 0 0",
                fontStyle: "italic",
              }}
            >
              Auto-filled by AI
            </p>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* AI Signals 2x2 Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "16px",
            }}
          >
            {/* Age Card */}
            <div className="glass-card" style={{ padding: "18px" }}>
              <div
                style={{
                  color: "#9CA3AF",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "10px",
                }}
              >
                Age Verification
              </div>
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: 800,
                  color: "#F9FAFB",
                  lineHeight: 1,
                  marginBottom: "4px",
                }}
              >
                {ageEstimate || "--"}
              </div>
              <div
                style={{
                  color: "#9CA3AF",
                  fontSize: "0.75rem",
                  marginBottom: "10px",
                }}
              >
                Declared: 30
              </div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 10px",
                  borderRadius: "999px",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  background: ageMismatch
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(16,185,129,0.15)",
                  border: ageMismatch
                    ? "1px solid rgba(239,68,68,0.3)"
                    : "1px solid rgba(16,185,129,0.3)",
                  color: ageMismatch ? "#EF4444" : "#10B981",
                }}
              >
                {ageMismatch ? "Mismatch" : "Match"}
              </span>
            </div>

            {/* Emotion Card */}
            <div className="glass-card" style={{ padding: "18px" }}>
              <div
                style={{
                  color: "#9CA3AF",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "10px",
                }}
              >
                Emotional State
              </div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#F9FAFB",
                  textTransform: "capitalize",
                  marginBottom: "12px",
                }}
              >
                {emotion}
              </div>
              <div
                style={{
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: "999px",
                  height: "6px",
                  overflow: "hidden",
                  marginBottom: "6px",
                }}
              >
                <div
                  style={{
                    width: `${stressScore * 100}%`,
                    height: "100%",
                    background: stressColor(stressScore),
                    borderRadius: "999px",
                    transition: "width 0.5s ease, background-color 0.5s ease",
                  }}
                />
              </div>
              <div style={{ color: "#9CA3AF", fontSize: "0.7rem" }}>
                Stress Level: {Math.round(stressScore * 100)}%
              </div>
            </div>

            {/* Liveness Card */}
            <div className="glass-card" style={{ padding: "18px" }}>
              <div
                style={{
                  color: "#9CA3AF",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "10px",
                }}
              >
                Liveness Check
              </div>
              <div
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: isLive === true ? "#10B981" : (isLive === false && ageEstimate > 0 ? "#EF4444" : "#9CA3AF"),
                  marginBottom: "6px",
                }}
              >
                {isLive === true ? "LIVE" : (isLive === false && ageEstimate > 0 ? "SPOOFED" : "Detecting...")}
              </div>
              <div style={{ color: "#9CA3AF", fontSize: "0.75rem", marginBottom: "4px" }}>
                Looking forward
              </div>
              <div style={{ color: "#6B7280", fontSize: "0.7rem" }}>
                95% confidence
              </div>
            </div>

            {/* Location Card */}
            <div className="glass-card" style={{ padding: "18px" }}>
              <div
                style={{
                  color: "#9CA3AF",
                  fontSize: "0.7rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "10px",
                }}
              >
                Location Check
              </div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#F9FAFB",
                  marginBottom: "4px",
                }}
              >
                {geoData.browser_city || "Unknown"}
              </div>
              <div
                style={{
                  color: "#9CA3AF",
                  fontSize: "0.75rem",
                  marginBottom: "8px",
                }}
              >
                IP: {geoData.ip_city || "Unknown"}
              </div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 10px",
                  borderRadius: "999px",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  background: geoData.fraud_flag
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(16,185,129,0.15)",
                  border: geoData.fraud_flag
                    ? "1px solid rgba(239,68,68,0.3)"
                    : "1px solid rgba(16,185,129,0.3)",
                  color: geoData.fraud_flag ? "#EF4444" : "#10B981",
                }}
              >
                {geoData.fraud_flag ? "Fraud Flag" : "Verified"}
              </span>
            </div>
          </div>

          {/* Fraud Flags Card */}
          <div className="glass-card" style={{ padding: "20px" }}>
            <h3
              style={{
                color: "#F9FAFB",
                fontSize: "0.95rem",
                fontWeight: 600,
                margin: "0 0 16px",
              }}
            >
              ⚠ Risk Signals
            </h3>
            {fraudFlags.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "8px",
                  padding: "16px 0",
                }}
              >
                <span style={{ fontSize: "2rem" }}>✅</span>
                <span style={{ color: "#10B981", fontSize: "0.875rem" }}>
                  No fraud detected
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {fraudFlags.map((flag, i) => (
                  <div
                    key={i}
                    style={{
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.25)",
                      borderRadius: "8px",
                      padding: "8px 14px",
                      color: "#EF4444",
                      fontSize: "0.8rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    ⚠ {flag}
                  </div>
                ))}
                <p
                  style={{
                    color: "#EF4444",
                    fontSize: "0.8rem",
                    margin: "4px 0 0",
                    fontWeight: 600,
                  }}
                >
                  {fraudFlags.length} risk signal
                  {fraudFlags.length !== 1 ? "s" : ""} detected
                </p>
              </div>
            )}
          </div>

          {/* Offer Preview Card */}
          <div className="glass-card" style={{ padding: "20px" }}>
            <h3
              style={{
                color: "#F9FAFB",
                fontSize: "0.95rem",
                fontWeight: 600,
                margin: "0 0 16px",
              }}
            >
              Generated Offer
            </h3>
            {!offer ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "12px",
                  padding: "16px 0",
                }}
              >
                <div
                  className="spinner"
                  style={{ width: "28px", height: "28px" }}
                />
                <span style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>
                  Waiting for call to complete...
                </span>
              </div>
            ) : (
              <div
                style={{
                  background: "rgba(16,185,129,0.06)",
                  border: "1px solid rgba(16,185,129,0.2)",
                  borderRadius: "12px",
                  padding: "18px",
                }}
              >
                <div
                  style={{
                    fontSize: "2rem",
                    fontWeight: 800,
                    color: "#F9FAFB",
                    marginBottom: "4px",
                  }}
                >
                  ₹{Number(offer.loan_amount || 0).toLocaleString("en-IN")}
                </div>
                <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>
                  {offer.interest_rate}% p.a.
                </div>
                <div style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>
                  ₹{Number(offer.emi || 0).toLocaleString("en-IN")}/month
                </div>
                <div style={{ marginTop: "12px" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      padding: "3px 12px",
                      borderRadius: "999px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      background:
                        offer.decision === "Approved"
                          ? "rgba(16,185,129,0.15)"
                          : "rgba(245,158,11,0.15)",
                      border:
                        offer.decision === "Approved"
                          ? "1px solid rgba(16,185,129,0.3)"
                          : "1px solid rgba(245,158,11,0.3)",
                      color:
                        offer.decision === "Approved" ? "#10B981" : "#F59E0B",
                    }}
                  >
                    {offer.decision || "Unknown"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
