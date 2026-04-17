import { Page, html, css } from "interactiv";
import type { PageProps } from "interactiv";

interface Props extends PageProps {
  heading?: string;
}

export default function HomePage(props: Props) {
  const { id, orchestrator, bubbleEvents, heading = "Home Page" } = props;

  const customTemplate = html`
    <div class="home-page">
      <div class="children-container"></div>
    </div>
  `;

  const customStyles = css`
    :host {
      display: block;
      width: 100%;
      height: 100vh;
    }

    .home-page {
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
  `;

  const page = new Page(id, orchestrator, bubbleEvents, customTemplate, customStyles);
  page.setProperty("pageTitle", heading);

  return page;
}
