import {
  createOrchestrator,
  AppBuilder,
  configureLogger,
  useAnimations,
} from "interactiv";

// Import animations CSS (required for transitions)
import "interactiv/animations.css";

// Import application styles
import "./styles.css";

// Import pages and views using functional components
import HomePage from "./pages/HomePage";
import HomeView from "./views/HomeView";
import ScreensaverPage from "./pages/ScreensaverPage";
import ScreensaverView from "./views/ScreensaverView";
import SettingsView from "./views/SettingsView";

// Configure logger (based on user preferences)
configureLogger({{DEBUG_MODE}}, "{{LOG_LEVEL}}");

// Create orchestrator
const orchestrator = createOrchestrator();

// Initialize animations (based on user preferences)
if ({{USE_ANIMATIONS}}) {
  useAnimations(orchestrator);
}

// Create app
const app = new AppBuilder(orchestrator);

// Create home page
const homePage = HomePage({
  id: "home-page",
  orchestrator,
  bubbleEvents: false,
  heading: "{{PROJECT_NAME}}",
});

// Create home view
const homeView = HomeView({
  id: "home-view",
  orchestrator,
  bubbleEvents: false,
});

// Add home view to home page
homePage.addView(homeView);

// Create settings view and add to home page
const settingsView = SettingsView({
  id: "settings-view",
  orchestrator,
  bubbleEvents: false,
});

homePage.addSettings(settingsView, {
  view: settingsView,
});

// Create screensaver page
const screensaverPage = ScreensaverPage({
  id: "screensaver-page",
  orchestrator,
  bubbleEvents: false,
});

// Create screensaver view
const screensaverView = ScreensaverView({
  id: "screensaver-view",
  orchestrator,
  bubbleEvents: false,
});

// Add screensaver view to screensaver page
screensaverPage.addView(screensaverView);

// Add pages to app
app.addPage(homePage);

// Add screensaver configuration
app.addScreensaver(screensaverPage, {
  timeoutSeconds: 30, // Activate screensaver after 30 seconds of inactivity
  defaultViewId: "screensaver-view",
  exitBehavior: "return", // Return to the last active page/view when exiting screensaver
  transitionConfig: {
    type: "fade",
    duration: 500,
  },
});

// Attach to DOM
app.attachToDom();

// Navigate to initial view
app.navigateToView("home-view", {
  type: "fade",
  duration: 300,
});
