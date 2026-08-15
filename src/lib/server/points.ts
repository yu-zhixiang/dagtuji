import { COLLECTIONS, type PointLogType } from "@/lib/constants";
import { getCmd, getDb } from "@/lib/cloudbase";
import { ApiError } from "./api";

export type PointPool = "auto" | "paid" | "bonus";

export interface DeductResult {
  ok: boolean;
  /** 实际从充值池扣除 */
  paidDeducted: number;
  /** 实际从赠送池扣除 */
  bonusDeducted: number;
}

/**
 * 读取用户双池积分（兼容旧数据：仅有 points 字段时视为充值积分）
 */
export async function getUserPoints(userId: string): Promise<{
  paid: number;
  bonus: number;
  total: number;
}> {
  const db = getDb();
  const res = await db.collection(COLLECTIONS.USERS).doc(userId).get();
  const user = res.data as Record<string, unknown> | undefined;
  if (!user) throw new ApiError(404, "用户不存在");
  return normalizePoints(user);
}

/** 将用户文档积分归一为 { paid, bonus, total } */
export function normalizePoints(user: Record<string, unknown>): {
  paid: number;
  bonus: number;
  total: number;
} {
  let paid = Number(user.paidPoints ?? 0);
  let bonus = Number(user.bonusPoints ?? 0);
  // 旧数据：只有 points 字段，视为充值积分
  if (user.bonusPoints === undefined && user.paidPoints === undefined) {
    paid = Number(user.points ?? 0);
    bonus = 0;
  }
  return { paid, bonus, total: paid + bonus };
}

/** 迁移旧数据：将 points 拆入双池字段，返回 {paid, bonus} */
async function ensureDualPool(
  userId: string,
  user: Record<string, unknown>
): Promise<{ paid: number; bonus: number }> {
  if (user.paidPoints !== undefined || user.bonusPoints !== undefined) {
    const n = normalizePoints(user);
    return { paid: n.paid, bonus: n.bonus };
  }
  const db = getDb();
  const legacy = Number(user.points ?? 0);
  await db.collection(COLLECTIONS.USERS).doc(userId).update({
    paidPoints: legacy,
    bonusPoints: 0,
    points: legacy,
  });
  return { paid: legacy, bonus: 0 };
}

/**
 * 服务端积分扣减（条件原子扣减，防超扣，支持双池）
 * @param userId 用户 _id
 * @param points 需扣除的积分数（正数）
 * @param type 流水类型
 * @param remark 流水备注
 * @param throwIfNotEnough 不足时抛错（默认 true）
 * @param pool 扣减池：auto 先赠送后充值 / paid 只扣充值 / bonus 只扣赠送
 */
export async function deductPoints(
  userId: string,
  points: number,
  type: PointLogType,
  remark: string,
  throwIfNotEnough = true,
  pool: PointPool = "auto"
): Promise<DeductResult> {
  if (points <= 0) return { ok: true, paidDeducted: 0, bonusDeducted: 0 };
  const db = getDb();
  const cmd = getCmd();
  const userRes = await db.collection(COLLECTIONS.USERS).doc(userId).get();
  const user = userRes.data as Record<string, unknown> | undefined;
  if (!user) {
    if (throwIfNotEnough) throw new ApiError(404, "用户不存在");
    return { ok: false, paidDeducted: 0, bonusDeducted: 0 };
  }

  const { paid, bonus } = await ensureDualPool(userId, user);
  let needBonus = 0;
  let needPaid = 0;
  if (pool === "bonus") {
    needBonus = points;
  } else if (pool === "paid") {
    needPaid = points;
  } else {
    // auto：优先使用赠送积分，再扣充值积分
    needBonus = Math.min(bonus, points);
    needPaid = points - needBonus;
  }

  if (needPaid > paid || needBonus > bonus) {
    if (throwIfNotEnough) throw new ApiError(400, "积分不足");
    return { ok: false, paidDeducted: 0, bonusDeducted: 0 };
  }

  if (needBonus > 0) {
    const r = await db
      .collection(COLLECTIONS.USERS)
      .where({ _id: userId, bonusPoints: cmd.gte(needBonus) })
      .update({ bonusPoints: cmd.inc(-needBonus) });
    if (r.updated !== 1) {
      if (throwIfNotEnough) throw new ApiError(400, "积分不足");
      return { ok: false, paidDeducted: 0, bonusDeducted: 0 };
    }
  }
  if (needPaid > 0) {
    const r = await db
      .collection(COLLECTIONS.USERS)
      .where({ _id: userId, paidPoints: cmd.gte(needPaid) })
      .update({ paidPoints: cmd.inc(-needPaid) });
    if (r.updated !== 1) {
      if (throwIfNotEnough) throw new ApiError(400, "积分不足");
      return { ok: false, paidDeducted: 0, bonusDeducted: 0 };
    }
  }

  await addPointLog(userId, type, -points, remark);
  return { ok: true, paidDeducted: needPaid, bonusDeducted: needBonus };
}

