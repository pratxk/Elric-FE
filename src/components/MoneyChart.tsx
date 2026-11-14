/**
 * Money movement area chart — hand-rolled SVG (no chart dependency).
 * Two series: money in (green) and money out (red), with a soft fill.
 */

interface Props {
  labels: string[];
  moneyIn: number[];
  moneyOut: number[];
  height?: number;
}

function seriesPath(values: number[], max: number, w: number, h: number, pad: number): string {
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - (v / max) * (h - pad * 2);
    return [x, y] as const;
  });
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

export default function MoneyChart({ labels, moneyIn, moneyOut, height = 180 }: Props) {
  const w = 640;
  const h = height;
  const pad = 8;
  const max = Math.max(...moneyIn, ...moneyOut) * 1.15;
  const inPath = seriesPath(moneyIn, max, w, h, pad);
  const outPath = seriesPath(moneyOut, max, w, h, pad);
  const inArea = `${inPath} L${(w - pad).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;
  const outArea = `${outPath} L${(w - pad).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;
  const step = (w - pad * 2) / (labels.length - 1);

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Money in and out by week">
        <path d={inArea} fill="#16A34A" fillOpacity="0.08" />
        <path d={outArea} fill="#DC2626" fillOpacity="0.06" />
        <path d={inPath} fill="none" stroke="#16A34A" strokeWidth="2" strokeLinejoin="round" />
        <path d={outPath} fill="none" stroke="#DC2626" strokeWidth="2" strokeLinejoin="round" />
        {moneyIn.map((v, i) => {
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
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-money-in" /> Money in
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-money-out" /> Money out
        </span>
      </div>
    </div>
  );
}
