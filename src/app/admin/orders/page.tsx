import AdminOrders from "@/components/admin/AdminOrders";

export const metadata = { title: "找图订单 - 管理后台" };

export default function AdminOrdersPage() {
  return (
    <div>
      <h2 className="mb-5 text-xl font-semibold">找图订单</h2>
      <AdminOrders />
    </div>
  );
}
