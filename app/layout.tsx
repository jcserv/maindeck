import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/app/_components/theme-provider";
import { SiteFooter } from "@/app/_components/site-footer";
import "mana-font/css/mana.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "maindeck",
  description: "Magic: The Gathering deckbuilding and card discovery.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <SiteFooter />
        </ThemeProvider>
        <Analytics scriptSrc="/insights/events.js" endpoint="/hfi/events" />
        <SpeedInsights scriptSrc="/insights/vitals.js" endpoint="/hfi/vitals" />
      </body>
    </html>
  );
}
