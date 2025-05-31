import { QRCode } from "jsqr";
import { Cell, Table } from "./google-sheet-html";
import { assert, blockMatrix, range } from "./util";

export type Bit = 0 | 1;
export type BinaryGrid = Bit[][];
export type FormatCoordinates = { horizontal: [number, number][]; vertical: [number, number][] };
export type ErrorCorrectionLevel = { name: string; description: string };
export type EncodingMode = { code: string; description: string; blockSize: number };

const errorCorrectionLevels = [
    { name: "H", description: "HIGH" },
    { name: "Q", description: "QUARTILE" },
    { name: "M", description: "MEDIUM" },
    { name: "L", description: "LOW" },
];
const encodingModes = [
    { code: "1000", description: "Numeric", blockSize: 10 },
    { code: "0100", description: "Alphanumeric", blockSize: 11 },
    { code: "0010", description: "Byte", blockSize: 8 },
    { code: "0001", description: "Kanji", blockSize: 13 },
    { code: "?", description: "Unknown", blockSize: 8 },
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

function getDataAreas(L: number, formatCoordinates: FormatCoordinates): boolean[][] {
    const version = (L - 17) / 4;

    const dataAreas: boolean[][] = range(L).map(_ => range(L).map(_ => true));

    // Remove finder patterns and separators
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 8; j++) {
            dataAreas[i][j] = false;
            dataAreas[i][L - 1 - j] = false;
            dataAreas[L - 1 - i][j] = false;
        }
    }

    // Remove timing patterns
    for (let i = 8; i < L - 8; i++) {
        dataAreas[6][i] = false;
        dataAreas[i][6] = false;
    }

    // Remove alignment patterns
    const numAlignmentCoordinates = Math.floor((version + 12) / 7);
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

    // Remove format information
    formatCoordinates.horizontal.forEach(([r, c]) => (dataAreas[r][c] = false));
    formatCoordinates.vertical.forEach(([r, c]) => (dataAreas[r][c] = false));

    // Pixel that's always black
    dataAreas[L - 8][8] = false;

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
    const encodingMode =
        encodingModes.find(mode => mode.code === encodingModeBits.join("")) || encodingModes[encodingModes.length - 1];

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
                text: encodingMode.description,
                formula: `=IFERROR(SWITCH(CONCATENATE(%ENCODING_MODE_BITS%:%ENCODING_MODE_BITS[1][1]%), ${encodingModes
                    .map(encodingMode => `"${encodingMode.code}", "${encodingMode.description}"`)
                    .join(", ")}), "Unknown")`,
                ref: "ENCODING_MODE",
            },
        ],
        [
            {
                text: encodingMode.blockSize,
                formula: `=SWITCH(R[-1]C[0], ${encodingModes
                    .map(encodingMode => `"${encodingMode.description}", ${encodingMode.blockSize}`)
                    .join(", ")})`,
                ref: "BLOCK_SIZE",
            },
            { text: "← Data bits block size" },
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
    maskedQRCode: BinaryGrid,
    maskedQRCodeTable: Table,
    dataCoordinates: [number, number][],
    encodingMode: EncodingMode
): Table {
    const dataBits = dataCoordinates.map(([r, c]) => maskedQRCode[r][c]);
    const numCodewords = 19;
    const maxBlockSize = 13;

    function decode(codeword: Bit[], encodingMode: string): string {
        const int = parseInt(codeword.join(""), 2);
        switch (encodingMode) {
            case "Byte":
                return String.fromCodePoint(int);
            default:
                return int.toString();
        }
    }

    // DEC2BIN only works up to 2^10, so we need to split a binary string into 2 parts of size [L - d, d].
    const d = 4;
    assert(d < encodingMode.blockSize && maxBlockSize - d <= 10);

    const table = [
        [{ text: "Data bits (starting from bottom right, zigzag upwards and downwards):" }],
        [
            {
                text: dataBits.join(""),
                formula: `=CONCATENATE(MAP({${dataCoordinates
                    .map(([r, c]) => `%MASKED_QR_CODE[${r}][${c}]%`)
                    .join(", ")}}, LAMBDA(s, IF(s<>%WHITE%, 1, 0))))`,
                ref: "DATA_BITS",
            },
        ],
        [{}],
        [{ text: "Data bits in blocks:" }, ...range(12).map(_ => ({})), { text: "Decoded:" }],
        ...range(numCodewords).map(i => [
            ...range(maxBlockSize).map(j => ({
                backgroundColor: j < encodingMode.blockSize ? (3 * i + 3) % 10 : undefined,
                text: j < encodingMode.blockSize ? char(dataBits[i * encodingMode.blockSize + j]) : undefined,
                formula: `=IF(${j} < %BLOCK_SIZE%, IF(MID(%DATA_BITS%, ${i} * %BLOCK_SIZE% + ${j} + 1, 1)<>"1", %WHITE%, %BLACK%), "")`,
            })),
            {
                text: decode(
                    dataBits.slice(i * encodingMode.blockSize, (i + 1) * encodingMode.blockSize),
                    i === 0 ? "Length" : encodingMode.description
                ),
                formula: `=LET(
int, BIN2DEC(MID(%DATA_BITS%, ${i} * %BLOCK_SIZE% + 1, %BLOCK_SIZE% - ${d})) * ${1 << d} + BIN2DEC(MID(%DATA_BITS%, ${
                    i + 1
                } * %BLOCK_SIZE% - ${d - 1}, ${d})),
SWITCH(${i === 0 ? `"Length"` : "%ENCODING_MODE%"},
    "Byte", CHAR(int),
    int))`,
            },
            {
                text: i === 0 ? "← Length" : undefined,
            },
        ]),
    ];

    for (let i = 0; i < numCodewords; i++) {
        for (let j = 0; j < encodingMode.blockSize; j++) {
            const [r, c] = dataCoordinates[i * encodingMode.blockSize + j];
            maskedQRCodeTable[r][c].backgroundColor = (3 * i + 3) % 10;
        }
    }

    return table;
}

export function toTable(originalQRCode: BinaryGrid): Table {
    const L = originalQRCode.length;

    assert(L >= 21 && L <= 177 && L % 4 === 1, "Invalid QR code size");
    for (const row of originalQRCode) {
        assert(row.length === L, "QR code must be a square");
    }

    const blackCharacter: Table = [[{ text: char(1), ref: "BLACK" }, { text: "← black character" }]];
    const whiteCharacter: Table = [[{ text: char(0), ref: "WHITE" }, { text: "← white character" }]];

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

    const dataAreas = getDataAreas(L, formatCoordinates);
    const dataCoordinates = getDataCoordinates(L, dataAreas);

    const { maskedQRCode, table: maskedQRCodeTable } = getMaskedQRCode(originalQRCode, maskGrid, dataAreas);
    const { encodingMode, table: encodingModeTable } = getEncodingMode(L, maskedQRCode, maskedQRCodeTable);
    const decodedDataTable = getDecodedData(maskedQRCode, maskedQRCodeTable, dataCoordinates, encodingMode);
    const decodedTable = blockMatrix([
        [encodingModeTable] /* force new line .................... */,
        [{}],
        [decodedDataTable],
    ]);

    const table = blockMatrix([
        [blackCharacter],
        [whiteCharacter],
        [{}],
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
