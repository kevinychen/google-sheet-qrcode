export function assert(test: any, error?: string) {
    if (!test) {
        throw new Error(error);
    }
}

export function blockMatrix<T extends {}>(blocks: (T[][] | {})[][]): T[][] {
    const blockMatrix: T[][] = [];

    for (const originalRow of blocks) {
        const row = originalRow.map(block => (Array.isArray(block) ? block : [[block]]));
        const maxHeight = Math.max(...row.map(block => block.length));

        const paddedBlocks = row.map((block, i) => {
            const paddedBlock = block.map(row => row.slice());
            while (paddedBlock.length < maxHeight) {
                paddedBlock.push([]);
            }

            if (i < row.length - 1) {
                const maxWidth = Math.max(...block.map(row => row.length));
                for (const row of paddedBlock) {
                    while (row.length < maxWidth) {
                        row.push({});
                    }
                }
            }
            return paddedBlock;
        });

        for (let r = 0; r < maxHeight; r++) {
            blockMatrix.push(paddedBlocks.flatMap(block => block[r]));
        }
    }

    return blockMatrix;
}

export function range(n: number) {
    const range = [];
    for (let i = 0; i < n; i++) {
        range.push(i);
    }
    return range;
}

export function sum(list: number[]) {
    return list.reduce((a, b) => a + b);
}
