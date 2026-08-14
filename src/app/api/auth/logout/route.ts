import { clearSession } from "@/lib/session";
import { json } from "@/lib/server/api";

export async function POST() {
  await clearSession();
  return json({ success: true });
}
