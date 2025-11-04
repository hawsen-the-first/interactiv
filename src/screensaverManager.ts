import { EventBus, EventOrchestrator } from "./eventBus";
import { View } from "./appBuilder";
import { NavigationManager, type TransitionConfig } from "./navigationManager";
import { stateManager } from "./stateManager";
import { Logger } from "../utils/logger";

const log = new Logger();

export interface ScreensaverConfig {
  timeoutSeconds: number;
  view: View;
  transitionConfig?: TransitionConfig;
  exitBehavior?: "reset" | "return"; // Default: 'reset'
  startingViewId?: string; // Required when exitBehavior is 'reset'
  activityEvents?: string[]; // Custom events to monitor
  excludeSelectors?: string[]; // Elements to ignore for activity
  activateCallback?: () => void;
  deactivateCallback?: () => void;
  blockerCallback?: () => boolean;
  rebootTimeout?: number | null;
  rebootCallback?: () => void;
}

export class ScreensaverManager {
  private eventBus: EventBus;
  private orchestrator: EventOrchestrator;
  private navigationManager: NavigationManager;
  private config: ScreensaverConfig | null = null;
  private activityTimer: number | null = null;
  private rebootCheckInterval: number | null = null;
  private isScreensaverActive: boolean = false;
  private lastActiveViewId: string | null = null;
  private globalListeners: Array<{
    element: EventTarget;
    type: string;
    listener: EventListener;
  }> = [];

  // Default activity events to monitor
  private readonly DEFAULT_ACTIVITY_EVENTS = [
    "mousemove",
    "mousedown",
    "click",
    "keydown",
    "keypress",
    "touchstart",
    "touchmove",
    "wheel",
    "scroll",
  ];

  constructor(orchestrator: EventOrchestrator, navigationManager: NavigationManager) {
    this.orchestrator = orchestrator;
    this.navigationManager = navigationManager;
    this.eventBus = orchestrator.registerEventBus("screensaver-manager");

    this.setupEventListeners();
    this.initializeGlobalState();
  }

  private initializeGlobalState(): void {
    if (!stateManager.has("screensaver.isActive")) {
      stateManager.set("screensaver.isActive", false);
    }
    if (!stateManager.has("screensaver.lastActiveViewId")) {
      stateManager.set("screensaver.lastActiveViewId", null);
    }
    if (!stateManager.has("lastReboot")) {
      stateManager.set("lastReboot", Date.now());
    }
  }

  private setupEventListeners(): void {
    this.eventBus.on("register-screensaver", (e) => {
      const { config } = e.detail;
      this.registerScreensaver(config);
    });

    this.eventBus.on("activate-screensaver", () => {
      this.activateScreensaver();
    });

    this.eventBus.on("deactivate-screensaver", () => {
      this.deactivateScreensaver();
    });

    // Listen for navigation changes to track active views
    const navBus = this.orchestrator.getEventBus("navigation-manager");
    if (navBus) {
      navBus.on("view-changed", (e) => {
        const { newViewId } = e.detail;
        if (!this.isScreensaverActive && newViewId !== this.config?.view.componentId) {
          this.lastActiveViewId = newViewId;
          stateManager.set("screensaver.lastActiveViewId", newViewId);
          this.resetActivityTimer();
        }
      });
    }
  }

  public registerScreensaver(config: ScreensaverConfig): void {
    this.validateConfig(config);

    // Clean up existing screensaver if any
    if (this.config) {
      this.cleanup();
    }

    this.config = {
      ...config,
      exitBehavior: config.exitBehavior || "reset",
      activityEvents: config.activityEvents || this.DEFAULT_ACTIVITY_EVENTS,
      excludeSelectors: config.excludeSelectors || [],
      transitionConfig: config.transitionConfig || {
        type: "snap",
      },
    };

    // Register the screensaver view with navigation manager
    const navBus = this.orchestrator.getEventBus("navigation-manager");
    if (navBus) {
      navBus.emit("register-view", { view: this.config.view });
    }

    this.setupGlobalActivityListeners();
    this.resetActivityTimer();

    log.trace(
      `Screensaver registered with ${config.timeoutSeconds}s timeout and '${this.config.exitBehavior}' exit behavior`
    );
  }

