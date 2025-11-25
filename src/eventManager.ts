import { logger } from "./logger";

const log = logger;

export interface PointerEventData {
  x: number;
  y: number;
  target: Element;
  originalEvent: Event;
  type: "mouse" | "touch";
}

export interface DragCallbacks {
  start?: (data: PointerEventData) => void;
  move?: (data: PointerEventData) => void;
  end?: (data: PointerEventData) => void;
}

export interface HoverCallbacks {
  enter?: (data: PointerEventData) => void;
  leave?: (data: PointerEventData) => void;
}

export interface SwipeCallbacks {
  left?: (data: PointerEventData) => void;
  right?: (data: PointerEventData) => void;
  up?: (data: PointerEventData) => void;
  down?: (data: PointerEventData) => void;
}

interface EventListenerRecord {
  element: Element;
  type: string;
  listener: EventListener;
  options?: AddEventListenerOptions;
  selector?: string; // Track which selector this listener was added for
  method?: string; // Track which EventManager method added this listener
}

interface SelectorListenerMap {
  selector: string;
  method: string;
  callback: any; // Can be Function, HoverCallbacks, DragCallbacks, SwipeCallbacks, etc.
  elements: Element[];
}

interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  element: Element;
  callbacks: DragCallbacks;
}

interface SwipeState {
  startX: number;
  startY: number;
  startTime: number;
  element: Element;
  callbacks: SwipeCallbacks;
}

export class EventManager {
  private shadowRoot: ShadowRoot;
  private abortController: AbortController;
  private eventListeners: EventListenerRecord[] = [];
  private selectorListeners = new Map<string, SelectorListenerMap>(); // Track listeners by selector+method
  private dragStates = new Map<Element, DragState>();
  private swipeStates = new Map<Element, SwipeState>();
  private longPressTimers = new Map<Element, number>();
  private componentId: string;

  constructor(shadowRoot: ShadowRoot, componentId: string) {
    this.shadowRoot = shadowRoot;
    this.componentId = componentId;
    this.abortController = new AbortController();
  }

  /**
   * Unified point interaction - handles both click and tap
   */
  public point(selector: string, callback: (data: PointerEventData) => void): void {
    log.trace(`EventManager.point() called for selector: ${selector} in component: ${this.componentId}`);

    // Check if we already have listeners for this selector+method combination
    const key = `point:${selector}`;
    const existing = this.selectorListeners.get(key);

    if (existing) {
      const currentElements = Array.from(this.shadowRoot.querySelectorAll(selector));
      const elementsChanged =
        existing.elements.length !== currentElements.length ||
        existing.elements.some((el, i) => el !== currentElements[i]);

      if (!elementsChanged) {
        log.trace(`Point listeners already exist for selector: ${selector}, elements unchanged, skipping duplicate`);
        return;
      } else {
        log.trace(`DOM elements changed for selector: ${selector}, clearing old listeners and re-attaching`);
        // Elements changed, clear old listeners
        this.clearSelectorListeners(selector, "point");
      }
    }

    const elements = this.shadowRoot.querySelectorAll(selector);
    log.trace(`Found ${elements.length} elements for selector: ${selector}`);

    // Store the selector listener mapping
    this.selectorListeners.set(key, {
      selector,
      method: "point",
      callback,
      elements: Array.from(elements),
    });

    elements.forEach((element) => {
      // Handle mouse click
      this.addEventListenerWithTracking(
        element,
        "click",
        (e: Event) => {
          const mouseEvent = e as MouseEvent;
          mouseEvent.preventDefault();
          const data = this.createPointerEventData(mouseEvent, "mouse");
          callback(data);
        },
        undefined,
        selector,
        "point"
      );

      // Handle touch tap (short touch)
      let touchStartTime = 0;
      let pixelStartX: number, pixelStartY: number;
      this.addEventListenerWithTracking(
        element,
        "touchstart",
        (e: Event) => {
          log.trace("Touch event ", e);
          const touchEvent = e as TouchEvent;
          pixelStartX = touchEvent.changedTouches[0]?.clientX;
          pixelStartY = touchEvent.changedTouches[0]?.clientY;
          touchStartTime = Date.now();
        },
        { passive: true },
        selector,
        "point"
      );

      this.addEventListenerWithTracking(
        element,
        "touchend",
        (e: Event) => {
          const touchEvent = e as TouchEvent;
          const touchDuration = Date.now() - touchStartTime;
          log.trace("Touch event ", e);

          if (
            touchDuration < 300 &&
            !this.movementThresholdMet(
              pixelStartX,
              pixelStartY,
              touchEvent.changedTouches[0].clientX,
              touchEvent.changedTouches[0].clientY
            )
          ) {
            // Short tap
            touchEvent.preventDefault();
            const data = this.createPointerEventData(touchEvent, "touch");
            callback(data);
          }
        },
        undefined,
        selector,
        "point"
      );
    });

    log.trace(`Point listeners added for selector: ${selector}`, {
      componentId: this.componentId,
    });
  }

