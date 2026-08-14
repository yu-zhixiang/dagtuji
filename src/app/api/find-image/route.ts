import { NextRequest } from "next/server";
import {
  COLLECTIONS,
  FIND_IMAGE_COST,
  IMAGE_RATIOS,
  MAX_QUANTITY,
} from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { requireUser } from "@/lib/server/auth";
import { deductPoints } from "@/lib/server/points";
import { ApiError, handleApiError, json } from "@/lib/server/api";
import { uploadFile } from "@/lib/server/storage";
import { generateOrderNo, getFileExt } from "@/lib/utils";

/** 参考图大小限制 10MB */
const MAX_REF_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();

    // 支持 FormData（含可选参考图）与 JSON 两种提交方式
    let keyword = "";
    let quantity = 1;
    let ratio = "1:1";
    let customRatioWidth: number | undefined;
    let customRatioHeight: number | undefined;
    let referenceFileId: string | undefined;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      keyword = String(form.get("keyword") || "").trim();
      quantity = Number(form.get("quantity") || 1);
      ratio = String(form.get("ratio") || "1:1");
      const w = String(form.get("customRatioWidth") || "").trim();
      const h = String(form.get("customRatioHeight") || "").trim();
      if (w) customRatioWidth = Number(w);
      if (h) customRatioHeight = Number(h);

      const refFile = form.get("referenceImage");
      if (refFile instanceof File) {
        if (!refFile.type.startsWith("image/")) {
          throw new ApiError(400, "参考图需为图片文件");
        }
        if (refFile.size > MAX_REF_SIZE) {
          throw new ApiError(400, "参考图不能超过 10MB");
        }
        const buffer = Buffer.from(await refFile.arrayBuffer());
        const ext = getFileExt(refFile.name || "ref.jpg");
        const cloudPath = `generation-refs/${session.id}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;
        referenceFileId = await uploadFile(cloudPath, buffer);
      }
    } else {
      const body = await req.json().catch(() => null);
      keyword = String(body?.keyword || "").trim();
      quantity = Number(body?.quantity || 1);
      ratio = String(body?.ratio || "1:1");
      customRatioWidth = body?.customRatioWidth
        ? Number(body.customRatioWidth)
        : undefined;
      customRatioHeight = body?.customRatioHeight
        ? Number(body.customRatioHeight)
        : undefined;
    }

    if (!keyword) throw new ApiError(400, "请输入找图关键词");
    if (keyword.length > 500) throw new ApiError(400, "关键词过长");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new ApiError(400, "数量需为 1-4");
    }

    // 服务端固定比例校验（不信任浏览器）
    let validRatio = IMAGE_RATIOS.some((r) => r.label === ratio);
    if (ratio === "custom") {
      const w = customRatioWidth;
      const h = customRatioHeight;
      if (
        !w ||
        !h ||
        w < 1 ||
        h < 1 ||
        w > 20 ||
        h > 20 ||
        !Number.isInteger(w) ||
        !Number.isInteger(h)
      ) {
        throw new ApiError(400, "自定义比例宽高需为 1-20 之间的整数");
      }
      validRatio = true;
    }
    if (!validRatio) throw new ApiError(400, "无效的比例");

    const db = getDb();

    // 服务端扣费（固定 2 积分，条件原子扣减防超扣）
    const remark = `找图：${keyword.slice(0, 20)}${keyword.length > 20 ? "…" : ""}`;
    await deductPoints(session.id, FIND_IMAGE_COST, "generation", remark);

    const order = {
      orderNo: generateOrderNo("GEN"),
      userId: session.id,
      keyword,
      ratio,
      customRatioWidth: ratio === "custom" ? customRatioWidth : undefined,
      customRatioHeight: ratio === "custom" ? customRatioHeight : undefined,
      quantity,
      costPoints: FIND_IMAGE_COST,
      // 用户上传的参考图（可选），仅本人与管理员可见
      referenceImageUrl: referenceFileId,
      status: "pending",
      refunded: false,
      createdAt: db.serverDate(),
    };

    const res = await db.collection(COLLECTIONS.GENERATION_ORDERS).add(order);

    return json({
      success: true,
      orderNo: order.orderNo,
      orderId: res.id,
      costPoints: FIND_IMAGE_COST,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
