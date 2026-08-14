"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface UploadFormProps {
  endpoint: "/api/upscale" | "/api/styles";
  buttonText: string;
  helpText: string;
  accept?: string;
  styleType?: "oil_painting" | "illustration";
  sourceType?: "user_upload";
}

export default function UploadForm({
  endpoint,
  buttonText,
  helpText,
  accept = "image/*",
  styleType,
  sourceType,
}: UploadFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("请选择图片文件");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("图片不能超过 10MB");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("请先选择图片");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (styleType) formData.append("styleType", styleType);
      if (sourceType) formData.append("sourceType", sourceType);

      const res = await fetch(endpoint, { method: "POST", body: formData });
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
    } catch {
      setError("网络错误，请稍后再试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="dt-card flex flex-col gap-6 p-6">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed transition-colors ${
          preview
            ? "border-transparent bg-transparent"
            : "border-[#3a3a44] bg-black/20 hover:border-[#7c5cff]"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="预览"
            className="max-h-[320px] rounded-xl object-contain"
          />
        ) : (
          <>
            <span className="text-4xl">📤</span>
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-300">
                点击选择图片
              </p>
              <p className="mt-1 text-xs text-zinc-500">支持 JPG / PNG / WEBP，最大 10MB</p>
            </div>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFile}
      />
      {preview && (
        <button
          type="button"
          onClick={() => {
            setFile(null);
            setPreview(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
          className="btn-secondary !py-2 text-sm"
        >
          重新选择
        </button>
      )}

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary w-full !py-3 text-base" disabled={loading || !file}>
        {loading ? "提交中…" : buttonText}
      </button>
      <p className="text-center text-xs text-zinc-600">{helpText}</p>
    </form>
  );
}
