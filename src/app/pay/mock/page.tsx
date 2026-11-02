/* "/pay/mock" — stands in for Razorpay's checkout while a test server has no Razorpay keys
   (backend PAYMENT_MOCK). Public, like /proposal/[token]. The backend refuses a mock
   confirmation unless PAYMENT_MOCK is on, so this page can't mark anything paid on prod. */
import { MockPaymentView } from "../../../components/proposal/MockPaymentView";

export default function MockPaymentPage() {
  return <MockPaymentView />;
}
