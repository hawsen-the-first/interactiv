import { EventBus, EventOrchestrator } from "./eventBus";
import { Page } from "./appBuilder";
import { NavigationManager, type TransitionConfig } from "./navigationManager";
import { stateManager } from "./stateManager";
import { logger } from "./logger";

const log = logger;

export interface ScreensaverConfig {
  timeoutSeconds: number;
  page?: Page; // Required when screensaverViewBehavior is NOT 'returnHome'
  defaultViewId?: string; // The first view to show when screensaver activates (or the home view when 'returnHome')
  screensaverViewBehavior?: "default" | "specific" | "return" | "returnHome"; // How to handle view on re-activation
  specificViewId?: string; // Required when screensaverViewBehavior is 'specific'
  transitionConfig?: TransitionConfig;
  exitBehavior?: "reset" | "return"; // Default: 'reset'
  startingPageId?: string; // Required when exitBehavior is 'reset' or screensaverViewBehavior is 'returnHome'
  startingViewId?: string; // Optional: view within the starting page
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
  private lastActivePageId: string | null = null;
  private lastActiveViewId: string | null = null;
  private lastScreensaverViewId: string | null = null;
  private lastActivityResetTime: number | null = null;
  private globalListeners: Array<{
    element: EventTarget;
    type: string;
    listener: EventListener;
  }> = [];
  
  // Interaction shield state
  private interactionShieldActive: boolean = false;
  private shieldRemovalTimer: number | null = null;

  // Debounce interval for activity timer resets (in milliseconds)
  private readonly DEBOUNCE_INTERVAL = 1000;
  
  // Shield duration to block follow-up events from the same gesture (in milliseconds)
  private readonly SHIELD_DURATION = 400;

