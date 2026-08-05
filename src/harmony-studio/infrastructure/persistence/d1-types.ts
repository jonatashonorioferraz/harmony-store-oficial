export interface D1Result<T = unknown> { results?: T[]; success: boolean; }
export interface D1Statement { bind(...values: unknown[]): D1Statement; run<T = unknown>(): Promise<D1Result<T>>; first<T = unknown>(): Promise<T | null>; all<T = unknown>(): Promise<D1Result<T>>; }
export interface D1DatabasePort { prepare(sql: string): D1Statement; batch<T = unknown>(statements: D1Statement[]): Promise<D1Result<T>[]>; }
