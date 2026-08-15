import { NextRequest } from "next/server";
import { verifyNotifySign, yuanToFen } from "@/lib/alipay";
import { creditRechargeOrder } from "@/lib/server/recharge";

/**
 * POST /api/pay/alipay/notify
 * 支付宝异步通知处理。
 *
 * 安全要求：
 * - RSA2 验签
 * - 校验 app_id / seller_id（若配置）/ out_trade_no / trade_no / total_amount / trade_status
 * - 调用统一 creditRechargeOrder() 到账
 * - 幂等：重复 notify 不得重复加分
 * - return_url 不作为积分到账依据
 * - 返回纯文本 "success" 或 "fail"（从不返回 JSON）
 */
export async function POST(req: NextRequest): Promise<Response> {
  // 1. 解析通知数据（form 格式）
  const body = await req.text();
  const params = new URLSearchParams(body);
  const notifyData: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    notifyData[key] = value;
  }

  // 2. RSA2 验签
  if (!verifyNotifySign(notifyData)) {
    console.error("[alipay] 验签失败");
    return new Response("failure");
  }

  // 3. 校验 app_id
  const appId = process.env.ALIPAY_APP_ID || "";
  if (notifyData.app_id !== appId) {
    console.error("[alipay] app_id 不匹配");
    return new Response("failure");
  }

  // 4. 若配置了 seller_id，校验卖家身份
  const sellerId = process.env.ALIPAY_SELLER_ID || "";
  if (sellerId && notifyData.seller_id !== sellerId) {
    console.error("[alipay] seller_id 不匹配");
    return new Response("failure");
  }

  // 5. 校验 out_trade_no 存在
  if (!notifyData.out_trade_no) {
    console.error("[alipay] 缺少 out_trade_no");
    return new Response("failure");
  }

  // 6. 校验 trade_no 存在
  if (!notifyData.trade_no) {
    console.error("[alipay] 缺少 trade_no");
    return new Response("failure");
  }

  // 7. 校验 trade_status（允许 TRADE_SUCCESS 和 TRADE_FINISHED 两种成功状态）
  const tradeStatus = notifyData.trade_status;
  if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
    console.log(`[alipay] 非成功状态: ${tradeStatus}, out_trade_no=${notifyData.out_trade_no}`);
    return new Response("success"); // 非成功状态直接返回 success，不重复处理
  }

  // 8. 严格解析 total_amount → 分（禁用 parseFloat / Math.round）
  const notifyAmountFen = yuanToFen(notifyData.total_amount);
  if (notifyAmountFen === null) {
    console.error(`[alipay] 金额格式非法: ${notifyData.total_amount}, out_trade_no=${notifyData.out_trade_no}`);
    return new Response("failure");
  }

  // 9. 查找订单并校验金额
  const { COLLECTIONS } = await import("@/lib/constants");
  const { getDb } = await import("@/lib/cloudbase");
  const db = getDb();
  const orderRes = await db
    .collection(COLLECTIONS.RECHARGE_ORDERS)
    .where({ orderNo: notifyData.out_trade_no })
    .limit(1)
    .get();
  const orders = (orderRes.data || []) as Array<Record<string, unknown>>;
  if (orders.length === 0) {
    console.error(`[alipay] 订单不存在: ${notifyData.out_trade_no}`);
    return new Response("failure");
  }
  const order = orders[0];

  // 10. 校验金额一致性（严格相等，不使用模糊比较）
  const orderAmount = Number(order.amount);
  if (notifyAmountFen !== orderAmount) {
    console.error(
      `[alipay] 金额不匹配: notify=${notifyAmountFen}分, order=${orderAmount}分, out_trade_no=${notifyData.out_trade_no}`
    );
    return new Response("failure");
  }

  // 11. 幂等：已 credited 直接返回 success
  if (order.status === "credited") {
    console.log(`[alipay] 订单已到账，跳过: ${notifyData.out_trade_no}`);
    return new Response("success");
  }

  // 12. 调用统一 creditRechargeOrder()（void 返回，内部已处理幂等）
  try {
    await creditRechargeOrder(
      notifyData.out_trade_no,
      notifyData.trade_no,
      `支付宝充值 ${order.packageId}`
    );
    console.log(`[alipay] 到账成功: ${notifyData.out_trade_no}, trade_no=${notifyData.trade_no}`);
    return new Response("success");
  } catch (e) {
    console.error(`[alipay] 到账失败: ${notifyData.out_trade_no}`, e);
    // 到账失败返回 failure，让支付宝后续重试
    return new Response("failure");
  }
}
