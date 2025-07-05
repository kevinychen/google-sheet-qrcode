# QR Code decoder in Google Sheets

A QR Code decoder implemented in Google Sheets: [Google Sheet link](https://docs.google.com/spreadsheets/d/1VcKjPQZmkpJPoo1CtD7yLXA9FAob_F9NqnFDD9MZqqA).

Each step of the decoding process is computed with Google Sheet formulas.
Changing the modules of the input QR Code will automatically update intermediate steps and final output message:

![Demo 1](docs/demo1.gif)

More "drastic" input changes are supported too, such as changing the encoding mode modules:

![Demo 2](docs/demo2.gif)

This also comes with [a tool](https://kevinychen.github.io/google-sheet-qrcode/?raw) to convert an image of a QR Code into a binary matrix that can be pasted into the Google Sheet:

![Demo 3](docs/demo3.gif)


### Generating a Google Sheet

Go to the [template Google Sheet](https://docs.google.com/spreadsheets/d/1VcKjPQZmkpJPoo1CtD7yLXA9FAob_F9NqnFDD9MZqqA), find the appropriate sheet for the QR Code version, and right-click > Copy to.

Alternatively, generate from source:
1. Go to [this page](https://kevinychen.github.io/google-sheet-qrcode/) and upload a QR Code.
2. Click "Copy contents to clipboard" and paste into a Google Sheet at cell `A1`.
3. Go to Extensions > Apps Script, and paste in the contents of [appsscript.js](./appsscript.js).
5. Click "Run".
6. Currently adding Checkbox data validation for integers in Apps Script doesn't work correctly. Manually go to Data > Data Validation, click the Checkbox rule, and change the "Checked" and "Unchecked" values to `1` and `0` respectively.


### Development

Run `npm run dev` and go to http://localhost:1234.

Before committing a change, run `npm run build` and include the changes to the [docs](./docs) directory.

