"use client";

/** 客户端解析 CloudBase fileID 为可访问 URL */
export async function getTempFileURL(fileId: string): Promise<string> {
  const res = await fetch(`/api/file?fileId=${encodeURIComponent(fileId)}`);
  const data = await res.json();
  if (!res.ok || !data.url) {
    throw new Error(data.error || "加载失败");
  }
  return data.url;
}
