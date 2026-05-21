import type { Diagnostics, Decision } from "@/types";

const BUY_THRESHOLD = 0.6;
const WAIT_THRESHOLD = 0.5;

const POSITIVE_TERMS = [
  "good","great","excellent","amazing","awesome","best","worth",
  "satisfied","love","fast","perfect","recommended","reliable","premium",
  "value for money","works well","impressed","superb","works great",
  "works perfectly","happy","solid","sturdy","durable","genuine",
  "compatible","charges well","charges fast","quick charge",
];
const NEGATIVE_TERMS = [
  // general quality
  "bad","poor","worst","terrible","horrible","awful","pathetic","useless",
  "garbage","trash","junk","cheap","flimsy","fragile","substandard","inferior",
  "low quality","poor quality","cheap quality","cheap feel","feels cheap",
  // product failure
  "broken","defective","defect","damaged","faulty","malfunction","malfunctioning",
  "not working","doesn't work","does not work","stopped working","quit working",
  "broke down","fell apart","came apart","broke apart","dead on arrival",
  "failed","failure","not functional","not durable","wore out","gave up",
  // mechanical/motion issues
  "jammed","stuck","won't move","cannot adjust","can't adjust",
  "falling down","not holding","gas spring failure","gas spring flaw",
  "rattling","rattles","makes noise","weird noise","strange noise","creaking",
  // overheating / electrical
  "overheat","overheated","overheating","heating issue","heating problem",
  "burning smell","burning","caught fire","fire hazard","electric shock",
  "short circuit","dangerous","safety hazard",
  // performance
  "lag","lagging","slow","very slow","slow charging","charges slowly",
  "slow charger","not fast","drains","draining fast",
  // disappointment / regret
  "disappointed","disappointing","disappointment","regret","regretted",
  "not satisfied","not impressed","underwhelmed","below expectations",
  "not as described","not as advertised","misleading","false advertising",
  "not as expected","waste","waste of money","wasted money","money wasted",
  "not worth","not worth the money","not worth the price","overpriced",
  "never again","totally disappointed","very bad","so bad",
  // recommendation signals
  "not recommended","don't recommend","would not recommend","cannot recommend",
  "avoid","do not buy","don't buy","1 star","one star","zero stars","0 stars",
  // authenticity
  "fake","not genuine","duplicate","counterfeit","knockoff","scam","fraud",
  // compatibility / fit
  "not compatible","doesn't fit","wrong item","wrong product","missing parts",
  // return signals
  "return","refund","returned it","sent it back","asked for refund",
];

const HARD_NEGATIVE_TERMS = [
  // catastrophic failure
  "dead on arrival","stopped working","defective","broken","not working",
  "doesn't work","does not work","malfunction","not functional","fell apart",
  // safety
  "caught fire","fire hazard","electric shock","short circuit","dangerous",
  "burning","overheat","overheated","overheating","heating issue",
  // mechanical failure (specific)
  "gas spring failure","gas spring flaw","jammed","cannot adjust",
  "not holding","falling down",
  // fraud / fake
  "fake","counterfeit","scam","fraud","not genuine",
  // strong sentiment
  "waste of money","do not buy","don't buy","totally disappointed",
  "would not recommend","never again","worst product","dead",
  // return escalation
  "refund","return",
];

function countMatches(text: string, terms: string[]) {
  return terms.reduce((acc, term) => {
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    return acc + (text.match(re)?.length ?? 0);
  }, 0);
}

export function analyzeReviewSentiment(reviewsText: string) {
  const text = (reviewsText || "").toLowerCase();
  if (!text) return { review_signal: 0.5, negative_ratio: 0, hard_negative_ratio: 0, positive_hits: 0, negative_hits: 0, total_hits: 0 };

  const pos = countMatches(text, POSITIVE_TERMS);
  const neg = countMatches(text, NEGATIVE_TERMS);
  const hardNeg = countMatches(text, HARD_NEGATIVE_TERMS);
  const total = pos + neg;
  if (total === 0) return { review_signal: 0.5, negative_ratio: 0, hard_negative_ratio: 0, positive_hits: pos, negative_hits: neg, total_hits: 0 };

  const review_signal = Math.max(0, Math.min(1, 0.5 + (pos - neg) / (2 * total)));
  const negative_ratio = neg / total;
  const hard_negative_ratio = hardNeg / total;
  return { review_signal, negative_ratio, hard_negative_ratio, positive_hits: pos, negative_hits: neg, total_hits: total };
}

