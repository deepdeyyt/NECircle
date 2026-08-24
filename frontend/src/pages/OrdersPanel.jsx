import { useEffect, useState } from "react";
import {
  Package,
  Phone,
  MessageCircle,
  MapPin,
  Copy,
  Check,
  Truck,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { api, formatApiError } from "../lib/api";

function last10(phone) {
  return (phone || "").replace(/\D/g, "").slice(-10);
}

function timeAgo(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const d = Math.floor(diff / 86400);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

function OrderCard({ order, onToggleShip }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const isShipped = order.status === "shipped";
  const phone10 = last10(order.customer_phone);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(
        `${order.customer_name}\n${order.address}\nPhone: ${order.customer_phone}`,
      );
      setCopied(true);
      toast.success("Address copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const toggle = async () => {
    setBusy(true);
    try {
      await onToggleShip(order.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid={`order-card-${order.id}`}
      className={`brutal-card p-5 ${isShipped ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-black text-[#1a1a1a] text-lg truncate">
              {order.customer_name}
            </span>
            {isShipped ? (
              <span className="chip bg-[#B6F09C] text-[#1a1a1a] border-[2px] border-[#1a1a1a]">
                <Truck className="w-3 h-3" strokeWidth={2.6} />
                Shipped
              </span>
            ) : (
              <span className="chip bg-neon text-[#1a1a1a] border-[2px] border-[#1a1a1a]">
                <Package className="w-3 h-3" strokeWidth={2.6} />
                To ship
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-[#5C564F] font-semibold">
            ₹{(order.amount_paise / 100).toFixed(0)} · {timeAgo(order.paid_at || order.created_at)}
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          data-testid={`ship-toggle-${order.id}`}
          className={`shrink-0 rounded-full border-[2.5px] border-[#1a1a1a] font-display font-black text-xs px-3.5 py-2 inline-flex items-center gap-1.5 transition-transform ${
            isShipped
              ? "bg-white text-[#1a1a1a] hover:-translate-y-[1px]"
              : "bg-neon text-[#1a1a1a] shadow-[3px_3px_0_0_#1a1a1a] hover:-translate-y-[1px] hover:shadow-[4px_4px_0_0_#1a1a1a]"
          }`}
        >
          {busy ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isShipped ? (
            <>
              <RotateCcw className="w-3.5 h-3.5" strokeWidth={2.6} /> Undo
            </>
          ) : (
            <>
              <Truck className="w-3.5 h-3.5" strokeWidth={2.6} /> Mark shipped
            </>
          )}
        </button>
      </div>

      {/* Address */}
      <div className="mt-4 flex items-start gap-2.5 bg-[#FBF7F1] border-[2px] border-[#1a1a1a] rounded-xl p-3">
        <MapPin className="w-4 h-4 mt-0.5 text-[#1a1a1a] shrink-0" strokeWidth={2.4} />
        <p className="flex-1 text-sm text-[#1a1a1a] leading-snug whitespace-pre-line font-medium">
          {order.address}
        </p>
        <button
          onClick={copyAddress}
          data-testid={`copy-address-${order.id}`}
          className="shrink-0 w-7 h-7 rounded-md border-[2px] border-[#1a1a1a] bg-white text-[#1a1a1a] flex items-center justify-center hover:bg-neon transition-colors"
          title="Copy address"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5" strokeWidth={2.8} />
          ) : (
            <Copy className="w-3.5 h-3.5" strokeWidth={2.4} />
          )}
        </button>
      </div>

      {/* Tag IDs */}
      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-widest text-[#5C564F] font-black">
          Ship these tag IDs
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid={`order-tags-${order.id}`}>
          {(order.tag_ids || []).length ? (
            order.tag_ids.map((t) => (
              <a
                key={t}
                href={`/p/${t}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs font-black bg-[#1a1a1a] text-neon px-2.5 py-1 rounded-md hover:bg-royal transition-colors"
              >
                #{t}
              </a>
            ))
          ) : (
            <span className="text-xs text-[#5C564F]">— none allocated —</span>
          )}
        </div>
      </div>

      {/* Contact actions */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={`tel:+91${phone10}`}
          data-testid={`call-customer-${order.id}`}
          className="flex items-center justify-center gap-1.5 rounded-full border-[2.5px] border-[#1a1a1a] bg-white text-[#1a1a1a] font-display font-black text-sm min-h-[40px] hover:bg-neon transition-colors"
        >
          <Phone className="w-3.5 h-3.5" strokeWidth={2.6} />
          Call
        </a>
        <a
          href={`https://wa.me/91${phone10}?text=${encodeURIComponent(
            `Hi ${order.customer_name}, your NECircle stickers (${(order.tag_ids || [])
              .map((t) => `#${t}`)
              .join(", ")}) have been shipped. Thanks for the order!`,
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`whatsapp-customer-${order.id}`}
          className="flex items-center justify-center gap-1.5 rounded-full border-[2.5px] border-[#1a1a1a] bg-[#0F6E56] text-white font-display font-black text-sm min-h-[40px] hover:bg-[#0A4E3D] transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" strokeWidth={2.6} />
          WhatsApp
        </a>
      </div>
    </div>
  );
}

export default function OrdersPanel({ onChanged }) {
  const [orders, setOrders] = useState(null);
  const [filter, setFilter] = useState("to_ship");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/orders");
      setOrders(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail, "Failed to load orders"));
    } finally {
      setLoading(false);
    }
  };

  // Load on first mount
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleShip = async (id) => {
    try {
      const { data } = await api.post(`/admin/orders/${id}/ship`);
      toast.success(data.status === "shipped" ? "Marked as shipped" : "Marked as to-ship");
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail, "Failed to update"));
    }
  };

  const list = (orders || []).filter((o) => {
    if (filter === "all") return o.status === "paid" || o.status === "shipped";
    if (filter === "to_ship") return o.status === "paid";
    if (filter === "shipped") return o.status === "shipped";
    return false;
  });

  return (
    <section className="mt-12" data-testid="orders-panel">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-neon" />
          <h2 className="font-display font-black text-xl text-white">
            Paid orders ({list.length})
          </h2>
        </div>
        <div className="inline-flex rounded-full border-[2.5px] border-white bg-royal-soft/40 p-1">
          {[
            { k: "to_ship", label: "To ship" },
            { k: "shipped", label: "Shipped" },
            { k: "all", label: "All paid" },
          ].map((opt) => (
            <button
              key={opt.k}
              onClick={() => setFilter(opt.k)}
              data-testid={`orders-filter-${opt.k}`}
              className={`px-3.5 py-1.5 text-sm rounded-full font-black transition-colors ${
                filter === opt.k
                  ? "bg-neon text-[#1a1a1a]"
                  : "text-white/80 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading && orders === null ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-neon" />
        </div>
      ) : list.length === 0 ? (
        <div
          className="mt-6 rounded-2xl border-[2.5px] border-dashed border-white/40 p-10 text-center text-white/75"
          data-testid="orders-empty"
        >
          {filter === "to_ship"
            ? "All caught up — nothing waiting to ship."
            : filter === "shipped"
            ? "No shipped orders yet."
            : "No paid orders yet. Once someone pays through the Buy modal they'll appear here."}
        </div>
      ) : (
        <div
          className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5"
          data-testid="orders-list"
        >
          {list.map((o) => (
            <OrderCard key={o.id} order={o} onToggleShip={toggleShip} />
          ))}
        </div>
      )}
    </section>
  );
}
