import { COLLECTIONS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { requireUser } from "@/lib/server/auth";
import { handleApiError, json } from "@/lib/server/api";

const PAGE_SIZE = 100;

/** 积分中心：当前积分 + 流水 */
export async function GET() {
  try {
    const session = await requireUser();
    const db = getDb();

    // 获取当前积分（实时从库读取）
    const userRes = await db.collection(COLLECTIONS.USERS).doc(session.id).get();
    const user = userRes.data as Record<string, unknown> | undefined;
    const points = Number(user?.points || 0);

    // 流水
    const logsRes = await db
      .collection(COLLECTIONS.POINT_LOGS)
      .where({ userId: session.id })
      .orderBy("createdAt", "desc")
      .limit(PAGE_SIZE)
      .get();
    const logs = (logsRes.data as Record<string, unknown>[] | undefined) || [];

    return json({ points, logs });
  } catch (e) {
    return handleApiError(e);
  }
}
