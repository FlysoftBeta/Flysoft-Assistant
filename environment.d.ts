declare namespace NodeJS {
    export interface ProcessEnv {
        readonly NODE_ENV: "development" | "production" | "test";
        readonly REDIS_URL: string;
        readonly OPENAI_ACCOUNT_EMAIL: string;
        readonly OPENAI_ACCOUNT_PASSWORD: string;
    }
}
