"use client";

import { useState } from "react";
import { m2api } from "../../lib/api";
import { useSessionStore } from "../store/useSessionStore";

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const setSessionId = useSessionStore((state) => state.setSessionId);
  const setPhoneNumberStore = useSessionStore((state) => state.setPhoneNumber);

  const handleSendLink = async () => {
    if (!phoneNumber.trim()) {
      setErrorMessage("Please enter a phone number.");
      setSuccessMessage("");
      return;
    }

    setLoading(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await m2api.post("/api/auth/send-link", {
        phone_number: phoneNumber.trim(),
      });
      const sid = response?.data?.session_id || "";
      setSessionId(sid);
      setPhoneNumberStore(phoneNumber.trim());
      setSuccessMessage("Check your WhatsApp for the link!");
    } catch (error) {
      setErrorMessage(
        error?.response?.data?.detail ||
          "Could not send link right now. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white px-4 py-10 text-slate-900 sm:px-6">
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Loan Onboarding
        </h1>
        <p className="text-sm text-slate-600">
          Enter your WhatsApp number to receive your secure call link.
        </p>

        <label className="text-sm font-medium text-slate-700" htmlFor="phone">
          Phone number
        </label>
        <input
          id="phone"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          placeholder="+91XXXXXXXXXX"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500"
        />

        <button
          type="button"
          onClick={handleSendLink}
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Sending..." : "Get Loan Offer"}
        </button>

        {successMessage && (
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {successMessage}
          </p>
        )}
        {errorMessage && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        )}
      </main>
    </div>
  );
}
