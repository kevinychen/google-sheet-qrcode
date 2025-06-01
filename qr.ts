import { QRCode } from "jsqr";
import { betterBin2Dec, Table } from "./google-sheet-html";
import { assert, blockMatrix, range, sum } from "./util";

export type Bit = 0 | 1;
export type BinaryGrid = Bit[][];
export type FormatCoordinates = { horizontal: [number, number][]; vertical: [number, number][] };
export type ErrorCorrectionLevel = { name: "H" | "Q" | "M" | "L"; description: string };
export type EncodingMode = { name: string; lengthBlockSize: number; dataBlockSize: number };

function getNumCodewordsList(version: number): { [errorCorrectionLevelName: string]: number[] } {
    switch (version) {
        case 1:
            return { L: [19], M: [16], Q: [13], H: [9] };
        case 2:
            return { L: [34], M: [28], Q: [22], H: [16] };
        case 3:
            return { L: [55], M: [44], Q: [17, 17], H: [13, 13] };
        case 4:
            return { L: [80], M: [32, 32], Q: [24, 24], H: [9, 9, 9, 9] };
        case 5:
            return { L: [108], M: [43, 43], Q: [15, 15, 16, 16], H: [11, 11, 12, 12] };
        case 6:
            return { L: [68, 68], M: [27, 27, 27, 27], Q: [19, 19, 19, 19], H: [15, 15, 15, 15] };
        case 7:
            return { L: [78, 78], M: [31, 31, 31, 31], Q: [14, 14, 15, 15, 15, 15], H: [13, 13, 13, 13, 14] };
        case 8:
            return { L: [97, 97], M: [38, 38, 39, 39], Q: [18, 18, 18, 18, 19, 19], H: [14, 14, 14, 14, 15, 15] };
        default:
            throw new Error();
    }
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

function showOriginalQRCode(originalQRCode: BinaryGrid): Table {
    return originalQRCode.map((row, r) =>
        row.map((bit, c) => ({
            text: char(bit),
            formula: bit ? "=%BLACK%" : "=%WHITE%",
            ref: r === 0 && c === 0 ? "ORIGINAL_QR_CODE" : undefined,
        }))
    );
}

function getFormatCoordinates(L: number): FormatCoordinates {
    return {
        horizontal: [0, 1, 2, 3, 4, 5, 7, L - 8, L - 7, L - 6, L - 5, L - 4, L - 3, L - 2, L - 1].map(c => [8, c]),
        vertical: [L - 1, L - 2, L - 3, L - 4, L - 5, L - 6, L - 7, 8, 7, 5, 4, 3, 2, 1, 0].map(r => [r, 8]),
    };
}

function getFormatBits(
    code: BinaryGrid,
    originalQRCodeTable: Table,
    formatCoordinates: FormatCoordinates
): { formatBits: Bit[]; table: Table } {
    const colors = [1, 1, 4, 4, 4, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
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

    const table = [];

    const horizontalBits = formatCoordinates.horizontal.map(([r, c]) => code[r][c]);
    table.push([{ text: "Horizontal format information:" }]);
    table.push(
        formatCoordinates.horizontal.map(([r, c], i) => ({
            backgroundColor: colors[i],
            text: char(horizontalBits[i]),
            formula: `=%ORIGINAL_QR_CODE[${r}][${c}]%`,
        }))
    );
    formatCoordinates.horizontal.forEach(([r, c], i) => (originalQRCodeTable[r][c].backgroundColor = colors[i]));
    table.push(
        horizontalBits.map((bit, i) => ({
            text: bit.toString(),
            formula: "=IF(R[-1]C[0]<>%WHITE%, 1, 0)",
            ref: i === 0 ? "HORIZONTAL_BITS" : undefined,
        }))
    );

    const verticalBits = formatCoordinates.vertical.map(([r, c]) => code[r][c]);
    table.push([]);
    table.push([{ text: "Vertical format information:" }]);
    table.push(
        formatCoordinates.vertical.map(([r, c], i) => ({
            backgroundColor: colors[i],
            text: char(verticalBits[i]),
            formula: `=%ORIGINAL_QR_CODE[${r}][${c}]%`,
        }))
    );
    formatCoordinates.vertical.forEach(([r, c], i) => (originalQRCodeTable[r][c].backgroundColor = colors[i]));
    table.push(
        verticalBits.map((bit, i) => ({
            text: bit.toString(),
            formula: "=IF(R[-1]C[0]<>%WHITE%, 1, 0)",
            ref: i === 0 ? "VERTICAL_BITS" : undefined,
        }))
    );

    // The 15 bits in both the horizontal format information and vertical format information are
    // encoded with a BCH(15, 5) code. Find the option (out of 2^5 options) that has the closest
    // hamming distance to the format information in the QR code.
    const horizontalInt = parseInt(horizontalBits.join(""), 2);
    const verticalInt = parseInt(verticalBits.join(""), 2);
    const hamming = BCH_options.map(
        val => ((horizontalInt ^ val).toString(2) + (verticalInt ^ val).toString(2)).replace("0", "").length
    );
    const bestOptionIndex = hamming.indexOf(Math.min(...hamming));
    table.push([]);
    table.push([
        { text: "Format information after error correction:" },
        ...range(13).map(_ => ({})),
        {
            text: bestOptionIndex.toString(),
            formula: `=LET(
comment1, "Convert input bits to integer (big endian)",
powers, SEQUENCE(15, 1, 14, -1),
horizontalBits, {${range(15)
                .map(i => `%HORIZONTAL_BITS[0][${i}]%`)
                .join("; ")}},
verticalBits, {${range(15)
                .map(i => `%VERTICAL_BITS[0][${i}]%`)
                .join("; ")}},
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
    table.push(
        range(15).map(i => ({
            backgroundColor: colors[i],
            text: char(formatBits[i]),
            formula: `=INDEX({${BCH_options.map(option => ((option >> (14 - i)) % 2 ? "%BLACK%" : "%WHITE%")).join(
                "; "
            )}}, %BEST_OPTION_INDEX% + 1)`,
        }))
    );
    table.push(
        range(15).map(i => ({
            text: ((bestOption >> (14 - i)) % 2).toString(),
            formula: "=IF(R[-1]C[0]<>%WHITE%, 1, 0)",
            ref: i === 0 ? "FORMAT_BITS" : undefined,
        }))
    );

    return { formatBits, table };
}

function getErrorCorrectionLevel(
    version: number,
    formatBits: Bit[]
): { errorCorrectionLevel: ErrorCorrectionLevel; table: Table } {
    const errorCorrectionLevels: ErrorCorrectionLevel[] = [
        { name: "H", description: "HIGH" },
        { name: "Q", description: "QUARTILE" },
        { name: "M", description: "MEDIUM" },
        { name: "L", description: "LOW" },
    ];

    const errorCorrectionLevel = errorCorrectionLevels[parseInt(formatBits.slice(0, 2).join(""), 2)];
    const numCodewordsList = getNumCodewordsList(version);

    const mainTable = [
        [
            {
                backgroundColor: 1,
                text: errorCorrectionLevel.name,
                formula: `=INDEX({${errorCorrectionLevels
                    .map(level => `"${level.name}"`)
                    .join("; ")}}, BIN2DEC(CONCATENATE(%FORMAT_BITS%:%FORMAT_BITS[0][1]%)) + 1)`,
                ref: "ERROR_CORRECTION_LEVEL",
            },
            {
                backgroundColor: 1,
            },
        ],
    ];

    const descriptionTable = [
        [
            {
                text: `Error correction: ${errorCorrectionLevel.name} (${errorCorrectionLevel.description})`,
                formula: `="Error correction: " & %ERROR_CORRECTION_LEVEL% & " (" & SWITCH(%ERROR_CORRECTION_LEVEL%, ${errorCorrectionLevels
                    .map(level => `"${level.name}", "${level.description}"`)
                    .join(", ")}) & ")"`,
            },
        ],
        [
            {
                text: sum(numCodewordsList[errorCorrectionLevel.name]).toString(),
                formula: `=SWITCH(%ERROR_CORRECTION_LEVEL%, ${Object.entries(numCodewordsList)
                    .map(([name, numCodewords]) => `"${name}", ${sum(numCodewords)}`)
                    .join(", ")})`,
                ref: "NUM_CODEWORDS",
            },
            {},
            { text: "← # codewords" },
        ],
    ];

    return {
        errorCorrectionLevel,
        table: blockMatrix([[mainTable, {}, descriptionTable]]),
    };
}

function getMaskGrid(formatBits: Bit[]): { maskGrid: BinaryGrid; table: Table } {
    // 6x6 mask
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

    const maskIndex = parseInt(formatBits.slice(2, 5).join(""), 2);
    const maskGrid = masks[maskIndex];

    const mainTable = [
        [
            {
                backgroundColor: 4,
                text: maskIndex.toString(),
                formula: "=BIN2DEC(CONCATENATE(%FORMAT_BITS[0][2]%:%FORMAT_BITS[0][4]%))",
                ref: "MASK_INDEX",
            },
            {
                backgroundColor: 4,
            },
            {
                backgroundColor: 4,
            },
        ],
    ];

    const descriptionTable = [
        [
            {
                text: `Mask ${maskIndex}:`,
                formula: `="Mask " & %MASK_INDEX% & ":"`,
            },
        ],
        ...range(6).map(r =>
            range(6).map(c => ({
                backgroundColor: 4,
                text: char(maskGrid[r][c]),
                formula: `=INDEX({${masks
                    .map(mask => (mask[r][c] ? "%BLACK%" : "%WHITE%"))
                    .join("; ")}}, %MASK_INDEX% + 1)`,
                ref: r === 0 && c === 0 ? "MASK_GRID" : undefined,
            }))
        ),
    ];

    return {
        maskGrid,
        table: blockMatrix([[mainTable, {}, descriptionTable]]),
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
    dataAreas: boolean[][]
): { maskedQRCode: BinaryGrid; table: Table } {
    const maskedQRCode = originalQRCode.map((row, r) => row.map((bit, c) => (bit ^ maskGrid[r % 6][c % 6]) as Bit));

    return {
        maskedQRCode,
        table: maskedQRCode.map((row, r) =>
            row.map((bit, c) =>
                dataAreas[r][c]
                    ? {
                          text: char(bit),
                          formula: `=IF(XOR(%ORIGINAL_QR_CODE[${r}][${c}]%<>%WHITE%, %MASK_GRID[${r % 6}][${
                              c % 6
                          }]%<>%WHITE%), %BLACK%, %WHITE%)`,
                          ref: r === 0 && c === 0 ? "MASKED_QR_CODE" : undefined,
                      }
                    : {
                          backgroundColor: 10,
                          ref: r === 0 && c === 0 ? "MASKED_QR_CODE" : undefined,
                      }
            )
        ),
    };
}

function getCodewords(
    version: number,
    errorCorrectionLevel: ErrorCorrectionLevel,
    dataCoordinates: [number, number][],
    maskedQRCode: BinaryGrid,
    maskedQRCodeTable: Table
): { codewords: Bit[][]; table: Table } {
    const numCodewordsList = getNumCodewordsList(version);
    const numCodewords = numCodewordsList[errorCorrectionLevel.name].reduce((a, b) => a + b);
    const maxNumCodewords = Math.max(
        ...Object.values(numCodewordsList).map(numCodewords => numCodewords.reduce((a, b) => a + b))
    );

    const interleavedCodewords = range(numCodewords).map(i =>
        dataCoordinates.slice(8 * i, 8 * i + 8).map(([r, c]) => maskedQRCode[r][c])
    );

    const interleavedCodewordsTable = [
        [{ text: "Codewords (from bottom right):" }],
        ...range(maxNumCodewords).map(i =>
            range(8).map(j => {
                const [r, c] = dataCoordinates[8 * i + j];
                if (i < numCodewords) {
                    maskedQRCodeTable[r][c].backgroundColor = (3 * i) % 10;
                }
                return {
                    backgroundColor: maskedQRCodeTable[r][c].backgroundColor,
                    text: i < numCodewords ? char(interleavedCodewords[i][j]) : undefined,
                    formula: `=IF(${i} < %NUM_CODEWORDS%, %MASKED_QR_CODE[${r}][${c}]%, "")`,
                    ref: i === 0 && j === 0 ? "INTERLEAVED_CODEWORDS" : undefined,
                };
            })
        ),
    ];
    const indicesTable = [
        [{ text: "#" }],
        ...range(maxNumCodewords).map(i => [
            {
                text: i < numCodewords ? (i + 1).toString() : undefined,
                formula: `=IF(${i} < %NUM_CODEWORDS%, ${i + 1}, "")`,
            },
        ]),
    ];

    // For large QR codes, the codewords need to be reordered before decoding
    // https://www.thonky.com/qr-code-tutorial/structure-final-message
    // TODO for version ≤ 2, don't include this
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
        [{ text: "Uninterleaved (for big codes):" }],
        ...range(maxNumCodewords).map(i =>
            range(8).map(j => ({
                backgroundColor: i === 0 && j < 4 ? 7 : undefined,
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
        [{ text: "#" }],
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
        table: blockMatrix([[interleavedCodewordsTable, indicesTable, {}, codewordsTable, matchIndicesTable]]),
    };
}

function getEncodingMode(version: number, codewords: Bit[][]): { encodingMode: EncodingMode; table: Table } {
    const encodingModes = getEncodingModes(version);
    const encodingModeBits = codewords[0].slice(0, 4);
    const encodingMode = encodingModes[encodingModeBits.join("")] || encodingModes.Unknown;

    const mainTable = [
        range(4).map(i => ({
            backgroundColor: 7,
            text: char(encodingModeBits[i]),
            formula: `=%CODEWORDS[0][${i}]%`,
        })),
    ];

    const descriptionTable = [
        [
            {
                text: encodingMode.name,
                formula: `=IFERROR(SWITCH(CONCATENATE(ARRAYFORMULA(IF(%CODEWORDS%:%CODEWORDS[0][3]% = %BLACK%, 1, 0))), ${Object.entries(
                    encodingModes
                )
                    .map(([code, encodingMode]) => `"${code}", "${encodingMode.name}"`)
                    .join(", ")}), "Unknown")`,
                ref: "ENCODING_MODE",
            },
        ],
        [
            {
                text: encodingMode.dataBlockSize,
                formula: `=SWITCH(R[-1]C[0], ${Object.values(encodingModes)
                    .map(encodingMode => `"${encodingMode.name}", ${encodingMode.lengthBlockSize}`)
                    .join(", ")})`,
                ref: "LENGTH_BLOCK_SIZE",
            },
            {},
            { text: "← Length block size" },
        ],
        [
            {
                text: encodingMode.dataBlockSize,
                formula: `=SWITCH(R[-2]C[0], ${Object.values(encodingModes)
                    .map(encodingMode => `"${encodingMode.name}", ${encodingMode.dataBlockSize}`)
                    .join(", ")})`,
                ref: "DATA_BLOCK_SIZE",
            },
            {},
            { text: "← Data block size" },
        ],
    ];

    return {
        encodingMode,
        table: blockMatrix([[{ text: "Encoding mode (first 4 modules):" }], [mainTable, {}, descriptionTable]]),
    };
}

function getDecodedData(
    L: number,
    version: number,
    codewords: Bit[][],
    encodingMode: EncodingMode
): { decodedData: string; decodedBlocksTable: Table; decodedDataTable: Table } {
    function codewordPos(n: number): [number, number] {
        return [Math.floor(n / 8), n % 8];
    }

    const encodingModes = getEncodingModes(version);
    const maxLengthBlockSize = 16;
    const maxDataBlockSize = 13;

    const lengthBlockSize = encodingMode.lengthBlockSize;
    const lengthBits = range(lengthBlockSize).map(i => {
        const [r, c] = codewordPos(4 + i);
        return codewords[r][c];
    });
    const length = parseInt(lengthBits.join(""), 2);
    const lengthTable = [
        [
            {
                text: `Length block (next ${lengthBlockSize} modules):`,
                formula: `="Length block (next " & %LENGTH_BLOCK_SIZE% & " modules):"`,
            },
        ],
        range(maxLengthBlockSize).map(i => {
            const [r, c] = codewordPos(4 + i);
            return {
                text: i < lengthBlockSize ? char(lengthBits[i]) : undefined,
                formula: `=IF(${i} < %LENGTH_BLOCK_SIZE%, %CODEWORDS[${r}][${c}]%, "")`,
                ref: i === 0 ? "LENGTH_BITS" : undefined,
            };
        }),
        [
            {
                text: length.toString(),
                formula: `=LET(
${betterBin2Dec},
betterBin2Dec(MID(CONCATENATE(ARRAYFORMULA(IF(%LENGTH_BITS%:%LENGTH_BITS[0][${maxLengthBlockSize}]% = %BLACK%, 1, 0))), 1, %LENGTH_BLOCK_SIZE%)))`,
                ref: "LENGTH",
            },
            {},
            { text: "← Length" },
        ],
    ];

    const dataBlockSize = encodingMode.dataBlockSize;
    const maxNumBlocks = Math.floor((Math.pow(L, 2) - 225) / 12); // crude estimate
    const dataBlocksTable = [
        [
            {
                text: `Data blocks (remaining blocks in groups of ${dataBlockSize}):`,
                formula: `="Data blocks (remaining blocks in groups of " & %DATA_BLOCK_SIZE% & "):"`,
            },
        ],
        ...range(maxNumBlocks).map(i =>
            range(maxDataBlockSize).map(j => {
                const [r, c] = codewordPos(4 + lengthBlockSize + dataBlockSize * i + j);
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
        [{ text: "Decoded blocks:" }],
        ...range(maxNumBlocks).map(i => {
            const bits = range(dataBlockSize).map(j => {
                const [r, c] = codewordPos(4 + lengthBlockSize + dataBlockSize * i + j);
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
int, betterBin2Dec(MID(CONCATENATE(ARRAYFORMULA(IF(%DATA_BLOCKS[${i}][0]%:%DATA_BLOCKS[${i}][${maxDataBlockSize}]% = %BLACK%, 1, 0))), 1, %DATA_BLOCK_SIZE%)),
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

    return {
        decodedData,
        decodedBlocksTable: blockMatrix([
            [lengthTable] /* force new line .................... */,
            [{}],
            [dataBlocksTable, {}, decodedBlocksTable],
        ]),
        decodedDataTable: [
            [{ text: "Decoded data:" }],
            [
                {
                    text: decodedData,
                    formula: `=CONCATENATE(%DECODED_BLOCKS%:%DECODED_BLOCKS[${maxNumBlocks}][0]%)`,
                },
            ],
        ],
    };
}

export function toTable(originalQRCode: BinaryGrid): Table {
    const L = originalQRCode.length;

    assert(L >= 21 && L <= 177 && L % 4 === 1, "Invalid QR code size");
    for (const row of originalQRCode) {
        assert(row.length === L, "QR code must be a square");
    }

    const version = (L - 17) / 4;

    const binarySymbols: Table = [
        [{ text: char(1), ref: "BLACK" }, {}, { text: "← black character" }],
        [{ text: char(0), ref: "WHITE" }, {}, { text: "← white character" }],
    ];

    const originalQRCodeTable = showOriginalQRCode(originalQRCode);

    // https://en.wikipedia.org/wiki/QR_code#/media/File:QR_Format_Information.svg
    const formatCoordinates = getFormatCoordinates(L);
    const { formatBits, table: formatBitsTable } = getFormatBits(
        originalQRCode,
        originalQRCodeTable,
        formatCoordinates
    );
    const { errorCorrectionLevel, table: errorCorrectionLevelTable } = getErrorCorrectionLevel(version, formatBits);
    const { maskGrid, table: maskGridTable } = getMaskGrid(formatBits);

    const paddedMaskGridTable = blockMatrix([[{}, {}, maskGridTable]]);
    const formatInfoTable = blockMatrix([
        [formatBitsTable] /* force new line */,
        [{}],
        [errorCorrectionLevelTable],
        [paddedMaskGridTable],
    ]);

    const dataAreas = getDataAreas(L, version, formatCoordinates);
    const dataCoordinates = getDataCoordinates(L, dataAreas);

    const { maskedQRCode, table: maskedQRCodeTable } = getMaskedQRCode(originalQRCode, maskGrid, dataAreas);

    const { codewords, table: codewordsTable } = getCodewords(
        version,
        errorCorrectionLevel,
        dataCoordinates,
        maskedQRCode,
        maskedQRCodeTable
    );

    const { encodingMode, table: encodingModeTable } = getEncodingMode(version, codewords);
    const { decodedData, decodedBlocksTable, decodedDataTable } = getDecodedData(L, version, codewords, encodingMode);
    const decodedTable = blockMatrix([
        [encodingModeTable] /* force new line .................... */,
        [{}],
        [decodedBlocksTable],
    ]);

    console.log(`Decoded data: ${decodedData}`);

    const table = blockMatrix([
        [binarySymbols],
        [{}],
        [{ text: `Version ${version} QR code (${L}x${L})` }],
        [originalQRCodeTable, {}, formatInfoTable],
        [{}],
        [{ text: "Data portions (with mask applied):" }],
        [maskedQRCodeTable, {}, codewordsTable, {}, decodedTable, decodedDataTable],
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
