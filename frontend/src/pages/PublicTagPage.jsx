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
import { motion, AnimatePresence } from "framer-motion";
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
import { LANGS, T } from "./translations";

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
    <footer className="mt-12 pt-8 border-t border-white/15 text-center text-xs text-white/60">
      <div className="font-body">
        NECircle · Connecting the Northeast · tag #{tagId}
      </div>
    </footer>
  );
}

/* ---------------- Indian number plate (brutalist) ---------------- */
function IndianPlate({ number }) {
  return (
    <div
      className="inline-flex flex-col rounded-lg overflow-hidden border-[3px] border-black bg-white shadow-[5px_5px_0_0_#000]"
      data-testid="plate-display"
    >
      <div className="bg-[#0F1E5B] text-white text-[10px] font-display font-black tracking-[0.35em] text-center py-1 px-8 border-b-[3px] border-black">
        IND
      </div>
      <div className="flex items-stretch bg-white">
        <div className="w-3 flex flex-col border-r-[3px] border-black">
          <div className="flex-1 bg-[#FF9933]" />
          <div className="flex-1 bg-white flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-[#0F1E5B]" />
          </div>
          <div className="flex-1 bg-[#138808]" />
        </div>
        <div className="px-4 py-2 font-mono font-black text-2xl sm:text-3xl tracking-widest text-black">
          {number || "TR-••-•-••••"}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Reason card (brutalist on purple) ---------------- */
const REASONS_META = [
  { id: "lights", icon: Sun },
  { id: "no_parking", icon: ParkingCircle },
  { id: "towed", icon: Truck },
  { id: "open", icon: Maximize2 },
  { id: "wrong", icon: Siren },
];

function ReasonList({ selected, onSelect, t }) {
  return (
    <div className="mt-4 space-y-2.5" data-testid="reason-list">
      {REASONS_META.map((r) => {
        const active = selected === r.id;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onSelect(active ? null : r.id)}
            data-testid={`reason-${r.id}`}
            className={`w-full flex items-center gap-3 rounded-2xl border-[3px] border-black px-4 py-3 text-left transition-all duration-150 ${
              active
                ? "bg-neon shadow-[2px_2px_0_0_#000] translate-x-[2px] translate-y-[2px]"
                : "bg-white shadow-[4px_4px_0_0_#000] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:shadow-[5px_5px_0_0_#000]"
            }`}
          >
            <span className="w-9 h-9 rounded-xl border-[2.5px] border-black flex items-center justify-center bg-white shrink-0">
              <r.icon className="w-4.5 h-4.5 text-black" strokeWidth={2.5} />
            </span>
            <span className="flex-1 text-[14px] font-display font-bold text-black leading-snug">
              {t.reasons[r.id]}
            </span>
            <span
              className={`w-5 h-5 rounded-full border-[2.5px] border-black shrink-0 flex items-center justify-center ${
                active ? "bg-black" : "bg-white"
              }`}
            >
              {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- Language switcher ---------------- */
function LangSwitcher({ value, onChange }) {
  return (
    <div className="flex items-center gap-2.5" data-testid="lang-switcher">
      {LANGS.map((l) => {
        const active = value === l.code;
        return (
          <button
            key={l.code}
            type="button"
            onClick={() => onChange(l.code)}
            data-testid={`lang-${l.code}`}
            style={{ backgroundColor: active ? l.color : "#ffffff" }}
            className={`px-3.5 py-1.5 rounded-full border-[2.5px] border-black font-display font-black text-xs uppercase tracking-wider transition-all duration-150 text-black ${
              active
                ? "shadow-[2px_2px_0_0_#000] translate-x-[1px] translate-y-[1px]"
                : "shadow-[3px_3px_0_0_#000] hover:-translate-y-[1px]"
            } ${l.code === "bn" ? "font-bn" : ""}`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- VEHICLE Claimed view (Royal + Neon) ---------------- */
function VehicleClaimedView({ tag }) {
  const { profile, id } = tag;
  const phone10 = last10(profile.phone);
  const [reason, setReason] = useState(null);
  const [lang, setLang] = useState("en");
  const t = T[lang];

  const reasonText = () => (reason ? t.reasons[reason] : "");
  const plate = profile.vehicle_number || `tag #${id}`;
  const waHref = `https://wa.me/91${phone10}?text=${encodeURIComponent(
    t.wa(plate, reasonText()),
  )}`;

  const fadeProps = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.25, ease: "easeOut" },
  };

  return (
    <div
      className="min-h-screen bg-royal text-white relative overflow-hidden"
      data-testid="contact-page"
      data-tag-type="vehicle"
    >
      {/* Decorative background blobs */}
      <div
        aria-hidden
        className="absolute -top-24 -left-20 w-64 h-64 rounded-full opacity-40 pointer-events-none"
        style={{ backgroundColor: "#5E3EAF" }}
      />
      <div
        aria-hidden
        className="absolute bottom-24 -right-20 w-72 h-72 rounded-full opacity-30 pointer-events-none"
        style={{ backgroundColor: "#FDDD0E" }}
      />

      <div className="max-w-md w-full mx-auto px-5 pt-5 pb-10 relative z-10">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2">
          <BrandMark size={36} />
          <span
            className="font-mono text-[11px] font-black bg-black text-neon border-2 border-black px-2.5 py-1 rounded-full"
            data-testid="tag-id-chip"
          >
            #{id}
          </span>
        </div>

        {/* Language switcher */}
        <div className="mt-6">
          <LangSwitcher value={lang} onChange={setLang} />
        </div>

        {/* Header */}
        <AnimatePresence mode="wait">
          <motion.h1
            key={`title-${lang}`}
            {...fadeProps}
            className={`mt-6 font-display text-[36px] leading-[1.05] font-black text-white tracking-tight ${
              lang === "bn" ? "font-bn" : ""
            }`}
            data-testid="contact-heading"
          >
            {t.contact_title}
          </motion.h1>
        </AnimatePresence>

        {/* Plate card */}
        <div className="mt-5 bg-neon text-black rounded-2xl border-[3px] border-black p-5 shadow-[6px_6px_0_0_#000]">
          <IndianPlate number={profile.vehicle_number} />
          <AnimatePresence mode="wait">
            <motion.p
              key={`region-${lang}`}
              {...fadeProps}
              className={`mt-3 text-[11px] uppercase tracking-[0.25em] text-black font-display font-black ${
                lang === "bn" ? "font-bn" : ""
              }`}
            >
              {t.region}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Why */}
        <AnimatePresence mode="wait">
          <motion.h2
            key={`why-${lang}`}
            {...fadeProps}
            className={`mt-8 font-display font-black text-white text-xl uppercase tracking-tight ${
              lang === "bn" ? "font-bn text-lg normal-case" : ""
            }`}
          >
            {t.why}
          </motion.h2>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div key={`reasons-${lang}`} {...fadeProps}>
            <ReasonList selected={reason} onSelect={setReason} t={t} />
          </motion.div>
        </AnimatePresence>

        {/* Action buttons */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="whatsapp-button"
            className="flex items-center justify-center gap-2 rounded-full border-[3px] border-black bg-white text-black font-display font-black min-h-[58px] px-4 shadow-[5px_5px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_0_#000] transition-all duration-150"
          >
            <MessageCircle className="w-5 h-5 text-[#0F6E56]" strokeWidth={2.6} />
            <AnimatePresence mode="wait">
              <motion.span
                key={`msg-${lang}`}
                {...fadeProps}
                className={lang === "bn" ? "font-bn" : ""}
              >
                {t.message}
              </motion.span>
            </AnimatePresence>
          </a>
          <a
            href={`tel:+91${phone10}`}
            data-testid="call-button"
            className="flex items-center justify-center gap-2 rounded-full border-[3px] border-black bg-neon text-black font-display font-black min-h-[58px] px-4 shadow-[5px_5px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_0_#000] transition-all duration-150"
          >
            <Phone className="w-5 h-5" strokeWidth={2.6} />
            <AnimatePresence mode="wait">
              <motion.span
                key={`call-${lang}`}
                {...fadeProps}
                className={lang === "bn" ? "font-bn" : ""}
              >
                {t.call}
              </motion.span>
            </AnimatePresence>
          </a>
        </div>

        <AnimatePresence mode="wait">
          <motion.p
            key={`spam-${lang}`}
            {...fadeProps}
            className={`mt-3 text-center text-xs text-white/70 leading-snug font-semibold ${
              lang === "bn" ? "font-bn" : ""
            }`}
            data-testid="spam-notice"
          >
            {t.spam}
          </motion.p>
        </AnimatePresence>

        {/* Emergency */}
        <a
          href="tel:112"
          data-testid="emergency-button"
          className="mt-6 flex items-center justify-center gap-2 rounded-full border-[3px] border-black bg-red-500 text-white font-display font-black min-h-[56px] shadow-[5px_5px_0_0_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_0_#000] transition-all duration-150"
        >
          <Ambulance className="w-5 h-5" strokeWidth={2.6} />
          <AnimatePresence mode="wait">
            <motion.span
              key={`em-${lang}`}
              {...fadeProps}
              className={`uppercase ${lang === "bn" ? "font-bn normal-case" : ""}`}
            >
              {t.emergency}
            </motion.span>
          </AnimatePresence>
          <span className="ml-1 font-mono text-xs bg-black/30 px-2 py-0.5 rounded-full">
            112
          </span>
        </a>

        {/* Trust line */}
        <div className="mt-5 flex items-start gap-2.5 bg-white/10 border-[2px] border-white/25 rounded-2xl px-3.5 py-2.5 backdrop-blur-sm">
          <ShieldCheck className="w-4 h-4 mt-0.5 text-neon shrink-0" strokeWidth={2.6} />
          <AnimatePresence mode="wait">
            <motion.p
              key={`priv-${lang}`}
              {...fadeProps}
              className={`text-[12px] leading-snug text-white/90 font-semibold ${
                lang === "bn" ? "font-bn" : ""
              }`}
            >
              {t.priv}
            </motion.p>
          </AnimatePresence>
        </div>

        <footer className="mt-8 text-center text-[11px] text-white/60 font-display font-bold tracking-widest uppercase">
          NECIRCLE · CONNECTING THE NORTHEAST · #{id}
        </footer>
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
      className="min-h-screen bg-royal text-white flex flex-col animate-fade-up"
      data-testid="contact-page"
      data-tag-type="business"
    >
      <div className="max-w-md w-full mx-auto px-5 pt-6 pb-10 flex-1">
        <div className="flex items-center justify-between">
          <BrandMark />
          <span className="text-xs font-mono text-white/70">#{id}</span>
        </div>

        <div className="mt-8 rounded-2xl bg-neon text-[#1a1a1a] border-[3px] border-[#1a1a1a] shadow-[6px_6px_0_0_#1a1a1a] px-6 py-8">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest font-black">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]" />
            Business profile
          </div>
          <div className="mt-1 text-[11px] font-bn text-[#1a1a1a]/70">ব্যবসার প্রোফাইল</div>
          <h1
            className="mt-4 font-display text-4xl sm:text-5xl font-black leading-tight break-words"
            data-testid="contact-name"
          >
            {profile.name}
          </h1>
          {profile.note && (
            <p className="mt-3 text-[#1a1a1a]/80 text-sm leading-relaxed font-medium" data-testid="contact-note">
              {profile.note}
            </p>
          )}
        </div>

        <div className="mt-6 space-y-3">
          <a
            href={`tel:+91${phone10}`}
            data-testid="call-button"
            className="btn-neon flex items-center justify-center gap-3 rounded-full px-6 min-h-[60px] font-display text-lg font-black"
          >
            <Phone className="w-5 h-5" strokeWidth={2.5} />
            Call {profile.name.split(" ")[0]}
          </a>
          <a
            href={`https://wa.me/91${phone10}`}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="whatsapp-button"
            className="flex items-center justify-center gap-3 rounded-full px-6 min-h-[60px] font-display text-lg font-black bg-[#0F6E56] text-white border-[3px] border-[#1a1a1a] shadow-[4px_4px_0_0_#1a1a1a] hover:bg-[#0A4E3D] transition-colors"
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
      className="min-h-screen bg-royal text-white flex flex-col animate-fade-up"
      data-testid="claim-page"
    >
      <div className="max-w-md w-full mx-auto px-5 pt-6 pb-10 flex-1">
        <div className="flex items-center justify-between">
          <BrandMark />
          <span
            className="text-xs text-white/70 font-mono"
            data-testid="claim-tag-id"
          >
            Tag #{tag.id}
          </span>
        </div>

        <div className="mt-10">
          <div className="inline-flex items-center gap-2 chip bg-neon text-[#1a1a1a] border-[2.5px] border-[#1a1a1a]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1a1a1a]" />
            Not activated yet
          </div>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold leading-tight text-white">
            This tag isn&apos;t activated yet.
          </h1>
          <p className="mt-2 font-bn text-lg text-white/85">
            এই ট্যাগটি এখনো চালু করা হয়নি।
          </p>
          <p className="mt-4 text-white/75 leading-relaxed">
            Whoever owns this vehicle or card can set it up in under a minute — no
            app required.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="mt-8 space-y-5 brutal-card p-6"
          data-testid="claim-form"
          noValidate
        >
          <div>
            <Label htmlFor="name" className="text-[#1a1a1a] font-bold">
              Full name <span className="text-royal">*</span>
            </Label>
            <p className="text-xs text-[#5C564F] font-bn mt-0.5">আপনার নাম</p>
            <Input
              id="name"
              data-testid="name-input"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="e.g. Ananya Deb"
              className="mt-2 rounded-xl border-[2px] border-[#1a1a1a] text-[#1a1a1a] focus-visible:ring-2 focus-visible:ring-royal focus-visible:border-transparent"
            />
            {errors.name && (
              <p className="mt-1.5 text-xs text-red-600 font-semibold" data-testid="name-error">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="phone" className="text-[#1a1a1a] font-bold">
              Phone / WhatsApp <span className="text-royal">*</span>
            </Label>
            <p className="text-xs text-[#5C564F] font-bn mt-0.5">
              ফোন / হোয়াটসঅ্যাপ নম্বর
            </p>
            <Input
              id="phone"
              data-testid="phone-input"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="e.g. 98765 43210"
              className="mt-2 rounded-xl border-[2px] border-[#1a1a1a] text-[#1a1a1a] focus-visible:ring-2 focus-visible:ring-royal focus-visible:border-transparent"
            />
            <p className="mt-1 text-[11px] text-[#5C564F]">
              Kept private — never shown to strangers.
            </p>
            {errors.phone && (
              <p className="mt-1.5 text-xs text-red-600 font-semibold" data-testid="phone-error">
                {errors.phone}
              </p>
            )}
          </div>

          <div>
            <Label className="text-[#1a1a1a] font-bold">Type of tag</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setField("type", v)}
            >
              <SelectTrigger
                data-testid="type-select"
                className="mt-2 rounded-xl border-[2px] border-[#1a1a1a] text-[#1a1a1a]"
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
              <Label htmlFor="plate" className="text-[#1a1a1a] font-bold">
                Vehicle number <span className="text-royal">*</span>
              </Label>
              <p className="text-xs text-[#5C564F] font-bn mt-0.5">গাড়ির নম্বর</p>
              <Input
                id="plate"
                data-testid="plate-input"
                value={form.vehicle_number}
                onChange={(e) =>
                  setField("vehicle_number", e.target.value.toUpperCase())
                }
                placeholder="TR01A1234"
                maxLength={12}
                className="mt-2 rounded-xl border-[2px] border-[#1a1a1a] text-[#1a1a1a] font-mono uppercase tracking-wider focus-visible:ring-2 focus-visible:ring-royal focus-visible:border-transparent"
              />
              <p className="mt-1 text-[11px] text-[#5C564F]">
                Tripura plate only. Format: TR + district (01-99) + series (A-Z) + number.
              </p>
              {errors.vehicle_number && (
                <p className="mt-1.5 text-xs text-red-600 font-semibold" data-testid="plate-error">
                  {errors.vehicle_number}
                </p>
              )}
            </div>
          )}

          {form.type === "business" && (
            <div>
              <Label htmlFor="note" className="text-[#1a1a1a] font-bold">
                What do you do? <span className="text-[#5C564F] font-normal">(optional)</span>
              </Label>
              <Textarea
                id="note"
                data-testid="note-input"
                value={form.note}
                onChange={(e) => setField("note", e.target.value)}
                placeholder="e.g. Home-cooked Bengali tiffin service — Agartala"
                rows={3}
                className="mt-2 rounded-xl border-[2px] border-[#1a1a1a] text-[#1a1a1a] focus-visible:ring-2 focus-visible:ring-royal focus-visible:border-transparent"
              />
            </div>
          )}

          {serverError && (
            <div
              className="text-sm text-red-700 bg-red-50 border-2 border-red-300 rounded-lg px-3 py-2 font-semibold"
              data-testid="server-error"
            >
              {serverError}
            </div>
          )}

          <button
            type="submit"
            data-testid="activate-button"
            disabled={submitting}
            className="btn-neon w-full rounded-full min-h-[56px] font-display text-base font-black flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Activating…
              </>
            ) : (
              "Activate this tag"
            )}
          </button>
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
      <div className="min-h-screen bg-royal flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-neon" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div
        className="min-h-screen bg-royal text-white flex flex-col items-center justify-center px-6 text-center"
        data-testid="tag-not-found"
      >
        <BrandMark />
        <h1 className="mt-8 font-display text-3xl font-extrabold text-white">
          Tag not found
        </h1>
        <p className="mt-2 text-white/75">
          The tag <span className="font-mono">#{tagId}</span> doesn&apos;t exist in our
          system.
        </p>
        <button
          onClick={() => navigate("/")}
          data-testid="not-found-home"
          className="mt-6 btn-neon rounded-full px-5 py-2 font-display font-black"
        >
          Go home
        </button>
      </div>
    );
  }

  if (!tag) {
    return (
      <div
        className="min-h-screen bg-royal text-white flex flex-col items-center justify-center px-6 text-center"
        data-testid="tag-error"
      >
        <BrandMark />
        <h1 className="mt-8 font-display text-3xl font-extrabold text-white">
          Something went wrong
        </h1>
        <p className="mt-2 text-white/75 max-w-sm">
          We couldn&apos;t load this tag right now. Please try again in a moment.
        </p>
        <button
          onClick={() => window.location.reload()}
          data-testid="tag-error-retry"
          className="mt-6 btn-neon rounded-full px-5 py-2 font-display font-black"
        >
          Retry
        </button>
      </div>
    );
  }

  if (tag.status === "active") return <ClaimedView tag={tag} />;
  return <ClaimView tag={tag} onClaimed={setTag} />;
}
