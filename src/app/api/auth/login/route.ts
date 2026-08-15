import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { COLLECTIONS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { setSession } from "@/lib/session";
import { ApiError, handleApiError, json } from "@/lib/server/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");

    if (!username || !password) {
      throw new ApiError(400, "请输入用户名和密码");
    }

    const db = getDb();
    const res = await db
      .collection(COLLECTIONS.USERS)
      .where({ username })
      .limit(1)
      .get();
    const user = (res.data || [])[0] as
      | (Record<string, unknown> & { _id?: string })
      | undefined;

    if (!user || !user.passwordHash) {
      throw new ApiError(400, "用户名或密码错误");
    }

    const ok = await bcrypt.compare(password, String(user.passwordHash));
    if (!ok) {
      throw new ApiError(400, "用户名或密码错误");
    }

    const paidPoints = Number(user.paidPoints ?? 0);
    const bonusPoints = Number(user.bonusPoints ?? 0);
    // 双池字段均存在才以双池之和为准（points 总字段可能是陈旧值）；
    // 旧用户（两个双池字段都不存在）才信任历史 points 字段；
    // 只存在一个双池字段时视为异常数据，不自动把缺失字段当 0，回落显示历史 points
    const hasDualPool =
      user.paidPoints !== undefined && user.bonusPoints !== undefined;
    const points = hasDualPool
      ? paidPoints + bonusPoints
      : Number(user.points || 0);
    await setSession({
      id: user._id as string,
      username,
      nickname: user.nickname as string | undefined,
      email: user.email as string | undefined,
      phone: user.phone as string | undefined,
      isAdmin: Boolean(user.isAdmin),
      points,
      paidPoints,
      bonusPoints,
    });

    return json({
      success: true,
      user: {
        id: user._id,
        username,
        nickname: user.nickname,
        email: user.email,
        phone: user.phone,
        isAdmin: Boolean(user.isAdmin),
        points,
        paidPoints,
        bonusPoints,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
