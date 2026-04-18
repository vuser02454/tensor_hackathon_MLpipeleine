"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "../../../lib/api";
import { m2api } from "../../../lib/api";
import { useSessionStore } from "../../store/useSessionStore";

const CHANNEL_NAME = "loan-onboarding";

export default function CallPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionIdParam = searchParams.get("session_id") || searchParams.get("session");
  const [isSessionVerified, setIsSessionVerified] = useState(false);
  const [isVerifying, setIsVerifying] = useState(true);
  const [error, setError] = useState("");
  const [showAutofillToast, setShowAutofillToast] = useState(false);
  const [endingCall, setEndingCall] = useState(false);

  const transcript = useSessionStore((state) => state.transcript);
  const isLive = useSessionStore((state) => state.isLive);
  const ageEstimate = useSessionStore((state) => state.ageEstimate);
  const ageMismatch = useSessionStore((state) => state.ageMismatch);
  const emotion = useSessionStore((state) => state.emotion);
  const stressScore = useSessionStore((state) => state.stressScore);
  const declaredAge = useSessionStore((state) => state.declaredAge);
  const geoData = useSessionStore((state) => state.geoData);
  const fraudFlags = useSessionStore((state) => state.fraudFlags);
  const setSessionId = useSessionStore((state) => state.setSessionId);
  const setPhoneNumber = useSessionStore((state) => state.setPhoneNumber);
  const appendTranscript = useSessionStore((state) => state.appendTranscript);
  const setAgeData = useSessionStore((state) => state.setAgeData);
  const setEmotionData = useSessionStore((state) => state.setEmotionData);
  const setIsLive = useSessionStore((state) => state.setIsLive);
  const setGeoData = useSessionStore((state) => state.setGeoData);
  const addFraudFlag = useSessionStore((state) => state.addFraudFlag);
  const setKycForm = useSessionStore((state) => state.setKycForm);

  const clientRef = useRef(null);
  const localTracksRef = useRef({ audioTrack: null, videoTrack: null });
  const localVideoContainerRef = useRef(null);

  const transcriptTimerRef = useRef(null);
  const analyticsTimerRef = useRef(null);
  const recorderStreamRef = useRef(null);
  const videoRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const verifySession = async () => {
      if (!sessionIdParam) {
        if (!cancelled) {
          setError("Missing session link. Please use the WhatsApp URL.");
          setIsSessionVerified(false);
          setIsVerifying(false);
        }
        return;
      }

      try {
        const response = await m2api.get("/api/auth/verify", {
          params: { session: sessionIdParam },
        });
        if (!cancelled) {
          const valid = Boolean(response?.data?.valid);
          setIsSessionVerified(valid);
          setIsVerifying(false);
          if (valid) {
            setSessionId(sessionIdParam);
            setPhoneNumber(response?.data?.phone_number || "");
          }
          if (!valid) {
            setError("Invalid or expired session link.");
          }
        }
      } catch {
        if (!cancelled) {
          setIsSessionVerified(false);
          setIsVerifying(false);
          setError("Could not verify session. Please try again.");
        }
      }
    };

    verifySession();

    return () => {
      cancelled = true;
    };
  }, [sessionIdParam, setPhoneNumber, setSessionId]);

  useEffect(() => {
    if (!isSessionVerified) return;

    let cancelled = false;

    const runGeoCheck = async () => {
      if (!navigator.geolocation) {
        return;
      }

      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      const ipResponse = await fetch("https://api.ipify.org?format=json");
      const ipData = await ipResponse.json();

      const response = await m2api.post("/api/geo-check", {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        ip: ipData.ip,
      });

      const data = {
        browser_city: response?.data?.browser_city || "",
        ip_city: response?.data?.ip_city || "",
        fraud_flag: Boolean(response?.data?.fraud_flag),
      };

      if (!cancelled) {
        setGeoData(data);
        if (data.fraud_flag) {
          addFraudFlag("geo_mismatch");
        }
        await m2api.put("/api/session/update", {
          session_id: sessionIdParam,
          geo_data: data,
          fraud_flags: useSessionStore.getState().fraudFlags,
        });
      }
    };

    runGeoCheck().catch(() => {
      if (!cancelled) {
        setGeoData({
          browser_city: "",
          ip_city: "",
          fraud_flag: false,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [addFraudFlag, isSessionVerified, sessionIdParam, setGeoData]);

  useEffect(() => {
    if (!isSessionVerified) return;

    let isCancelled = false;

    const setupCall = async () => {
      try {
        const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID;
        if (!appId) {
          throw new Error("Missing NEXT_PUBLIC_AGORA_APP_ID in .env.local");
        }

        const { default: AgoraRTC } = await import("agora-rtc-sdk-ng");
        const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        clientRef.current = client;

        await client.join(appId, CHANNEL_NAME, null, null);
        const [audioTrack, videoTrack] =
          await AgoraRTC.createMicrophoneAndCameraTracks();

        localTracksRef.current = { audioTrack, videoTrack };

        await client.publish([audioTrack, videoTrack]);
        if (localVideoContainerRef.current) {
          videoTrack.play(localVideoContainerRef.current);
        }

        if (!isCancelled) {
          setIsLive(true);
          startTranscriptLoop();
          startAnalyticsLoop();
          startVideoRecording();
        }
      } catch (setupError) {
        setError(setupError.message || "Failed to start call.");
      }
    };

    const startTranscriptLoop = async () => {
      try {
        recorderStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
      } catch (mediaError) {
        setError(mediaError.message || "Microphone permission denied.");
        return;
      }

      const stream = recorderStreamRef.current;
      const runClassifyAndAutofill = async (inputTranscript) => {
        if (!sessionIdParam) return;

        const classifyResponse = await api.post("/classify", {
          transcript: inputTranscript,
        });
        const llmOutput = classifyResponse?.data || {};
        const autofillPayload = {
          income: Number(llmOutput.income || 0),
          job_type: llmOutput.job_type || llmOutput.job || "",
          loan_purpose: llmOutput.loan_purpose || llmOutput.purpose || "",
          loan_amount_requested: Number(llmOutput.loan_amount_requested || 0),
          consent_given: Boolean(
            llmOutput.consent_given ?? llmOutput.consent ?? false,
          ),
          language_detected: llmOutput.language_detected || "",
        };

        const autofillResponse = await m2api.post("/api/autofill", autofillPayload, {
          params: { session_id: sessionIdParam },
        });

        if (autofillResponse?.data?.autofill_success) {
          setKycForm(autofillResponse?.data?.kyc_form || {});
          setShowAutofillToast(true);
          window.setTimeout(() => setShowAutofillToast(false), 2500);
        }
      };

      const runTranscriptionCycle = async () => {
        if (isCancelled || !stream) return;

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: "audio/webm",
        });
        const chunks = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          try {
            const blob = new Blob(chunks, { type: "audio/webm" });
            const file = new File([blob], `sample-${Date.now()}.webm`, {
              type: "audio/webm",
            });

            const formData = new FormData();
            formData.append("audio", file);

            const response = await api.post("/transcribe", formData);
            const newText = response?.data?.transcript;
            if (newText) {
              appendTranscript(newText);
              const updatedTranscript = useSessionStore.getState().transcript;
              await m2api.put("/api/session/update", {
                session_id: sessionIdParam,
                transcript: updatedTranscript,
              });
              await runClassifyAndAutofill(newText);
            }
          } catch {
            // Keep the call alive even when one transcription cycle fails.
          } finally {
            if (!isCancelled) {
              transcriptTimerRef.current = window.setTimeout(
                runTranscriptionCycle,
                5000,
              );
            }
          }
        };

        mediaRecorder.start();
        window.setTimeout(() => {
          if (mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
          }
        }, 5000);
      };

      runTranscriptionCycle();
    };

    const getVideoSnapshot = async () => {
      const videoElement = localVideoContainerRef.current?.querySelector("video");
      if (!videoElement || !canvasRef.current) return null;
      const canvas = canvasRef.current;
      canvas.width = videoElement.videoWidth || 640;
      canvas.height = videoElement.videoHeight || 360;
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/jpeg");
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg"));
      return { image, blob };
    };

    const runAgeCheck = async () => {
      if (isCancelled) return;
      try {
        const snapshot = await getVideoSnapshot();
        if (!snapshot?.image) return;
        const response = await api.post("/estimate-age", {
          image: snapshot.image,
          declared_age: declaredAge,
        });

        const mismatch = response?.data?.match === false;
        setAgeData({
          ageEstimate: Number(response?.data?.estimated_age || 0),
          ageMismatch: mismatch,
        });
        if (mismatch) {
          addFraudFlag("age_mismatch");
        }
        await m2api.put("/api/session/update", {
          session_id: sessionIdParam,
          age_estimate: Number(response?.data?.estimated_age || 0),
          age_match: response?.data?.match,
          fraud_flags: useSessionStore.getState().fraudFlags,
        });
      } catch {
        // Keep running.
      }
    };

    const runEmotionCheck = async () => {
      if (isCancelled) return;
      try {
        const snapshot = await getVideoSnapshot();
        if (!snapshot?.blob) return;
        const imageFile = new File([snapshot.blob], `emotion-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        const formData = new FormData();
        formData.append("image", imageFile);

        const response = await api.post("/detect-emotion", formData);
        const emotionValue = response?.data?.emotion || "";
        const stressValue = Number(response?.data?.stress_score || 0);
        setEmotionData({ emotion: emotionValue, stressScore: stressValue });
        if (response?.data?.flag) {
          addFraudFlag("emotion_risk");
        }
        await m2api.put("/api/session/update", {
          session_id: sessionIdParam,
          emotion: emotionValue,
          stress_score: stressValue,
          fraud_flags: useSessionStore.getState().fraudFlags,
        });
      } catch {
        // Keep running.
      }
    };

    const runLivenessCheck = async () => {
      if (isCancelled) return;
      try {
        const snapshot = await getVideoSnapshot();
        if (!snapshot?.blob) return;
        const imageFile = new File([snapshot.blob], `live-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        const formData = new FormData();
        formData.append("image", imageFile);
        const response = await api.post("/liveness-check", formData);
        const isActuallyLive = Boolean(response?.data?.is_live);
        setIsLive(isActuallyLive);
        if (!isActuallyLive) {
          addFraudFlag("liveness_failed");
        }
        await m2api.put("/api/session/update", {
          session_id: sessionIdParam,
          is_live: isActuallyLive,
          head_pose: response?.data?.head_pose || "",
          fraud_flags: useSessionStore.getState().fraudFlags,
        });
      } catch {
        // Keep running.
      }
    };

    const startAnalyticsLoop = () => {
      const runAll = async () => {
        if (isCancelled) return;
        await runAgeCheck();
        await runEmotionCheck();
        await runLivenessCheck();
      };

      runAll();
      analyticsTimerRef.current = window.setInterval(runAll, 10000);
    };

    const startVideoRecording = () => {
      try {
        const videoElement = localVideoContainerRef.current?.querySelector("video");
        if (!videoElement || !videoElement.captureStream) return;
        const capture = videoElement.captureStream(10);
        const recorder = new MediaRecorder(capture, { mimeType: "video/webm" });
        videoChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data?.size > 0) {
            videoChunksRef.current.push(event.data);
          }
        };
        recorder.start();
        videoRecorderRef.current = recorder;
      } catch {
        videoRecorderRef.current = null;
      }
    };

    setupCall();

    return () => {
      isCancelled = true;
      setIsLive(false);
      if (transcriptTimerRef.current) {
        window.clearTimeout(transcriptTimerRef.current);
      }
      if (analyticsTimerRef.current) {
        window.clearInterval(analyticsTimerRef.current);
      }
      if (recorderStreamRef.current) {
        recorderStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (
        videoRecorderRef.current &&
        videoRecorderRef.current.state &&
        videoRecorderRef.current.state !== "inactive"
      ) {
        videoRecorderRef.current.stop();
      }

      const { audioTrack, videoTrack } = localTracksRef.current;
      if (audioTrack) audioTrack.close();
      if (videoTrack) videoTrack.close();

      if (clientRef.current) {
        clientRef.current.leave().catch(() => undefined);
      }
    };
  }, [
    addFraudFlag,
    appendTranscript,
    declaredAge,
    isSessionVerified,
    sessionIdParam,
    setAgeData,
    setEmotionData,
    setIsLive,
    setKycForm,
  ]);

  const handleEndCall = async () => {
    if (!sessionIdParam || endingCall) return;
    setEndingCall(true);
    try {
      if (
        videoRecorderRef.current &&
        videoRecorderRef.current.state &&
        videoRecorderRef.current.state !== "inactive"
      ) {
        await new Promise((resolve) => {
          videoRecorderRef.current.onstop = resolve;
          videoRecorderRef.current.stop();
        });
      }

      if (videoChunksRef.current.length > 0) {
        const videoBlob = new Blob(videoChunksRef.current, { type: "video/webm" });
        const videoBase64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ""));
          reader.onerror = reject;
          reader.readAsDataURL(videoBlob);
        });
        await m2api.post("/api/audit/save-video", {
          session_id: sessionIdParam,
          video_base64: videoBase64,
        });
      }

      await m2api.post("/api/audit/finalize", { session_id: sessionIdParam });
      router.push(`/offer-reveal?session=${sessionIdParam}`);
    } catch (endError) {
      setError(
        endError?.response?.data?.detail ||
          "Failed to finalize call. Please retry End Call.",
      );
    } finally {
      setEndingCall(false);
    }
  };

  return (
    <div className="min-h-screen bg-white px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <main className="mx-auto flex w-full max-w-4xl flex-col items-center gap-5">
        {showAutofillToast && (
          <div className="fixed right-4 top-4 z-50 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-lg">
            KYC form auto-filled successfully ✓
          </div>
        )}
        {isVerifying && (
          <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm text-slate-700">
            Verifying secure session...
          </div>
        )}
        {!isVerifying && !isSessionVerified && (
          <div className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-700">
            Access denied. Please open the valid WhatsApp session link.
          </div>
        )}
        {isSessionVerified && geoData?.fraud_flag === true && (
          <div className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-700 sm:text-base">
            🚨 Location mismatch detected - Application flagged
          </div>
        )}

        {isSessionVerified && (
          <header className="flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            Loan Onboarding Call
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {isLive && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 sm:text-sm">
                🔴 Live
              </span>
            )}
            {ageMismatch && (
              <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-medium text-yellow-900 sm:text-sm">
                ⚠ Age mismatch detected
              </span>
            )}
            {geoData?.fraud_flag === false && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800 sm:text-sm">
                📍 Location Verified
              </span>
            )}
          </div>
          </header>
        )}

        {isSessionVerified && (
          <section className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm sm:p-4">
          <div
            ref={localVideoContainerRef}
            className="mx-auto flex aspect-video w-full max-w-3xl items-center justify-center overflow-hidden rounded-xl bg-slate-900"
          />
          <canvas ref={canvasRef} className="hidden" />
          </section>
        )}

        {isSessionVerified && (
          <section className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-700">
            Live Transcript
          </h2>
          <div className="h-40 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-800 sm:h-48">
            {transcript || "Listening..."}
          </div>
          <p className="mt-3 text-xs text-slate-600 sm:text-sm">
            Estimated age: {String(ageEstimate || "-")} | Emotion: {emotion || "-"} |
            Stress: {String(stressScore || 0)}
          </p>
          {geoData && (
            <p className="mt-2 text-xs text-slate-600 sm:text-sm">
              Browser city: {geoData.browser_city || "-"} | IP city:{" "}
              {geoData.ip_city || "-"}
            </p>
          )}
          <p className="mt-2 text-xs text-slate-600 sm:text-sm">
            Fraud flags: {fraudFlags.length > 0 ? fraudFlags.join(", ") : "none"}
          </p>
          {error && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:text-sm">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={handleEndCall}
            disabled={endingCall}
            className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {endingCall ? "Ending Call..." : "End Call"}
          </button>
          </section>
        )}
      </main>
    </div>
  );
}
