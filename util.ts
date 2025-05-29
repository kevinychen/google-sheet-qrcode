export function assert(test: any, error?: string) {
    if (!test) {
        throw new Error(error);
    }
}

export function range(n: number) {
    const range = [];
    for (let i = 0; i < n; i++) {
        range.push(i);
    }
    return range;
}
