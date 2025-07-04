import { betterBin2Dec, Cell, GRAY_COLOR, RAINBOW_COLORS, Table } from "./google-sheet-html";
import { assert, blockMatrix, range, sum } from "./util";

export type Bit = 0 | 1;
export type BinaryGrid = Bit[][];
export type FormatCoordinates = { horizontal: [number, number][]; vertical: [number, number][] };
export type ErrorCorrectionLevel = { name: "H" | "Q" | "M" | "L"; description: string };
export type EncodingMode = { name: string; lengthBlockSize: number; dataBlockSize: number };

const BLACK = `"⬛"`;
const WHITE = `""`;
const FORMAT_COLORS = [1, 1, 4, 4, 4, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7].map(i => RAINBOW_COLORS[i]);

// https://www.thonky.com/qr-code-tutorial/error-correction-table
const NUM_CODEWORDS_LIST: { [key: number]: { [errorCorrectionLevel: string]: number[] } } = {
    1: { L: [1, 19], M: [1, 16], Q: [1, 13], H: [1, 9] },
    2: { L: [1, 34], M: [1, 28], Q: [1, 22], H: [1, 16] },
    3: { L: [1, 55], M: [1, 44], Q: [2, 17], H: [2, 13] },
    4: { L: [1, 80], M: [2, 32], Q: [2, 24], H: [4, 9] },
    5: { L: [1, 108], M: [2, 43], Q: [2, 15, 2, 16], H: [2, 11, 2, 12] },
    6: { L: [2, 68], M: [4, 27], Q: [4, 19], H: [4, 15] },
    7: { L: [2, 78], M: [4, 31], Q: [2, 14, 4, 15], H: [4, 13, 1, 14] },
    8: { L: [2, 97], M: [2, 38, 2, 39], Q: [4, 18, 2, 19], H: [4, 14, 2, 15] },
    9: { L: [2, 116], M: [3, 36, 2, 37], Q: [4, 16, 4, 17], H: [4, 12, 4, 13] },
    10: { L: [2, 68, 2, 69], M: [4, 43, 1, 44], Q: [6, 19, 2, 20], H: [6, 15, 2, 16] },
    11: { L: [4, 81], M: [1, 50, 4, 51], Q: [4, 22, 4, 23], H: [3, 12, 8, 13] },
    12: { L: [2, 92, 2, 93], M: [6, 36, 2, 37], Q: [4, 20, 6, 21], H: [7, 14, 4, 15] },
    13: { L: [4, 107], M: [8, 37, 1, 38], Q: [8, 20, 4, 21], H: [12, 11, 4, 12] },
    14: { L: [3, 115, 1, 116], M: [4, 40, 5, 41], Q: [11, 16, 5, 17], H: [11, 12, 5, 13] },
    15: { L: [5, 87, 1, 88], M: [5, 41, 5, 42], Q: [5, 24, 7, 25], H: [11, 12, 7, 13] },
    16: { L: [5, 98, 1, 99], M: [7, 45, 3, 46], Q: [15, 19, 2, 20], H: [3, 15, 13, 16] },
    17: { L: [1, 107, 5, 108], M: [10, 46, 1, 47], Q: [1, 22, 15, 23], H: [2, 14, 17, 15] },
    18: { L: [5, 120, 1, 121], M: [9, 43, 4, 44], Q: [17, 22, 1, 23], H: [2, 14, 19, 15] },
    19: { L: [3, 113, 4, 114], M: [3, 44, 11, 45], Q: [17, 21, 4, 22], H: [9, 13, 16, 14] },
    20: { L: [3, 107, 5, 108], M: [3, 41, 13, 42], Q: [15, 24, 5, 25], H: [15, 15, 10, 16] },
    21: { L: [4, 116, 4, 117], M: [17, 42], Q: [17, 22, 6, 23], H: [19, 16, 6, 17] },
    22: { L: [2, 111, 7, 112], M: [17, 46], Q: [7, 24, 16, 25], H: [34, 13] },
    23: { L: [4, 121, 5, 122], M: [4, 47, 14, 48], Q: [11, 24, 14, 25], H: [16, 15, 14, 16] },
    24: { L: [6, 117, 4, 118], M: [6, 45, 14, 46], Q: [11, 24, 16, 25], H: [30, 16, 2, 17] },
    25: { L: [8, 106, 4, 107], M: [8, 47, 13, 48], Q: [7, 24, 22, 25], H: [22, 15, 13, 16] },
    26: { L: [10, 114, 2, 115], M: [19, 46, 4, 47], Q: [28, 22, 6, 23], H: [33, 16, 4, 17] },
    27: { L: [8, 122, 4, 123], M: [22, 45, 3, 46], Q: [8, 23, 26, 24], H: [12, 15, 28, 16] },
    28: { L: [3, 117, 10, 118], M: [3, 45, 23, 46], Q: [4, 24, 31, 25], H: [11, 15, 31, 16] },
    29: { L: [7, 116, 7, 117], M: [21, 45, 7, 46], Q: [1, 23, 37, 24], H: [19, 15, 26, 16] },
    30: { L: [5, 115, 10, 116], M: [19, 47, 10, 48], Q: [15, 24, 25, 25], H: [23, 15, 25, 16] },
    31: { L: [13, 115, 3, 116], M: [2, 46, 29, 47], Q: [42, 24, 1, 25], H: [23, 15, 28, 16] },
    32: { L: [17, 115], M: [10, 46, 23, 47], Q: [10, 24, 35, 25], H: [19, 15, 35, 16] },
    33: { L: [17, 115, 1, 116], M: [14, 46, 21, 47], Q: [29, 24, 19, 25], H: [11, 15, 46, 16] },
    34: { L: [13, 115, 6, 116], M: [14, 46, 23, 47], Q: [44, 24, 7, 25], H: [59, 16, 1, 17] },
    35: { L: [12, 121, 7, 122], M: [12, 47, 26, 48], Q: [39, 24, 14, 25], H: [22, 15, 41, 16] },
    36: { L: [6, 121, 14, 122], M: [6, 47, 34, 48], Q: [46, 24, 10, 25], H: [2, 15, 64, 16] },
    37: { L: [17, 122, 4, 123], M: [29, 46, 14, 47], Q: [49, 24, 10, 25], H: [24, 15, 46, 16] },
    38: { L: [4, 122, 18, 123], M: [13, 46, 32, 47], Q: [48, 24, 14, 25], H: [42, 15, 32, 16] },
    39: { L: [20, 117, 4, 118], M: [40, 47, 7, 48], Q: [43, 24, 22, 25], H: [10, 15, 67, 16] },
    40: { L: [19, 118, 6, 119], M: [18, 47, 31, 48], Q: [34, 24, 34, 25], H: [20, 15, 61, 16] },
};

