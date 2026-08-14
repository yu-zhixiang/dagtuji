import { getCloudbase } from "@/lib/cloudbase";
import { ApiError } from "./api";

/** 从 CloudBase 存储下载文件为 Buffer */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const app = getCloudbase();
  try {
    const res = await app.downloadFile({ fileID: fileId });
    return res.fileContent as Buffer;
  } catch {
    throw new ApiError(400, "文件读取失败");
  }
}

/** 上传文件到 CloudBase 存储，返回 fileID */
export async function uploadFile(
  cloudPath: string,
  content: Buffer
): Promise<string> {
  const app = getCloudbase();
  const res = await app.uploadFile({
    cloudPath,
    fileContent: content,
  });
  return res.fileID;
}
