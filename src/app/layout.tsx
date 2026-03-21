import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["400", "700", "900"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "WhoDoYouKnow — Your Network, One Download",
  description:
    "Connect your Gmail. We scan your history, find every real person you've ever interacted with, and hand you a clean spreadsheet. One time. $9.",
  openGraph: {
    title: "WhoDoYouKnow",
    description:
      "You spent years meeting people. Don't lose them. Connect Gmail, get a CSV of your network. $9, one time.",
    url: "https://whodoyouknow.xyz",
    siteName: "WhoDoYouKnow",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "WhoDoYouKnow",
    description:
      "You spent years meeting people. Don't lose them. Connect Gmail, get a CSV of your network.",
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
          playfair.variable,
          inter.variable,
          "font-sans antialiased bg-[--brand-cream] text-[--brand-ink]"
        )}
      >
        {children}
      </body>
    </html>
  );
}
