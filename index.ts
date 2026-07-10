import { AppBuilder, Page, View, Component } from "./src/appBuilder";
import { createOrchestrator, EventOrchestrator, EventBus } from "./src/eventBus";
import { NavigationManager } from "./src/navigationManager";
import { ScreensaverManager } from "./src/screensaverManager";
import { SettingsManager } from "./src/settingsManager";
import { EventManager } from "./src/eventManager";
import {
  stateManager,
  getGlobalState,
  setGlobalState,
  subscribeToGlobalState,
  useGlobalStateExternal,
  ExternalStateManager,
  ComponentStateManager,
} from "./src/stateManager";
import type {
  PointerEventData,
  DragCallbacks,
  HoverCallbacks,
  SwipeCallbacks,
} from "./src/eventManager";
import type { StateSubscription } from "./src/stateManager";
import type { ScreensaverConfig } from "./src/screensaverManager";
import type { SettingsConfig } from "./src/settingsManager";
import type { PageProps, ComponentProps, ViewProps } from "./src/types";
import { css, html } from "./utils/template-helpers";
import { Logger } from "./utils/logger";
import { useAnimations, AnimationManager } from "./src/animationBus";
import { configureLogger } from "./src/logger";
import {
  GarbageCollector,
  createGarbageCollector,
  type GarbageCollectionStats,
} from "./src/garbageCollector";
import {
  TransitionOverlay,
  transitionWithOverlay,
  type TransitionOverlayConfig,
  type TransitionRequestPayload,
} from "./src/transitionOverlay";
import {
  MediaQueue,
  type MediaItem,
  type MediaQueueElements,
  type MediaQueueEvent,
  type MediaPriority,
  type MediaType,
} from "./src/mediaQueue";
import {
  ScheduledEventManager,
  type ScheduleConfig,
  type InterruptBehavior,
} from "./src/scheduledEventManager";
export {
  createOrchestrator,
  EventOrchestrator,
  EventBus,
  AppBuilder,
  Page,
  View,
  Component,
  NavigationManager,
  ScreensaverManager,
  SettingsManager,
  EventManager,
  AnimationManager,
  // External State Management
  stateManager,
  getGlobalState,
  setGlobalState,
  subscribeToGlobalState,
  useGlobalStateExternal,
  useAnimations,
  ExternalStateManager,
  ComponentStateManager,
  // Garbage Collection
  GarbageCollector,
  createGarbageCollector,
  // Transition Overlay System
  TransitionOverlay,
  transitionWithOverlay,
  // Media & Scheduling
  MediaQueue,
  ScheduledEventManager,
  css,
  html,
  Logger,
  configureLogger,
};

export type {
  PointerEventData,
  DragCallbacks,
  HoverCallbacks,
  SwipeCallbacks,
  StateSubscription,
  ScreensaverConfig,
  SettingsConfig,
  PageProps,
  ViewProps,
  ComponentProps,
  GarbageCollectionStats,
  TransitionOverlayConfig,
  TransitionRequestPayload,
  MediaItem,
  MediaQueueElements,
  MediaQueueEvent,
  MediaPriority,
  MediaType,
  ScheduleConfig,
  InterruptBehavior,
};

// Named exports for direct import
// export {
//   stateManager,
//   getGlobalState,
//   setGlobalState,
//   subscribeToGlobalState,
//   useGlobalStateExternal,
//   ExternalStateManager,
// };
