import { getSession } from "@/lib/session";
import type { SessionUser } from "@/types";
import { ApiError } from "./api";

/** 要求已登录 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) {
    throw new ApiError(401, "请先登录");
  }
  return user;
}

/** 要求管理员 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) {
    throw new ApiError(403, "无管理员权限");
  }
  return user;
}
