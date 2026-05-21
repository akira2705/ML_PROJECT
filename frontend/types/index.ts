export type Decision = "BUY" | "WAIT" | "DO NOT BUY";

export interface Diagnostics {
  review_signal: number;
  negative_ratio: number;
  hard_negative_ratio: number;
  positive_hits: number;
  negative_hits: number;
  total_hits: number;
  individual_rating_signal: number;
  individual_rating_count: number;
  individual_rating_avg: number | null;
}

export interface AnalyzeResult {
  viability_score: number;
  regret_score: number;
  model_signal: number;
  final_score: number;
  decision: Decision;
  reviews: string;
  product_image: string | null;
  star_rating: number | null;
  diagnostics: Diagnostics;
  regret_derived: boolean;
}

export type StepId = "fetching" | "scraping" | "inference" | "scoring";

export interface Step {
  id: StepId;
  label: string;
  detail: string;
  status: "idle" | "running" | "done" | "error";
}
