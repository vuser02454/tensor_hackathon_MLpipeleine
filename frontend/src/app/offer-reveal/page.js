"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import api, { m2api } from "../../../lib/api";
import { useSessionStore } from "../../store/useSessionStore";

const DEMO_RISK_SCORE = 0.3;
const DEMO_BUREAU_SCORE = 720;
const LOAN_TENURE_MONTHS = 36;

function formatINR(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export default function OfferRevealPage() {
  const searchParams = useSearchParams();
  const sessionId =
    searchParams.get("session_id") || searchParams.get("session") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offer, setOffer] = useState(null);
  const [animatedAmount, setAnimatedAmount] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const setSessionId = useSessionStore((state) => state.setSessionId);
  const setOfferStore = useSessionStore((state) => state.setOffer);

  const explanation = useMemo(
    () => offer?.decision_explanation || offer?.explanation || "No explanation available.",
    [offer],
  );

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      setError("Missing session ID in URL.");
      return;
    }

    let cancelled = false;
    setSessionId(sessionId);

    const fetchAndGenerateOffer = async () => {
      try {
        setLoading(true);
        setError("");

        const sessionResponse = await m2api.get(`/api/session/${sessionId}`);
        const session = sessionResponse?.data || {};
        const kycForm = session?.kyc_form || {};

        const offerResponse = await api.post("/generate-offer", {
          risk_score: DEMO_RISK_SCORE,
          bureau_score: DEMO_BUREAU_SCORE,
          income: Number(kycForm.applicant_income || 0),
          purpose: kycForm.purpose_of_loan || "",
        });

        if (!cancelled) {
          const generated = offerResponse?.data || null;
          setOffer(generated);
          setOfferStore(generated || {});
          await m2api.put("/api/session/update", {
            session_id: sessionId,
            offer: generated || {},
            decision: generated?.decision || "",
            decision_reason: generated?.decision_explanation || generated?.explanation || "",
          });
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError?.response?.data?.detail ||
              "Could not reveal offer. Please try again.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAndGenerateOffer();

    return () => {
      cancelled = true;
    };
  }, [sessionId, setOfferStore, setSessionId]);

  useEffect(() => {
    if (!offer?.loan_amount) {
      setAnimatedAmount(0);
      return;
    }

    let animationFrame;
    const target = Number(offer.loan_amount);
    const duration = 1400;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      setAnimatedAmount(Math.round(target * progress));
      if (progress < 1) {
        animationFrame = requestAnimationFrame(tick);
      }
    };

    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [offer?.loan_amount]);

  const handleAcceptOffer = async () => {
    if (!sessionId || !offer) return;
    setAccepting(true);
    try {
      await m2api.put("/api/session/update", {
        session_id: sessionId,
        status: "accepted",
      });
      setAccepted(true);
    } catch (acceptError) {
      setError(
        acceptError?.response?.data?.detail ||
          "Could not accept offer. Please try again.",
      );
    } finally {
      setAccepting(false);
    }
  };

  const isApproved = String(offer?.decision || "").toLowerCase() === "approved";

  return (
    <div className="min-h-screen bg-white px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <main className="mx-auto w-full max-w-3xl">
        <section className="animate-[fadeIn_500ms_ease-out] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-center text-xl font-semibold text-slate-900 sm:text-2xl">
            Your Personalized Loan Offer
          </h1>

          {loading && (
            <p className="mt-8 text-center text-sm text-slate-600">
              Revealing your offer...
            </p>
          )}

          {!loading && error && (
            <p className="mt-8 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {!loading && !error && offer && (
            <>
              <div className="mt-8 text-center">
                <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                  Eligible Loan Amount
                </p>
                <p className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                  ₹{formatINR(animatedAmount)}
                </p>
              </div>

              <div className="mt-6 grid gap-3 text-center sm:grid-cols-2 sm:text-left">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">Interest Rate</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {offer.interest_rate}% per annum
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">EMI</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    EMI: ₹{formatINR(offer.emi)}/month for {LOAN_TENURE_MONTHS} months
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-center">
                <span
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    isApproved
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {isApproved ? "✅ APPROVED" : "❌ Rejected"}
                </span>
              </div>

              <p className="mt-4 text-center text-sm text-slate-700">{explanation}</p>

              <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-base font-semibold text-slate-900">Why this offer?</h2>
                <p className="mt-2 text-sm text-slate-700">{explanation}</p>
              </section>

              <button
                type="button"
                onClick={handleAcceptOffer}
                disabled={accepting || accepted}
                className="mt-8 w-full rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {accepted ? "Offer Accepted ✓" : accepting ? "Accepting..." : "Accept Offer"}
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
