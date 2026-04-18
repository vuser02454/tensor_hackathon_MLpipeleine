import { create } from "zustand";

export const useSessionStore = create((set) => ({
  sessionId: "",
  phoneNumber: "",
  transcript: "",
  ageEstimate: 0,
  ageMismatch: false,
  emotion: "",
  stressScore: 0,
  isLive: false,
  declaredAge: 30,
  geoData: { browser_city: "", ip_city: "", fraud_flag: false },
  fraudFlags: [],
  kycForm: {},
  offer: {},

  setSessionId: (sessionId) => set({ sessionId }),
  setPhoneNumber: (phoneNumber) => set({ phoneNumber }),
  appendTranscript: (text) =>
    set((state) => ({
      transcript: state.transcript
        ? `${state.transcript} ${text}`.trim()
        : text.trim(),
    })),
  setTranscript: (transcript) => set({ transcript }),
  setAgeData: ({ ageEstimate, ageMismatch }) => set({ ageEstimate, ageMismatch }),
  setEmotionData: ({ emotion, stressScore }) => set({ emotion, stressScore }),
  setIsLive: (isLive) => set({ isLive }),
  setGeoData: (geoData) => set({ geoData }),
  addFraudFlag: (flag) =>
    set((state) => ({
      fraudFlags: state.fraudFlags.includes(flag)
        ? state.fraudFlags
        : [...state.fraudFlags, flag],
    })),
  setFraudFlags: (fraudFlags) => set({ fraudFlags }),
  setKycForm: (kycForm) => set({ kycForm }),
  setOffer: (offer) => set({ offer }),
  setDeclaredAge: (declaredAge) => set({ declaredAge }),
  resetSession: () =>
    set({
      sessionId: "",
      phoneNumber: "",
      transcript: "",
      ageEstimate: 0,
      ageMismatch: false,
      emotion: "",
      stressScore: 0,
      isLive: false,
      geoData: { browser_city: "", ip_city: "", fraud_flag: false },
      fraudFlags: [],
      kycForm: {},
      offer: {},
      declaredAge: 30,
    }),
}));
