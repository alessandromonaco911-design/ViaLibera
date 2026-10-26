import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { siteConfig } from "@/config/site";
import { AppAccess } from "@/components/install/app-access";
import { TaskTransitionProvider } from "@/components/ui/task-transition";
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
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} — Quiz patente ${siteConfig.licenseCategory}`,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: "website", locale: "it_IT", siteName: siteConfig.name, url: siteConfig.url,
    title: "ViaLibera — Quiz patente B",
    description: "Allenati per argomento. Prova l’esame. Capisci ogni risposta.",
    images: [{ url: "/brand/share-v2.png", width: 1200, height: 630, alt: "ViaLibera. La patente. Un quiz alla volta." }],
  },
  twitter: {
    card: "summary_large_image", title: "ViaLibera — Quiz patente B",
    description: "Allenati per argomento. Prova l’esame. Capisci ogni risposta.",
    images: [{ url: "/brand/share-v2.png", alt: "ViaLibera. La patente. Un quiz alla volta." }],
  },
  appleWebApp: {
    capable: true, title: siteConfig.name, statusBarStyle: "default",
    startupImage: [375, 390, 393].flatMap((width, index) => {
      const height = [812, 844, 852][index];
      return (["portrait", "landscape"] as const).map(orientation => ({
        url: `/brand/startup-${width}x${height}-${orientation}.png`,
        media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: 3) and (orientation: ${orientation})`,
      }));
    }),
  },
  icons: { apple: "/icons/apple-touch-icon.png?v=2" },
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#a8def3",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-viewport bg-background font-sans text-foreground antialiased">
        <AppAccess><TaskTransitionProvider>{children}</TaskTransitionProvider></AppAccess>
      </body>
    </html>
  );
}
