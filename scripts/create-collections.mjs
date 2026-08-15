/**
 * 创建数据库集合（防刷系统需要的新集合）。
 * 用法：node scripts/create-collections.mjs
 * 需要 .env.local 中存在 TCB_ENV_ID / TCB_SECRET_ID / TCB_SECRET_KEY。
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import tcb from "@cloudbase/node-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

const COLLECTIONS = [
  "users",
  "generation_orders",
  "upscale_orders",
  "style_orders",
  "point_logs",
  "sms_codes",
  "email_codes",
  "bonus_claims",
  "verified_emails",
  "recharge_orders",
  "risk_events",
  "rate_limits",
];

const app = tcb.init({ env: envId, secretId, secretKey });
const db = app.database();

async function main() {
  for (const name of COLLECTIONS) {
    try {
      // 先尝试读取，若不存在则创建
      const res = await db.collection(name).limit(1).get();
      console.log(`[ok] ${name} 已存在`);
    } catch {
      try {
        await db.createCollection(name);
        console.log(`[create] ${name}`);
      } catch (e) {
        console.error(`[error] ${name}: ${e.message}`);
      }
    }
  }
  console.log("完成");
}

main();
