import { getDb } from "@/lib/cloudbase";

/**
 * 校验图片 fileID 归属：
 * - 管理员：放行
 * - 普通用户：仅允许其本人订单内的图片
 * 返回 true/false，不抛错
 */
export async function verifyFileOwner(
  userId: string,
  isAdmin: boolean,
  fileId: string
): Promise<boolean> {
  if (isAdmin) return true;
  const db = getDb();

  const hasOrder = async (
    collection: string,
    field: string
  ): Promise<boolean> => {
    const res = await db
      .collection(collection)
      .where({ userId, [field]: fileId })
      .limit(1)
      .get();
    return (res.data || []).length > 0;
  };

  // 找图订单：previewImages（普通用户可见）
  if (await hasOrder("generation_orders", "previewImages")) return true;

  // 找图订单：referenceImageUrl（用户上传的参考图，本人可见）
  if (await hasOrder("generation_orders", "referenceImageUrl")) return true;

  // 高清订单：resultImageUrl（属主可见）
  if (await hasOrder("upscale_orders", "resultImageUrl")) return true;

  // 风格订单：previewImageUrl（普通用户可见）
  if (await hasOrder("style_orders", "previewImageUrl")) return true;

  // 用户上传的源图（高清/风格订单的 sourceImageUrl）
  if (await hasOrder("upscale_orders", "sourceImageUrl")) return true;
  if (await hasOrder("style_orders", "sourceImageUrl")) return true;

  return false;
}
