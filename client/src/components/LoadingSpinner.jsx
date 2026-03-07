export default function LoadingSpinner({ label = "Loading…" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
      <div className="w-10 h-10 border-4 border-surface-border border-t-brand rounded-full animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
