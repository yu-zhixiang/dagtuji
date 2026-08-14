import { NextRequest } from "next/server";
import { COLLECTIONS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { requireAdmin } from "@/lib/server/auth";
import { handleApiError, json } from "@/lib/server/api";

const PAGE_SIZE = 50;

/** 风格订单列表（支持筛选 全部/油画/插画/待处理/处理中/已完成/失败） */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const db = getDb();
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "";
    const styleType = url.searchParams.get("styleType") || "";
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));

    const cond: Record<string, unknown> = {};
    if (status && status !== "all") cond.status = status;
    if (styleType && styleType !== "all") cond.styleType = styleType;

    const res = await db
      .collection(COLLECTIONS.STYLE_ORDERS)
      .where(cond)
      .orderBy("createdAt", "desc")
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .get();

    return json({ items: res.data || [], page });
  } catch (e) {
    return handleApiError(e);
  }
}
