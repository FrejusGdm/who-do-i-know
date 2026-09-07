import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-guard";

export async function requirePrivatePageSession() {
  const { session, error } = await requireSession();
  if (error) redirect("/login");
  return session;
}
