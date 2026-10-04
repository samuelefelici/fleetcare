/**
 * La scelta dell'associazione, quando la stessa email sta in due: le scelte
 * viaggiano nell'indirizzo della pagina di login (base64url di JSON).
 * Non è un file "use server": qui ci sono funzioni normali.
 */
/** Le associazioni fra cui scegliere, passate alla pagina nell'indirizzo (base64url di JSON). */
export type TenantChoice = { slug: string; name: string };

export function encodeChoices(choices: TenantChoice[]): string {
  return Buffer.from(JSON.stringify(choices)).toString("base64url");
}

export function decodeChoices(raw: string | undefined): TenantChoice[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c): c is TenantChoice =>
        typeof c === "object" &&
        c !== null &&
        typeof c.slug === "string" &&
        typeof c.name === "string",
    );
  } catch {
    return [];
  }
}
