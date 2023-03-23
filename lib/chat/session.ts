import crypto from "crypto";
import Authenticator from "openai-token";
import { ChatGPTUnofficialProxyAPI } from "chatgpt";
import redis from "@/lib/redis";

const maxSendRetries = 3;

type LoginCredentials = {
    email: string;
    password: string;
};

type Session = {
    id: string;
    conversationId: string | undefined;
    parentMessageId: string | undefined;
    currentMessage: string | undefined;
    isMessagePartial: "true" | "false";
};

export type ChatMessage = {
    isMessagePartial: boolean;
    currentMessage: string;
};

class ChatApp {
    private api: ChatGPTUnofficialProxyAPI | null = null;
    private loginCredentials: LoginCredentials;
    private init: Promise<void>;
    constructor(loginCredentials: LoginCredentials) {
        this.loginCredentials = loginCredentials;
        this.init = new Promise<void>(async (resolve, reject) => {
            try {
                await this._login();
            } catch {
                try {
                    await this._login(true);
                } catch (e) {
                    reject(e);
                }
            }
            resolve();
        });
    }
    private async _login(forceRelogin = false) {
        let accessToken: string;
        if (!forceRelogin && (await redis.exists("openai-token")) == 1) {
            accessToken = (await redis.get("openai-token"))!;
        } else {
            let authenticator = new Authenticator(
                this.loginCredentials.email,
                this.loginCredentials.password
            );
            await authenticator.begin();
            accessToken = await authenticator.getAccessToken();
            await redis.set("openai-token", accessToken);
        }
        this.api = new ChatGPTUnofficialProxyAPI({ accessToken });
    }
    public async createSession() {
        await this.init;
        let id = crypto.randomUUID();
        let session = "sess-" + id;
        if ((await redis.exists(session)) == 1) throw new Error("Session already exist");
        let obj: Session = {
            id,
            parentMessageId: undefined,
            conversationId: undefined,
            currentMessage: undefined,
            isMessagePartial: "false",
        };
        await redis.hmset(session, obj);
        await redis.expire(session, 12 * 60 * 60);
        return id;
    }
    public async sendMessage(id: string, text: string) {
        await this.init;
        if (!this.api) throw new Error();
        let session = "sess-" + id;
        if ((await redis.exists(session)) == 0) throw new Error("Session not exist");
        if ((await redis.hget(session, "isMessagePartial")) == "true")
            throw new Error("A response has been generating");
        await redis.hset(session, "isMessagePartial", "true");
        await redis.hset(session, "currentMessage", "");
        let messageId = crypto.randomUUID();
        (async () => {
            if (!this.api) throw new Error();
            for (let i = 0; i < maxSendRetries; i++) {
                try {
                    let message = await this.api.sendMessage(text, {
                        messageId: messageId,
                        conversationId:
                            (await redis.hget(session, "conversationId")) || undefined,
                        parentMessageId:
                            (await redis.hget(session, "parentMessageId")) || undefined,
                        onProgress: async (partialMessage) => {
                            await redis.hset(
                                session,
                                "currentMessage",
                                partialMessage.text
                            );
                        },
                    });
                    await redis.hset(session, "isMessagePartial", "false");
                    await redis.hset(session, "currentMessage", message.text);
                    await redis.hset(session, "conversationId", message.conversationId!);
                    await redis.hset(
                        session,
                        "parentMessageId",
                        message.parentMessageId!
                    );
                    break;
                } catch {
                    if (i == maxSendRetries - 1) {
                        await redis.hset(session, "isMessagePartial", "false");
                        await redis.hset(
                            session,
                            "currentMessage",
                            "Failed to send message"
                        );
                    }
                }
            }
        })();
    }
    public async getCurrentMessage(id: string): Promise<ChatMessage> {
        await this.init;
        if (!this.api) throw new Error();
        let session = "sess-" + id;
        if ((await redis.exists(session)) == 1)
            return {
                isMessagePartial:
                    (await redis.hget(session, "isMessagePartial")) == "true",
                currentMessage: (await redis.hget(session, "currentMessage")) || "",
            };
        else throw new Error("Session not exist");
    }
}

if (!process.env.OPENAI_ACCOUNT_EMAIL)
    throw new ReferenceError("process.env.OPENAI_ACCOUNT_EMAIL is not defined");
if (!process.env.OPENAI_ACCOUNT_PASSWORD)
    throw new ReferenceError("process.env.OPENAI_ACCOUNT_PASSWORD is not defined");

let app = new ChatApp({
    email: process.env.OPENAI_ACCOUNT_EMAIL,
    password: process.env.OPENAI_ACCOUNT_PASSWORD,
});

export default app;
