/**
 * Utility for converting our internal table object into HTML that can be pasted into Google Sheets.
 */

import { assert } from "./util";

export type Cell = {
    width?: number;
    height?: number;
    backgroundColor?: number;
    formula?: string;
    text?: string;

    /*
     * If another cell's formula contains the substring "%<ref>%", then it will be replaced with
     * R[?]C[?] corresponding to this cell. If a formula contains the substring "%<ref>%[r][c]",
     * then it will be replaced with the cell r rows down and c columns right from this one.
     *
     * All refs should be distinct, and only letters, numbers, and underscores are allowed.
     */
    ref?: string;
};

export type Table = Cell[][];

const refRegex = "[A-Za-z0-9_]+";
const numberRegex = "-?[0-9]{1,3}";
const colors = ["", "#f4cccc", "", "", "#d9ead3", "", "", "#cfe2f3", "", ""];

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
            if (cell.width) {
                style += `width:${cell.width}px;`;
                style += `max-width:${cell.width}px;`;
            }
            if (cell.height) {
                style += `height:${cell.height}px;`;
                style += `max-height:${cell.height}px;`;
            }
            if (cell.backgroundColor) {
                style += `background-color:${colors[cell.backgroundColor]};`;
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
