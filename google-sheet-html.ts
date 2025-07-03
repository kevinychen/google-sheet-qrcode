/**
 * Utility for converting our internal table object into HTML that can be pasted into Google Sheets.
 */

import { assert } from "./util";

export type Cell = {
    width?: number;
    height?: number;
    backgroundColor?: string;
    border?: boolean;
    text?: string;
    formula?: string;

    /*
     * If another cell's formula contains the substring "%<ref>%", then it will be replaced with
     * R[?]C[?] corresponding to this cell. If a formula contains the substring "%<ref>%[r][c]",
     * then it will be replaced with the cell r rows down and c columns right from this one.
     *
     * All refs should be distinct. Only uppercase letters, numbers, and underscores are allowed.
     */
    ref?: string;
};

export type Table = Cell[][];

/*
 * Google sheets built-in BIN2DEC only works for numbers up to 2^10.
 * Use this instead to go up to 2^20.
 * Usage: `LET(${betterBin2Dec}, betterBin2Dec(...))
 */
export const betterBin2Dec =
    "betterBin2dec, LAMBDA(str, LET(n, LEN(str), d, FLOOR(n / 2), BITLSHIFT(BIN2DEC(MID(str, 1, n - d)), d) + BIN2DEC(MID(str, n - d + 1, d))))";
export const GRAY_COLOR = "#999999";
export const RAINBOW_COLORS = [
    /* 10 rainbow colors */
    "#e6b8af",
    "#f4cccc",
    "#fce5cd",
    "#fff2cc",
    "#d9ead3",
    "#d0e0e3",
    "#c9daf8",
    "#cfe2f3",
    "#d9d2e9",
    "#ead1dc",
];

const refRegex = "[A-Z0-9_]+";
const numberRegex = "-?[0-9]{1,3}";

export function toHtml(html: any, table: Table) {
    const refs = new Map();
    table.forEach((row, r) => {
        row.forEach((cell, c) => {
            if (cell.ref) {
                assert(cell.ref.match(refRegex), `Ref ${cell.ref} must match pattern ${refRegex}`);
                assert(!refs.has(cell.ref), `Duplicate ref ${cell.ref} found in table`);

                refs.set(cell.ref, [r, c]);
            }
        });
    });

    const rows = table.map((row, r) => {
        const cells = row.map((cell, c) => {
            let style = "white-space:nowrap;";
            if (cell.width !== undefined) {
                style += `width:${cell.width}px;`;
                style += `max-width:${cell.width}px;`;
            }
            if (cell.height !== undefined) {
                style += `height:${cell.height}px;`;
                style += `max-height:${cell.height}px;`;
            }
            if (cell.backgroundColor !== undefined) {
                style += `background-color:${cell.backgroundColor};`;
            }
            if (cell.border) {
                style += `border: 1px solid #cccccc`;
            }

            // replace %ref% in the formula with e.g. R[0]C[1]
            let formula = cell.formula;
            let match;
            while (formula) {
                if ((match = formula.match(`%(${refRegex})%`))) {
                    const ref = match[1];
                    if (refs.has(ref)) {
                        const [other_r, other_c] = refs.get(ref);
                        formula = formula.replace(`%${ref}%`, `R[${other_r - r}]C[${other_c - c}]`);
                        continue;
                    }
                }
                if ((match = formula.match(`%(${refRegex})\\[(${numberRegex})]\\[(${numberRegex})]%`))) {
                    const ref = match[1];
                    const dr = parseInt(match[2]);
                    const dc = parseInt(match[3]);
                    if (refs.has(ref)) {
                        const [other_r, other_c] = refs.get(ref);
                        formula = formula.replace(
                            `%${ref}[${dr}][${dc}]%`,
                            `R[${other_r - r + dr}]C[${other_c - c + dc}]`
                        );
                        continue;
                    }
                }
                break;
            }

            return html`<td style=${style} data-sheets-formula=${formula}>${cell.text}</td>`;
        });

        return html`<tr>
            ${cells}
        </tr>`;
    });

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
