"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginUser } from "@/app/actions/userActions";
import { ShieldCheck, Eye, EyeOff, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await loginUser(userId, password);

      if (!result.success) {
        setError(result.error || "Login failed.");
        setIsLoading(false);
        return;
      }

      if (result.mustChangePassword) {
        window.location.href = "/change-password";
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("An unexpected error occurred.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0b2b33] via-[#0d3d47] to-[#134e5e]" />

      {/* Animated background orbs */}
      <div
        className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-20"
        style={{
          background:
            "radial-gradient(circle, rgba(20, 184, 166, 0.4) 0%, transparent 70%)",
          animation: mounted ? "float 8s ease-in-out infinite" : "none",
        }}
      />
      <div
        className="absolute bottom-[-15%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-15"
        style={{
          background:
            "radial-gradient(circle, rgba(6, 182, 212, 0.4) 0%, transparent 70%)",
          animation: mounted ? "float 10s ease-in-out infinite reverse" : "none",
        }}
      />
      <div
        className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full opacity-10"
        style={{
          background:
            "radial-gradient(circle, rgba(45, 212, 191, 0.5) 0%, transparent 70%)",
          animation: mounted ? "float 6s ease-in-out infinite 2s" : "none",
        }}
      />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Login Card */}
      <div
        className={`relative z-10 w-full max-w-md mx-4 transition-all duration-700 ${
          mounted
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-8"
        }`}
      >
        {/* Card */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.07] backdrop-blur-xl shadow-[0_32px_80px_rgba(0,0,0,0.35)] p-8 md:p-10">
          {/* Hospital Logo / Brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-400 to-cyan-500 shadow-lg shadow-teal-500/25 mb-4">
              <ShieldCheck className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Karapitiya Teaching Hospital
            </h1>
            <p className="text-sm text-teal-100/70 mt-1 font-medium uppercase tracking-[0.15em]">
              Bed & Queue Management System
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* User ID */}
            <div>
              <label
                htmlFor="login-user-id"
                className="block text-xs font-semibold text-teal-100/80 mb-1.5 uppercase tracking-wider"
              >
                User ID
              </label>
              <input
                id="login-user-id"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={userId}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  if (val.length <= 6) setUserId(val);
                }}
                placeholder="Enter 6-digit ID"
                required
                autoFocus
                className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-white placeholder-white/30 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-400/50 focus:border-teal-400/40 transition-all"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-semibold text-teal-100/80 mb-1.5 uppercase tracking-wider"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 pr-11 text-white placeholder-white/30 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-400/50 focus:border-teal-400/40 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200 animate-shake">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || userId.length !== 6 || !password}
              className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-teal-500/25 transition-all hover:shadow-teal-500/40 hover:from-teal-400 hover:to-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-teal-500/25 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Info text */}
          <p className="mt-6 text-center text-xs text-white/30">
            Your temporary password was sent to your email.
            <br />
            Contact your admin if you need access.
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-white/20 mt-6">
          © 2026 Karapitiya Teaching Hospital — Secure Access
        </p>
      </div>

      {/* CSS Animation */}
      <style jsx>{`
        @keyframes float {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -30px) scale(1.05);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.95);
          }
        }

        @keyframes shake {
          0%,
          100% {
            transform: translateX(0);
          }
          10%,
          30%,
          50%,
          70%,
          90% {
            transform: translateX(-4px);
          }
          20%,
          40%,
          60%,
          80% {
            transform: translateX(4px);
          }
        }

        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
