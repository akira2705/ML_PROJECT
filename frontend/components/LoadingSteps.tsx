"use client";
import { motion, AnimatePresence } from "framer-motion";
import type { Step } from "@/types";

const icons: Record<string, string> = {
  fetching: "🌐",
  scraping: "🔍",
  inference: "🧠",
  scoring: "⚖️",
};

export default function LoadingSteps({ steps }: { steps: Step[] }) {
  return (
    <div className="flex flex-col gap-4 w-full max-w-lg mx-auto">
      {steps.map((step, i) => (
        <motion.div
          key={step.id}
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08, type: "spring", stiffness: 200 }}
          className="flex items-center gap-4 bg-card border border-border rounded-2xl px-5 py-4"
        >
          {/* Status indicator */}
          <div className="relative w-9 h-9 shrink-0 flex items-center justify-center">
            {step.status === "running" && (
              <motion.span
                className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
              />
            )}
            {step.status === "done" && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-9 h-9 rounded-full bg-success/20 border border-success flex items-center justify-center text-success text-sm"
              >
                ✓
              </motion.div>
            )}
            {step.status === "error" && (
              <div className="w-9 h-9 rounded-full bg-danger/20 border border-danger flex items-center justify-center text-danger text-sm">✕</div>
            )}
            {step.status === "idle" && (
              <div className="w-9 h-9 rounded-full bg-border flex items-center justify-center text-muted text-lg">{icons[step.id]}</div>
            )}
            {step.status === "running" && (
              <span className="text-lg">{icons[step.id]}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${step.status === "done" ? "text-success" : step.status === "running" ? "text-white" : "text-muted"}`}>
              {step.label}
            </p>
            <p className="text-xs text-muted truncate">{step.detail}</p>
          </div>

          <AnimatePresence>
            {step.status === "running" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.4 }}
                className="text-xs text-accent font-medium"
              >
                Running…
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}
