"use client";

import { motion } from "framer-motion";
import { Shield, Trash2, Eye } from "lucide-react";

const badges = [
  {
    icon: Eye,
    title: "Your outreach",
    description: "Keep track of when to reconnect. The app does not send messages to your contacts.",
  },
  {
    icon: Trash2,
    title: "Saved memory",
    description: "Your notes and relationship history are saved in your private workspace for future conversations.",
  },
  {
    icon: Shield,
    title: "Private access",
    description: "An authorized account is required to open your workspace and read your relationship notes.",
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
