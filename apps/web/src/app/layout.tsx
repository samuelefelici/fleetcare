import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FleetCare", template: "%s · FleetCare" },
  description: "Il parco mezzi dell'associazione: mezzi, attrezzature, scadenze.",
};

/** themeColor è --bg-base di tokens.css: scripts/check-contrast.ts controlla che coincidano. */
export const viewport: Viewport = { themeColor: "#0d0e10", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={fontVariables}>
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster theme="dark" richColors position="top-center" />
      </body>
    </html>
  );
}
