/**
 * Un importo in euro come lo scrive un italiano: «1.234,50», «1234,5»,
 * «1234.50», «80 €». Torna la stringa per una colonna numeric(12,2):
 * vuoto → null, non valido o oltre il massimo della colonna → undefined.
 */
export function parseEuro(raw: string): string | null | undefined {
  const s = raw.replace(/[\s€]/g, "");
  if (s === "") return null;
  // con la virgola è notazione italiana: i punti sono le migliaia
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const n = Number(normalized);
  if (!Number.isFinite(n) || n > 9_999_999_999.99) return undefined;
  return n.toFixed(2);
}
