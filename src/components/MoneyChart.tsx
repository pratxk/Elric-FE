/**
 * Money movement area chart — hand-rolled SVG (no chart dependency).
 * Two series: money in (green) and money out (red), with a soft fill.
 * Renders only values passed in from the API. With no data it renders
 * an honest empty note instead of an invented series; a single point
 * renders as a dot, never NaN coordinates.
 */

interface Props {
  labels: string[];
  moneyIn: number[];
  moneyOut: number[];
  height?: number;
  /** Hide the money-in series (AP has no money-in: only outflows are
   * real). When false, only the out series + legend render. */
  showIn?: boolean;
}

function seriesPath(values: number[], max: number, w: number, h: number, pad: number): string {
  if (values.length === 0) return "";
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - (v / max) * (h - pad * 2);
    return [x, y] as const;
  });
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export default function MoneyChart({ labels, moneyIn, moneyOut, height = 180, showIn = true }: Props) {
  const w = 640;
  const h = height;
  const pad = 8;

  if (moneyOut.length === 0 && (!showIn || moneyIn.length === 0)) {
    return (
      <p data-testid="chart-empty" className="py-8 text-center text-sm text-muted">
        No projected outflows yet — scheduled payments will appear here.
      </p>
    );
  }

  const inSeries = showIn ? moneyIn : [];
  const max = Math.max(...inSeries, ...moneyOut, 1) * 1.15;
  const inPath = showIn ? seriesPath(moneyIn, max, w, h, pad) : "";
  const outPath = seriesPath(moneyOut, max, w, h, pad);
  const inArea = `${inPath} L${(w - pad).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;
  const outArea = `${outPath} L${(w - pad).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;
  const step = labels.length > 1 ? (w - pad * 2) / (labels.length - 1) : 0;

  return (
    <div className="transition-opacity duration-200 ease-out motion-reduce:transition-none">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Money in and out by week">
        {showIn && inPath && <path d={inArea} fill="#16A34A" fillOpacity="0.08" />}
        {outPath && <path d={outArea} fill="#DC2626" fillOpacity="0.06" />}
        {showIn && inPath && <path d={inPath} fill="none" stroke="#16A34A" strokeWidth="2" strokeLinejoin="round" />}
        {outPath && <path d={outPath} fill="none" stroke="#DC2626" strokeWidth="2" strokeLinejoin="round" />}
        {showIn &&
          moneyIn.map((v, i) => {
            const x = pad + i * step;
            const y = h - pad - (v / max) * (h - pad * 2);
            return <circle key={`in-${i}`} cx={x} cy={y} r="3" fill="#16A34A" stroke="#fff" strokeWidth="1.5" />;
          })}
        {moneyOut.map((v, i) => {
          const x = pad + i * step;
          const y = h - pad - (v / max) * (h - pad * 2);
          return <circle key={`out-${i}`} cx={x} cy={y} r="3" fill="#DC2626" stroke="#fff" strokeWidth="1.5" />;
        })}
      </svg>
      <div className="mt-2 flex justify-between px-1 text-xs text-muted">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div className="mt-3 flex gap-5 text-xs text-muted">
        {showIn && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-money-in" /> Money in
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-money-out" /> Money out
        </span>
      </div>
    </div>
  );
}
