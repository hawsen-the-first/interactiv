/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/no-this-alias */
import { logger } from "./logger";
const log = logger;

class State {
  private events: any;
  constructor() {
    this.events = {};
  }

  public subscribe(event: string, callback: (data: any) => any) {
    const me = this;
    if (!me.events.hasOwnProperty(event)) {
      me.events[event] = [];
    }
    return me.events[event].push(callback);
  }

  public publish(event: string, data = {}) {
    const me = this;
    if (!me.events.hasOwnProperty(event)) {
      return [];
    }
    return me.events[event].map((callback: (data: any) => any) => callback(data));
  }

  public unsubscribe(event: string, callbackIndex: number): void {
    if (this.events.hasOwnProperty(event) && this.events[event][callbackIndex - 1]) {
      this.events[event].splice(callbackIndex - 1, 1);
    }
  }
}

interface StoreParams {
  mutations?: object;
  state?: Store;
  status?: string;
  events?: object;
}

export interface StateSubscription {
  unsubscribe: () => void;
}

export class Store {
  private mutations: any;
  private state: any;
  private status: string;
  private events: State;
  private stateSubscriptions: Map<string, Set<(value: any, key: string) => void>> = new Map();

  constructor(params: StoreParams) {
    const me = this;
    if (params.hasOwnProperty("mutations")) {
      this.mutations = params.mutations;
    } else {
      this.mutations = {};
    }

    this.state = new Proxy(params.state || {}, {
      set: function (state: any, key: string, value: any) {
        const oldValue = state[key];
        state[key] = value;

        // Notify specific key subscribers
        if (me.stateSubscriptions.has(key)) {
          me.stateSubscriptions.get(key)!.forEach((callback) => {
            callback(value, key);
          });
        }

        // Notify general state change listeners
        me.events.publish("stateChange", { key, value, oldValue, state: me.state });

        if (me.status !== "mutation") {
          log.warn(`You should use a mutation to set the value for state object ${key}.`);
        }
        me.status = "resting";
        return true;
      },
    });

    this.status = "resting";
    this.events = new State();
  }

  public getStateObject() {
    return this.state;
  }

  public getStateValue(key: string): any {
    return this.state[key];
  }

  public setStateValue(key: string, value: any): void {
    this.status = "mutation";
    this.state[key] = value;
  }

  public subscribeToKey(key: string, callback: (value: any, key: string) => void): StateSubscription {
    if (!this.stateSubscriptions.has(key)) {
      this.stateSubscriptions.set(key, new Set());
    }

    this.stateSubscriptions.get(key)!.add(callback);

    return {
      unsubscribe: () => {
        const subscribers = this.stateSubscriptions.get(key);
        if (subscribers) {
          subscribers.delete(callback);
          if (subscribers.size === 0) {
            this.stateSubscriptions.delete(key);
          }
        }
      },
    };
  }

  public mutateStore(mutationKey: string, payload: any) {
    const me = this;
    if (typeof me.mutations[mutationKey] !== "function") {
      log.warn(`Mutation with identifier ${mutationKey} does not exist`);
      return false;
    }
    me.status = "mutation";

    const newState = me.mutations[mutationKey](me.state, payload);
    me.state = Object.assign(me.state, newState);

    return true;
  }
}

// Global store instance
const globalStore = new Store({});

// Component-level state management
export class ComponentStateManager {
  private localState: Map<string, any> = new Map();
  private stateSubscriptions: Map<string, StateSubscription> = new Map();
  private onStateChange: (key: string, value: any, isLocal: boolean) => void;
  private stateProxy: any = null;

  constructor(_: string, onStateChange: (key: string, value: any, isLocal: boolean) => void) {
    this.onStateChange = onStateChange;
    this.createStateProxy();
  }

  private createStateProxy(): void {
    this.stateProxy = new Proxy(
      {},
      {
        get: (_, key: string) => {
          return this.localState.get(key);
        },
        set: (_, key: string, value: any) => {
          const oldValue = this.localState.get(key);
          if (oldValue !== value) {
            this.localState.set(key, value);
            this.onStateChange(key, value, true);
          }
          return true;
        },
        has: (_, key: string) => {
          return this.localState.has(key);
        },
        ownKeys: (_) => {
          return Array.from(this.localState.keys());
        },
        getOwnPropertyDescriptor: (_, key: string) => {
          if (this.localState.has(key)) {
            return {
              enumerable: true,
              configurable: true,
              value: this.localState.get(key),
            };
          }
          return undefined;
        },
      }
    );
  }

