"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    color?: string;
  };
};

type ChartContextProps = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextProps | null>(null);

function toChartNode(value: unknown): React.ReactNode {
  if (value == null || typeof value === "boolean") {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (React.isValidElement(value)) {
    return value;
  }

  if (value instanceof Date) {
    return value.toLocaleString();
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "flex w-full min-w-0 aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-gray-500 [&_.recharts-legend-item_text]:fill-gray-700 [&_.recharts-tooltip-cursor]:stroke-gray-300 [&_.recharts-pie-label-text]:fill-gray-700",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(
    ([, configItem]) => configItem.color,
  );

  if (!colorConfig.length) {
    return null;
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(config)
          .map(([key, configItem]) => {
            const color = configItem.color;
            return color
              ? `[data-chart=${id}] { --color-${key}: ${color}; }`
              : null;
          })
          .filter(Boolean)
          .join("\n"),
      }}
    />
  );
};

function ChartTooltip({
  active,
  payload,
  className,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{
    dataKey?: unknown;
    name?: unknown;
    value?: unknown;
  }>;
  className?: string;
}) {
  const { config } = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md",
        className,
      )}
    >
      {payload.map((item) => {
        const key = String(item.dataKey ?? "");
        const label = toChartNode(config[key]?.label ?? item.name ?? key);
        const value = toChartNode(item.value);
        return (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-gray-600">{label}</span>
            <span className="font-semibold text-gray-900">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

function ChartLegendContent({
  payload,
}: {
  payload?: ReadonlyArray<{
    dataKey?: unknown;
    value?: unknown;
    color?: string;
  }>;
}) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs">
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value ?? "");
        const label = toChartNode(config[key]?.label ?? item.value ?? key);
        return (
          <div key={key} className="flex items-center gap-2 text-gray-700">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartLegendContent, ChartTooltip };
