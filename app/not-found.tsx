import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
          404 &mdash; Page Not Found
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">
          Page does not exist
        </h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          The requested page could not be found. It may have been moved, deleted, or the URL might be incorrect.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 shadow-sm"
          >
            Back to Dashboard
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
