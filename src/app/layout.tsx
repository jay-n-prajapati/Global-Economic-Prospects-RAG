import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// UI sans, mono for figures and labels, and a reading serif for questions, answers and excerpts.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif", axes: ["opsz"] });

export const metadata: Metadata = {
  title: "GEP Q&A · World Bank Global Economic Prospects, June 2026",
  description:
    "Ask questions about the World Bank Global Economic Prospects report, June 2026. Answers come only from the report and cite chapter, section and page.",
};

export const viewport: Viewport = { colorScheme: "dark", themeColor: "#0f1012" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${sourceSerif.variable} h-full`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
