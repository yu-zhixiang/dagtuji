import tcb from "@cloudbase/node-sdk";

type CloudApp = ReturnType<typeof tcb.init>;

let app: CloudApp | null = null;

/** 获取 CloudBase 应用实例（懒加载单例） */
export function getCloudbase(): CloudApp {
  if (app) return app;
  const envId = process.env.TCB_ENV_ID;
  const secretId = process.env.TCB_SECRET_ID;
  const secretKey = process.env.TCB_SECRET_KEY;
  if (!envId) {
    throw new Error("缺少环境变量 TCB_ENV_ID，请检查 .env.local 配置");
  }
  app = tcb.init({
    env: envId,
    secretId,
    secretKey,
  });
  return app;
}

/** 获取数据库实例 */
export function getDb() {
  return getCloudbase().database();
}

/** 获取数据库命令（条件更新/原子增减） */
export function getCmd() {
  return getDb().command;
}
