import { QRCode } from "jsqr";
import { betterBin2Dec, Cell, Table } from "./google-sheet-html";
import { assert, blockMatrix, range } from "./util";

export type Bit = 0 | 1;
export type BinaryGrid = Bit[][];
export type FormatCoordinates = { horizontal: [number, number][]; vertical: [number, number][] };
export type ErrorCorrectionLevel = { name: string; description: string };
export type EncodingMode = { code: string; name: string; blockSize: number };

const errorCorrectionLevels = [
    { name: "H", description: "HIGH" },
    { name: "Q", description: "QUARTILE" },
    { name: "M", description: "MEDIUM" },
    { name: "L", description: "LOW" },
];
const encodingModes = [
    { code: "?", name: "Unknown", blockSize: 8 },
    { code: "1000", name: "Numeric", blockSize: 10 },
    { code: "0100", name: "Alphanumeric", blockSize: 11 },
    { code: "0010", name: "Byte", blockSize: 8 },
];

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

function getErrorCorrectionLevel(formatBits: Bit[]): {
    errorCorrectionLevel: ErrorCorrectionLevel;
    table: Table;
    description: Cell;
} {
    const errorCorrectionLevel = errorCorrectionLevels[parseInt(formatBits.slice(0, 2).join(""), 2)];

    return {
        errorCorrectionLevel,
        table: [
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
        ],
        description: {
            text: `Error correction: ${errorCorrectionLevel.name} (${errorCorrectionLevel.description})`,
            formula: `="Error correction: " & %ERROR_CORRECTION_LEVEL% & " (" & SWITCH(%ERROR_CORRECTION_LEVEL%, ${errorCorrectionLevels
                .map(level => `"${level.name}", "${level.description}"`)
                .join(", ")}) & ")"`,
        },
    };
}

function getMaskIndex(formatBits: Bit[]): { maskIndex: number; table: Table; description: Cell } {
    const maskIndex = parseInt(formatBits.slice(2, 5).join(""), 2);

    return {
        maskIndex,
        table: [
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
        ],
        description: {
            text: `Mask ${maskIndex}:`,
            formula: `="Mask " & %MASK_INDEX% & ":"`,
        },
    };
}

