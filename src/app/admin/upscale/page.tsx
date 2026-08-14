import AdminUpscale from "@/components/admin/AdminUpscale";

export const metadata = { title: "高清大图订单 - 管理后台" };

export default function AdminUpscalePage() {
  return (
    <div>
      <h2 className="mb-5 text-xl font-semibold">高清大图订单</h2>
      <AdminUpscale />
    </div>
  );
}
