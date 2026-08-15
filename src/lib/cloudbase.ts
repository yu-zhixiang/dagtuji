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

/**
 * 归一化 doc().get() 的返回结果。
 * 普通模式（非事务）返回 res.data 为数组，单文档位于 data[0]；
 * 事务模式返回 res.data 为文档对象（或 null）。
 * 统一兼容两种形态，避免 SDK 差异导致字段读取失败。
 * @returns 文档对象；未命中时返回 undefined
 */
export function unwrapDoc<T extends Record<string, unknown> = Record<string, unknown>>(
  res: { data?: unknown } | undefined | null
): T | undefined {
  const data = res?.data;
  if (Array.isArray(data)) {
    return (data[0] as T | undefined) ?? undefined;
  }
  if (data && typeof data === "object") {
    return data as T;
  }
  return undefined;
}
