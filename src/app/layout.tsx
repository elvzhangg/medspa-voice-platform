import type { Metadata } from "next";
import { DM_Sans, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans-primary",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "VauxVoice — AI Clientele Specialist for Med Spas",
  description: "Meet Vivienne, your AI Clientele Specialist for med spas. Every call answered, every client remembered, every booking captured — 24/7.",
  openGraph: {
    title: "VauxVoice — AI Clientele Specialist for Med Spas",
    description: "Meet Vivienne, your AI Clientele Specialist for med spas. Every call answered, every client remembered, every booking captured — 24/7.",
    siteName: "VauxVoice",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VauxVoice — AI Clientele Specialist for Med Spas",
    description: "Meet Vivienne, your AI Clientele Specialist for med spas. Every call answered, every client remembered, every booking captured — 24/7.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${cormorant.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
