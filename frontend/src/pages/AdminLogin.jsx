import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Loader2, Lock } from "lucide-react";
import { useAuth } from "../lib/auth";
import { formatApiError } from "../lib/api";
import { BrandMark } from "../components/BrandMark";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function AdminLogin() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/admin" replace />;

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
      navigate("/admin", { replace: true });
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <div className="max-w-md w-full mx-auto px-5 py-8 flex-1 flex flex-col">
        <BrandMark />

        <div className="flex-1 flex items-center">
          <div className="w-full">
            <div className="inline-flex items-center gap-2 chip bg-ink/10 text-ink">
              <Lock className="w-3 h-3" /> Operator only
            </div>
            <h1 className="mt-3 font-display text-4xl font-extrabold text-ink">
              Sign in
            </h1>
            <p className="mt-2 text-ink-muted">
              Access the NECircle inventory dashboard.
            </p>

            <form
              onSubmit={submit}
              className="mt-8 space-y-4 bg-white rounded-2xl border border-black/10 p-6"
              data-testid="login-form"
              noValidate
            >
              <div>
                <Label htmlFor="email" className="text-ink font-semibold">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  data-testid="email-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@necircle.in"
                  className="mt-2 rounded-xl border-black/10 focus-visible:ring-2 focus-visible:ring-clay focus-visible:border-transparent"
                />
              </div>
              <div>
                <Label htmlFor="password" className="text-ink font-semibold">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  data-testid="password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-2 rounded-xl border-black/10 focus-visible:ring-2 focus-visible:ring-clay focus-visible:border-transparent"
                />
              </div>
              {error && (
                <div
                  className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                  data-testid="login-error"
                >
                  {error}
                </div>
              )}
              <Button
                type="submit"
                data-testid="login-submit"
                disabled={loading}
                className="btn-clay w-full rounded-full min-h-[52px] font-display text-base font-bold"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
