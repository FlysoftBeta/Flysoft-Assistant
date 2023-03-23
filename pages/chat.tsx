import axios from "axios";
import { useState, useEffect } from "react";
import { PCMAudio, pcmToWav } from "@/lib/utils/audio";
import type { Response } from "@/lib/handler";
import Head from "next/head";
import ExpandedTextarea from "@/components/expanded-textarea";

const punctuationMarks = [
    "。",
    "？",
    "！",
    "；",
    "：",
    // ----------
    // Note:
    // We add a space to the end of ".", "?", "!",
    // so that phrases like "GPT3.5" will not
    // be split into two sentences.
    ". ",
    "? ",
    "! ",
    // ----------
    ";",
    ":",
    "`",
    '"',
];

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    text: string;
}

function MessageList(props: { children: ChatMessage[] }) {
    return (
        <div
            style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                gap: 10,
                padding: 10,
                background: "var(--message-list-bg)",
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
            }}
        >
            {props.children.map((message) => {
                return <Message key={message.id}>{message}</Message>;
            })}
            <div style={{ width: "100%", height: 50, flexShrink: 0 }}></div>
        </div>
    );
}

function Message(props: { children: ChatMessage }) {
    const isUser = props.children.role == "user";

    return (
        <div
            style={{
                display: "flex",
                padding: 10,
                ...(isUser ? { flexDirection: "row-reverse" } : { flexDirection: "row" }),
            }}
        >
            <div
                style={{
                    borderRadius: 8,
                    padding: 10,
                    maxWidth: "80%",
                    overflow: "hidden",
                    wordBreak: "break-word",
                    fontSize: props.children.text.length > 20 ? "16px" : "17px",
                    lineHeight: "23px",
                    ...(isUser
                        ? {
                              background: "var(--message-highlight-bg)",
                              borderTopRightRadius: 0,
                          }
                        : { background: "var(--message-bg)", borderTopLeftRadius: 0 }),
                }}
            >
                {props.children.role + ": " + props.children.text}
            </div>
        </div>
    );
}

function MessageInput(props: { onSend: (message: string) => void }) {
    const [value, setValue] = useState<string>("");

    function sendMessage() {
        if (!value) return;
        props.onSend(value);
        setValue("");
    }

    return (
        <div
            style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
                gap: 5,
                padding: 10,
                transition: "background ease 0.1s",
                background: "var(--layer-bg)",
                backdropFilter: "var(--layer-blur)",
            }}
        >
            <ExpandedTextarea
                value={value}
                onInput={(e) => setValue((e.target as HTMLTextAreaElement).value)}
                style={{
                    padding: 10,
                    maxHeight: 100,
                    lineHeight: "10px",
                    resize: "none",
                }}
            ></ExpandedTextarea>
            <button onClick={sendMessage}>Send</button>
        </div>
    );
}

