import { QRCode } from "jsqr";
import { Table } from "./google-sheet-html";
import { range } from "./util";

export type Bit = 0 | 1;
export type BinaryGrid = Bit[][];

export function toBinaryGrid(qrCode: QRCode): BinaryGrid {
    const matrix = qrCode.modules;
    const result: BinaryGrid = [];
    for (let y = 0; y < matrix.height; y++) {
        const row: Bit[] = [];
        for (let x = 0; x < matrix.width; x++) {
            row.push(matrix.get(x, y) ? 1 : 0);
        }
        result.push(row);
    }
    return result;
}

function char(bit: Bit) {
    return bit ? "⬛" : undefined;
}

function BCH_encode(bits: number) {
    let encoded = bits << 10;

    const g = 0b10100110111;
    for (let i = 14; i >= 10; i--) {
        if ((encoded >> i) % 2) {
            encoded ^= g << (i - 10);
        }
    }

    const mask = 0b101010000010010;
    return (encoded | (bits << 10)) ^ mask;
}

const BCH_encoded_bits = range(32).map(BCH_encode);

export function toTable(grid: BinaryGrid): Table {
    const rows = [];

    rows.push([
        {
            text: char(1),
            ref: "BLACK",
        },
        {
            text: "← black character",
        },
    ]);
    rows.push([{}]);

    const formatRows: Table = [];
    grid.forEach((row, r) => {
        formatRows.push(
            row.map((bit, c) => ({
                formula: bit ? "=%BLACK%" : undefined,
                text: char(bit),
                ref: r === 0 && c === 0 ? "CODE" : undefined,
            }))
        );
    });

    const L = grid.length;
    const indices = [0, 1, 2, 3, 4, 5, 7, 8, L - 7, L - 6, L - 5, L - 4, L - 3, L - 2, L - 1];
    const colors = [1, 1, 4, 4, 4, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];

    formatRows[0].push({}, { text: "Horizontal format information (masked):" });
    formatRows[1].push(
        {},
        ...indices.map((c, i) => ({
            backgroundColor: colors[i],
            formula: `=%CODE[8][${c}]%`,
            text: char(grid[8][c]),
        }))
    );
    formatRows[2].push(
        {},
        ...indices.map((c, i) => ({
            formula: '=IF(R[-1]C[0]<>"",1,0)',
            text: grid[8][c].toString(),
            ref: i === 0 ? "HORIZONTAL_BITS" : undefined,
        }))
    );
    indices.forEach((c, i) => (formatRows[8][c].backgroundColor = colors[i]));
    formatRows[4].push({}, { text: "After error correction:" });
    formatRows[5].push(
        {},
        {
            formula: `=LET(
  comment1, "Convert input bits to integer (big endian)",
  inputBits, {${indices.map((_, i) => `%HORIZONTAL_BITS[0][${i}]%`).join("; ")}},
  powers, SEQUENCE(COUNTA(inputBits), 1, COUNTA(inputBits)-1, -1),
  inputInt, SUM(ARRAYFORMULA(inputBits * 2^powers)),

  comment2, "Find the valid option with the smallest Hamming distance",
  options, {${BCH_encoded_bits.join(", ")}},
  hamming, MAP(options, LAMBDA(val, LEN(SUBSTITUTE(BASE(BITXOR(inputInt, val), 2), "0", "")))),
  bestIndex, XMATCH(MIN(hamming), hamming),
  bestOption, INDEX(options, bestIndex),

  comment3, "Convert the option to bits (big endian)",
  result, ARRAYFORMULA(SPLIT(REGEXREPLACE(TEXT(BASE(bestOption, 2), REPT("0", 15)), "(.)", "$1_"), "_")),
  result
)`,
            text: "?",
        }
    );

    rows.push(...formatRows);

    for (const row of rows) {
        for (const cell of row) {
            cell.width = 20;
            cell.height = 20;
        }
    }

    return rows;
}
