import htm from "htm";
import jsQR, { QRCode } from "jsqr";
import { h, render } from "preact";
import { useState } from "preact/hooks";

type BinaryGrid = (0 | 1)[][];

function toBinaryGrid(qrCode: QRCode): BinaryGrid {
    const matrix = qrCode.modules;
    const result: BinaryGrid = [];
    for (let y = 0; y < matrix.height; y++) {
        const row: (0 | 1)[] = [];
        for (let x = 0; x < matrix.width; x++) {
            row.push(matrix.get(x, y) ? 1 : 0);
        }
        result.push(row);
    }
    return result;
}

const html = htm.bind(h);

type ImageInputProps = { setGrid: (grid: BinaryGrid) => void };
function ImageInput({ setGrid }: ImageInputProps) {
    function parseImage(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
            console.log("No file selected.");
            return;
        }

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas") as HTMLCanvasElement;
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (!code) {
                console.log("No QR code found.");
                return;
            }

            const grid = toBinaryGrid(code);
            console.log(JSON.stringify(grid));
            setGrid(grid);
        };

        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    }
    return html`
        <div>
            <label>
                Input image:<br />
                <input type="file" accept="image/*" onChange=${parseImage} />
            </label>
        </div>
    `;
}

type OutputCellProps = {
    // e.g. "=R[0]C[1]" (relative indices to current cell)
    formula?: string;
    text?: string;
    width?: number;
    backgroundColor?: string;
};
function OutputCell({ formula, text, width, backgroundColor }: OutputCellProps) {
    let style = "";
    if (width) {
        style += `width:${width}px;`;
    }
    if (backgroundColor) {
        style += `background-color:${backgroundColor};`;
    }
    return html` <td style=${style} data-sheets-formula=${formula}>${text}</td> `;
}

type OutputRowProps = { height?: number; cells?: preact.ComponentChildren };
function OutputRow({ height, cells }: OutputRowProps) {
    let style = "";
    if (height) {
        style += `height:${height}px;`;
    }
    return html`
        <tr style=${style}>
            ${cells}
        </tr>
    `;
}

type OutputGridProps = { grid: BinaryGrid | null };
function OutputGrid({ grid }: OutputGridProps) {
    if (grid === null) {
        return;
    }

    const rows = [];
    for (let y = 0; y < grid.length; y++) {
        const cells = [];
        for (let x = 0; x < grid[y].length; x++) {
            cells.push(html`<${OutputCell} width=${20} text=${grid[y][x] ? "⬛" : undefined} />`);
        }
        rows.push(html`<${OutputRow} height=${20} cells=${cells} />`);
    }
    return html`
        <div id="output-grid">
            <google-sheets-html-origin>
                <table cellspacing="0" cellpadding="0" style="font-size:10pt;">
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </google-sheets-html-origin>
        </div>
    `;
}

type CopyToClipboardProps = { visible: boolean };
function CopyToClipboard({ visible }: CopyToClipboardProps) {
    const [copying, setCopying] = useState(false);
    const handleClick = () => {
        const html = document.getElementById("output-grid")!.innerHTML;
        const content = new Blob([html], { type: "text/html" });
        const data = [new window.ClipboardItem({ [content.type]: content })];
        setCopying(true);
        navigator.clipboard.write(data).then(() => {
            setTimeout(() => setCopying(false), 3000);
        });
    };
    if (visible) {
        return html`<button onClick="${handleClick}">${copying ? "Copied!" : "Copy to clipboard"}</button>`;
    }
}

const sampleGrid: BinaryGrid = [
    [1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1],
    [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0],
    [1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 0, 0, 0, 1, 0, 1, 0, 1, 1, 1],
    [0, 1, 1, 0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 1, 0],
    [0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0],
    [1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 1, 0, 0],
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0, 0],
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0],
    [1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0],
];

function App() {
    const [grid, setGrid] = useState(sampleGrid);

    return html`
        <div>
            <${ImageInput} setGrid=${setGrid} />
            <${OutputGrid} grid=${grid} />
            <${CopyToClipboard} visible=${grid !== undefined} />
        </div>
    `;
}
render(html`<${App} />`, document.body);
