import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { IconClose, IconCritical, IconInfo, IconOk, IconWarn } from "@/components/icons";
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
        {/* i colori dei toast sono i token: vedi la fine di globals.css */}
        <Toaster
          theme="dark"
          position="top-center"
          closeButton
          containerAriaLabel="Notifiche"
          toastOptions={{ closeButtonAriaLabel: "Chiudi la notifica" }}
          icons={{
            success: <IconOk />,
            error: <IconCritical />,
            warning: <IconWarn />,
            info: <IconInfo />,
            close: <IconClose className="size-3" />,
          }}
        />
      </body>
    </html>
  );
}
