import { NextRequest } from "next/server";
import { COLLECTIONS } from "@/lib/constants";
import { getCloudbase, getDb, unwrapDoc } from "@/lib/cloudbase";
import { requireAdmin } from "@/lib/server/auth";
import { createWatermarkedPreview } from "@/lib/server/images";
import { refundOnce } from "@/lib/server/points";
import { ApiError, handleApiError, json } from "@/lib/server/api";

/**
 * 找图订单管理：
 * - PATCH: { action: "processing" | "complete" | "failed", adminNote?, status? }
 * - POST : multipart 上传结果原图（自动生成水印预览）
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

    const orderRes = await db.collection(COLLECTIONS.GENERATION_ORDERS).doc(id).get();
    const order = unwrapDoc(orderRes);
    if (!order || !order._id) throw new ApiError(404, "订单不存在");

    if (action === "processing") {
      await db.collection(COLLECTIONS.GENERATION_ORDERS).doc(id).update({
        status: "processing",
      });
      return json({ success: true });
    }

    if (action === "complete") {
      await db.collection(COLLECTIONS.GENERATION_ORDERS).doc(id).update({
        status: "completed",
        completedAt: db.serverDate(),
        adminNote: body?.adminNote || order.adminNote || undefined,
      });
      return json({ success: true });
    }

    if (action === "failed") {
      // 失败退款（防重复）
      const refunded = await refundOnce(
        id,
        COLLECTIONS.GENERATION_ORDERS,
        String(order.userId),
        Number(order.costPoints || 0),
        "generation_refund",
        `找图失败退款：${String(order.keyword || "").slice(0, 20)}`
      );
      await db.collection(COLLECTIONS.GENERATION_ORDERS).doc(id).update({
        status: "failed",
        adminNote: body?.adminNote || order.adminNote || "任务失败",
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

    const orderRes = await db.collection(COLLECTIONS.GENERATION_ORDERS).doc(id).get();
    const order = unwrapDoc(orderRes);
    if (!order || !order._id) throw new ApiError(404, "订单不存在");

    const formData = await req.formData();
    const files = formData.getAll("files").filter((f) => f instanceof File);
    if (files.length === 0) throw new ApiError(400, "请上传结果原图");

    const quantity = Number(order.quantity || 1);
    if (files.length > quantity) {
      throw new ApiError(400, `该订单数量为 ${quantity}，最多上传 ${quantity} 张`);
    }

    const originalImages: string[] = Array.isArray(order.originalImages)
      ? (order.originalImages as string[])
      : [];
    const previewImages: string[] = Array.isArray(order.previewImages)
      ? (order.previewImages as string[])
      : [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i] as File;
      if (!file.type.startsWith("image/")) {
        throw new ApiError(400, `第 ${i + 1} 个文件不是图片`);
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 8);

      // 原图
      const originalCloudPath = `generation-results/${id}/original-${ts}-${rand}.${ext}`;
      const originalUp = await app.uploadFile({
        cloudPath: originalCloudPath,
        fileContent: buffer,
      });
      originalImages.push(originalUp.fileID);

      // 自动生成水印预览图（800px + 水印写入文件）
      const previewBuffer = await createWatermarkedPreview(buffer);
      const previewCloudPath = `generation-results/${id}/preview-${ts}-${rand}.jpg`;
      const previewUp = await app.uploadFile({
        cloudPath: previewCloudPath,
        fileContent: previewBuffer,
      });
      previewImages.push(previewUp.fileID);
    }

    await db.collection(COLLECTIONS.GENERATION_ORDERS).doc(id).update({
      originalImages,
      previewImages,
    });

    return json({ success: true, uploaded: files.length });
  } catch (e) {
    return handleApiError(e);
  }
}
