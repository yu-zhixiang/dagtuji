import { NextRequest } from "next/server";
import {
  COLLECTIONS,
  UPSCALE_COST,
  type UpscaleSourceType,
} from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { requireUser } from "@/lib/server/auth";
import { assertUpscaleAllowed, deductPoints, recordOrderRisk } from "@/lib/server/points";
import { getClientIp } from "@/lib/server/fraud";
import { ApiError, handleApiError, json } from "@/lib/server/api";
import { generateOrderNo } from "@/lib/utils";

/**
 * 从找图作品或风格作品发起高清大图制作
 * body: { sourceType: generated|style_oil|style_illustration, generationOrderId?, styleOrderId?, sourceImageIndex? }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    const body = await req.json().catch(() => null);

    const sourceType = String(body?.sourceType || "") as UpscaleSourceType;
    const generationOrderId = body?.generationOrderId
      ? String(body.generationOrderId)
      : undefined;
    const styleOrderId = body?.styleOrderId
      ? String(body.styleOrderId)
      : undefined;
    const sourceImageIndex = Number(body?.sourceImageIndex || 0);

    if (
      !["generated", "style_oil", "style_illustration"].includes(sourceType)
    ) {
      throw new ApiError(400, "无效的来源类型");
    }

    const db = getDb();

    // 服务端验证源图属于用户
    let sourceImageUrl = "";
    if (sourceType === "generated") {
      if (!generationOrderId) throw new ApiError(400, "缺少来源订单");
      const res = await db
        .collection(COLLECTIONS.GENERATION_ORDERS)
        .doc(generationOrderId)
        .get();
      const order = res.data as
        | (Record<string, unknown> & { userId?: string; previewImages?: string[] })
        | undefined;
      if (!order || order.userId !== session.id) {
        throw new ApiError(403, "无权操作该作品");
      }
      if (order.status !== "completed") {
        throw new ApiError(400, "该作品尚未完成");
      }
      const previews = order.previewImages || [];
      if (sourceImageIndex < 0 || sourceImageIndex >= previews.length) {
        throw new ApiError(400, "无效的图片索引");
      }
      sourceImageUrl = String(previews[sourceImageIndex]);
    } else {
      if (!styleOrderId) throw new ApiError(400, "缺少来源订单");
      const res = await db
        .collection(COLLECTIONS.STYLE_ORDERS)
        .doc(styleOrderId)
        .get();
      const order = res.data as
        | (Record<string, unknown> & { userId?: string; previewImageUrl?: string })
        | undefined;
      if (!order || order.userId !== session.id) {
        throw new ApiError(403, "无权操作该作品");
      }
      if (order.status !== "completed") {
        throw new ApiError(400, "该作品尚未完成");
      }
      sourceImageUrl = String(order.previewImageUrl || "");
      if (!sourceImageUrl) {
        throw new ApiError(400, "该作品缺少图片");
      }
    }

    // 未充值用户高清大图体验限制（最多 1 张）
    await assertUpscaleAllowed(session.id);

    // 服务端扣费（固定 100 积分）
    const deduct = await deductPoints(session.id, UPSCALE_COST, "upscale", "高清大图制作");

    // 下单风控检测（注册后批量下单提高风险值）
    await recordOrderRisk({ userId: session.id, ip: getClientIp(req), orderType: "upscale" });

    const order = {
      orderNo: generateOrderNo("UPS"),
      userId: session.id,
      sourceType,
      generationOrderId,
      styleOrderId,
      sourceImageUrl,
      sourceImageIndex: sourceType === "generated" ? sourceImageIndex : undefined,
      costPoints: UPSCALE_COST,
      // 原扣费明细（退款时原路退回）
      costPaid: deduct.paidDeducted,
      costBonus: deduct.bonusDeducted,
      status: "pending",
      refunded: false,
      createdAt: db.serverDate(),
    };

    const res = await db.collection(COLLECTIONS.UPSCALE_ORDERS).add(order);

    return json({
      success: true,
      orderNo: order.orderNo,
      orderId: res.id,
      costPoints: UPSCALE_COST,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
