import FindImageForm from "@/components/find-image/FindImageForm";
import { FIND_IMAGE_COST } from "@/lib/constants";

export const metadata = { title: "找图" };

export default function FindImagePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          找<span className="brand-gradient">图</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          输入关键词，我们将为你找到满意的图片 · {FIND_IMAGE_COST}积分/次
        </p>
      </div>
      <FindImageForm />
    </div>
  );
}
