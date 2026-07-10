export type InterruptBehavior = "immediate" | "defer-until-idle";

export interface ScheduleConfig {
  callback: () => void;
  behavior: InterruptBehavior;
  /** Returns true when the app is considered idle (safe to interrupt). */
  isIdle: () => boolean;
  /** How often (ms) to poll isIdle() when deferring. Default: 5000 */
  pollIntervalMs?: number;
}

/**
 * Wall-clock event scheduler for BrightSign kiosks.
 *
 * Fires callbacks at the top of the hour and/or every half-hour using
 * setTimeout — it self-reschedules after each fire to stay aligned with
 * wall-clock boundaries rather than drifting.
 *
 * Two interrupt modes:
 *   'immediate'        — fires the callback immediately regardless of app state
 *   'defer-until-idle' — polls isIdle() and fires as soon as it returns true
 */
export class ScheduledEventManager {
  private hourlyTimer: ReturnType<typeof setTimeout> | null = null;
  private halfHourlyTimer: ReturnType<typeof setTimeout> | null = null;
  private deferPolls: ReturnType<typeof setInterval>[] = [];
  private destroyed = false;

  /**
   * Schedule a callback to fire at every top of the hour (:00).
   * Returns a cancel function.
   */
  scheduleAtHour(config: ScheduleConfig): () => void {
    const schedule = () => {
      if (this.destroyed) return;
      const delay = ScheduledEventManager.msUntilNextHour();
      this.hourlyTimer = setTimeout(() => {
        this._fire(config);
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      if (this.hourlyTimer !== null) {
        clearTimeout(this.hourlyTimer);
        this.hourlyTimer = null;
      }
    };
  }

  /**
   * Schedule a callback to fire at every half-hour mark (:30).
   * Returns a cancel function.
   */
  scheduleAtHalfHour(config: ScheduleConfig): () => void {
    const schedule = () => {
      if (this.destroyed) return;
      const delay = ScheduledEventManager.msUntilNextHalfHour();
      this.halfHourlyTimer = setTimeout(() => {
        this._fire(config);
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      if (this.halfHourlyTimer !== null) {
        clearTimeout(this.halfHourlyTimer);
        this.halfHourlyTimer = null;
      }
    };
  }

  /** Clear all pending timers and deferred polls. */
  destroy(): void {
    this.destroyed = true;
    if (this.hourlyTimer !== null) clearTimeout(this.hourlyTimer);
    if (this.halfHourlyTimer !== null) clearTimeout(this.halfHourlyTimer);
    this.deferPolls.forEach((id) => clearInterval(id));
    this.deferPolls = [];
  }

  /** Milliseconds until the next top-of-hour boundary. */
  static msUntilNextHour(): number {
    const now = new Date();
    const next = new Date(now);
    next.setHours(now.getHours() + 1, 0, 0, 0);
    return next.getTime() - now.getTime();
  }

  /** Milliseconds until the next :30 boundary (or :00 if already past :30). */
  static msUntilNextHalfHour(): number {
    const now = new Date();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const ms = now.getMilliseconds();

    if (minutes < 30) {
      return (30 - minutes) * 60 * 1000 - seconds * 1000 - ms;
    } else {
      return ScheduledEventManager.msUntilNextHour();
    }
  }

  private _fire(config: ScheduleConfig): void {
    if (this.destroyed) return;

    if (config.behavior === "immediate" || config.isIdle()) {
      config.callback();
      return;
    }

    const pollMs = config.pollIntervalMs ?? 5000;
    const pollId = setInterval(() => {
      if (this.destroyed) {
        clearInterval(pollId);
        return;
      }
      if (config.isIdle()) {
        clearInterval(pollId);
        this.deferPolls = this.deferPolls.filter((id) => id !== pollId);
        config.callback();
      }
    }, pollMs);
    this.deferPolls.push(pollId);
  }
}
