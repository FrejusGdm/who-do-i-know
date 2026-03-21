"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { signIn } from "@/lib/auth-client";
import Link from "next/link";

export function Navbar() {
  const handleGetStarted = () => {
    signIn.social({
      provider: "google",
      callbackURL: "/connect",
    });
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.6 }}
      className="fixed top-6 left-0 right-0 z-50 flex justify-center w-full px-4"
    >
      <div className="flex items-center justify-between gap-12 px-2 py-2 pl-6 bg-white/80 backdrop-blur-md rounded-full border border-black/5 shadow-sm">
        <Link 
          href="/" 
          className="text-2xl tracking-tight text-[--brand-ink] hover:opacity-80 transition-opacity flex items-baseline"
        >
          <span className="font-sans font-medium text-xl pb-[1px]">WhoDoYou</span>
          <span className="font-serif italic pl-[2px]">Know</span>
        </Link>
        <Button
          size="sm"
          onClick={handleGetStarted}
          className="bg-[--brand-ink] text-[--brand-cream] hover:bg-black/80 rounded-full font-medium px-6"
        >
          Connect
        </Button>
      </div>
    </motion.nav>
  );
}