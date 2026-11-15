import type { Metadata, Viewport } from "next";
import { Anton, Inter, JetBrains_Mono, Permanent_Marker } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono-face", subsets: ["latin"] });
const marker = Permanent_Marker({ variable: "--font-marker-face", weight: "400", subsets: ["latin"] });
const display = Anton({ variable: "--font-display-face", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DARE STREET",
  description: "Bet on your friends. Profit off their embarrassment. A fictional-money party game.",
};

export const viewport: Viewport = {
  themeColor: "#0B1015",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${marker.variable} ${display.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