function getNumCodewordsList(version: number): { [errorCorrectionLevelName: string]: number[] } {
    return Object.fromEntries(
        Object.entries(NUM_CODEWORDS_LIST[version]).map(([errorCorrectionLevel, runLenEncodedNumCodewords]) => {
            const numCodewords = [];
            for (let i = 0; i < runLenEncodedNumCodewords.length; i += 2) {
                const [repeat, number] = runLenEncodedNumCodewords.slice(i, i + 2);
                numCodewords.push(...range(repeat).map(_ => number));
            }
            return [errorCorrectionLevel, numCodewords];
        })
    );
}

function getEncodingModes(version: number): { [code: string]: EncodingMode } {
    return {
        "0001": {
            name: "Numeric",
            lengthBlockSize: version <= 9 ? 10 : version <= 26 ? 12 : 14,
            dataBlockSize: 10,
        },
        "0010": {
            name: "Alphanumeric",
            lengthBlockSize: version <= 9 ? 9 : version <= 26 ? 11 : 13,
            dataBlockSize: 11,
        },
        "0100": {
            name: "Byte",
            lengthBlockSize: version <= 9 ? 8 : 16,
            dataBlockSize: 8,
        },
        Unknown: {
            name: "Unknown",
            lengthBlockSize: 8,
            dataBlockSize: 8,
        },
    };
}

function char(bit: Bit) {
    return bit ? "⬛" : "";
}

function codewordPos(n: number): [number, number] {
    return [Math.floor(n / 8), n % 8];
}

function getFormatCoordinates(L: number): FormatCoordinates {
    return {
        horizontal: [0, 1, 2, 3, 4, 5, 7, L - 8, L - 7, L - 6, L - 5, L - 4, L - 3, L - 2, L - 1].map(c => [8, c]),
        vertical: [L - 1, L - 2, L - 3, L - 4, L - 5, L - 6, L - 7, 8, 7, 5, 4, 3, 2, 1, 0].map(r => [r, 8]),
    };
}

function getDataAreas(L: number, version: number, formatCoordinates: FormatCoordinates): boolean[][] {
    const dataAreas: boolean[][] = range(L).map(_ => range(L).map(_ => true));

    // Remove finder patterns and separators
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            dataAreas[i][j] = false;
            dataAreas[i][L - 1 - j] = false;
            dataAreas[L - 1 - i][j] = false;
        }
    }

    // Remove alignment patterns
    const numCoordinates = version === 1 ? 1 : Math.floor(version / 7) + 2;
    const secondCoordinate = [
        -1, 6, 18, 22, 26, 30, 34, 22, 24, 26, 28, 30, 32, 34, 26, 26, 26, 30, 30, 30, 34, 28, 26, 30, 28, 32, 30, 34,
        26, 30, 26, 30, 34, 30, 34, 30, 24, 28, 32, 26, 30,
    ][version];
    const lastCoordinate = L - 7;
    const alignmentCoordinates = [
        6,
        secondCoordinate,
        ...range(numCoordinates - 2).map(
            i => (secondCoordinate * i + lastCoordinate * (numCoordinates - 2 - i)) / (numCoordinates - 2)
        ),
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

    // Remove timing patterns
    for (let i = 8; i < L - 8; i++) {
        dataAreas[6][i] = false;
        dataAreas[i][6] = false;
    }

    // Remove format information
    formatCoordinates.horizontal.forEach(([r, c]) => (dataAreas[r][c] = false));
    formatCoordinates.vertical.forEach(([r, c]) => (dataAreas[r][c] = false));

    // Pixel that's always black
    dataAreas[L - 8][8] = false;

    // Version information (for large codes)
    if (version >= 7) {
        for (let i = 0; i < 6; i++) {
            for (let j = L - 11; j < L - 8; j++) {
                dataAreas[i][j] = false;
                dataAreas[j][i] = false;
            }
        }
    }

    return dataAreas;
}

