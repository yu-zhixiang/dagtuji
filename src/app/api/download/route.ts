import { NextRequest, NextResponse } from "next/server";
import { COLLECTIONS } from "@/lib/constants";
import { getCloudbase, getDb } from "@/lib/cloudbase";
import { requireUser } from "@/lib/server/auth";
import { ApiError, handleApiError } from "@/lib/server/api";

/**
 * 高清图下载：仅限「已完成」的高清大图结果图（属主/管理员）
 * - 严格校验：fileId 必须是该用户某条 upscale_orders 的 resultImageUrl 且订单已完成
 * - 普通用户无法通过此接口下载原图或水印预览图
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireUser();
    const fileId = req.nextUrl.searchParams.get("fileId");
    if (!fileId) throw new ApiError(400, "缺少 fileId");

    const db = getDb();

    // 属主/管理员查找：必须是该用户的高清订单结果图且已完成
    const cond: Record<string, unknown> = {
      resultImageUrl: fileId,
      status: "completed",
    };
    if (!session.isAdmin) cond.userId = session.id;

    const res = await db.collection(COLLECTIONS.UPSCALE_ORDERS).where(cond).limit(1).get();
    if ((res.data || []).length === 0) {
      throw new ApiError(403, "无权下载该文件");
    }

    const app = getCloudbase();
    const urlRes = await app.getTempFileURL({ fileList: [fileId] });
    const url = urlRes.fileList?.[0]?.tempFileURL;
    if (!url) throw new ApiError(500, "文件地址生成失败");

    return NextResponse.redirect(url, 302);
  } catch (e) {
    return handleApiError(e);
  }
}
