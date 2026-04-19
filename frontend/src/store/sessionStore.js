import { create } from 'zustand'

const useSessionStore = create((set) => ({
  sessionId: '',
  phoneNumber: '',
  transcript: '',
  ageEstimate: 0,
  ageMismatch: false,
  emotion: 'neutral',
  stressScore: 0,
  isLive: false,
  geoData: { browser_city: '', ip_city: '', fraud_flag: false },
  fraudFlags: [],
  kycForm: null,
  offer: null,
  declaredAge: 30,
  setSessionId: (id) => set({ sessionId: id }),
  setTranscript: (t) => set({ transcript: t }),
  setAgeEstimate: (age, mismatch) =>
    set({ ageEstimate: age, ageMismatch: mismatch }),
  setEmotion: (emotion, score) =>
    set({ emotion, stressScore: score }),
  setGeoData: (data) => set({ geoData: data }),
  addFraudFlag: (flag) =>
    set((state) => {
      if (!state.fraudFlags.includes(flag)) {
        return { fraudFlags: [...state.fraudFlags, flag] };
      }
      return state;
    }),
  setFraudFlags: (flags) => set({ fraudFlags: flags }),
  setKycForm: (form) => set({ kycForm: form }),
  setOffer: (offer) => set({ offer }),
}))

export default useSessionStore
