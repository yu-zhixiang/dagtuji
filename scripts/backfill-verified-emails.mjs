/**
 * 回填 verified_emails 集合的历史记录。
 *
 * 背景：
 *   2026-08-15 起，注册赠送改为邮箱验证奖励（+150积分）。
 *   新流程使用 verified_emails 集合（SHA-256(email) 为 _id）做同邮箱并发保护。
 *   但迁移前已 emailVerified=true 的历史用户没有该集合记录，
 *   需要回填以避免迁移窗口内被误判为"邮箱未被占用"。
 *
 * 用法：
 *   node scripts/backfill-verified-emails.mjs        # dry-run（默认），只打印分类结果
 *   node scripts/backfill-verified-emails.mjs --apply # 实际写入 verified_emails 集合
 *
 * 分类：
 *   create — 安全待创建：该邮箱在 verified_emails 中不存在，无其他历史用户共享
 *   ok     — 已正确存在：verified_emails 中已有记录且 userId 匹配
 *   duplicate — 多个历史用户共享同一 verified 邮箱：跳过，永远不自动修
 *   conflict — verified_emails 已属于其他 userId：跳过，永远不自动修
 *
 * 不修改：users、point_logs、bonus_claims 中的任何数据。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";
import tcb from "@cloudbase/node-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");

// ── 与生产代码完全一致的 emailHash 函数 ──────────────────────────────
function emailHash(normalizedEmail) {
  return createHash("sha256").update(normalizedEmail, "utf8").digest("hex");
}

// ── 环境变量加载（与 create-collections.mjs / repair-points.mjs 保持一致）──
function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnv();
const envId = env.TCB_ENV_ID || process.env.TCB_ENV_ID;
const secretId = env.TCB_SECRET_ID || process.env.TCB_SECRET_ID;
const secretKey = env.TCB_SECRET_KEY || process.env.TCB_SECRET_KEY;

if (!envId) {
  console.error("缺少 TCB_ENV_ID，请先配置 .env.local");
  process.exit(1);
}

const app = tcb.init({ env: envId, secretId, secretKey });
const db = app.database();
const USERS = "users";
const VERIFIED_EMAILS = "verified_emails";
const PAGE_SIZE = 200;

// ── 主逻辑 ────────────────────────────────────────────────────────────
async function main() {
  console.log(`[mode] ${APPLY ? "写入 (--apply)" : "dry-run（默认）"}`);
  console.log("");

  // 1. 扫描所有 verified 用户
  const verifiedUsers = [];
  let offset = 0;

  while (true) {
    const res = await db
      .collection(USERS)
      .limit(PAGE_SIZE)
      .skip(offset)
      .get();
    const batch = res.data || [];
    if (batch.length === 0) break;

    for (const u of batch) {
      // 条件：emailVerified === true 且 email 非空
      if (u.emailVerified && u.email && typeof u.email === "string") {
        const email = u.email.trim().toLowerCase();
        verifiedUsers.push({
          _id: u._id,
          username: u.username,
          nickname: u.nickname,
          email,
          emailVerified: u.emailVerified,
        });
      }
    }

    offset += batch.length;
    if (batch.length < PAGE_SIZE) break;
  }

  console.log(`[scan] 扫描到 ${verifiedUsers.length} 个 emailVerified=true 且有邮箱的用户`);

  if (verifiedUsers.length === 0) {
    console.log("[done] 无需回填");
    return;
  }

  // 2. 按 SHA-256 哈希分组
  const groups = new Map();
  for (const u of verifiedUsers) {
    const hash = emailHash(u.email);
    if (!groups.has(hash)) groups.set(hash, []);
    groups.get(hash).push(u);
  }

  console.log(`[scan] 涉及 ${groups.size} 个独立邮箱`);

  // 3. 查询 verified_emails 集合中已存在的记录（批量）
  const existingInDB = new Map(); // hash -> { userId, email }
  let dbOffset = 0;
  while (true) {
    const dbRes = await db
      .collection(VERIFIED_EMAILS)
      .limit(PAGE_SIZE)
      .skip(dbOffset)
      .get();
    const batch = dbRes.data || [];
    if (batch.length === 0) break;
    for (const doc of batch) {
      existingInDB.set(doc._id, { userId: doc.userId, email: doc.email });
    }
    dbOffset += batch.length;
    if (batch.length < PAGE_SIZE) break;
  }

  // 4. 分类
  const stats = { create: [], ok: [], duplicate: [], conflict: [] };

  for (const [hash, users] of groups) {
    const inDB = existingInDB.get(hash);
    const userIds = users.map((u) => u._id);

    if (inDB) {
      // verified_emails 中已有记录
      if (String(inDB.userId) === String(userIds[0])) {
        // 属于当前用户 → ok
        stats.ok.push({ hash, email: users[0].email, userId: users[0]._id });
      } else {
        // 属于其他用户 → conflict
        stats.conflict.push({
          hash,
          email: users[0].email,
          dbUserId: inDB.userId,
          users: users.map((u) => u._id),
        });
      }
    } else {
      // verified_emails 中无记录
      if (users.length === 1) {
        // 唯一用户 → create
        stats.create.push({ hash, email: users[0].email, userId: users[0]._id });
      } else {
        // 多用户共享 → duplicate（跳过，不自动修）
        stats.duplicate.push({
          hash,
          email: users[0].email,
          users: users.map((u) => `${u._id}(${u.username})`),
        });
      }
    }
  }

  // 5. 输出结果
  console.log("");
  console.log(`[ok]     已正确存在: ${stats.ok.length}`);
  console.log(`[create] 待创建:     ${stats.create.length}`);
  console.log(`[duplicate] 共享邮箱: ${stats.duplicate.length} 个邮箱，涉及 ${stats.duplicate.reduce((s, g) => s + g.users.length, 0)} 个用户`);
  console.log(`[conflict] 冲突:     ${stats.conflict.length}`);

  // 输出 create 列表（最多 20 条预览）
  if (stats.create.length > 0) {
    console.log("");
    console.log("[create] 预览（最多 20 条）：");
    for (const item of stats.create.slice(0, 20)) {
      console.log(`  _id=${item.hash}  email=${item.email}  userId=${item.userId}`);
    }
    if (stats.create.length > 20) {
      console.log(`  ... 还有 ${stats.create.length - 20} 条`);
    }
  }

  // 输出 duplicate 列表（最多 10 条预览）
  if (stats.duplicate.length > 0) {
    console.log("");
    console.log("[duplicate] 共享邮箱预览（最多 10 条）：");
    for (const item of stats.duplicate.slice(0, 10)) {
      console.log(`  email=${item.email}  users=[${item.users.join(", ")}]`);
    }
    if (stats.duplicate.length > 10) {
      console.log(`  ... 还有 ${stats.duplicate.length - 10} 条`);
    }
  }

  // 输出 conflict 列表（最多 10 条预览）
  if (stats.conflict.length > 0) {
    console.log("");
    console.log("[conflict] 冲突预览（最多 10 条）：");
    for (const item of stats.conflict.slice(0, 10)) {
      console.log(`  email=${item.email}  dbUserId=${item.dbUserId}  historyUsers=[${item.users.join(", ")}]`);
    }
    if (stats.conflict.length > 10) {
      console.log(`  ... 还有 ${stats.conflict.length - 10} 条`);
    }
  }

  // 6. --apply 写入 create 类
  if (APPLY) {
    if (stats.create.length === 0) {
      console.log("");
      console.log("[apply] 无需写入");
      return;
    }
    console.log("");
    console.log(`[apply] 开始写入 ${stats.create.length} 条 verified_emails 记录...`);
    let written = 0;
    for (const item of stats.create) {
      try {
        await db.collection(VERIFIED_EMAILS).add({
          _id: item.hash,
          userId: item.userId,
          email: item.email,
          createdAt: db.serverDate(),
        });
        written++;
      } catch (e) {
        // 并发写入冲突（极低概率），跳过
        console.error(`  [skip] ${item.email}: ${e.message}`);
      }
    }
    console.log(`[apply] 完成：成功写入 ${written}/${stats.create.length} 条`);
  } else {
    console.log("");
    console.log("确认写入请运行：node scripts/backfill-verified-emails.mjs --apply");
  }
}

main().catch((e) => {
  console.error("[error]", e);
  process.exit(1);
});
