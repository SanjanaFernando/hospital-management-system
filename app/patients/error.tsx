"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-rose-200 bg-white p-8 shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-600">
          Patients page error
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">
          Failed to load the patient list
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {error.message || "Retry the request or return home."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Retry
          </button>
          <Link
            href="/"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  );
}