  /**
   * Un-point interaction - handles touch and click events on the background to de-select an active element
   */
  public unpoint(selector: string, callback: (data: PointerEventData) => void): void {
    const body = document.querySelector("body") as Element;
    const key = `unpoint:${selector}`;

    // Store the selector listener mapping
    this.selectorListeners.set(key, {
      selector,
      method: "unpoint",
      callback,
      elements: [body],
    });

    this.addEventListenerWithTracking(
      body,
      "click",
      (e: Event) => {
        const mouseEvent = e as MouseEvent;
        mouseEvent.preventDefault();
        const data = this.createPointerEventData(mouseEvent, "mouse");
        callback(data);
      },
      { once: true },
      selector,
      "point"
    );

    // Handle touch tap (short touch)
    let touchStartTime = 0;

    this.addEventListenerWithTracking(
      body,
      "touchstart",
      (_: Event) => {
        touchStartTime = Date.now();
      },
      { passive: true, once: true },
      selector,
      "point"
    );

    this.addEventListenerWithTracking(
      body,
      "touchend",
      (e: Event) => {
        const touchEvent = e as TouchEvent;
        const touchDuration = Date.now() - touchStartTime;
        if (touchDuration < 300) {
          // Short tap
          touchEvent.preventDefault();
          const data = this.createPointerEventData(touchEvent, "touch");
          callback(data);
        }
      },
      { once: true },
      selector,
      "point"
    );
    log.trace(`Un-Point listeners added for selector: ${selector}`, {
      componentId: this.componentId,
    });
  }

  /**
   * Drag interaction - handles both mouse drag and touch drag
   */
  public drag(selector: string, callbacks: DragCallbacks): void {
    const elements = this.shadowRoot.querySelectorAll(selector);

    elements.forEach((element) => {
      // Mouse drag
      this.addEventListener(element, "mousedown", (e: Event) => {
        this.startDrag(element, e as MouseEvent, "mouse", callbacks);
      });

      // Touch drag
      this.addEventListener(
        element,
        "touchstart",
        (e: Event) => {
          this.startDrag(element, e as TouchEvent, "touch", callbacks);
        },
        { passive: false }
      );
    });

    // Global mouse move and up listeners
    this.addEventListener(document, "mousemove", (e: Event) => {
      this.handleDragMove(e as MouseEvent, "mouse");
    });

    this.addEventListener(document, "mouseup", (e: Event) => {
      this.handleDragEnd(e as MouseEvent, "mouse");
    });

    // Global touch move and end listeners
    this.addEventListener(
      document,
      "touchmove",
      (e: Event) => {
        this.handleDragMove(e as TouchEvent, "touch");
      },
      { passive: false }
    );

    this.addEventListener(document, "touchend", (e: Event) => {
      this.handleDragEnd(e as TouchEvent, "touch");
    });

    log.trace(`Drag listeners added for selector: ${selector}`, {
      componentId: this.componentId,
    });
  }

  /**
   * Hover interaction - mouse enter/leave with touch fallback
   */
  public hover(selector: string, callbacks: HoverCallbacks): void {
    // Check if we already have listeners for this selector+method combination
    const key = `hover:${selector}`;
    if (this.selectorListeners.has(key)) {
      log.trace(`Hover listeners already exist for selector: ${selector}, skipping duplicate`, {
        componentId: this.componentId,
      });
      return;
    }

    const elements = this.shadowRoot.querySelectorAll(selector);

    // Store the selector listener mapping
    this.selectorListeners.set(key, {
      selector,
      method: "hover",
      callback: callbacks,
      elements: Array.from(elements),
    });

    elements.forEach((element) => {
      this.addEventListenerWithTracking(
        element,
        "mouseenter",
        (e: Event) => {
          if (callbacks.enter) {
            const data = this.createPointerEventData(e as MouseEvent, "mouse");
            callbacks.enter(data);
          }
        },
        undefined,
        selector,
        "hover"
      );

      this.addEventListenerWithTracking(
        element,
        "mouseleave",
        (e: Event) => {
          if (callbacks.leave) {
            const data = this.createPointerEventData(e as MouseEvent, "mouse");
            callbacks.leave(data);
          }
        },
        undefined,
        selector,
        "hover"
      );

      // Touch fallback - simulate hover with touch
      this.addEventListenerWithTracking(
        element,
        "touchstart",
        (e: Event) => {
          if (callbacks.enter) {
            const data = this.createPointerEventData(e as TouchEvent, "touch");
            callbacks.enter(data);
          }
        },
        { passive: true },
        selector,
        "hover"
      );
    });

    log.trace(`Hover listeners added for selector: ${selector}`, {
      componentId: this.componentId,
    });
  }

