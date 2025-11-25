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
import { useAnimations } from "./src/animationBus";
import { configureLogger } from "./src/logger";

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
  // External State Management
  stateManager,
  getGlobalState,
  setGlobalState,
  subscribeToGlobalState,
  useGlobalStateExternal,
  useAnimations,
  ExternalStateManager,
  ComponentStateManager,
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
