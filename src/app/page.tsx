import { Hero } from "@/components/landing/Hero";
import { TrustBadges } from "@/components/landing/TrustBadges";
import { SampleCsv } from "@/components/landing/SampleCsv";
import { Navbar } from "@/components/landing/Navbar";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[--brand-cream]">
      <Navbar />
      <Hero />
      <TrustBadges />
      <SampleCsv />
      <footer className="py-8 text-center text-sm text-[--brand-muted] border-t border-[--brand-muted]/10">
        <div className="flex justify-center gap-6">
          <Link href="/privacy" className="hover:text-[--brand-ink]">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-[--brand-ink]">
            Terms of Service
          </Link>
        </div>
        <p className="mt-4">© {new Date().getFullYear()} WhoDoYouKnow</p>
      </footer>
    </main>
  );
}
