"use client";

import { useEffect, useState } from "react";
import ImageCard from "@/components/ui/ImageCard";
import { UPSCALE_COST } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

type WorkItem = Record<string, unknown>;

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "generation", label: "找图" },
  { key: "oil", label: "油画风格" },
  { key: "illustration", label: "插画风格" },
  { key: "upscale", label: "高清大图" },
] as const;

const TYPE_TEXT: Record<string, string> = {
  generation: "找图",
  oil: "油画风格",
  illustration: "插画风格",
  upscale: "高清大图",
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "badge-pending",
    processing: "badge-processing",
    completed: "badge-completed",
    failed: "badge-failed",
  };
  return map[status] || "badge-pending";
}
const STATUS_TEXT: Record<string, string> = {
  pending: "待处理",
  processing: "处理中",
  completed: "已完成",
  failed: "已失败",
};

export default function WorksViewer() {
  const [filter, setFilter] = useState("all");
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [upscaleTarget, setUpscaleTarget] = useState<WorkItem | null>(null);
  const [upscaleLoading, setUpscaleLoading] = useState(false);
  const [upscaleMsg, setUpscaleMsg] = useState("");

  function load() {
    setLoading(true);
    setError("");
    fetch(`/api/my/works?filter=${filter}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setItems(d.items || []);
      })
      .catch(() => setError("加载失败"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/my/works?filter=${filter}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        if (d.error) setError(d.error);
        else setItems(d.items || []);
      })
      .catch(() => {
        if (active) setError("加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter]);

  /** 对找图/风格作品发起高清大图制作 */
  async function confirmUpscale() {
    if (!upscaleTarget) return;
    setUpscaleLoading(true);
    setUpscaleMsg("");
    try {
      const type = String(upscaleTarget.type || "");
      const body =
        type === "generation"
          ? {
              sourceType: "generated",
              generationOrderId: String(upscaleTarget._id),
              sourceImageIndex: 0,
            }
          : type === "oil" || type === "illustration"
            ? {
                sourceType: type === "oil" ? "style_oil" : "style_illustration",
                styleOrderId: String(upscaleTarget._id),
              }
            : null;
      if (!body) {
        setUpscaleMsg("该作品不可制作高清大图");
        return;
      }
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
      setUpscaleMsg("已提交制作，消耗 100 积分，可在「我的作品」查看进度");
      setUpscaleTarget(null);
      setTimeout(load, 600);
    } catch {
      setUpscaleMsg("网络错误，请稍后再试");
    } finally {
      setUpscaleLoading(false);
    }
  }

  return (
    <div>
      {/* 筛选 */}
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`cursor-pointer rounded-xl border px-4 py-2 text-sm transition-colors ${
              filter === f.key
                ? "border-transparent bg-gradient-to-r from-[#7c5cff] to-[#6d3bff] text-white"
                : "border-border bg-card text-zinc-400 hover:border-[#3a3a44]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="dt-card p-14 text-center text-zinc-500">
          <p className="text-lg">暂无作品</p>
          <p className="mt-2 text-sm">
            去
            <a href="/find-image" className="mx-1 text-[#a78bfa]">
              找图
            </a>
            或上传图片，开启你的作品集
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div key={String(item._id)} className="dt-card flex flex-col overflow-hidden">
              {/* 图片区域 */}
              <div className="p-3">
                {item.type === "generation" ? (
                  <div className="grid grid-cols-2 gap-2">
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
                ) : item.type === "oil" || item.type === "illustration" ? (
                  <ImageCard
                    fileId={String(item.previewImageUrl || "")}
                    ratio="1:1"
                    alt={TYPE_TEXT[String(item.type)]}
                  />
                ) : (
                  <ImageCard
                    fileId={String(item.resultImageUrl || "")}
                    ratio="1:1"
                    alt="高清大图"
                  />
                )}
              </div>

              {/* 信息区 */}
              <div className="flex flex-1 flex-col gap-2 border-t border-border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {item.type === "generation"
                      ? (String(item.keyword).slice(0, 16) +
                          (String(item.keyword).length > 16 ? "…" : ""))
                      : TYPE_TEXT[String(item.type)]}
                  </span>
                  <span className={`badge ${statusBadge(String(item.status))}`}>
                    {STATUS_TEXT[String(item.status)] || String(item.status)}
                  </span>
                </div>
                <p className="text-xs text-zinc-500">
                  {formatDate(item.createdAt)} · 单号 {String(item.orderNo)}
                </p>

                {/* 已完成作品：查看 + 高清 */}
                {item.status === "completed" &&
                  (item.type === "generation" ||
                    item.type === "oil" ||
                    item.type === "illustration") && (
                    <div className="mt-1 flex gap-2">
                      <a
                        href={`/my/works/${String(item._id)}`}
                        className="btn-secondary flex-1 !py-2 text-sm"
                      >
                        查看
                      </a>
                      <button
                        onClick={() => setUpscaleTarget(item)}
                        className="btn-primary flex-1 !py-2 text-sm"
                      >
                        高清大图 · {UPSCALE_COST}积分
                      </button>
                    </div>
                  )}

                {/* 高清图已完成：查看高清 + 下载 */}
                {item.status === "completed" &&
                  item.type === "upscale" &&
                  item.resultImageUrl ? (
                    <div className="mt-1 flex gap-2">
                      <a
                        href={`/my/works/${String(item._id)}`}
                        className="btn-secondary flex-1 !py-2 text-sm"
                      >
                        查看高清图
                      </a>
                      <a
                        href={`/api/download?fileId=${encodeURIComponent(String(item.resultImageUrl))}`}
                        className="btn-primary flex-1 !py-2 text-sm"
                      >
                        下载高清图
                      </a>
                    </div>
                  ) : null}

                {item.refunded === true && item.status === "failed" && (
                  <p className="text-xs text-amber-300">已自动退款</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 高清制作确认弹窗 */}
      {upscaleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="dt-card w-full max-w-md p-6">
            <h3 className="text-lg font-semibold">制作高清大图</h3>
            <p className="mt-3 text-sm text-zinc-400">
              将消耗 <span className="font-semibold text-amber-300">{UPSCALE_COST} 积分</span>
              ，从该作品中选 1 张制作高清大图，确认继续？
            </p>
            {upscaleMsg && (
              <p className="mt-3 rounded-lg bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
                {upscaleMsg}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  setUpscaleTarget(null);
                  setUpscaleMsg("");
                }}
                className="btn-secondary"
                disabled={upscaleLoading}
              >
                取消
              </button>
              <button
                onClick={confirmUpscale}
                className="btn-primary"
                disabled={upscaleLoading}
              >
                {upscaleLoading ? "提交中…" : "确认制作"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