  private validateConfig(config: ScreensaverConfig): void {
    if (!config.view) {
      throw new Error("Screensaver view is required");
    }

    if (config.timeoutSeconds <= 0) {
      throw new Error("timeoutSeconds must be greater than 0");
    }

    if (config.exitBehavior === "reset" && !config.startingViewId) {
      throw new Error('startingViewId is required when exitBehavior is "reset"');
    }

    if (config.exitBehavior && !["reset", "return"].includes(config.exitBehavior)) {
      throw new Error('exitBehavior must be either "reset" or "return"');
    }
  }

  private setupGlobalActivityListeners(): void {
    if (!this.config) return;

    const activityHandler = (event: Event) => {
      // Check if event should be ignored based on excludeSelectors
      if (this.shouldIgnoreActivity(event)) {
        return;
      }

      if (this.isScreensaverActive) {
        // If screensaver is active, any activity should exit it
        this.handleScreensaverExit();
      } else {
        // If screensaver is not active, reset the timer
        this.resetActivityTimer();
      }
    };

    // Add listeners to document for global coverage
    this.config.activityEvents!.forEach((eventType) => {
      const listener = activityHandler.bind(this);
      document.addEventListener(eventType, listener, { passive: true });

      this.globalListeners.push({
        element: document,
        type: eventType,
        listener,
      });
    });

    // Also listen for visibility changes (tab switching, etc.)
    const visibilityHandler = () => {
      if (document.hidden) {
        this.pauseActivityTimer();
      } else {
        this.resetActivityTimer();
      }
    };

    document.addEventListener("visibilitychange", visibilityHandler);
    this.globalListeners.push({
      element: document,
      type: "visibilitychange",
      listener: visibilityHandler,
    });
  }

  private shouldIgnoreActivity(event: Event): boolean {
    if (!this.config?.excludeSelectors?.length) return false;

    const target = event.target as Element;
    if (!target) return false;

    return this.config.excludeSelectors.some((selector) => {
      try {
        return target.matches(selector) || target.closest(selector);
      } catch (e: any) {
        log.warn(`Invalid exclude selector: ${selector} ${e.message}`);
        return false;
      }
    });
  }

  private resetActivityTimer(): void {
    if (!this.config) return;

    this.clearActivityTimer();

    this.activityTimer = window.setTimeout(() => {
      this.activateScreensaver();
    }, this.config.timeoutSeconds * 1000);

    log.trace(`Activity timer reset for ${this.config.timeoutSeconds} seconds`);
  }

  private pauseActivityTimer(): void {
    this.clearActivityTimer();
    log.trace("Activity timer paused");
  }

  private clearActivityTimer(): void {
    if (this.activityTimer !== null) {
      clearTimeout(this.activityTimer);
      this.activityTimer = null;
    }
  }

  private async activateScreensaver(): Promise<void> {
    if (!this.config || this.isScreensaverActive) return;
    if (this.config.blockerCallback && this.config.blockerCallback()) {
      this.resetActivityTimer();
      return;
    }
    log.trace("Activating screensaver");

    // Store the current view before switching to screensaver
    const currentViewId = this.navigationManager.getCurrentViewId();
    if (currentViewId && currentViewId !== this.config.view.componentId) {
      this.lastActiveViewId = currentViewId;
      stateManager.set("screensaver.lastActiveViewId", currentViewId);
    }

    this.isScreensaverActive = true;
    stateManager.set("screensaver.isActive", true);

    try {
      await this.navigationManager.navigateToView(this.config.view.componentId, this.config.transitionConfig);

      this.eventBus.emit("screensaver-activated", {
        viewId: this.config.view.componentId,
        previousViewId: this.lastActiveViewId,
      });
    } catch (error) {
      log.error("Failed to activate screensaver:", error as Error);
      this.isScreensaverActive = false;
      stateManager.set("screensaver.isActive", false);
    }
    if (this.config.activateCallback) this.config.activateCallback();

    // Start periodic reboot check and check immediately
    this.startRebootCheckInterval();
    this.checkAndPerformReboot();
  }

