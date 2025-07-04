import { BrowserCodeReader } from "@zxing/browser";
import { BitMatrix } from "@zxing/library";
import ErrorCorrectionLevel from "@zxing/library/esm/core/qrcode/decoder/ErrorCorrectionLevel";
import Detector from "@zxing/library/esm/core/qrcode/detector/Detector";
import Encoder from "@zxing/library/esm/core/qrcode/encoder/Encoder";
import htm from "htm";
import { h, render } from "preact";
import { useState } from "preact/hooks";
import { toHtml } from "./google-sheet-html";
import { BinaryGrid, Bit, toTable } from "./qr";

const NO_HINTS = new Map();

const html = htm.bind(h);

function fromBitMatrix(bits: BitMatrix): BinaryGrid {
    const grid: BinaryGrid = [];
    for (let y = 0; y < bits.getHeight(); y++) {
        const row: Bit[] = [];
        for (let x = 0; x < bits.getWidth(); x++) {
            row.push(bits.get(x, y) ? 1 : 0);
        }
        grid.push(row);
    }
    return grid;
}

function generateQRCode(content: string, errorCorrectionLevel: ErrorCorrectionLevel): BinaryGrid {
    const qrCode = Encoder.encode(content, errorCorrectionLevel, NO_HINTS).getMatrix();
    const grid: BinaryGrid = [];
    for (let y = 0; y < qrCode.getHeight(); y++) {
        const row: Bit[] = [];
        for (let x = 0; x < qrCode.getWidth(); x++) {
            row.push(qrCode.get(x, y) ? 1 : 0);
        }
        grid.push(row);
    }
    return grid;
}

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
            const binaryBitmap = BrowserCodeReader.createBinaryBitmapFromMediaElem(img);
            const detectorResult = new Detector(binaryBitmap.getBlackMatrix()).detect(NO_HINTS);
            const grid = fromBitMatrix(detectorResult.getBits());
            setGrid(grid);
            console.log(JSON.stringify(grid));
        };

        const reader = new FileReader();
        reader.onload = (e: ProgressEvent<FileReader>) => {
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    }
    return html`
        <label class="big-button">
            Upload QR Code image
            <input type="file" style="display: none;" accept="image/*" onChange=${parseImage} />
        </label>
    `;
}

function CopyToClipboard() {
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
    return html`<span class="big-button" onClick="${handleClick}">
        ${copying ? "Copied!" : "Copy contents to clipboard"}
    </span>`;
}

function App() {
    const [grid, setGrid] = useState(undefined);
    // const [grid, setGrid] = useState(generateQRCode("Hello!", ErrorCorrectionLevel.M));

    const nodes = [html`<${ImageInput} setGrid=${setGrid} />`];
    if (grid) {
        const params = new URLSearchParams(window.location.search);
        const table = toTable(grid, params.has("raw"));

        console.log(`table dimensions: ${table.length} x ${Math.max(...table.map(row => row.length))}`);

        nodes.push(html`<${CopyToClipboard} />`);
        nodes.push(toHtml(html, table));
    }
    return nodes;
}
render(html`<${App} />`, document.body);
