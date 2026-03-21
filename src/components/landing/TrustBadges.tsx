"use client";

import { motion } from "framer-motion";
import { Shield, Trash2, Eye } from "lucide-react";

const badges = [
  {
    icon: Eye,
    title: "Read-only Gmail access",
    description: "We never send emails or modify your account",
  },
  {
    icon: Trash2,
    title: "Data deleted after download",
    description: "Your data is permanently purged within 15 minutes",
  },
  {
    icon: Shield,
    title: "No account required",
    description: "Pay, download, done. We forget everything.",
  },
];

export function TrustBadges() {
  return (
    <section className="py-24 px-6 bg-[--brand-cream]">
      <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
        {badges.map((badge, i) => (
          <motion.div
            key={badge.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.5 }}
            viewport={{ once: true }}
            className="p-8 rounded-3xl border border-black/5 bg-white/50 backdrop-blur-sm"
          >
            <div className="w-12 h-12 rounded-full bg-[--brand-ink] flex items-center justify-center mb-6">
              <badge.icon className="w-5 h-5 text-[--brand-cream]" strokeWidth={1.5} />
            </div>
            <h3 className="font-serif text-2xl mb-3 text-[--brand-ink]">{badge.title}</h3>
            <p className="text-[--brand-muted] leading-relaxed">{badge.description}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
