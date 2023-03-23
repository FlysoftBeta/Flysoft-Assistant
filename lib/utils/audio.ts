import { Base64 } from "js-base64";

export type PCMAudio = {
    sampleRate: number;
    bitsPerSample: number;
    channels: number;
    pcm: string;
};

// Thanks https://zhuanlan.zhihu.com/p/401715180
export function pcmToWav(audio: PCMAudio) {
    let header = {
        // OFFS SIZE NOTES
        // 0    4    "RIFF" = 0x52494646
        chunkId: [0x52, 0x49, 0x46, 0x46],
        // 4    4    36+SubChunk2Size = 4+(8+SubChunk1Size)+(8+SubChunk2Size)
        chunkSize: 0,
        // 8    4    "WAVE" = 0x57415645
        format: [0x57, 0x41, 0x56, 0x45],
        // 12   4    "fmt " = 0x666d7420
        subChunk1Id: [0x66, 0x6d, 0x74, 0x20],
        // 16   4    16 for PCM
        subChunk1Size: 16,
        // 20   2    PCM = 1
        audioFormat: 1,
        // 22   2    Mono = 1, Stereo = 2...
        numChannels: audio.channels,
        // 24   4    8000, 44100...
        sampleRate: audio.sampleRate,
        // 28   4    SampleRate*NumChannels*BitsPerSample/8
        byteRate: 0,
        // 32   2    NumChannels*BitsPerSample/8
        blockAlign: 0,
        // 34   2    8 bits = 8, 16 bits = 16
        bitsPerSample: audio.bitsPerSample,
        // 36   4    "data" = 0x64617461
        subChunk2Id: [0x64, 0x61, 0x74, 0x61],
        // 40   4    data size = NumSamples*NumChannels*BitsPerSample/8
        subChunk2Size: 0,
    };
    function u32ToArray(i: number) {
        return [i & 0xff, (i >> 8) & 0xff, (i >> 16) & 0xff, (i >> 24) & 0xff];
    }
    function u16ToArray(i: number) {
        return [i & 0xff, (i >> 8) & 0xff];
    }

    let pcm = Base64.toUint8Array(audio.pcm);
    header.blockAlign = (header.numChannels * header.bitsPerSample) >> 3;
    header.byteRate = header.blockAlign * header.sampleRate;
    header.subChunk2Size = pcm.length * (header.bitsPerSample >> 3);
    header.chunkSize = 36 + header.subChunk2Size;

    let wavHeader = header.chunkId.concat(
        u32ToArray(header.chunkSize),
        header.format,
        header.subChunk1Id,
        u32ToArray(header.subChunk1Size),
        u16ToArray(header.audioFormat),
        u16ToArray(header.numChannels),
        u32ToArray(header.sampleRate),
        u32ToArray(header.byteRate),
        u16ToArray(header.blockAlign),
        u16ToArray(header.bitsPerSample),
        header.subChunk2Id,
        u32ToArray(header.subChunk2Size)
    );
    let wavHeaderUnit8 = new Uint8Array(wavHeader);
    let mergedArray = new Uint8Array(wavHeaderUnit8.length + pcm.length);
    mergedArray.set(wavHeaderUnit8);
    mergedArray.set(pcm, wavHeaderUnit8.length);

    return mergedArray;
}
