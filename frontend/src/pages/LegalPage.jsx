import { Link, useParams, Navigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { ArrowLeft } from "lucide-react";

const PAGES = {
  privacy: {
    title: "Privacy Policy",
    body: [
      ["What we collect", "When you buy a NECircle tag we store your name, phone number, shipping address and PIN code so we can ship your order and contact you about it. When you claim a tag, we also store the name, phone and vehicle number you enter — this is what strangers see when they scan your sticker (phone number is never printed on the page)."],
      ["What we do NOT collect", "We do not collect location, device fingerprints, browsing history, or the identity of anyone scanning your sticker. There is no third-party analytics or tracker on the scan page."],
      ["Payments", "Payments run through Razorpay. Card and UPI details are handled directly by Razorpay and never touch our servers."],
      ["Sharing", "We do not sell or share your data. We share only what's needed with our courier partner to deliver the sticker."],
      ["Contact", "Write to admin@necircle.in to request a copy or deletion of your data."],
    ],
  },
  terms: {
    title: "Terms & Conditions",
    body: [
      ["The product", "NECircle sells printed QR stickers that route scans to a public contact page. Each order (₹99) ships three physical stickers — one each in English, Kokborok and Bengali — that all encode the same QR."],
      ["Your account", "The tag is claimed once, by the person who scans it first. Please keep your tag ID private until you have activated it."],
      ["Acceptable use", "The tag must be used to help someone reach the owner of a vehicle or a small business. Impersonation, spam or illegal use may result in the tag being disabled."],
      ["Availability", "We do our best to keep the service running 24/7 but cannot guarantee zero downtime. QR pages may be temporarily unreachable during maintenance."],
      ["Liability", "NECircle is not liable for calls, messages or actions taken by anyone who scans a sticker."],
      ["Governing law", "These terms are governed by the laws of India, with disputes handled in the courts of Tripura."],
    ],
  },
  refunds: {
    title: "Refunds & Returns",
    body: [
      ["Before dispatch", "If your order hasn't been marked as shipped yet, message us on WhatsApp within 24 hours and we'll cancel and refund the full amount to the original payment method within 5–7 working days."],
      ["Damaged in transit", "If the stickers arrive damaged or unreadable, send us a photo within 3 days of delivery and we'll ship a free replacement or refund your choice."],
      ["Change of mind", "Because the stickers carry a unique ID that is printed on demand, we cannot accept returns after the tag has been claimed."],
      ["How to reach us", "WhatsApp / call: shown on the contact tag you purchased, or email admin@necircle.in."],
    ],
  },
  shipping: {
    title: "Shipping Policy",
    body: [
      ["Rates", "₹21 flat rate for PIN codes starting with 799 (Tripura). ₹80 flat rate anywhere else in India. Shown before you pay."],
      ["Timeline", "Orders are dispatched within 2 working days. Delivery takes 3–5 working days inside Tripura and 5–8 working days elsewhere in India."],
      ["Courier partner", "India Post and Delhivery, depending on your PIN code."],
      ["Address changes", "If you need to correct the address after ordering, WhatsApp us on the number in your confirmation before we mark the order as shipped."],
      ["International", "We currently ship inside India only."],
    ],
  },
};

export default function LegalPage() {
  const { slug } = useParams();
  const page = PAGES[slug];
  if (!page) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-royal text-white">
      <header className="border-b border-white/15">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-4 flex items-center justify-between">
          <BrandMark size={44} />
          <Link
            to="/"
            data-testid="legal-home"
            className="text-sm font-black text-white/90 hover:text-neon inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-10">
        <h1
          data-testid="legal-title"
          className="font-display text-4xl sm:text-5xl font-black tracking-tight"
        >
          {page.title}
        </h1>
        <p className="mt-2 text-white/60 text-sm">
          NECircle · Last updated {new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
        </p>

        <div className="mt-8 space-y-6" data-testid="legal-body">
          {page.body.map(([h, p]) => (
            <section key={h}>
              <h2 className="font-display text-xl font-black text-neon">{h}</h2>
              <p className="mt-1.5 text-white/85 leading-relaxed">{p}</p>
            </section>
          ))}
        </div>

        <footer className="mt-14 pt-6 border-t border-white/15 text-xs text-white/60 flex flex-wrap gap-x-4 gap-y-2">
          {Object.entries(PAGES).map(([s, p]) => (
            <Link key={s} to={`/legal/${s}`} className="hover:text-neon">
              {p.title}
            </Link>
          ))}
          <a href="mailto:admin@necircle.in" className="hover:text-neon">
            admin@necircle.in
          </a>
        </footer>
      </main>
    </div>
  );
}
