import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { COLLECTIONS, REGISTER_BONUS_POINTS } from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { setSession } from "@/lib/session";
import { ApiError, handleApiError, json } from "@/lib/server/api";
import { grantRegisterBonus } from "@/lib/server/points";
import { isValidUsername } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    const nickname = String(body?.nickname || "").trim() || undefined;

    if (!isValidUsername(username)) {
      throw new ApiError(400, "用户名需为 2-32 位字母、数字或中文");
    }
    if (password.length < 6 || password.length > 64) {
      throw new ApiError(400, "密码长度需为 6-64 位");
    }

    const db = getDb();

    // 检查用户名唯一
    const dup = await db
      .collection(COLLECTIONS.USERS)
      .where({ username })
      .limit(1)
      .get();
    if ((dup.data || []).length > 0) {
      throw new ApiError(400, "该用户名已被注册");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const isAdmin = username === (process.env.ADMIN_USERNAME || "admin");

    const res = await db.collection(COLLECTIONS.USERS).add({
      username,
      nickname,
      passwordHash,
      points: 0,
      registerBonusGranted: false,
      isAdmin,
      createdAt: db.serverDate(),
    });

    const userId = res.id as string;

    // 注册赠送 200 积分（仅一次，防重复由条件更新保证）
    await grantRegisterBonus(userId, REGISTER_BONUS_POINTS);

    await setSession({
      id: userId,
      username,
      nickname,
      isAdmin,
      points: REGISTER_BONUS_POINTS,
    });

    return json({
      success: true,
      user: { id: userId, username, nickname, isAdmin, points: REGISTER_BONUS_POINTS },
    });
  } catch (e) {
    return handleApiError(e);
  }
}
