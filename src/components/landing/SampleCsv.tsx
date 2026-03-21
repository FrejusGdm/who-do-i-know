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
    <section className="py-24 px-6 bg-[--brand-cream]">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-4xl md:text-5xl tracking-tight text-[--brand-ink] mb-4">
            Here&apos;s what you get
          </h2>
          <p className="text-lg text-[--brand-muted]">A clean, actionable spreadsheet of your entire network.</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="overflow-x-auto rounded-3xl border border-black/5 bg-white/50 backdrop-blur-sm p-2 shadow-sm mb-6"
        >
          <div className="overflow-hidden rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-black/5 text-[--brand-ink]">
                  <th className="text-left p-4 font-medium">Name</th>
                  <th className="text-left p-4 font-medium">Email</th>
                  <th className="text-left p-4 font-medium">Type</th>
                  <th className="text-left p-4 font-medium">Summary</th>
                  <th className="text-left p-4 font-medium">Emails</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {sampleData.map((row, i) => (
                  <tr key={row.email} className={i !== sampleData.length - 1 ? "border-b border-black/5" : ""}>
                    <td className="p-4 font-medium text-[--brand-ink]">{row.name}</td>
                    <td className="p-4 text-[--brand-muted]">{row.email}</td>
                    <td className="p-4">
                      <span className="px-3 py-1 rounded-full bg-black/5 text-[--brand-ink] text-xs font-medium">
                        {row.type}
                      </span>
                    </td>
                    <td className="p-4 text-[--brand-muted]">{row.summary}</td>
                    <td className="p-4 text-center text-[--brand-muted]">{row.emails}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center"
        >
          <a 
            href="/sample.csv" 
            download
            className="inline-flex items-center justify-center text-sm font-medium text-[--brand-muted] hover:text-[--brand-ink] transition-colors border border-transparent hover:border-black/5 bg-transparent hover:bg-white/50 rounded-full px-4 py-2"
          >
            Download sample .csv
          </a>
        </motion.div>
      </div>
    </section>
  );
}
