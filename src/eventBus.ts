import { logger } from "./logger.js";
import type { EventBusRecord, EventListenerRecord } from "./types.js";
import { Store } from "./stateManager.js";
import { generateGUID } from "../utils/generateGuid.js";
const log = logger;

export class EventBus<DetailType = any> {
  private eventTarget: EventTarget;
  private activeListeners: EventListenerRecord[] = [];
  private id: string;
  constructor(description = "event-bus") {
    this.eventTarget = document.appendChild(document.createComment(description));
    this.id = description;
  }
  on(type: string, listener: (event: CustomEvent<DetailType>) => void) {
    log.trace("Listener added", { type, listener });
    try {
      //this.validateNewListener(type);
      const abortController = new AbortController();
      this.eventTarget.addEventListener(type, listener as EventListener, {
        signal: abortController.signal,
      });
      this.activeListeners.push({
        eventName: type,
        remove: () => abortController.abort(),
      });
    } catch (error: any) {
      log.error(error.message, error as Error);
    }
  }

  once(type: string, listener: (event: CustomEvent<DetailType>) => void) {
    try {
      //this.validateNewListener(type);
      const abortController = new AbortController();
      this.eventTarget.addEventListener(type, listener as EventListener, {
        once: true,
        signal: abortController.signal,
      });
      this.activeListeners.push({
        eventName: type,
        remove: () => abortController.abort(),
      });
    } catch (error: any) {
      log.error(error.message, error as Error);
    }
  }

  remove(type: string): void {
    const listenersToRemove = this.activeListeners.filter((l) => l.eventName === type);
    
    if (listenersToRemove.length === 0) {
      log.warn(`No listener found for event type: ${type} on Event Bus ${this.id}`);
      return;
    }

    // Remove all listeners of this type
    listenersToRemove.forEach((listener) => {
      listener.remove();
    });

    // Clean up the activeListeners array
    this.activeListeners = this.activeListeners.filter((l) => l.eventName !== type);
    
    log.trace(`Event listener(s) ${type} removed from Event Bus ${this.id}. Remaining listeners: ${this.activeListeners.length}`);
  }

  /**
   * Remove all listeners for this event bus
   */
  removeAll(): void {
    this.activeListeners.forEach((listener) => {
      listener.remove();
    });
    this.activeListeners = [];
    log.trace(`All event listeners removed from Event Bus ${this.id}`);
  }

  /**
   * Get the count of active listeners
   */
  getListenerCount(): number {
    return this.activeListeners.length;
  }

  /**
   * Destroy this event bus and clean up all listeners
   */
  destroy(): void {
    this.removeAll();
    // Remove the comment node from DOM if it has a parent
    if (this.eventTarget instanceof Node && this.eventTarget.parentNode) {
      this.eventTarget.parentNode.removeChild(this.eventTarget);
    }
    log.trace(`Event Bus ${this.id} destroyed`);
  }

  emit(type: string, detail?: DetailType) {
    // Check if there are any listeners before dispatching
    if (this.activeListeners.filter((l) => l.eventName === type).length === 0) {
      log.trace(`Event Bus [${this.id}]: No listeners registered for event "${type}", skipping dispatch.`);
      return true; // Return true to indicate the event was "handled" (just not dispatched)
    }
    
    return this.eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
  }

  // private validateNewListener(type: string): void {
  //   // Allow multiple listeners for the same event type
  //   // This validation is too restrictive for our use case
  //   // Components may need to register multiple listeners for the same event
  //   return;
  // }
}

export class EventOrchestrator {
  private eventBuses: EventBusRecord[] = [];
  private eventQueue: ApplicationEventQueueItem[] = [];
  private abortCommand: boolean = false;
  private globalStateStore: Store;
  private stateEventBus: EventBus;

