import { NextRequest } from "next/server";
import { createHash } from "crypto";
import {
  COLLECTIONS,
  EMAIL_VERIFY_BONUS_POINTS,
} from "@/lib/constants";
import { getDb } from "@/lib/cloudbase";
import { requireUser } from "@/lib/server/auth";
import { verifyEmailCode } from "@/lib/email";
import { ApiError, handleApiError, json } from "@/lib/server/api";

/** 对规范化邮箱生成 SHA-256 哈希，用作 verified_emails 集合的 _id */
function emailHash(normalizedEmail: string): string {
  return createHash("sha256").update(normalizedEmail, "utf8").digest("hex");
}

/** CloudBase 事务回调中 collection.doc 的操作接口 */
type TxDoc = {
  get: () => Promise<{ data?: Record<string, unknown> | null }>;
  update: (data: Record<string, unknown>) => Promise<unknown>;
  add: (data: Record<string, unknown>) => Promise<unknown>;
};

type TxCollection = {
  doc: (id: string) => TxDoc;
  add: (data: Record<string, unknown>) => Promise<unknown>;
};

type Tx = {
  collection: (name: string) => TxCollection;
};

/**
 * POST /api/my/verify-email
 * 验证邮箱并完成 150 积分奖励发放。
 *
 * 架构：
 *   1. 事务外：执行一次验证码校验（消耗验证码，防止重试时重复消耗）
 *   2. 事务外（迁移窗口）：检查 users.emailVerified 历史用户，防止回填前被绕过
 *   3. 事务内：仅执行数据库操作，不再调用任何外部服务
 *
 * 事务内步骤：
 *   1. 重新读 user 快照
 *   2. 检查 registerBonusGranted / emailVerifyBonusGranted（防并发重放）
 *   3. 检查 verified_emails/{hash}（同邮箱并发保护）
 *   4. 更新 users 集合（email + emailVerified + emailVerifyBonusGranted + inc 积分）
 *   5. upsert verified_emails 集合（幂等占用）
 *   6. 写入 point_logs
 *   7. 写入 bonus_claims
 * 任一环节失败整体 rollback，最多重试 3 次。
 *
 * 历史状态兼容：
 *   A. emailVerifyBonusGranted=true / registerBonusGranted=true → 已领取，不再发 150
 *   B. emailVerified=true + registerBonusGranted=false → 信任历史验证状态，允许一次性领取 150
 *   C. emailVerified=false → 新用户，正常验证后领取
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const session = await requireUser();
    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const code = String(body?.code || "");
    const verificationId = String(body?.verificationId || "");

    if (!email) {
      throw new ApiError(400, "请输入邮箱地址");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      throw new ApiError(400, "邮箱格式不正确");
    }
    if (!code) {
      throw new ApiError(400, "请输入邮箱验证码");
    }
    if (!verificationId) {
      throw new ApiError(400, "缺少验证码会话ID，请重新获取验证码");
    }

    const db = getDb();
    const cmd = (await import("@/lib/cloudbase")).getCmd();
    const hash = emailHash(email);

    // ──────────────────────────────────────────────────────
    // 步骤 1（事务外）：验证码校验 — 仅此一次，防止重试时重复消耗
    // ──────────────────────────────────────────────────────
    const verified = await verifyEmailCode({ email, code, verificationId });
    if (!verified) {
      throw new ApiError(400, "验证码错误或已过期，请重新获取");
    }

    // ──────────────────────────────────────────────────────
    // 步骤 2（事务外，迁移窗口保护）：检查历史已验证用户
    // 防止 verified_emails 回填未完成时被其他历史用户绕过
    // 事务内无法调用 where()，故在此提前检查
    // ──────────────────────────────────────────────────────
    const histRes = await db
      .collection(COLLECTIONS.USERS)
      .where({ email, emailVerified: true })
      .limit(10)
      .get();
    const histUsers = (histRes.data || []) as Array<{ _id: string }>;
    const otherHist = histUsers.filter((u) => String(u._id) !== session.id);
    if (otherHist.length > 0) {
      throw new ApiError(
        400,
        "该邮箱已被其他账号验证使用，无法重复领取"
      );
    }

    // ──────────────────────────────────────────────────────
    // 步骤 3（事务内）：原子完成所有数据库操作
    // ──────────────────────────────────────────────────────
    let success = false;

    await db.runTransaction(async (tx: Tx) => {
      // 重新读取用户最新快照
      const userRes = (await tx
        .collection(COLLECTIONS.USERS)
        .doc(session.id)
        .get()) as { data?: Record<string, unknown> | null };
      const user = userRes.data ?? null;
      if (!user) throw new ApiError(404, "用户不存在");

      // 再次检查奖励是否已领取（防并发重放）
      if (Boolean(user.emailVerifyBonusGranted) || Boolean(user.registerBonusGranted)) {
        throw new ApiError(400, "邮箱验证奖励已领取，无法重复发放");
      }

      // 检查 verified_emails 集合（同邮箱并发保护）
      const existingRes = (await tx
        .collection(COLLECTIONS.VERIFIED_EMAILS)
        .doc(hash)
        .get()) as { data?: Record<string, unknown> | null };
      const existing = existingRes.data ?? null;
      if (existing && String(existing.userId) !== session.id) {
        throw new ApiError(
          400,
          "该邮箱已被其他账号验证使用，无法重复领取"
        );
      }

      // 更新 users 集合
      await tx.collection(COLLECTIONS.USERS).doc(session.id).update({
        email,
        emailVerified: true,
        emailVerifyBonusGranted: true,
        emailVerifyBonusGrantedAt: db.serverDate(),
        points: cmd.inc(EMAIL_VERIFY_BONUS_POINTS),
        bonusPoints: cmd.inc(EMAIL_VERIFY_BONUS_POINTS),
        updatedAt: db.serverDate(),
      });

      // upsert verified_emails（幂等，同一邮箱只绑定一个用户）
      const currentRes = (await tx
        .collection(COLLECTIONS.VERIFIED_EMAILS)
        .doc(hash)
        .get()) as { data?: Record<string, unknown> | null };
      if (!currentRes.data) {
        await tx.collection(COLLECTIONS.VERIFIED_EMAILS).doc(hash).add({
          _id: hash,
          userId: session.id,
          email,
          createdAt: db.serverDate(),
        });
      }

      // 写入积分流水
      await tx.collection(COLLECTIONS.POINT_LOGS).add({
        userId: session.id,
        type: "email_verify_bonus",
        points: EMAIL_VERIFY_BONUS_POINTS,
        remark: "邮箱验证奖励",
        createdAt: db.serverDate(),
      });

      // 写入赠送领取记录（审计追踪）
      await tx.collection(COLLECTIONS.BONUS_CLAIMS).add({
        userId: session.id,
        type: "email_verify_bonus",
        source: "email_verification",
        bonus: EMAIL_VERIFY_BONUS_POINTS,
        status: "granted",
        email,
        createdAt: db.serverDate(),
      });

      success = true;
    }, 3); // 最多重试 3 次（并发冲突时自动重试，不重新消费验证码）

    if (!success) {
      throw new ApiError(500, "验证失败，请稍后重试");
    }

    return json({
      success: true,
      message: "邮箱验证成功，已发放 " + EMAIL_VERIFY_BONUS_POINTS + " 积分",
      points: EMAIL_VERIFY_BONUS_POINTS,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
