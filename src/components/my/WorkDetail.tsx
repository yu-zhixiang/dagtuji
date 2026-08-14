"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ImageCard from "@/components/ui/ImageCard";
import { UPSCALE_COST } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

const TYPE_TEXT: Record<string, string> = {
  generation: "找图",
  oil: "油画风格",
  illustration: "插画风格",
  upscale: "高清大图",
};
const STATUS_TEXT: Record<string, string> = {
  pending: "待处理",
  processing: "处理中",
  completed: "已完成",
  failed: "已失败",
};
const statusClass = (s: string) =>
  `badge ${s === "completed" ? "badge-completed" : s === "failed" ? "badge-failed" : s === "processing" ? "badge-processing" : "badge-pending"}`;

export default function WorkDetail({ id }: { id: string }) {
  const [item, setItem] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [upscaleLoading, setUpscaleLoading] = useState(false);
  const [upscaleMsg, setUpscaleMsg] = useState("");

  function load() {
    setError("");
    fetch(`/api/my/works/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setItem(d.item);
      })
      .catch(() => setError("加载失败"));
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/my/works/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else setItem(d.item);
      })
      .catch(() => {
        if (active) setError("加载失败");
      });
    return () => {
      active = false;
    };
  }, [id]);

  async function makeUpscale() {
    if (!item) return;
    setUpscaleLoading(true);
    setUpscaleMsg("");
    try {
      const type = String(item.type);
      const body =
        type === "generation"
          ? { sourceType: "generated", generationOrderId: id, sourceImageIndex: 0 }
          : { sourceType: type === "oil" ? "style_oil" : "style_illustration", styleOrderId: id };
      const res = await fetch("/api/upscale/from-works", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setUpscaleMsg(data.error || "提交失败");
        return;
      }
      setUpscaleMsg("已提交制作，消耗 100 积分");
      setTimeout(load, 800);
    } catch {
      setUpscaleMsg("网络错误");
    } finally {
      setUpscaleLoading(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="mx-auto flex max-w-3xl items-center justify-center px-4 py-20">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
      </div>
    );
  }

  const isGeneration = item.type === "generation";
  const isStyle = item.type === "oil" || item.type === "illustration";
  const isUpscale = item.type === "upscale";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/my/works" className="mb-6 inline-block text-sm text-zinc-400 hover:text-white">
        ← 返回我的作品
      </Link>

      <div className="dt-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">
              {isGeneration
                ? (String(item.keyword).slice(0, 30) +
                  (String(item.keyword).length > 30 ? "…" : ""))
                : TYPE_TEXT[String(item.type)]}
            </h1>
            <span className={statusClass(String(item.status))}>
              {STATUS_TEXT[String(item.status)]}
            </span>
          </div>
          <span className="text-xs text-zinc-500">
            单号 {String(item.orderNo)} · {formatDate(item.createdAt)}
          </span>
        </div>

        {/* 参考图（用户上传，可选） */}
        {isGeneration && item.referenceImageUrl ? (
          <div className="mb-4">
            <p className="mb-2 text-xs text-zinc-500">参考图：</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ImageCard fileId={String(item.referenceImageUrl)} alt="参考图" />
            </div>
          </div>
        ) : null}

        {/* 图片区 */}
        {isGeneration && (
          <div className="grid grid-cols-2 gap-3">
            {(Array.isArray(item.previewImages)
              ? (item.previewImages as string[])
              : []
            ).map((fid, i) => (
              <ImageCard
                key={fid}
                fileId={fid}
                ratio={String(item.ratio || "1:1")}
                alt={`${item.keyword}-${i + 1}`}
              />
            ))}
          </div>
        )}
        {isStyle && (
          <ImageCard
            fileId={String(item.previewImageUrl || "")}
            ratio="1:1"
            alt={TYPE_TEXT[String(item.type)]}
          />
        )}
        {isUpscale && (
          <ImageCard
            fileId={String(item.resultImageUrl || "")}
            ratio="1:1"
            alt="高清大图"
          />
        )}

        {/* 信息 */}
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          {isGeneration && (
            <>
              <div className="rounded-lg bg-black/20 p-3">
                <p className="text-xs text-zinc-500">数量</p>
                <p className="mt-1">{String(item.quantity)} 张</p>
              </div>
              <div className="rounded-lg bg-black/20 p-3">
                <p className="text-xs text-zinc-500">比例</p>
                <p className="mt-1">
                  {item.ratio === "custom"
                    ? `${item.customRatioWidth}:${item.customRatioHeight}`
                    : String(item.ratio)}
                </p>
              </div>
            </>
          )}
          <div className="rounded-lg bg-black/20 p-3">
            <p className="text-xs text-zinc-500">消耗积分</p>
            <p className="mt-1">-{String(item.costPoints)}</p>
          </div>
          <div className="rounded-lg bg-black/20 p-3">
            <p className="text-xs text-zinc-500">状态</p>
            <p className="mt-1">{STATUS_TEXT[String(item.status)]}</p>
          </div>
          {item.completedAt ? (
            <div className="rounded-lg bg-black/20 p-3">
              <p className="text-xs text-zinc-500">完成时间</p>
              <p className="mt-1">{formatDate(item.completedAt)}</p>
            </div>
          ) : null}
          {item.adminNote ? (
            <div className="col-span-2 rounded-lg bg-black/20 p-3">
              <p className="text-xs text-zinc-500">备注</p>
              <p className="mt-1">{String(item.adminNote)}</p>
            </div>
          ) : null}
        </div>

        {/* 操作 */}
        {item.status === "completed" && (isGeneration || isStyle) && (
          <div className="mt-6">
            <button
              onClick={makeUpscale}
              disabled={upscaleLoading}
              className="btn-primary w-full"
            >
              {upscaleLoading ? "提交中…" : `制作高清大图 · ${UPSCALE_COST}积分`}
            </button>
            {upscaleMsg && (
              <p className="mt-3 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
                {upscaleMsg}
              </p>
            )}
          </div>
        )}

        {item.status === "completed" && isUpscale && item.resultImageUrl ? (
          <div className="mt-6">
            <a
              href={`/api/download?fileId=${encodeURIComponent(String(item.resultImageUrl))}`}
              className="btn-primary w-full"
            >
              下载高清大图
            </a>
          </div>
        ) : null}

        {item.refunded === true && item.status === "failed" && (
          <p className="mt-4 text-sm text-amber-300">该任务失败，积分已自动退回</p>
        )}
      </div>
    </div>
  );
}
