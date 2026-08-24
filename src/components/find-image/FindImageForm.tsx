"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FIND_IMAGE_COST, IMAGE_RATIOS, MAX_QUANTITY } from "@/lib/constants";

/** 计算最大公约数 */
function gcd(a: number, b: number): number {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

/** 将宽高自动化简为最简整数比，格式如 "16:9"；非法输入返回空串 */
function formatAspectRatio(width: number, height: number): string {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return "";
  }
  const w = Math.trunc(width);
  const h = Math.trunc(height);
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

export default function FindImageForm() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [ratio, setRatio] = useState("1:1");
  const [customW, setCustomW] = useState("");
  const [customH, setCustomH] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCustom = ratio === "custom";
  // 仅用于预览比例显示，不影响输入框原始值
  const previewRatio = formatAspectRatio(Number(customW) || 0, Number(customH) || 0);

  function handleReferenceChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("参考图需为图片文件");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("参考图不能超过 10MB");
      return;
    }
    if (referencePreview) URL.revokeObjectURL(referencePreview);
    setReferenceFile(file);
    setReferencePreview(URL.createObjectURL(file));
    setError("");
  }

  function removeReference() {
    if (referencePreview) URL.revokeObjectURL(referencePreview);
    setReferenceFile(null);
    setReferencePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!keyword.trim()) {
      setError("请输入找图关键词");
      return;
    }
    let ratioValue = ratio;
    let w: number | undefined;
    let h: number | undefined;
    if (isCustom) {
      w = parseInt(customW, 10);
      h = parseInt(customH, 10);
      if (!w || !h || w < 1 || h < 1 || w > 20 || h > 20) {
        setError("自定义宽高需为 1-20 之间的整数");
        return;
      }
      ratioValue = "custom";
    }
    const fd = new FormData();
    fd.append("keyword", keyword.trim());
    fd.append("quantity", String(quantity));
    fd.append("ratio", ratioValue);
    if (w) fd.append("customRatioWidth", String(w));
    if (h) fd.append("customRatioHeight", String(h));
    if (referenceFile) fd.append("referenceImage", referenceFile);

    setLoading(true);
    fetch("/api/find-image", {
      method: "POST",
      body: fd,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/login");
            return;
          }
          setError(data.error || "提交失败");
          return;
        }
        router.push("/my/works");
        router.refresh();
      })
      .catch(() => setError("网络错误，请稍后再试"))
      .finally(() => setLoading(false));
  }

  return (
    <form onSubmit={handleSubmit} className="dt-card flex flex-col gap-6 p-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          关键词
        </label>
        <textarea
          className="input-field min-h-[110px] resize-y"
          placeholder="描述你想要的图片，例如：夕阳下的海边、森林里的小木屋、星空下的城市…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          maxLength={500}
        />
        <p className="mt-1 text-right text-xs text-zinc-600">
          {keyword.length}/500
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          参考图 <span className="text-zinc-600">（可选）</span>
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleReferenceChange}
        />
        {referencePreview ? (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-black/20 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={referencePreview}
              alt="参考图预览"
              className="h-24 w-24 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-zinc-300">
                {referenceFile?.name}
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                {referenceFile
                  ? `${(referenceFile.size / 1024 / 1024).toFixed(2)} MB`
                  : ""}
              </p>
              <button
                type="button"
                onClick={removeReference}
                className="mt-2 cursor-pointer text-xs text-red-400 hover:text-red-300"
              >
                移除参考图
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-black/20 px-4 py-8 text-sm text-zinc-500 transition-colors hover:border-[#3a3a44] hover:text-zinc-300"
          >
            <span className="text-2xl">+</span>
            点击上传参考图片（不超过 10MB）
          </button>
        )}
        <p className="mt-1 text-xs text-zinc-600">
          可上传一张图片作为参考，帮助我们更准确找到你想要的图
        </p>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          数量
        </label>
        <div className="flex items-center gap-3">
          {Array.from({ length: MAX_QUANTITY }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setQuantity(n)}
              className={`h-11 w-11 cursor-pointer rounded-xl border text-sm font-semibold transition-colors ${
                quantity === n
                  ? "border-transparent bg-gradient-to-r from-[#7c5cff] to-[#6d3bff] text-white"
                  : "border-border bg-card text-zinc-400 hover:border-[#3a3a44]"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-zinc-300">
          比例
        </label>
        <div className="flex flex-wrap gap-2">
          {IMAGE_RATIOS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRatio(r.label)}
              className={`cursor-pointer rounded-xl border px-4 py-2 text-sm transition-colors ${
                ratio === r.label
                  ? "border-transparent bg-gradient-to-r from-[#7c5cff] to-[#6d3bff] text-white"
                  : "border-border bg-card text-zinc-400 hover:border-[#3a3a44]"
              }`}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setRatio("custom")}
            className={`cursor-pointer rounded-xl border px-4 py-2 text-sm transition-colors ${
              isCustom
                ? "border-transparent bg-gradient-to-r from-[#7c5cff] to-[#6d3bff] text-white"
                : "border-border bg-card text-zinc-400 hover:border-[#3a3a44]"
            }`}
          >
            自定义
          </button>
        </div>

        {isCustom && (
          <div className="mt-4 rounded-xl border border-border bg-black/20 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <span className="mr-2 text-sm text-zinc-400">宽</span>
                <input
                  className="input-field !w-20 text-center"
                  type="number"
                  min={1}
                  max={20}
                  value={customW}
                  onChange={(e) => setCustomW(e.target.value)}
                  placeholder="5"
                />
              </div>
              <span className="text-zinc-600">:</span>
              <div>
                <span className="mr-2 text-sm text-zinc-400">高</span>
                <input
                  className="input-field !w-20 text-center"
                  type="number"
                  min={1}
                  max={20}
                  value={customH}
                  onChange={(e) => setCustomH(e.target.value)}
                  placeholder="7"
                />
              </div>
              <span className="ml-2 text-sm text-zinc-500">
                预览比例：
                <span className="font-semibold text-zinc-200">
                  {previewRatio || "?"}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary w-full !py-3 text-base" disabled={loading}>
        {loading ? "提交中…" : "找图"}
      </button>

      <p className="text-center text-xs text-zinc-600">
        每次找图消耗 {FIND_IMAGE_COST} 积分 · 提交后由专人处理，可到「我的作品」查看
      </p>
    </form>
  );
}
