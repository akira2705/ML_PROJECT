"use client";
import { motion } from "framer-motion";
import type { Decision } from "@/types";

const config: Record<Decision, { color: string; bg: string; border: string; glow: string; emoji: string; sub: string }> = {
  BUY: {
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/40",
    glow: "shadow-[0_0_60px_rgba(16,185,129,0.25)]",
    emoji: "✅",
    sub: "Strong positive signals — go for it.",
  },
  WAIT: {
    color: "text-warn",
    bg: "bg-warn/10",
    border: "border-warn/40",
    glow: "shadow-[0_0_60px_rgba(245,158,11,0.20)]",
    emoji: "⏳",
    sub: "Mixed signals — consider waiting or researching more.",
  },
  "DO NOT BUY": {
    color: "text-danger",
    bg: "bg-danger/10",
    border: "border-danger/40",
    glow: "shadow-[0_0_60px_rgba(239,68,68,0.20)]",
    emoji: "🚫",
    sub: "Negative signals detected — not recommended.",
  },
};

export default function DecisionCard({ decision }: { decision: Decision }) {
  const c = config[decision];
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 180, damping: 16 }}
      className={`rounded-3xl border px-8 py-8 text-center ${c.bg} ${c.border} ${c.glow}`}
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
        className="text-5xl mb-4"
      >
        {c.emoji}
      </motion.div>
      <p className="text-xs font-semibold text-muted tracking-widest uppercase mb-1">AI Recommendation</p>
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`text-4xl font-black ${c.color}`}
      >
        {decision}
      </motion.h2>
      <p className="text-sm text-muted mt-2">{c.sub}</p>
    </motion.div>
  );
}
