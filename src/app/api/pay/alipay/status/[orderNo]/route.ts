import { NextRequest } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { ApiError, handleApiError, json } from "@/lib/server/api";
import { queryPaymentStatus, yuanToFen } from "@/lib/alipay";
import { creditRechargeOrder } from "@/lib/server/recharge";

/** 需要向支付宝查询的状态 */
const NEEDS_QUERY_STATUS = new Set(["pending", "paid"]);

/**
 * GET /api/pay/alipay/status/[orderNo]
 * 主动查询支付状态（异步通知丢失或状态未知时的兜底）。
 * 查询成功后调用同一个 creditRechargeOrder() 幂等到账。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> }
): Promise<Response> {
  return handleApiError(async () => {
    const session = await requireUser();
    const { orderNo } = await params;

    const { COLLECTIONS } = await import("@/lib/constants");
    const { getDb } = await import("@/lib/cloudbase");
    const db = getDb();

    // 1. 查询订单
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

    // 2. 权限检查：只能查自己的订单
    if (String(order.userId) !== session.id) {
      throw new ApiError(403, "无权查看此订单");
    }

    const orderStatus = String(order.status);

    // 3. 如果已 credited，直接返回 DB 中的真实状态
    if (orderStatus === "credited") {
      return json({
        success: true,
        status: "credited",
        points: Number(order.points),
        creditedAt: order.creditedAt,
      });
    }

    // 4. 只对 pending / paid 状态进行支付宝查询（closed / failed 无需再查）
    if (!NEEDS_QUERY_STATUS.has(orderStatus)) {
      return json({
        success: true,
        status: orderStatus,
        points: Number(order.points),
      });
    }

    // 5. 查询支付宝交易状态
    const queryResult = await queryPaymentStatus(orderNo, order.alipayTradeNo as string | undefined);

    if (!queryResult.success) {
      return json({
        success: false,
        status: order.status,
        message: queryResult.message,
      });
    }

    // 6. 只有 SUCCESS 状态才执行到账
    if (queryResult.tradeStatus === "SUCCESS") {
      // 依次严格校验 queryResult 必要字段
      if (!queryResult.outTradeNo) {
        console.error(`[alipay] 查询成功但 outTradeNo 为空: orderNo=${orderNo}`);
        throw new ApiError(500, "支付宝查询结果缺少商户订单号");
      }
      if (queryResult.outTradeNo !== orderNo) {
        console.error(
          `[alipay] outTradeNo 不一致: query=${queryResult.outTradeNo}, order=${orderNo}`
        );
        throw new ApiError(400, "支付宝查询结果与订单号不一致");
      }
      if (!queryResult.tradeNo) {
        console.error(`[alipay] 查询成功但 tradeNo 为空: orderNo=${orderNo}`);
        throw new ApiError(500, "支付宝查询结果缺少交易号");
      }
      if (queryResult.totalAmount === undefined) {
        console.error(`[alipay] 查询成功但 totalAmount 缺失: orderNo=${orderNo}`);
        throw new ApiError(500, "支付宝查询结果缺少金额");
      }
      const queryAmountFen = yuanToFen(queryResult.totalAmount);
      if (queryAmountFen === null) {
        console.error(`[alipay] 查询金额格式非法: totalAmount=${queryResult.totalAmount}`);
        throw new ApiError(500, "支付宝查询金额格式非法");
      }
      const orderAmount = Number(order.amount);
      if (!Number.isSafeInteger(orderAmount) || orderAmount <= 0) {
        console.error(`[alipay] 订单金额非法: orderNo=${orderNo}, amount=${order.amount}`);
        throw new ApiError(500, "订单金额数据异常");
      }
      if (queryAmountFen !== orderAmount) {
        console.error(
          `[alipay] 查询金额与订单不一致: query=${queryAmountFen}分, order=${orderAmount}分, out_trade_no=${orderNo}`
        );
        throw new ApiError(400, "支付宝查询金额与订单不一致");
      }

      try {
        await creditRechargeOrder(orderNo, queryResult.tradeNo, `支付宝充值 ${order.packageId}（主动查询到账）`);
      } catch (e) {
        console.error(`[alipay] 主动查询到账失败: ${orderNo}`, e);
        throw new ApiError(500, "到账处理失败，请稍后重试");
      }

      // 到账成功后重新从 DB 读取真实状态（绝不返回模拟时间）
      const refreshedRes = await db
        .collection(COLLECTIONS.RECHARGE_ORDERS)
        .where({ orderNo })
        .limit(1)
        .get();
      const refreshedOrders = (refreshedRes.data || []) as Array<Record<string, unknown>>;
      const refreshedOrder = refreshedOrders[0];
      if (!refreshedOrder) {
        throw new ApiError(500, "到账后订单不存在");
      }

      return json({
        success: true,
        status: "credited",
        points: Number(refreshedOrder.points),
        creditedAt: refreshedOrder.creditedAt,
      });
    }

    // 非 SUCCESS 状态，返回当前订单状态
    return json({
      success: true,
      status: order.status,
      points: Number(order.points),
    });
  });
}
