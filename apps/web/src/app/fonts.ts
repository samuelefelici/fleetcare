/**
 * I tre font dell'interfaccia, serviti dall'app stessa: i file woff2 vengono
 * dai pacchetti @fontsource (licenza OFL) e next/font li copia in
 * .next/static/media. Nessuna richiesta esterna né a build né a runtime, e
 * next/font calcola per ciascuno un ripiego di sistema con le stesse
 * metriche (size-adjust, ascent-override…), così il testo non salta quando
 * il font arriva.
 *
 * Solo i pesi usati e solo il subset latin (copre l'italiano). I percorsi
 * sono relativi a questo file: next/font/local non risolve i nomi di pacchetto.
 */
import localFont from "next/font/local";

/** Barlow Condensed 600: wordmark, titoli di pagina, HUD. */
export const fontDisplay = localFont({
  src: "../../node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2",
  weight: "600",
  style: "normal",
  variable: "--font-barlow-condensed",
  display: "swap",
});

/** IBM Plex Sans 400/500/600: tutta l'interfaccia. */
export const fontSans = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  variable: "--font-plex-sans",
  display: "swap",
});

/** IBM Plex Mono 400/500: targhe, km, date, importi, codici. Non precaricato: compare dopo il primo disegno. */
export const fontMono = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

/** Le tre variabili da mettere sull'<html>. */
export const fontVariables = `${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable}`;
