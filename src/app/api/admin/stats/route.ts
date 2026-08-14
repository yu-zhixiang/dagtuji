import { COLLECTIONS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { requireAdmin } from "@/lib/server/auth";
import { handleApiError, json } from "@/lib/server/api";

/** 管理员首页统计 */
export async function GET() {
  try {
    await requireAdmin();
    const db = getDb();

    const usersRes = await db.collection(COLLECTIONS.USERS).count();
    const totalUsers = usersRes.total;

    // 今日订单（以本地时区零点为界）
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const todayRes = await db
      .collection(COLLECTIONS.GENERATION_ORDERS)
      .where({ createdAt: db.command.gte(startOfToday) })
      .count();
    const todayGen = todayRes.total;
    const todayStyleRes = await db
      .collection(COLLECTIONS.STYLE_ORDERS)
      .where({ createdAt: db.command.gte(startOfToday) })
      .count();
    const todayUpscaleRes = await db
      .collection(COLLECTIONS.UPSCALE_ORDERS)
      .where({ createdAt: db.command.gte(startOfToday) })
      .count();
    const todayOrders = todayGen + todayStyleRes.total + todayUpscaleRes.total;

    const pendingGen = (
      await db
        .collection(COLLECTIONS.GENERATION_ORDERS)
        .where({ status: "pending" })
        .count()
    ).total;
    const pendingStyle = (
      await db
        .collection(COLLECTIONS.STYLE_ORDERS)
        .where({ status: "pending" })
        .count()
    ).total;
    const pendingUpscale = (
      await db
        .collection(COLLECTIONS.UPSCALE_ORDERS)
        .where({ status: "pending" })
        .count()
    ).total;

    const completedGen = (
      await db
        .collection(COLLECTIONS.GENERATION_ORDERS)
        .where({ status: "completed" })
        .count()
    ).total;
    const completedStyle = (
      await db
        .collection(COLLECTIONS.STYLE_ORDERS)
        .where({ status: "completed" })
        .count()
    ).total;
    const completedUpscale = (
      await db
        .collection(COLLECTIONS.UPSCALE_ORDERS)
        .where({ status: "completed" })
        .count()
    ).total;
    const completedOrders = completedGen + completedStyle + completedUpscale;

    return json({
      totalUsers,
      todayOrders,
      pendingGen,
      pendingStyle,
      pendingUpscale,
      completedOrders,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
