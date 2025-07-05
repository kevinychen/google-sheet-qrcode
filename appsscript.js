// This Apps Script file can be added to the Google Sheet to auto-generate desired formatting.
const NUM_CODEWORDS = {
    1: 19,
    2: 34,
    3: 55,
    4: 80,
    5: 108,
    6: 136,
    7: 156,
    8: 194,
    9: 232,
    10: 274,
    11: 324,
    12: 370,
    13: 428,
    14: 461,
    15: 523,
    16: 569,
    17: 647,
    18: 721,
    19: 795,
    20: 861,
    21: 932,
    22: 1006,
    23: 1094,
    24: 1174,
    25: 1276,
    26: 1370,
    27: 1468,
    28: 1531,
    29: 1631,
    30: 1735,
    31: 1843,
    32: 1955,
    33: 2071,
    34: 2191,
    35: 2306,
    36: 2434,
    37: 2566,
    38: 2702,
    39: 2812,
    40: 2956,
};

const GRAY_COLOR = "#999999";
const RAINBOW_COLORS = [
    "#e6b8af",
    "#f4cccc",
    "#fce5cd",
    "#fff2cc",
    "#d9ead3",
    "#d0e0e3",
    "#c9daf8",
    "#cfe2f3",
    "#d9d2e9",
    "#ead1dc",
];

function setup() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const value = sheet.getRange("A1").getValue();
    const match = value.match(/Version (\d)+ QR Code/);
    if (!match) {
        throw new Error("Expected version information in cell A1");
    }

    const version = parseInt(match[1]);
    const L = 4 * version + 17;

    // In Version 1, the file format information takes more rows than the QR code, so everything is shifted down.
    const skew = version == 1 ? 3 : 0;

    const numRows = sheet.getMaxRows();
    const expectedNumRows = NUM_CODEWORDS[version] + L + 14 + skew;
    if (numRows < expectedNumRows) {
        sheet.insertRows(numRows, expectedNumRows - numRows);
    }
    if (numRows > expectedNumRows) {
        sheet.deleteRows(expectedNumRows + 1, numRows - expectedNumRows);
    }

    const numColumns = sheet.getMaxColumns();
    const expectedNumColumns = L + 56;
    if (numColumns < expectedNumColumns) {
        sheet.insertColumns(numColumns, expectedNumColumns - numColumns);
    }
    if (numColumns > expectedNumColumns) {
        sheet.deleteColumns(expectedNumColumns + 1, numColumns - expectedNumColumns);
    }

    sheet.setRowHeightsForced(1, expectedNumRows, 21);
    sheet.setRowHeightsForced(L + 4 + skew, 1, 84); // row with longer descriptions
    sheet.setColumnWidths(1, expectedNumColumns, 21);

    sheet.getRange(3, 1, L, L).setDataValidation(
        SpreadsheetApp.newDataValidation()
            // The 0 and 1 are interpreted as floats - need to manually update this afterwards.
            .requireCheckbox(1, 0)
            .build()
    );

    const stringToColor = new Map();
    stringToColor.set("G", GRAY_COLOR);
    for (let i = 0; i < 10; i++) {
        stringToColor.set(i.toString(), RAINBOW_COLORS[i]);
    }
    const rules = [];
    stringToColor.forEach((color, string) => {
        rules.push(
            SpreadsheetApp.newConditionalFormatRule()
                .whenTextContains("🌈" + string)
                .setBackground(color)
                .setRanges([sheet.getRange(1, 1, expectedNumRows, expectedNumColumns)])
                .build()
        );
    });
    sheet.setConditionalFormatRules(rules);
}