function showOriginalQRCode(
    originalQRCode: BinaryGrid,
    formatCoordinates: FormatCoordinates,
    dataAreas: boolean[][]
): Table {
    const table: Table = originalQRCode.map((row, r) =>
        row.map((bit, c) => ({
            className: "cell",
            backgroundColor: dataAreas[r][c] ? undefined : GRAY_COLOR,
            text: bit.toString(),
            ref: r === 0 && c === 0 ? "ORIGINAL_QR_CODE" : undefined,
        }))
    );
    formatCoordinates.horizontal.forEach(([r, c], i) => (table[r][c].backgroundColor = FORMAT_COLORS[i]));
    formatCoordinates.vertical.forEach(([r, c], i) => (table[r][c].backgroundColor = FORMAT_COLORS[i]));
    originalQRCode.forEach((row, r) =>
        row.forEach((bit, c) => {
            if (table[r][c].backgroundColor === GRAY_COLOR) {
                // Using a formula prevents the checkbox from being toggled
                table[r][c].formula = `=${bit}`;
            }
        })
    );

    return blockMatrix([
        [
            {
                text: "Copy this page to Google Sheets to toggle the modules.",
                formula: `=HYPERLINK(
"TODO",
"Click to toggle the modules, or use this page to convert an image into a pastable grid.")`,
            },
        ],
        [table],
    ]);
}

function getOriginalFormatBits(
    code: BinaryGrid,
    formatCoordinates: FormatCoordinates
): { originalFormatBits: Bit[]; table: Table } {
    const originalFormatBits = formatCoordinates.horizontal.map(([r, c]) => code[r][c]);
    return {
        originalFormatBits,
        table: [
            [
                {
                    text: "The colored modules encode the format information. They are repeated horizontally and vertically.",
                    formula: `=HYPERLINK(
"https://www.thonky.com/qr-code-tutorial/format-version-information#put-the-format-string-into-the-qr-code",
"The colored modules encode the format information. They are repeated horizontally and vertically.")`,
                },
            ],
            formatCoordinates.horizontal.map(([r, c], i) => ({
                className: "cell",
                backgroundColor: FORMAT_COLORS[i],
                text: char(originalFormatBits[i]),
                formula: `=IF(%ORIGINAL_QR_CODE[${r}][${c}]%, ${BLACK}, ${WHITE})`,
                ref: i === 0 ? "ORIGINAL_FORMAT_BITS" : undefined,
            })),
        ],
    };
}

function getFormatBits(originalFormatBits: Bit[]): { formatBits: Bit[]; table: Table; bestOptionIndexCell: Cell } {
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

    // The 15 bits in both the horizontal format information and vertical format information are
    // encoded with a BCH(15, 5) code. Find the option (out of 2^5 options) that has the closest
    // hamming distance to the format information in the QR code.
    const originalFormatInt = parseInt(originalFormatBits.join(""), 2);
    const hamming = BCH_options.map(val => (originalFormatInt ^ val).toString(2).replace("0", "").length);
    const bestOptionIndex = hamming.indexOf(Math.min(...hamming));
    const bestOptionIndexCell = {
        text: bestOptionIndex.toString(),
        formula: `=LET(
comment1, "Convert input bits to integer (big endian)",
powers, SEQUENCE(15, 1, 14, -1),
originalFormatBits, {${range(15)
            .map(i => `IF(%ORIGINAL_FORMAT_BITS[0][${i}]%=${BLACK}, 1, 0)`)
            .join("; ")}},
originalFormatInt, SUM(ARRAYFORMULA(originalFormatBits * 2^powers)),

comment2, "Find the valid option with the smallest Hamming distance",
options, {${BCH_options.join(", ")}},
hamming, MAP(options, LAMBDA(val, LEN(SUBSTITUTE(BASE(BITXOR(originalFormatInt, val), 2), "0", "")))),
bestOptionIndex, XMATCH(MIN(hamming), hamming) - 1,
bestOptionIndex
)`,
        ref: "BEST_OPTION_INDEX",
    };

    // Display the bits of that best option
    const bestOption = BCH_options[bestOptionIndex];
    const formatBits = range(15).map(i => ((bestOption >> (14 - i)) % 2) as Bit);

    const table: Table = [];
    table.push([
        {
            text: "Here is the format information after error correction:",
            formula: `=HYPERLINK(
"https://www.thonky.com/qr-code-tutorial/format-version-information#generate-error-correction-bits-for-format-string",
"Here is the format information after error correction:")`,
        },
    ]);
    table.push(
        range(15).map(i => ({
            className: "cell",
            backgroundColor: FORMAT_COLORS[i],
            text: char(formatBits[i]),
            formula: `=INDEX({${BCH_options.map(option => ((option >> (14 - i)) % 2 ? BLACK : WHITE)).join(
                "; "
            )}}, %BEST_OPTION_INDEX% + 1)`,
            ref: i === 0 ? "FORMAT_BITS" : undefined,
        }))
    );

    return { formatBits, table, bestOptionIndexCell };
}

