import AdminReview from "@/components/admin/AdminReview";

export const metadata = {
  title: "风控审核 - 大图集管理后台",
};

export default function AdminReviewPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">风控人工审核</h2>
        <p className="mt-1 text-sm text-zinc-500">
          注册风控评估进入待审的用户，可人工通过（发放 200 赠送积分）或拒绝。
        </p>
      </div>
      <AdminReview />
    </div>
  );
}
