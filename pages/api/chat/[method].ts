import { object, string } from "decoders";
import app, { ChatMessage } from "@/lib/chat/session";
import {
    createRequestHandler,
    getRequestData,
    HandlerError,
    Response,
    ResponseStatusCode,
} from "@/lib/handler";

export default createRequestHandler<string | ChatMessage | undefined>(
    async (req, res, slug) => {
        if (slug == "new") {
            getRequestData(req.body, object({}));
            let session = await app.createSession();
            res.status(200).send({
                status: ResponseStatusCode.OK,
                data: session,
            });
        } else if (slug == "delete") {
            let data = getRequestData(req.body, object({ session: string }));
            // await deleteSession(id);
            res.status(200).send({
                status: ResponseStatusCode.OK,
                data: undefined,
            });
        } else if (slug == "send") {
            let data = getRequestData(
                req.body,
                object({ session: string, text: string })
            );
            await app.sendMessage(data.session, data.text);
            res.status(200).send({ status: ResponseStatusCode.OK, data: undefined });
        } else if (slug == "get") {
            let data = getRequestData(req.body, object({ session: string }));
            let message = await app.getCurrentMessage(data.session);
            res.status(200).send({ status: ResponseStatusCode.OK, data: message });
        } else {
            throw new HandlerError(ResponseStatusCode.BAD_REQUEST);
        }
    },
    "method"
);
