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
      <div className="flex flex-col items-center gap-8">
        {/* Medical Cross Animation */}
        <div className="relative w-32 h-32">
          {/* Outer rotating ring */}
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-red-600 border-r-red-400 animate-spin" />

          {/* Medical Cross */}
          <svg
            className="absolute inset-0 w-full h-full animate-pulse"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Vertical bar */}
            <rect x="40" y="10" width="20" height="80" fill="#DC2626" rx="2" />
            {/* Horizontal bar */}
            <rect x="10" y="40" width="80" height="20" fill="#DC2626" rx="2" />
          </svg>

          {/* Inner pulsing circle */}
          <div className="absolute inset-4 rounded-full bg-red-50 animate-pulse opacity-40" />
        </div>

        {/* Loading Text with typing animation */}
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-800 mb-2">{message}</p>
          <div className="flex justify-center gap-1">
            <span className="w-2 h-2 bg-red-600 rounded-full animate-bounce" />
            <span
              className="w-2 h-2 bg-red-600 rounded-full animate-bounce"
              style={{ animationDelay: "0.2s" }}
            />
            <span
              className="w-2 h-2 bg-red-600 rounded-full animate-bounce"
              style={{ animationDelay: "0.4s" }}
            />
          </div>
        </div>

        {/* Optional subtitle */}
        <p className="text-sm text-gray-500 text-center max-w-xs">
          Connecting to MongoDB Hospital Database...
        </p>
      </div>
    </div>
  );
}
