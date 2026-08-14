import { NextRequest } from "next/server";
import {
  COLLECTIONS,
  STYLE_ILLUSTRATION_COST,
  STYLE_OIL_COST,
  type PointLogType,
  type StyleType,
} from "@/lib/constants";
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
    const styleType = String(formData.get("styleType") || "") as StyleType;

    if (styleType !== "oil_painting" && styleType !== "illustration") {
      throw new ApiError(400, "无效的风格类型");
    }
    if (!(file instanceof File)) {
      throw new ApiError(400, "请上传图片文件");
    }
    if (!file.type.startsWith("image/")) {
      throw new ApiError(400, "仅支持图片文件");
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new ApiError(400, "图片不能超过 10MB");
    }

    const cost = styleType === "oil_painting" ? STYLE_OIL_COST : STYLE_ILLUSTRATION_COST;
    const pointLogType: PointLogType =
      styleType === "oil_painting" ? "style_oil" : "style_illustration";
    const typeText = styleType === "oil_painting" ? "图片改油画" : "图片改插画";

    const db = getDb();
    const app = getCloudbase();

    // 服务端扣费（固定 10 积分）
    await deductPoints(session.id, cost, pointLogType, typeText);

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const cloudPath = `style-sources/${session.id}/${styleType}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const upRes = await app.uploadFile({ cloudPath, fileContent: buffer });
    const fileId = upRes.fileID;

    const order = {
      orderNo: generateOrderNo("STY"),
      userId: session.id,
      styleType,
      sourceImageUrl: fileId,
      originalFileName: file.name,
      costPoints: cost,
      status: "pending",
      refunded: false,
      createdAt: db.serverDate(),
    };

    const res = await db.collection(COLLECTIONS.STYLE_ORDERS).add(order);

    return json({
      success: true,
      orderNo: order.orderNo,
      orderId: res.id,
      costPoints: cost,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
