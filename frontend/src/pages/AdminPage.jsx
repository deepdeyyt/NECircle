import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "../lib/auth";
import { formatApiError } from "../lib/api";
import { BrandMark } from "../components/BrandMark";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import AdminDashboard from "./AdminDashboard";

function AdminLoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Enter email and password");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-royal text-white flex flex-col relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-24 -left-16 w-72 h-72 rounded-full opacity-40 pointer-events-none"
        style={{ backgroundColor: "#5E3EAF" }}
      />
      <div
        aria-hidden
        className="absolute bottom-0 -right-16 w-72 h-72 rounded-full opacity-30 pointer-events-none"
        style={{ backgroundColor: "#FDDD0E" }}
      />

      <div className="max-w-md w-full mx-auto px-5 py-8 flex-1 flex flex-col relative z-10">
        <BrandMark />

        <div className="flex-1 flex items-center">
          <div className="w-full">
            <div className="inline-flex items-center gap-2 chip bg-neon text-[#1a1a1a] border-[2.5px] border-[#1a1a1a]">
              <Lock className="w-3 h-3" /> Operator only
            </div>
            <h1 className="mt-4 font-display text-5xl font-extrabold text-white">
              Sign in
            </h1>
            <p className="mt-2 text-white/75">
              Access the NECircle inventory dashboard.
            </p>

            <form
              onSubmit={submit}
              className="mt-8 space-y-4 brutal-card p-6"
              data-testid="login-form"
              noValidate
            >
              <div>
                <Label htmlFor="email" className="text-[#1a1a1a] font-bold">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="email-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@necircle.in"
                  className="mt-2 rounded-xl border-[2px] border-[#1a1a1a] text-[#1a1a1a] focus-visible:ring-2 focus-visible:ring-royal focus-visible:border-transparent"
                />
              </div>
              <div>
                <Label htmlFor="password" className="text-[#1a1a1a] font-bold">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  data-testid="password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-2 rounded-xl border-[2px] border-[#1a1a1a] text-[#1a1a1a] focus-visible:ring-2 focus-visible:ring-royal focus-visible:border-transparent"
                />
              </div>
              {error && (
                <div
                  className="text-sm text-red-700 bg-red-50 border-2 border-red-300 rounded-lg px-3 py-2 font-semibold"
                  data-testid="login-error"
                >
                  {error}
                </div>
              )}
              <button
                type="submit"
                data-testid="login-submit"
                disabled={loading}
                className="btn-neon w-full rounded-full min-h-[54px] font-display text-base font-black flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  if (user === undefined) {
    return (
      <div className="min-h-screen bg-royal flex items-center justify-center text-white/80">
        Loading…
      </div>
    );
  }
  return user ? <AdminDashboard /> : <AdminLoginForm />;
}
