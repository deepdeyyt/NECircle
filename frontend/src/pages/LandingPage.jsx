import { useState } from "react";
import { Link } from "react-router-dom";
import {
  QrCode,
  ShieldCheck,
  Zap,
  ArrowRight,
  ScanLine,
  Phone,
  Package,
  Sparkles,
  ChevronDown,
  Truck,
  Globe,
} from "lucide-react";
import BuyModal from "./BuyModal";
import { BrandMark } from "../components/BrandMark";

/* ---------------- Phone mockup (right-side hero art) ---------------- */
function PhoneMockup() {
  return (
    <div className="relative w-[280px] sm:w-[320px] mx-auto">
      <div
        aria-hidden
        className="absolute -inset-8 -z-10 rounded-[3rem]"
        style={{
          background:
            "radial-gradient(60% 60% at 30% 20%, rgba(253,221,14,0.35), transparent 70%), radial-gradient(50% 50% at 80% 80%, rgba(255,255,255,0.12), transparent 70%)",
        }}
      />
      <div className="rounded-[38px] bg-[#1a1a1a] p-2.5 shadow-[10px_10px_0_0_#0f0620]">
        <div className="rounded-[30px] bg-[#FBF7F1] overflow-hidden border border-black/20">
          <div className="flex items-center justify-between px-5 pt-3 pb-2 text-[10px] font-semibold text-[#1a1a1a]">
            <span>9:41</span>
            <div className="w-20 h-4 bg-[#1a1a1a] rounded-full" />
            <span>••• 100%</span>
          </div>
          <div className="px-4 pb-5">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-extrabold text-[#1a1a1a]">
                NE<span className="text-[#B5502F]">Circle</span>
              </span>
              <span className="text-[9px] font-mono text-[#5C564F]">#00042</span>
            </div>
            <h3 className="mt-3 font-display text-[19px] leading-tight font-extrabold text-[#1a1a1a]">
              Contact vehicle owner
            </h3>
            <div className="mt-2.5 rounded-xl border border-black/10 p-2.5 bg-white">
              <div className="inline-flex flex-col rounded overflow-hidden border-[2px] border-[#1a1a1a]">
                <div className="bg-[#0F1E5B] text-white text-[7px] font-black tracking-[0.3em] text-center py-0.5 px-4">
                  IND
                </div>
                <div className="flex items-stretch bg-white">
                  <div className="w-1.5 flex flex-col border-r-[1.5px] border-[#1a1a1a]">
                    <div className="flex-1 bg-[#FF9933]" />
                    <div className="flex-1 bg-white" />
                    <div className="flex-1 bg-[#138808]" />
                  </div>
                  <div className="px-2 py-0.5 font-mono font-black text-sm tracking-wider text-[#1a1a1a]">
                    TR-01-A-1234
                  </div>
                </div>
              </div>
              <div className="mt-1.5 text-[8px] uppercase tracking-widest text-[#5C564F] font-bold">
                Tripura · IND
              </div>
            </div>
            <div className="mt-2.5 space-y-1.5">
              {["Lights are on", "In no parking", "Getting towed"].map((r, i) => (
                <div
                  key={r}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
                    i === 1
                      ? "border-[#B5502F] bg-[#B5502F]/10"
                      : "border-black/10 bg-white"
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full border-2 ${
                      i === 1 ? "border-[#B5502F] bg-[#B5502F]" : "border-black/25"
                    }`}
                  />
                  <span className="text-[11px] font-medium text-[#1a1a1a]">{r}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-full border-2 border-[#0F6E56] bg-white text-[#0F6E56] font-display font-bold text-[11px] py-2 text-center">
                Message
              </div>
              <div className="rounded-full bg-[#FDDD0E] text-[#1a1a1a] font-display font-bold text-[11px] py-2 text-center border-2 border-[#1a1a1a]">
                Private call
              </div>
            </div>
            <div className="mt-2 rounded-full bg-red-500 text-white font-display font-bold text-[11px] py-2 text-center border-2 border-[#1a1a1a]">
              Emergency · 112
            </div>
          </div>
        </div>
      </div>

      {/* Floating badges */}
      <div className="absolute -left-6 top-16 hidden sm:flex items-center gap-2 bg-neon text-[#1a1a1a] border-[2.5px] border-[#1a1a1a] rounded-full pl-2 pr-3 py-1.5 shadow-[3px_3px_0_0_#1a1a1a]">
        <ScanLine className="w-3.5 h-3.5" strokeWidth={2.6} />
        <span className="text-[11px] font-black">1 scan → contact</span>
      </div>
      <div className="absolute -right-4 bottom-10 hidden sm:flex items-center gap-2 bg-white text-[#1a1a1a] border-[2.5px] border-[#1a1a1a] rounded-full pl-2 pr-3 py-1.5 shadow-[3px_3px_0_0_#1a1a1a]">
        <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.6} />
        <span className="text-[11px] font-black">Number stays private</span>
      </div>
    </div>
  );
}

/* ---------------- FAQ ---------------- */
const FAQ = [
  {
    q: "How does NECircle work?",
    a: "Stick the QR on your car windshield. When someone scans it, they see a page with a Call and WhatsApp button — no app, no signup. Your real number stays hidden in the interface.",
  },
  {
    q: "What's inside each order?",
    a: "One order gives you three physical stickers of the same QR — printed in English, Kokborok, and Bengali. Peel any one and stick it.",
  },
  {
    q: "How long does shipping take?",
    a: "Stickers ship anywhere in India in 3–5 working days after payment.",
  },
  {
    q: "What if I want to update my phone number later?",
    a: "Currently the tag is set once. Owner-edit is coming soon — meanwhile write to us and we'll update it manually.",
  },
  {
    q: "Is my phone number visible to strangers?",
    a: "The number is never printed on the page — only Call and WhatsApp buttons are shown. True carrier-level masking is on our roadmap.",
  },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-white/15 py-4 last:border-b-0">
      <button
        onClick={() => setOpen((x) => !x)}
        className="w-full flex items-start justify-between gap-4 text-left"
        data-testid="faq-toggle"
      >
        <span className="font-display font-bold text-white text-lg">{q}</span>
        <ChevronDown
          className={`w-5 h-5 text-neon shrink-0 mt-1 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`grid transition-all duration-200 ease-out ${
          open ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <p className="text-white/75 leading-relaxed">{a}</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Landing page ---------------- */
export default function LandingPage() {
  const [buyOpen, setBuyOpen] = useState(false);

  return (
    <div className="min-h-screen bg-royal text-white relative overflow-hidden">
      {/* Decorative background */}
      <div
        aria-hidden
        className="absolute -top-32 -left-24 w-96 h-96 rounded-full opacity-70 pointer-events-none"
        style={{ backgroundColor: "#5E3EAF" }}
      />
      <div
        aria-hidden
        className="absolute top-[520px] -right-20 w-80 h-80 rounded-full opacity-40 pointer-events-none"
        style={{ backgroundColor: "#FDDD0E" }}
      />

      {/* Header */}
      <header className="relative z-10">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between gap-3">
          <BrandMark size={56} />
          <div className="flex items-center gap-2">
            <a
              href="#how"
              data-testid="nav-how"
              className="hidden sm:inline text-sm text-white/80 hover:text-white px-3 py-2 font-semibold"
            >
              How it works
            </a>
            <a
              href="#faq"
              data-testid="nav-faq"
              className="hidden sm:inline text-sm text-white/80 hover:text-white px-3 py-2 font-semibold"
            >
              FAQ
            </a>
            <Link
              to="/admin"
              data-testid="nav-admin"
              className="text-sm font-black text-white border-[2.5px] border-white/70 rounded-full px-3.5 py-1.5 hover:bg-white hover:text-royal transition-colors"
            >
              Operator
            </Link>
            <button
              onClick={() => setBuyOpen(true)}
              data-testid="nav-buy"
              className="btn-neon rounded-full px-4 py-2 font-display font-black text-sm"
            >
              Buy a tag
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pt-8 sm:pt-14 pb-16">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 chip bg-neon text-[#1a1a1a] border-[2.5px] border-[#1a1a1a] shadow-[3px_3px_0_0_#1a1a1a]">
              <Sparkles className="w-3.5 h-3.5" strokeWidth={2.8} />
              Built in Tripura
            </div>
            <h1 className="mt-6 font-display text-[46px] sm:text-[62px] lg:text-[76px] font-black leading-[0.98] tracking-[-0.03em] text-white">
              A tiny sticker
              <br />
              that lets anyone
              <br />
              reach the owner —
              <br />
              <span className="text-neon">without an app.</span>
            </h1>
            <p className="mt-5 font-bn text-xl sm:text-2xl text-neon font-bold leading-tight">
              স্ক্যান করুন — কোনো অ্যাপ ছাড়াই।
            </p>
            <p className="mt-6 text-lg text-white font-medium leading-relaxed max-w-xl">
              Stick a NECircle QR on your car windshield. Anyone who scans it gets
              a Call and WhatsApp button — your real number stays private, in
              English, Kokborok, or বাংলা.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                onClick={() => setBuyOpen(true)}
                data-testid="hero-buy"
                className="btn-neon rounded-full px-6 py-3.5 font-display font-black inline-flex items-center gap-2 text-base"
              >
                Buy a tag · ₹99
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="#how"
                data-testid="hero-how"
                className="btn-outline-w rounded-full px-6 py-3.5 font-display font-black inline-flex items-center gap-2 text-base"
              >
                See how it works
              </a>
            </div>
            <p className="mt-4 text-xs text-white/75 font-bold">
              1 order = 3 stickers · English · Kokborok · বাংলা · ships across India.
            </p>
          </div>

          <div
            className="flex justify-center lg:justify-end animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            <PhoneMockup />
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section
        className="relative z-10 bg-neon text-[#1a1a1a] border-y-[3px] border-[#1a1a1a]"
        data-testid="stats-strip"
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { k: "3", l: "Languages on every sticker" },
            { k: "0", l: "Apps to install" },
            { k: "₹99", l: "One-time · shipping included" },
            { k: "3–5 days", l: "Delivered anywhere in India" },
          ].map((s) => (
            <div key={s.l}>
              <div className="font-display text-3xl sm:text-4xl font-black tracking-tight">
                {s.k}
              </div>
              <div className="mt-1 text-xs sm:text-sm text-[#1a1a1a]/70 font-semibold">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section
        id="how"
        className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-20"
      >
        <div className="text-center max-w-2xl mx-auto">
          <div className="chip bg-white text-royal border-[2.5px] border-white inline-flex">
            <ScanLine className="w-3.5 h-3.5" strokeWidth={2.8} />
            How it works
          </div>
          <h2 className="mt-4 font-display text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
            Three steps, then it just works.
          </h2>
        </div>
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {[
            {
              n: "01",
              icon: Package,
              title: "Order once",
              body: "Pay ₹99. We ship 3 language stickers to your door in a few days.",
            },
            {
              n: "02",
              icon: QrCode,
              title: "Scan to claim",
              body: "Scan your own sticker, add your name, phone and Tripura plate.",
            },
            {
              n: "03",
              icon: Phone,
              title: "Anyone can reach you",
              body: "Passers-by scan and tap Call or WhatsApp — your number stays hidden.",
            },
          ].map((s, i) => (
            <div
              key={s.n}
              className="brutal-card p-6 animate-fade-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-black text-royal">{s.n}</span>
                <s.icon className="w-5 h-5 text-royal" strokeWidth={2.4} />
              </div>
              <h3 className="mt-4 font-display font-extrabold text-xl text-[#1a1a1a]">
                {s.title}
              </h3>
              <p className="mt-2 text-[#5C564F] leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sticker sample */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pb-20">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div className="order-2 lg:order-1">
            <div className="chip bg-neon text-[#1a1a1a] border-[2.5px] border-[#1a1a1a] inline-flex shadow-[3px_3px_0_0_#1a1a1a]">
              <Package className="w-3.5 h-3.5" strokeWidth={2.8} />
              What lands in your mailbox
            </div>
            <h2 className="mt-5 font-display text-4xl sm:text-5xl font-black text-white tracking-tight leading-[1.02]">
              A weather-proof
              <br />
              <span className="text-neon">windshield sticker.</span>
            </h2>
            <p className="mt-5 text-lg text-white font-medium leading-relaxed">
              Each order ships with three of these stickers — one printed with
              English copy, one Kokborok, one বাংলা. Same QR on all three, so any
              one you peel and stick works.
            </p>
            <ul className="mt-6 space-y-2 text-white/90 font-semibold">
              {[
                "UV-safe ink, holds up to sun & rain",
                "3.5 × 2 inch — sits neatly on any windshield",
                "5-digit ID printed under the QR",
              ].map((li) => (
                <li key={li} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-neon" />
                  {li}
                </li>
              ))}
            </ul>
            <button
              onClick={() => setBuyOpen(true)}
              data-testid="sticker-buy"
              className="mt-7 btn-neon rounded-full px-6 py-3 font-display font-black inline-flex items-center gap-2"
            >
              Get 3 stickers for ₹99
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="order-1 lg:order-2 flex justify-center">
            <div
              className="relative w-full max-w-[520px] transition-transform hover:-rotate-1 hover:scale-[1.02]"
              data-testid="sticker-sample"
            >
              <img
                src="/sticker-sample.webp"
                alt="NECircle windshield sticker sample"
                className="w-full h-auto rounded-2xl border-[3px] border-black shadow-[10px_10px_0_0_#1a1a1a]"
                draggable="false"
              />
              <div className="absolute -top-4 -left-4 bg-neon text-[#1a1a1a] border-[2.5px] border-black rounded-full px-3 py-1 font-display font-black text-xs shadow-[3px_3px_0_0_#1a1a1a] rotate-[-6deg]">
                Real product
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature stripe */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pb-20">
        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              icon: Globe,
              title: "3 languages, 1 QR",
              body: "The same QR opens a page that flips between English, Kokborok and বাংলা.",
              tint: "#FDDD0E",
            },
            {
              icon: ShieldCheck,
              title: "Number stays hidden",
              body: "Callers see 'Private call' — no digits printed on the page.",
              tint: "#B6F09C",
            },
            {
              icon: Truck,
              title: "Ships across India",
              body: "Durable weather-proof stickers in a small envelope to your address.",
              tint: "#FF9F5A",
            },
          ].map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border-[3px] border-[#1a1a1a] p-6 hover:-translate-y-0.5 transition-transform shadow-[5px_5px_0_0_#1a1a1a]"
              style={{ backgroundColor: c.tint, color: "#1a1a1a" }}
            >
              <div className="w-10 h-10 rounded-xl bg-white border-[2.5px] border-[#1a1a1a] flex items-center justify-center">
                <c.icon className="w-5 h-5" strokeWidth={2.6} />
              </div>
              <h3 className="mt-4 font-display font-black text-lg">{c.title}</h3>
              <p className="mt-1 text-[#1a1a1a]/75 text-sm leading-relaxed font-medium">
                {c.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pb-20">
        <div className="rounded-3xl bg-neon text-[#1a1a1a] border-[3px] border-[#1a1a1a] shadow-[8px_8px_0_0_#1a1a1a] p-8 sm:p-14 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -right-10 -top-10 w-40 h-40 rounded-full"
            style={{ backgroundColor: "rgba(68,38,143,0.35)" }}
          />
          <div className="relative z-10 max-w-2xl">
            <h2 className="font-display text-3xl sm:text-4xl font-black leading-tight">
              Skip the honk. Get a NECircle.
            </h2>
            <p className="mt-3 text-[#1a1a1a]/80 max-w-lg font-medium">
              ₹99 for three stickers, shipping included, printed in Tripura. Try it
              on your car this week.
            </p>
            <button
              onClick={() => setBuyOpen(true)}
              data-testid="cta-buy"
              className="mt-6 btn-royal rounded-full px-6 py-3.5 font-display font-black inline-flex items-center gap-2"
            >
              Order now · ₹99
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className="relative z-10 max-w-3xl mx-auto px-5 sm:px-8 pb-20"
      >
        <div className="text-center">
          <div className="chip bg-neon text-[#1a1a1a] border-[2.5px] border-[#1a1a1a] inline-flex">
            <Zap className="w-3.5 h-3.5" strokeWidth={2.8} />
            FAQ
          </div>
          <h2 className="mt-4 font-display text-4xl font-extrabold text-white">
            Questions we get a lot
          </h2>
        </div>
        <div className="mt-8 bg-royal-soft/60 border-[2.5px] border-white/25 rounded-2xl px-6 backdrop-blur">
          {FAQ.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/15">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-wrap items-center justify-between gap-4 text-xs text-white/70">
          <span>© NECircle · Built in Tripura</span>
          <span className="font-bn">উত্তর-পূর্বকে যুক্ত করছে</span>
          <Link to="/admin" data-testid="footer-admin" className="hover:text-neon">
            Operator sign-in
          </Link>
        </div>
      </footer>

      <BuyModal open={buyOpen} onOpenChange={setBuyOpen} />
    </div>
  );
}
