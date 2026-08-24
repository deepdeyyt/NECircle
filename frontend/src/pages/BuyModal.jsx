import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Loader2, CheckCircle2, ShieldCheck, Package } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "../lib/api";

const INDIAN_PHONE = /^(?:\+91[\s-]?|0)?[6-9]\d{9}$/;

export default function BuyModal({ open, onOpenChange }) {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    address: "",
    quantity: 1,
  });
  const [errors, setErrors] = useState({});
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (open) {
      api
        .get("/orders/config")
        .then(({ data }) => setConfig(data))
        .catch(() => setConfig(null));
      setSuccess(null);
      setErrors({});
    }
  }, [open]);

  const setField = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const total = () =>
    config ? (config.price_paise * form.quantity) / 100 : 0;

  const validate = () => {
    const e = {};
    if (!form.customer_name.trim()) e.customer_name = "Enter your name";
    if (!form.customer_phone.trim()) e.customer_phone = "Enter your phone";
    else if (!INDIAN_PHONE.test(form.customer_phone.trim()))
      e.customer_phone = "Enter a valid Indian mobile number";
    if (form.address.trim().length < 8) e.address = "Enter a full shipping address";
    if (form.quantity < 1 || form.quantity > 20) e.quantity = "1–20 only";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const startCheckout = async () => {
    if (!validate()) return;
    setCreating(true);
    try {
      const { data } = await api.post("/orders/create", {
        customer_name: form.customer_name.trim(),
        customer_phone: form.customer_phone.trim(),
        address: form.address.trim(),
        quantity: Number(form.quantity),
      });

      if (typeof window.Razorpay !== "function") {
        toast.error("Razorpay failed to load. Reload the page and try again.");
        setCreating(false);
        return;
      }

      const options = {
        key: data.razorpay_key_id,
        amount: data.amount_paise,
        currency: data.currency,
        order_id: data.razorpay_order_id,
        name: "NECircle",
        description: `${form.quantity} tag${form.quantity > 1 ? "s" : ""} · shipping included`,
        prefill: {
          name: data.customer.name,
          contact: data.customer.phone,
        },
        theme: { color: "#B5502F" },
        modal: {
          ondismiss: () => setCreating(false),
        },
        handler: async (rz) => {
          try {
            const verify = await api.post("/orders/verify", {
              razorpay_order_id: rz.razorpay_order_id,
              razorpay_payment_id: rz.razorpay_payment_id,
              razorpay_signature: rz.razorpay_signature,
            });
            setSuccess(verify.data);
            toast.success("Payment successful — your tags are on the way!");
          } catch (err) {
            toast.error(
              formatApiError(err.response?.data?.detail, "Payment verification failed"),
            );
          } finally {
            setCreating(false);
          }
        },
      };
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp) => {
        toast.error(resp?.error?.description || "Payment failed");
        setCreating(false);
      });
      rzp.open();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail, "Could not start checkout"));
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-white border-[3px] border-[#1a1a1a] max-w-md rounded-2xl shadow-[6px_6px_0_0_#1a1a1a] text-[#1a1a1a]"
        data-testid="buy-modal"
      >
        {success ? (
          <div className="py-6 text-center" data-testid="order-success">
            <div className="w-16 h-16 mx-auto rounded-full bg-teal/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-teal" strokeWidth={2.4} />
            </div>
            <h2 className="mt-5 font-display text-2xl font-extrabold text-ink">
              Payment received
            </h2>
            <p className="mt-2 text-ink-muted">
              We're printing your tag{success.tag_ids?.length > 1 ? "s" : ""} in
              English, Kokborok and Bengali. Ships in 3–5 days.
            </p>
            <div className="mt-4 inline-flex flex-col gap-1 bg-white border border-black/10 rounded-xl px-4 py-3">
              <span className="text-xs uppercase tracking-widest text-ink-muted">
                Your tag IDs
              </span>
              <span className="font-mono font-bold text-ink text-lg">
                {(success.tag_ids || []).map((t) => `#${t}`).join(" · ")}
              </span>
            </div>
            <Button
              onClick={() => onOpenChange(false)}
              className="mt-6 btn-neon rounded-full px-6 min-h-[48px] font-display font-black"
              data-testid="order-success-close"
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-2xl font-extrabold text-ink">
                Order your NECircle tag
              </DialogTitle>
              <DialogDescription className="text-ink-muted">
                Each order includes 3 QR stickers (English, Kokborok, Bengali) — same QR, three languages.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-ink font-semibold">Full name</Label>
                <Input
                  data-testid="buy-name"
                  value={form.customer_name}
                  onChange={(e) => setField("customer_name", e.target.value)}
                  placeholder="e.g. Bikram Roy"
                  className="mt-1.5 rounded-xl border-black/10 focus-visible:ring-2 focus-visible:ring-clay focus-visible:border-transparent"
                />
                {errors.customer_name && (
                  <p className="text-xs text-red-600 mt-1">{errors.customer_name}</p>
                )}
              </div>

              <div>
                <Label className="text-ink font-semibold">Phone / WhatsApp</Label>
                <Input
                  data-testid="buy-phone"
                  inputMode="tel"
                  value={form.customer_phone}
                  onChange={(e) => setField("customer_phone", e.target.value)}
                  placeholder="98765 43210"
                  className="mt-1.5 rounded-xl border-black/10 focus-visible:ring-2 focus-visible:ring-clay focus-visible:border-transparent"
                />
                {errors.customer_phone && (
                  <p className="text-xs text-red-600 mt-1">{errors.customer_phone}</p>
                )}
              </div>

              <div>
                <Label className="text-ink font-semibold">Shipping address</Label>
                <Textarea
                  data-testid="buy-address"
                  value={form.address}
                  onChange={(e) => setField("address", e.target.value)}
                  placeholder="House, street, city, PIN"
                  rows={3}
                  className="mt-1.5 rounded-xl border-black/10 focus-visible:ring-2 focus-visible:ring-clay focus-visible:border-transparent"
                />
                {errors.address && (
                  <p className="text-xs text-red-600 mt-1">{errors.address}</p>
                )}
              </div>

              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label className="text-ink font-semibold">Orders</Label>
                  <Input
                    data-testid="buy-quantity"
                    type="number"
                    min={1}
                    max={20}
                    value={form.quantity}
                    onChange={(e) => setField("quantity", Number(e.target.value))}
                    className="mt-1.5 rounded-xl border-black/10 focus-visible:ring-2 focus-visible:ring-clay focus-visible:border-transparent"
                  />
                </div>
                <div className="pb-1 text-right">
                  <div className="text-xs uppercase tracking-widest text-ink-muted">Total</div>
                  <div
                    className="font-display font-extrabold text-2xl text-ink tabular-nums"
                    data-testid="buy-total"
                  >
                    ₹{total().toFixed(0)}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 text-[12px] text-ink-muted bg-white border border-black/10 rounded-xl px-3 py-2">
                <Package className="w-4 h-4 mt-0.5 text-clay shrink-0" strokeWidth={2.2} />
                <span>
                  Each order = 1 QR ID printed on 3 language stickers. Ships anywhere in India.
                </span>
              </div>

              <Button
                onClick={startCheckout}
                disabled={creating}
                data-testid="buy-checkout"
                className="btn-neon w-full rounded-full min-h-[56px] font-display text-base font-black"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Opening Razorpay…
                  </>
                ) : (
                  <>Pay ₹{total().toFixed(0)} with Razorpay</>
                )}
              </Button>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-ink-muted">
                <ShieldCheck className="w-3.5 h-3.5 text-teal" />
                Secure payment · powered by Razorpay
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
