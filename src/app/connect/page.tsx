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
      detail: "We read email metadata only — never full content",
    },
    {
      icon: Users,
      label: "Read-only Contacts",
      detail: "Used to improve name resolution accuracy",
    },
    {
      icon: Shield,
      label: "No modifications",
      detail: "We will never send emails or modify your account",
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
            className="w-16 h-16 rounded-full mx-auto mb-4"
          />
        )}
        <h1 className="font-serif text-4xl font-bold mb-2">
          Connected
        </h1>
        <p className="text-[--brand-muted] mb-8">
          {session.user.name} — {session.user.email}
        </p>

        <div className="space-y-4 mb-8 text-left">
          {permissions.map((p) => (
            <div key={p.label} className="flex items-start gap-3">
              <p.icon className="w-5 h-5 text-[--brand-gold] mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">{p.label}</p>
                <p className="text-xs text-[--brand-muted]">{p.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <Link href="/filter">
          <Button
            size="lg"
            className="w-full bg-[--brand-ink] text-white border border-[--brand-ink] hover:bg-white hover:text-[--brand-ink] font-semibold transition-all duration-300"
          >
            Configure Your Scan
          </Button>
        </Link>
      </motion.div>
    </main>
  );
}
