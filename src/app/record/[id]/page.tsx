import { RecordScreen } from '@/components/record/RecordScreen';
import '../../print.css';

export const metadata = {
  title: 'Sealed record · Evenhand',
  // The record link carries a secret in its fragment: never indexed, never sent on as a referrer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecordScreen id={id} />;
}