  /**
   * Long press interaction - works for both mouse and touch
   */
  public longPress(selector: string, callback: (data: PointerEventData) => void, duration: number = 500): void {
    const elements = this.shadowRoot.querySelectorAll(selector);

    elements.forEach((element) => {
      // Mouse long press
      this.addEventListener(element, "mousedown", (e: Event) => {
        this.startLongPress(element, e as MouseEvent, "mouse", callback, duration);
      });

      this.addEventListener(element, "mouseup", () => {
        this.cancelLongPress(element);
      });

      this.addEventListener(element, "mouseleave", () => {
        this.cancelLongPress(element);
      });

      // Touch long press
      this.addEventListener(
        element,
        "touchstart",
        (e: Event) => {
          this.startLongPress(element, e as TouchEvent, "touch", callback, duration);
        },
        { passive: true }
      );

      this.addEventListener(element, "touchend", () => {
        this.cancelLongPress(element);
      });

      this.addEventListener(element, "touchcancel", () => {
        this.cancelLongPress(element);
      });
    });

    log.trace(`Long press listeners added for selector: ${selector}`, {
      componentId: this.componentId,
    });
  }

  /**
   * Swipe gesture detection
   */
  public swipe(selector: string, callbacks: SwipeCallbacks, threshold: number = 50): void {
    const elements = this.shadowRoot.querySelectorAll(selector);

    elements.forEach((element) => {
      // Touch swipe
      this.addEventListener(
        element,
        "touchstart",
        (e: Event) => {
          this.startSwipe(element, e as TouchEvent, callbacks);
        },
        { passive: true }
      );

      this.addEventListener(element, "touchend", (e: Event) => {
        this.endSwipe(element, e as TouchEvent, callbacks, threshold);
      });

      // Mouse swipe (drag-based)
      this.addEventListener(element, "mousedown", (e: Event) => {
        this.startSwipe(element, e as MouseEvent, callbacks);
      });

      this.addEventListener(document, "mouseup", (e: Event) => {
        this.endSwipe(element, e as MouseEvent, callbacks, threshold);
      });
    });

    log.trace(`Swipe listeners added for selector: ${selector}`, {
      componentId: this.componentId,
    });
  }

  /**
   * Add a custom event listener with automatic cleanup
   */
  public addEventListener(
    element: Element | Document,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions
  ): void {
    const finalOptions = {
      ...options,
      signal: this.abortController.signal,
    };

    element.addEventListener(type, listener, finalOptions);

    this.eventListeners.push({
      element: element as Element,
      type,
      listener,
      options: finalOptions,
    });
  }

  /**
   * Add an event listener with tracking for selector and method
   */
  private addEventListenerWithTracking(
    element: Element | Document,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
    selector?: string,
    method?: string
  ): void {
    const finalOptions = {
      ...options,
      signal: this.abortController.signal,
    };

    element.addEventListener(type, listener, finalOptions);

    this.eventListeners.push({
      element: element as Element,
      type,
      listener,
      options: finalOptions,
      selector,
      method,
    });
  }

  /**
   * Remove a specific event listener
   */
  public removeEventListener(element: Element, type: string, listener: EventListener): void {
    element.removeEventListener(type, listener);

    const index = this.eventListeners.findIndex(
      (record) => record.element === element && record.type === type && record.listener === listener
    );

    if (index !== -1) {
      this.eventListeners.splice(index, 1);
    }
  }

  /**
   * Clean up listeners for a specific selector and method
   */
  public clearSelectorListeners(selector: string, method: string): void {
    const key = `${method}:${selector}`;
    if (this.selectorListeners.has(key)) {
      // Remove from tracking
      this.selectorListeners.delete(key);

      // Remove actual event listeners for this selector+method
      this.eventListeners = this.eventListeners.filter((record) => {
        if (record.selector === selector && record.method === method) {
          // Remove the actual event listener
          record.element.removeEventListener(record.type, record.listener);
          return false; // Remove from array
        }
        return true; // Keep in array
      });

      log.trace(`Cleared listeners for selector: ${selector}, method: ${method}`, { componentId: this.componentId });
    }
  }

