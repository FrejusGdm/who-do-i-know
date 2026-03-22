"use client";

import { useSession } from "@/lib/auth-client";
import { motion } from "framer-motion";
import { Shield, Mail, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ConnectPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/");
    }
  }, [session, isPending, router]);

  if (isPending) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[--brand-cream]">
        <div className="animate-pulse text-[--brand-muted]">Loading...</div>
      </main>
    );
  }

  if (!session) return null;

  const permissions = [
    {
      icon: Mail,
      label: "Read-only Gmail access",
      detail:
        "We scan your emails to understand your relationships — then delete everything.",
    },
    {
      icon: Shield,
      label: "Processed, never saved",
      detail:
        "Your data passes through AI once and is permanently deleted. Nothing is stored or used for training.",
    },
    {
      icon: Users,
      label: "No modifications",
      detail:
        "We can\u2019t send emails, delete messages, or change anything.",
    },
  ];

  return (
    <main className="min-h-screen flex items-center justify-center bg-[--brand-cream] px-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full text-center"
      >
        {session.user.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt={session.user.name ?? "Profile"}
            className="w-20 h-20 rounded-full mx-auto mb-6 shadow-sm border border-black/5"
          />
        )}
        <h1 className="font-serif text-5xl md:text-6xl tracking-tight text-[--brand-ink] mb-4">
          Connected
        </h1>
        <p className="text-lg text-[--brand-muted] mb-12">
          {session.user.name} &middot; {session.user.email}
        </p>

        <div className="space-y-6 mb-12 text-left bg-white/50 backdrop-blur-sm p-8 rounded-3xl border border-black/5">
          {permissions.map((p) => (
            <div key={p.label} className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-[--brand-ink]/5 flex items-center justify-center shrink-0">
                <p.icon className="w-5 h-5 text-[--brand-ink]" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-medium text-[--brand-ink]">{p.label}</p>
                <p className="text-sm text-[--brand-muted] mt-1 leading-relaxed">{p.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <Link href="/filter">
          <Button
            size="lg"
            className="w-full bg-[--brand-ink] text-[--brand-cream] hover:bg-black/80 rounded-full text-lg py-7 font-medium transition-all duration-300 shadow-xl"
          >
            Configure Your Scan
          </Button>
        </Link>
      </motion.div>
    </main>
  );
}
