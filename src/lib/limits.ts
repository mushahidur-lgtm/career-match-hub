/**
 * The largest values an application may hold. The storage schema, the editing functions and the
 * input boxes all use these, so nothing you can type is more than what can be saved and read back.
 */
export const LIMITS = {
  name: 200,
  email: 200,
  phone: 60,
  salaryExpectation: 200,
  coverLetter: 20_000,
  notes: 10_000,
  rejectionReason: 2000,
  resumeName: 120,
  offerShort: 200,
  offerBenefits: 2000,
  offerNotes: 5000,
  interviewers: 500,
  prepNotes: 10_000,
  feedback: 10_000,
  question: 500,
  questionsMax: 30,
  topic: 200,
  topicsMax: 40,
  interviewsMax: 40,
  historyText: 2000,
  historyMax: 500,
} as const;
