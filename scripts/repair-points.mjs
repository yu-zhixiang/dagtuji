/**
 * 修复 users 集合中 points 总字段与双池字段不一致的数据。
 * 一致性要求：points === paidPoints + bonusPoints
 *
 * 分类处理：
 *   1. paidPoints / bonusPoints 都不存在 → 旧用户迁移：legacy points -> paidPoints，bonusPoints = 0
 *   2. 两个都存在 → 校验 points === paidPoints + bonusPoints，不一致时修正 points
 *   3. 只存在一个 → 视为异常数据，不自动把缺失字段当 0 覆盖 points，输出 warning 并跳过，等待人工确认
 *
 * 用法：
 *   node scripts/repair-points.mjs            # dry-run，只打印待处理用户，不写入
 *   node scripts/repair-points.mjs --apply     # 实际写入修复
 * 需要 .env.local 中存在 TCB_ENV_ID / TCB_SECRET_ID / TCB_SECRET_KEY。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import tcb from "@cloudbase/node-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes("--apply");

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
const USERS_COLLECTION = "users";
const PAGE_SIZE = 100;

async function main() {
  let offset = 0;
  let scanned = 0;
  let migrated = 0;
  let fixed = 0;
  let warned = 0;
  const migrateSamples = [];
  const fixSamples = [];
  const warnSamples = [];

  while (true) {
    const res = await db
      .collection(USERS_COLLECTION)
      .limit(PAGE_SIZE)
      .skip(offset)
      .get();
    const users = (res.data || []) || [];
    if (users.length === 0) break;

    scanned += users.length;
    for (const u of users) {
      const hasPaid = u.paidPoints !== undefined;
      const hasBonus = u.bonusPoints !== undefined;
      const current = Number(u.points ?? 0);

      // 1. 旧用户：两个双池字段都不存在 → 迁移 legacy points -> paidPoints，bonusPoints = 0
      if (!hasPaid && !hasBonus) {
        migrated += 1;
        if (migrateSamples.length < 10) {
          migrateSamples.push({
            _id: u._id,
            points: current,
            newPaid: current,
            newBonus: 0,
          });
        }
        if (APPLY) {
          await db.collection(USERS_COLLECTION).doc(u._id).update({
            paidPoints: current,
            bonusPoints: 0,
            points: current,
          });
        }
        continue;
      }

      // 3. 只存在一个双池字段 → 异常数据，跳过，等待人工确认
      if (hasPaid !== hasBonus) {
        warned += 1;
        if (warnSamples.length < 10) {
          warnSamples.push({
            _id: u._id,
            points: current,
            paidPoints: hasPaid ? Number(u.paidPoints) : undefined,
            bonusPoints: hasBonus ? Number(u.bonusPoints) : undefined,
          });
        }
        continue;
      }

      // 2. 双池字段都存在 → 校验 points === paidPoints + bonusPoints
      const paid = Number(u.paidPoints ?? 0);
      const bonus = Number(u.bonusPoints ?? 0);
      const expected = paid + bonus;
      if (current !== expected) {
        fixed += 1;
        if (fixSamples.length < 10) {
          fixSamples.push({
            _id: u._id,
            old: current,
            new: expected,
            paidPoints: paid,
            bonusPoints: bonus,
          });
        }
        if (APPLY) {
          await db.collection(USERS_COLLECTION).doc(u._id).update({ points: expected });
        }
      }
    }

    offset += users.length;
    if (users.length < PAGE_SIZE) break;
  }

  console.log(`[scan]   共扫描 ${scanned} 个用户`);
  console.log(`[migrate] 需要迁移 ${migrated} 个旧用户（points -> paidPoints）`);
  console.log(`[fix]    需要修正 points 总字段 ${fixed} 个用户`);
  console.log(`[warn]   双池字段仅存在一个（异常数据，跳过待人工确认） ${warned} 个用户`);
  console.log(APPLY ? "[mode] 已写入修复 (--apply)" : "[mode] dry-run，未写入任何数据");

  if (migrateSamples.length > 0) {
    console.log("\n迁移示例（最多 10 条，points -> paidPoints/bonusPoints）：");
    for (const s of migrateSamples) {
      console.log(
        `  _id=${s._id}  points=${s.points} -> paid=${s.newPaid}  bonus=${s.newBonus}`
      );
    }
  }
  if (fixSamples.length > 0) {
    console.log("\n修正示例（最多 10 条，points 旧值 -> 新值）：");
    for (const s of fixSamples) {
      console.log(
        `  _id=${s._id}  paid=${s.paidPoints}  bonus=${s.bonusPoints}  points: ${s.old} -> ${s.new}`
      );
    }
  }
  if (warnSamples.length > 0) {
    console.log("\n异常数据示例（最多 10 条，需人工确认，脚本未做任何写入）：");
    for (const s of warnSamples) {
      console.log(
        `  _id=${s._id}  points=${s.points}  paidPoints=${s.paidPoints ?? "(缺失)"}  bonusPoints=${s.bonusPoints ?? "(缺失)"}`
      );
    }
  }
  if (!APPLY && (migrated > 0 || fixed > 0)) {
    console.log("\n确认处理请运行：node scripts/repair-points.mjs --apply");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
