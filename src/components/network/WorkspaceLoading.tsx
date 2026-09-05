import { NetworkShell } from "./NetworkShell";
export function WorkspaceLoading() {
  return (
    <NetworkShell active="">
      <div role="status" aria-label="Loading your notebook">
        <div className="mb-10 h-10 w-64 rounded bg-[#e5eadd]" />
        <div className="space-y-4">
          {[1, 2, 3].map((key) => (
            <div
              key={key}
              className="h-28 rounded-lg border border-[#deded5] bg-white"
            />
          ))}
        </div>
        <span className="sr-only">Loading your notebook</span>
      </div>
    </NetworkShell>
  );
}