/**
 * 服务端积分退款（只加不退错，支持双池）
 * @param pool 默认 auto：优先退还赠送池，余额不足再退充值池
 */
export async function refundPoints(
  userId: string,
  points: number,
  type: PointLogType,
  remark: string,
  pool: "auto" | "paid" | "bonus" = "auto"
): Promise<void> {
  if (points <= 0) return;
  const db = getDb();
  const cmd = getCmd();
  const userRes = await db.collection(COLLECTIONS.USERS).doc(userId).get();
  const user = userRes.data as Record<string, unknown> | undefined;
  if (!user) return;

  await ensureDualPool(userId, user);
  let addBonus = 0;
  let addPaid = 0;
  if (pool === "bonus") {
    addBonus = points;
  } else if (pool === "paid") {
    addPaid = points;
  } else {
    addBonus = points;
    addPaid = 0;
  }

  if (addBonus > 0) {
    await db.collection(COLLECTIONS.USERS).doc(userId).update({
      bonusPoints: cmd.inc(addBonus),
    });
  }
  if (addPaid > 0) {
    await db.collection(COLLECTIONS.USERS).doc(userId).update({
      paidPoints: cmd.inc(addPaid),
    });
  }
  // 保持 points 总字段同步
  await db.collection(COLLECTIONS.USERS).doc(userId).update({
    points: cmd.inc(addBonus + addPaid),
  });
  await addPointLog(userId, type, points, remark);
}

/**
 * 写入积分流水
 */
export async function addPointLog(
  userId: string,
  type: PointLogType,
  points: number,
  remark: string
): Promise<void> {
  const db = getDb();
  await db.collection(COLLECTIONS.POINT_LOGS).add({
    userId,
    type,
    points,
    remark,
    createdAt: db.serverDate(),
  });
}

/**
 * 领取注册赠送积分（防重复：同 user / 同 email / 同 device 只发一次）。
 * 所有发放记录写入 bonus_claims。
 * @returns "granted" 发放成功 | "duplicate" 已领取过 | "rejected" 被拒绝
 */
