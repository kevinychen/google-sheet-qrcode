import { QRCode } from "jsqr";
import { Table } from "./google-sheet-html";
import { assert, range } from "./util";

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
    return bit ? "⬛" : "";
}

function BCH_encode(bits: number) {
    const upperMask = 0b10101;
    const lowerMask = 0b10010;

    let encoded = (bits ^ upperMask) << 10;

    const g = 0b10100110111;
    for (let i = 14; i >= 10; i--) {
        if ((encoded >> i) % 2) {
            encoded ^= g << (i - 10);
        }
    }

    return (bits << 10) + (encoded ^ lowerMask);
}

const BCH_options = range(32).map(BCH_encode);

export function toTable(grid: BinaryGrid): Table {
    assert(grid.length >= 21 && grid.length <= 177 && grid.length % 4 === 1, "Invalid QR code size");
    for (const row of grid) {
        assert(row.length === grid.length, "QR code must be a square");
    }

    const L = grid.length;
    const version = (L - 17) / 4;

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
    rows.push([
        {
            text: char(0),
            ref: "WHITE",
        },
        {
            text: "← white character",
        },
    ]);

    // Original QR code
    const formatRows: Table = grid.map((row, r) =>
        row.map((bit, c) => ({
            text: char(bit),
            formula: bit ? "=%BLACK%" : "=%WHITE%",
            ref: r === 0 && c === 0 ? "CODE" : undefined,
        }))
    );

    // Display format information modules on the right side of the original QR code
    const colors = [1, 1, 4, 4, 4, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
    const formatAnnotations: Table = [];

    const indices = [0, 1, 2, 3, 4, 5, 7, 8, L - 7, L - 6, L - 5, L - 4, L - 3, L - 2, L - 1];
    const horizontalBits = indices.map(c => grid[8][c]);
    formatAnnotations.push([{ text: "Horizontal format information (masked):" }]);
    formatAnnotations.push(
        indices.map((c, i) => {
            formatRows[8][c].backgroundColor = colors[i];
            return {
                backgroundColor: colors[i],
                text: char(horizontalBits[i]),
                formula: `=%CODE[8][${c}]%`,
            };
        })
    );
    formatAnnotations.push(
        horizontalBits.map((bit, i) => ({
            text: bit.toString(),
            formula: "=IF(R[-1]C[0]<>%WHITE%, 1, 0)",
            ref: i === 0 ? "HORIZONTAL_BITS" : undefined,
        }))
    );

    indices.reverse();
    const verticalBits = indices.map(c => grid[c][8]);
    formatAnnotations.push([]);
    formatAnnotations.push([{ text: "Vertical format information (masked):" }]);
    formatAnnotations.push(
        indices.map((c, i) => {
            formatRows[c][8].backgroundColor = colors[i];
            return {
                backgroundColor: colors[i],
                text: char(verticalBits[i]),
                formula: `=%CODE[${c}][8]%`,
            };
        })
    );
    formatAnnotations.push(
        verticalBits.map((bit, i) => ({
            text: bit.toString(),
            formula: "=IF(R[-1]C[0]<>%WHITE%, 1, 0)",
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
    const bestOptionIndex = hamming.indexOf(Math.min(...hamming));
    formatAnnotations.push([]);
    formatAnnotations.push([
        { text: "Format information after error correction:" },
        ...range(13).map(_ => ({})),
        {
            text: bestOptionIndex.toString(),
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
                bestOptionIndex, XMATCH(MIN(hamming), hamming) - 1,
                bestOptionIndex
                )`,
            ref: "BEST_OPTION_INDEX",
        },
    ]);

    // Display the bits of that best option
    const bestOption = BCH_options[bestOptionIndex];
    const formatBits = range(15).map(i => ((bestOption >> (14 - i)) % 2) as Bit);
    formatAnnotations.push(
        range(15).map(i => ({
            backgroundColor: colors[i],
            text: char(((bestOption >> (14 - i)) % 2) as Bit),
            formula: `=INDEX({${BCH_options.map(option => `"${char(((option >> (14 - i)) % 2) as Bit)}"`).join(
                "; "
            )}}, %BEST_OPTION_INDEX% + 1)`,
        }))
    );
    formatAnnotations.push(
        range(15).map(i => ({
            text: ((bestOption >> (14 - i)) % 2).toString(),
            formula: "=IF(R[-1]C[0]<>%WHITE%, 1, 0)",
            ref: i === 0 ? "FORMAT" : undefined,
        }))
    );

    // Interpret format information bits
    // https://en.wikipedia.org/wiki/QR_code#/media/File:QR_Format_Information.svg
    const errorCorrectionLevels = "HQML";
    const errorCorrectionLevelWords = ["H (HIGH)", "Q (QUARTILE)", "M (MEDIUM)", "L (LOW)"];
    const errorCorrectionLevel = errorCorrectionLevels[parseInt(formatBits.slice(0, 2).join(""), 2)];
    formatAnnotations.push([]);
    formatAnnotations.push([
        {
            backgroundColor: 1,
            text: errorCorrectionLevel,
            formula: `=INDEX({${errorCorrectionLevels
                .split("")
                .map(c => `"${c}"`)
                .join("; ")}}, %FORMAT% * 2 + %FORMAT[0][1]% + 1)`,
            ref: "EC_LEVEL",
        },
        {
            backgroundColor: 1,
        },
        ...range(4).map(_ => ({})),
        {
            text: `Grid error correction: ${
                errorCorrectionLevelWords[errorCorrectionLevels.indexOf(errorCorrectionLevel)]
            }`,
            formula: `="Grid error correction: " & INDEX({${errorCorrectionLevelWords
                .map(word => `"${word}"`)
                .join("; ")}}, XMATCH(%EC_LEVEL%, {${errorCorrectionLevels
                .split("")
                .map(c => `"${c}"`)
                .join("; ")}}))`,
        },
    ]);
    const maskIndex = parseInt(formatBits.slice(2, 5).join(""), 2);
    formatAnnotations.push([
        {},
        {},
        {
            backgroundColor: 4,
            text: maskIndex.toString(),
            formula: "=%FORMAT[0][2]% * 4 + %FORMAT[0][3]% * 2 + %FORMAT[0][4]%",
            ref: "MASK_INDEX",
        },
        {
            backgroundColor: 4,
        },
        {
            backgroundColor: 4,
        },
        {},
        {
            text: `Mask ${maskIndex}:`,
            formula: `="Mask " & %MASK_INDEX% & ":"`,
        },
    ]);

    // Display the 6x6 mask
    const masks = [
        "111111 100000 100100 101010 100100 100000",
        "101010 010101 101010 101010 010101 101010",
        "101010 000111 100011 010101 111000 011100",
        "111111 111000 110110 101010 101101 100011",
        "111111 000000 111111 000000 111111 000000",
        "101010 010101 101010 010101 101010 010101",
        "100100 001001 010010 100100 001001 010010",
        "100100 100100 100100 100100 100100 100100",
    ].map(s => s.split(" ").map(array => array.split("").map(c => parseInt(c) as Bit)));
    for (let r = 0; r < 6; r++) {
        formatAnnotations.push([
            ...range(6).map(_ => ({})),
            ...range(6).map(c => ({
                backgroundColor: 4,
                text: char(masks[maskIndex][r][c]),
                formula: `=INDEX({${masks.map(mask => `"${char(mask[r][c])}"`).join("; ")}}, %MASK_INDEX% + 1)`,
                ref: r === 0 && c === 0 ? "MASK_GRID" : undefined,
            })),
        ]);
    }

    formatAnnotations.forEach((row, i) => formatRows[i].push({}, ...row));

    rows.push([{}]);
    rows.push(...formatRows);

    // Find areas of the QR code that contain data
    const dataAreas: boolean[][] = range(L).map(_ => range(L).map(_ => true));

    // Gray out finder patterns and separators
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            dataAreas[i][j] = false;
            dataAreas[i][L - 1 - j] = false;
            dataAreas[L - 1 - i][j] = false;
        }
    }

    // Gray out timing patterns
    for (let i = 8; i < L - 8; i++) {
        dataAreas[6][i] = false;
        dataAreas[i][6] = false;
    }

    // Gray out alignment patterns
    const numAlignmentCoordinates = Math.floor((version + 5) / 7);
    const secondAlignmentCoordinates = [
        -1, -1, 18, 22, 26, 30, 34, 22, 24, 26, 28, 30, 32, 34, 26, 26, 26, 30, 30, 30, 34, 28, 26, 30, 28, 32, 30, 34,
        26, 30, 26, 30, 34, 30, 34, 30, 24, 28, 32, 26, 30,
    ];
    const stepSize = (L - 7 - secondAlignmentCoordinates[version]) / (numAlignmentCoordinates - 1);
    const alignmentCoordinates = [
        6,
        ...range(numAlignmentCoordinates - 1).map(i => secondAlignmentCoordinates[version] + stepSize * i),
    ];
    for (const r of alignmentCoordinates) {
        for (const c of alignmentCoordinates) {
            if (dataAreas[r][c]) {
                for (let dr = -2; dr <= 2; dr++) {
                    for (let dc = -2; dc <= 2; dc++) {
                        dataAreas[r + dr][c + dc] = false;
                    }
                }
            }
        }
    }

    // Masked QR code
    rows.push([{}]);
    rows.push([{ text: "Apply mask" }]);

    const maskedGrid = grid.map((row, r) => row.map((bit, c) => (bit ^ masks[maskIndex][r % 6][c % 6]) as Bit));
    const maskedRows: Table = maskedGrid.map((row, r) =>
        row.map((bit, c) =>
            dataAreas[r][c]
                ? {
                      text: char(bit),
                      formula: `=IF(XOR(%CODE[${r}][${c}]%<>%WHITE%, %MASK_GRID[${r % 6}][${
                          c % 6
                      }]%<>%WHITE%), %BLACK%, %WHITE%)`,
                      ref: r === 0 && c === 0 ? "MASKED_CODE" : undefined,
                  }
                : {
                      backgroundColor: 10,
                      ref: r === 0 && c === 0 ? "MASKED_CODE" : undefined,
                  }
        )
    );

    const maskedAnnotations: Table = [];
    maskedAnnotations.push(
        ...range(2).map(dr =>
            range(2).map(dc => {
                maskedRows[L - 2 + dr][L - 2 + dc].backgroundColor = 0;
                return {
                    backgroundColor: 0,
                    text: char(maskedGrid[L - 2 + dr][L - 2 + dc]),
                    formula: `=%MASKED_CODE[${L - 2 + dr}][${L - 2 + dc}]%`,
                };
            })
        )
    );

    maskedAnnotations.forEach((row, i) => maskedRows[i].push({}, ...row));

    rows.push(...maskedRows);

    for (const row of rows) {
        for (const cell of row) {
            cell.width = 20;
            cell.height = 20;
        }
    }

    return rows;
}
