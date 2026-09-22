import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { SerwistProvider } from "@/components/serwist/serwist-provider";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import "./globals.css";
import Providers from "@/components/providers";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Rhinos",
  description: "Tu plataforma de gestión de distribución",
  icons: {
    icon: "/images/logo_solo.svg",
    apple: "/icons/pwa-192x192.png",
  },
  manifest: "/manifest.webmanifest",
};

function isPwaEnabled() {
  const configured = process.env.NEXT_PUBLIC_PWA_ENABLED;
  if (configured) {
    return configured === "true";
  }

  return process.env.VERCEL_ENV
    ? process.env.VERCEL_ENV === "production"
    : process.env.NODE_ENV === "production";
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com" rel="preconnect" />
        <link
          crossOrigin=""
          href="https://fonts.gstatic.com"
          rel="preconnect"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Cal+Sans:wght@400&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@100..800&family=Merriweather:wght@300;400;700;900&family=Space+Grotesk:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <NuqsAdapter>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            disableTransitionOnChange
            enableSystem
          >
            <SerwistProvider enabled={isPwaEnabled()}>
              <PwaProvider>
                <Providers>{children}</Providers>
                <Toaster />
              </PwaProvider>
            </SerwistProvider>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
