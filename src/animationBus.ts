import { EventBus, EventOrchestrator } from "./eventBus";
import { logger } from "./logger";
import { generateGUID } from "../utils/generateGuid";
const log = logger;

export function useAnimations(orchestrator: EventOrchestrator) {
  // Initialize the AnimationManager
  const animationManager = new AnimationManager(orchestrator);
  return animationManager;
}

export class AnimationManager {
  private orchestrator: EventOrchestrator;
  private animationRecords: AnimationRecord[] = [];

  constructor(orchestrator: EventOrchestrator) {
    this.orchestrator = orchestrator;

    this.orchestrator.registerEventBus("animate");
    const animationBus = this.orchestrator.getEventBus("animate");
    if (animationBus) {
      this.initAnimationListeners(animationBus);
    }
  }

  private initAnimationListeners(animationBus: EventBus) {
    const me = this;
    animationBus.on("add", (e: CustomEvent<AnimationRequest>) => {
      const animationRecord: AnimationRecord = {
        id: generateGUID(),
        request: e.detail,
      };
      me.animationRecords.push(animationRecord);

      // Auto-start the animation immediately after adding it
      const { keyframes, options, target } = animationRecord.request;
      animationRecord.animation = target.animate(keyframes, options);

      // Add cleanup listeners for when animation completes
      animationRecord.animation.addEventListener("finish", () => {
        me.cleanupAnimation(animationRecord.id);
        log.trace(
          `Animation finished and cleaned up: ${animationRecord.id} (${animationRecord.request.type})`
        );
      });

      animationRecord.animation.addEventListener("cancel", () => {
        me.cleanupAnimation(animationRecord.id);
        log.trace(
          `Animation cancelled and cleaned up: ${animationRecord.id} (${animationRecord.request.type})`
        );
      });

      log.trace(
        `Animation started: ${animationRecord.id} (${animationRecord.request.type})`
      );
    });
    animationBus.on("start", (e: CustomEvent<string>) => {
      const animationRecord = me.animationRecords.filter(
        (a) => a.id === e.detail
      )[0];
      if (animationRecord && !animationRecord.animation) {
        const { keyframes, options, target } = animationRecord.request;
        animationRecord.animation = target.animate(keyframes, options);
        log.trace(`Animation manually started: ${animationRecord.id}`);
      }
    });
    animationBus.on("stop", (e: CustomEvent<string>) => {
      if (e.detail === "all") {
        for (const animationRecord of me.animationRecords) {
          if (animationRecord.animation instanceof Animation) {
            animationRecord.animation.cancel();
            log.trace(`Animation stopped: ${animationRecord.id}`);
          }
        }
        // Clean up all animations after cancelling
        me.animationRecords = [];
      } else {
        const animationRecord = me.animationRecords.filter(
          (a) => a.id === e.detail
        )[0];
        if (animationRecord?.animation) {
          animationRecord.animation.cancel();
          log.trace(`Animation stopped: ${animationRecord.id}`);
        }
        // Animation will be cleaned up by the cancel event listener
      }
    });
    animationBus.on("stopGroup", (e: CustomEvent<string>) => {
      const groupAnimations = me.animationRecords.filter(
        (ar) => ar.group === e.detail
      );
      for (const a of groupAnimations) {
        if (a.animation) {
          a.animation.cancel();
          log.trace(`Group animation stopped: ${a.id} (group: ${e.detail})`);
        }
      }
      // Animations will be cleaned up by their cancel event listeners
    });
  }

  /**
   * Remove an animation from the records array
   * This is called when an animation finishes or is cancelled
   */
  private cleanupAnimation(animationId: string): void {
    const index = this.animationRecords.findIndex((a) => a.id === animationId);
    if (index !== -1) {
      this.animationRecords.splice(index, 1);
      log.trace(`Animation record removed. Total active animations: ${this.animationRecords.length}`);
    }
  }

  /**
   * Get the current number of active animations
   */
  public getActiveAnimationCount(): number {
    return this.animationRecords.length;
  }

  /**
   * Clean up stale animation records (animations that are finished but not cleaned up)
   * This is a safety net for any animations that didn't fire their finish/cancel events
   */
  public cleanupStaleAnimations(): void {
    const beforeCount = this.animationRecords.length;
    this.animationRecords = this.animationRecords.filter((record) => {
      if (record.animation) {
        const playState = record.animation.playState;
        return playState !== "finished" && playState !== "idle";
      }
      return false; // Remove records without animation reference
    });
    const removedCount = beforeCount - this.animationRecords.length;
    if (removedCount > 0) {
      log.trace(`Cleaned up ${removedCount} stale animation records. Remaining: ${this.animationRecords.length}`);
    }
  }
}

export interface AnimationRequest {
  type: string;
  target: HTMLElement;
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
}

interface AnimationRecord {
  id: string;
  group?: string;
  request: AnimationRequest;
  animation?: Animation;
}

export function testAnimation(orchestrator: EventOrchestrator) {
  const div = document.createElement("div");
  orchestrator.enqueue("transition", "animate", "animation", {
    type: "fade",
    style: "linear",
    duration: 1000,
    target: div,
  });
}
