export interface FilterConfig {
  afterDate: string;
  blockedDomains: string[];
  skipPromotions: boolean;
  skipUpdates: boolean;
  skipSocial: boolean;
  skipForums: boolean;
  minInteractions: number;
  maxThreads: number;
  requireReply?: boolean;
  storeRawBodies?: boolean;
}

export interface ContactRow {
  name: string;
  email: string;
  relationship_type:
    | "classmate"
    | "professor"
    | "teaching_assistant"
    | "student"
    | "mentor"
    | "advisor"
    | "recruiter"
    | "colleague"
    | "professional"
    | "friend"
    | "weak_tie"
    | "family"
    | "other"
    | "unknown";
  how_we_met: string;
  interaction_summary: string;
  notable_advice?: string;
  personal_details?: string;
  open_loops?: string;
  why_they_matter?: string;
  reconnect_reason?: string;
  last_contact: string;
  total_emails: number;
  confidence: "high" | "medium" | "low";
  tags: string[];
}

export type JobStatus = "pending" | "processing" | "complete" | "failed";

export type LLMProviderMode = "cloud" | "local" | "byok";

export type BYOKProvider = "openai" | "gemini" | "openrouter";

export interface ProgressEvent {
  type: "progress" | "heartbeat";
  stage: string;
  stageIndex: number;
  copy: string;
  contactCount?: number;
}
