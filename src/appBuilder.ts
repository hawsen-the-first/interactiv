/* eslint-disable @typescript-eslint/no-this-alias */
import { EventBus, EventOrchestrator } from "./eventBus";
import { NavigationManager } from "./navigationManager";
import {
  ScreensaverManager,
  type ScreensaverConfig,
} from "./screensaverManager";
import { SettingsManager, type SettingsConfig } from "./settingsManager";
import { EventManager } from "./eventManager";
import { ComponentStateManager } from "./stateManager";
import type {
  PointerEventData,
  DragCallbacks,
  HoverCallbacks,
  SwipeCallbacks,
} from "./eventManager";
import { log } from "..";

abstract class RenderableComponent {
  public componentId: string;
  protected shadowRoot!: ShadowRoot;
  public renderBus: EventBus;
  protected bubbleChanges: boolean;
  protected children: RenderableComponent[] = [];
  protected parent?: RenderableComponent;
  protected template: string = "";
  protected styles: string = "";
  protected lastRenderedHTML: string = "";
  protected properties: Map<string, any> = new Map();
  protected hostElement!: HTMLElement;
  protected eventManager!: EventManager;
  protected stateManager!: ComponentStateManager;
  protected orchestrator: EventOrchestrator;
  public state: any;

  constructor(
    id: string,
    orchestrator: EventOrchestrator,
    bubbleChanges: boolean = false
  ) {
    this.componentId = id;
    this.bubbleChanges = bubbleChanges;
    this.orchestrator = orchestrator;

    this.renderBus = orchestrator.registerEventBus(`render-${id}`);

    this.setupRenderListeners();
    this.attachShadowDOM();
    this.initializeEventManager();
    this.initializeStateManager();
  }

  private setupRenderListeners() {
    this.renderBus.on("render-request", (e) => {
      const { changeType, source } = e.detail;
      if (this.shouldRerender(changeType, source)) {
        this.performRender();
      }
    });

    this.renderBus.on("child-changed", (e) => {
      const { childId, changeType } = e.detail;
      this.handleChildChange(childId, changeType);
    });

    this.renderBus.on("parent-changed", (e) => {
      const { changeType } = e.detail;
      this.handleParentChange(changeType);
    });
  }

  protected attachShadowDOM(): void {
    this.hostElement = document.createElement("div");
    this.hostElement.id = this.componentId;
    this.shadowRoot = this.hostElement.attachShadow({ mode: "open" });
  }

  private initializeEventManager(): void {
    this.eventManager = new EventManager(this.shadowRoot, this.componentId);
  }

  /**
   * Clean up event listeners before re-render to prevent duplicates
   */
  // private cleanupEventListeners(): void {
  //   // Clear all selector-based listeners to prevent duplicates
  //   // The EventManager will handle this automatically now with deduplication
  //   // but we can add explicit cleanup if needed
  // }

  private initializeStateManager(): void {
    this.stateManager = new ComponentStateManager(
      this.componentId,
      (key: string, value: any, isLocal: boolean) => {
        this.handleStateChange(key, value, isLocal);
      }
    );

    // Attach the state proxy to this component
    this.state = this.stateManager.getStateProxy();
  }

  private handleStateChange(key: string, value: any, isLocal: boolean): void {
    // Update properties map for template compilation
    this.properties.set(key, value);

    // Trigger re-render directly instead of through event bus to avoid loops
    this.performRender();

    // Handle bubbling for local state changes
    if (isLocal && this.bubbleChanges && this.parent) {
      this.parent.renderBus.emit("child-changed", {
        childId: this.componentId,
        changeType: "state-change",
        stateKey: key,
        isLocal: true,
      });
    }
  }

  protected performRender(): void {
    this.onBeforeRender();

    const compiledHTML = this.compileTemplate();

    if (compiledHTML !== this.lastRenderedHTML) {
      this.updateShadowDOM(compiledHTML);
      this.lastRenderedHTML = compiledHTML;
      this.attachEventListeners();
      this.renderChildren();
    }

    this.onAfterRender();
  }

