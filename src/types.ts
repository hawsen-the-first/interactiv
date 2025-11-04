import { EventBus } from "./appBuilder";
import type { EventOrchestrator } from "./eventBus";
export interface EventBusRecord {
  id: string;
  eventBus: EventBus;
}
export interface EventListenerRecord {
  eventName: string;
  remove: () => void;
}

export interface PageProps {
  id: string;
  orchestrator: EventOrchestrator;
  bubbleEvents: boolean;
}

export interface ViewProps {
  id: string;
  orchestrator: EventOrchestrator;
  bubbleEvents: boolean;
}

export interface ComponentProps {
  id: string;
  orchestrator: EventOrchestrator;
  bubbleEvents: boolean;
}