  /**
   * Clean up all event listeners
   */
  public destroy(): void {
    this.abortController.abort();
    this.eventListeners.length = 0;
    this.selectorListeners.clear();
    this.dragStates.clear();
    this.swipeStates.clear();

    // Clear any pending long press timers
    this.longPressTimers.forEach((timerId) => clearTimeout(timerId));
    this.longPressTimers.clear();

    log.trace(`EventManager destroyed for component: ${this.componentId}`);
  }

  // Private helper methods

  private createPointerEventData(event: MouseEvent | TouchEvent, type: "mouse" | "touch"): PointerEventData {
    let x: number, y: number;

    if (type === "touch" && "touches" in event) {
      const touch = event.touches[0] || event.changedTouches[0];
      x = touch.clientX;
      y = touch.clientY;
    } else if ("clientX" in event) {
      x = event.clientX;
      y = event.clientY;
    } else {
      x = 0;
      y = 0;
    }

    return {
      x,
      y,
      target: event.target as Element,
      originalEvent: event,
      type,
    };
  }

  private startDrag(
    element: Element,
    event: MouseEvent | TouchEvent,
    type: "mouse" | "touch",
    callbacks: DragCallbacks
  ): void {
    const data = this.createPointerEventData(event, type);

    const dragState: DragState = {
      isDragging: true,
      startX: data.x,
      startY: data.y,
      element,
      callbacks,
    };

    this.dragStates.set(element, dragState);

    if (callbacks.start) {
      callbacks.start(data);
    }

    event.preventDefault();
  }

  private handleDragMove(event: MouseEvent | TouchEvent, type: "mouse" | "touch"): void {
    this.dragStates.forEach((dragState, _) => {
      if (dragState.isDragging && dragState.callbacks.move) {
        const data = this.createPointerEventData(event, type);
        dragState.callbacks.move(data);
      }
    });
  }

  private handleDragEnd(event: MouseEvent | TouchEvent, type: "mouse" | "touch"): void {
    this.dragStates.forEach((dragState, element) => {
      if (dragState.isDragging) {
        dragState.isDragging = false;

        if (dragState.callbacks.end) {
          const data = this.createPointerEventData(event, type);
          dragState.callbacks.end(data);
        }

        this.dragStates.delete(element);
      }
    });
  }
  private movementThresholdMet(startX: number, startY: number, endX: number, endY: number) {
    const movementThreshold: number = 5; // Default movement threshold in pixels
    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
    return distance > movementThreshold;
  }
  private startLongPress(
    element: Element,
    event: MouseEvent | TouchEvent,
    type: "mouse" | "touch",
    callback: (data: PointerEventData) => void,
    duration: number
  ): void {
    this.cancelLongPress(element); // Cancel any existing timer

    const timerId = window.setTimeout(() => {
      const data = this.createPointerEventData(event, type);
      callback(data);
      this.longPressTimers.delete(element);
    }, duration);

    this.longPressTimers.set(element, timerId);
  }

  private cancelLongPress(element: Element): void {
    const timerId = this.longPressTimers.get(element);
    if (timerId) {
      clearTimeout(timerId);
      this.longPressTimers.delete(element);
    }
  }

  private startSwipe(element: Element, event: MouseEvent | TouchEvent, callbacks: SwipeCallbacks): void {
    const data = this.createPointerEventData(event, "touch");

    const swipeState: SwipeState = {
      startX: data.x,
      startY: data.y,
      startTime: Date.now(),
      element,
      callbacks,
    };

    this.swipeStates.set(element, swipeState);
  }

  private endSwipe(
    element: Element,
    event: MouseEvent | TouchEvent,
    callbacks: SwipeCallbacks,
    threshold: number
  ): void {
    const swipeState = this.swipeStates.get(element);
    if (!swipeState) return;

    const data = this.createPointerEventData(event, "touch");
    const deltaX = data.x - swipeState.startX;
    const deltaY = data.y - swipeState.startY;
    const deltaTime = Date.now() - swipeState.startTime;

    // Only consider it a swipe if it was fast enough (< 300ms) and moved enough
    if (deltaTime < 300 && (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold)) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (deltaX > 0 && callbacks.right) {
          callbacks.right(data);
        } else if (deltaX < 0 && callbacks.left) {
          callbacks.left(data);
        }
      } else {
        // Vertical swipe
        if (deltaY > 0 && callbacks.down) {
          callbacks.down(data);
        } else if (deltaY < 0 && callbacks.up) {
          callbacks.up(data);
        }
      }
    }

    this.swipeStates.delete(element);
  }
}
