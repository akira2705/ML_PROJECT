"use client";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ParticleField from "@/components/ParticleField";
import FloatingOrbs from "@/components/FloatingOrbs";
import FlowChart from "@/components/FlowChart";
import DecisionCard from "@/components/DecisionCard";
import ScoreRing from "@/components/ScoreRing";
import StatsGrid from "@/components/StatsGrid";
import ScoreChart from "@/components/ScoreChart";
import type { Step, AnalyzeResult } from "@/types";

const INITIAL_STEPS: Step[] = [
  { id: "fetching",  label: "Fetch Product",   detail: "", status: "idle" },
  { id: "scraping",  label: "Extract Reviews",  detail: "", status: "idle" },
  { id: "inference", label: "AI Models",        detail: "", status: "idle" },
  { id: "scoring",   label: "Score & Decide",   detail: "", status: "idle" },
];

const TITLE_WORDS = ["Purchase", "Decision", "Engine"];

export default function Home() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<"intro" | "loading" | "result">("intro");
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  function updateStep(id: string, patch: Partial<Step>) {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setError(null);
    setResult(null);
    setSteps(INITIAL_STEPS);
    setPhase("loading");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            const { step, status } = evt;
            if (status === "running") updateStep(step, { status: "running" });
            if (status === "error") {
              updateStep(step, { status: "error" });
              setError(evt.error || "Something went wrong.");
              return;
            }
            if (status === "done") {
              updateStep(step, { status: "done" });
              if (step === "scoring" && evt.result) {
                setResult(evt.result);
                setTimeout(() => {
                  setPhase("result");
                  setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 300);
                }, 800);
              }
            }
          } catch {}
        }
      }
    } catch {
      setError("Network error.");
      setPhase("intro");
    }
  }

  return (
    <div className="relative min-h-screen bg-surface text-white overflow-x-hidden">
      <ParticleField />
      <FloatingOrbs />

      {/* ── INTRO ── */}
      <AnimatePresence mode="wait">
        {phase === "intro" && (
          <motion.div
            key="intro"
            className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center"
            exit={{ opacity: 0, y: -80, scale: 0.92, transition: { duration: 0.55, ease: [0.4, 0, 0.2, 1] } }}
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/20 border border-accent/30 text-accent text-xs font-semibold tracking-widest uppercase mb-8"
            >
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.6 }}
                className="w-1.5 h-1.5 rounded-full bg-accent inline-block"
              />
              AI Powered · Real-time Analysis
            </motion.div>

            {/* Animated title — each word flies in */}
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mb-6">
              {TITLE_WORDS.map((word, i) => (
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 60, rotateX: -40 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={{ delay: 0.25 + i * 0.15, type: "spring", stiffness: 160, damping: 18 }}
                  className="text-6xl sm:text-7xl md:text-8xl font-black leading-none"
                  style={{
                    background: i === 1
                      ? "linear-gradient(135deg,#7c3aed,#3b82f6,#10b981)"
                      : "linear-gradient(135deg,#fff,#c4b5fd)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  {word}
                </motion.span>
              ))}
            </div>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.75 }}
              className="text-muted text-lg sm:text-xl max-w-lg mb-12"
            >
              Paste an Amazon link. AI scrapes reviews, runs dual ML models, and tells you exactly whether to&nbsp;
              <span className="text-success font-semibold">Buy</span>,&nbsp;
              <span className="text-warn font-semibold">Wait</span>, or&nbsp;
              <span className="text-danger font-semibold">Skip</span>.
            </motion.p>

            {/* Input */}
            <motion.form
              onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="w-full max-w-2xl flex flex-col sm:flex-row gap-3"
            >
              <div className="relative flex-1">
                <motion.div
                  className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-accent via-blue-500 to-success opacity-0 blur-sm"
                  whileFocus={{ opacity: 0.5 }}
                />
                <input
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://www.amazon.in/dp/..."
                  className="relative w-full bg-card border border-border rounded-2xl px-5 py-4 text-sm text-white placeholder-muted outline-none focus:border-accent transition-all"
                />
              </div>
              <motion.button
                type="submit"
                disabled={!url.trim()}
                whileHover={{ scale: 1.04, boxShadow: "0 0 40px rgba(124,58,237,0.5)" }}
                whileTap={{ scale: 0.96 }}
                className="relative px-8 py-4 rounded-2xl font-bold text-sm text-white disabled:opacity-40 overflow-hidden"
                style={{ background: "linear-gradient(135deg,#7c3aed,#3b82f6)" }}
              >
                <motion.div
                  className="absolute inset-0 bg-white/10"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.5 }}
                />
                <span className="relative">Analyze →</span>
              </motion.button>
            </motion.form>

            {/* Feature pills */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
              className="flex flex-wrap justify-center gap-2 mt-8"
            >
              {["Dual ML Models", "Live Review Scraping", "Sentiment Analysis", "Star Rating Signal", "Playwright Fallback"].map(f => (
                <span key={f} className="px-3 py-1 rounded-full text-xs text-muted border border-border bg-card/50">
                  {f}
                </span>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LOADING ── */}
      <AnimatePresence mode="wait">
        {phase === "loading" && (
          <motion.div
            key="loading"
            className="relative z-10 min-h-screen flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
          >
            {/* Mini header */}
            <motion.div
              initial={{ y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface/80 backdrop-blur-md"
            >
              <span className="font-black text-lg bg-gradient-to-r from-white to-accent bg-clip-text text-transparent">
                PDE
              </span>
              <span className="text-xs text-muted truncate max-w-xs">{url}</span>
              <motion.div
                className="w-2 h-2 rounded-full bg-accent"
                animate={{ scale: [1, 1.6, 1], opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1 }}
              />
            </motion.div>

            {/* Flow chart */}
            <div className="flex-1 flex flex-col items-center justify-center py-16">
              <motion.div
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 140 }}
                className="w-full"
              >
                <FlowChart steps={steps} />
              </motion.div>

              {error && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 text-sm text-danger">
                  {error}
                </motion.p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── RESULT ── */}
      <AnimatePresence mode="wait">
        {phase === "result" && result && (
          <motion.div
            key="result"
            ref={resultRef}
            className="relative z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {/* Sticky mini header */}
            <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 border-b border-border bg-surface/90 backdrop-blur-md">
              <motion.button
                onClick={() => { setPhase("intro"); setResult(null); setUrl(""); setSteps(INITIAL_STEPS); }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="flex items-center gap-2 text-sm text-muted hover:text-white transition-colors"
              >
                ← Analyze another
              </motion.button>
              <span className="font-black text-sm bg-gradient-to-r from-white to-accent bg-clip-text text-transparent">
                Purchase Decision Engine
              </span>
              <span className="text-xs text-muted hidden sm:block truncate max-w-xs">{url}</span>
            </div>

            <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
              {/* Decision */}
              <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, delay: 0.05 }}>
                <DecisionCard decision={result.decision} />
              </motion.div>

              {/* Score rings */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="bg-card border border-border rounded-3xl p-8"
              >
                <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-8 text-center">Model Scores</p>
                <div className="flex flex-wrap justify-center gap-8 sm:gap-12">
                  <ScoreRing value={result.viability_score} label="Viability" color="#10b981" size={130} />
                  <ScoreRing value={1 - result.regret_score} label="Anti-Regret" color="#7c3aed" size={130} />
                  <ScoreRing value={result.model_signal} label="Model Signal" color="#3b82f6" size={130} />
                  <ScoreRing value={result.final_score} label="Final Score" color="#f59e0b" size={130} />
                </div>
              </motion.div>

              {/* Chart */}
              <ScoreChart viability={result.viability_score} regret={result.regret_score} final={result.final_score} />

              {/* Stats */}
              <StatsGrid
                d={result.diagnostics}
                viability={result.viability_score}
                regret={result.regret_score}
                final={result.final_score}
                modelSignal={result.model_signal}
                starRating={result.star_rating}
              />

              {/* Image + Reviews */}
              <div className="grid sm:grid-cols-2 gap-4">
                {result.product_image && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 }}
                    className="bg-card border border-border rounded-2xl p-5 flex items-center justify-center min-h-[220px]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={result.product_image} alt="Product" className="max-h-60 object-contain rounded-xl" />
                  </motion.div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55 }}
                  className="bg-card border border-border rounded-2xl p-5 flex flex-col min-h-[220px]"
                >
                  <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Reviews Captured</p>
                  <textarea
                    readOnly
                    value={result.reviews || "No review text captured."}
                    className="flex-1 bg-transparent text-sm text-muted resize-none outline-none leading-relaxed"
                  />
                </motion.div>
              </div>

              {/* Footnote */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="text-center text-xs text-muted pb-6"
              >
                Decision thresholds: BUY ≥ 60% · WAIT ≥ 50% · DO NOT BUY &lt; 50%
                {result.regret_derived && " · Regret derived as 1 – Viability"}
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
