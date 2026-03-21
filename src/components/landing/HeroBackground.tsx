"use client";

export function HeroBackground() {
  return (
    <div className="absolute inset-0 z-0">
      <div className="w-full h-full bg-[--brand-cream]" />
      <div className="absolute inset-0 bg-[url('/hero-ink-grid.svg')] bg-cover bg-center opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-b from-white/70 via-white/85 to-white" />
    </div>
  );
}
