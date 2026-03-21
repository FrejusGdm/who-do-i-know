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
    <section className="py-20 px-6">
      <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8">
        {badges.map((badge, i) => (
          <motion.div
            key={badge.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.5 }}
            viewport={{ once: true }}
            className="text-center"
          >
            <badge.icon className="w-8 h-8 mx-auto mb-4 text-[--brand-ink]" />
            <h3 className="font-semibold text-lg mb-2">{badge.title}</h3>
            <p className="text-[--brand-muted] text-sm">{badge.description}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
