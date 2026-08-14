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

    const points = Number(user.points || 0);
    await setSession({
      id: user._id as string,
      username,
      nickname: user.nickname as string | undefined,
      isAdmin: Boolean(user.isAdmin),
      points,
    });

    return json({
      success: true,
      user: {
        id: user._id,
        username,
        nickname: user.nickname,
        isAdmin: Boolean(user.isAdmin),
        points,
      },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
