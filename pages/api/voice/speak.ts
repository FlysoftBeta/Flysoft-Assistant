import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import { object, string } from "decoders";
import {
    createRequestHandler,
    getRequestData,
    HandlerError,
    ResponseStatusCode,
} from "@/lib/handler";
import type { PCMAudio } from "@/lib/utils/audio";

function getXTime() {
    let date = new Date();
    return new Date(
        Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            date.getUTCHours(),
            date.getUTCMinutes(),
            date.getUTCSeconds(),
            date.getUTCMilliseconds()
        )
    ).toISOString();
}

export default createRequestHandler<PCMAudio>(async (req, res) => {
    let data = getRequestData(req.body, object({ text: string }));
    let audioData = await new Promise<Buffer>((resolve, reject) => {
        let connectionId = randomUUID().toUpperCase();
        let ws = new WebSocket(
            "wss://eastus.api.speech.microsoft.com/cognitiveservices/websocket/v1?TrafficType=AzureDemo&Authorization=bearer%20undefined&X-ConnectionId=" +
                connectionId,
            { headers: { Origin: "https://azure.microsoft.com" } }
        );
        ws.on("open", () => {
            ws.send(
                "Path: speech.config\r\nX-RequestId: " +
                    connectionId +
                    "\r\nX-Timestamp: " +
                    getXTime() +
                    '\r\nContent-Type: application/json\r\n\r\n{"context":{"system":{"name":"SpeechSDK","version":"1.12.1-rc.1","build":"JavaScript","lang":"JavaScript","os":{"platform":"Browser/Linux x86_64","name":"Mozilla/5.0 (X11; Linux x86_64; rv:78.0) Gecko/20100101 Firefox/78.0","version":"5.0 (X11)"}}}}',
                () => {
                    ws.send(
                        "Path: synthesis.context\r\nX-RequestId: " +
                            connectionId +
                            "\r\nX-Timestamp: " +
                            getXTime() +
                            '\r\nContent-Type: application/json\r\n\r\n{"synthesis":{"audio":{"metadataOptions":{"sentenceBoundaryEnabled":false,"wordBoundaryEnabled":false},"outputFormat":"raw-16khz-16bit-mono-pcm"}}}',
                        () => {
                            ws.send(
                                "Path: ssml\r\nX-RequestId: " +
                                    connectionId +
                                    "\r\nX-Timestamp: " +
                                    getXTime() +
                                    '\r\nContent-Type: application/ssml+xml\r\n\r\n<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US"><voice name="zh-CN-XiaoxiaoNeural"><prosody rate="0%" pitch="0%">' +
                                    data.text
                                        .replaceAll("&", "&amp;")
                                        .replaceAll("<", "&lt;")
                                        .replaceAll(">", "&gt;")
                                        .replaceAll("/", "&quot;")
                                        .replaceAll("'", "&apos;") +
                                    "</prosody></voice></speak>",
                                () => {}
                            );
                        }
                    );
                }
            );
        });

        let audioData: Buffer | null = null;
        ws.addListener("message", (rawData: Buffer, _isBinary) => {
            if (rawData.indexOf("Path:turn.end") == -1) {
                const startHeader = "Path:audio\r\n";
                let startIndex = rawData.indexOf(startHeader);
                if (startIndex != -1) {
                    audioData = Buffer.concat(
                        [
                            audioData,
                            rawData.subarray(startIndex + startHeader.length),
                        ].filter(Boolean) as Buffer[]
                    );
                }
            } else {
                if (!audioData)
                    throw new HandlerError(
                        ResponseStatusCode.UNKNOWN_ERROR,
                        "Cannot generate audio"
                    );
                resolve(audioData);
                ws.close(1000);
            }
        });
        ws.on("close", (code, reason) => {
            if (code != 1000 || !audioData)
                reject(
                    new HandlerError(
                        ResponseStatusCode.UNKNOWN_ERROR,
                        "Cannot generate audio: " + reason.toString()
                    )
                );
        });
        ws.on("unexpected-response", () => {
            reject(
                new HandlerError(
                    ResponseStatusCode.UNKNOWN_ERROR,
                    "Cannot generate audio: received unexpected response"
                )
            );
        });
    });
    res.status(200).send({
        status: ResponseStatusCode.OK,
        data: {
            sampleRate: 16000,
            bitsPerSample: 16,
            channels: 1,
            pcm: audioData.toString("base64"),
        },
    });
});
