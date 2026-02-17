"use client";

interface MedicalCrossLoaderProps {
  message?: string;
  fullScreen?: boolean;
}

export default function MedicalCrossLoader({
  message = "Loading Hospital Data...",
  fullScreen = false,
}: MedicalCrossLoaderProps) {
  const containerClass = fullScreen
    ? "fixed inset-0 flex items-center justify-center bg-white bg-opacity-95 z-50"
    : "flex items-center justify-center py-16";

  return (
    <div className={containerClass}>
      <div className="flex flex-col items-center gap-6">
        <div className="loader" aria-hidden="true" />
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-800 mb-1">{message}</p>
          <p className="text-sm text-gray-500">
            Connecting Hospital Database...
          </p>
        </div>
      </div>
    </div>
  );
}
