"use client";

import { createContext, useContext } from "react";
import type { FeedbackType } from "@/lib/feedback";
import type { Job } from "@/types/job";

export type RecordFeedback = (type: FeedbackType, job: Job, detail?: string) => void;

/** Does nothing outside the provider, so components stay usable on their own. */
export const FeedbackContext = createContext<RecordFeedback>(() => {});
export const useFeedback = () => useContext(FeedbackContext);
