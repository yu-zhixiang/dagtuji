"use client";

import { useEffect, useState } from "react";
import { getTempFileURL } from "@/lib/client/storage";

interface ImageCardProps {
  fileId: string;
  alt?: string;
  ratio?: string;
}

/** 展示 CloudBase fileID 对应的图片（带水印预览） */
export default function ImageCard({ fileId, alt, ratio }: ImageCardProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    getTempFileURL(fileId)
      .then((u) => active && setUrl(u))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [fileId]);

  if (error) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-xl border border-border bg-card text-xs text-zinc-500">
        图片加载失败
      </div>
    );
  }

  const ratioClass =
    ratio === "9:16"
      ? "aspect-[9/16]"
      : ratio === "16:9"
        ? "aspect-video"
        : ratio === "3:4"
          ? "aspect-[3/4]"
          : ratio === "4:3"
            ? "aspect-[4/3]"
            : "aspect-square";

  return (
    <div
      className={`${ratioClass} w-full overflow-hidden rounded-xl border border-border bg-card`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt || "图片"}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
        </div>
      )}
    </div>
  );
}
