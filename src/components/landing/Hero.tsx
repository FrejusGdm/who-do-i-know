"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export function Hero() {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!headingRef.current) return;
    const words = headingRef.current.querySelectorAll(".word");
    gsap.fromTo(
      words,
      { y: 60, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.08, duration: 0.9, ease: "power3.out" }
    );
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <div className="relative z-10 text-center max-w-4xl mx-auto px-6">
        <h1
          ref={headingRef}
          className="font-serif text-6xl md:text-8xl font-black tracking-tight text-[--brand-ink] leading-none mb-8"
        >
          {"You spent years meeting people.".split(" ").map((w, i) => (
            <span key={i} className="word inline-block mr-4">
              {w}
            </span>
          ))}
          <br />
          <span className="word inline-block text-[--brand-gold]">
            Don&apos;t lose them.
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="text-xl text-[--brand-muted] mb-12 max-w-2xl mx-auto"
        >
          Connect your Gmail. We scan your history, find every real person
          you&apos;ve ever interacted with, and hand you a clean spreadsheet.
          One time. $9.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.1 }}
        >
          <Button
            size="lg"
            className="bg-[--brand-ink] text-[--brand-cream] hover:bg-[--brand-gold] hover:text-[--brand-ink] text-lg px-10 py-6 font-semibold transition-all duration-300"
          >
            Get My Network — $9
          </Button>
        </motion.div>
      </div>
    </section>
  );
}
