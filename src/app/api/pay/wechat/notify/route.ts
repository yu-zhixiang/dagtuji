import { NextRequest } from "next/server";
import { verifyNotify } from "@/lib/wechat";
import { creditRechargeOrder } from "@/lib/server/recharge";

/**
 * POST /api/pay/wechat/notify
 * 微信支付异步通知处理（APIv3）。
 *
 * 安全要求：
 * - 验签 + AES-256-GCM 解密由 wechat.verifyNotify() 完成
 * - 校验 outTradeNo / transactionId / tradeState / totalAmount
 * - 调用统一 creditRechargeOrder() 到账
 * - 幂等：重复 notify 不得重复加分
 * - 返回微信要求的 JSON 格式：{"code":"SUCCESS"/"FAIL","message":"..."}
 */
export async function POST(req: NextRequest): Promise<Response> {
  // 1. 读取原始请求体（JSON 格式）
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  // 2. 验签并解密回调数据
  let notifyData: Record<string, unknown>;
  try {
    notifyData = await verifyNotify(headers, rawBody);
  } catch (e) {
    console.error("[wechat] 验签或解密失败:", (e as Error).message);
    return new Response(
      JSON.stringify({ code: "FAIL", message: "验签失败" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. 从解密后的 resource 中提取字段
  const resource = notifyData?.resource as Record<string, unknown> | undefined;
  if (!resource) {
    console.error("[wechat] 回调数据缺少 resource 字段");
    return new Response(
      JSON.stringify({ code: "FAIL", message: "数据格式错误" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const outTradeNo = String(resource.out_trade_no ?? "");
  const transactionId = String(resource.transaction_id ?? "");
  const tradeState = String(resource.trade_state ?? "");

  // 4. 校验 out_trade_no 存在
  if (!outTradeNo) {
    console.error("[wechat] 缺少 out_trade_no");
    return new Response(
      JSON.stringify({ code: "FAIL", message: "缺少订单号" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 5. 校验 transactionId 存在
  if (!transactionId) {
    console.error("[wechat] 缺少 transaction_id");
    return new Response(
      JSON.stringify({ code: "FAIL", message: "缺少交易号" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 6. 校验 tradeState（仅 SUCCESS 状态触发到账）
  if (tradeState !== "SUCCESS") {
    console.log(
      `[wechat] 非成功状态: ${tradeState}, out_trade_no=${outTradeNo}`
    );
    return new Response(
      JSON.stringify({ code: "SUCCESS", message: "成功" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // 7. 微信 APIv3 回调金额字段 amount.total 单位是「分」（整数），直接解析
  const amountObj = resource.amount as { total?: unknown } | undefined;
  const rawTotal = Number(amountObj?.total ?? -1);
  if (!Number.isSafeInteger(rawTotal) || rawTotal <= 0) {
    console.error(
      `[wechat] 金额格式非法: ${rawTotal}, out_trade_no=${outTradeNo}`
    );
    return new Response(
      JSON.stringify({ code: "FAIL", message: "金额格式非法" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const notifyAmountFen = rawTotal;

  // 8. 查找订单并校验金额
  const { COLLECTIONS } = await import("@/lib/constants");
  const { getDb } = await import("@/lib/cloudbase");
  const db = getDb();
  const orderRes = await db
    .collection(COLLECTIONS.RECHARGE_ORDERS)
    .where({ orderNo: outTradeNo })
    .limit(1)
    .get();
  const orders = (orderRes.data || []) as Array<Record<string, unknown>>;
  if (orders.length === 0) {
    console.error(`[wechat] 订单不存在: ${outTradeNo}`);
    return new Response(
      JSON.stringify({ code: "FAIL", message: "订单不存在" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const order = orders[0];

  // 9. 校验金额一致性
  const orderAmount = Number(order.amount);
  if (notifyAmountFen !== orderAmount) {
    console.error(
      `[wechat] 金额不匹配: notify=${notifyAmountFen}分, order=${orderAmount}分, out_trade_no=${outTradeNo}`
    );
    return new Response(
      JSON.stringify({ code: "FAIL", message: "金额不一致" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 10. 幂等：已 credited 直接返回成功
  if (order.status === "credited") {
    console.log(`[wechat] 订单已到账，跳过: ${outTradeNo}`);
    return new Response(
      JSON.stringify({ code: "SUCCESS", message: "成功" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // 11. 调用统一 creditRechargeOrder()
  try {
    await creditRechargeOrder(
      outTradeNo,
      transactionId,
      `微信支付充值 ${order.packageId}`
    );
    console.log(`[wechat] 到账成功: ${outTradeNo}, transaction_id=${transactionId}`);
    return new Response(
      JSON.stringify({ code: "SUCCESS", message: "成功" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(`[wechat] 到账失败: ${outTradeNo}`, e);
    return new Response(
      JSON.stringify({ code: "FAIL", message: "到账失败" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
