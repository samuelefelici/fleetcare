"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { findLoginAccounts, signIn } from "@/server/auth";
import { encodeChoices } from "./choices";

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const tenant = String(formData.get("tenant") ?? "").trim();
  const back = `/login?email=${encodeURIComponent(email)}`;
  if (!email || !password) redirect(`${back}&error=1`);

  const matches = await findLoginAccounts(email, password, tenant || undefined);
  if (matches.length === 0) redirect(`${back}&error=1`);
  if (matches.length > 1) {
    // la stessa persona in due associazioni: si sceglie, e si rimette la password
    const choices = matches.map((m) => ({ slug: m.tenant_slug, name: m.tenant_name }));
    redirect(`${back}&scegli=${encodeChoices(choices)}`);
  }
  try {
    await signIn("credentials", {
      email,
      password,
      tenant: matches[0]!.tenant_slug,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) redirect(`${back}&error=1`);
    throw error; // il redirect di Next passa da qui
  }
}