  constructor() {
    this.run();
    this.globalStateStore = new Store({});
    this.stateEventBus = this.registerEventBus("stateEvent");
    this.stateEventBus.on("stateUpdate", (data) => {
      this.globalStateStore.mutateStore(data.detail.id, data.detail.payload);
    });
  }
  run() {
    const processQueue = () => {
      if (this.abortCommand) return;

      if (this.eventQueue.length > 0) {
        this.processNextQueueItem();
        // Process immediately if there are more events
        if (this.eventQueue.length > 0) {
          requestAnimationFrame(processQueue);
        }
      }

      // Always schedule the next check
      if (!this.abortCommand) {
        requestAnimationFrame(processQueue);
      }
    };

    // Start the processing loop
    requestAnimationFrame(processQueue);
  }
  registerEventBus<T>(name: string): EventBus<T> {
    const eventBus = new EventBus<T>(name);
    this.eventBuses.push({ id: name, eventBus: eventBus });
    return eventBus;
  }

  getEventBus(name: string): EventBus | null {
    const busRecord = this.eventBuses.find((b) => b.id === name);
    return busRecord ? busRecord.eventBus : null;
  }
  enqueue(
    event: string,
    forBus: string,
    priority: string = "default",
    params?: unknown,
    scheduleFor?: number,
    expiry?: number
  ) {
    // For navigation events, remove any existing pending navigation events to prevent lag
    if (forBus === "navigation-manager" && (event === "navigate-to-page" || event === "navigate-to-view")) {
      this.removeQueuedNavigationEvents(event, forBus);
    }

    const item = new ApplicationEventQueueItem(forBus, event, priority, scheduleFor, expiry, params);
    this.eventQueue.push(item);
    return item.instanceIdentifier;
  }
  getQueuedEventById(id: string): ApplicationEventQueueItem {
    return this.eventQueue.filter((e) => e.instanceIdentifier === id)[0];
  }

  private removeQueuedNavigationEvents(eventId: string, eventBusId: string): void {
    // Remove all queued navigation events of the same type from the queue
    // This prevents lag when rapidly switching between views/pages
    this.eventQueue = this.eventQueue.filter((item) => !(item.eventBusId === eventBusId && item.eventId === eventId));
  }
  rescheduleQueuedEvent(id: string, newSchedule: number): void {
    this.eventQueue.filter((e) => e.instanceIdentifier === id)[0].scheduleFor = newSchedule;
  }
  destroy() {
    this.abortCommand = true;
  }

  useGlobalState(initalValue: any) {
    const id = generateGUID();
    const setter = (newValue: any) => {
      this.enqueue("stateUpdate", "stateEvent", "immediate", {
        id,
        payload: newValue,
      });
    };
    setter(initalValue);
    return [this.globalStateStore.getStateObject()[id], setter];
  }

  private processNextQueueItem() {
    const nextEvent = this.getPrioritisedEventFromQueue();
    if (nextEvent) {
      const filteredBusses = this.eventBuses.filter((b) => b.id === nextEvent.eventBusId);
      if (filteredBusses.length >= 1) {
        filteredBusses[0].eventBus.emit(nextEvent.eventId, nextEvent.params || {});
      }
    }
  }

  private getPrioritisedEventFromQueue() {
    const currentTime = Date.now();

    // Filter out expired events and scheduled events that haven't reached their scheduled time yet
    const availableEvents = this.eventQueue.filter((event) => {
      // Remove expired events
      if (event.expiry && event.expiry <= currentTime) {
        log.trace(`Event expired and removed from queue: ${event.eventId} on bus ${event.eventBusId}`);
        return false;
      }
      
      // Check scheduled events
      if (event.priority === "scheduled") {
        return event.scheduleFor <= currentTime;
      }
      return true;
    });

    if (availableEvents.length === 0) {
      return null;
    }

    // Sort by priority, then by FIFO (earliest scheduleFor time first within each priority group)
    availableEvents.sort((a, b) => {
      // Define priority order
      const priorityOrder: { [key: string]: number } = {
        scheduled: 1,
        immediate: 2,
        animation: 3,
        default: 4,
      };

      const aPriority = priorityOrder[a.priority] || 4; // Default to 4 if priority not found
      const bPriority = priorityOrder[b.priority] || 4;

      // First sort by priority
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }

      // Within same priority group, sort by FIFO (earliest scheduleFor first)
      return a.scheduleFor - b.scheduleFor;
    });

