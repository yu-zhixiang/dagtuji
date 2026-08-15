/**
 * 充值积分统一到账逻辑
 * 被 notify 和 status 两个接口共用，保证幂等和原子性。
 * 仅此文件可以修改用户的 paidPoints / points；其他任何文件不得直接操作。
 */
import { COLLECTIONS } from "@/lib/constants";
import { getCmd, getDb } from "@/lib/cloudbase";
import { ApiError } from "@/lib/server/api";

/** 允许进入 credited 状态的前置状态 */
const CREDITABLE_STATUSES = new Set(["pending", "paid"]);

/**
 * 到账：将 recharge_order 从 pending/paid 状态更新为 credited，
 * 并给用户增加 paidPoints + points，写入积分流水。
 *
 * 幂等：事务内重新读订单状态，双重保险（事务外也会先检查一次）。
 *
 * @param orderNo      订单号
 * @param alipayTradeNo 支付宝交易号（必填，用于记录）
 * @param remark       流水备注（默认 "支付宝充值"）
 * @throws ApiError  订单不存在 / 非法金额 / 非法状态流转时抛出
 */
export async function creditRechargeOrder(
  orderNo: string,
  alipayTradeNo: string,
  remark: string = "支付宝充值"
): Promise<void> {
  const db = getDb();
  const cmd = getCmd();

  // 查询订单（事务外首次读取）
  const orderRes = await db
    .collection(COLLECTIONS.RECHARGE_ORDERS)
    .where({ orderNo })
    .limit(1)
    .get();
  const orders = (orderRes.data || []) as Array<Record<string, unknown>>;
  if (orders.length === 0) {
    throw new ApiError(404, "订单不存在");
  }
  const order = orders[0];

  // 事务外幂等：已 credited 直接返回
  const orderStatus = String(order.status);
  if (orderStatus === "credited") {
    return;
  }

  // 事务外状态合法性检查（快速失败，避免无效事务）
  if (!CREDITABLE_STATUSES.has(orderStatus)) {
    throw new ApiError(400, `订单状态[${orderStatus}]不允许到账`);
  }

  // 校验 points（rechargePoints）字段：必须是 >0 的 SafeInteger
  const rechargePoints = Number(order.points);
  if (!Number.isSafeInteger(rechargePoints) || rechargePoints <= 0) {
    throw new ApiError(500, "订单积分数据异常");
  }

  // 校验 alipayTradeNo 非空
  if (!alipayTradeNo || alipayTradeNo.trim() === "") {
    throw new ApiError(400, "支付宝交易号不能为空");
  }

  await db.runTransaction(async (tx: {
    collection: (name: string) => {
      doc: (id: string) => {
        get: () => Promise<{ data?: Record<string, unknown> | null }>;
        update: (data: Record<string, unknown>) => Promise<unknown>;
      };
      add: (data: Record<string, unknown>) => Promise<unknown>;
    };
  }) => {
    // 事务内重新读取订单状态（防并发）
    const orderId = String(order._id);
    const orderRes2 = (await tx
      .collection(COLLECTIONS.RECHARGE_ORDERS)
      .doc(orderId)
      .get()) as { data?: Record<string, unknown> | null };
    const orderDoc = orderRes2.data ?? null;
    if (!orderDoc) throw new Error("订单不存在");

    // 事务内双重幂等检查
    const orderDocStatus = String(orderDoc.status);
    if (orderDocStatus === "credited") {
      return; // 已被其他路径到账，直接退出事务
    }

    // 事务内再次检查状态合法性（防止并发下状态被其他事务修改）
    if (!CREDITABLE_STATUSES.has(orderDocStatus)) {
      throw new Error(`订单状态[${orderDocStatus}]不允许到账`);
    }

    // 更新订单状态
    await tx.collection(COLLECTIONS.RECHARGE_ORDERS).doc(orderId).update({
      status: "credited",
      paidAt: db.serverDate(),
      creditedAt: db.serverDate(),
      alipayTradeNo: alipayTradeNo,
    });

    // 增加用户 paidPoints 和总 points（只增加 paidPoints，不影响 bonusPoints）
    const userId = String(order.userId);
    await tx.collection(COLLECTIONS.USERS).doc(userId).update({
      paidPoints: cmd.inc(rechargePoints),
      points: cmd.inc(rechargePoints),
      updatedAt: db.serverDate(),
    });

    // 写入积分流水
    await tx.collection(COLLECTIONS.POINT_LOGS).add({
      userId: userId,
      type: "recharge",
      points: rechargePoints,
      remark,
      createdAt: db.serverDate(),
    });
  }, 3);
}
