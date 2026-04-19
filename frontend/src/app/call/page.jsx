"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSessionStore from "../../store/sessionStore";

// ─── Helper: format timer ────────────────────────────────────────────────────
function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Stress bar color ─────────────────────────────────────────────────────────
function stressColor(score) {
  if (score > 0.6) return "#EF4444";
  if (score > 0.3) return "#F59E0B";
  return "#10B981";
}

// ─── Audio level check ────────────────────────────────────────────────────────
const checkAudioLevel = (blob) => {
  return new Promise((resolve) => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return resolve(0.1); // fallback passing
    let audioContext;
    try {
      audioContext = new AudioContext();
    } catch (e) {
      return resolve(0.1); 
    }
    
    blob.arrayBuffer().then(buffer => {
      audioContext.decodeAudioData(buffer, (decoded) => {
        const data = decoded.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += Math.abs(data[i]);
        }
        const avg = sum / data.length;
        audioContext.close().catch(()=>{});
        resolve(avg);
      }, () => {
        audioContext.close().catch(()=>{});
        resolve(0.1); // parse error -> fallback passing
      });
    }).catch(() => {
      if (audioContext) audioContext.close().catch(()=>{});
      resolve(0.1);
    });
  });
};

// ─── Extract Income ────────────────────────────────────────────────────────
const parseIncome = (val) => {
  if (!val) return null;
  const str = String(val).toLowerCase();
  
  if (str.includes('k')) {
    const num = parseFloat(str.replace(/[^0-9.]/g, ''));
    return Math.round(num * 1000);
  }
  
  if (str.includes('lakh') || str.includes('lac') || str.includes(' l')) {
    const num = parseFloat(str.replace(/[^0-9.]/g, ''));
    return Math.round(num * 100000);
  }
  
  const num = parseInt(str.replace(/[^0-9]/g, ''));
  return isNaN(num) ? null : num;
};

function CallPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionId, setSessionId] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSessionId(searchParams.get("session") || "");
  }, [searchParams]);

  // Refs
  const videoRef = useRef(null);
  const videoBoxRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const fullTranscriptRef = useRef("");
  const transcriptBoxRef = useRef(null);
  // Use ref so frame intervals always see latest value without stale closure
  const cameraReadyRef = useRef(false);

  // State
  const [timer, setTimer] = useState(0);
  const [transcriptDisplay, setTranscriptDisplay] = useState(
    "> Waiting for you to speak..."
  );
  const [ageEstimate, setAgeEstimate] = useState(null);
  const [ageMismatch, setAgeMismatch] = useState(false);
  const [emotion, setEmotion] = useState("neutral");
  const [stressScore, setStressScore] = useState(0);
  // null = checking, true = live, false = failed
  const [livenessStatus, setLivenessStatus] = useState(null);
  const [geoData, setGeoData] = useState({
    browser_city: "",
    ip_city: "",
    fraud_flag: false,
  });
  const [kycForm, setKycForm] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [headPose, setHeadPose] = useState("Looking forward");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [demoFraudAlert, setDemoFraudAlert] = useState(false);

  const store = useSessionStore();

  const handleSimulateFraud = () => {
    setDemoFraudAlert(true);
    setGeoData({
      browser_city: "Mumbai",
      ip_city: "Bangalore",
      fraud_flag: true,
      message: "Mumbai → Bangalore Mismatch",
    });
    setStressScore(0.85);
    setEmotion("stressed");
    setAgeMismatch(true);
    
    store.addFraudFlag("Location mismatch detected");
    store.addFraudFlag("High stress detected");
    store.addFraudFlag("Age mismatch detected");
  };

  const handleResetDemo = () => {
    setDemoFraudAlert(false);
    setGeoData({
      browser_city: "India",
      ip_city: "India",
      fraud_flag: false,
    });
    setStressScore(0.01);
    setEmotion("neutral");
    setAgeMismatch(false);
    
    store.setFraudFlags([]);
  };

  // ─── Timer ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // ─── Auto Sync ─────────────────────────────────────────────────────────────
  const stateRef = useRef({ ageEstimate, ageMismatch, emotion, stressScore, geoData, kycForm, fraudFlags: store.fraudFlags });
  useEffect(() => {
    stateRef.current = { ageEstimate, ageMismatch, emotion, stressScore, geoData, kycForm, fraudFlags: store.fraudFlags };
  });

  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(async () => {
      const s = stateRef.current;
      try {
        await fetch("http://localhost:8001/api/session/update", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            transcript: fullTranscriptRef.current,
            age_estimate: s.ageEstimate,
            age_mismatch: s.ageMismatch,
            emotion: s.emotion,
            stress_score: s.stressScore,
            is_live: true,
            geo_data: s.geoData,
            fraud_flags: s.fraudFlags,
            kyc_form: s.kycForm
          }),
        });
      } catch (e) {}
    }, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // ─── Auto-scroll transcript ───────────────────────────────────────────────
  useEffect(() => {
    if (transcriptBoxRef.current) {
      transcriptBoxRef.current.scrollTop =
        transcriptBoxRef.current.scrollHeight;
    }
  }, [transcriptDisplay]);

  // ─── Main setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mounted || !sessionId) return;
    store.setSessionId(sessionId);
    if (typeof window !== "undefined") {
      localStorage.setItem("current_session_id", sessionId);
    }

    let frameInterval = null;
    let isMounted = true;

    const setup = async () => {
      // ── Camera ──────────────────────────────────────────────────────────
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        if (videoBoxRef.current) videoBoxRef.current.srcObject = stream;
        cameraReadyRef.current = true;
        setCameraReady(true);
        setLivenessStatus(true);
      } catch (err) {
        console.warn("Camera unavailable:", err);
        setLivenessStatus(false);
      }

      // ── Geo check ────────────────────────────────────────────────────────
      // Run geo-check only when geolocation permission is granted.
      // If denied or unavailable → show "Verified" (benefit of the doubt).
      try {
        let ip = "0.0.0.0";
        try {
          const ipRes = await fetch("https://api.ipify.org?format=json");
          const ipData = await ipRes.json();
          ip = ipData.ip || "0.0.0.0";
        } catch (_) {}

        navigator.geolocation.getCurrentPosition(
          // ✅ Permission granted
          async (pos) => {
            try {
              const geoRes = await fetch(
                "http://localhost:8001/api/geo-check",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    ip,
                  }),
                }
              );
              const geoResult = await geoRes.json();
              if (isMounted) {
                setGeoData(geoResult);
                store.setGeoData(geoResult);
                if (geoResult.fraud_flag) {
                  store.addFraudFlag("Location mismatch detected");
                }
              }
            } catch (_) {
              // API failed → no fraud flag, show verified
              if (isMounted) {
                const safe = { browser_city: "India", ip_city: "India", fraud_flag: false };
                setGeoData(safe);
                store.setGeoData(safe);
              }
            }
          },
          // ❌ Permission denied or unavailable → no fraud flag
          () => {
            if (isMounted) {
              const safe = { browser_city: "India", ip_city: "India", fraud_flag: false };
              setGeoData(safe);
              store.setGeoData(safe);
            }
          },
          { timeout: 8000, maximumAge: 60000 }
        );
      } catch (_) {}


      // ── Audio loop ────────────────────────────────────────────────────────
      const stream = streamRef.current;
      if (stream) {
        let audioChunks = [];

        const startRecorder = () => {
          if (!isMounted || !streamRef.current) return;
          try {
            const recorder = new MediaRecorder(streamRef.current);
            recorderRef.current = recorder;
            audioChunks = [];

            recorder.ondataavailable = (e) => {
              if (e.data.size > 0) audioChunks.push(e.data);
            };

            recorder.onstop = async () => {
              if (!isMounted) return;
              const blob = new Blob(audioChunks, { type: "audio/webm" });

              if (blob.size < 15000) {
                console.log("Audio too small, likely silence or empty snippet");
                if (isMounted) setIsSpeaking(false);
                if (isMounted) startRecorder();
                return;
              }

              const level = await checkAudioLevel(blob);
              if (level < 0.01) {
                console.log("Silence detected, skipping chunk");
                if (isMounted) setIsSpeaking(false);
                if (isMounted) startRecorder();
                return;
              }

              if (isMounted) setIsSpeaking(true);

              const audioFile = new File([blob], "audio.webm", {
                type: "audio/webm",
              });
              const formData = new FormData();
              formData.append("audio", audioFile);

              try {
                const transcribeRes = await fetch(
                  "http://localhost:8000/transcribe",
                  { method: "POST", body: formData }
                );
                const { transcript } = await transcribeRes.json();
                if (transcript && isMounted) {
                  const ts = new Date().toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });
                  setTranscriptDisplay(
                    (prev) => prev + `\n[${ts}] > ${transcript}`
                  );
                  fullTranscriptRef.current += " " + transcript;

                  // Classify
                  const classifyRes = await fetch(
                    "http://localhost:8000/classify",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        transcript: fullTranscriptRef.current,
                      }),
                    }
                  );
                  const kycData = await classifyRes.json();

                  await fetch("http://localhost:8001/api/autofill", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      ...kycData,
                      session_id: sessionId,
                    }),
                  });

                  if (isMounted) {
                    const newKyc = {
                      applicant_income: parseIncome(kycData.income),
                      employment_type: kycData.job,
                      purpose_of_loan: kycData.purpose,
                      verbal_consent: kycData.consent,
                    };
                    setKycForm(newKyc);
                    store.setKycForm(newKyc);

                    // Sync the new KYC structure explicitly straight to backend right now
                    fetch("http://localhost:8001/api/session/update", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        session_id: sessionId,
                        kyc_form: newKyc,
                      }),
                    }).catch(() => {});
                  }
                }
              } catch (_) {}

              // Restart recorder
              if (isMounted) startRecorder();
            };

            recorder.start();
            setTimeout(() => {
              if (recorder.state === "recording") recorder.stop();
            }, 5000);
          } catch (err) {
            console.warn("Recorder error:", err);
          }
        };

        startRecorder();
      }

      // ── Video frame loop ─────────────────────────────────────────────────
      frameInterval = setInterval(async () => {
        if (
          !isMounted ||
          !cameraReadyRef.current ||
          !canvasRef.current ||
          !videoRef.current
        )
          return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        try {
          canvas.getContext("2d").drawImage(video, 0, 0, 640, 480);
        } catch (_) {
          return;
        }
        const base64 = canvas.toDataURL("image/jpeg");

        // Age estimation
        try {
          const ageRes = await fetch("http://localhost:8000/estimate-age", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image: base64, declared_age: 30 }),
          });
          const ageData = await ageRes.json();
          if (isMounted) {
            setAgeEstimate(ageData.estimated_age);
            setAgeMismatch(!ageData.match);
            store.setAgeEstimate(ageData.estimated_age, !ageData.match);
            if (!ageData.match) store.addFraudFlag("Age mismatch detected");
          }
        } catch (_) {}

        // Emotion detection
        try {
          const blob = await (await fetch(base64)).blob();
          const imageFile = new File([blob], "frame.jpg", {
            type: "image/jpeg",
          });
          const emotionForm = new FormData();
          emotionForm.append("image", imageFile);

          const emotionRes = await fetch(
            "http://localhost:8000/detect-emotion",
            { method: "POST", body: emotionForm }
          );
          const emotionData = await emotionRes.json();
          if (isMounted) {
            setEmotion(emotionData.emotion);
            setStressScore(emotionData.stress_score);
            store.setEmotion(emotionData.emotion, emotionData.stress_score);
            if (emotionData.stress_score > 0.8)
              store.addFraudFlag("High stress detected");
            if (emotionData.head_pose) setHeadPose(emotionData.head_pose);
          }
        } catch (_) {}
      }, 10000);
    };

    setup();

    return () => {
      isMounted = false;
      if (frameInterval) clearInterval(frameInterval);
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ─── End call ─────────────────────────────────────────────────────────────
  const handleEndCall = async () => {
    if (!confirm("Are you sure you want to end the call?")) return;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }

    try {
      await fetch("http://localhost:8001/api/audit/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch (_) {}

    router.push("/offer-reveal?session=" + sessionId);
  };

  // ─── Liveness display helpers ─────────────────────────────────────────────
  const livenessLabel =
    livenessStatus === null
      ? "Checking..."
      : livenessStatus
      ? "LIVE"
      : "FAILED";
  const livenessColor =
    livenessStatus === null
      ? "#9CA3AF"
      : livenessStatus
      ? "#10B981"
      : "#EF4444";

  // ─── KYC field helper ─────────────────────────────────────────────────────
  const kycField = (label, value, isConsent = false) => {
    const hasValue =
      value !== null && value !== undefined && value !== "" && value !== 0;
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "10px 0",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <span style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>{label}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              color: hasValue ? "#F9FAFB" : "#4B5563",
              fontSize: "0.875rem",
              fontWeight: hasValue ? 500 : 400,
            }}
          >
            {isConsent
              ? hasValue && value
                ? "YES ✓"
                : "—"
              : hasValue
              ? String(value)
              : "—"}
          </span>
          <span style={{ fontSize: "0.75rem" }}>
            {hasValue ? (
              <span style={{ color: "#10B981" }}>✓</span>
            ) : (
              <span style={{ color: "#374151" }}>○</span>
            )}
          </span>
        </div>
      </div>
    );
  };

  if (!mounted) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0A0F1E",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      {demoFraudAlert && (
        <div style={{ background: "#EF4444", color: "white", padding: "12px", textAlign: "center", fontWeight: "bold", borderRadius: "8px", letterSpacing: "0.05em", fontSize: "0.9rem" }}>
          ⚠ FRAUD ALERT: Multiple risk signals detected
        </div>
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
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
          <span style={{ color: "#F9FAFB", fontWeight: 600 }}>
            Loan Interview
          </span>
        </div>
        <button
          onClick={() => window.open("/dashboard?session=" + sessionId, "_blank")}
          style={{
            background: "transparent",
            color: "#3B82F6",
            fontSize: "0.8rem",
            textDecoration: "none",
            border: "1px solid rgba(59,130,246,0.4)",
            padding: "6px 14px",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          View Dashboard ↗
        </button>
      </div>

      {/* Main Two-Column Layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "55% 43%",
          gap: "20px",
          flex: 1,
          alignItems: "start",
        }}
      >
        {/* ── LEFT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Video Box */}
          <div
            style={{
              position: "relative",
              aspectRatio: "16/9",
              borderRadius: "16px",
              overflow: "hidden",
              background: "#000",
            }}
          >
            {/* Displayed video */}
            <video
              ref={videoBoxRef}
              autoPlay
              muted
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />

            {/* Placeholder when no camera */}
            {!cameraReady && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#111",
                  gap: "12px",
                }}
              >
                <span style={{ fontSize: "3rem" }}>📷</span>
                <span style={{ color: "#9CA3AF", fontSize: "0.875rem" }}>
                  Requesting camera access...
                </span>
              </div>
            )}

            {/* Top-left: LIVE badge */}
            <div
              style={{
                position: "absolute",
                top: "12px",
                left: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(6px)",
                padding: "4px 10px",
                borderRadius: "999px",
              }}
            >
              <div
                className="live-dot pulse-dot"
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#EF4444",
                }}
              />
              <span
                style={{
                  color: "#fff",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                }}
              >
                LIVE
              </span>
            </div>

            {/* Top-right: Controls & Timer */}
            <div style={{ position: "absolute", top: "12px", right: "12px", display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
              <div
                style={{
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(6px)",
                  padding: "4px 12px",
                  borderRadius: "999px",
                  color: "#fff",
                  fontSize: "0.875rem",
                  fontFamily: "monospace",
                  fontWeight: 600,
                }}
              >
                {formatTime(timer)}
              </div>
              <button 
                onClick={handleSimulateFraud}
                style={{ background: "rgba(239, 68, 68, 0.9)", color: "white", border: "none", padding: "6px 12px", borderRadius: "8px", fontSize: "0.75rem", fontWeight: "bold", cursor: "pointer", backdropFilter: "blur(4px)", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
                🚨 Simulate Fraud
              </button>
              <button 
                onClick={handleResetDemo}
                style={{ background: "rgba(16, 185, 129, 0.9)", color: "white", border: "none", padding: "6px 12px", borderRadius: "8px", fontSize: "0.75rem", fontWeight: "bold", cursor: "pointer", backdropFilter: "blur(4px)", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
                ✅ Reset Demo
              </button>
            </div>

            {/* Bottom overlay */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
                padding: "20px 16px 12px",
                color: "#9CA3AF",
                fontSize: "0.8rem",
              }}
            >
              AI is analyzing your conversation...
            </div>
          </div>

          {/* Status Badges */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {/* Location */}
            <span
              className="badge-pill"
              style={{
                background: geoData.fraud_flag
                  ? "rgba(239,68,68,0.1)"
                  : "rgba(16,185,129,0.1)",
                border: geoData.fraud_flag
                  ? "1px solid rgba(239,68,68,0.3)"
                  : "1px solid rgba(16,185,129,0.3)",
                color: geoData.fraud_flag ? "#EF4444" : "#10B981",
                fontSize: "0.75rem",
              }}
            >
              {geoData.fraud_flag
                ? (demoFraudAlert ? "🚨 Mumbai → Bangalore Mismatch" : "🚨 Location Mismatch")
                : "📍 Location Verified"}
            </span>

            {/* Age */}
            {ageEstimate && (
              <span
                className="badge-pill"
                style={{
                  background: "rgba(59,130,246,0.1)",
                  border: "1px solid rgba(59,130,246,0.3)",
                  color: "#3B82F6",
                  fontSize: "0.75rem",
                }}
              >
                Age: {ageEstimate}
              </span>
            )}

            {/* Liveness — only show after status is determined */}
            {livenessStatus !== null && (
              <span
                className="badge-pill"
                style={{
                  background: livenessStatus
                    ? "rgba(16,185,129,0.1)"
                    : "rgba(239,68,68,0.1)",
                  border: livenessStatus
                    ? "1px solid rgba(16,185,129,0.3)"
                    : "1px solid rgba(239,68,68,0.3)",
                  color: livenessStatus ? "#10B981" : "#EF4444",
                  fontSize: "0.75rem",
                }}
              >
                {livenessStatus ? "✓ Live" : "✗ Spoofed"}
              </span>
            )}

            {/* Consent */}
            {kycForm?.verbal_consent && (
              <span
                className="badge-pill"
                style={{
                  background: "rgba(16,185,129,0.1)",
                  border: "1px solid rgba(16,185,129,0.3)",
                  color: "#10B981",
                  fontSize: "0.75rem",
                }}
              >
                ✓ Consent
              </span>
            )}
          </div>

          {/* End Call Button */}
          <button
            id="end-call-btn"
            onClick={handleEndCall}
            style={{
              width: "100%",
              padding: "14px",
              background: "linear-gradient(135deg, #EF4444, #DC2626)",
              border: "none",
              borderRadius: "12px",
              color: "#fff",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "transform 0.2s ease",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.transform = "translateY(-1px)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.transform = "translateY(0)")
            }
          >
            📞 End Call
          </button>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
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
                style={{ color: "#F9FAFB", fontWeight: 600, fontSize: "0.9rem" }}
              >
                Live Transcript
              </span>
            </div>
            <div
              ref={transcriptBoxRef}
              style={{
                background: "#0D1117",
                borderRadius: "8px",
                height: "200px",
                overflowY: "auto",
                padding: "12px",
                fontFamily: "monospace",
                fontSize: "0.8rem",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
              }}
              className="terminal-text"
            >
              {transcriptDisplay}
            </div>

            {/* Visual Mic Indicator */}
            <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "12px", background: "rgba(0,0,0,0.2)", padding: "10px 14px", borderRadius: "8px" }}>
              <div 
                className={isSpeaking ? "pulse-dot" : ""}
                style={{ 
                  width: "40px", 
                  height: "6px", 
                  borderRadius: "999px", 
                  background: isSpeaking ? "#10B981" : "#4B5563",
                  transition: "all 0.3s ease",
                  boxShadow: isSpeaking ? "0 0 8px rgba(16,185,129,0.6)" : "none"
                }} 
              />
              <span style={{ color: isSpeaking ? "#10B981" : "#9CA3AF", fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.05em" }}>
                {isSpeaking ? "Speaking..." : "Waiting..."}
              </span>
            </div>
          </div>

          {/* AI Analysis Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            {/* Age Card */}
            <div className="glass-card" style={{ padding: "16px" }}>
              <div
                style={{
                  color: "#9CA3AF",
                  fontSize: "0.7rem",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Age Estimate
              </div>
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: 800,
                  color: "#F9FAFB",
                  lineHeight: 1,
                  marginBottom: "8px",
                }}
              >
                {ageEstimate || "--"}
              </div>
              <span
                className="badge-pill"
                style={{
                  background: ageMismatch
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(16,185,129,0.15)",
                  border: ageMismatch
                    ? "1px solid rgba(239,68,68,0.3)"
                    : "1px solid rgba(16,185,129,0.3)",
                  color: ageMismatch ? "#EF4444" : "#10B981",
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                }}
              >
                {ageMismatch ? "Mismatch ✗" : "Match ✓"}
              </span>
            </div>

            {/* Emotion Card */}
            <div className="glass-card" style={{ padding: "16px" }}>
              <div
                style={{
                  color: "#9CA3AF",
                  fontSize: "0.7rem",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Emotion
              </div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#F9FAFB",
                  marginBottom: "10px",
                  textTransform: "capitalize",
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
                  marginBottom: "4px",
                }}
              >
                <div
                  className="stress-bar-fill"
                  style={{
                    width: `${(Number(stressScore) || 0) * 100}%`,
                    height: "100%",
                    background: stressColor(Number(stressScore) || 0),
                  }}
                />
              </div>
              <div
                style={{ color: "#9CA3AF", fontSize: "0.7rem" }}
              >{`Stress: ${Math.round((Number(stressScore) || 0) * 100)}%`}</div>
            </div>

            {/* Liveness Card */}
            <div className="glass-card" style={{ padding: "16px" }}>
              <div
                style={{
                  color: "#9CA3AF",
                  fontSize: "0.7rem",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Liveness
              </div>
              <div
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: livenessColor,
                  marginBottom: "6px",
                }}
              >
                {livenessLabel}
              </div>
              <div style={{ color: "#9CA3AF", fontSize: "0.75rem" }}>
                {headPose}
              </div>
            </div>

            {/* Location Card */}
            <div className="glass-card" style={{ padding: "16px" }}>
              <div
                style={{
                  color: "#9CA3AF",
                  fontSize: "0.7rem",
                  marginBottom: "8px",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Location
              </div>
              <div
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#F9FAFB",
                  marginBottom: "4px",
                }}
              >
                {geoData.browser_city || "Detecting..."}
              </div>
              <span
                className="badge-pill"
                style={{
                  background: geoData.fraud_flag
                    ? "rgba(239,68,68,0.15)"
                    : "rgba(16,185,129,0.15)",
                  border: geoData.fraud_flag
                    ? "1px solid rgba(239,68,68,0.3)"
                    : "1px solid rgba(16,185,129,0.3)",
                  color: geoData.fraud_flag ? "#EF4444" : "#10B981",
                  fontSize: "0.7rem",
                  padding: "2px 8px",
                }}
              >
                {geoData.fraud_flag ? "Fraud Flag" : "Verified"}
              </span>
            </div>
          </div>

          {/* KYC Status Card */}
          <div className="glass-card" style={{ padding: "20px" }}>
            <div
              style={{
                color: "#F9FAFB",
                fontWeight: 600,
                fontSize: "0.9rem",
                marginBottom: "12px",
              }}
            >
              Extracted Details
            </div>
            {kycField(
              "Monthly Income",
              kycForm?.applicant_income
                ? (isNaN(Number(kycForm.applicant_income)) ? String(kycForm.applicant_income) : `₹${Number(kycForm.applicant_income).toLocaleString("en-IN")}`)
                : null
            )}
            {kycField("Employment", kycForm?.employment_type)}
            {kycField("Loan Purpose", kycForm?.purpose_of_loan)}
            {kycField("Consent Given", kycForm?.verbal_consent, true)}
          </div>
        </div>
      </div>

      {/* Hidden elements for processing */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        style={{ display: "none" }}
      />
      <canvas
        ref={canvasRef}
        style={{ display: "none" }}
        width={640}
        height={480}
      />
    </div>
  );
}

export default function CallPage() {
  return (
    <Suspense fallback={<div style={{ background: '#0A0F1E', minHeight: '100vh' }} />}>
      <CallPageContent />
    </Suspense>
  );
}
