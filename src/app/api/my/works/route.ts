import { NextRequest } from "next/server";
import { COLLECTIONS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { requireUser } from "@/lib/server/auth";
import { handleApiError, json } from "@/lib/server/api";

const PAGE_SIZE = 50;

/** 我的作品：筛选 全部/找图/油画/插画/高清大图。普通用户仅返回预览图，绝不返回原图。 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireUser();
    const db = getDb();
    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") || "all";

    type Doc = Record<string, unknown>;

    const pick = (d: Doc, type: string): Record<string, unknown> => ({
      _id: d._id,
      orderNo: d.orderNo,
      type,
      status: d.status,
      keyword: d.keyword,
      ratio: d.ratio,
      customRatioWidth: d.customRatioWidth,
      customRatioHeight: d.customRatioHeight,
      quantity: d.quantity,
      styleType: d.styleType,
      // 用户上传的参考图（仅本人可见，非结果图）
      referenceImageUrl: d.referenceImageUrl,
      // 普通用户只可见预览图（watermark），原图绝不返回
      previewImages: d.previewImages,
      previewImageUrl: d.previewImageUrl,
      sourceType: d.sourceType,
      resultImageUrl: d.resultImageUrl,
      costPoints: d.costPoints,
      adminNote: d.adminNote,
      refunded: d.refunded,
      createdAt: d.createdAt,
      completedAt: d.completedAt,
    });

    const items: Record<string, unknown>[] = [];

    // 找图
    if (filter === "all" || filter === "generation") {
      const res = await db
        .collection(COLLECTIONS.GENERATION_ORDERS)
        .where({ userId: session.id })
        .orderBy("createdAt", "desc")
        .limit(PAGE_SIZE)
        .get();
      items.push(...(res.data as Doc[]).map((d) => pick(d, "generation")));
    }

    // 风格（油画/插画）
    if (filter === "all" || filter === "oil" || filter === "illustration") {
      const cond =
        filter === "oil"
          ? { userId: session.id, styleType: "oil_painting" }
          : filter === "illustration"
            ? { userId: session.id, styleType: "illustration" }
            : { userId: session.id };
      const res = await db
        .collection(COLLECTIONS.STYLE_ORDERS)
        .where(cond)
        .orderBy("createdAt", "desc")
        .limit(PAGE_SIZE)
        .get();
      items.push(
        ...(res.data as Doc[]).map((d) =>
          pick(d, d.styleType === "illustration" ? "illustration" : "oil")
        )
      );
    }

    // 高清大图
    if (filter === "all" || filter === "upscale") {
      const res = await db
        .collection(COLLECTIONS.UPSCALE_ORDERS)
        .where({ userId: session.id })
        .orderBy("createdAt", "desc")
        .limit(PAGE_SIZE)
        .get();
      items.push(...(res.data as Doc[]).map((d) => pick(d, "upscale")));
    }

    items.sort(
      (a, b) =>
        new Date(String(b.createdAt)).getTime() -
        new Date(String(a.createdAt)).getTime()
    );

    return json({ items });
  } catch (e) {
    return handleApiError(e);
  }
}
