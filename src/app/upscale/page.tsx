import UploadForm from "@/components/upload/UploadForm";
import { UPSCALE_COST } from "@/lib/constants";

export const metadata = { title: "高清大图" };

export default function UpscalePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          高清大<span className="brand-gradient">图</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          上传图片生成超清大图 · {UPSCALE_COST}积分/张
        </p>
      </div>
      <UploadForm
        endpoint="/api/upscale"
        buttonText="上传图片"
        helpText={`制作高清大图将消耗 ${UPSCALE_COST} 积分，完成后可下载高清原图`}
        sourceType="user_upload"
      />
    </div>
  );
}
