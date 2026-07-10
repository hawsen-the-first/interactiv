import { EventBus, EventOrchestrator } from "./eventBus.js";

export type MediaPriority = "idle" | "user" | "scheduled";
export type MediaType = "audio" | "video";

export interface MediaItem {
  src: string;
  type: MediaType;
  priority: MediaPriority;
  onEnd?: () => void;
  id?: string;
}

export interface MediaQueueElements {
  audio: HTMLAudioElement;
  video: HTMLVideoElement;
}

export interface MediaQueueEvent {
  type: "playback-started" | "playback-ended" | "playback-stopped";
  item: MediaItem | null;
}

const PRIORITY_ORDER: Record<MediaPriority, number> = {
  idle: 0,
  user: 1,
  scheduled: 2,
};

/**
 * Priority-aware media controller for BrightSign kiosks.
 *
 * Accepts injected audio and video elements (created and owned by the
 * consuming app) and enforces a priority ordering: idle < user < scheduled.
 * A higher-priority play() call immediately interrupts whatever is below it.
 *
 * Both 'ended' and 'error' events advance the queue, so a missing or
 * corrupt file skips rather than freezing playback.
 */
export class MediaQueue {
  private audioEl: HTMLAudioElement;
  private videoEl: HTMLVideoElement;
  private eventBus: EventBus<MediaQueueEvent>;

  private currentItem: MediaItem | null = null;
  private cleanupListeners: (() => void) | null = null;

  constructor(elements: MediaQueueElements, orchestrator: EventOrchestrator) {
    this.audioEl = elements.audio;
    this.videoEl = elements.video;
    this.eventBus = orchestrator.registerEventBus<MediaQueueEvent>(
      "mediaqueue-events",
    );
  }

  play(item: MediaItem): void {
    const incoming = PRIORITY_ORDER[item.priority];
    const current = this.currentItem
      ? PRIORITY_ORDER[this.currentItem.priority]
      : -1;

    if (incoming < current) return;

    this._stopCurrent();
    this.currentItem = item;

    const el = item.type === "audio" ? this.audioEl : this.videoEl;
    el.src = item.src;
    el.load();

    // settled prevents double-firing if both 'ended' and 'error' trigger,
    // and prevents advance() running after a manual stop().
    let settled = false;

    const advance = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener("ended", advance);
      el.removeEventListener("error", advance);
      this.cleanupListeners = null;

      const ended = this.currentItem;
      this.currentItem = null;

      this.eventBus.emit("playback-ended", {
        type: "playback-ended",
        item: ended ?? null,
      });
      ended?.onEnd?.();
    };

    this.cleanupListeners = () => {
      settled = true;
      el.removeEventListener("ended", advance);
      el.removeEventListener("error", advance);
    };

    el.addEventListener("ended", advance);
    el.addEventListener("error", advance);

    el.play().catch(() => {
      // play() rejection is handled by the 'error' event listener above
    });

    this.eventBus.emit("playback-started", { type: "playback-started", item });
  }

  /**
   * Stop playback. If atOrBelow is provided, only stops if the current
   * item's priority is ≤ that level — a 'scheduled' item cannot be
   * cancelled by an 'idle' stop call.
   */
  stop(atOrBelow?: MediaPriority): void {
    if (!this.currentItem) return;

    if (atOrBelow !== undefined) {
      const ceiling = PRIORITY_ORDER[atOrBelow];
      const current = PRIORITY_ORDER[this.currentItem.priority];
      if (current > ceiling) return;
    }

    const stopped = this.currentItem;
    this._stopCurrent();
    this.currentItem = null;

    this.eventBus.emit("playback-stopped", {
      type: "playback-stopped",
      item: stopped ?? null,
    });
  }

  isPlaying(): boolean {
    return this.currentItem !== null;
  }

  getCurrentPriority(): MediaPriority | null {
    return this.currentItem?.priority ?? null;
  }

  getCurrentItem(): MediaItem | null {
    return this.currentItem;
  }

  getEventBus(): EventBus<MediaQueueEvent> {
    return this.eventBus;
  }

  destroy(): void {
    this._stopCurrent();
    this.currentItem = null;
    this.eventBus.removeAll();
  }

  private _stopCurrent(): void {
    this.cleanupListeners?.();
    this.cleanupListeners = null;

    if (this.currentItem) {
      const el =
        this.currentItem.type === "audio" ? this.audioEl : this.videoEl;
      if (!el.paused) el.pause();
      el.src = "";
      el.load();
    }
  }
}