export async function claimRegisterBonus(params: {
  userId: string;
  bonus: number;
  email?: string;
  deviceHash?: string | null;
  ip?: string;
}): Promise<"granted" | "duplicate" | "rejected"> {
  const db = getDb();
  const cmd = getCmd();
  const { userId, bonus, email, deviceHash, ip } = params;

  // 1. 用户已标记拒绝 → 不可领取
  const userRes = await db.collection(COLLECTIONS.USERS).doc(userId).get();
  const user = userRes.data as Record<string, unknown> | undefined;
  if (!user) throw new ApiError(404, "用户不存在");
  if (user.bonusStatus === "rejected") return "rejected";

  // 2. 同 user / 同 email / 同 device 已有成功记录 → 不重复发放
  const whereOr: Array<Record<string, unknown>> = [{ userId, status: "granted" }];
  if (email) whereOr.push({ email, status: "granted" });
  if (deviceHash) whereOr.push({ deviceHash, status: "granted" });
  const claimRes = await db
    .collection(COLLECTIONS.BONUS_CLAIMS)
    .where(cmd.or(...whereOr))
    .limit(1)
    .get();
  if ((claimRes.data || []).length > 0) return "duplicate";

  // 3. 条件原子更新（防并发重复发放）
  const res = await db
    .collection(COLLECTIONS.USERS)
    .where({ _id: userId, registerBonusGranted: cmd.neq(true) })
    .update({
      bonusPoints: cmd.inc(bonus),
      points: cmd.inc(bonus),
      registerBonusGranted: true,
      bonusStatus: "granted",
      bonusGrantedAt: db.serverDate(),
    });
  if (res.updated !== 1) return "duplicate";

  // 4. 写发放记录 + 积分流水
  await db.collection(COLLECTIONS.BONUS_CLAIMS).add({
    userId,
    email: email || "",
    deviceHash: deviceHash || null,
    ip: ip || "",
    status: "granted",
    points: bonus,
    createdAt: db.serverDate(),
  });
  await addPointLog(userId, "register_bonus", bonus, "注册赠送积分");
  return "granted";
}

/**
 * 校验用户是否允许制作高清大图。
 * 未充值账号用赠送积分制作高清大图最多体验 1 张；充值用户解除限制。
 * 充值判定：存在 recharge / admin_adjust 正数流水。
 */
export async function assertUpscaleAllowed(userId: string): Promise<void> {
  const db = getDb();
  const cmd = getCmd();

  // 充值用户（存在充值或管理员加分流水）→ 不限次数
  const paidLogs = await db
    .collection(COLLECTIONS.POINT_LOGS)
    .where({
      userId,
      type: cmd.in(["recharge", "admin_adjust"]),
      points: cmd.gt(0),
    })
    .limit(1)
    .get();
  if ((paidLogs.data || []).length > 0) return;

  // 未充值：统计已存在的（非失败）高清大图订单
  const orderRes = await db
    .collection(COLLECTIONS.UPSCALE_ORDERS)
    .where({ userId, status: cmd.neq("failed") })
    .limit(1)
    .get();
  if ((orderRes.data || []).length >= 1) {
    throw new ApiError(403, "未充值用户仅可体验 1 张高清大图，充值后可解除限制");
  }
}

/**
 * 记录下单行为风控：注册后立即批量下单等行为提高风险值。
 * @returns 新增风险分
 */
export async function recordOrderRisk(params: {
  userId: string;
  ip?: string;
  deviceHash?: string | null;
  orderType: string;
}): Promise<void> {
  const db = getDb();
  const cmd = getCmd();
  const { userId, ip, deviceHash, orderType } = params;

  // 近 10 分钟下单数（跨找图/高清/风格）
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const recentOrders = await db
    .collection(COLLECTIONS.POINT_LOGS)
    .where({ userId, createdAt: cmd.gte(since) })
    .limit(20)
    .get();
  const orderCount = (recentOrders.data || []).filter(
    (l) =>
      ["generation", "upscale", "style_oil", "style_illustration"].includes(
        String((l as Record<string, unknown>).type || "")
      )
  ).length;

  if (orderCount >= 5) {
    const { addRiskEvent } = await import("@/lib/server/fraud");
    await addRiskEvent({
      userId,
      ip,
      deviceHash,
      eventType: "rapid_orders",
      score: 20,
      detail: `近 10 分钟下单 ${orderCount} 笔（${orderType}）`,
    });
  }
}

/**
 * 同一失败任务只退一次（条件更新防重复）
 * @returns 是否真正执行了退款
 */
export async function refundOnce(
  orderId: string,
  collectionName: string,
  userId: string,
  points: number,
  type: PointLogType,
  remark: string
): Promise<boolean> {
  const db = getDb();
  const cmd = getCmd();
  const res = await db
    .collection(collectionName)
    .where({ _id: orderId, refunded: cmd.neq(true) })
    .update({ refunded: true, refundedAt: db.serverDate() });
  if (res.updated !== 1) return false;
  await refundPoints(userId, points, type, remark);
  return true;
}
