import { COLLECTIONS, type PointLogType } from "@/lib/constants";
import { getCmd, getDb, unwrapDoc } from "@/lib/cloudbase";
import { ApiError } from "./api";

export type PointPool = "auto" | "paid" | "bonus";

/** 事务对象最小结构（SDK 无类型声明，这里显式声明所需能力） */
export type Txn = {
  collection: (name: string) => {
    doc: (id: string) => {
      get: () => Promise<unknown>;
      update: (data: Record<string, unknown>) => Promise<unknown>;
    };
    add: (data: Record<string, unknown>) => Promise<unknown>;
  };
};

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
  const user = unwrapDoc(res);
  if (!user) throw new ApiError(404, "用户不存在");
  return normalizePoints(user);
}

/**
 * 将用户文档积分归一为 { paid, bonus, total }
 * - 两个双池字段都不存在：legacy points -> paidPoints（视为充值积分）
 * - 两个都存在：正常
 * - 只存在一个：视为异常数据，抛错，不自动把缺失字段当 0（可能掩盖数据损坏）
 */
export function normalizePoints(user: Record<string, unknown>): {
  paid: number;
  bonus: number;
  total: number;
} {
  const hasPaid = user.paidPoints !== undefined;
  const hasBonus = user.bonusPoints !== undefined;
  if (hasPaid !== hasBonus) {
    throw new ApiError(
      500,
      "用户积分数据异常：paidPoints/bonusPoints 仅存在一个，请先运行 repair 脚本人工确认"
    );
  }
  if (!hasPaid && !hasBonus) {
    // 旧数据：只有 points 字段，视为充值积分
    const paid = Number(user.points ?? 0);
    return { paid, bonus: 0, total: paid };
  }
  const paid = Number(user.paidPoints);
  const bonus = Number(user.bonusPoints);
  return { paid, bonus, total: paid + bonus };
}

/**
 * 在事务内归一为双池字段（旧用户仅有 points 时迁移），返回 { paid, bonus }。
 * 迁移写入与后续扣减/退款同事务，保证 users.points === bonusPoints + paidPoints。
 * 只存在一个双池字段时抛错，不自动补 0。
 */
async function normalizeDualPoolInTxn(
  transaction: Txn,
  userId: string,
  user: Record<string, unknown>
): Promise<{ paid: number; bonus: number }> {
  const hasPaid = user.paidPoints !== undefined;
  const hasBonus = user.bonusPoints !== undefined;
  if (hasPaid !== hasBonus) {
    throw new ApiError(
      500,
      "用户积分数据异常：paidPoints/bonusPoints 仅存在一个，请先运行 repair 脚本人工确认"
    );
  }
  if (!hasPaid && !hasBonus) {
    const legacy = Number(user.points ?? 0);
    await transaction.collection(COLLECTIONS.USERS).doc(userId).update({
      paidPoints: legacy,
      bonusPoints: 0,
      points: legacy,
    });
    return { paid: legacy, bonus: 0 };
  }
  return { paid: Number(user.paidPoints), bonus: Number(user.bonusPoints) };
}

/**
 * 服务端积分扣减（条件原子扣减，防超扣，支持双池）
 * @param userId 用户 _id
 * @param points 需扣除的积分数（正数）
 * @param type 流水类型
 * @param remark 流水备注
 * @param throwIfNotEnough 不足时抛错（默认 true）
 * @param pool 扣减池：auto 先赠送后充值 / paid 只扣充值 / bonus 只扣赠送
 *
 * 注：SDK 的 runTransaction 在不同版本对 callback 返回值的处理不一致
 * （旧版返回 Promise<void> 且吞错），因此不依赖其返回值，
 * 一律通过外层变量接收 callback 结果，返回真实的 DeductResult。
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

  let result: DeductResult = { ok: false, paidDeducted: 0, bonusDeducted: 0 };

  // 单事务内完成「读余额 → 校验 → 扣减双池 → 同步 points 总字段 → 写流水」。
  // 任一环节失败（含并发冲突）整体回滚，杜绝「赠送池已扣、充值池失败」的部分扣款；
  // 扣减成功后始终保证 users.points === users.bonusPoints + users.paidPoints。
  await db.runTransaction(async (transaction: Txn) => {
    // 事务内读取用户快照（事务模式 get 返回 { data: 文档 | null }）
    const userRes = (await transaction
      .collection(COLLECTIONS.USERS)
      .doc(userId)
      .get()) as { data?: Record<string, unknown> | null } | undefined;
    const user = userRes?.data ?? null;
    if (!user) {
      if (throwIfNotEnough) throw new ApiError(404, "用户不存在");
      result = { ok: false, paidDeducted: 0, bonusDeducted: 0 };
      return;
    }

    // 双池归一（旧用户迁移也纳入事务；只存在一个字段时抛错）
    const { paid, bonus } = await normalizeDualPoolInTxn(transaction, userId, user);

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
      result = { ok: false, paidDeducted: 0, bonusDeducted: 0 };
      return;
    }

    // 一次更新同时扣减双池与 points 总字段，保证三者一致
    const updates: Record<string, unknown> = {
      points: cmd.inc(-(needBonus + needPaid)),
    };
    if (needBonus > 0) updates.bonusPoints = cmd.inc(-needBonus);
    if (needPaid > 0) updates.paidPoints = cmd.inc(-needPaid);
    await transaction.collection(COLLECTIONS.USERS).doc(userId).update(updates);

    // 积分流水与扣费同事务，记录本次扣费明细（供退款原路退回）
    await transaction.collection(COLLECTIONS.POINT_LOGS).add({
      userId,
      type,
      points: -points,
      paidPoints: needPaid,
      bonusPoints: needBonus,
      remark,
      createdAt: db.serverDate(),
    });

    result = { ok: true, paidDeducted: needPaid, bonusDeducted: needBonus };
  }, 3);

  return result;
}

/**
 * 服务端积分退款（原路退回）
 * @param split 原始扣费明细 { paid, bonus }，必须满足 paid + bonus === points；
 *              缺省时视为旧订单兜底：全部退回 bonus 池并输出 warning（请人工核对）。
 */
