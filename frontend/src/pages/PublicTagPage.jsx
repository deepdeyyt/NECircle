import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Phone,
  MessageCircle,
  Loader2,
  Sun,
  ParkingCircle,
  Truck,
  Maximize2,
  Siren,
  Ambulance,
  ShieldCheck,
} from "lucide-react";
import { api, formatApiError } from "../lib/api";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";

const INDIAN_PHONE = /^(?:\+91[\s-]?|0)?[6-9]\d{9}$/;
const PLATE_RE = /^TR\d{2}[A-Z]{1,3}\d{1,4}$/;

function last10(phone) {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.slice(-10);
}

function stripPlate(v) {
  return (v || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function PublicFooter({ tagId }) {
  return (
    <footer className="mt-12 pt-8 border-t border-black/10 text-center text-xs text-ink-muted">
      <div className="font-body">
        NECircle · Connecting the Northeast · tag #{tagId}
      </div>
    </footer>
  );
}

/* ---------------- Indian number plate ---------------- */
function IndianPlate({ number }) {
  return (
    <div
      className="inline-flex flex-col rounded-md overflow-hidden border-2 border-ink shadow-sm"
      data-testid="plate-display"
    >
      <div className="bg-[#0F1E5B] text-white text-[10px] font-display font-bold tracking-[0.35em] text-center py-0.5 px-6">
        IND
      </div>
      <div className="flex items-stretch bg-white">
        <div className="w-2 flex flex-col">
          <div className="flex-1 bg-[#FF9933]" />
          <div className="flex-1 bg-white border-y border-white flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-[#0F1E5B]" />
          </div>
          <div className="flex-1 bg-[#138808]" />
        </div>
        <div className="px-3 py-1.5 font-mono font-extrabold text-2xl sm:text-3xl tracking-wider text-ink">
          {number || "TR-••-•-••••"}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Reason card ---------------- */
const REASONS = [
  { id: "lights", icon: Sun, en: "The lights of this car are on.", bn: "গাড়ির লাইট জ্বলছে।" },
  { id: "no_parking", icon: ParkingCircle, en: "The car is in no parking.", bn: "গাড়িটি নো-পার্কিং এ আছে।" },
  { id: "towed", icon: Truck, en: "The car is getting towed.", bn: "গাড়িটি টো করা হচ্ছে।" },
  { id: "open", icon: Maximize2, en: "The window or car is open.", bn: "জানালা / দরজা খোলা।" },
  { id: "wrong", icon: Siren, en: "Something wrong with this car.", bn: "গাড়িতে কিছু সমস্যা আছে।" },
];

function ReasonList({ selected, onSelect }) {
  return (
    <div className="mt-3 space-y-2.5" data-testid="reason-list">
      {REASONS.map((r) => {
        const active = selected === r.id;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(active ? null : r.id)}
            data-testid={`reason-${r.id}`}
            className={`w-full flex items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 text-left transition-colors ${
              active
                ? "border-clay ring-2 ring-clay/20"
                : "border-black/10 hover:border-black/25"
            }`}
          >
            <r.icon
              className={`w-5 h-5 shrink-0 ${active ? "text-clay" : "text-ink-muted"}`}
              strokeWidth={2.2}
            />
            <span className="flex-1 text-[15px] font-medium text-ink leading-snug">
              {r.en}
            </span>
            <span
              className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                active ? "border-clay bg-clay" : "border-black/25"
              }`}
            >
              {active && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- VEHICLE Claimed view ---------------- */
function VehicleClaimedView({ tag }) {
  const { profile, id } = tag;
  const phone10 = last10(profile.phone);
  const [reason, setReason] = useState(null);

  const reasonText = () => {
    if (!reason) return "";
    const r = REASONS.find((x) => x.id === reason);
    return r ? r.en : "";
  };

  const buildWa = () => {
    const plate = profile.vehicle_number || `tag #${id}`;
    const base = reasonText()
      ? `Hi, regarding your vehicle ${plate}: ${reasonText()}`
      : `Hi, regarding your vehicle ${plate}.`;
    return `https://wa.me/91${phone10}?text=${encodeURIComponent(base)}`;
  };

  return (
    <div
      className="min-h-screen bg-paper flex flex-col animate-fade-up"
      data-testid="contact-page"
      data-tag-type="vehicle"
    >
      <div className="max-w-md w-full mx-auto px-5 pt-6 pb-10 flex-1">
        <div className="flex items-center justify-between">
          <BrandMark />
          <span className="text-xs text-ink-muted font-mono">#{id}</span>
        </div>

        <div className="mt-8">
          <h1
            className="font-display text-3xl sm:text-4xl font-extrabold text-ink"
            data-testid="contact-heading"
          >
            Contact vehicle owner
          </h1>
          <p className="mt-1 font-bn text-base text-ink-muted">
            গাড়ির মালিকের সাথে যোগাযোগ করুন
          </p>

          <div className="mt-5 bg-white rounded-2xl border border-black/10 p-5">
            <IndianPlate number={profile.vehicle_number} />
            <p className="mt-3 text-[11px] uppercase tracking-widest text-ink-muted font-semibold">
              Tripura · IND
            </p>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="font-display font-bold text-lg text-ink">
            Why contact the vehicle owner?
          </h2>
          <p className="mt-0.5 font-bn text-sm text-ink-muted">
            আপনি কেন যোগাযোগ করছেন?
          </p>
          <ReasonList selected={reason} onSelect={setReason} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <a
            href={buildWa()}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="whatsapp-button"
            className="flex items-center justify-center gap-2 rounded-full border-2 border-teal bg-white text-teal font-display font-bold min-h-[56px] px-4 hover:bg-teal/5 transition-colors"
          >
            <MessageCircle className="w-4 h-4" strokeWidth={2.4} />
            Message
          </a>
          <a
            href={`tel:+91${phone10}`}
            data-testid="call-button"
            className="flex items-center justify-center gap-2 rounded-full bg-[#FFD400] text-ink font-display font-bold min-h-[56px] px-4 hover:bg-[#E6BF00] transition-colors"
          >
            <Phone className="w-4 h-4" strokeWidth={2.4} />
            Private call
          </a>
        </div>

        <p
          className="mt-3 text-center text-xs text-ink-muted leading-snug"
          data-testid="spam-notice"
        >
          Spam may get your IP and number blocked for up to 6 months.
        </p>

        <a
          href="tel:112"
          data-testid="emergency-button"
          className="mt-6 flex items-center justify-center gap-2 rounded-full border border-red-300 bg-red-50/60 text-red-700 font-display font-bold min-h-[52px] hover:bg-red-100 transition-colors"
        >
          <Ambulance className="w-4 h-4" strokeWidth={2.4} />
          Emergency
        </a>

        <div className="mt-5 flex items-start gap-2.5 text-[12px] text-ink-muted">
          <ShieldCheck className="w-4 h-4 mt-0.5 text-teal shrink-0" strokeWidth={2.2} />
          <p className="leading-snug">
            Owner's number stays private. No account or app needed.
            <span className="block font-bn text-[12px] mt-0.5">
              মালিকের নম্বর গোপন থাকে। কোনো অ্যাপ বা অ্যাকাউন্ট লাগবে না।
            </span>
          </p>
        </div>

        <PublicFooter tagId={id} />
      </div>
    </div>
  );
}

/* ---------------- BUSINESS Claimed view ---------------- */
function BusinessClaimedView({ tag }) {
  const { profile, id } = tag;
  const phone10 = last10(profile.phone);
  return (
    <div
      className="min-h-screen bg-paper flex flex-col animate-fade-up"
      data-testid="contact-page"
      data-tag-type="business"
    >
      <div className="max-w-md w-full mx-auto px-5 pt-6 pb-10 flex-1">
        <div className="flex items-center justify-between">
          <BrandMark />
          <span className="text-xs text-ink-muted font-mono">#{id}</span>
        </div>

        <div className="mt-8 rounded-2xl bg-ink text-white px-6 py-8">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/70">
            <span className="w-1.5 h-1.5 rounded-full bg-clay" />
            Business profile
          </div>
          <div className="mt-1 text-[11px] text-white/50 font-bn">ব্যবসার প্রোফাইল</div>
          <h1
            className="mt-4 font-display text-4xl sm:text-5xl font-extrabold leading-tight break-words"
            data-testid="contact-name"
          >
            {profile.name}
          </h1>
          {profile.note && (
            <p className="mt-3 text-white/80 text-sm leading-relaxed" data-testid="contact-note">
              {profile.note}
            </p>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <a
            href={`tel:+91${phone10}`}
            data-testid="call-button"
            className="btn-clay flex items-center justify-center gap-3 rounded-full px-6 min-h-[60px] font-display text-lg font-bold shadow-sm"
          >
            <Phone className="w-5 h-5" strokeWidth={2.5} />
            Call {profile.name.split(" ")[0]}
          </a>
          <a
            href={`https://wa.me/91${phone10}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="whatsapp-button"
            className="btn-teal flex items-center justify-center gap-3 rounded-full px-6 min-h-[60px] font-display text-lg font-bold shadow-sm"
          >
            <MessageCircle className="w-5 h-5" strokeWidth={2.5} />
            Message on WhatsApp
          </a>
        </div>

        <PublicFooter tagId={id} />
      </div>
    </div>
  );
}

function ClaimedView({ tag }) {
  return tag.profile?.type === "business" ? (
    <BusinessClaimedView tag={tag} />
  ) : (
    <VehicleClaimedView tag={tag} />
  );
}

/* ---------------- Claim form view ---------------- */
function ClaimView({ tag, onClaimed }) {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    type: "vehicle",
    note: "",
    vehicle_number: "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  const setField = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
    setServerError("");
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Please enter a name";
    if (!form.phone.trim()) e.phone = "Please enter a phone number";
    else if (!INDIAN_PHONE.test(form.phone.trim()))
      e.phone = "Enter a valid Indian mobile (10 digits)";
    if (form.type === "vehicle") {
      const p = stripPlate(form.vehicle_number);
      if (!p) e.vehicle_number = "Enter your Tripura vehicle number";
      else if (!PLATE_RE.test(p))
        e.vehicle_number = "Format: TR + 2 digits + 1–3 letters + digits (e.g. TR01A1234)";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setServerError("");
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        type: form.type,
        note: form.type === "business" ? form.note.trim() : undefined,
        vehicle_number:
          form.type === "vehicle" ? stripPlate(form.vehicle_number) : undefined,
      };
      const { data } = await api.post(`/tags/${tag.id}/claim`, payload);
      onClaimed(data);
    } catch (err) {
      setServerError(formatApiError(err.response?.data?.detail, "Could not activate tag"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-paper flex flex-col animate-fade-up"
      data-testid="claim-page"
    >
      <div className="max-w-md w-full mx-auto px-5 pt-6 pb-10 flex-1">
        <div className="flex items-center justify-between">
          <BrandMark />
          <span
            className="text-xs text-ink-muted font-mono"
            data-testid="claim-tag-id"
          >
            Tag #{tag.id}
          </span>
        </div>

        <div className="mt-10">
          <div className="inline-flex items-center gap-2 chip bg-clay/10 text-clay">
            <span className="w-1.5 h-1.5 rounded-full bg-clay" />
            Not activated yet
          </div>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold leading-tight text-ink">
            This tag isn&apos;t activated yet.
          </h1>
          <p className="mt-2 font-bn text-lg text-ink-muted">
            এই ট্যাগটি এখনো চালু করা হয়নি।
          </p>
          <p className="mt-4 text-ink-muted leading-relaxed">
            Whoever owns this vehicle or card can set it up in under a minute — no
            app required.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="mt-8 space-y-5 bg-white rounded-2xl border border-black/10 p-6"
          data-testid="claim-form"
          noValidate
        >
          <div>
            <Label htmlFor="name" className="text-ink font-semibold">
              Full name <span className="text-clay">*</span>
            </Label>
            <p className="text-xs text-ink-muted font-bn mt-0.5">আপনার নাম</p>
            <Input
              id="name"
              data-testid="name-input"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Ananya Deb"
              className="mt-2 rounded-xl border-black/10 focus-visible:ring-2 focus-visible:ring-clay focus-visible:border-transparent"
            />
            {errors.name && (
              <p className="mt-1.5 text-xs text-red-600" data-testid="name-error">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="phone" className="text-ink font-semibold">
              Phone / WhatsApp <span className="text-clay">*</span>
            </Label>
            <p className="text-xs text-ink-muted font-bn mt-0.5">
              ফোন / হোয়াটসঅ্যাপ নম্বর
            </p>
            <Input
              id="phone"
              data-testid="phone-input"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="e.g. 98765 43210"
              className="mt-2 rounded-xl border-black/10 focus-visible:ring-2 focus-visible:ring-clay focus-visible:border-transparent"
            />
            <p className="mt-1 text-[11px] text-ink-muted">
              Kept private — never shown to strangers.
            </p>
            {errors.phone && (
              <p className="mt-1.5 text-xs text-red-600" data-testid="phone-error">
                {errors.phone}
              </p>
            )}
          </div>

          <div>
            <Label className="text-ink font-semibold">Type of tag</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setField("type", v)}
            >
              <SelectTrigger
                data-testid="type-select"
                className="mt-2 rounded-xl border-black/10"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vehicle" data-testid="type-vehicle">
                  Vehicle contact tag
                </SelectItem>
                <SelectItem value="business" data-testid="type-business">
                  Business profile card
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.type === "vehicle" && (
            <div>
              <Label htmlFor="plate" className="text-ink font-semibold">
                Vehicle number <span className="text-clay">*</span>
              </Label>
              <p className="text-xs text-ink-muted font-bn mt-0.5">গাড়ির নম্বর</p>
              <Input
                id="plate"
                data-testid="plate-input"
                value={form.vehicle_number}
                onChange={(e) =>
                  setField("vehicle_number", e.target.value.toUpperCase())
                }
                placeholder="TR01A1234"
                maxLength={12}
                className="mt-2 rounded-xl border-black/10 font-mono uppercase tracking-wider focus-visible:ring-2 focus-visible:ring-clay focus-visible:border-transparent"
              />
              <p className="mt-1 text-[11px] text-ink-muted">
                Tripura plate only. Format: TR + district (01-99) + series (A-Z) + number.
              </p>
              {errors.vehicle_number && (
                <p className="mt-1.5 text-xs text-red-600" data-testid="plate-error">
                  {errors.vehicle_number}
                </p>
              )}
            </div>
          )}

          {form.type === "business" && (
            <div>
              <Label htmlFor="note" className="text-ink font-semibold">
                What do you do? <span className="text-ink-muted font-normal">(optional)</span>
              </Label>
              <Textarea
                id="note"
                data-testid="note-input"
                value={form.note}
                onChange={(e) => setField("note", e.target.value)}
                placeholder="e.g. Home-cooked Bengali tiffin service — Agartala"
                rows={3}
                className="mt-2 rounded-xl border-black/10 focus-visible:ring-2 focus-visible:ring-clay focus-visible:border-transparent"
              />
            </div>
          )}

          {serverError && (
            <div
              className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
              data-testid="server-error"
            >
              {serverError}
            </div>
          )}

          <Button
            type="submit"
            data-testid="activate-button"
            disabled={submitting}
            className="btn-clay w-full rounded-full min-h-[56px] font-display text-base font-bold"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Activating…
              </>
            ) : (
              "Activate this tag"
            )}
          </Button>
        </form>

        <PublicFooter tagId={tag.id} />
      </div>
    </div>
  );
}

/* ---------------- Router page ---------------- */
export default function PublicTagPage() {
  const { tagId } = useParams();
  const navigate = useNavigate();
  const [tag, setTag] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotFound(false);
    api
      .get(`/tags/${tagId}`)
      .then(({ data }) => {
        if (alive) setTag(data);
      })
      .catch((err) => {
        if (!alive) return;
        if (err.response?.status === 404) setNotFound(true);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tagId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-clay" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div
        className="min-h-screen bg-paper flex flex-col items-center justify-center px-6 text-center"
        data-testid="tag-not-found"
      >
        <BrandMark />
        <h1 className="mt-8 font-display text-3xl font-extrabold text-ink">
          Tag not found
        </h1>
        <p className="mt-2 text-ink-muted">
          The tag <span className="font-mono">#{tagId}</span> doesn&apos;t exist in our
          system.
        </p>
        <button
          onClick={() => navigate("/")}
          data-testid="not-found-home"
          className="mt-6 chip bg-ink text-white hover:bg-ink/90 px-4 py-2"
        >
          Go home
        </button>
      </div>
    );
  }

  if (tag.status === "active") return <ClaimedView tag={tag} />;
  return <ClaimView tag={tag} onClaimed={setTag} />;
}
