/**
 * L'uscita forzata: la sessione di una persona disattivata viene cancellata
 * qui (un componente server non può toccare i cookie) e si torna al login
 * con il motivo.
 */
import { signOut } from "@/server/auth";

export async function GET(request: Request) {
  const motivo = new URL(request.url).searchParams.get("motivo");
  await signOut({ redirectTo: motivo === "disattivata" ? "/login?error=disattivata" : "/login" });
}
