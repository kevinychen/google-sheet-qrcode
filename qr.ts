import { QRCode } from "jsqr";
import { Table } from "./google-sheet-html";

export type BinaryGrid = (0 | 1)[][];

export function toBinaryGrid(qrCode: QRCode): BinaryGrid {
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

export function toTable(grid: BinaryGrid): Table {
    const rows = [];

    rows.push([
        {
            width: 20,
            height: 20,
            text: "⬛",
            ref: "BLACK",
        },
        {
            width: 20,
            height: 20,
            text: "← black character",
        },
    ]);
    rows.push([
        {
            height: 20,
        },
    ]);

    grid.forEach((row, r) => {
        rows.push(
            row.map((bit, c) => ({
                width: 20,
                height: 20,
                formula: bit ? "=%BLACK%" : undefined,
                text: bit ? "⬛" : undefined,
            }))
        );
    });

    return rows;
}
