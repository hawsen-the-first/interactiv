import { Page, html, css } from "interactiv";
import type { PageProps } from "interactiv";

interface Props extends PageProps {}

export default function ScreensaverPage(props: Props) {
  const { id, orchestrator, bubbleEvents } = props;

  const customTemplate = html`
    <div class="screensaver-page">
      <div class="children-container"></div>
    </div>
  `;

  const customStyles = css`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
    }

    .screensaver-page {
      width: 100%;
      height: 100%;
      background: #000;
    }
  `;

  const page = new Page(id, orchestrator, bubbleEvents, customTemplate, customStyles);

  return page;
}
