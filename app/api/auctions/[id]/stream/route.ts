/**
 * Server-Sent Events: one long-lived response per watcher.
 *
 * A snapshot is pushed the instant a bid is accepted — in-process events for
 * the memory store, Redis pub/sub for the Redis store (so a bid accepted on
 * one server instance reaches watchers connected to every other instance).
 * A slow version check every SAFETY_POLL_MS covers any missed message.
 *
 * Each stream ends after STREAM_MS so serverless functions stay within their
 * time limit; the browser's EventSource reconnects automatically.
 */
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SAFETY_POLL_MS = 2_000;
const HEARTBEAT_MS = 15_000;
const STREAM_MS = 50_000;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const first = await store.snapshot(id);
  if (!first) return new Response("Auction not found.", { status: 404 });

  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastVersion = first.auction.version;
      let sending = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      let again = false;
      const pushIfChanged = async (force = false): Promise<void> => {
        if (closed) return;
        if (sending) {
          // A bid landed while we were pushing: push once more afterwards.
          again ||= force;
          return;
        }
        sending = true;
        try {
          if (!force) {
            const v = await store.version(id);
            if (v === null || v === lastVersion) return;
          }
          const snap = await store.snapshot(id);
          if (snap && snap.auction.version !== lastVersion) {
            lastVersion = snap.auction.version;
            send("snapshot", snap);
          }
        } catch {
          // Transient store error: the next tick retries.
        } finally {
          sending = false;
          if (again) {
            again = false;
            void pushIfChanged(true);
          }
        }
      };

      // Tell the client how soon to reconnect, then send the current state.
      controller.enqueue(enc.encode("retry: 1000\n\n"));
      send("snapshot", first);

      const timers: ReturnType<typeof setInterval>[] = [];
      const unsubscribe = store.subscribe(id, () => void pushIfChanged(true));
      timers.push(setInterval(() => void pushIfChanged(), SAFETY_POLL_MS));
      timers.push(setInterval(() => send("ping", { serverNow: Date.now() }), HEARTBEAT_MS));

      cleanup = () => {
        if (closed) return;
        closed = true;
        timers.forEach(clearInterval);
        unsubscribe();
        try {
          controller.close();
        } catch {}
      };
      const end = setTimeout(cleanup, STREAM_MS);
      timers.push(end as unknown as ReturnType<typeof setInterval>);
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