  // Default activity events to monitor
  private readonly DEFAULT_ACTIVITY_EVENTS = [
    "mousemove",
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
    if (!stateManager.has("screensaver.lastActivePageId")) {
      stateManager.set("screensaver.lastActivePageId", null);
    }
    if (!stateManager.has("screensaver.lastActiveViewId")) {
      stateManager.set("screensaver.lastActiveViewId", null);
    }
    if (!stateManager.has("screensaver.lastScreensaverViewId")) {
      stateManager.set("screensaver.lastScreensaverViewId", null);
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

    // Listen for navigation changes to track active pages and views
    const navBus = this.orchestrator.getEventBus("navigation-manager");
    if (navBus) {
      navBus.on("page-changed", (e) => {
        const { newPageId } = e.detail;
        const screensaverPageId = this.config?.page?.componentId;
        if (!this.isScreensaverActive && (!screensaverPageId || newPageId !== screensaverPageId)) {
          this.lastActivePageId = newPageId;
          stateManager.set("screensaver.lastActivePageId", newPageId);
        }
      });

      navBus.on("view-changed", (e) => {
        const { newViewId } = e.detail;
        if (this.isScreensaverActive) {
          // Track view changes within screensaver for "return" behavior
          this.lastScreensaverViewId = newViewId;
          stateManager.set("screensaver.lastScreensaverViewId", newViewId);
        } else {
          this.lastActiveViewId = newViewId;
          stateManager.set("screensaver.lastActiveViewId", newViewId);
          // Timer reset is handled by activity event listeners, not navigation events
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
      screensaverViewBehavior: config.screensaverViewBehavior || "default",
      activityEvents: config.activityEvents || this.DEFAULT_ACTIVITY_EVENTS,
      excludeSelectors: config.excludeSelectors || [],
      transitionConfig: config.transitionConfig || {
        type: "snap",
      },
    };

    // Register the screensaver page with navigation manager (only in screensaver mode)
    if (!this.isReturnHomeMode() && this.config.page) {
      const navBus = this.orchestrator.getEventBus("navigation-manager");
      if (navBus) {
        navBus.emit("register-page", { page: this.config.page });
      }
    }

    this.setupGlobalActivityListeners();
    this.resetActivityTimer();

    if (this.isReturnHomeMode()) {
      log.trace(
        `Screensaver registered in returnHome mode with ${config.timeoutSeconds}s timeout, target: ${this.config.startingPageId}/${this.config.defaultViewId || "default"}`
      );
    } else {
      log.trace(
        `Screensaver registered with ${config.timeoutSeconds}s timeout and '${this.config.exitBehavior}' exit behavior`
      );
    }
  }

  private isReturnHomeMode(): boolean {
    return this.config?.screensaverViewBehavior === "returnHome";
  }

  private validateConfig(config: ScreensaverConfig): void {
    if (config.timeoutSeconds <= 0) {
      throw new Error("timeoutSeconds must be greater than 0");
    }

    if (config.screensaverViewBehavior && !["default", "specific", "return", "returnHome"].includes(config.screensaverViewBehavior)) {
      throw new Error('screensaverViewBehavior must be "default", "specific", "return", or "returnHome"');
    }

    if (config.screensaverViewBehavior === "returnHome") {
      // In returnHome mode, startingPageId is required as the home page target
      if (!config.startingPageId) {
        throw new Error('startingPageId is required when screensaverViewBehavior is "returnHome"');
      }
    } else {
      // In screensaver modes, page is required
      if (!config.page) {
        throw new Error('Screensaver page is required when screensaverViewBehavior is not "returnHome"');
      }

      if (config.exitBehavior === "reset" && !config.startingPageId) {
        throw new Error('startingPageId is required when exitBehavior is "reset"');
      }

      if (config.exitBehavior && !["reset", "return"].includes(config.exitBehavior)) {
        throw new Error('exitBehavior must be either "reset" or "return"');
      }

      if (config.screensaverViewBehavior === "specific" && !config.specificViewId) {
        throw new Error('specificViewId is required when screensaverViewBehavior is "specific"');
      }
    }
  }

  private setupGlobalActivityListeners(): void {
    if (!this.config) return;

    const activityHandler = (event: Event) => {
      // Block all events if interaction shield is active
      if (this.interactionShieldActive) {
        event.stopPropagation();
        event.preventDefault();
        log.trace(`Interaction shield blocked ${event.type} event`);
        return;
      }

      // Check if event should be ignored based on excludeSelectors
      if (this.shouldIgnoreActivity(event)) {
        return;
      }

      if (this.isScreensaverActive) {
        // If screensaver is active, any activity should exit it
        this.handleScreensaverExit();
      } else {
        // If screensaver is not active, check debounce before resetting the timer
        const now = Date.now();
        if (this.lastActivityResetTime === null || 
            now - this.lastActivityResetTime >= this.DEBOUNCE_INTERVAL) {
          this.resetActivityTimer();
        }
      }
    };

    // Add listeners to document for global coverage
    // Use non-passive listeners for click and touch events to allow preventDefault()
    this.config.activityEvents!.forEach((eventType) => {
      const listener = activityHandler.bind(this);
      const usePassive = !["click", "touchstart", "touchend"].includes(eventType);
      
      document.addEventListener(eventType, listener, { 
        passive: usePassive,
        capture: true // Use capture phase to intercept events before they reach targets
      });

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

    // Record the timestamp for debouncing
    this.lastActivityResetTime = Date.now();

    log.trace(`Activity timer reset for ${this.config.timeoutSeconds} seconds`);
  }

  private pauseActivityTimer(): void {
    this.clearActivityTimer();
    // Reset the debounce timestamp when pausing
    this.lastActivityResetTime = null;
    log.trace("Activity timer paused");
  }

  private clearActivityTimer(): void {
    if (this.activityTimer !== null) {
      clearTimeout(this.activityTimer);
      this.activityTimer = null;
    }
  }

  private async activateScreensaver(): Promise<void> {
    if (!this.config) return;
    if (this.config.blockerCallback && this.config.blockerCallback()) {
      this.resetActivityTimer();
      return;
    }

    // Handle returnHome mode — navigate to home page/view without entering screensaver state
    if (this.isReturnHomeMode()) {
      await this.activateReturnHome();
      return;
    }

    // Standard screensaver mode
    if (this.isScreensaverActive) return;

    log.trace("Activating screensaver");

    // Store the current page and view before switching to screensaver
    const currentPageId = this.navigationManager.getCurrentPageId();
    const currentViewId = this.navigationManager.getCurrentViewId();
    const screensaverPageId = this.config.page!.componentId;
    
    if (currentPageId && currentPageId !== screensaverPageId) {
      this.lastActivePageId = currentPageId;
      this.lastActiveViewId = currentViewId;
      stateManager.set("screensaver.lastActivePageId", currentPageId);
      stateManager.set("screensaver.lastActiveViewId", currentViewId);
    }

    this.isScreensaverActive = true;
    stateManager.set("screensaver.isActive", true);

    try {
      // Navigate to screensaver page
      await this.navigationManager.navigateToPage(screensaverPageId, this.config.transitionConfig);

      // Determine which view to show based on screensaverViewBehavior
      const targetViewId = this.determineScreensaverView();
      if (targetViewId) {
        await this.navigationManager.navigateToView(targetViewId, { type: "snap" });
      }

      this.eventBus.emit("screensaver-activated", {
        pageId: screensaverPageId,
        viewId: targetViewId,
        previousPageId: this.lastActivePageId,
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

  /**
   * Return-to-home activation: navigates to the configured home page/view
   * without entering "screensaver active" state. The timer resets immediately
   * for the next inactivity cycle.
   */
  private async activateReturnHome(): Promise<void> {
    if (!this.config) return;

    const targetPageId = this.config.startingPageId!;
    const targetViewId = this.config.defaultViewId || null;
    const currentPageId = this.navigationManager.getCurrentPageId();
    const currentViewId = this.navigationManager.getCurrentViewId();

    // Skip navigation if already on the target page/view
    const alreadyOnTargetPage = currentPageId === targetPageId;
    const alreadyOnTargetView = !targetViewId || currentViewId === targetViewId;

    if (alreadyOnTargetPage && alreadyOnTargetView) {
      log.trace("ReturnHome: Already on home page/view, resetting timer");
      this.resetActivityTimer();
      return;
    }

    log.trace(`ReturnHome: Navigating to ${targetPageId}/${targetViewId || "default"}`);

    try {
      // Navigate to home page
      if (!alreadyOnTargetPage) {
        await this.navigationManager.navigateToPage(targetPageId, this.config.transitionConfig);
      }

      // Navigate to home view if specified
      if (targetViewId && !alreadyOnTargetView) {
        await this.navigationManager.navigateToView(targetViewId, { type: "snap" });
      }

      this.eventBus.emit("screensaver-returned-home", {
        targetPageId,
        targetViewId,
        previousPageId: currentPageId,
        previousViewId: currentViewId,
      });

      if (this.config.activateCallback) this.config.activateCallback();
    } catch (error) {
      log.error("Failed to return to home:", error as Error);
    }

    // Reset timer for next inactivity cycle
    this.resetActivityTimer();

    // Check reboot timeout if configured
    this.checkAndPerformReboot();
  }

  private determineScreensaverView(): string | null {
    if (!this.config) return null;
    
    switch (this.config.screensaverViewBehavior) {
      case "return":
        return this.lastScreensaverViewId || this.config.defaultViewId || null;
      case "specific":
        return this.config.specificViewId || null;
      case "default":
      default:
        return this.config.defaultViewId || null;
    }
  }

  private async handleScreensaverExit(): Promise<void> {
    if (!this.config || !this.isScreensaverActive) return;

    log.trace(`Exiting screensaver with '${this.config.exitBehavior}' behavior`);

    // Activate interaction shield to block follow-up events from the same gesture
    this.activateInteractionShield();

    // Stop the reboot check interval
    this.stopRebootCheckInterval();

    if (this.config.deactivateCallback) this.config.deactivateCallback();
    this.isScreensaverActive = false;
    stateManager.set("screensaver.isActive", false);

    let targetPageId: string | null = null;
    let targetViewId: string | null = null;

    if (this.config.exitBehavior === "return") {
      targetPageId = this.lastActivePageId;
      targetViewId = this.lastActiveViewId;
    } else if (this.config.exitBehavior === "reset") {
      targetPageId = this.config.startingPageId || null;
      targetViewId = this.config.startingViewId || null;
    }

    if (targetPageId) {
      try {
        await this.navigationManager.navigateToPage(targetPageId, this.config.transitionConfig);
        
        if (targetViewId) {
          await this.navigationManager.navigateToView(targetViewId, { type: "snap" });
        }

        this.eventBus.emit("screensaver-deactivated", {
          targetPageId,
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
      log.warn("No target page available for screensaver exit");
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

  public getLastActivePageId(): string | null {
    return this.lastActivePageId;
  }

  public getLastActiveViewId(): string | null {
    return this.lastActiveViewId;
  }

  public getLastScreensaverViewId(): string | null {
    return this.lastScreensaverViewId;
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
    this.deactivateInteractionShield();

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
    this.lastActivePageId = null;
    this.lastActiveViewId = null;
    this.lastScreensaverViewId = null;
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

  // Interaction shield methods
  /**
   * Activates the interaction shield to block follow-up events from the same gesture
   * that dismissed the screensaver. This prevents touch events from bleeding through
   * to elements on the home page.
   */
  private activateInteractionShield(): void {
    // Clear any existing shield timer
    if (this.shieldRemovalTimer !== null) {
      clearTimeout(this.shieldRemovalTimer);
      this.shieldRemovalTimer = null;
    }

    this.interactionShieldActive = true;
    log.trace("Interaction shield activated");

    // Automatically deactivate shield after the gesture completes
    this.shieldRemovalTimer = window.setTimeout(() => {
      this.deactivateInteractionShield();
    }, this.SHIELD_DURATION);
  }

  /**
   * Deactivates the interaction shield, allowing normal event processing to resume.
   */
  private deactivateInteractionShield(): void {
    if (this.shieldRemovalTimer !== null) {
      clearTimeout(this.shieldRemovalTimer);
      this.shieldRemovalTimer = null;
    }

    this.interactionShieldActive = false;
    log.trace("Interaction shield deactivated");
  }
}
