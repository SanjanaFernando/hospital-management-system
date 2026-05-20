export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="h-10 w-64 rounded-2xl bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-28 rounded-2xl bg-white shadow-sm">
              <div className="h-full animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-[240px] rounded-3xl bg-white shadow-sm"
            >
              <div className="h-full animate-pulse rounded-3xl bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