function getErrorCorrectionLevel(formatBits: Bit[]): {
    errorCorrectionLevel: ErrorCorrectionLevel;
    table: Table;
} {
    // Note the indexes here are the post-masked ones (the index has been XORed with 3)
    const errorCorrectionLevels: ErrorCorrectionLevel[] = [
        { name: "H", description: "HIGH" },
        { name: "Q", description: "QUARTILE" },
        { name: "M", description: "MEDIUM" },
        { name: "L", description: "LOW" },
    ];
    const errorCorrectionLevel = errorCorrectionLevels[parseInt(formatBits.slice(0, 2).join(""), 2)];

    const table: Table = [];
    table.push([
        {
            text: "The first 2 modules encode the error correction for the rest of the QR Code.",
            formula: `=HYPERLINK(
"https://en.wikipedia.org/wiki/QR_code#/media/File:QR_Format_Information.svg",
"The first 2 modules encode the error correction for the rest of the QR Code.")`,
        },
    ]);
    table.push([
        ...range(2).map(i => ({
            className: "cell",
            backgroundColor: RAINBOW_COLORS[1],
            text: char(formatBits[i]),
            formula: `=%FORMAT_BITS[0][${i}]%`,
            ref: i === 0 ? "ERROR_CORRECTION_LEVEL_BITS" : undefined,
        })),
        {
            text: errorCorrectionLevel.name,
            formula: `=INDEX({${errorCorrectionLevels
                .map(level => `"${level.name}"`)
                .join(
                    "; "
                )}}, BIN2DEC(CONCATENATE(ARRAYFORMULA(IF(%ERROR_CORRECTION_LEVEL_BITS%:%ERROR_CORRECTION_LEVEL_BITS[0][1]%=${BLACK}, 1, 0)))) + 1)`,
            ref: "ERROR_CORRECTION_LEVEL",
        },
    ]);
    table.push([
        {
            text: `This QR Code uses ${errorCorrectionLevel.name} (${errorCorrectionLevel.description}) error correction.`,
            formula: `="This QR Code uses " & %ERROR_CORRECTION_LEVEL% & " (" & SWITCH(%ERROR_CORRECTION_LEVEL%, ${errorCorrectionLevels
                .map(level => `"${level.name}", "${level.description}"`)
                .join(", ")}) & ") error correction."`,
        },
    ]);

    return {
        errorCorrectionLevel,
        table,
    };
}

