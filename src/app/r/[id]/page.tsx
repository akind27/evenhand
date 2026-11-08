import { RenterScreen } from '@/components/renter/RenterScreen';

export const metadata = {
  title: 'Check the record · Evenhand',
  // The renter link must never be indexed or sent on as a referrer.
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function RenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RenterScreen id={id} />;
}