  private async handleScreensaverExit(): Promise<void> {
    if (!this.config || !this.isScreensaverActive) return;

    log.trace(`Exiting screensaver with '${this.config.exitBehavior}' behavior`);

    // Stop the reboot check interval
    this.stopRebootCheckInterval();

    if (this.config.deactivateCallback) this.config.deactivateCallback();
    this.isScreensaverActive = false;
    stateManager.set("screensaver.isActive", false);

    let targetViewId: string | null = null;

    if (this.config.exitBehavior === "return" && this.lastActiveViewId) {
      targetViewId = this.lastActiveViewId;
    } else if (this.config.exitBehavior === "reset" && this.config.startingViewId) {
      targetViewId = this.config.startingViewId;
    }

    if (targetViewId) {
      try {
        await this.navigationManager.navigateToView(targetViewId, this.config.transitionConfig);

        this.eventBus.emit("screensaver-deactivated", {
          targetViewId,
          exitBehavior: this.config.exitBehavior,
        });

        // Reset timer for next cycle
        this.resetActivityTimer();
      } catch (error) {
        log.error("Failed to exit screensaver:", error as Error);
        // Reset state on error
        this.isScreensaverActive = true;
        stateManager.set("screensaver.isActive", true);
      }
    } else {
      log.warn("No target view available for screensaver exit");
      this.resetActivityTimer();
    }
  }

  private async deactivateScreensaver(): Promise<void> {
    await this.handleScreensaverExit();
  }

  public isActive(): boolean {
    return this.isScreensaverActive;
  }

  public getCurrentConfig(): ScreensaverConfig | null {
    return this.config;
  }

  public getLastActiveViewId(): string | null {
    return this.lastActiveViewId;
  }

  // Manual control methods
  public forceActivate(): void {
    this.clearActivityTimer();
    this.activateScreensaver();
  }

  public forceDeactivate(): void {
    this.deactivateScreensaver();
  }

  public resetTimer(): void {
    if (!this.isScreensaverActive) {
      this.resetActivityTimer();
    }
  }

  private cleanup(): void {
    this.clearActivityTimer();
    this.stopRebootCheckInterval();

    // Remove all global event listeners
    this.globalListeners.forEach(({ element, type, listener }) => {
      element.removeEventListener(type, listener);
    });
    this.globalListeners.length = 0;

    this.isScreensaverActive = false;
    stateManager.set("screensaver.isActive", false);
  }

  public destroy(): void {
    this.cleanup();
    this.config = null;
    this.lastActiveViewId = null;
    log.trace("ScreensaverManager destroyed");
  }

  // Reboot timeout checking methods
  private hasRebootTimeoutElapsed(): boolean {
    if (!this.config?.rebootTimeout) return false;

    const lastReboot = stateManager.get<number>("lastReboot");
    if (!lastReboot) {
      // Initialize timestamp on first check
      stateManager.set("lastReboot", Date.now());
      return false;
    }

    const elapsedMinutes = (Date.now() - lastReboot) / (1000 * 60);
    return elapsedMinutes >= this.config.rebootTimeout;
  }

  private checkAndPerformReboot(): void {
    if (!this.hasRebootTimeoutElapsed()) return;

    log.trace("Reboot timeout elapsed, performing reboot");

    // Call the reboot callback function
    if (this.config?.rebootCallback) {
      this.config.rebootCallback();
    }

    // Reset the timestamp after reboot is triggered
    stateManager.set("lastReboot", Date.now());
  }

  private startRebootCheckInterval(): void {
    if (!this.config?.rebootTimeout) return;

    // Clear any existing interval
    this.stopRebootCheckInterval();

    // Check every 10 minutes (600000 ms)
    this.rebootCheckInterval = window.setInterval(() => {
      this.checkAndPerformReboot();
    }, 600000);

    log.trace("Reboot check interval started (10 minute intervals)");
  }

  private stopRebootCheckInterval(): void {
    if (this.rebootCheckInterval !== null) {
      clearInterval(this.rebootCheckInterval);
      this.rebootCheckInterval = null;
      log.trace("Reboot check interval stopped");
    }
  }
}
