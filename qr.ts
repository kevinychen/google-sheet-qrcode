import { QRCode } from "jsqr";
import { Cell, Table } from "./google-sheet-html";
import { assert, blockMatrix, range } from "./util";

export type Bit = 0 | 1;
export type BinaryGrid = Bit[][];

const errorCorrectionLevels = "HQML";

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

function toOriginalQRCode(originalQRCode: BinaryGrid): Table {
    return originalQRCode.map((row, r) =>
        row.map((bit, c) => ({
            text: char(bit),
            formula: bit ? "=%BLACK%" : "=%WHITE%",
            ref: r === 0 && c === 0 ? "ORIGINAL_QR_CODE" : undefined,
        }))
    );
}

function getFormatBits(code: BinaryGrid, L: number, originalQRCodeTable: Table): { formatBits: Bit[]; table: Table } {
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

    const indices = [0, 1, 2, 3, 4, 5, 7, 8, L - 7, L - 6, L - 5, L - 4, L - 3, L - 2, L - 1];
    const horizontalBits = indices.map(c => code[8][c]);
    table.push([{ text: "Horizontal format information (masked):" }]);
    table.push(
        indices.map((c, i) => ({
            backgroundColor: colors[i],
            text: char(horizontalBits[i]),
            formula: `=%ORIGINAL_QR_CODE[8][${c}]%`,
        }))
    );
    indices.forEach((c, i) => (originalQRCodeTable[8][c].backgroundColor = colors[i]));
    table.push(
        horizontalBits.map((bit, i) => ({
            text: bit.toString(),
            formula: "=IF(R[-1]C[0]<>%WHITE%, 1, 0)",
            ref: i === 0 ? "HORIZONTAL_BITS" : undefined,
        }))
    );

    indices.reverse();
    const verticalBits = indices.map(c => code[c][8]);
    table.push([]);
    table.push([{ text: "Vertical format information (masked):" }]);
    table.push(
        indices.map((c, i) => ({
            backgroundColor: colors[i],
            text: char(verticalBits[i]),
            formula: `=%ORIGINAL_QR_CODE[${c}][8]%`,
        }))
    );
    indices.forEach((c, i) => (originalQRCodeTable[c][8].backgroundColor = colors[i]));
    table.push(
        verticalBits.map((bit, i) => ({
            text: bit.toString(),
            formula: "=IF(R[-1]C[0]<>%WHITE%, 1, 0)",
            ref: i === 0 ? "VERTICAL_BITS" : undefined,
        }))
    );
    indices.forEach((c, i) => (originalQRCodeTable[c][8].backgroundColor = colors[i]));

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
    table.push(
        range(15).map(i => ({
            backgroundColor: colors[i],
            text: char(formatBits[i]),
            formula: `=INDEX({${BCH_options.map(option => `"${char(((option >> (14 - i)) % 2) as Bit)}"`).join(
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

function getErrorCorrectionLevel(formatBits: Bit[]): { errorCorrectionLevel: string; table: Table; description: Cell } {
    const words = ["H (HIGH)", "Q (QUARTILE)", "M (MEDIUM)", "L (LOW)"];
    const errorCorrectionLevel = errorCorrectionLevels[parseInt(formatBits.slice(0, 2).join(""), 2)];

    return {
        errorCorrectionLevel,
        table: [
            [
                {
                    backgroundColor: 1,
                    text: errorCorrectionLevel,
                    formula: `=INDEX({${errorCorrectionLevels
                        .split("")
                        .map(c => `"${c}"`)
                        .join("; ")}}, BIN2DEC(CONCATENATE(%FORMAT_BITS%:%FORMAT_BITS[0][1]%)) + 1)`,
                    ref: "ERROR_CORRECTION_LEVEL",
                },
                {
                    backgroundColor: 1,
                },
            ],
        ],
        description: {
            text: `Grid error correction: ${words[errorCorrectionLevels.indexOf(errorCorrectionLevel)]}`,
            formula: `="Grid error correction: " & INDEX({${words
                .map(word => `"${word}"`)
                .join("; ")}}, XMATCH(%ERROR_CORRECTION_LEVEL%, {${errorCorrectionLevels
                .split("")
                .map(c => `"${c}"`)
                .join("; ")}}))`,
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
                formula: `=INDEX({${masks.map(mask => `"${char(mask[r][c])}"`).join("; ")}}, %MASK_INDEX% + 1)`,
                ref: r === 0 && c === 0 ? "MASK_GRID" : undefined,
            }))
        ),
    };
}

function getDataAreas(L: number): boolean[][] {
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
    return dataAreas;
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
): { encodingMode: number; table: Table } {
    const coordinates = [
        [L - 2, L - 2],
        [L - 2, L - 1],
        [L - 1, L - 2],
        [L - 1, L - 1],
    ];
    const encodingModeBits = coordinates.map(([r, c]) => maskedQRCode[r][c]);
    const encodingMode = parseInt(encodingModeBits.toReversed().join(""), 2);

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

    const words = ["", "Numeric", "Alphanumeric", "", "Byte", "", "", "ECI", "Kanji"];
    const descriptionTable = [
        [{ text: "Encoding mode:" }],
        [
            {
                text: words[encodingMode],
                formula: `=INDEX({${words
                    .map(s => `"${s}"`)
                    .join(
                        "; "
                    )}}, BIN2DEC(%ENCODING_MODE_BITS[1][1]% & %ENCODING_MODE_BITS[1][0]% & %ENCODING_MODE_BITS[0][1]% & %ENCODING_MODE_BITS%) + 1)`,
                ref: "ENCODING_MODE",
            },
        ],
    ];
    return {
        encodingMode,
        table: blockMatrix([[charTable, bitsTable, {}, descriptionTable]], {}),
    };
}

export function toTable(originalQRCode: BinaryGrid): Table {
    const L = originalQRCode.length;

    assert(L >= 21 && L <= 177 && L % 4 === 1, "Invalid QR code size");
    for (const row of originalQRCode) {
        assert(row.length === L, "QR code must be a square");
    }

    const blackCharacter: Table = [[{ text: char(1), ref: "BLACK" }, { text: "← black character" }]];
    const whiteCharacter: Table = [[{ text: char(0), ref: "WHITE" }, { text: "← white character" }]];

    const originalQRCodeTable = toOriginalQRCode(originalQRCode);

    // https://en.wikipedia.org/wiki/QR_code#/media/File:QR_Format_Information.svg
    const { formatBits, table: formatBitsTable } = getFormatBits(originalQRCode, L, originalQRCodeTable);
    const {
        errorCorrectionLevel,
        table: errorCorrectionLevelTable,
        description: errorCorrectionLevelDescription,
    } = getErrorCorrectionLevel(formatBits);
    const { maskIndex, table: maskIndexTable, description: maskIndexDescription } = getMaskIndex(formatBits);
    const { maskGrid, table: maskGridTable } = getMaskGrid(maskIndex);

    const paddedMaskBitsTable = blockMatrix([[{}], [maskIndexTable]], {});
    const formatDescriptionTable = blockMatrix(
        [
            [errorCorrectionLevelDescription] /* force new line .................... */,
            [maskIndexDescription],
            [maskGridTable],
        ],
        {}
    );
    const formatInfoTable = blockMatrix(
        [
            [formatBitsTable] /* force new line */,
            [{}],
            [errorCorrectionLevelTable, paddedMaskBitsTable, {}, formatDescriptionTable],
        ],
        {}
    );

    const dataAreas = getDataAreas(L);
    const { maskedQRCode, table: maskedQRCodeTable } = getMaskedQRCode(originalQRCode, maskGrid, dataAreas);
    const { encodingMode, table: encodingModeTable } = getEncodingMode(L, maskedQRCode, maskedQRCodeTable);

    const table = blockMatrix(
        [
            [blackCharacter],
            [whiteCharacter],
            [{}],
            [originalQRCodeTable, {}, formatInfoTable],
            [{}],
            [{ text: "Apply mask:" }],
            [maskedQRCodeTable, {}, encodingModeTable],
        ],
        {}
    );

    for (const row of table) {
        for (const cell of row) {
            cell.width = 20;
            cell.height = 20;
        }
    }

    return table;
}
