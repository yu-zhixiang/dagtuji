import { NextRequest } from "next/server";
import { getCloudbase } from "@/lib/cloudbase";
import { requireUser } from "@/lib/server/auth";
import { verifyFileOwner } from "@/lib/server/ownership";
import { ApiError, handleApiError, json } from "@/lib/server/api";

export async function GET(req: NextRequest) {
  try {
    const session = await requireUser();
    const fileId = req.nextUrl.searchParams.get("fileId");
    if (!fileId) {
      throw new ApiError(400, "缺少 fileId");
    }

    // 属主校验：管理员放行；普通用户仅能访问自己订单内的图片
    const owned = await verifyFileOwner(session.id, session.isAdmin, fileId);
    if (!owned) {
      throw new ApiError(403, "无权访问该图片");
    }

    const app = getCloudbase();
    const res = await app.getTempFileURL({ fileList: [fileId] });
    const url = res.fileList?.[0]?.tempFileURL;
    if (!url) {
      throw new ApiError(500, "图片地址生成失败");
    }
    return json({ url });
  } catch (e) {
    return handleApiError(e);
  }
}
