export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-3">
          <div className="h-10 w-72 rounded-2xl bg-slate-200" />
          <div className="h-5 w-96 rounded-full bg-slate-200" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-28 rounded-2xl bg-white shadow-sm">
              <div className="h-full animate-pulse rounded-2xl bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100" />
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="h-[320px] rounded-3xl bg-white shadow-sm">
            <div className="h-full animate-pulse rounded-3xl bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100" />
          </div>
          <div className="h-[320px] rounded-3xl bg-white shadow-sm">
            <div className="h-full animate-pulse rounded-3xl bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100" />
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-20 rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
