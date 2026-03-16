export interface FilterConfig {
  afterDate: string;
  blockedDomains: string[];
  skipPromotions: boolean;
  skipUpdates: boolean;
  skipSocial: boolean;
  skipForums: boolean;
  minInteractions: number;
  maxThreads: number;
}

export interface ContactRow {
  name: string;
  email: string;
  relationship_type:
    | "classmate"
    | "professor"
    | "professional"
    | "friend"
    | "other";
  how_we_met: string;
  interaction_summary: string;
  last_contact: string;
  total_emails: number;
  confidence: "high" | "medium" | "low";
  tags: string[];
}

export type JobStatus = "pending" | "processing" | "complete" | "failed";

export type LLMProviderMode = "cloud" | "local" | "byok";

export interface ProgressEvent {
  type: "progress" | "heartbeat";
  stage: string;
  stageIndex: number;
  copy: string;
  contactCount?: number;
}
