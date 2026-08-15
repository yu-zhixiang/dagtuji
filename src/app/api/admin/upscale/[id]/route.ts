import { NextRequest } from "next/server";
import { COLLECTIONS, UPSCALE_COST } from "@/lib/constants";
import { getCloudbase, getDb, unwrapDoc } from "@/lib/cloudbase";
import { requireAdmin } from "@/lib/server/auth";
import { refundOnce } from "@/lib/server/points";
import { ApiError, handleApiError, json } from "@/lib/server/api";

/**
 * 高清大图订单管理：
 * - PATCH: { action: "processing" | "complete" | "failed", adminNote? }
 * - POST : multipart 上传最终高清图 resultImageUrl（同时标记完成）
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const action = String(body?.action || "");
    const db = getDb();

    const orderRes = await db.collection(COLLECTIONS.UPSCALE_ORDERS).doc(id).get();
    const order = unwrapDoc(orderRes);
    if (!order || !order._id) throw new ApiError(404, "订单不存在");

    if (action === "processing") {
      await db.collection(COLLECTIONS.UPSCALE_ORDERS).doc(id).update({
        status: "processing",
        adminNote: body?.adminNote || order.adminNote || undefined,
      });
      return json({ success: true });
    }

    if (action === "complete") {
      if (!order.resultImageUrl) {
        throw new ApiError(400, "请先上传最终高清图");
      }
      await db.collection(COLLECTIONS.UPSCALE_ORDERS).doc(id).update({
        status: "completed",
        completedAt: db.serverDate(),
        adminNote: body?.adminNote || order.adminNote || undefined,
      });
      return json({ success: true });
    }

    if (action === "failed") {
      // 失败自动退 100（防重复）
      const refunded = await refundOnce(
        id,
        COLLECTIONS.UPSCALE_ORDERS,
        String(order.userId),
        UPSCALE_COST,
        "upscale_refund",
        "高清大图制作失败退款"
      );
      await db.collection(COLLECTIONS.UPSCALE_ORDERS).doc(id).update({
        status: "failed",
        adminNote: body?.adminNote || order.adminNote || "制作失败",
      });
      return json({ success: true, refunded });
    }

    throw new ApiError(400, "无效的操作");
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const db = getDb();
    const app = getCloudbase();

    const orderRes = await db.collection(COLLECTIONS.UPSCALE_ORDERS).doc(id).get();
    const order = unwrapDoc(orderRes);
    if (!order || !order._id) throw new ApiError(404, "订单不存在");

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请上传最终高清图");
    if (!file.type.startsWith("image/")) throw new ApiError(400, "仅支持图片文件");

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const cloudPath = `upscale-results/${id}/final-${Date.now()}.${ext}`;
    const upRes = await app.uploadFile({ cloudPath, fileContent: buffer });

    await db.collection(COLLECTIONS.UPSCALE_ORDERS).doc(id).update({
      resultImageUrl: upRes.fileID,
    });

    return json({ success: true, fileId: upRes.fileID });
  } catch (e) {
    return handleApiError(e);
  }
}
