import AdminStyles from "@/components/admin/AdminStyles";

export const metadata = { title: "风格订单 - 管理后台" };

export default function AdminStylesPage() {
  return (
    <div>
      <h2 className="mb-5 text-xl font-semibold">风格订单</h2>
      <AdminStyles />
    </div>
  );
}