function getMaskGrid(maskIndex: number): { maskGrid: BinaryGrid; table: Table } {
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

    const maskGrid = masks[maskIndex];

    return {
        maskGrid,
        table: range(6).map(r =>
            range(6).map(c => ({
                backgroundColor: 4,
                text: char(maskGrid[r][c]),
                formula: `=INDEX({${masks
                    .map(mask => (mask[r][c] ? "%BLACK%" : "%WHITE%"))
                    .join("; ")}}, %MASK_INDEX% + 1)`,
                ref: r === 0 && c === 0 ? "MASK_GRID" : undefined,
            }))
        ),
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
    let [r, c] = [L - 3, L - 1];
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

function getEncodingMode(
    L: number,
    version: number,
    maskedQRCode: BinaryGrid,
    maskedQRCodeTable: Table
): { encodingMode: EncodingMode; table: Table } {
    const coordinates = [
        [L - 2, L - 2],
        [L - 2, L - 1],
        [L - 1, L - 2],
        [L - 1, L - 1],
    ];
    const encodingModeBits = coordinates.map(([r, c]) => maskedQRCode[r][c]);
    const encodingMode = encodingModes.find(mode => mode.code === encodingModeBits.join("")) || encodingModes[0];

    const charTable: Table = range(2).map(i =>
        range(2).map(j => {
            const [r, c] = coordinates[2 * i + j];
            return {
                backgroundColor: 0,
                text: char(maskedQRCode[r][c]),
                formula: `=%MASKED_QR_CODE[${r}][${c}]%`,
            };
        })
    );
    coordinates.forEach(([r, c]) => (maskedQRCodeTable[r][c].backgroundColor = 0));
    const bitsTable = range(2).map(i =>
        range(2).map(j => ({
            text: encodingModeBits[2 * i + j].toString(),
            formula: `=IF(R[0]C[-2]<>%WHITE%, 1, 0)`,
            ref: i === 0 && j === 0 ? "ENCODING_MODE_BITS" : undefined,
        }))
    );

    const descriptionTable = [
        [
            {
                text: encodingMode.name,
                formula: `=IFERROR(SWITCH(CONCATENATE(%ENCODING_MODE_BITS%:%ENCODING_MODE_BITS[1][1]%), ${encodingModes
                    .map(encodingMode => `"${encodingMode.code}", "${encodingMode.name}"`)
                    .join(", ")}), "Unknown")`,
                ref: "ENCODING_MODE",
            },
        ],
        [
            {
                text: encodingMode.blockSize,
                formula: `=SWITCH(R[-1]C[0], ${encodingModes
                    .map(encodingMode => `"${encodingMode.name}", ${encodingMode.blockSize}`)
                    .join(", ")})`,
                ref: "BLOCK_SIZE",
            },
            {},
            { text: "← Data block size" },
        ],
    ];
    return {
        encodingMode,
        table: blockMatrix([
            [{ text: "Encoding mode (from bottom right 2x2 grid):" }],
            [charTable, bitsTable, {}, descriptionTable],
        ]),
    };
}

function getDecodedData(
    L: number,
    version: number,
    maskedQRCode: BinaryGrid,
    maskedQRCodeTable: Table,
    dataCoordinates: [number, number][],
    encodingMode: EncodingMode
): Table {
    function getLengthBlockSizes(version: number): { [name: string]: number } {
        if (version <= 9) {
            return {
                Alphanumeric: 9,
                Byte: 8,
                Numeric: 10,
            };
        } else if (version <= 26) {
            return {
                Alphanumeric: 11,
                Byte: 16,
                Numeric: 12,
            };
        } else {
            return {
                Alphanumeric: 13,
                Byte: 16,
                Numeric: 14,
            };
        }
    }
    const maxLengthBlockSize = 16;

    const lengthBlockSizes = getLengthBlockSizes(version);
    const lengthBlockSize = lengthBlockSizes[encodingMode.name];

    const lengthBits = dataCoordinates.slice(0, lengthBlockSize).map(([r, c]) => maskedQRCode[r][c]);
    const length = parseInt(lengthBits.join(""), 2);
    const lengthTable = [
        [
            { text: "Length block:" },
            ...range(lengthBlockSize - 2).map(_ => ({})),
            {
                text: encodingMode.blockSize,
                formula: `=SWITCH(%ENCODING_MODE%, ${Object.entries(getLengthBlockSizes(version))
                    .map(([name, lengthBlockSize]) => `"${name}", ${lengthBlockSize}`)
                    .join(", ")}, 8)`,
                ref: "LENGTH_BLOCK_SIZE",
            },
        ],
        dataCoordinates.slice(0, maxLengthBlockSize).map(([r, c], i) => ({
            backgroundColor: i < lengthBlockSize ? 3 : undefined,
            text: i < lengthBlockSize ? char(lengthBits[i]) : undefined,
            formula: `=IF(${i} < %LENGTH_BLOCK_SIZE%, %MASKED_QR_CODE[${r}][${c}]%, "")`,
            ref: i === 0 ? "LENGTH_BITS" : undefined,
        })),
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
    dataCoordinates.slice(0, lengthBlockSize).forEach(([r, c]) => (maskedQRCodeTable[r][c].backgroundColor = 3));

    const blockSize = encodingMode.blockSize;
    const maxBlockSize = Math.max(...encodingModes.map(mode => mode.blockSize));
    const maxNumBlocks = Math.floor((Math.pow(L, 2) - 225) / 12); // crude estimate
    const dataBlocksTable = [
        [{ text: "Data blocks:" }],
        ...range(maxNumBlocks).map(i =>
            range(maxBlockSize).map(j => {
                const [r, c] = dataCoordinates[lengthBlockSize + blockSize * i + j];
                const cellUsed = {
                    Byte: i < length && j < 8,
                    Numeric:
                        (i < Math.floor(length / 3) && j < 10) ||
                        (i < Math.floor((length + 1) / 3) && j < 7) ||
                        (i < Math.floor((length + 2) / 3) && j < 4),
                }[encodingMode.name];
                if (cellUsed) {
                    // TODO prevent neighboring cells from using same color
                    maskedQRCodeTable[r][c].backgroundColor = (3 * i + 6) % 10;
                }

                const [byte_r, byte_c] = dataCoordinates[lengthBlockSizes.Byte + 8 * i + j];
                const [numeric_r, numeric_c] = dataCoordinates[lengthBlockSizes.Numeric + 10 * i + j];
                return {
                    backgroundColor: maskedQRCodeTable[r][c].backgroundColor,
                    text: cellUsed ? char(maskedQRCode[r][c]) : undefined,
                    formula: `=SWITCH(%ENCODING_MODE%,
"Byte", IF(AND(${i} < %LENGTH%, ${j} < 8), %MASKED_QR_CODE[${byte_r}][${byte_c}]%, ""),
"Numeric", IF(OR(
    AND(${i} < FLOOR(%LENGTH% / 3), ${j} < 10),
    AND(${i} < FLOOR((%LENGTH% + 1) / 3), ${j} < 7),
    AND(${i} < FLOOR((%LENGTH% + 2) / 3), ${j} < 4)), %MASKED_QR_CODE[${numeric_r}][${numeric_c}]%, ""),
""
)`,
                    ref: i === 0 && j === 0 ? "DATA_BLOCKS" : undefined,
                };
            })
        ),
    ];

    const decodedTable = [
        [{ text: "Decoded:" }],
        ...range(maxNumBlocks).map(i => {
            const bits = dataCoordinates
                .slice(lengthBlockSize + blockSize * i, lengthBlockSize + blockSize * (i + 1))
                .map(([r, c]) => maskedQRCode[r][c]);
            const int = parseInt(bits.join(""), 2);
            const decoded = {
                Byte: i < length ? String.fromCodePoint(int) : undefined,
                Numeric:
                    i < length / 3
                        ? (i === (length - 1) / 3 ? int >> 6 : i === (length - 2) / 3 ? int >> 3 : int).toString()
                        : undefined,
            }[encodingMode.name];
            return [
                {
                    text: decoded,
                    formula: `=LET(
${betterBin2Dec},
int, betterBin2Dec(MID(CONCATENATE(ARRAYFORMULA(IF(%DATA_BLOCKS[${i}][0]%:%DATA_BLOCKS[${i}][${maxBlockSize}]% = %BLACK%, 1, 0))), 1, %BLOCK_SIZE%)),
SWITCH(%ENCODING_MODE%,
"Byte", IF(${i} < %LENGTH%, CHAR(int), ""),
"Numeric", IF(${i} < %LENGTH% / 3, IF(${i} = (%LENGTH% - 1) / 3, BITRSHIFT(int, 6), IF(${i} = (%LENGTH% - 2) / 3, BITRSHIFT(int, 3), int)), ""),
))`,
                },
            ];
        }),
    ];

    return blockMatrix([
        [lengthTable] /* force new line .................... */,
        [{}],
        [dataBlocksTable, {}, decodedTable],
    ]);
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
    const {
        errorCorrectionLevel,
        table: errorCorrectionLevelTable,
        description: errorCorrectionLevelDescription,
    } = getErrorCorrectionLevel(formatBits);
    const { maskIndex, table: maskIndexTable, description: maskIndexDescription } = getMaskIndex(formatBits);
    const { maskGrid, table: maskGridTable } = getMaskGrid(maskIndex);

    const paddedMaskBitsTable = blockMatrix([[{}], [maskIndexTable]]);
    const formatDescriptionTable = blockMatrix([
        [errorCorrectionLevelDescription] /* force new line .................... */,
        [maskIndexDescription],
        [maskGridTable],
    ]);
    const formatInfoTable = blockMatrix([
        [formatBitsTable] /* force new line */,
        [{}],
        [errorCorrectionLevelTable, paddedMaskBitsTable, {}, formatDescriptionTable],
    ]);

    const dataAreas = getDataAreas(L, version, formatCoordinates);
    const dataCoordinates = getDataCoordinates(L, dataAreas);

    const { maskedQRCode, table: maskedQRCodeTable } = getMaskedQRCode(originalQRCode, maskGrid, dataAreas);
    const { encodingMode, table: encodingModeTable } = getEncodingMode(L, version, maskedQRCode, maskedQRCodeTable);
    const decodedDataTable = getDecodedData(L, version, maskedQRCode, maskedQRCodeTable, dataCoordinates, encodingMode);
    const decodedTable = blockMatrix([
        [encodingModeTable] /* force new line .................... */,
        [{}],
        [decodedDataTable],
    ]);

    const table = blockMatrix([
        [binarySymbols],
        [{}],
        [{ text: `Version ${version} QR code (${L}x${L})` }],
        [originalQRCodeTable, {}, formatInfoTable],
        [{}],
        [{ text: "Data portions (with mask applied):" }],
        [maskedQRCodeTable, {}, decodedTable],
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
