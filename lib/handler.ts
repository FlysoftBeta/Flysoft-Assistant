import { Decoder } from "decoders";
import type { NextApiRequest, NextApiResponse } from "next";

export enum ResponseStatusCode {
    OK,
    UNKNOWN_ERROR,
    BAD_REQUEST,
    NOT_FOUND,
}

export type Response<T = any> = {
    status: ResponseStatusCode;
    errorMessage?: string;
    data: T;
};

export class HandlerError extends Error {
    public readonly name = "HandlerError";
    public readonly code: ResponseStatusCode;
    constructor(code: ResponseStatusCode, message?: string) {
        super(message);
        this.code = code;
    }
}

export function getRequestData<T>(request: any, dataDecoder: Decoder<T>) {
    try {
        let data = dataDecoder.verify(request);
        return data;
    } catch {
        throw new HandlerError(ResponseStatusCode.BAD_REQUEST);
    }
}

export function createRequestHandler<T = any>(
    handler: (
        req: NextApiRequest,
        res: NextApiResponse<Response<T>>,
        slug?: string
    ) => Promise<void>,
    slug?: string
) {
    return async (req: NextApiRequest, res: NextApiResponse<Response>) => {
        try {
            let requestSlug: string | undefined = undefined;
            if (slug) {
                let slugValue = req.query[slug];
                if (!slugValue || typeof slugValue != "string")
                    throw new HandlerError(ResponseStatusCode.BAD_REQUEST);
                requestSlug = slugValue;
            }
            await handler(req, res, requestSlug);
        } catch (e) {
            if ((e as HandlerError).name == "HandlerError") {
                res.status(500).json({
                    status: (e as HandlerError).code,
                    errorMessage: (e as HandlerError).message,
                    data: undefined,
                });
            } else {
                res.status(500).json({
                    status: ResponseStatusCode.UNKNOWN_ERROR,
                    errorMessage: (e as Error | null)?.message,
                    data: undefined,
                });
            }
        }
    };
}
