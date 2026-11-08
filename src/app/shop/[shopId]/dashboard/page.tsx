import { HoldsDashboard } from '@/components/shop/HoldsDashboard';

export const metadata = { title: 'Holds · Evenhand' };

export default async function DashboardPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <HoldsDashboard shopId={shopId} />;
}
