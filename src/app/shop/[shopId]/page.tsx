import { ShopHome } from '@/components/shop/ShopHome';

export default async function ShopPage({ params }: { params: Promise<{ shopId: string }> }) {
  const { shopId } = await params;
  return <ShopHome shopId={shopId} />;
}