  public getStateProxy(): any {
    return this.stateProxy;
  }

  public defineState(initialState: Record<string, any>): void {
    Object.entries(initialState).forEach(([key, value]) => {
      if (!this.localState.has(key)) {
        this.localState.set(key, value);
        // Trigger initial state change to sync with component properties
        this.onStateChange(key, value, true);
      }
    });
  }

  // Local state management
  public useState<T>(key: string, initialValue: T): [T, (newValue: T) => void] {
    // Initialize if not exists
    if (!this.localState.has(key)) {
      this.localState.set(key, initialValue);
    }

    const currentValue = this.localState.get(key) as T;

    const setter = (newValue: T) => {
      const oldValue = this.localState.get(key);
      if (oldValue !== newValue) {
        this.localState.set(key, newValue);
        this.onStateChange(key, newValue, true);
      }
    };

    return [currentValue, setter];
  }

  // Global state management
  public useGlobalState<T>(key: string, initialValue?: T): [T, (newValue: T) => void] {
    // Initialize global state if provided and doesn't exist
    if (initialValue !== undefined && globalStore.getStateValue(key) === undefined) {
      globalStore.setStateValue(key, initialValue);
    }

    const currentValue = globalStore.getStateValue(key) as T;

    // Subscribe to global state changes if not already subscribed
    if (!this.stateSubscriptions.has(key)) {
      const subscription = globalStore.subscribeToKey(key, (value) => {
        this.onStateChange(key, value, false);
      });
      this.stateSubscriptions.set(key, subscription);
    }

    const setter = (newValue: T) => {
      globalStore.setStateValue(key, newValue);
    };

    return [currentValue, setter];
  }

  public getLocalState(key: string): any {
    return this.localState.get(key);
  }

  public destroy(): void {
    // Clean up all global state subscriptions
    this.stateSubscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
    this.stateSubscriptions.clear();
    this.localState.clear();
  }
}

export function createLocalStateStore(initialValue: any) {
  const id = crypto.randomUUID();
  const setter = (newValue: any) => {
    globalStore.setStateValue(id, newValue);
  };
  if (initialValue !== null) {
    globalStore.setStateValue(id, initialValue);
  }
  return [globalStore.getStateValue(id), setter];
}

// External State Management Utilities
export function getGlobalState(key: string): any {
  return globalStore.getStateValue(key);
}

export function setGlobalState(key: string, value: any): void {
  globalStore.setStateValue(key, value);
}

export function subscribeToGlobalState(key: string, callback: (value: any, key: string) => void): StateSubscription {
  return globalStore.subscribeToKey(key, callback);
}

export function useGlobalStateExternal<T>(key: string, initialValue?: T): [T, (newValue: T) => void] {
  // Initialize if provided and doesn't exist
  if (initialValue !== undefined && globalStore.getStateValue(key) === undefined) {
    globalStore.setStateValue(key, initialValue);
  }

  const currentValue = globalStore.getStateValue(key) as T;

  const setter = (newValue: T) => {
    globalStore.setStateValue(key, newValue);
  };

  return [currentValue, setter];
}

// State Manager Singleton for external access
export class ExternalStateManager {
  private static instance: ExternalStateManager;

  private constructor() {}

  public static getInstance(): ExternalStateManager {
    if (!ExternalStateManager.instance) {
      ExternalStateManager.instance = new ExternalStateManager();
    }
    return ExternalStateManager.instance;
  }

  public get<T>(key: string): T {
    return globalStore.getStateValue(key) as T;
  }

  public set<T>(key: string, value: T): void {
    globalStore.setStateValue(key, value);
  }

  public useState<T>(key: string, initialValue?: T): [T, (newValue: T) => void] {
    return useGlobalStateExternal(key, initialValue);
  }

  public subscribe(key: string, callback: (value: any, key: string) => void): StateSubscription {
    return globalStore.subscribeToKey(key, callback);
  }

  public getAll(): any {
    return globalStore.getStateObject();
  }

  public has(key: string): boolean {
    return globalStore.getStateValue(key) !== undefined;
  }

  public remove(key: string): void {
    globalStore.setStateValue(key, undefined);
  }

  public clear(): void {
    const stateObj = globalStore.getStateObject();
    Object.keys(stateObj).forEach((key) => {
      globalStore.setStateValue(key, undefined);
    });
  }
}

// Convenience instance for immediate use
export const stateManager = ExternalStateManager.getInstance();

export { globalStore };
