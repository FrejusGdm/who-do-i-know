"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { HeroBackground } from "./HeroBackground";
import { signIn } from "@/lib/auth-client";

export function Hero() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetStarted = () => {
    setIsLoading(true);
    signIn.social({
      provider: "google",
      callbackURL: "/connect",
    });
  };

  const text1 = "You spent years meeting people.";
  const text2 = "Don't lose them.";

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <HeroBackground />
      <div className="relative z-10 text-center max-w-5xl mx-auto px-6 pt-20">
        <h1 className="font-serif text-5xl sm:text-6xl md:text-7xl lg:text-[6rem] tracking-tight text-[--brand-ink] leading-[1.1] mb-8">
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
          <span className="block mt-2 text-[--brand-muted]">
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
          className="text-lg md:text-xl text-[--brand-muted] mb-12 max-w-2xl mx-auto font-light"
        >
          Connect your Gmail. We scan your history, find every real person
          you&apos;ve ever interacted with, and hand you a clean spreadsheet.
          100% free.
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
            disabled={isLoading}
            className="bg-[--brand-ink] text-[--brand-cream] hover:bg-black/80 hover:text-[--brand-cream] text-lg px-12 py-7 rounded-full font-medium transition-all duration-300 shadow-xl disabled:opacity-70"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-[--brand-cream]/30 border-t-[--brand-cream] rounded-full animate-spin" />
                Connecting...
              </span>
            ) : (
              "Get My Network — Free"
            )}
          </Button>
          <p className="text-sm text-[--brand-muted]/60 flex items-center justify-center gap-1.5">
            Local processing via 
            <a 
              href="https://ollama.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[--brand-muted] hover:text-[--brand-ink] transition-colors font-medium border-b border-transparent hover:border-[--brand-ink]/20 pb-[1px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://ollama.com/public/icon-64x64.png" alt="Ollama" className="w-3.5 h-3.5 grayscale opacity-70" />
              Ollama
            </a>
            available for privacy-conscious users
          </p>
        </motion.div>
      </div>
    </section>
  );
}
