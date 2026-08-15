import { NextRequest } from "next/server";
import { COLLECTIONS } from "@/lib/constants";
import { getDb, unwrapDoc } from "@/lib/cloudbase";
import { requireAdmin } from "@/lib/server/auth";
import { handleApiError, json } from "@/lib/server/api";

const PAGE_SIZE = 50;

/** 高清大图订单列表（管理员可见，来源为找图作品时附送原图） */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const db = getDb();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "";
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));

    const cond: Record<string, unknown> = {};
    if (status && status !== "all") cond.status = status;

    const res = await db
      .collection(COLLECTIONS.UPSCALE_ORDERS)
      .where(cond)
      .orderBy("createdAt", "desc")
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .get();

    const items = (res.data || []) as Record<string, unknown>[];

    // 来源为找图作品时，补充找图订单原图（仅管理员接口返回）
    for (const item of items) {
      if (
        item.sourceType === "generated" &&
        item.generationOrderId &&
        typeof item.generationOrderId === "string"
      ) {
        try {
          const genRes = await db
            .collection(COLLECTIONS.GENERATION_ORDERS)
            .doc(String(item.generationOrderId))
            .get();
          const gen = unwrapDoc<Record<string, unknown> & { originalImages?: string[] }>(
            genRes
          );
          item.sourceOriginalImages = gen?.originalImages || [];
        } catch {
          item.sourceOriginalImages = [];
        }
      }
    }

    return json({ items, page });
  } catch (e) {
    return handleApiError(e);
  }
}
