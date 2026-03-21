"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { HeroBackground } from "./HeroBackground";
import { signIn } from "@/lib/auth-client";
import { useState } from "react";

export function Hero() {
  const [isDark, setIsDark] = useState(false);

  const handleGetStarted = () => {
    signIn.social({
      provider: "google",
      callbackURL: "/connect",
    });
  };

  const text1 = "You spent years meeting people.";
  const text2 = "Don't lose them.";

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <HeroBackground onThemeChange={setIsDark} />
      <div className="relative z-10 text-center max-w-5xl mx-auto px-6 pt-20">
        <h1 className={`font-serif text-5xl sm:text-6xl md:text-7xl lg:text-[6rem] tracking-tight leading-[1.1] mb-8 transition-colors duration-700 ${isDark ? 'text-white' : 'text-[--brand-ink]'}`}>
          <span className="block">
            {text1.split("").map((char, i) => (
              <motion.span
                key={`t1-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.03, delay: i * 0.03 }}
              >
                {char}
              </motion.span>
            ))}
          </span>
          <span className={`block mt-2 transition-colors duration-700 ${isDark ? 'text-white/70' : 'text-[--brand-muted]'}`}>
            {text2.split("").map((char, i) => (
              <motion.span
                key={`t2-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.03, delay: (text1.length * 0.03) + (i * 0.03) + 0.5 }}
              >
                {char}
              </motion.span>
            ))}
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: (text1.length + text2.length) * 0.03 + 1, duration: 0.6 }}
          className={`text-lg md:text-xl mb-12 max-w-2xl mx-auto font-light transition-colors duration-700 ${isDark ? 'text-white/80' : 'text-[--brand-muted]'}`}
        >
          Connect your Gmail. We scan your history, find every real person
          you&apos;ve ever interacted with, and hand you a clean spreadsheet.
          One time. $9.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: (text1.length + text2.length) * 0.03 + 1.2, duration: 0.4 }}
          className="flex flex-col items-center gap-4"
        >
          <Button
            size="lg"
            onClick={handleGetStarted}
            className={`text-lg px-12 py-7 rounded-full font-medium transition-all duration-300 shadow-xl ${
              isDark 
                ? 'bg-white text-black hover:bg-white/90' 
                : 'bg-[--brand-ink] text-[--brand-cream] hover:bg-black/80 hover:text-[--brand-cream]'
            }`}
          >
            Get My Network — $9
          </Button>
          <p className={`text-sm transition-colors duration-700 ${isDark ? 'text-white/60' : 'text-[--brand-muted]/60'}`}>
            Local processing via Ollama available for privacy-conscious users
          </p>
        </motion.div>
      </div>
    </section>
  );
}
