"use client";
import { motion } from "framer-motion";
import type { Diagnostics } from "@/types";

function pct(v: number) { return `${(v * 100).toFixed(1)}%`; }
function bar(v: number, color: string) {
  return (
    <div className="w-full h-1.5 bg-border rounded-full overflow-hidden mt-1.5">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${v * 100}%` }}
        transition={{ duration: 0.9, ease: "easeOut" }}
        className="h-full rounded-full"
        style={{ background: color }}
      />
    </div>
  );
}

function StatCard({ label, value, sub, color, delay }: { label: string; value: string; sub?: string; color: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 160 }}
      className="bg-card border border-border rounded-2xl p-4"
    >
      <p className="text-xs text-muted font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </motion.div>
  );
}

export default function StatsGrid({ d, viability, regret, final, modelSignal, starRating }: {
  d: Diagnostics;
  viability: number;
  regret: number;
  final: number;
  modelSignal: number;
  starRating: number | null;
}) {
  return (
    <div className="space-y-4">
      <motion.h3 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-semibold text-muted uppercase tracking-widest">
        Score Breakdown
      </motion.h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Viability Score" value={pct(viability)} color="#10b981" delay={0.05} />
        <StatCard label="Regret Score" value={pct(regret)} color="#ef4444" delay={0.1} />
        <StatCard label="Model Signal" value={pct(modelSignal)} color="#7c3aed" delay={0.15} />
        <StatCard label="Final Score" value={pct(final)} color="#f59e0b" delay={0.2} />
      </div>

      <motion.h3 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }} className="text-sm font-semibold text-muted uppercase tracking-widest pt-2">
        Review Analysis
      </motion.h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-muted">Review Sentiment</span>
              <span className="text-success font-semibold">{pct(d.review_signal)}</span>
            </div>
            {bar(d.review_signal, "#10b981")}
          </div>
          <div>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-muted">Negative Ratio</span>
              <span className="text-danger font-semibold">{pct(d.negative_ratio)}</span>
            </div>
            {bar(d.negative_ratio, "#ef4444")}
          </div>
          <div>
            <div className="flex justify-between text-xs mb-0.5">
              <span className="text-muted">Hard Negative Ratio</span>
              <span className="text-danger font-semibold">{pct(d.hard_negative_ratio)}</span>
            </div>
            {bar(d.hard_negative_ratio, "#dc2626")}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <p className="text-xs text-muted font-medium">Keyword Hits</p>
          <div className="flex gap-4 mt-1">
            <div>
              <p className="text-2xl font-bold text-success">+{d.positive_hits}</p>
              <p className="text-xs text-muted">Positive</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-danger">-{d.negative_hits}</p>
              <p className="text-xs text-muted">Negative</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{d.total_hits}</p>
              <p className="text-xs text-muted">Total</p>
            </div>
          </div>
          {d.individual_rating_count > 0 && (
            <div className="pt-2 border-t border-border mt-2">
              <p className="text-xs text-muted">Rating avg from reviews</p>
              <p className="text-xl font-bold text-white">{d.individual_rating_avg?.toFixed(2)}<span className="text-sm text-muted">/5</span></p>
              <p className="text-xs text-muted">{d.individual_rating_count} reviews parsed</p>
            </div>
          )}
          {starRating && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted">Amazon Star Rating</p>
              <p className="text-xl font-bold text-warn">{"★".repeat(Math.round(starRating))} {starRating.toFixed(1)}</p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
