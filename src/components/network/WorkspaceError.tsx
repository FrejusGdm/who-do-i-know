"use client";
import { NetworkShell, secondaryButtonClass } from "./NetworkShell";
export function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <NetworkShell active="">
      <section className="max-w-xl rounded-lg border border-[#deded5] bg-white p-7">
        <h1 className="font-serif text-3xl text-balance">
          Your notebook couldn’t load
        </h1>
        <p className="mt-3 text-pretty leading-7 text-[#62685e]">
          The connection may have been interrupted. Try again in a moment.
        </p>
        <button className={`${secondaryButtonClass} mt-5`} onClick={reset}>
          Try again
        </button>
      </section>
    </NetworkShell>
  );
}
