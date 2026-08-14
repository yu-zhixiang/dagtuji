import UploadForm from "@/components/upload/UploadForm";
import { STYLE_OIL_COST } from "@/lib/constants";

export const metadata = { title: "图片改油画" };

export default function OilPaintingPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          图片改<span className="brand-gradient">油画</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          上传图片生成艺术油画质感 · {STYLE_OIL_COST}积分/张
        </p>
      </div>
      <UploadForm
        endpoint="/api/styles"
        buttonText="上传图片"
        helpText={`图片改油画将消耗 ${STYLE_OIL_COST} 积分，完成后可在「我的作品」查看`}
        styleType="oil_painting"
      />
    </div>
  );
}
