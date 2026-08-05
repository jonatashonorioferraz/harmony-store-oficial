export interface GlobalConfigurationReader { getActive<T>(key: string, fallback: T): Promise<T>; }
