"use client";

import { motion } from "framer-motion";
import { Shield, Trash2, Eye } from "lucide-react";

const badges = [
  {
    icon: Eye,
    title: "100% Read-Only",
    description: "We never send emails or modify your account. We only read history to map your network.",
  },
  {
    icon: Trash2,
    title: "0 Data Retained",
    description: "Your entire dataset is permanently purged from our servers within 15 minutes of processing.",
  },
  {
    icon: Shield,
    title: "No Account Needed",
    description: "Pay once, download, and you're done. We deliberately forget everything about you.",
  },
];

export function TrustBadges() {
  return (
    <section className="py-32 px-6 bg-[--brand-cream] border-t border-black/5">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between gap-16 md:gap-8">
        {badges.map((badge, i) => (
          <motion.div
            key={badge.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.15, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            viewport={{ once: true, margin: "-100px" }}
            className="flex-1 flex flex-col items-center text-center group"
          >
            <h3 className="font-serif text-5xl md:text-6xl tracking-tight text-[--brand-ink] mb-6">
              {badge.title}
            </h3>
            <p className="text-lg text-[--brand-muted] leading-relaxed max-w-[280px]">
              {badge.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