export async function refundPoints(
  userId: string,
  points: number,
  type: PointLogType,
  remark: string,
  split?: { paid: number; bonus: number }
): Promise<void> {
  if (points <= 0) return;
  const db = getDb();
  const cmd = getCmd();

  // 与扣减一致：双池加回、points 总字段、流水放入同一事务，保证原子与一致。
  await db.runTransaction(async (transaction: Txn) => {
    const userRes = (await transaction
      .collection(COLLECTIONS.USERS)
      .doc(userId)
      .get()) as { data?: Record<string, unknown> | null } | undefined;
    const user = userRes?.data ?? null;
    if (!user) return;

    // 双池归一（旧用户迁移也纳入事务；只存在一个字段时抛错）
    await normalizeDualPoolInTxn(transaction, userId, user);

    let addBonus = 0;
    let addPaid = 0;
    if (split) {
      if (split.paid + split.bonus !== points) {
        throw new ApiError(
          500,
          `退款明细与订单扣费不符：paid+bonus=${split.paid + split.bonus}，points=${points}，请人工核对`
        );
      }
      // 原路退回：充值池退充值、赠送池退赠送
      addPaid = split.paid;
      addBonus = split.bonus;
    } else {
      // 旧订单无 costPaid/costBonus 明细：无法原路退回，兜底退 bonus 并告警
      console.warn(
        `[points] 订单退款缺少 costPaid/costBonus 明细，${points} 积分全部退回 bonus 池，请人工核对`
      );
      addBonus = points;
    }

    // 一次更新三个字段，保证 points === bonusPoints + paidPoints
    const updates: Record<string, unknown> = {
      points: cmd.inc(addBonus + addPaid),
    };
    if (addBonus > 0) updates.bonusPoints = cmd.inc(addBonus);
    if (addPaid > 0) updates.paidPoints = cmd.inc(addPaid);
    await transaction.collection(COLLECTIONS.USERS).doc(userId).update(updates);

    await transaction.collection(COLLECTIONS.POINT_LOGS).add({
      userId,
      type,
      points,
      paidPoints: addPaid,
      bonusPoints: addBonus,
      remark,
      createdAt: db.serverDate(),
    });
  }, 3);
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
 * 按订单记录的 costPaid/costBonus 原路退回；旧订单无明细时兜底退 bonus 并告警。
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

  // 读取订单原始扣费明细（原路退回）
  const orderRes = await db.collection(collectionName).doc(orderId).get();
  const order = unwrapDoc(orderRes);
  const costPaid = order?.costPaid;
  const costBonus = order?.costBonus;
  const split =
    costPaid !== undefined && costBonus !== undefined
      ? { paid: Number(costPaid), bonus: Number(costBonus) }
      : undefined;

  const res = await db
    .collection(collectionName)
    .where({ _id: orderId, refunded: cmd.neq(true) })
    .update({ refunded: true, refundedAt: db.serverDate() });
  if (res.updated !== 1) return false;

  try {
    await refundPoints(userId, points, type, remark, split);
  } catch (e) {
    // 退款失败时回滚标记，避免「已标记退款但未实际到账」
    await db
      .collection(collectionName)
      .doc(orderId)
      .update({ refunded: false, refundedAt: cmd.remove() })
      .catch(() => {});
    throw e;
  }
  return true;
}
