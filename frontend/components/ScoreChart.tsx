"use client";
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { motion } from "framer-motion";

export default function ScoreChart({ viability, regret, final }: { viability: number; regret: number; final: number }) {
  const data = [
    { name: "Viability", value: parseFloat((viability * 100).toFixed(1)), fill: "#10b981" },
    { name: "Regret", value: parseFloat((regret * 100).toFixed(1)), fill: "#ef4444" },
    { name: "Final Score", value: parseFloat((final * 100).toFixed(1)), fill: "#f59e0b" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-card border border-border rounded-2xl p-5"
    >
      <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-4">Score Chart</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} barCategoryGap="35%">
          <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 12 }} axisLine={false} tickLine={false} unit="%" />
          <Tooltip
            contentStyle={{ background: "#13131f", border: "1px solid #1e1e30", borderRadius: 12, color: "#fff", fontSize: 13 }}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            formatter={(v: number) => [`${v}%`]}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
