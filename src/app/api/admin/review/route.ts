import { COLLECTIONS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { requireAdmin } from "@/lib/server/auth";
import { handleApiError, json } from "@/lib/server/api";

/**
 * GET /api/admin/review
 * 列出高风险用户供管理员查看（纯展示，无 approve/reject 操作）。
 * 筛选参数：status = review | reject | all
 *
 * 背景：自 2026-08-15 起，注册赠送积分改为邮箱验证后发放（+150积分），
 * 不再进行人工审核。本接口仅保留风险用户查询能力。
 */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "review";

    const db = getDb();

    // 获取风险用户列表
    let res;
    if (status === "all") {
      res = await db
        .collection(COLLECTIONS.USERS)
        .where({ riskLevel: { $in: ["review", "reject"] } })
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();
    } else if (status === "review" || status === "reject") {
      res = await db
        .collection(COLLECTIONS.USERS)
        .where({ riskLevel: status })
        .orderBy("createdAt", "desc")
        .limit(100)
        .get();
    } else {
      return json({ error: "无效的状态参数，支持：review / reject / all" }, 400);
    }

    const users = (res.data || []).map((u: Record<string, unknown>) => {
      const paidPoints = Number(u.paidPoints ?? 0);
      const bonusPoints = Number(u.bonusPoints ?? 0);
      const hasDualPool =
        u.paidPoints !== undefined && u.bonusPoints !== undefined;
      const points = hasDualPool
        ? paidPoints + bonusPoints
        : Number(u.points ?? 0);
      return {
        id: u._id as string,
        username: String(u.username || ""),
        nickname: String(u.nickname || ""),
        email: String(u.email || ""),
        emailVerified: Boolean(u.emailVerified),
        registerBonusGranted: Boolean(u.registerBonusGranted),
        emailVerifyBonusGranted: Boolean(u.emailVerifyBonusGranted),
        emailVerifyBonusGrantedAt: u.emailVerifyBonusGrantedAt,
        points,
        paidPoints,
        bonusPoints,
        riskScore: Number(u.riskScore || 0),
        riskLevel: u.riskLevel || "normal",
        bonusStatus: (u.bonusStatus as string) || null,
        createdAt: u.createdAt,
        lastOrderAt: u.lastOrderAt,
      };
    });

    // 今日新增用户数
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = await db
      .collection(COLLECTIONS.USERS)
      .where({ createdAt: { $gte: todayStart } })
      .count();

    // 待审核（riskLevel=review）数量
    const pendingCount = await db
      .collection(COLLECTIONS.USERS)
      .where({ riskLevel: "review" })
      .count();

    return json({
      users,
      stats: {
        totalUsers: users.length,
        pendingReview: pendingCount.count,
        todayNewUsers: todayCount.count,
      },
      status,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
