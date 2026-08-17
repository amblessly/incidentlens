import { EventIcon } from "@/components/icons/event-icon";
import { EVENT_META } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { IncidentEvent } from "@/lib/types";

export function Timeline({ events }: { events: IncidentEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No timeline events recorded yet.</p>
    );
  }

  return (
    <ol className="relative space-y-0 border-l border-border pl-5">
      {events.map((event) => {
        const meta = EVENT_META[event.type];
        return (
          <li key={event.id} className="relative pb-5 last:pb-0">
            <span
              className="absolute -left-[27px] flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground"
              aria-hidden
            >
              <EventIcon type={event.type} />
            </span>
            <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-x-2">
              <p className="text-sm font-medium">{meta.label}</p>
              <time className="text-xs tabular-nums text-muted-foreground">
                {formatDateTime(event.created_at)}
              </time>
              {event.run_id != null && (
                <span className="rounded border border-border bg-muted/50 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Run #{event.run_id}
                </span>
              )}
            </div>
              {event.description && (
                <p className="text-sm text-muted-foreground">{event.description}</p>
              )}
              {event.actor && (
                <p className="text-xs text-muted-foreground/70">by {event.actor}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
