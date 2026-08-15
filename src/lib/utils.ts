/** 生成订单号 */
export function generateOrderNo(prefix: "GEN" | "UPS" | "STY"): string {
  const now = new Date();
  const y = String(now.getFullYear());
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}${y}${m}${d}${rand}`;
}

/** 解析 CloudBase 返回的时间值 */
export function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (obj.$date instanceof Date) return obj.$date;
    if (typeof obj.$date === "number") return new Date(obj.$date);
  }
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** 时间格式化 */
export function formatDate(v: unknown): string {
  const d = toDate(v);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

/** 积分增减显示 */
export function formatPoints(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** 安全截断文本 */
export function truncate(str: string, len: number): string {
  return str.length > len ? `${str.slice(0, len)}…` : str;
}

/** 校验邮箱/用户名格式（简单） */
export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9_@.\u4e00-\u9fa5]{2,32}$/.test(username);
}

/** 校验中国大陆手机号格式 */
export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone);
}

/** 从文件名中提取扩展名（默认 jpg） */
export function getFileExt(filename: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return m ? m[1].toLowerCase() : "jpg";
}

/** 自定义比例渲染，如 5:7 */
export function ratioText(
  ratio: string,
  w?: number,
  h?: number
): string {
  if (ratio === "custom" && w && h) return `${w}:${h}`;
  return ratio;
}
