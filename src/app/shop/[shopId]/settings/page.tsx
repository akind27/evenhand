import { ShopSettings } from '@/components/shop/ShopSettings';

export default async function SettingsPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <ShopSettings shopId={shopId} />;
}
