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
      } else {
        const animationRecord = me.animationRecords.filter(
          (a) => a.id === e.detail
        )[0];
        if (animationRecord?.animation) {
          animationRecord.animation.cancel();
          log.trace(`Animation stopped: ${animationRecord.id}`);
        }
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
    });
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
