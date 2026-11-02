/* "/p/{token}" — the short form of the customer proposal link (/proposal/{token}), the one the
   composer copies: same public page, same token check, easier to read and tap in a message. */
import { PublicProposalView } from "../../../components/PublicProposalView";

export default async function ShortProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PublicProposalView token={token} />;
}
