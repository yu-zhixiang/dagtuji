"use client";

import { useEffect, useRef, useState } from "react";
import ImageCard from "@/components/ui/ImageCard";
import { formatDate } from "@/lib/utils";

type Order = Record<string, unknown>;

const STATUS_TEXT: Record<string, string> = {
  pending: "待处理",
  processing: "处理中",
  completed: "已完成",
  failed: "已失败",
};
const statusClass = (s: string) =>
  `badge ${s === "completed" ? "badge-completed" : s === "failed" ? "badge-failed" : s === "processing" ? "badge-processing" : "badge-pending"}`;

export default function AdminOrders() {
  const [items, setItems] = useState<Order[]>([]);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<Order | null>(null);

  function load() {
    setLoading(true);
    fetch(`/api/admin/orders?status=${status}`)
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
    fetch(`/api/admin/orders?status=${status}`)
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
  }, [status]);

  async function update(id: string, action: string, adminNote?: string) {
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, adminNote }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "操作失败");
      return;
    }
    load();
  }

  function handleUpload() {
    if (!uploadTarget || !fileInputRef.current?.files?.length) return;
    const files = Array.from(fileInputRef.current.files);
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    fetch(`/api/admin/orders/${String(uploadTarget._id)}`, {
      method: "POST",
      body: fd,
    })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) {
          alert(d.error || "上传失败");
          return;
        }
        setUploadTarget(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        load();
      })
      .catch(() => alert("上传失败"));
  }

  const orderActions = (order: Order) => {
    const s = String(order.status);
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {s === "pending" && (
          <button onClick={() => update(String(order._id), "processing")} className="btn-secondary !py-1.5 text-xs">
            标记处理中
          </button>
        )}
        {s === "pending" || s === "processing" ? (
          <>
            <button
              onClick={() => {
                setUploadTarget(order);
                setTimeout(() => fileInputRef.current?.click(), 0);
              }}
              className="btn-primary !py-1.5 text-xs"
            >
              上传结果原图
            </button>
            <button onClick={() => update(String(order._id), "complete")} className="btn-secondary !py-1.5 text-xs">
              标记完成
            </button>
            <button onClick={() => update(String(order._id), "failed")} className="btn-danger !py-1.5 text-xs">
              标记失败（自动退2分）
            </button>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {["all", "pending", "processing", "completed", "failed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`cursor-pointer rounded-xl border px-4 py-2 text-sm transition-colors ${
              status === s
                ? "border-transparent bg-gradient-to-r from-[#7c5cff] to-[#6d3bff] text-white"
                : "border-border bg-card text-zinc-400 hover:border-[#3a3a44]"
            }`}
          >
            {s === "all" ? "全部" : STATUS_TEXT[s]}
          </button>
        ))}
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <p className="dt-card p-10 text-center text-zinc-500">暂无找图订单</p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((order) => (
            <div key={String(order._id)} className="dt-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {String(order.keyword).slice(0, 40)}
                    </span>
                    <span className={statusClass(String(order.status))}>
                      {STATUS_TEXT[String(order.status)]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    单号 {String(order.orderNo)} · {formatDate(order.createdAt)}
                    {order.userId ? ` · 用户 ${String(order.userId).slice(0, 8)}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    数量 {String(order.quantity)} · 比例{" "}
                    {order.ratio === "custom"
                      ? `${order.customRatioWidth}:${order.customRatioHeight}`
                      : String(order.ratio)}
                    · 消耗 {String(order.costPoints)} 积分
                  </p>
                  <button
                    onClick={() => navigator.clipboard.writeText(String(order.keyword))}
                    className="mt-2 cursor-pointer rounded-lg border border-border bg-black/20 px-2 py-1 text-xs text-zinc-400 hover:text-white"
                  >
                    复制关键词
                  </button>
                </div>
              </div>

              {/* 用户上传的参考图（可选） */}
              {order.referenceImageUrl ? (
                <div className="mt-4">
                  <p className="mb-2 text-xs text-zinc-500">参考图：</p>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    <ImageCard fileId={String(order.referenceImageUrl)} />
                  </div>
                </div>
              ) : null}

              {/* 原图 / 预览图（管理员可看原图） */}
              <div className="mt-4">
                <p className="mb-2 text-xs text-zinc-500">
                  原图（{String(Array.isArray(order.originalImages) ? order.originalImages.length : 0)}）：
                </p>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {(Array.isArray(order.originalImages)
                    ? (order.originalImages as string[])
                    : []
                  ).map((fid) => (
                    <ImageCard key={fid} fileId={fid} />
                  ))}
                </div>
                <p className="mb-2 mt-3 text-xs text-zinc-500">
                  水印预览（{String(Array.isArray(order.previewImages) ? order.previewImages.length : 0)}）：
                </p>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {(Array.isArray(order.previewImages)
                    ? (order.previewImages as string[])
                    : []
                  ).map((fid) => (
                    <ImageCard key={fid} fileId={fid} />
                  ))}
                </div>
              </div>

              {order.adminNote ? (
                <p className="mt-3 rounded-lg bg-black/20 px-3 py-2 text-xs text-zinc-400">
                  备注：{String(order.adminNote)}
                </p>
              ) : null}

              {orderActions(order)}
            </div>
          ))}
        </div>
      )}

      {/* 上传提示弹窗 */}
      {uploadTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="dt-card w-full max-w-md p-6">
            <h3 className="text-lg font-semibold">上传结果原图</h3>
            <p className="mt-2 text-sm text-zinc-400">
              选择 1-{String(uploadTarget.quantity || 1)} 张结果原图，系统将自动生成水印预览图。
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setUploadTarget(null)} className="btn-secondary">
                取消
              </button>
              <button onClick={handleUpload} className="btn-primary">
                选择并上传
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
