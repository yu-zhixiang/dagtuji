import { NextRequest } from "next/server";
import { COLLECTIONS, UPSCALE_COST } from "@/lib/constants";
import { getCloudbase, getDb } from "@/lib/cloudbase";
import { requireUser } from "@/lib/server/auth";
import { deductPoints } from "@/lib/server/points";
import { ApiError, handleApiError, json } from "@/lib/server/api";
import { generateOrderNo } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ApiError(400, "请上传图片文件");
    }
    if (!file.type.startsWith("image/")) {
      throw new ApiError(400, "仅支持图片文件");
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new ApiError(400, "图片不能超过 10MB");
    }

    const db = getDb();
    const app = getCloudbase();

    // 服务端扣费（固定 100 积分）
    await deductPoints(session.id, UPSCALE_COST, "upscale", "高清大图制作");

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const cloudPath = `upscale-sources/${session.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const upRes = await app.uploadFile({ cloudPath, fileContent: buffer });
    const fileId = upRes.fileID;

    const order = {
      orderNo: generateOrderNo("UPS"),
      userId: session.id,
      sourceType: "user_upload",
      sourceImageUrl: fileId,
      originalFileName: file.name,
      costPoints: UPSCALE_COST,
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
