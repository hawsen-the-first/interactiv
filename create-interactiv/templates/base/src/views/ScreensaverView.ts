import { View, html, css } from "interactiv";
import type { ViewProps } from "interactiv";

interface Props extends ViewProps {}

export default function ScreensaverView(props: Props) {
  const { id, orchestrator, bubbleEvents } = props;

  const viewTemplate = html`
    <div class="screensaver-view">
      <div class="screensaver-content">
        <div class="clock-container">
          <div class="time" id="time-display">--:--:--</div>
          <div class="date" id="date-display">--- --, ----</div>
        </div>
        <p class="instruction">Touch anywhere to exit screensaver</p>
      </div>
    </div>
  `;

  const viewStyles = css`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
    }

    .screensaver-view {
      width: 100%;
      height: 100%;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .screensaver-content {
      text-align: center;
      color: white;
    }

    .clock-container {
      margin-bottom: 2rem;
    }

    .time {
      font-size: 6rem;
      font-weight: 300;
      font-family: monospace;
      margin-bottom: 1rem;
      text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
    }

    .date {
      font-size: 2rem;
      opacity: 0.8;
    }

    .instruction {
      font-size: 1.2rem;
      opacity: 0.6;
      margin-top: 3rem;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 0.6;
      }
      50% {
        opacity: 0.3;
      }
    }
  `;

  const view = new View(id, orchestrator, bubbleEvents, viewTemplate, viewStyles);

  // Setup clock functionality
  let clockInterval: number;

  const originalOnAfterRender = view.onAfterRender.bind(view);
  view.onAfterRender = function() {
    originalOnAfterRender();
    
    const updateClock = () => {
      const now = new Date();
      
      const timeElement = this.shadowRoot.querySelector("#time-display");
      const dateElement = this.shadowRoot.querySelector("#date-display");

      if (timeElement) {
        const hours = String(now.getHours()).padStart(2, "0");
        const minutes = String(now.getMinutes()).padStart(2, "0");
        const seconds = String(now.getSeconds()).padStart(2, "0");
        timeElement.textContent = `${hours}:${minutes}:${seconds}`;
      }

      if (dateElement) {
        const options: Intl.DateTimeFormatOptions = {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        };
        dateElement.textContent = now.toLocaleDateString("en-US", options);
      }
    };

    // Update immediately and then every second
    updateClock();
    clockInterval = window.setInterval(updateClock, 1000);
  };

  // Cleanup interval on destroy
  const originalDestroy = view.destroy.bind(view);
  view.destroy = function() {
    if (clockInterval) {
      clearInterval(clockInterval);
    }
    originalDestroy();
  };

  return view;
}
