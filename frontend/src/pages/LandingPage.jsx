import { Link } from "react-router-dom";
import { QrCode, ShieldCheck, Zap, ArrowRight } from "lucide-react";
import { BrandMark } from "../components/BrandMark";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-paper paper-grain relative">
      <header className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between relative z-10">
        <BrandMark />
        <Link
          to="/login"
          data-testid="header-login-link"
          className="chip bg-ink text-white hover:bg-ink/90 px-4 py-2 transition-colors"
        >
          Operator sign in
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 pt-10 pb-20 relative z-10">
        <div className="inline-flex items-center gap-2 chip bg-clay/10 text-clay">
          <span className="w-1.5 h-1.5 rounded-full bg-clay" />
          Built in Tripura · Connecting the Northeast
        </div>
        <h1 className="mt-5 font-display text-5xl sm:text-6xl font-extrabold leading-[1.02] tracking-tight text-ink">
          A tiny sticker that lets anyone reach the owner —{" "}
          <span className="text-clay">without an app.</span>
        </h1>
        <p className="mt-4 font-bn text-xl text-ink-muted">
          স্ক্যান করে যোগাযোগ করুন — কোনো অ্যাপ ছাড়াই।
        </p>
        <p className="mt-6 text-lg text-ink-muted leading-relaxed max-w-2xl">
          NECircle turns a printed QR sticker on your windshield or shop counter
          into a live contact page. Scan once to claim, and anyone who scans it
          later gets a call or WhatsApp button — nothing more, nothing tracked.
        </p>

        <div className="mt-10 grid sm:grid-cols-3 gap-4">
          {[
            {
              icon: QrCode,
              title: "Buy once",
              body: "Pre-printed 5-digit tags shipped ready to stick.",
            },
            {
              icon: Zap,
              title: "Claim in a minute",
              body: "Scan your own sticker, add your name & number.",
            },
            {
              icon: ShieldCheck,
              title: "Stay private",
              body: "No account, no tracking, no downloads.",
            },
          ].map((c, i) => (
            <div
              key={c.title}
              className="bg-white rounded-2xl border border-black/10 p-5 animate-fade-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <c.icon className="w-5 h-5 text-clay" strokeWidth={2.2} />
              <div className="mt-3 font-display font-bold text-ink">{c.title}</div>
              <div className="mt-1 text-sm text-ink-muted">{c.body}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to="/login"
            data-testid="landing-cta-login"
            className="btn-clay rounded-full px-6 py-3 font-display font-bold inline-flex items-center gap-2"
          >
            Open operator dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
          <span className="text-sm text-ink-muted self-center">
            or scan any NECircle sticker to try it.
          </span>
        </div>
      </main>

      <footer className="border-t border-black/10 bg-white/40 relative z-10">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-6 text-xs text-ink-muted flex items-center justify-between">
          <span>© NECircle · Built in Tripura</span>
          <span className="font-bn">উত্তর-পূর্বকে যুক্ত করছে</span>
        </div>
      </footer>
    </div>
  );
}
