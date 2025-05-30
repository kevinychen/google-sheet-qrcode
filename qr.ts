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

const BCH_options = range(32).map(BCH_encode);

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
                text: char(bit),
                formula: bit ? "=%BLACK%" : undefined,
                ref: r === 0 && c === 0 ? "CODE" : undefined,
            }))
        );
    });

    const L = grid.length;
    const colors = [1, 1, 4, 4, 4, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
    const formatAnnotations: Table = [];

    const indices = [0, 1, 2, 3, 4, 5, 7, 8, L - 7, L - 6, L - 5, L - 4, L - 3, L - 2, L - 1];
    const horizontalBits = indices.map(c => grid[8][c]);
    formatAnnotations.push([{ text: "Horizontal format information (masked):" }]);
    formatAnnotations.push(
        indices.map((c, i) => ({
            backgroundColor: colors[i],
            text: char(horizontalBits[i]),
            formula: `=%CODE[8][${c}]%`,
        }))
    );
    formatAnnotations.push(
        indices.map((c, i) => ({
            text: horizontalBits[i].toString(),
            formula: '=IF(R[-1]C[0]<>"",1,0)',
            ref: i === 0 ? "HORIZONTAL_BITS" : undefined,
        }))
    );
    indices.forEach((c, i) => (formatRows[8][c].backgroundColor = colors[i]));

    indices.reverse();
    const verticalBits = indices.map(c => grid[c][8]);
    formatAnnotations.push([]);
    formatAnnotations.push([{ text: "Vertical format information (masked):" }]);
    formatAnnotations.push(
        indices.map((c, i) => ({
            backgroundColor: colors[i],
            text: char(verticalBits[i]),
            formula: `=%CODE[${c}][8]%`,
        }))
    );
    formatAnnotations.push(
        indices.map((c, i) => ({
            text: verticalBits[i].toString(),
            formula: '=IF(R[-1]C[0]<>"",1,0)',
            ref: i === 0 ? "VERTICAL_BITS" : undefined,
        }))
    );
    indices.forEach((c, i) => (formatRows[c][8].backgroundColor = colors[i]));

    // The 15 bits in both the horizontal format information and vertical format information are
    // encoded with a BCH(15, 5) code. Find the option (out of 2^5 options) that has the closest
    // hamming distance to the format information in the QR code.
    const horizontalInt = parseInt(horizontalBits.join(""), 2);
    const verticalInt = parseInt(verticalBits.join(""), 2);
    const hamming = BCH_options.map(
        val => ((horizontalInt ^ val).toString(2) + (verticalInt ^ val).toString(2)).replace("0", "").length
    );
    const bestIndex = hamming.indexOf(Math.min(...hamming));
    const bestOption = BCH_options[bestIndex];
    const formatBits = range(15).map(i => ((bestOption >> (14 - i)) % 2) as Bit);
    formatAnnotations.push([]);
    formatAnnotations.push([{ text: "After format information error correction:" }]);
    formatAnnotations.push(
        formatBits.map((bit, i) => ({
            backgroundColor: colors[i],
            text: char(bit),
            formula: `=IF(%FORMAT[0][${i}]%<>"0", %BLACK%, "")`,
        }))
    );
    formatAnnotations.push([
        {
            text: formatBits.join(" "),
            formula: `=LET(
  comment1, "Convert input bits to integer (big endian)",
  powers, SEQUENCE(15, 1, 14, -1),
  horizontalBits, {${indices.map((_, i) => `%HORIZONTAL_BITS[0][${i}]%`).join("; ")}},
  verticalBits, {${indices.map((_, i) => `%VERTICAL_BITS[0][${i}]%`).join("; ")}},
  horizontalInt, SUM(ARRAYFORMULA(horizontalBits * 2^powers)),
  verticalInt, SUM(ARRAYFORMULA(verticalBits * 2^powers)),

  comment2, "Find the valid option with the smallest Hamming distance",
  options, {${BCH_options.join(", ")}},
  hamming, MAP(options, LAMBDA(val, LEN(SUBSTITUTE(
      BASE(BITXOR(horizontalInt, val), 2) & BASE(BITXOR(verticalInt, val), 2), "0", "")))),
  bestIndex, XMATCH(MIN(hamming), hamming),
  bestOption, INDEX(options, bestIndex),

  comment3, "Convert the option to bits (big endian)",
  formatBits, ARRAYFORMULA(SPLIT(REGEXREPLACE(TEXT(BASE(bestOption, 2), REPT("0", 15)), "(.)", "$1_"), "_")),
  formatBits
)`,
            ref: "FORMAT",
        },
    ]);

    // https://en.wikipedia.org/wiki/QR_code#/media/File:QR_Format_Information.svg
    const errorCorrectionLevels = "HQML";
    const errorCorrectionLevelWords = ["HIGH", "QUARTILE", "MEDIUM", "LOW"];
    const errorCorrectionLevel = errorCorrectionLevels[parseInt(formatBits.slice(0, 2).join(""), 2)];
    formatAnnotations.push([]);
    formatAnnotations.push([
        ...formatBits.slice(0, 2).map((bit, i) => ({
            backgroundColor: 1,
            text: char(bit),
            formula: `=IF(%FORMAT[0][${i}]%<>"0", %BLACK%, "")`,
        })),
        {
            text: errorCorrectionLevel,
            formula: `=INDEX({${errorCorrectionLevels
                .split("")
                .map(c => `"${c}"`)
                .join("; ")}}, %FORMAT% * 2 + %FORMAT[0][1]% + 1)`,
        },
        ...range(4).map(_ => ({})),
        {
            text: `Grid error correction: ${
                errorCorrectionLevelWords[errorCorrectionLevels.indexOf(errorCorrectionLevel)]
            }`,
            formula: `="Grid error correction: " & INDEX({${errorCorrectionLevelWords
                .map(c => `"${c}"`)
                .join("; ")}}, %FORMAT% * 2 + %FORMAT[0][1]% + 1)`,
        },
    ]);
    formatAnnotations.push([
        {},
        {},
        ...formatBits.slice(2, 5).map((bit, i) => ({
            backgroundColor: 4,
            text: char(bit),
            formula: `=IF(%FORMAT[0][${i + 2}]%<>"0", %BLACK%, "")`,
        })),
        {
            text: formatBits.slice(2, 5).join(""),
            formula: "=CONCATENATE(%FORMAT[0][2]%, %FORMAT[0][3]%, %FORMAT[0][4]%)",
        },
        {},
        {
            text: "Mask:",
        },
    ]);
    formatAnnotations.push([]);

    // Mask
    const masks = {
        "111": "",
    };
    for (let i = 0; i < 6; i++) {}

    formatAnnotations.forEach((row, i) => formatRows[i].push({}, ...row));

    rows.push(...formatRows);

    for (const row of rows) {
        for (const cell of row) {
            cell.width = 20;
            cell.height = 20;
        }
    }

    return rows;
}
