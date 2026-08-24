import { NextRequest } from "next/server";
import { COLLECTIONS, RECHARGE_PACKAGES } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { requireUser } from "@/lib/server/auth";
import { ApiError, handleApiError, json } from "@/lib/server/api";
import { generateOrderNo } from "@/lib/alipay";
import { createNativeOrder } from "@/lib/wechat";

/**
 * POST /api/pay/wechat/create
 * 创建微信支付 Native 订单。
 *
 * 沙箱阶段：仅管理员可调用（防止普通用户测试支付）
 * 安全要求：
 * - amount 和 points 必须由服务端套餐配置决定，禁止信任前端传入
 * - orderNo 必须唯一且不可预测
 * - code_url 仅用于渲染二维码，不作为积分到账依据
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const session = await requireUser();
    // 沙箱阶段限制：仅管理员可充值
    if (process.env.WECHAT_MODE === "sandbox" && !session.isAdmin) {
      throw new ApiError(403, "沙箱充值仅管理员可用");
    }
    const body = await req.json().catch(() => null);
    const packageId = String(body?.packageId || "");

    // 1. 从服务端套餐配置查找（不信任前端传来的 amount/points）
    const pkg = RECHARGE_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      throw new ApiError(400, "无效的套餐 ID");
    }

    // 2. 生成唯一订单号
    let orderNo = "";
    let retries = 0;
    const db = getDb();
    while (retries < 10) {
      orderNo = generateOrderNo();
      const dup = await db
        .collection(COLLECTIONS.RECHARGE_ORDERS)
        .where({ orderNo })
        .limit(1)
        .get();
      if (!((dup.data || []).length > 0)) break;
      retries++;
    }
    if (retries >= 10) {
      throw new ApiError(500, "生成订单号失败，请稍后重试");
    }

    // 3. 写入 pending 订单
    const now = db.serverDate();
    const res = await db.collection(COLLECTIONS.RECHARGE_ORDERS).add({
      orderNo,
      userId: session.id,
      packageId: pkg.id,
      amount: pkg.amount, // 人民币金额（分）
      points: pkg.points, // 充值积分
      status: "pending",
      paymentMethod: "wechat",
      createdAt: now,
    });
    const orderId = res.id as string;

    // 4. 调用微信支付 Native 下单
    const codeUrl = await createNativeOrder(
      orderNo,
      pkg.amount,
      `大图集充值 ${pkg.points} 积分`
    );

    return json({
      success: true,
      orderId,
      orderNo,
      codeUrl,
      amount: pkg.amount,
      points: pkg.points,
      packageName: pkg.name,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
