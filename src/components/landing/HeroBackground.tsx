"use client";

export function HeroBackground() {
  return (
    <div className="absolute inset-0 z-0 bg-[--brand-cream] overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[radial-gradient(circle,rgba(0,0,0,0.03)_0%,transparent_70%)] blur-3xl" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-[radial-gradient(circle,rgba(0,0,0,0.02)_0%,transparent_70%)] blur-3xl" />
    </div>
  );
}
