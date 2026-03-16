"use client";

export function HeroBackground() {
  return (
    <div className="absolute inset-0 z-0">
      <div className="w-full h-full bg-gradient-to-b from-[--brand-cream] via-[--brand-gold]/5 to-[--brand-cream]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[--brand-cream] via-transparent to-[--brand-cream]" />
    </div>
  );
}
