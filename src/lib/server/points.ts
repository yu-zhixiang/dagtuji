import { COLLECTIONS, type PointLogType } from "@/lib/constants";
import { getCmd, getDb } from "@/lib/cloudbase";
import { ApiError } from "./api";

/**
 * 服务端积分扣减（条件原子扣减，防超扣）
 * @param userId 用户 _id
 * @param points 需扣除的积分数（正数）
 * @param type 流水类型
 * @param remark 流水备注
 * @returns true 扣减成功；false 积分不足（不抛错时）
 */
export async function deductPoints(
  userId: string,
  points: number,
  type: PointLogType,
  remark: string,
  throwIfNotEnough = true
): Promise<boolean> {
  if (points <= 0) return true;
  const db = getDb();
  const cmd = getCmd();
  const res = await db
    .collection(COLLECTIONS.USERS)
    .where({ _id: userId, points: cmd.gte(points) })
    .update({ points: cmd.inc(-points) });
  if (res.updated !== 1) {
    if (throwIfNotEnough) throw new ApiError(400, "积分不足");
    return false;
  }
  await addPointLog(userId, type, -points, remark);
  return true;
}

/**
 * 服务端积分退款（只加不退错）
 */
export async function refundPoints(
  userId: string,
  points: number,
  type: PointLogType,
  remark: string
): Promise<void> {
  if (points <= 0) return;
  const db = getDb();
  const cmd = getCmd();
  await db
    .collection(COLLECTIONS.USERS)
    .doc(userId)
    .update({ points: cmd.inc(points) });
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
 * 注册赠送积分（仅一次，防重复）
 */
export async function grantRegisterBonus(userId: string, bonus: number): Promise<void> {
  const db = getDb();
  const cmd = getCmd();
  // 条件更新：仅当 registerBonusGranted !== true 时授予
  const res = await db
    .collection(COLLECTIONS.USERS)
    .where({ _id: userId, registerBonusGranted: cmd.neq(true) })
    .update({
      points: cmd.inc(bonus),
      registerBonusGranted: true,
    });
  if (res.updated === 1) {
    await addPointLog(userId, "register_bonus", bonus, "注册赠送积分");
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
