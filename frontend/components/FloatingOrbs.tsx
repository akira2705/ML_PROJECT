"use client";
import { motion } from "framer-motion";

const orbs = [
  { w: 600, h: 600, x: "-10%", y: "-20%", color: "rgba(124,58,237,0.12)", dur: 18 },
  { w: 500, h: 500, x: "60%",  y: "50%",  color: "rgba(16,185,129,0.08)", dur: 22 },
  { w: 400, h: 400, x: "30%",  y: "-10%", color: "rgba(59,130,246,0.07)", dur: 15 },
  { w: 350, h: 350, x: "80%",  y: "10%",  color: "rgba(245,158,11,0.06)", dur: 25 },
];

export default function FloatingOrbs() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {orbs.map((orb, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full blur-3xl"
          style={{ width: orb.w, height: orb.h, left: orb.x, top: orb.y, background: orb.color }}
          animate={{
            x: [0, 40, -30, 20, 0],
            y: [0, -30, 20, -10, 0],
            scale: [1, 1.08, 0.95, 1.04, 1],
          }}
          transition={{ duration: orb.dur, repeat: Infinity, ease: "easeInOut", times: [0, 0.25, 0.5, 0.75, 1] }}
        />
      ))}
    </div>
  );
}