  private compileTemplate(): string {
    let compiled = this.template;

    // Handle ifnot/else blocks first (inverted if) - process these before regular if blocks
    compiled = compiled.replace(
      /\{\{#ifnot\s+(\w+)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/ifnot\}\}/g,
      (_, condition, ifnotContent, elseContent) => {
        const conditionValue = this.getProperty(condition);
        if (!conditionValue) {
          return ifnotContent || "";
        } else if (elseContent !== undefined) {
          return elseContent;
        }
        return "";
      }
    );

    // Handle if/else blocks
    compiled = compiled.replace(
      /\{\{#if\s+(\w+)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
      (_, condition, ifContent, elseContent) => {
        const conditionValue = this.getProperty(condition);
        if (conditionValue) {
          return ifContent || "";
        } else if (elseContent !== undefined) {
          return elseContent;
        }
        return "";
      }
    );

    // Handle property interpolation last
    compiled = compiled.replace(/\{\{(\w+)\}\}/g, (_, propName) => {
      return this.getProperty(propName) || "";
    });

    return compiled;
  }

  private updateShadowDOM(html: string): void {
    this.shadowRoot.innerHTML = `
      <style>${this.styles}</style>
      ${html}
    `;
  }

  private renderChildren(): void {
    const childrenContainer = this.shadowRoot.querySelector(
      ".children-container"
    );

    if (childrenContainer && this.children.length > 0) {
      childrenContainer.innerHTML = "";
      this.children.forEach((child) => {
        // Ensure child is rendered before appending
        child.performRender();

        // Ensure child host element is visible
        child.hostElement.style.display = "block";

        childrenContainer.appendChild(child.hostElement);
      });
    }
  }

  protected getProperty(key: string): any {
    return this.properties.get(key);
  }

  public getPublicProperty(key: string): any {
    return this.properties.get(key);
  }

  public setProperty(key: string, value: any): void {
    const oldValue = this.properties.get(key);
    if (oldValue !== value) {
      this.properties.set(key, value);

      // Special handling for template changes
      if (key === "template") {
        this.template = value;
        this.performRender();
        return;
      }

      // Special handling for styles changes
      if (key === "styles") {
        this.styles = value;
        this.performRender();
        return;
      }

      this.renderBus.emit("render-request", {
        changeType: "property-change",
        source: this.componentId,
        property: key,
        oldValue,
        newValue: value,
      });

      if (this.bubbleChanges && this.parent) {
        this.parent.renderBus.emit("child-changed", {
          childId: this.componentId,
          changeType: "property-change",
          property: key,
        });
      }
    }
  }

  public addChild(child: RenderableComponent): void {
    child.parent = this;
    this.children.push(child);

    // Force immediate re-render when child is added
    this.updateShadowDOM(this.compileTemplate());
    this.attachEventListeners();
    this.renderChildren();

    this.notifyChildrenOfStructureChange();
  }

  public removeChild(childId: string): void {
    const childIndex = this.children.findIndex(
      (c) => c.componentId === childId
    );
    if (childIndex !== -1) {
      const child = this.children[childIndex];
      child.parent = undefined;
      this.children.splice(childIndex, 1);

      this.renderBus.emit("render-request", {
        changeType: "child-removed",
        source: this.componentId,
        childId: childId,
      });

      this.notifyChildrenOfStructureChange();
    }
  }

  public addSibling(sibling: RenderableComponent): void {
    sibling.parent = this.parent;
    this.parent?.children.push(sibling);

    // Force immediate re-render when child is added
    this.updateShadowDOM(this.compileTemplate());
    this.attachEventListeners();
    this.renderChildren();

    this.notifyChildrenOfStructureChange();
  }

  public removeSibling(siblingId: string): void {
    const me = this;
    if (me.parent) {
      const siblingIndex = me.parent?.children.findIndex(
        (c) => c.componentId === siblingId
      );
      if (siblingIndex !== -1) {
        const sibling = me.parent?.children[siblingIndex];
        if (sibling) {
          sibling.parent = undefined;
          me.parent.children.splice(siblingIndex, 1);
        }

        this.renderBus.emit("render-request", {
          changeType: "child-removed",
          source: me.componentId,
          childId: siblingId,
        });

        this.notifyChildrenOfStructureChange();
      }
    }
  }

  private notifyChildrenOfStructureChange(): void {
    this.children.forEach((child) => {
      child.renderBus.emit("parent-changed", {
        changeType: "structure-change",
        parentId: this.componentId,
      });
    });
  }

  private attachEventListeners(): void {
    const actionElements = this.shadowRoot.querySelectorAll("[data-action]");

    actionElements.forEach((element) => {
      const action = element.getAttribute("data-action");
      element.addEventListener("click", (e) => {
        this.handleAction(action!, e);
      });
    });
  }

  protected handleAction(action: string, event: Event): void {
    this.renderBus.emit("action-triggered", {
      action,
      componentId: this.componentId,
      event,
    });
  }

  protected onBeforeRender(): void {}
  public onAfterRender(): void {}

  protected shouldRerender(changeType: string, source: string): boolean {
    if (changeType && source) {
      return true; // Default: always re-render
    }
    return true; // Default: always re-render
  }

  protected handleParentChange(changeType: string): void {
    // Default: re-render when parent changes
    if (changeType) {
      this.performRender();
    }
    this.performRender();
  }

  protected handleChildChange(childId: string, changeType: string): void {
    // Default: re-render when children change
    if (childId && changeType) {
      this.performRender();
    }
    this.performRender();
  }

  protected abstract defineTemplate(): void;
  protected abstract defineStyles(): void;

  // Initial render method
  public performInitialRender(): void {
    this.defineTemplate();
    this.defineStyles();
    this.performRender();
  }

  public getHostElement(): HTMLElement {
    return this.hostElement;
  }

  public getChildrenCount(): number {
    return this.children.length;
  }

  // Event Manager convenience methods

  /**
   * Add a point interaction (click + tap) to elements matching the selector
   */
  protected point(
    selector: string,
    callback: (data: PointerEventData) => void
  ): void {
    this.eventManager.point(selector, callback);
  }

  /**
   * Add an un-point interaction (click + tap) to elements matching the selector
   */
  protected unpoint(
    selector: string,
    callback: (data: PointerEventData) => void
  ): void {
    this.eventManager.unpoint(selector, callback);
  }

  /**
   * Add drag interaction (mouse drag + touch drag) to elements matching the selector
   */
  protected drag(selector: string, callbacks: DragCallbacks): void {
    this.eventManager.drag(selector, callbacks);
  }

  /**
   * Add hover interaction (mouse enter/leave + touch fallback) to elements matching the selector
   */
  protected hover(selector: string, callbacks: HoverCallbacks): void {
    this.eventManager.hover(selector, callbacks);
  }

  /**
   * Add long press interaction to elements matching the selector
   */
  protected longPress(
    selector: string,
    callback: (data: PointerEventData) => void,
    duration: number = 500
  ): void {
    this.eventManager.longPress(selector, callback, duration);
  }

  /**
   * Add swipe gesture detection to elements matching the selector
   */
  protected swipe(
    selector: string,
    callbacks: SwipeCallbacks,
    threshold: number = 50
  ): void {
    this.eventManager.swipe(selector, callbacks, threshold);
  }

  /**
   * Add a custom event listener with automatic cleanup
   */
  protected addEventListener(
    element: Element | Document,
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions
  ): void {
    this.eventManager.addEventListener(element, type, listener, options);
  }

  /**
   * Remove a specific event listener
   */
  protected removeEventListener(
    element: Element,
    type: string,
    listener: EventListener
  ): void {
    this.eventManager.removeEventListener(element, type, listener);
  }

  // State Management convenience methods

  /**
   * Create and manage local component state
   */
  protected useState<T>(
    key: string,
    initialValue: T
  ): [T, (newValue: T) => void] {
    return this.stateManager.useState(key, initialValue);
  }

  /**
   * Subscribe to and manage global application state
   */
  protected useGlobalState<T>(
    key: string,
    initialValue?: T
  ): [T, (newValue: T) => void] {
    return this.stateManager.useGlobalState(key, initialValue);
  }

  /**
   * Get current local state value without subscribing
   */
  protected getLocalState(key: string): any {
    return this.stateManager.getLocalState(key);
  }

  /**
   * Define multiple state properties at once with initial values
   * This creates reactive state properties accessible via this.state
   */
  public defineState(initialState: Record<string, any>): void {
    this.stateManager.defineState(initialState);
  }

  /**
   * Destroy the component and clean up all event listeners
   */
  public destroy(): void {
    if (this.stateManager) {
      this.stateManager.destroy();
    }

    if (this.eventManager) {
      this.eventManager.destroy();
    }

    // Clean up children
    this.children.forEach((child) => child.destroy());
    this.children.length = 0;

    // Remove from parent
    if (this.parent) {
      this.parent.removeChild(this.componentId);
    }

    // Remove from DOM
    if (this.hostElement && this.hostElement.parentNode) {
      this.hostElement.parentNode.removeChild(this.hostElement);
    }
  }
}

// AppBuilder - Root of the hierarchy
class AppBuilder extends RenderableComponent {
  private pages: Page[] = [];
  private navigationManager: NavigationManager;

  constructor(orchestrator: EventOrchestrator) {
    super("app-builder", orchestrator, false); // Don't bubble by default
    this.navigationManager = new NavigationManager(orchestrator);
    new ScreensaverManager(orchestrator, this.navigationManager);
    new SettingsManager(orchestrator, this.navigationManager);
    this.performInitialRender();
    this.setupNavigationContainer();
  }

  private setupNavigationContainer(): void {
    // Make the app content container a navigation container
    const appContent = this.shadowRoot.querySelector(".app-content");
    if (appContent) {
      appContent.classList.add("nav-container");
    }
  }

  protected defineTemplate(): void {
    this.template = /* html */ `
      <div class="app">
        <main class="app-content">
          <div class="children-container">
            <!-- Pages will be rendered here -->
          </div>
        </main>
      </div>
    `;
  }

  protected defineStyles(): void {
    this.styles = `
      :host {
        display: block;
        width: 100%;
        height: 100vh;
      }
      
      .app {
        display: flex;
        flex-direction: column;
        height: 100%;
        font-family: Arial, sans-serif;
      }
      
      .app-content {
        flex: 1;
        overflow: auto;
        padding: 1rem;
      }
    `;
  }

  public addPage(page: Page): void {
    this.pages.push(page);
    this.addChild(page);
    // Register page with navigation manager
    this.navigationManager.registerPage(page);
  }

  public removePage(pageId: string): void {
    const pageIndex = this.pages.findIndex((p) => p.componentId === pageId);
    if (pageIndex !== -1) {
      this.pages.splice(pageIndex, 1);
      this.removeChild(pageId);
    }
  }

  public async navigateToPage(
    pageId: string,
    config?: import("./navigationManager").TransitionConfig
  ): Promise<void> {
    return this.navigationManager.navigateToPage(pageId, config);
  }

  public async navigateToView(
    viewId: string,
    config?: import("./navigationManager").TransitionConfig
  ): Promise<void> {
    return this.navigationManager.navigateToView(viewId, config);
  }

  public getCurrentPageId(): string | null {
    return this.navigationManager.getCurrentPageId();
  }

  public getCurrentViewId(): string | null {
    return this.navigationManager.getCurrentViewId();
  }

  public isTransitioning(): boolean {
    return this.navigationManager.isTransitioning();
  }

  public attachToDom(): void {
    const appContainer = document.getElementById("app");
    if (appContainer) {
      appContainer.appendChild(this.getHostElement());
    } else {
      // Fallback to body if #app doesn't exist
      document.body.appendChild(this.getHostElement());
    }
  }
}
// Page - Contains Views
class Page extends RenderableComponent {
  private views: View[] = [];

  constructor(
    id: string,
    orchestrator: EventOrchestrator,
    bubbleChanges: boolean = true,
    customTemplate?: string,
    customStyles?: string
  ) {
    super(id, orchestrator, bubbleChanges);

    // Set custom template/styles before initial render if provided
    if (customTemplate) {
      this.properties.set("template", customTemplate);
    }
    if (customStyles) {
      this.properties.set("styles", customStyles);
    }

    this.performInitialRender();
  }

  protected defineTemplate(): void {
    // Check if a custom template was set via setProperty
    const customTemplate = this.getProperty("template");
    if (customTemplate) {
      this.template = customTemplate;
    } else {
      // Use default template
      this.template = `
        <div class="page" data-page-id="${this.componentId}">
          <div class="page-header">
            <h2>{{pageTitle}}</h2>
            <div class="page-actions">
              {{#if showActions}}
                <button data-action="edit" class="btn">Edit Page</button>
                <button data-action="delete" class="btn danger">Delete Page</button>
              {{/if}}
            </div>
          </div>
          <div class="page-content">
            <div class="children-container">
              <!-- Views will be rendered here -->
            </div>
          </div>
        </div>
      `;
    }
  }

  protected defineStyles(): void {
    // Check if custom styles were set via setProperty
    const customStyles = this.getProperty("styles");
    if (customStyles) {
      this.styles = customStyles;
    } else {
      // Use default styles
      this.styles = `
        :host {
          display: block;
          margin-bottom: 2rem;
        }
        
        .page {
          border: 2px solid #3498db;
          border-radius: 8px;
          padding: 1rem;
          background: #ecf0f1;
        }
        
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #bdc3c7;
        }
        
        .page-actions {
          display: flex;
          gap: 0.5rem;
        }
        
        .btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          background: #3498db;
          color: white;
        }
        
        .btn.danger {
          background: #e74c3c;
        }
        
        .btn:hover {
          opacity: 0.8;
        }
      `;
    }
  }

  public addView(view: View): void {
    this.views.push(view);
    this.addChild(view);

    // Register view with navigation manager via event bus
    const navBus = this.orchestrator.getEventBus("navigation-manager");
    if (navBus) {
      navBus.emit("register-view", { view });
    }
  }

  public removeView(viewId: string): void {
    const viewIndex = this.views.findIndex((v) => v.componentId === viewId);
    if (viewIndex !== -1) {
      this.views.splice(viewIndex, 1);
      this.removeChild(viewId);
    }
  }

  /**
   * Add a screensaver to this page with the specified configuration
   * @param view The view to use as the screensaver
   * @param config Configuration object for the screensaver
   */
  public addScreensaver(view: View, config: ScreensaverConfig): void {
    // First add the view to this page (but don't register it with navigation yet)
    this.views.push(view);
    this.addChild(view);

    // Register the screensaver with the screensaver manager via event bus
    const screensaverBus = this.orchestrator.getEventBus("screensaver-manager");
    if (screensaverBus) {
      screensaverBus.emit("register-screensaver", {
        config: {
          ...config,
          view: view,
        },
      });
    } else {
      throw new Error(
        "Screensaver manager not found. Ensure AppBuilder is properly initialized."
      );
    }
  }

  /**
   * Add a hidden settings page to this page with the specified configuration
   * The settings page is activated by touching corners in sequence: top-left, top-right, bottom-right
   * @param view The view to use as the settings page
   * @param config Configuration object for the settings page
   */
  public addSettings(view: View, config: SettingsConfig): void {
    // First add the view to this page (but don't register it with navigation yet)
    this.views.push(view);
    this.addChild(view);

    // Register the settings with the settings manager via event bus
    const settingsBus = this.orchestrator.getEventBus("settings-manager");
    if (settingsBus) {
      settingsBus.emit("register-settings", {
        config: {
          ...config,
          view: view,
        },
      });
    } else {
      throw new Error(
        "Settings manager not found. Ensure AppBuilder is properly initialized."
      );
    }
  }
}

// View - Contains Components
class View extends RenderableComponent {
  private components: Component[] = [];

  constructor(
    id: string,
    orchestrator: EventOrchestrator,
    bubbleChanges: boolean = false,
    customTemplate?: string,
    customStyles?: string
  ) {
    super(id, orchestrator, bubbleChanges);

    // Set custom template/styles before initial render if provided
    if (customTemplate) {
      this.properties.set("template", customTemplate);
    }
    if (customStyles) {
      this.properties.set("styles", customStyles);
    }

    this.performInitialRender();
  }

  protected defineTemplate(): void {
    // Check if a custom template was set via setProperty
    const customTemplate = this.getProperty("template");
    if (customTemplate) {
      this.template = customTemplate;
    } else {
      // Use default template
      this.template = `
        <div class="view" data-view-id="${this.componentId}">
          <div class="view-header">
            <h3>{{viewTitle}}</h3>
            <span class="view-type">{{viewType}}</span>
          </div>
          <div class="view-content">
            <div class="children-container">
              <!-- Components will be rendered here -->
            </div>
          </div>
        </div>
      `;
    }
  }

  protected defineStyles(): void {
    // Check if custom styles were set via setProperty
    const customStyles = this.getProperty("styles");
    if (customStyles) {
      this.styles = customStyles;
    } else {
      // Use default styles
      this.styles = `
        :host {
          display: block;
          margin-bottom: 1rem;
        }
        
        .view {
          border: 1px solid #95a5a6;
          border-radius: 6px;
          padding: 0.75rem;
          background: white;
        }
        
        .view-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
          padding-bottom: 0.25rem;
          border-bottom: 1px solid #ecf0f1;
        }
        
        .view-type {
          background: #95a5a6;
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: 3px;
          font-size: 0.8rem;
        }
      `;
    }
  }

  public addComponent(component: Component): void {
    this.components.push(component);
    this.addChild(component);
  }
  // TODO: Make this actually remove the component from the DOM.
  public removeComponent(componentId: string): void {
    log.trace(`Removing component with ID: ${componentId}`);
    const componentIndex = this.components.findIndex((c) => {
      c.componentId === componentId;
    });
    if (componentIndex !== -1) {
      this.components.splice(componentIndex, 1);
      this.removeChild(componentId);
    }
  }
}

// Component - Leaf nodes in the hierarchy
class Component extends RenderableComponent {
  constructor(
    id: string,
    orchestrator: EventOrchestrator,
    bubbleChanges: boolean = false,
    customTemplate?: string,
    customStyles?: string
  ) {
    super(id, orchestrator, bubbleChanges);

    if (customTemplate) {
      this.properties.set("template", customTemplate);
    }
    if (customStyles) {
      this.properties.set("styles", customStyles);
    }
    this.performInitialRender();
  }

  protected defineTemplate(): void {
    // Check if a custom template was set via setProperty
    const customTemplate = this.getProperty("template");
    if (customTemplate) {
      this.template = customTemplate;
    } else {
      // Use default template
      this.template = `
        <div class="component-container" data-component-id="${this.componentId}">
          <div class="component-header">
            <h4>{{title}}</h4>
            <span class="component-status {{statusClass}}">{{status}}</span>
          </div>
          <div class="component-body">
            <p class="description">{{description}}</p>
            {{#if showContent}}
              <div class="dynamic-content">
                {{content}}
              </div>
            {{else}}
              <div class="no-content-message">
                No content available
              </div>
            {{/if}}
            {{#ifnot isDisabled}}
              <div class="component-controls">
                <button class="control-btn" data-action="toggle">Toggle</button>
              </div>
            {{else}}
              <div class="disabled-message">
                Component is disabled
              </div>
            {{/ifnot}}
          </div>
          <div class="component-actions">
            <button class="action-btn" data-action="{{buttonAction}}">
              {{buttonText}}
            </button>
          </div>
          <div class="children-container">
            <!-- Child components will be inserted here -->
          </div>
        </div>
      `;
    }
  }

  protected defineStyles(): void {
    // Check if custom styles were set via setProperty
    const customStyles = this.getProperty("styles");
    if (customStyles) {
      this.styles = customStyles;
    } else {
      // Use default styles
      this.styles = `
        :host {
          display: block;
          margin-bottom: 0.5rem;
        }
        
        .component-container {
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 0.5rem;
          background: #f9f9f9;
          font-family: Arial, sans-serif;
        }
        
        .component-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }
        
        .component-header h4 {
          margin: 0;
          color: #2c3e50;
        }
        
        .component-status {
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
          font-size: 0.7rem;
          font-weight: bold;
        }
        
        .component-status.active {
          background: #2ecc71;
          color: white;
        }
        
        .component-status.inactive {
          background: #95a5a6;
          color: white;
        }
        
        .dynamic-content {
          background: #f5f5f5;
          padding: 0.5rem;
          border-radius: 4px;
          margin: 0.5rem 0;
        }
        
        .action-btn {
          background: #3498db;
          color: white;
          border: none;
          padding: 0.4rem 0.8rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.8rem;
        }
        
        .action-btn:hover {
          background: #2980b9;
        }
        
        .no-content-message {
          background: #f8f9fa;
          color: #6c757d;
          padding: 0.5rem;
          border-radius: 4px;
          font-style: italic;
          text-align: center;
          margin: 0.5rem 0;
        }
        
        .component-controls {
          margin: 0.5rem 0;
        }
        
        .control-btn {
          background: #28a745;
          color: white;
          border: none;
          padding: 0.3rem 0.6rem;
          border-radius: 3px;
          cursor: pointer;
          font-size: 0.75rem;
        }
        
        .control-btn:hover {
          background: #218838;
        }
        
        .disabled-message {
          background: #f8d7da;
          color: #721c24;
          padding: 0.5rem;
          border-radius: 4px;
          font-style: italic;
          text-align: center;
          margin: 0.5rem 0;
          border: 1px solid #f5c6cb;
        }
      `;
    }
  }
}

export { AppBuilder, Page, View, Component, RenderableComponent, EventBus };
