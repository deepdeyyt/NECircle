import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Package,
  Printer,
  Download,
  LogOut,
  Loader2,
  ExternalLink,
  Boxes,
  ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { api, BACKEND_URL, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { BrandMark } from "../components/BrandMark";
import { Input } from "../components/ui/input";

function StatCard({ label, value, testid, icon: Icon, tint = "#FDDD0E" }) {
  return (
    <div
      data-testid={testid}
      className="rounded-2xl border-[3px] border-[#1a1a1a] p-6 flex items-start justify-between shadow-[5px_5px_0_0_#1a1a1a] hover-lift"
      style={{ backgroundColor: tint }}
    >
      <div>
        <div className="text-xs uppercase tracking-widest text-[#1a1a1a] font-black">
          {label}
        </div>
        <div className="mt-3 font-display text-4xl font-black text-[#1a1a1a] tabular-nums">
          {value}
        </div>
      </div>
      <div className="w-11 h-11 rounded-xl bg-white border-[2.5px] border-[#1a1a1a] flex items-center justify-center">
        <Icon className="w-5 h-5 text-[#1a1a1a]" strokeWidth={2.4} />
      </div>
    </div>
  );
}

function TagCard({ tag }) {
  const isActive = tag.status === "active";
  const publicUrl = `${window.location.origin}/p/${tag.id}`;
  return (
    <a
      href={publicUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={`tag-card-${tag.id}`}
      className={`rounded-xl border-[2.5px] border-[#1a1a1a] p-3.5 hover-lift shadow-[3px_3px_0_0_#1a1a1a] flex flex-col gap-1 group ${
        isActive ? "bg-neon text-[#1a1a1a]" : "bg-white text-[#1a1a1a]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-black">#{tag.id}</span>
        <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      {isActive ? (
        <div className="flex items-center gap-1.5 font-black text-sm truncate">
          <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={2.6} />
          <span className="truncate">{tag.profile?.name}</span>
        </div>
      ) : (
        <div className="text-[#1a1a1a]/60 text-sm font-medium">Scan to activate</div>
      )}
    </a>
  );
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({
    printed: 0,
    activated: 0,
    unassigned: 0,
    orders_paid: 0,
  });
  const [tags, setTags] = useState([]);
  const [batchSize, setBatchSize] = useState(50);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/tags"),
      ]);
      setStats(s.data);
      setTags(t.data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail, "Failed to load"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleBatch = async (e) => {
    e.preventDefault();
    const n = Number(batchSize);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      toast.error("Enter a number between 1 and 1000");
      return;
    }
    setGenerating(true);
    try {
      const { data } = await api.post("/admin/tags/batch", { count: n });
      toast.success(`Created ${data.created} tags (${data.from} → ${data.to})`);
      await load();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail, "Batch failed"));
    } finally {
      setGenerating(false);
    }
  };

  const handleZip = async () => {
    setDownloading(true);
    try {
      const token = localStorage.getItem("necircle_token");
      const res = await fetch(
        `${BACKEND_URL}/api/admin/tags/qr-zip?scope=unassigned`,
        {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(formatApiError(j.detail, "No unassigned tags"));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "necircle-qr-codes.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("QR codes downloaded");
    } catch (err) {
      toast.error(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const filtered = tags.filter((t) =>
    filter === "all"
      ? true
      : filter === "active"
      ? t.status === "active"
      : t.status === "unassigned",
  );

  return (
    <div className="min-h-screen bg-royal text-white">
      <header className="border-b border-white/15 bg-royal/95 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <BrandMark />
          <div className="flex items-center gap-3">
            <span
              className="hidden sm:inline text-sm text-white/70"
              data-testid="admin-email"
            >
              {user?.email}
            </span>
            <button
              onClick={logout}
              data-testid="logout-button"
              className="btn-outline-w rounded-full px-4 py-1.5 font-display font-black text-sm inline-flex items-center gap-1.5"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-neon font-black">
              Operator dashboard
            </p>
            <h1 className="mt-1 font-display text-4xl sm:text-5xl font-extrabold text-white">
              Tag inventory
            </h1>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-5">
          <StatCard
            label="Printed"
            value={stats.printed}
            testid="stat-printed"
            icon={Printer}
            tint="#FFFFFF"
          />
          <StatCard
            label="Activated"
            value={stats.activated}
            testid="stat-activated"
            icon={CheckCircle2}
            tint="#B6F09C"
          />
          <StatCard
            label="Unclaimed"
            value={stats.unassigned}
            testid="stat-unassigned"
            icon={Boxes}
            tint="#FDDD0E"
          />
          <StatCard
            label="Paid orders"
            value={stats.orders_paid}
            testid="stat-orders"
            icon={ShoppingBag}
            tint="#FF9F5A"
          />
        </div>

        {/* Batch + Download */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
          <form
            onSubmit={handleBatch}
            className="md:col-span-2 brutal-card p-6"
            data-testid="batch-form"
          >
            <div className="flex items-center gap-2 text-[#1a1a1a]">
              <Printer className="w-4 h-4" />
              <h2 className="font-display font-black text-lg">Print next batch</h2>
            </div>
            <p className="mt-1 text-sm text-[#5C564F]">
              Generates sequential 5-digit IDs. Send the ZIP to your printer to
              produce stickers.
            </p>
            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <Input
                type="number"
                min={1}
                max={1000}
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                data-testid="batch-count-input"
                className="rounded-xl border-[2px] border-[#1a1a1a] text-[#1a1a1a] font-bold sm:w-40 focus-visible:ring-2 focus-visible:ring-royal focus-visible:border-transparent"
              />
              <button
                type="submit"
                data-testid="generate-batch-button"
                disabled={generating}
                className="btn-neon rounded-full px-6 min-h-[48px] font-display font-black inline-flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Generating…
                  </>
                ) : (
                  "Generate IDs"
                )}
              </button>
            </div>
          </form>

          <div className="brutal-card p-6 flex flex-col">
            <div className="flex items-center gap-2 text-[#1a1a1a]">
              <Download className="w-4 h-4" />
              <h2 className="font-display font-black text-lg">QR codes</h2>
            </div>
            <p className="mt-1 text-sm text-[#5C564F]">
              Bundle scannable QR PNGs for every unassigned tag.
            </p>
            <button
              onClick={handleZip}
              disabled={downloading || stats.unassigned === 0}
              data-testid="download-zip-button"
              className="mt-auto btn-royal rounded-full min-h-[48px] font-display font-black inline-flex items-center justify-center gap-2"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Zipping…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Download ZIP
                </>
              )}
            </button>
          </div>
        </div>

        {/* Inventory */}
        <div className="mt-12">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-neon" />
              <h2 className="font-display font-black text-xl text-white">
                Inventory ({filtered.length})
              </h2>
            </div>
            <div
              className="inline-flex rounded-full border-[2.5px] border-white bg-royal-soft/40 p-1"
              data-testid="inventory-filter"
            >
              {[
                { k: "all", label: "All" },
                { k: "unassigned", label: "Unclaimed" },
                { k: "active", label: "Activated" },
              ].map((opt) => (
                <button
                  key={opt.k}
                  onClick={() => setFilter(opt.k)}
                  data-testid={`filter-${opt.k}`}
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

          {loading ? (
            <div className="mt-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-neon" />
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="mt-8 rounded-2xl border-[2.5px] border-dashed border-white/40 p-10 text-center text-white/70"
              data-testid="empty-inventory"
            >
              No tags yet. Generate a batch to start printing.
            </div>
          ) : (
            <div
              className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3"
              data-testid="tag-grid"
            >
              {filtered.map((t) => (
                <TagCard key={t.id} tag={t} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
