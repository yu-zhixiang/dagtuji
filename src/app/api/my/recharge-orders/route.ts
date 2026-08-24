import { COLLECTIONS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { requireUser } from "@/lib/server/auth";
import { handleApiError, json } from "@/lib/server/api";

const PAGE_SIZE = 50;

/**
 * GET /api/my/recharge-orders
 * 获取当前用户的充值订单列表
 */
export async function GET() {
  try {
    const session = await requireUser();
    const db = getDb();

    const res = await db
      .collection(COLLECTIONS.RECHARGE_ORDERS)
      .where({ userId: session.id })
      .orderBy("createdAt", "desc")
      .limit(PAGE_SIZE)
      .get();

    const orders = (res.data || []) as Array<Record<string, unknown>>;

    return json({
      success: true,
      orders: orders.map((o) => ({
        _id: o._id,
        orderNo: String(o.orderNo),
        packageId: String(o.packageId),
        amount: Number(o.amount),
        points: Number(o.points),
        status: String(o.status),
        paymentMethod: o.paymentMethod ? String(o.paymentMethod) : undefined,
        alipayTradeNo: o.alipayTradeNo ? String(o.alipayTradeNo) : undefined,
        wechatTradeNo: o.wechatTradeNo ? String(o.wechatTradeNo) : undefined,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        creditedAt: o.creditedAt,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
