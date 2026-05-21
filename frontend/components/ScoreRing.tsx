"use client";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect } from "react";

interface Props {
  value: number;       // 0-1
  label: string;
  color: string;       // tailwind hex
  size?: number;
  thickness?: number;
}

export default function ScoreRing({ value, label, color, size = 120, thickness = 10 }: Props) {
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const progress = useMotionValue(0);
  const dashoffset = useTransform(progress, (v) => circ * (1 - v));

  useEffect(() => {
    const ctrl = animate(progress, value, { duration: 1.2, ease: "easeOut" });
    return ctrl.stop;
  }, [value]);

  const pct = Math.round(value * 100);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e1e30" strokeWidth={thickness} />
          <motion.circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="round"
            strokeDasharray={circ}
            style={{ strokeDashoffset: dashoffset }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            className="text-xl font-bold text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            {pct}%
          </motion.span>
        </div>
      </div>
      <p className="text-xs text-muted font-medium text-center">{label}</p>
    </div>
  );
}