export default function Chat() {
    const [session, setSession] = useState<string>();
    const [isMessageGenerating, setIsMessageGenerating] = useState<boolean>(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    const [isSpeakingEnabled, setIsSpeakingEnabled] = useState<boolean>(false);
    const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
    const [pendingSpeakingAudios, setPendingSpeakingAudios] = useState<PCMAudio[]>([]);
    const [speakingAudioCtx, setSpeakingAudioCtx] = useState<AudioContext>();

    useEffect(() => {
        setSpeakingAudioCtx(new AudioContext());
    }, [isSpeakingEnabled]);

    useEffect(() => {
        (async () => {
            let res = await axios.post<Response<string>>("/api/chat/new", {});
            setSession(res.data.data);
        })();

        return () => {
            async () => {
                await axios.post<Response<void>>("/api/chat/delete", { session });
            };
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Voice output
    useEffect(() => {
        (async () => {
            if (pendingSpeakingAudios.length > 0)
                if (isSpeakingEnabled) setPendingSpeakingAudios([]);
                else if (!isSpeaking && speakingAudioCtx) {
                    setIsSpeaking(true);
                    await new Promise<void>(async (resolve) => {
                        let audio = pendingSpeakingAudios.shift()!;
                        let buffer = await speakingAudioCtx.decodeAudioData(
                            pcmToWav(audio).buffer
                        );
                        let source = speakingAudioCtx.createBufferSource();
                        source.buffer = buffer;
                        source.connect(speakingAudioCtx.destination);
                        source.start(0);
                        source.addEventListener("ended", () => {
                            resolve();
                        });
                    });
                    setIsSpeaking(false);
                }
        })();
    }, [isSpeakingEnabled, pendingSpeakingAudios, speakingAudioCtx, isSpeaking]);

    // Receive messages and generate voice
    useEffect(() => {
        let timeout: number;
        if (isMessageGenerating) {
            let segmentedSpeakPosition = -1;
            let updateCurrentMessage = async () => {
                let res = await axios.post<
                    Response<{ isMessagePartial: boolean; currentMessage: string }>
                >("/api/chat/get", { session });
                let message = res.data.data.currentMessage;

                setMessages((messages) => {
                    let lastMessage = messages[messages.length - 1];
                    if (!message.startsWith(lastMessage.text))
                        throw new Error("Unexpected response");
                    lastMessage.text = message;
                    return messages.slice();
                });

                if (isSpeakingEnabled) {
                    let cleanedMessage = message.replaceAll("\n", " ");
                    while (true) {
                        let lastSegmentedSpeakPosition = segmentedSpeakPosition;
                        for (const mark of punctuationMarks) {
                            let position = cleanedMessage.indexOf(
                                mark,
                                lastSegmentedSpeakPosition + 1
                            );
                            if (position != -1) {
                                segmentedSpeakPosition = position + mark.length - 1;
                                break;
                            }
                        }
                        if (segmentedSpeakPosition != lastSegmentedSpeakPosition) {
                            let segmentedSpeak = cleanedMessage
                                .substring(
                                    lastSegmentedSpeakPosition + 1,
                                    segmentedSpeakPosition + 1
                                )
                                .replaceAll("\n", "");
                            let res = await axios.post<Response<PCMAudio>>(
                                "/api/voice/speak",
                                {
                                    text: segmentedSpeak,
                                }
                            );
                            setPendingSpeakingAudios((pendingSpeakingAudios) => {
                                return [...pendingSpeakingAudios, res.data.data];
                            });
                        } else {
                            break;
                        }
                    }
                }

                if (!res.data.data.isMessagePartial) setIsMessageGenerating(false);
                timeout = window.setTimeout(updateCurrentMessage, 300);
            };

            updateCurrentMessage();
        }

        return () => {
            if (timeout) {
                window.clearTimeout(timeout);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMessageGenerating]);

    async function sendMessage(text: string) {
        if (isMessageGenerating) return;

        let id = crypto.randomUUID();
        let responseId = crypto.randomUUID();
        setMessages((messages) => {
            return [
                ...messages,
                { id, role: "user", text },
                { id: responseId, role: "assistant", text: "" },
            ];
        });
        await axios.post<Response<string>>("/api/chat/send", { session, text });
        setIsMessageGenerating(true);
    }

    return (
        <>
            <Head>
                <title>Flysoft Assistant</title>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <link rel="icon" href="/favicon.ico" />
            </Head>
            <input
                type="checkbox"
                checked={isSpeakingEnabled}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setIsSpeakingEnabled((e.target as HTMLInputElement).checked)
                }
            />
            <main
                style={{
                    overflow: "hidden",
                    position: "relative",
                    width: "100vw",
                    height: "100vh",
                }}
            >
                <MessageList>
                    {[
                        { id: "1", role: "assistant", text: "hello!" },
                        { id: "2", role: "user", text: "hello!" },
                        {
                            id: "3",
                            role: "assistant",
                            text: "hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!\n!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!hello!\n",
                        },
                        ...messages,
                    ]}
                </MessageList>
                <MessageInput onSend={sendMessage}></MessageInput>
            </main>
        </>
    );
}