    // Get the highest priority event
    const nextEvent = availableEvents[0];

    // Remove it from the original queue
    const eventIndex = this.eventQueue.indexOf(nextEvent);
    if (eventIndex > -1) {
      this.eventQueue.splice(eventIndex, 1);
    }

    return nextEvent;
  }

  /**
   * Clean up expired events from the queue
   * This is a safety net for expired events that weren't processed
   */
  public cleanupExpiredEvents(): number {
    const currentTime = Date.now();
    const beforeCount = this.eventQueue.length;
    
    this.eventQueue = this.eventQueue.filter((event) => {
      if (event.expiry && event.expiry <= currentTime) {
        log.trace(`Expired event cleaned up: ${event.eventId} on bus ${event.eventBusId}`);
        return false;
      }
      return true;
    });
    
    const removedCount = beforeCount - this.eventQueue.length;
    if (removedCount > 0) {
      log.trace(`Cleaned up ${removedCount} expired events. Remaining queue size: ${this.eventQueue.length}`);
    }
    return removedCount;
  }

  /**
   * Get the current size of the event queue
   */
  public getQueueSize(): number {
    return this.eventQueue.length;
  }

  /**
   * Get the count of registered event buses
   */
  public getEventBusCount(): number {
    return this.eventBuses.length;
  }

  /**
   * Get total listener count across all event buses
   */
  public getTotalListenerCount(): number {
    return this.eventBuses.reduce((total, busRecord) => {
      return total + busRecord.eventBus.getListenerCount();
    }, 0);
  }

  /**
   * Navigate to a page with optional transition configuration
   * 
   * @param pageId - The ID of the page to navigate to
   * @param config - Optional transition configuration
   * @param priority - Event priority: "immediate", "normal", or "low" (default: "immediate")
   */
  public navigateToPage(
    pageId: string,
    config?: {
      type: "slide" | "fade" | "scale" | "flip" | "snap" | "custom";
      direction?: "left" | "right" | "up" | "down";
      duration?: number;
      easing?: string;
      customCSS?: string;
    },
    priority: string = "immediate"
  ): void {
    this.enqueue("navigate-to-page", "navigation-manager", priority, { 
      pageId, 
      config: config || { type: "snap" } 
    });
  }

  /**
   * Navigate to a view with optional transition configuration
   * 
   * @param viewId - The ID of the view to navigate to
   * @param config - Optional transition configuration
   * @param priority - Event priority: "immediate", "normal", or "low" (default: "immediate")
   */
  public navigateToView(
    viewId: string,
    config?: {
      type: "slide" | "fade" | "scale" | "flip" | "snap" | "custom";
      direction?: "left" | "right" | "up" | "down";
      duration?: number;
      easing?: string;
      customCSS?: string;
    },
    priority: string = "immediate"
  ): void {
    this.enqueue("navigate-to-view", "navigation-manager", priority, { 
      viewId, 
      config: config || { type: "snap" } 
    });
  }
}
class ApplicationEventQueueItem {
  public instanceIdentifier: string;
  public eventBusId: string;
  public eventId: string;
  public priority: string;
  public scheduleFor: number;
  public expiry?: number;
  public params?: unknown;

  constructor(
    eventBusId: string,
    eventId: string,
    priority: string = "default",
    scheduleFor: number = Date.now(),
    expiry?: number,
    params?: unknown
  ) {
    this.instanceIdentifier = generateGUID();
    this.eventBusId = eventBusId;
    this.eventId = eventId;
    this.priority = priority;
    this.scheduleFor = scheduleFor;
    this.expiry = expiry;
    this.params = params;
  }
}

export function createOrchestrator() {
  return new EventOrchestrator();
}
