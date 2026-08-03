import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProviderClient } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ArchiVR · Planos 2D a 3D y Realidad Virtual para arquitectos",
  description: "Sube un plano de planta y la IA lo reconstruye en un modelo 3D recorrible, explorable en realidad virtual (WebXR).",
  keywords: ["arquitectura", "planos 2D", "3D", "realidad virtual", "VR", "WebXR", "VLM", "IA"],
  authors: [{ name: "ArchiVR" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "ArchiVR · Planos 2D a 3D y VR",
    description: "Reconstruye planos de planta en modelos 3D inmersivos con IA.",
    url: "https://chat.z.ai",
    siteName: "ArchiVR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ArchiVR",
    description: "Planos 2D → 3D → VR con IA",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProviderClient>
          {children}
        </ThemeProviderClient>
        <Toaster />
      </body>
    </html>
  );
}
