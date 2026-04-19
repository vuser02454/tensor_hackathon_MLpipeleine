"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSessionStore from "../../store/sessionStore";

// ─── Confetti piece ───────────────────────────────────────────────────────────
// Pieces are generated once in a ref to avoid hydration mismatch from Math.random()
function Confetti({ active }) {
  const piecesRef = useRef(null);
  if (!piecesRef.current) {
    piecesRef.current = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      color: ["#F5C842", "#3B82F6", "#10B981", "#8B5CF6", "#F472B6"][
        Math.floor(Math.random() * 5)
      ],
      delay: `${Math.random() * 1.5}s`,
      duration: `${2 + Math.random() * 2}s`,
      size: `${6 + Math.random() * 8}px`,
    }));
  }
  const pieces = piecesRef.current;

  if (!active) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 50,
      }}
    >
      {pieces.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: p.left,
            top: "-20px",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: p.color,
            animation: `confettiFall ${p.duration} ${p.delay} ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Success checkmark SVG ────────────────────────────────────────────────────
function SuccessCircle() {
  return (
    <svg width="80" height="80" viewBox="0 0 100 100">
      <circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        stroke="#10B981"
        strokeWidth="4"
        strokeDasharray="283"
        strokeDashoffset="283"
        strokeLinecap="round"
        style={{ animation: "drawCircle 0.8s ease forwards" }}
      />
      <polyline
        points="30,50 44,64 70,36"
        fill="none"
        stroke="#10B981"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="100"
        strokeDashoffset="100"
        style={{ animation: "drawCheck 0.6s ease forwards 0.5s", opacity: 0 }}
      />
    </svg>
  );
}

// ─── Count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target, duration = 2000) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) return;
    const steps = 100;
    const increment = target / steps;
    const interval = duration / steps;
    let current = 0;
    const t = setInterval(() => {
      current += increment;
      if (current >= target) {
        setValue(target);
        clearInterval(t);
      } else {
        setValue(Math.floor(current));
      }
    }, interval);
    return () => clearInterval(t);
  }, [target, duration]);
  return value;
}

function OfferRevealPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionId, setSessionId] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSessionId(searchParams.get("session") || "");
  }, [searchParams]);

  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [riskScore, setRiskScore] = useState(0.3);
  const [cleanIncome, setCleanIncome] = useState(45000);

  const displayAmount = useCountUp(offer?.loan_amount || 0);

  const fetchOffer = async (score = 0.3) => {
    setLoading(true);
    let income = 45000;
    let purpose = "Personal Loan";

    try {
      const res = await fetch(
        "http://localhost:8001/api/session/" + sessionId
      );
      const session = await res.json();
      
      console.log("Session data:", session);
      console.log("KYC form:", session.kyc_form);
      
      if (session.kyc_form?.applicant_income) {
        const parsed = parseInt(
          String(session.kyc_form.applicant_income).replace(/[^0-9]/g, '')
        );
        if (!isNaN(parsed) && parsed > 1000) {
          income = parsed;
        }
      }
      
      if (session.kyc_form?.purpose_of_loan) {
        purpose = session.kyc_form.purpose_of_loan;
      }
    } catch(e) {
      console.log("Session fetch error:", e);
    }

    console.log("Using income:", income);
    console.log("Using purpose:", purpose);
    setCleanIncome(income);

    try {
      const offerRes = await fetch("http://localhost:8000/generate-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          risk_score: score,
          bureau_score: 720,
          income: income,
          purpose,
        }),
      });
      const data = await offerRes.json();
      setOffer(data);
      if (data.decision === "Approved") {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
      }
    } catch (_) {
      // Fallback offer for demo purposes
      const fallback = {
        loan_amount: 350000,
        interest_rate: 12.5,
        tenure_months: 36,
        emi: 11700,
        decision: "Approved",
        explanation:
          "Based on your income profile and clean credit history, you qualify for this pre-approved offer at a competitive interest rate.",
      };
      setOffer(fallback);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) fetchOffer(riskScore);
    // eslint-disable-next-line
  }, [sessionId]);

  const handleAccept = async () => {
    try {
      await fetch("http://localhost:8001/api/session/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, status: "accepted" }),
      });
    } catch (_) {}
    setAccepted(true);
  };

  const handleRecalculate = async () => {
    const newScore = Math.max(0, riskScore - 0.1);
    setRiskScore(newScore);
    await fetchOffer(newScore);
  };

  if (!mounted) return null;

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0A0F1E",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        <div
          className="spinner"
          style={{ width: "48px", height: "48px", borderWidth: "3px" }}
        />
        <p style={{ color: "#9CA3AF", fontSize: "1rem" }}>
          Generating your offer...
        </p>
      </div>
    );
  }

  const isApproved = offer?.decision === "Approved";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0F1E",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "40px 20px",
        position: "relative",
      }}
    >
      <Confetti active={showConfetti} />

      {/* Success Animation */}
      <div style={{ marginBottom: "24px" }} className="animate-fade-in-up">
        <SuccessCircle />
      </div>

      {/* Header */}
      <h1
        style={{
          fontSize: "clamp(1.75rem, 5vw, 2.5rem)",
          fontWeight: 800,
          color: "#F5C842",
          margin: "0 0 8px",
          letterSpacing: "-0.02em",
          textAlign: "center",
        }}
        className="animate-fade-in-up"
      >
        Congratulations! 🎉
      </h1>
      <p
        style={{
          color: "#9CA3AF",
          fontSize: "1.1rem",
          margin: "0 0 40px",
          textAlign: "center",
        }}
      >
        Your loan offer is ready
      </p>

      {/* Main Offer Card */}
      <div
        className="glass-card animate-fade-in-up"
        style={{ width: "100%", maxWidth: "520px", padding: "36px", marginBottom: "20px" }}
      >
        <p
          style={{
            color: "#9CA3AF",
            fontSize: "0.8rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: "0 0 8px",
          }}
        >
          Loan Amount
        </p>

        <div
          style={{
            fontSize: "clamp(2.5rem, 8vw, 4rem)",
            fontWeight: 900,
            color: "#F9FAFB",
            letterSpacing: "-0.03em",
            marginBottom: "8px",
            lineHeight: 1,
            textAlign: "center"
          }}
        >
          ₹{displayAmount.toLocaleString("en-IN")}
        </div>
        <div style={{ color: "#9CA3AF", fontSize: "0.85rem", textAlign: "center", marginBottom: "28px" }}>
          Based on monthly income: <br/>
          ₹{cleanIncome.toLocaleString('en-IN')}
        </div>

        <hr
          style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "0 0 24px" }}
        />

        {/* 3 detail boxes */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          {[
            { value: `${offer?.interest_rate}%`, label: "Interest p.a." },
            { value: `${offer?.tenure_months || 36}`, label: "Months tenure" },
            {
              value: `₹${Number(offer?.emi || 0).toLocaleString("en-IN")}`,
              label: "Monthly EMI",
            },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: "rgba(255,255,255,0.04)",
                borderRadius: "12px",
                padding: "14px",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  fontSize: "1.4rem",
                  fontWeight: 800,
                  color: "#F9FAFB",
                  marginBottom: "4px",
                }}
              >
                {item.value}
              </div>
              <div style={{ color: "#9CA3AF", fontSize: "0.75rem" }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>

        <hr
          style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.08)", margin: "0 0 24px" }}
        />

        {/* Decision Badge */}
        <div style={{ textAlign: "center" }}>
          {isApproved ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(16,185,129,0.15)",
                border: "1px solid rgba(16,185,129,0.4)",
                color: "#10B981",
                padding: "10px 28px",
                borderRadius: "999px",
                fontWeight: 700,
                fontSize: "1rem",
                animation: "pulse-dot 2s ease-in-out infinite",
              }}
            >
              ✓ APPROVED
            </span>
          ) : (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(245,158,11,0.15)",
                border: "1px solid rgba(245,158,11,0.4)",
                color: "#F59E0B",
                padding: "10px 28px",
                borderRadius: "999px",
                fontWeight: 700,
                fontSize: "1rem",
              }}
            >
              ⏳ UNDER REVIEW
            </span>
          )}
        </div>
      </div>

      {/* Explainability Card */}
      <div
        className="glass-card"
        style={{
          width: "100%",
          maxWidth: "520px",
          padding: "24px",
          marginBottom: "20px",
          background: "rgba(255,255,255,0.03)",
        }}
      >
        <h3
          style={{
            color: "#F9FAFB",
            margin: "0 0 12px",
            fontSize: "0.95rem",
            fontWeight: 600,
          }}
        >
          💡 Why this offer?
        </h3>
        <p style={{ color: "#9CA3AF", fontSize: "0.875rem", margin: 0, lineHeight: 1.7 }}>
          {offer?.explanation ||
            "Based on your income profile and clean credit history, you qualify for this pre-approved offer at a competitive interest rate."}
        </p>
      </div>

      {/* Negotiation Card (only if approved) */}
      {isApproved && (
        <div
          className="glass-card"
          style={{
            width: "100%",
            maxWidth: "520px",
            padding: "24px",
            marginBottom: "24px",
          }}
        >
          <h3
            style={{
              color: "#F9FAFB",
              margin: "0 0 8px",
              fontSize: "0.95rem",
              fontWeight: 600,
            }}
          >
            Want a better rate?
          </h3>
          <p
            style={{
              color: "#9CA3AF",
              fontSize: "0.875rem",
              margin: "0 0 16px",
            }}
          >
            Add a co-applicant and your interest rate drops by 1.5%
          </p>
          <button
            onClick={handleRecalculate}
            style={{
              padding: "8px 20px",
              border: "1px solid rgba(59,130,246,0.5)",
              borderRadius: "8px",
              background: "transparent",
              color: "#3B82F6",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(59,130,246,0.1)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            Recalculate →
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
        }}
      >
        {!accepted ? (
          <>
            <button
              id="accept-offer-btn"
              onClick={handleAccept}
              className="btn-gradient"
              style={{
                width: "100%",
                padding: "16px",
                fontSize: "1rem",
                fontWeight: 700,
                background: "linear-gradient(135deg, #10B981, #059669)",
              }}
            >
              Accept This Offer →
            </button>
            <button
              style={{
                background: "transparent",
                border: "none",
                color: "#9CA3AF",
                fontSize: "0.875rem",
                cursor: "pointer",
                padding: "4px",
              }}
              onClick={() => router.push("/")}
            >
              Not interested
            </button>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "24px" }}>
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "#10B981",
                marginBottom: "8px",
              }}
            >
              ✓ Application Submitted!
            </div>
            <p style={{ color: "#9CA3AF", margin: 0, fontSize: "0.9rem" }}>
              Our team will contact you within 24 hours
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OfferRevealPage() {
  return (
    <Suspense fallback={<div style={{ background: '#0A0F1E', minHeight: '100vh' }} />}>
      <OfferRevealPageContent />
    </Suspense>
  );
}
