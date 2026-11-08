import { HandoverScreen } from '@/components/shop/HandoverScreen';

export default async function HandoverPage({ params }: { params: Promise<{ shopId: string; id: string }> }) {
  const { shopId, id } = await params;
  return <HandoverScreen shopId={shopId} id={id} />;
}
