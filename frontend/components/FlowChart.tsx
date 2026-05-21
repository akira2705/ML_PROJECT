"use client";
import { motion, AnimatePresence } from "framer-motion";
import type { Step, StepId } from "@/types";

const SUB_STEPS: Record<StepId, string[]> = {
  fetching:  ["Connecting to Amazon", "Downloading HTML", "Bot-wall check"],
  scraping:  ["Parsing DOM structure", "Finding review blocks", "Extracting star ratings"],
  inference: ["Tokenizing review text", "Viability model →", "Regret model →"],
  scoring:   ["Blending signals", "Applying penalties", "Threshold check"],
};

const ICONS: Record<StepId, string> = {
  fetching:  "🌐",
  scraping:  "🔍",
  inference: "🧠",
  scoring:   "⚖️",
};

const COLORS: Record<string, { ring: string; glow: string; text: string; bg: string }> = {
  idle:    { ring: "border-border",       glow: "",                                              text: "text-muted",   bg: "bg-card" },
  running: { ring: "border-accent",       glow: "shadow-[0_0_24px_rgba(124,58,237,0.5)]",        text: "text-white",   bg: "bg-accent/10" },
  done:    { ring: "border-success",      glow: "shadow-[0_0_16px_rgba(16,185,129,0.35)]",       text: "text-success", bg: "bg-success/10" },
  error:   { ring: "border-danger",       glow: "shadow-[0_0_16px_rgba(239,68,68,0.35)]",        text: "text-danger",  bg: "bg-danger/10" },
};

function Connector({ active, done }: { active: boolean; done: boolean }) {
  return (
    <div className="hidden sm:flex flex-col items-center justify-center w-12 shrink-0 mt-8">
      <div className="relative w-full h-0.5 bg-border overflow-hidden rounded-full">
        {done && (
          <motion.div
            className="absolute inset-y-0 left-0 bg-success"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 0.4 }}
          />
        )}
        {active && (
          <motion.div
            className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-accent to-transparent"
            animate={{ x: ["-100%", "200%"] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
          />
        )}
      </div>
      {active && (
        <motion.div
          className="w-2 h-2 mt-0.5 rounded-full bg-accent"
          animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
          transition={{ repeat: Infinity, duration: 0.8 }}
        />
      )}
    </div>
  );
}

export default function FlowChart({ steps }: { steps: Step[] }) {
  return (
    <div className="w-full max-w-5xl mx-auto px-4">
      <motion.p
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center text-xs font-semibold tracking-widest text-muted uppercase mb-8"
      >
        Analysis Pipeline
      </motion.p>

      {/* Flow nodes */}
      <div className="flex flex-col sm:flex-row items-start justify-center gap-0">
        {steps.map((step, i) => {
          const c = COLORS[step.status];
          const isRunning = step.status === "running";
          const isDone = step.status === "done";
          const subs = SUB_STEPS[step.id];

          return (
            <div key={step.id} className="flex flex-row sm:flex-col items-start sm:items-center w-full sm:w-auto">
              {/* Node */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, type: "spring", stiffness: 200 }}
                className={`relative border-2 rounded-2xl p-4 w-full sm:w-44 transition-all duration-300 ${c.ring} ${c.glow} ${c.bg}`}
              >
                {/* Pulse ring when running */}
                {isRunning && (
                  <motion.div
                    className="absolute -inset-1 rounded-2xl border-2 border-accent"
                    animate={{ opacity: [0.6, 0, 0.6], scale: [1, 1.04, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  />
                )}

                <div className="flex sm:flex-col items-center sm:items-center gap-3 sm:gap-2">
                  {/* Icon + spinner */}
                  <div className="relative shrink-0 w-10 h-10 flex items-center justify-center">
                    {isRunning && (
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-accent border-t-transparent"
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                      />
                    )}
                    <span className="text-xl">{ICONS[step.id]}</span>
                  </div>

                  <div className="sm:text-center">
                    <p className={`text-sm font-bold ${c.text}`}>{step.label}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {isDone ? "Complete ✓" : isRunning ? "Processing…" : "Waiting"}
                    </p>
                  </div>
                </div>

                {/* Sub-steps */}
                <AnimatePresence>
                  {(isRunning || isDone) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mt-3 space-y-1.5"
                    >
                      {subs.map((sub, si) => (
                        <motion.div
                          key={sub}
                          initial={{ x: -12, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          transition={{ delay: si * 0.18 }}
                          className="flex items-center gap-1.5"
                        >
                          <motion.div
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? "bg-success" : si === 0 && isRunning ? "bg-accent" : "bg-muted"}`}
                            animate={isRunning && si === 0 ? { scale: [1, 1.5, 1] } : {}}
                            transition={{ repeat: Infinity, duration: 0.8 }}
                          />
                          <p className="text-xs text-muted">{sub}</p>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Connector (not after last node) */}
              {i < steps.length - 1 && (
                <div className="sm:hidden flex flex-col items-center ml-5 mt-1 mb-1 h-6">
                  <div className="w-0.5 flex-1 bg-border relative overflow-hidden">
                    {isDone && <motion.div className="absolute inset-x-0 top-0 bg-success" initial={{ height: 0 }} animate={{ height: "100%" }} transition={{ duration: 0.3 }} />}
                  </div>
                </div>
              )}
              {i < steps.length - 1 && (
                <Connector active={isRunning} done={isDone} />
              )}
            </div>
          );
        })}
      </div>

      {/* Overall progress bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 max-w-md mx-auto"
      >
        <div className="flex justify-between text-xs text-muted mb-2">
          <span>Progress</span>
          <span>{steps.filter(s => s.status === "done").length} / {steps.length} steps</span>
        </div>
        <div className="h-1 bg-border rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-accent via-blue-500 to-success rounded-full"
            animate={{ width: `${(steps.filter(s => s.status === "done").length / steps.length) * 100}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </motion.div>
    </div>
  );
}
