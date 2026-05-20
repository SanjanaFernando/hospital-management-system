export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="h-10 w-72 rounded-2xl bg-slate-200" />
        <div className="h-16 rounded-2xl bg-white shadow-sm">
          <div className="h-full animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100" />
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-16 rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
