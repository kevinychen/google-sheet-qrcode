import htm from "htm";
import { h, render } from "preact";

const html = htm.bind(h);

const App = () => html`
    <div>
        <p>Hello world</p>
    </div>
`;

render(html`<${App} />`, document.body);
