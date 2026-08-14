import { NextRequest } from "next/server";
import {
  COLLECTIONS,
  STYLE_ILLUSTRATION_COST,
  STYLE_OIL_COST,
} from "@/lib/constants";
import { getCloudbase, getDb } from "@/lib/cloudbase";
import { requireAdmin } from "@/lib/server/auth";
import { createWatermarkedPreview } from "@/lib/server/images";
import { refundOnce } from "@/lib/server/points";
import { ApiError, handleApiError, json } from "@/lib/server/api";

/**
 * 风格订单管理：
 * - PATCH: { action: "processing" | "complete" | "failed", adminNote? }
 * - POST : multipart 上传结果原图（自动生成水印预览 + 标记完成）
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

    const orderRes = await db.collection(COLLECTIONS.STYLE_ORDERS).doc(id).get();
    const order = orderRes.data as Record<string, unknown> | undefined;
    if (!order || !order._id) throw new ApiError(404, "订单不存在");

    if (action === "processing") {
      await db.collection(COLLECTIONS.STYLE_ORDERS).doc(id).update({
        status: "processing",
      });
      return json({ success: true });
    }

    if (action === "complete") {
      if (!order.originalResultImageUrl) {
        throw new ApiError(400, "请先上传结果图");
      }
      await db.collection(COLLECTIONS.STYLE_ORDERS).doc(id).update({
        status: "completed",
        completedAt: db.serverDate(),
        adminNote: body?.adminNote || order.adminNote || undefined,
      });
      return json({ success: true });
    }

    if (action === "failed") {
      const cost =
        order.styleType === "oil_painting" ? STYLE_OIL_COST : STYLE_ILLUSTRATION_COST;
      // 失败自动退 10（防重复）
      const refunded = await refundOnce(
        id,
        COLLECTIONS.STYLE_ORDERS,
        String(order.userId),
        cost,
        "style_refund",
        "风格处理失败退款"
      );
      await db.collection(COLLECTIONS.STYLE_ORDERS).doc(id).update({
        status: "failed",
        adminNote: body?.adminNote || order.adminNote || "处理失败",
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

    const orderRes = await db.collection(COLLECTIONS.STYLE_ORDERS).doc(id).get();
    const order = orderRes.data as Record<string, unknown> | undefined;
    if (!order || !order._id) throw new ApiError(404, "订单不存在");

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "请上传结果原图");
    if (!file.type.startsWith("image/")) throw new ApiError(400, "仅支持图片文件");

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);

    // 结果原图
    const originalCloudPath = `style-results/${id}/original-${ts}-${rand}.${ext}`;
    const originalUp = await app.uploadFile({
      cloudPath: originalCloudPath,
      fileContent: buffer,
    });

    // 自动生成水印预览
    const previewBuffer = await createWatermarkedPreview(buffer);
    const previewCloudPath = `style-results/${id}/preview-${ts}-${rand}.jpg`;
    const previewUp = await app.uploadFile({
      cloudPath: previewCloudPath,
      fileContent: previewBuffer,
    });

    await db.collection(COLLECTIONS.STYLE_ORDERS).doc(id).update({
      originalResultImageUrl: originalUp.fileID,
      previewImageUrl: previewUp.fileID,
      status: "completed",
      completedAt: db.serverDate(),
    });

    return json({ success: true });
  } catch (e) {
    return handleApiError(e);
  }
}