function getMaskGrid(formatBits: Bit[]): { maskGrid: BinaryGrid; table: Table } {
    // Note the indexes here are the post-masked ones (the index has been XORed with 5)
    const maskFunctions: ((i: number, j: number) => boolean)[] = [
        (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
        (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
        (i, j) => (((i * j) % 3) + i + j) % 2 === 0,
        (i, j) => (((i * j) % 3) + i * j) % 2 === 0,
        (i, _) => i % 2 === 0,
        (i, j) => (i + j) % 2 === 0,
        (i, j) => (i + j) % 3 === 0,
        (_, j) => j % 3 === 0,
    ];
    const masks = maskFunctions.map(f => range(12).map(i => range(12).map(j => (f(i, j) ? 1 : 0))));

    const maskIndex = parseInt(formatBits.slice(2, 5).join(""), 2);
    const maskGrid = masks[maskIndex];

    const table: Table = [];
    table.push([
        {
            text: "The next 3 modules encode the mask.",
            formula: `=HYPERLINK(
"https://en.wikipedia.org/wiki/QR_code#/media/File:QR_Format_Information.svg",
"The next 3 modules encode the mask.")`,
        },
    ]);
    table.push([
        ...range(3).map(i => ({
            className: "cell",
            backgroundColor: RAINBOW_COLORS[4],
            text: char(formatBits[2 + i]),
            formula: `=%FORMAT_BITS[0][${2 + i}]%`,
            ref: i === 0 ? "MASK_BITS" : undefined,
        })),
        {
            text: maskIndex.toString(),
            formula: `=BIN2DEC(CONCATENATE(ARRAYFORMULA(IF(%MASK_BITS%:%MASK_BITS[0][2]%=${BLACK}, 1, 0))))`,
            ref: "MASK_INDEX",
        },
    ]);
    table.push([{ text: `Mask ${maskIndex} looks like:`, formula: `="Mask " & %MASK_INDEX% & " looks like:"` }]);
    table.push(
        ...range(12).map(r =>
            range(12).map(c => ({
                className: "cell",
                backgroundColor: RAINBOW_COLORS[4],
                text: char(maskGrid[r][c]),
                formula: `=INDEX({${masks.map(mask => (mask[r][c] ? BLACK : WHITE)).join("; ")}}, %MASK_INDEX% + 1)`,
                ref: r === 0 && c === 0 ? "MASK_GRID" : undefined,
            }))
        )
    );

    return {
        maskGrid,
        table,
    };
}

function getDataCoordinates(L: number, dataAreas: boolean[][]): [number, number][] {
    const dataCoordinates: [number, number][] = [];

    // https://en.wikipedia.org/wiki/QR_code#/media/File:QR_Character_Placement.svg
    let [r, c] = [L - 1, L - 1];
    let dr = -1;
    while (c >= 0) {
        if (dataAreas[r][c]) {
            dataCoordinates.push([r, c]);
        }
        if (dataAreas[r][c - 1]) {
            dataCoordinates.push([r, c - 1]);
        }
        r += dr;
        if (r === -1) {
            r = 0;
            dr = 1;
            c -= 2;
        }
        if (r === L) {
            r = L - 1;
            dr = -1;
            c -= 2;
        }
        if (c == 6) {
            c -= 1;
        }
    }

    return dataCoordinates;
}

function getMaskedQRCode(
    originalQRCode: BinaryGrid,
    maskGrid: BinaryGrid,
    dataAreas: boolean[][],
    dataCoordinates: [number, number][]
): { maskedQRCode: BinaryGrid; table: Table } {
    const maskedQRCode = originalQRCode.map((row, r) => row.map((bit, c) => (bit ^ maskGrid[r % 12][c % 12]) as Bit));

    const codewordIndices = dataAreas.map(row => row.map(_ => 0));
    dataCoordinates.forEach(([r, c], i) => {
        codewordIndices[r][c] = Math.floor(i / 8);
    });

    return {
        maskedQRCode,
        table: [
            [{ text: "The mask is XORed with the data portions of the QR code." }],
            ...maskedQRCode.map((row, r) => [
                ...row.map((bit, c) => {
                    const index = codewordIndices[r][c];
                    return dataAreas[r][c]
                        ? {
                              className: "cell",
                              text: char(bit),
                              formula: `=LET(
module, %ORIGINAL_QR_CODE[${r}][${c}]%,
mask, %MASK_GRID[${r % 12}][${c % 12}]%=${BLACK},
maskedModule, SWITCH(module, 1, IF(mask, ${WHITE}, ${BLACK}), 0, IF(mask, ${BLACK}, ${WHITE}), module),
maskedModule & "         🌈" & IF(${index} < %NUM_CODEWORDS%, ${(index * 3) % 10}, "W")
)`,
                              ref: r === 0 && c === 0 ? "MASKED_QR_CODE" : undefined,
                          }
                        : {
                              className: "cell",
                              backgroundColor: GRAY_COLOR,
                              text: maskGrid[r % 12][c % 12] ? "◻️" : "",
                              formula: `=LET(
mask, %MASK_GRID[${r % 12}][${c % 12}]%=${BLACK},
IF(mask, "◻️", "") & "         🌈G")`,
                              ref: r === 0 && c === 0 ? "MASKED_QR_CODE" : undefined,
                          };
                }),
                { text: "", formula: "=CHAR(10)" },
            ]),
        ],
    };
}

function getCodewords(
    version: number,
    errorCorrectionLevel: ErrorCorrectionLevel,
    dataCoordinates: [number, number][],
    maskedQRCode: BinaryGrid
): { codewords: Bit[][]; table: Table; numCodewordsCell: Cell } {
    const numCodewordsList = getNumCodewordsList(version);
    const numCodewords = numCodewordsList[errorCorrectionLevel.name].reduce((a, b) => a + b);
    const maxNumCodewords = Math.max(
        ...Object.values(numCodewordsList).map(numCodewords => numCodewords.reduce((a, b) => a + b))
    );
    const numCodewordsCell = {
        text: sum(numCodewordsList[errorCorrectionLevel.name]).toString(),
        formula: `=SWITCH(%ERROR_CORRECTION_LEVEL%, ${Object.entries(numCodewordsList)
            .map(([name, numCodewords]) => `"${name}", ${sum(numCodewords)}`)
            .join(", ")})`,
        ref: "NUM_CODEWORDS",
    };

    const interleavedCodewords = range(numCodewords).map(i =>
        dataCoordinates.slice(8 * i, 8 * i + 8).map(([r, c]) => maskedQRCode[r][c])
    );

    const interleavedCodewordsTable = range(maxNumCodewords).map(i =>
        range(8).map(j => {
            const [r, c] = dataCoordinates[8 * i + j];
            return {
                className: i < numCodewords ? "cell" : undefined,
                text: i < numCodewords ? char(interleavedCodewords[i][j]) : undefined,
                formula: `=IF(${i} < %NUM_CODEWORDS%, %MASKED_QR_CODE[${r}][${c}]%, "")`,
                ref: i === 0 && j === 0 ? "INTERLEAVED_CODEWORDS" : undefined,
            };
        })
    );
    const interleavedCodewordsLabeledTable = [
        [
            {
                text: "Read codewords (sets of 8 modules)",
                formula: `=HYPERLINK(
"https://www.thonky.com/qr-code-tutorial/module-placement-matrix#step-6-place-the-data-bits",
"Read codewords (sets of 8 modules)
starting from the bottom right.

A version ${version} QR code with " & %ERROR_CORRECTION_LEVEL% & " error
correction can encode " & %NUM_CODEWORDS% & " codewords.")`,
            },
        ],
        ...interleavedCodewordsTable,
    ];
    const indicesTable = [
        [{}],
        ...range(maxNumCodewords).map(i => [
            {
                text: i < numCodewords ? (i + 1).toString() : undefined,
                formula: `=IF(${i} < %NUM_CODEWORDS%, ${i + 1}, "")`,
            },
        ]),
    ];

    // For large QR codes, the codewords need to be reordered before decoding
    // https://www.thonky.com/qr-code-tutorial/structure-final-message
    const interleavings: { [name: string]: number[] } = {};
    Object.entries(numCodewordsList).forEach(([name, numCodewords]) => {
        let index = 0;
        const lists = [];
        for (let num of numCodewords) {
            lists.push(range(num).map(n => n + index));
            index += num;
        }
        index = 0;
        const interleaving: number[] = range(maxNumCodewords).map(_ => maxNumCodewords);
        while (lists.some(list => list.length > 0)) {
            for (const list of lists) {
                if (list.length > 0) {
                    interleaving[list.shift()!] = index++;
                }
            }
        }
        interleavings[name] = interleaving;
    });
    const codewords = range(numCodewords).map(i => interleavedCodewords[interleavings[errorCorrectionLevel.name][i]]);
    const codewordsTable = [
        [
            {
                text: "Uninterleaved:",
                formula: `=HYPERLINK("https://www.thonky.com/qr-code-tutorial/structure-final-message", "In larger QR Codes, the
codewords are interleaved.

" & IF(SWITCH(%ERROR_CORRECTION_LEVEL%, ${Object.entries(numCodewordsList)
                    .map(([name, numCodewords]) => `"${name}", ${numCodewords.length > 1}`)
                    .join(", ")}), "Here are the uninterleaved
codewords:", "In this example, there is no
interleaving."))`,
            },
        ],
        ...range(maxNumCodewords).map(i =>
            range(8).map(j => ({
                className: i < numCodewords ? "cell" : undefined,
                text: i < numCodewords ? char(codewords[i][j]) : undefined,
                formula: `=LET(
new_i, SWITCH(%ERROR_CORRECTION_LEVEL%, ${Object.entries(interleavings)
                    .map(([name, interleaving]) => `"${name}", ${interleaving[i]}`)
                    .join(", ")}),
IF(new_i < %NUM_CODEWORDS%, INDEX(%INTERLEAVED_CODEWORDS%:%INTERLEAVED_CODEWORDS[${
                    maxNumCodewords - 1
                }][7]%, new_i + 1, ${j + 1}), ""))`,
                ref: i === 0 && j === 0 ? "CODEWORDS" : undefined,
            }))
        ),
    ];
    const matchIndicesTable = [
        [{}],
        ...range(maxNumCodewords).map(i => [
            {
                text: i < numCodewords ? (interleavings[errorCorrectionLevel.name][i] + 1).toString() : undefined,
                formula: `=LET(
new_i, SWITCH(%ERROR_CORRECTION_LEVEL%, ${Object.entries(interleavings)
                    .map(([name, interleaving]) => `"${name}", ${interleaving[i]}`)
                    .join(", ")}),
IF(new_i < %NUM_CODEWORDS%, new_i + 1, ""))`,
            },
        ]),
    ];

    return {
        codewords,
        table: blockMatrix([[interleavedCodewordsLabeledTable, indicesTable, {}, codewordsTable, matchIndicesTable]]),
        numCodewordsCell,
    };
}

function getEncodingMode(
    version: number,
    codewords: Bit[][]
): { encodingMode: EncodingMode; table: Table; lengthBlockSizeCell: Cell; dataBlockSizeCell: Cell } {
    const encodingModes = getEncodingModes(version);
    const encodingModeBits = codewords[0].slice(0, 4);
    const encodingMode = encodingModes[encodingModeBits.join("")] || encodingModes.Unknown;

    const table: Table = [];
    table.push([
        {
            text: "The first 4 modules are the encoding mode.",
            formula: `=HYPERLINK(
"https://www.thonky.com/qr-code-tutorial/data-encoding#step-3-add-the-mode-indicator",
"The first 4 modules are the encoding mode.")`,
        },
    ]);
    table.push([
        ...range(4).map(i => ({
            className: "cell",
            text: char(encodingModeBits[i]),
            formula: `=%CODEWORDS[0][${i}]%`,
            ref: i === 0 ? "ENCODING_MODE_BITS" : undefined,
        })),
        {
            text: encodingMode.name,
            formula: `=IFERROR(SWITCH(CONCATENATE(ARRAYFORMULA(IF(LEFT(%ENCODING_MODE_BITS%:%ENCODING_MODE_BITS[0][3]%, 1) = ${BLACK}, 1, 0))), ${Object.entries(
                encodingModes
            )
                .map(([code, encodingMode]) => `"${code}", "${encodingMode.name}"`)
                .join(", ")}), "Unknown")`,
            ref: "ENCODING_MODE",
        },
    ]);

    const lengthBlockSizeCell = {
        text: encodingMode.lengthBlockSize.toString(),
        formula: `=SWITCH(%ENCODING_MODE%, ${Object.values(encodingModes)
            .map(encodingMode => `"${encodingMode.name}", ${encodingMode.lengthBlockSize}`)
            .join(", ")})`,
        ref: "LENGTH_BLOCK_SIZE",
    };
    const dataBlockSizeCell = {
        text: encodingMode.dataBlockSize.toString(),
        formula: `=SWITCH(%ENCODING_MODE%, ${Object.values(encodingModes)
            .map(encodingMode => `"${encodingMode.name}", ${encodingMode.dataBlockSize}`)
            .join(", ")})`,
        ref: "DATA_BLOCK_SIZE",
    };

    return {
        encodingMode,
        table,
        lengthBlockSizeCell,
        dataBlockSizeCell,
    };
}

function getLength(codewords: Bit[][], encodingMode: EncodingMode): { length: number; table: Table } {
    const maxLengthBlockSize = 16;
    const lengthBlockSize = encodingMode.lengthBlockSize;
    const lengthBits = range(lengthBlockSize).map(i => {
        const [r, c] = codewordPos(4 + i);
        return codewords[r][c];
    });
    const length = parseInt(lengthBits.join(""), 2);

    const table: Table = [];
    table.push([
        {
            text: `The next ${lengthBlockSize} modules encode the data length.`,
            formula: `=HYPERLINK(
"https://www.thonky.com/qr-code-tutorial/data-encoding#step-4-add-the-character-count-indicator",
"The next " & %LENGTH_BLOCK_SIZE% & " modules encode the data length.")`,
        },
    ]);
    table.push([
        ...range(maxLengthBlockSize).map(i => {
            const [r, c] = codewordPos(4 + i);
            return {
                className: i < lengthBlockSize ? "cell" : undefined,
                text: i < lengthBlockSize ? char(lengthBits[i]) : undefined,
                formula: `=IF(${i} < %LENGTH_BLOCK_SIZE%, %CODEWORDS[${r}][${c}]%, "")`,
                ref: i === 0 ? "LENGTH_BITS" : undefined,
            };
        }),
        {
            text: length.toString(),
            formula: `=LET(
${betterBin2Dec},

betterBin2Dec(MID(CONCATENATE(ARRAYFORMULA(IF(LEFT(%LENGTH_BITS%:%LENGTH_BITS[0][${
                maxLengthBlockSize - 1
            }]%, 1) = ${BLACK}, 1, 0))), 1, %LENGTH_BLOCK_SIZE%)))`,
            ref: "LENGTH",
        },
    ]);

    return { length, table };
}

function getDecodedData(
    L: number,
    version: number,
    codewords: Bit[][],
    encodingMode: EncodingMode,
    length: number
): { decodedData: string; table: Table } {
    const encodingModes = getEncodingModes(version);
    const maxDataBlockSize = 13;

    const dataBlockSize = encodingMode.dataBlockSize;
    const maxNumBlocks = Math.floor((Math.pow(L, 2) - 225) / 12); // crude estimate
    const dataBlocksTable = [
        [
            {
                text: `Take remaining modules in groups of ${dataBlockSize}, and decode them:`,
                formula: `=HYPERLINK(
"https://www.thonky.com/qr-code-tutorial/data-encoding#step-3-encode-using-the-selected-mode",
"Take remaining modules in groups of " & %DATA_BLOCK_SIZE% & ", and decode them:")`,
            },
        ],
        ...range(maxNumBlocks).map(i =>
            range(maxDataBlockSize).map(j => {
                const [r, c] = codewordPos(4 + encodingMode.lengthBlockSize + dataBlockSize * i + j);
                const cellUsed = {
                    Alphanumeric: (i < Math.floor(length / 2) && j < 11) || (i < Math.floor((length + 1) / 2) && j < 6),
                    Byte: i < length && j < 8,
                    Numeric:
                        (i < Math.floor(length / 3) && j < 10) ||
                        (i < Math.floor((length + 1) / 3) && j < 7) ||
                        (i < Math.floor((length + 2) / 3) && j < 4),
                }[encodingMode.name];

                const [alphanumeric_r, alphanumeric_c] = codewordPos(
                    4 + encodingModes["0010"].lengthBlockSize + 11 * i + j
                );
                const [byte_r, byte_c] = codewordPos(4 + encodingModes["0100"].lengthBlockSize + 8 * i + j);
                const [numeric_r, numeric_c] = codewordPos(4 + encodingModes["0001"].lengthBlockSize + 10 * i + j);
                return {
                    className: cellUsed ? "cell" : undefined,
                    text: cellUsed ? char(codewords[r][c]) : undefined,
                    formula: `=SWITCH(%ENCODING_MODE%,
"Alphanumeric", IF(OR(
    AND(${i} < FLOOR(%LENGTH% / 2), ${j} < 11),
    AND(${i} < FLOOR((%LENGTH% + 1) / 2), ${j} < 6)), %CODEWORDS[${alphanumeric_r}][${alphanumeric_c}]%, ""),
"Byte", IF(AND(${i} < %LENGTH%, ${j} < 8), %CODEWORDS[${byte_r}][${byte_c}]%, ""),
"Numeric", IF(OR(
    AND(${i} < FLOOR(%LENGTH% / 3), ${j} < 10),
    AND(${i} < FLOOR((%LENGTH% + 1) / 3), ${j} < 7),
    AND(${i} < FLOOR((%LENGTH% + 2) / 3), ${j} < 4)), %CODEWORDS[${numeric_r}][${numeric_c}]%, ""),
""
)`,
                    ref: i === 0 && j === 0 ? "DATA_BLOCKS" : undefined,
                };
            })
        ),
    ];

    let decodedData = "";
    const decodedBlocksTable = [
        [{}],
        ...range(maxNumBlocks).map(i => {
            const bits = range(dataBlockSize).map(j => {
                const [r, c] = codewordPos(4 + encodingMode.lengthBlockSize + dataBlockSize * i + j);
                return codewords[r] ? codewords[r][c] : 0;
            });
            const int = parseInt(bits.join(""), 2);
            const alphanumericTable = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
            const decodedBlock = {
                Alphanumeric:
                    i < length / 2
                        ? i === (length - 1) / 2
                            ? alphanumericTable[int >> 5]
                            : alphanumericTable[Math.floor(int / 45)] + alphanumericTable[int % 45]
                        : undefined,
                Byte: i < length ? String.fromCodePoint(int) : undefined,
                Numeric:
                    i < length / 3
                        ? (i === (length - 1) / 3 ? int >> 6 : i === (length - 2) / 3 ? int >> 3 : int).toString()
                        : undefined,
            }[encodingMode.name];
            if (decodedBlock) {
                decodedData += decodedBlock;
            }
            return [
                {
                    text: decodedBlock,
                    formula: `=LET(
${betterBin2Dec},

int, betterBin2Dec(MID(CONCATENATE(ARRAYFORMULA(IF(LEFT(%DATA_BLOCKS[${i}][0]%:%DATA_BLOCKS[${i}][${maxDataBlockSize}]%, 1) = ${BLACK}, 1, 0))), 1, %DATA_BLOCK_SIZE%)),

alphanumericTable, "${alphanumericTable}",

SWITCH(%ENCODING_MODE%,
"Alphanumeric", IF(${i} < %LENGTH% / 2, IF(${i} = (%LENGTH% - 1) / 2,
    MID(alphanumericTable, BITRSHIFT(int, 5) + 1, 1),
    MID(alphanumericTable, FLOOR(int / 45) + 1, 1) & MID(alphanumericTable, MOD(int, 45) + 1, 1)), ""),
"Byte", IF(${i} < %LENGTH%, CHAR(int), ""),
"Numeric", IF(${i} < %LENGTH% / 3, IF(${i} = (%LENGTH% - 1) / 3, BITRSHIFT(int, 6), IF(${i} = (%LENGTH% - 2) / 3, BITRSHIFT(int, 3), int)), ""),
))`,
                    ref: i === 0 ? "DECODED_BLOCKS" : undefined,
                },
            ];
        }),
    ];

    const decodedDataTable = [
        [{ text: "Final message:" }],
        [
            {
                text: decodedData,
                formula: `=CONCATENATE(%DECODED_BLOCKS%:%DECODED_BLOCKS[${maxNumBlocks}][0]%)`,
            },
        ],
    ];

    return {
        decodedData,
        table: blockMatrix([[dataBlocksTable, {}, {}, {}, decodedBlocksTable, {}, decodedDataTable]]),
    };
}

export function toTable(originalQRCode: BinaryGrid): Table {
    const L = originalQRCode.length;

    assert(L >= 21 && L <= 177 && L % 4 === 1, "Invalid QR code size");
    for (const row of originalQRCode) {
        assert(row.length === L, "QR code must be a square");
    }

    const version = (L - 17) / 4;

    const formatCoordinates = getFormatCoordinates(L);
    const dataAreas = getDataAreas(L, version, formatCoordinates);

    const originalQRCodeTable = showOriginalQRCode(originalQRCode, formatCoordinates, dataAreas);

    // https://en.wikipedia.org/wiki/QR_code#/media/File:QR_Format_Information.svg
    const { originalFormatBits, table: originalFormatBitsTable } = getOriginalFormatBits(
        originalQRCode,
        formatCoordinates
    );
    const { formatBits, table: formatBitsTable, bestOptionIndexCell } = getFormatBits(originalFormatBits);
    const { errorCorrectionLevel, table: errorCorrectionLevelTable } = getErrorCorrectionLevel(formatBits);
    const { maskGrid, table: maskGridTable } = getMaskGrid(formatBits);

    const formatInfoTable = blockMatrix([
        [originalFormatBitsTable],
        [{}],
        [formatBitsTable],
        [{}],
        [errorCorrectionLevelTable],
        [{}],
        [maskGridTable],
    ]);

    const dataCoordinates = getDataCoordinates(L, dataAreas);

    const { maskedQRCode, table: maskedQRCodeTable } = getMaskedQRCode(
        originalQRCode,
        maskGrid,
        dataAreas,
        dataCoordinates
    );

    const {
        codewords,
        table: codewordsTable,
        numCodewordsCell,
    } = getCodewords(version, errorCorrectionLevel, dataCoordinates, maskedQRCode);

    const {
        encodingMode,
        table: encodingModeTable,
        lengthBlockSizeCell,
        dataBlockSizeCell,
    } = getEncodingMode(version, codewords);
    const { length, table: lengthTable } = getLength(codewords, encodingMode);
    const { decodedData, table: decodedDataTable } = getDecodedData(L, version, codewords, encodingMode, length);
    const decodedTable = blockMatrix([
        [encodingModeTable] /* force new line */,
        [{}],
        [lengthTable],
        [{}],
        [decodedDataTable],
    ]);

    console.log(`Decoded data: ${decodedData}`);

    const extraCellsTable = blockMatrix([
        [{ text: "Internal state" }],
        [bestOptionIndexCell, { text: "Format information error correction" }],
        [numCodewordsCell, { text: "# codewords" }],
        [lengthBlockSizeCell, { text: "Length block size" }],
        [dataBlockSizeCell, { text: "Data block size" }],
    ]);

    const table: Table = blockMatrix([
        [{ text: `Version ${version} QR code (${L}x${L})` }],
        [originalQRCodeTable, {}, formatInfoTable],
        [{}],
        [maskedQRCodeTable, {}, codewordsTable, {}, decodedTable],
        [{}],
        [extraCellsTable],
    ]);

    for (const row of table) {
        while (row.length > 1 && Object.keys(row[row.length - 1]).length === 0) {
            row.pop();
        }
        for (const cell of row) {
            cell.width = 20;
            cell.height = 20;
        }
    }

    return table;
}
