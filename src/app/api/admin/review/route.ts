import { NextRequest } from "next/server";
import { COLLECTIONS, REGISTER_BONUS_POINTS, type BonusClaimStatus } from "@/lib/constants";
import { getCmd, getDb } from "@/lib/cloudbase";
import { requireAdmin } from "@/lib/server/auth";
import { ApiError, handleApiError, json } from "@/lib/server/api";
import { claimRegisterBonus } from "@/lib/server/points";

/** 风控人工审核列表：pending（待审核）与已拒绝用户 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const db = getDb();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "pending";

    const allowed: BonusClaimStatus[] = ["pending", "rejected", "granted"];
    if (!allowed.includes(status as BonusClaimStatus)) {
      throw new ApiError(400, "无效的状态");
    }

    const res = await db
      .collection(COLLECTIONS.USERS)
      .where({ bonusStatus: status })
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const users = ((res.data as Array<Record<string, unknown>>) || []).map((u) => ({
      id: u._id,
      username: u.username,
      email: u.email || "",
      nickname: u.nickname || "",
      registerIp: u.registerIp || "",
      deviceHash: u.deviceHash || null,
      riskScore: Number(u.riskScore || 0),
      riskLevel: u.riskLevel || "normal",
      bonusStatus: u.bonusStatus || "pending",
      points: Number(u.points || 0),
      paidPoints: Number(u.paidPoints || 0),
      bonusPoints: Number(u.bonusPoints || 0),
      createdAt: u.createdAt,
    }));

    return json({ users });
  } catch (e) {
    return handleApiError(e);
  }
}

/** 管理员审核：approve 发放赠送 / reject 拒绝发放 */
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => null);
    const userId = String(body?.userId || "");
    const action = String(body?.action || "");

    if (!userId) throw new ApiError(400, "缺少用户 ID");
    if (action !== "approve" && action !== "reject") {
      throw new ApiError(400, "无效的操作");
    }

    const db = getDb();
    const cmd = getCmd();
    const userRes = await db.collection(COLLECTIONS.USERS).doc(userId).get();
    const user = userRes.data as Record<string, unknown> | undefined;
    if (!user) throw new ApiError(404, "用户不存在");

    if (action === "approve") {
      // 重新评估：仅当非 reject 时发放
      if (user.bonusStatus === "rejected") {
        throw new ApiError(400, "该用户赠送已被拒绝，无法再通过审核");
      }
      const result = await claimRegisterBonus({
        userId,
        bonus: REGISTER_BONUS_POINTS,
        email: String(user.email || ""),
        deviceHash: user.deviceHash ? String(user.deviceHash) : null,
        ip: String(user.registerIp || ""),
      });
      if (result === "duplicate") {
        throw new ApiError(400, "该用户已领取过注册赠送");
      }
      return json({ success: true, message: "已发放注册赠送积分" });
    }

    // reject
    const res = await db
      .collection(COLLECTIONS.USERS)
      .where({ _id: userId, bonusStatus: cmd.neq("rejected") })
      .update({ bonusStatus: "rejected", riskLevel: "reject" });
    if (res.updated !== 1) {
      throw new ApiError(400, "该用户状态已变更，请刷新后重试");
    }
    return json({ success: true, message: "已拒绝注册赠送" });
  } catch (e) {
    return handleApiError(e);
  }
}
