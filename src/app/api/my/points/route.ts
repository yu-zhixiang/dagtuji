import { COLLECTIONS } from "@/lib/constants";
import { getDb, unwrapDoc } from "@/lib/cloudbase";
import { requireUser } from "@/lib/server/auth";
import { handleApiError, json } from "@/lib/server/api";

const PAGE_SIZE = 100;

/** 积分中心：当前积分 + 流水 + 邮箱验证状态 */
export async function GET() {
  try {
    const session = await requireUser();
    const db = getDb();

    // 获取当前积分（实时从库读取，双池展示）
    const userRes = await db.collection(COLLECTIONS.USERS).doc(session.id).get();
    const user = unwrapDoc(userRes);
    const paidPoints = Number(user?.paidPoints ?? 0);
    const bonusPoints = Number(user?.bonusPoints ?? 0);
    // 双池字段均存在才以双池之和为准（points 总字段可能是陈旧值）；
    // 旧用户（两个双池字段都不存在）才信任历史 points 字段；
    // 只存在一个双池字段时视为异常数据，不自动把缺失字段当 0，回落显示历史 points
    const hasDualPool =
      user?.paidPoints !== undefined && user?.bonusPoints !== undefined;
    const points = hasDualPool
      ? paidPoints + bonusPoints
      : Number(user?.points ?? 0);

    // 流水
    const logsRes = await db
      .collection(COLLECTIONS.POINT_LOGS)
      .where({ userId: session.id })
      .orderBy("createdAt", "desc")
      .limit(PAGE_SIZE)
      .get();
    const logs = (logsRes.data as Record<string, unknown>[] | undefined) || [];

    return json({
      points,
      paidPoints,
      bonusPoints,
      email: user?.email || "",
      emailVerified: Boolean(user?.emailVerified),
      registerBonusGranted: Boolean(user?.registerBonusGranted),
      emailVerifyBonusGranted: Boolean(user?.emailVerifyBonusGranted),
      isAdmin: Boolean(user?.isAdmin),
      logs,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
