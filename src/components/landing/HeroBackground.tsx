"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const BACKGROUNDS = [
  { id: "none", label: "Clean" },
  { id: "/assets/bg-minimal-abstract.png", label: "Abstract" },
  { id: "/assets/bg-realistic-workspace.png", label: "Workspace" },
  { id: "/assets/bg-stylized-illustration.png", label: "Vector" },
  { id: "/assets/bg-dark-moody.png", label: "Dark Mode" },
];

interface HeroBackgroundProps {
  onThemeChange?: (isDark: boolean) => void;
}

export function HeroBackground({ onThemeChange }: HeroBackgroundProps) {
  const [activeBg, setActiveBg] = useState(BACKGROUNDS[1].id);

  useEffect(() => {
    if (onThemeChange) {
      onThemeChange(activeBg.includes("dark-moody"));
    }
  }, [activeBg, onThemeChange]);

  return (
    <>
      <div className="absolute inset-0 z-0 bg-[--brand-cream] overflow-hidden">
        {/* Base clean gradient background */}
        <div className="absolute inset-0 transition-opacity duration-1000">
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[radial-gradient(circle,rgba(0,0,0,0.03)_0%,transparent_70%)] blur-3xl" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[radial-gradient(circle,rgba(0,0,0,0.02)_0%,transparent_70%)] blur-3xl" />
        </div>

        {/* Selected Image Background */}
        <AnimatePresence mode="wait">
          {activeBg !== "none" && (
            <motion.div
              key={activeBg}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
              className="absolute inset-0"
              style={{
                backgroundImage: `url('${activeBg}')`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {/* Overlay to ensure text remains readable */}
              <div 
                className={`absolute inset-0 ${
                  activeBg.includes("dark-moody") 
                    ? "bg-black/60" 
                    : "bg-white/70 backdrop-blur-[2px]"
                }`} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Dev-only Toggle Control */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex gap-2 p-2 bg-white/80 backdrop-blur-md rounded-full border border-black/10 shadow-lg">
        {BACKGROUNDS.map((bg) => (
          <button
            key={bg.id}
            onClick={() => setActiveBg(bg.id)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              activeBg === bg.id
                ? "bg-[--brand-ink] text-[--brand-cream]"
                : "text-[--brand-muted] hover:bg-black/5"
            }`}
          >
            {bg.label}
          </button>
        ))}
      </div>
    </>
  );
}
