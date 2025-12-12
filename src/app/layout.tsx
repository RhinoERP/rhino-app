import type { Metadata } from "next";
import {
  Cal_Sans,
  Inter,
  JetBrains_Mono,
  Merriweather,
  Space_Grotesk,
} from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "@/components/theme/theme-provider";
import "./globals.css";
import Providers from "@/components/providers";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Rhinos",
  description: "Tu plataforma de gestión de distribución",
};

const merriweather = Merriweather({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
  weight: ["300", "400", "700", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-space-grotesk",
  weight: ["300", "400", "500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const calSans = Cal_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-heading",
  weight: "400",
  fallback: ["system-ui-sans", "arial", "sans-serif"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${merriweather.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable} ${inter.variable} ${calSans.variable} font-sans antialiased`}
      >
        <NuqsAdapter>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            disableTransitionOnChange
            enableSystem
          >
            <Providers>{children}</Providers>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
