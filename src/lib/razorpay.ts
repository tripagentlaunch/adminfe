// Loads the Razorpay Checkout script on demand and opens the modal. Shared by
// the stays and flights checkout flows. The secret never touches the client —
// only key_id + order_id (from the create-order response) are used here.
// Ported from the old web (web/lib/razorpay.ts).

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayOpenOptions {
  keyId: string;
  orderId?: string; // omitted only for the demo popup (a test key with no order)
  amount: number; // paise
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (r: RazorpaySuccess) => void;
  onDismiss: () => void;
  // Optional (the proposal link's payment): Razorpay order notes, closing the window when the hold
  // ends (seconds, at least 60), the brand colour, and a failed attempt inside the window.
  notes?: Record<string, unknown>;
  timeout?: number;
  theme?: { color?: string };
  onFailed?: (description: string) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on?: (event: string, cb: (e: any) => void) => void };
  }
}

let loadingPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error('Failed to load Razorpay Checkout'));
    };
    document.body.appendChild(script);
  });
  return loadingPromise;
}

export async function openRazorpayCheckout(opts: RazorpayOpenOptions): Promise<void> {
  await loadScript();
  if (!window.Razorpay) throw new Error('Razorpay unavailable');
  const rzp = new window.Razorpay({
    key: opts.keyId,
    ...(opts.orderId ? { order_id: opts.orderId } : {}),
    amount: opts.amount,
    currency: opts.currency,
    name: opts.name,
    description: opts.description,
    prefill: opts.prefill ?? {},
    handler: (r: RazorpaySuccess) => opts.onSuccess(r),
    modal: { ondismiss: () => opts.onDismiss() },
    ...(opts.notes ? { notes: opts.notes } : {}),
    ...(opts.timeout ? { timeout: opts.timeout } : {}),
    ...(opts.theme ? { theme: opts.theme } : {}),
  });
  if (opts.onFailed && rzp.on) rzp.on("payment.failed", (e: any) => opts.onFailed!(e?.error?.description || "The payment failed."));
  rzp.open();
}
