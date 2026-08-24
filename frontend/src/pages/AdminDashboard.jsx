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
} from "lucide-react";
import { toast } from "sonner";
import { api, BACKEND_URL, formatApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

function StatCard({ label, value, testid, icon: Icon, tone = "clay" }) {
  const toneMap = {
    clay: "text-clay bg-clay/10",
    teal: "text-teal bg-teal/10",
    ink: "text-ink bg-ink/10",
  };
  return (
    <div
      data-testid={testid}
      className="bg-white rounded-2xl border border-black/10 p-6 flex items-start justify-between hover-lift"
    >
      <div>
        <div className="text-xs uppercase tracking-widest text-ink-muted font-semibold">
          {label}
        </div>
        <div className="mt-3 font-display text-4xl font-extrabold text-ink tabular-nums">
          {value}
        </div>
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneMap[tone]}`}>
        <Icon className="w-5 h-5" strokeWidth={2.2} />
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
      className="bg-white rounded-xl border border-black/10 p-4 hover-lift flex flex-col gap-1 group"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-ink-muted">#{tag.id}</span>
        <ExternalLink className="w-3.5 h-3.5 text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      {isActive ? (
        <div className="flex items-center gap-1.5 text-teal font-semibold text-sm truncate">
          <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={2.4} />
          <span className="truncate">{tag.profile?.name}</span>
        </div>
      ) : (
        <div className="text-ink-muted text-sm">Scan to activate</div>
      )}
    </a>
  );
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState({ printed: 0, activated: 0, unassigned: 0 });
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
        }
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
      : t.status === "unassigned"
  );

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-black/10 bg-paper/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <BrandMark />
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-ink-muted" data-testid="admin-email">
              {user?.email}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={logout}
              data-testid="logout-button"
              className="rounded-full border-black/15 hover:bg-ink hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4 mr-1.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-widest text-clay font-semibold">
              Operator dashboard
            </p>
            <h1 className="mt-1 font-display text-4xl sm:text-5xl font-extrabold text-ink">
              Tag inventory
            </h1>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
          <StatCard
            label="Tags printed"
            value={stats.printed}
            testid="stat-printed"
            icon={Printer}
            tone="ink"
          />
          <StatCard
            label="Activated"
            value={stats.activated}
            testid="stat-activated"
            icon={CheckCircle2}
            tone="teal"
          />
          <StatCard
            label="In stock, unclaimed"
            value={stats.unassigned}
            testid="stat-unassigned"
            icon={Boxes}
            tone="clay"
          />
        </div>

        {/* Batch + Download */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-5">
          <form
            onSubmit={handleBatch}
            className="md:col-span-2 bg-white rounded-2xl border border-black/10 p-6"
            data-testid="batch-form"
          >
            <div className="flex items-center gap-2 text-ink">
              <Printer className="w-4 h-4 text-clay" />
              <h2 className="font-display font-bold text-lg">Print next batch</h2>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
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
                className="rounded-xl border-black/10 focus-visible:ring-2 focus-visible:ring-clay focus-visible:border-transparent sm:w-40"
              />
              <Button
                type="submit"
                data-testid="generate-batch-button"
                disabled={generating}
                className="btn-clay rounded-full px-6 min-h-[48px] font-display font-bold"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Generating…
                  </>
                ) : (
                  "Generate IDs"
                )}
              </Button>
            </div>
          </form>

          <div className="bg-white rounded-2xl border border-black/10 p-6 flex flex-col">
            <div className="flex items-center gap-2 text-ink">
              <Download className="w-4 h-4 text-teal" />
              <h2 className="font-display font-bold text-lg">QR codes</h2>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              Bundle scannable QR PNGs for every unassigned tag.
            </p>
            <Button
              onClick={handleZip}
              disabled={downloading || stats.unassigned === 0}
              data-testid="download-zip-button"
              className="mt-auto btn-teal rounded-full min-h-[48px] font-display font-bold"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Zipping…
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" /> Download ZIP
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Inventory */}
        <div className="mt-12">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-ink-muted" />
              <h2 className="font-display font-bold text-xl text-ink">
                Inventory ({filtered.length})
              </h2>
            </div>
            <div
              className="inline-flex rounded-full border border-black/10 bg-white p-1"
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
                  className={`px-3.5 py-1.5 text-sm rounded-full font-semibold transition-colors ${
                    filter === opt.k
                      ? "bg-ink text-white"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="mt-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-clay" />
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="mt-8 bg-white rounded-2xl border border-dashed border-black/15 p-10 text-center"
              data-testid="empty-inventory"
            >
              <p className="text-ink-muted">
                No tags yet. Generate a batch to start printing.
              </p>
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
