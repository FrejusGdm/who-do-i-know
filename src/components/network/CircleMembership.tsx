"use client";
import { useRouter } from "next/navigation";
import { buttonClass, fieldClass, secondaryButtonClass } from "./NetworkShell";
import { SaveFeedback, useNetworkMutation } from "./useNetworkMutation";
export function CircleMembership({
  circleId,
  people,
  removePersonId,
}: {
  circleId: string;
  people?: { id: string; name: string }[];
  removePersonId?: string;
}) {
  const { save, pending, error } = useNetworkMutation();
  const router = useRouter();
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const result = await save(`/api/circles/${circleId}/members`, "POST", {
          personId: removePersonId ?? form.get("personId"),
          member: !removePersonId,
        });
        if (result) router.refresh();
      }}
    >
      {!removePersonId && (
        <label className="block space-y-2">
          <span>Choose a person</span>
          <select
            required
            name="personId"
            className={fieldClass}
            defaultValue=""
          >
            <option value="" disabled>
              Select someone
            </option>
            {people?.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <SaveFeedback error={error} pending={pending} />
      <button
        disabled={pending || (!removePersonId && !people?.length)}
        className={removePersonId ? secondaryButtonClass : buttonClass}
      >
        {pending
          ? "Saving…"
          : removePersonId
            ? "Remove from circle"
            : "Add to circle"}
      </button>
    </form>
  );
}
