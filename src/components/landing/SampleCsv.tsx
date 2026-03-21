"use client";

import { motion } from "framer-motion";

const sampleData = [
  {
    name: "Sarah C.",
    email: "sarah@university.edu",
    type: "classmate",
    summary: "CS 301 project partner, Fall 2022",
    emails: 14,
  },
  {
    name: "Prof. Martinez",
    email: "martinez@cs.edu",
    type: "professor",
    summary: "Research advisor, recommendation letters",
    emails: 23,
  },
  {
    name: "Alex T.",
    email: "alex@startup.io",
    type: "professional",
    summary: "Met at hackathon, discussed internship",
    emails: 8,
  },
];

export function SampleCsv() {
  return (
    <section className="py-20 px-6 bg-white/50">
      <div className="max-w-4xl mx-auto">
        <motion.h2
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="font-serif text-3xl md:text-4xl font-bold text-center mb-12"
        >
          Here&apos;s what you get
        </motion.h2>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="overflow-x-auto rounded-lg border border-[--brand-muted]/20"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[--brand-ink] text-[--brand-cream]">
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Summary</th>
                <th className="text-left p-3">Emails</th>
              </tr>
            </thead>
            <tbody>
              {sampleData.map((row) => (
                <tr key={row.email} className="border-t border-[--brand-muted]/10">
                  <td className="p-3 font-medium">{row.name}</td>
                  <td className="p-3 text-[--brand-muted]">{row.email}</td>
                  <td className="p-3">
                    <span className="px-2 py-1 rounded-full bg-[--brand-ink]/10 text-[--brand-ink] text-xs font-medium">
                      {row.type}
                    </span>
                  </td>
                  <td className="p-3 text-[--brand-muted]">{row.summary}</td>
                  <td className="p-3 text-center">{row.emails}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
        <p className="text-center text-[--brand-muted] text-sm mt-4">
          Sample data — your real CSV will have full details for every contact
        </p>
      </div>
    </section>
  );
}
