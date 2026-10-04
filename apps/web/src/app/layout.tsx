import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FleetCare", template: "%s · FleetCare" },
  description: "Il parco mezzi dell'associazione: mezzi, attrezzature, scadenze.",
};

export const viewport: Viewport = { themeColor: "#f2c200" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-dvh antialiased">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
