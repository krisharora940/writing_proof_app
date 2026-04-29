import type { Snapshot, WritingEvent } from "./writing-events";

export type ReplayFrame = {
  at: number;
  text: string;
  eventId: string | null;
  eventType: WritingEvent["type"] | "start";
  label: string;
};

export function reconstructReplay(snapshots: Snapshot[], events: WritingEvent[]): ReplayFrame[] {
  const orderedSnapshots = [...snapshots].sort((a, b) => a.at - b.at);
  const orderedEvents = [...events].sort((a, b) => a.at - b.at);
  const firstSnapshot = orderedSnapshots[0] || { at: Date.now(), text: "" };
  let currentText = firstSnapshot.text;

  const frames: ReplayFrame[] = [
    {
      at: firstSnapshot.at,
      text: currentText,
      eventId: null,
      eventType: "start",
      label: "Draft started"
    }
  ];

  orderedEvents.forEach((event) => {
    currentText = applyEvent(currentText, event);

    const checkpoint = orderedSnapshots.find((snapshot) => snapshot.at === event.at);
    if (checkpoint) currentText = checkpoint.text;

    frames.push({
      at: event.at,
      text: currentText,
      eventId: event.id,
      eventType: event.type,
      label: describeReplayEvent(event)
    });
  });

  return frames;
}

function applyEvent(currentText: string, event: WritingEvent) {
  if (event.type === "submit") return currentText;
  if (typeof event.start !== "number") return currentText;

  const removed = event.removed || "";
  const added = event.added || "";
  return `${currentText.slice(0, event.start)}${added}${currentText.slice(event.start + removed.length)}`;
}

function describeReplayEvent(event: WritingEvent) {
  if (event.type === "submit") {
    return `Submitted${event.words ? ` with ${event.words} words` : ""}`;
  }

  if (event.type === "paste") {
    const words = event.pasteWords || event.addedWords || 0;
    return `Paste${words ? `, ${words} words inserted` : ""}`;
  }

  if (event.type === "delete") {
    const characters = event.removedCharacters || event.removed?.length || 0;
    return `Delete${characters ? `, ${characters} characters removed` : ""}`;
  }

  const words = event.addedWords || 0;
  return `Insert${words ? `, ${words} words added` : ""}`;
}