export function analyzeIndividualRatings(ratings: number[]) {
  if (!ratings.length) return { signal: 0.5, count: 0, avg: null, low_share: 0 };
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const low_share = ratings.filter((r) => r <= 2).length / ratings.length;
  const high_share = ratings.filter((r) => r >= 4).length / ratings.length;
  const signal = Math.max(0, Math.min(1, avg / 5 - 0.2 * low_share + 0.08 * high_share));
  return { signal, count: ratings.length, avg, low_share };
}

// Squeeze extreme model scores toward center — the ML model is overconfident
// e.g. 0.998 → 0.82,  0.85 → 0.745,  0.5 → 0.5,  0.1 → 0.22
function dampen(s: number): number {
  return 0.5 + (s - 0.5) * 0.65;
}

export function computeFinalScore(
  viabilityScore: number,
  regretScore: number,
  reviewsText: string,
  individualRatings: number[]
): { final_score: number; model_signal: number; diagnostics: Diagnostics } {
  const raw_model_signal = (viabilityScore + (1 - regretScore)) / 2;
  // Expose raw model_signal for display, but use dampened version in scoring
  const model_signal = raw_model_signal;
  const dampened_model = dampen(raw_model_signal);

  const sentimentResult = analyzeReviewSentiment(reviewsText);
  const ratingResult = analyzeIndividualRatings(individualRatings);

  // Balanced weights: model 35%, keyword sentiment 35%, star ratings 30%
  const base_score =
    ratingResult.count >= 3
      ? 0.35 * dampened_model + 0.35 * sentimentResult.review_signal + 0.30 * ratingResult.signal
      : 0.50 * dampened_model + 0.50 * sentimentResult.review_signal;

  const penalty =
    0.12 * sentimentResult.negative_ratio +
    0.22 * sentimentResult.hard_negative_ratio +
    0.10 * ratingResult.low_share;

  const final_score = Math.max(0, Math.min(1, base_score - penalty));

  const diagnostics: Diagnostics = {
    review_signal: sentimentResult.review_signal,
    negative_ratio: sentimentResult.negative_ratio,
    hard_negative_ratio: sentimentResult.hard_negative_ratio,
    positive_hits: sentimentResult.positive_hits,
    negative_hits: sentimentResult.negative_hits,
    total_hits: sentimentResult.total_hits,
    individual_rating_signal: ratingResult.signal,
    individual_rating_count: ratingResult.count,
    individual_rating_avg: ratingResult.avg,
  };

  return { final_score, model_signal, diagnostics };
}

export function decideLabel(score: number, model_signal: number, d: Diagnostics): Decision {
  const avg = d.individual_rating_avg ?? null;
  const hasEnoughRatings = d.individual_rating_count >= 4;
  const hasEnoughKeywords = d.total_hits >= 8;

  // ── Hard DO NOT BUY: only when negatives CLEARLY dominate ──
  // Ratings are very bad (≤ 2.5 stars with enough data)
  if (hasEnoughRatings && avg !== null && avg <= 2.5) return "DO NOT BUY";
  // Negative keywords overwhelm positive: neg > 65% of all hits
  if (hasEnoughKeywords && d.negative_ratio >= 0.65) return "DO NOT BUY";
  // Hard negatives dominate (serious defects/safety): > 40% of all hits
  if (hasEnoughKeywords && d.hard_negative_ratio >= 0.40) return "DO NOT BUY";
  // Score is very low regardless of keywords
  if (score < 0.44) return "DO NOT BUY";

  // ── BUY: positives clearly dominate ──
  // Positive keywords > 65%, good ratings, score clears threshold
  const positivelyDominant = hasEnoughKeywords
    ? d.negative_ratio < 0.30 && d.hard_negative_ratio < 0.12
    : d.review_signal >= 0.65;
  const ratingsGood = !hasEnoughRatings || (avg !== null && avg >= 3.6);

  if (score >= BUY_THRESHOLD && positivelyDominant && ratingsGood) return "BUY";

  // ── WAIT: balanced or mixed signals — the honest middle ground ──
  if (score >= WAIT_THRESHOLD) return "WAIT";

  return "DO NOT BUY";
}
