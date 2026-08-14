import { NextRequest } from "next/server";
import { COLLECTIONS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { requireUser } from "@/lib/server/auth";
import { ApiError, handleApiError, json } from "@/lib/server/api";

/**
 * 作品详情：普通用户仅返回水印预览图；管理员返回原图。
 * 支持 generation / oil / illustration / upscale 四类。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireUser();
    const { id } = await params;
    const db = getDb();

    // 尝试从四类订单中查找
    for (const collection of [
      COLLECTIONS.GENERATION_ORDERS,
      COLLECTIONS.STYLE_ORDERS,
      COLLECTIONS.UPSCALE_ORDERS,
    ]) {
      const res = await db.collection(collection).doc(id).get();
      const order = res.data as Record<string, unknown> | undefined;
      if (!order || !order._id) continue;

      if (String(order.userId) !== session.id && !session.isAdmin) {
        throw new ApiError(403, "无权查看该作品");
      }

      let type = "unknown";
      if (collection === COLLECTIONS.GENERATION_ORDERS) type = "generation";
      if (collection === COLLECTIONS.STYLE_ORDERS)
        type = order.styleType === "illustration" ? "illustration" : "oil";
      if (collection === COLLECTIONS.UPSCALE_ORDERS) type = "upscale";

      const data: Record<string, unknown> = { ...order, type };
      // 普通用户：剥离原图字段
      if (!session.isAdmin) {
        delete data.originalImages;
        delete data.originalResultImageUrl;
      }

      return json({ item: data });
    }

    throw new ApiError(404, "作品不存在");
  } catch (e) {
    return handleApiError(e);
  }
}
