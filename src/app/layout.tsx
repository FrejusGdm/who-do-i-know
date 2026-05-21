import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Outfit } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400"],
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "WhoDoYouKnow — Private Relationship Memory",
  description:
    "A private personal CRM for Gmail relationships, summaries, notes, exports, and outreach planning.",
  openGraph: {
    title: "WhoDoYouKnow",
    description:
      "You spent years meeting people. Don't lose them. Build a private relationship memory from Gmail.",
    url: "https://whodoyouknow.work",
    siteName: "WhoDoYouKnow",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WhoDoYouKnow",
    description:
      "You spent years meeting people. Don't lose them. Build a private relationship memory from Gmail.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          instrumentSerif.variable,
          outfit.variable,
          "font-sans antialiased bg-[--brand-cream] text-[--brand-ink]"
        )}
      >
        {children}
      </body>
    </html>
  );
}
