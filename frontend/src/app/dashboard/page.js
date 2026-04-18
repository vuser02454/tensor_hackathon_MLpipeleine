"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { m2api } from "../../../lib/api";
import { useSessionStore } from "../../store/useSessionStore";

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "-";
  return `₹${new Intl.NumberFormat("en-IN").format(Number(value))}`;
}

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const sessionId =
    searchParams.get("session_id") || searchParams.get("session") || "";

  const [sessionData, setSessionData] = useState(null);
  const setSessionId = useSessionStore((state) => state.setSessionId);
  const setTranscript = useSessionStore((state) => state.setTranscript);
  const setAgeData = useSessionStore((state) => state.setAgeData);
  const setEmotionData = useSessionStore((state) => state.setEmotionData);
  const setGeoData = useSessionStore((state) => state.setGeoData);
  const setFraudFlags = useSessionStore((state) => state.setFraudFlags);
  const setKycForm = useSessionStore((state) => state.setKycForm);
  const setOffer = useSessionStore((state) => state.setOffer);

  const [error, setError] = useState("");
  const [isVideoLive, setIsVideoLive] = useState(false);

  const transcriptBoxRef = useRef(null);
  const wsRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const videoContainerRef = useRef(null);
  const agoraClientRef = useRef(null);
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });

  const transcript = sessionData?.transcript || "";
  const fraudFlags = sessionData?.fraud_flags || [];
  const kycForm = sessionData?.kyc_form || {};
  const geoData = sessionData?.geo_data || {};
  const offer = sessionData?.offer || {};

  const age = sessionData?.age_estimate ?? sessionData?.ageCheck?.estimated_age ?? "-";
  const ageMatch =
    sessionData?.age_match ??
    sessionData?.ageCheck?.match ??
    sessionData?.age_check?.match ??
    null;
  const emotion = sessionData?.emotion ?? sessionData?.emotion_data?.emotion ?? "-";
  const stressScore = Number(
    sessionData?.stress_score ?? sessionData?.emotion_data?.stress_score ?? 0,
  );
  const isLiveHuman =
    sessionData?.liveness?.is_live ?? sessionData?.is_live ?? sessionData?.is_live_human;
  const headPose = sessionData?.liveness?.head_pose ?? sessionData?.head_pose ?? "-";

  const offerDecision = offer?.decision || sessionData?.decision || "-";
  const offerReason = offer?.explanation || sessionData?.decision_reason || "-";

  const fetchSession = async () => {
    if (!sessionId) return;
    try {
      const response = await m2api.get(`/api/session/${sessionId}`);
      const data = response?.data || null;
      setSessionData(data);
      if (data) {
        setSessionId(sessionId);
        setTranscript(data?.transcript || "");
        setAgeData({
          ageEstimate: Number(data?.age_estimate || 0),
          ageMismatch: data?.age_match === false,
        });
        setEmotionData({
          emotion: data?.emotion || "",
          stressScore: Number(data?.stress_score || 0),
        });
        setGeoData(data?.geo_data || { browser_city: "", ip_city: "", fraud_flag: false });
        setFraudFlags(data?.fraud_flags || []);
        setKycForm(data?.kyc_form || {});
        setOffer(data?.offer || {});
      }
      setError("");
    } catch (fetchError) {
      setError(
        fetchError?.response?.data?.detail ||
          "Could not load session data. Retrying...",
      );
    }
  };

  useEffect(() => {
    if (!sessionId) {
      setError("Missing session query param. Open /dashboard?session={id}");
      return;
    }

    fetchSession();
    pollIntervalRef.current = window.setInterval(fetchSession, 3000);

    return () => {
      if (pollIntervalRef.current) {
        window.clearInterval(pollIntervalRef.current);
      }
    };
  }, [
    sessionId,
    setAgeData,
    setEmotionData,
    setFraudFlags,
    setGeoData,
    setKycForm,
    setOffer,
    setSessionId,
    setTranscript,
  ]);

  useEffect(() => {
    if (!sessionId) return;

    let closedByUnmount = false;

    try {
      wsRef.current = new WebSocket(`ws://localhost:8001/ws/${sessionId}`);
      wsRef.current.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload && typeof payload === "object") {
            setSessionData((prev) => ({ ...(prev || {}), ...payload }));
          }
        } catch {
          // Ignore malformed socket payloads and continue polling.
        }
      };
      wsRef.current.onerror = () => {
        // Polling remains the fallback.
      };
      wsRef.current.onclose = () => {
        if (!closedByUnmount) {
          // Polling remains active.
        }
      };
    } catch {
      // Polling remains the fallback.
    }

    return () => {
      closedByUnmount = true;
      if (wsRef.current && wsRef.current.readyState <= 1) {
        wsRef.current.close();
      }
    };
  }, [sessionId]);

  useEffect(() => {
    if (!transcriptBoxRef.current) return;
    transcriptBoxRef.current.scrollTop = transcriptBoxRef.current.scrollHeight;
  }, [transcript]);

  useEffect(() => {
    let cancelled = false;

    const startAgora = async () => {
      const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
      if (!appId) return;

      try {
        const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        agoraClientRef.current = client;

        await client.join(appId, "loan-onboarding", null, null);
        const [, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        localTracksRef.current.videoTrack = videoTrack;

        await client.publish([videoTrack]);
        if (!cancelled && videoContainerRef.current) {
          videoTrack.play(videoContainerRef.current);
          setIsVideoLive(true);
        }
      } catch {
        setIsVideoLive(false);
      }
    };

    startAgora();

    return () => {
      cancelled = true;
      setIsVideoLive(false);
      const { audioTrack, videoTrack } = localTracksRef.current;
      if (audioTrack) audioTrack.close();
      if (videoTrack) videoTrack.close();
      if (agoraClientRef.current) {
        agoraClientRef.current.leave().catch(() => undefined);
      }
    };
  }, []);

  const stressWidth = useMemo(() => {
    const pct = Math.max(0, Math.min(100, Math.round(stressScore * 100)));
    return `${pct}%`;
  }, [stressScore]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-5 text-slate-900 sm:px-6 lg:px-8">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 lg:flex-row">
        <section className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:w-2/5">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-lg font-semibold">Live Video Feed</h1>
            <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
              LIVE
            </span>
          </div>
          <div
            ref={videoContainerRef}
            className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-slate-900"
          />
          {!isVideoLive && (
            <p className="mt-2 text-xs text-slate-500">
              Waiting for camera stream...
            </p>
          )}
        </section>

        <section className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:w-3/5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Live Data</h2>
            <p className="text-xs text-slate-500">Session: {sessionId || "-"}</p>
          </div>

          {error && (
            <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="mb-2 text-sm font-semibold">Live Transcript</h3>
              <div
                ref={transcriptBoxRef}
                className="h-28 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 text-sm leading-6 text-slate-800"
              >
                {transcript || "Transcript will appear here..."}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">AI Analysis</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Age</p>
                  <p className="mt-1 text-sm font-semibold">Estimated Age: {String(age)}</p>
                  <span
                    className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${
                      ageMatch === false
                        ? "bg-red-100 text-red-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {ageMatch === false ? "Mismatch" : "Match"}
                  </span>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Emotion</p>
                  <p className="mt-1 text-sm font-semibold">Emotion: {String(emotion)}</p>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-amber-500"
                      style={{ width: stressWidth }}
                    />
                  </div>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Liveness</p>
                  <p className="mt-1 text-sm font-semibold">
                    Live Human: {isLiveHuman ? "✅" : "❌"}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">Head pose: {String(headPose)}</p>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-500">Location</p>
                  <p className="mt-1 text-sm font-semibold">
                    Location: {geoData?.browser_city || "-"}
                  </p>
                  <span
                    className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-medium ${
                      geoData?.fraud_flag
                        ? "bg-red-100 text-red-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {geoData?.fraud_flag ? "Fraud risk" : "Verified"}
                  </span>
                </article>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="mb-2 text-sm font-semibold">Fraud Flags</h3>
              <div className="flex flex-wrap gap-2">
                {fraudFlags.length > 0 ? (
                  fraudFlags.map((flag, idx) => (
                    <span
                      key={`${flag}-${idx}`}
                      className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700"
                    >
                      {String(flag)}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    ✅ No fraud detected
                  </span>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="mb-2 text-sm font-semibold">KYC Auto-Fill Preview</h3>
              <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-500">Income</td>
                      <td className="px-3 py-2 font-medium">
                        {formatCurrency(kycForm?.applicant_income)}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-500">Employment</td>
                      <td className="px-3 py-2 font-medium">
                        {kycForm?.employment_type || "-"}
                      </td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-500">Purpose</td>
                      <td className="px-3 py-2 font-medium">
                        {kycForm?.purpose_of_loan || "-"}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-slate-500">Consent</td>
                      <td className="px-3 py-2 font-medium">
                        {kycForm?.verbal_consent ? "Given" : "Not captured"}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 className="mb-2 text-sm font-semibold">Explainability Panel</h3>
              <p className="text-sm">
                Decision:{" "}
                <span className="font-semibold">{String(offerDecision || "-")}</span>
              </p>
              <p className="mt-1 text-sm text-slate-700">{String(offerReason || "-")}</p>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
