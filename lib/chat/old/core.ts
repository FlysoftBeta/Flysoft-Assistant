// @ts-nocheck

import puppeteer, { Browser, Frame, Page } from "puppeteer";
import { generateBingPrompt, SYDNEY_COMMAND_PARTS } from "./prompt";

const SKYPE_URL = "https://web.skype.com/";

export class ChatSession {
    private page: Page | null = null;
    private mainFrame: Frame | null = null;
    private id: string | null = null;
    private firstChat: boolean = true;
    private onMessageArrivedCallback: ((content: string) => void) | null = null;
    public initialize: Promise<void>;
    constructor(id: string, app: ChatApp) {
        this.initialize = new Promise<void>(async (resolve) => {
            await app.initialize;
            this.id = id;
            this.page = await app.browser!.newPage();
            this.mainFrame = this.page.mainFrame();
            await this.mainFrame.goto(SKYPE_URL);
            resolve();
        });
    }
    async createChat() {
        await this.initialize;
        if (!this.mainFrame || !this.page || !this.id) return;

        // Disable `Press Enter to send message`
        const MORE_BTN =
            "div.app-container > div > div > div > div > div > div > div > div > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > button";
        await this.mainFrame.waitForSelector(MORE_BTN);
        await this.mainFrame.click(MORE_BTN);
        const SETTINGS_BTN = '[role="menu"] > button:nth-child(1)';
        await this.mainFrame.waitForSelector(SETTINGS_BTN);
        await this.mainFrame.click(SETTINGS_BTN);
        const SET_MESSAGES_BTN =
            'div.app-container > div > div > div > div > div > div > div > div:nth-child(2) > div:nth-child(3) > div > div:nth-child(2) > div > div:nth-child(1) > div > div > div.scrollViewport.scrollViewportV > div > div > div:nth-child(6) > div[role="button"]';
        await this.mainFrame.waitForSelector(SET_MESSAGES_BTN);
        await this.mainFrame.click(SET_MESSAGES_BTN);
        const SET_ENTER_SEND_MESSAGE_BTN =
            "div.app-container > div > div > div > div > div > div > div > div:nth-child(2) > div:nth-child(3) > div > div:nth-child(2) > div > div:nth-child(2) > div > div > div > div.scrollViewport.scrollViewportV > div > div:nth-child(6) > button";
        const SET_ENTER_SEND_MESSAGE_CHECKED_BTN =
            'div.app-container > div > div > div > div > div > div > div > div:nth-child(2) > div:nth-child(3) > div > div:nth-child(2) > div > div:nth-child(2) > div > div > div > div.scrollViewport.scrollViewportV > div > div:nth-child(6) > button[aria-checked="true"]';
        await this.mainFrame.waitForSelector(SET_ENTER_SEND_MESSAGE_BTN);
        try {
            await this.mainFrame.click(SET_ENTER_SEND_MESSAGE_CHECKED_BTN);
        } catch {}
        const SETTINGS_CLOSE_BTN =
            "div.app-container > div > div > div > div > div > div > div > div:nth-child(2) > div:nth-child(3) > div > div:nth-child(1) > div:nth-child(3) > div > button";
        await this.mainFrame.waitForSelector(SETTINGS_CLOSE_BTN);
        await this.mainFrame.click(SETTINGS_CLOSE_BTN);
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 1000));

        // Open the `Create new chat` menu
        const CREATE_BTN =
            'div.app-container > div > div > div:nth-child(1) > div > div > div > div > div > div:nth-child(1) > div:nth-child(3) > div:nth-child(1) > div:nth-child(3) > button:nth-child(2)[aria-haspopup="true"]';
        await this.mainFrame.waitForSelector(CREATE_BTN);
        await this.mainFrame.click(CREATE_BTN);
        const CREATE_GROUP_BTN = '[role="menu"] > button:nth-child(1)';
        await this.mainFrame.waitForSelector(CREATE_GROUP_BTN);
        await this.mainFrame.click(CREATE_GROUP_BTN);

        // Fill the name
        const NAME_INPUT = '[role="dialog"] input[type="text"]';
        await this.mainFrame.waitForSelector(NAME_INPUT);
        for (let i = 0; i < this.id.length; i++) {
            await this.mainFrame.focus(NAME_INPUT);
            await this.page.keyboard.sendCharacter(this.id[i]);
        }

        const NAME_SUBMIT_BTN =
            '[role="dialog"] > div > div > div:nth-child(2) > div:nth-child(2) > button';
        await this.mainFrame.click(NAME_SUBMIT_BTN);

        const CONTACT_ITEM_BTN = '[role="dialog"] [role="list"] [role="listitem"] button';
        // Invite Bing to the chat
        await this.mainFrame.waitForSelector(CONTACT_ITEM_BTN);
        await this.mainFrame.$$eval(CONTACT_ITEM_BTN, (inputs) => {
            let elements = inputs.filter((input) => input.innerText == "Bing");
            if (elements.length > 0) {
                elements[0].click();
            }
        });

        const CONTACT_SUBMIT_BTN =
            '[role="dialog"] > div > div > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > div:nth-child(3) > button';
        await this.mainFrame.click(CONTACT_SUBMIT_BTN);

        const DIALOG = '[role="dialog"]';
        // Wait for dialog disappearance
        while (true) {
            try {
                await this.mainFrame.waitForSelector(DIALOG, { timeout: 100 });
            } catch {
                break;
            }
        }

        const CHAT_ITEM =
            '[role="button"] [data-text-as-pseudo-element="' + this.id + '"]';
        await this.mainFrame.waitForSelector(CHAT_ITEM);
        this.mainFrame.$eval(CHAT_ITEM, (element) =>
            element.parentElement?.parentElement?.parentElement?.click()
        );

        const CHAT_VIEW = "div.scrollViewport.scrollViewportV > div > div:nth-child(2)";
        await this.mainFrame.waitForSelector(CHAT_VIEW);
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 1000));
        await this.page.exposeFunction("fsOnMessageArrived", (content: string) => {
            if (this.onMessageArrivedCallback) this.onMessageArrivedCallback(content);
        });
        await this.mainFrame.evaluate(() => {
            const CHAT_VIEW =
                "div.scrollViewport.scrollViewportV > div > div:nth-child(2)";
            let listElement = document.querySelector<HTMLElement>(CHAT_VIEW);
            if (!listElement) throw new Error("Message list not found");
            let observer = new MutationObserver((e) => {
                e.forEach((mut) => {
                    mut.addedNodes.forEach((node) => {
                        let itemElement = node as HTMLElement;

                        let shouldBeHandled: boolean;
                        try {
                            // If message is sent by user, it will be `flex-end`.
                            shouldBeHandled =
                                (
                                    itemElement.firstElementChild!
                                        .firstElementChild! as HTMLElement
                                ).style.justifyContent == "flex-start";
                        } catch {
                            shouldBeHandled = false;
                        }
                        if (!shouldBeHandled) return;

                        function tryEmit() {
                            try {
                                let content = (
                                    itemElement.firstElementChild!.firstElementChild!
                                        .firstElementChild!.firstElementChild!
                                        .nextElementSibling! as HTMLElement
                                ).innerText;
                                const endTag = "[MSG_END]";
                                // We add a special flag to the end of the response to make sure the message is complete
                                if (content.endsWith(endTag)) {
                                    content = content.substring(
                                        0,
                                        content.lastIndexOf(endTag)
                                    );
                                    itemObserver.disconnect();
                                    (window as any).fsOnMessageArrived(content);
                                }
                            } catch {}
                        }

                        let itemObserver = new MutationObserver(() => {
                            tryEmit();
                        });

                        tryEmit();

                        itemObserver.observe(itemElement, {
                            subtree: true,
                            characterData: true,
                        });
                    });
                });
            });
            observer.observe(listElement, { childList: true, characterData: true });
        });
    }
    async send(text: string) {
        await this.initialize;
        if (!this.mainFrame || !this.page) return "";

        if (this.firstChat) text = generateBingPrompt(text, SYDNEY_COMMAND_PARTS);

        const INPUT_BOX = ".public-DraftEditor-content";
        const AT_BING =
            "div.app-container > div > div > div:nth-child(1) > div > div > div > div > div > div:nth-child(2) > div > div > div > div:nth-child(2) > div > div > div > div > div > div:nth-child(1) > div:nth-child(2) > button";
        const SUBMIT_BTN =
            "div.app-container > div > div > div:nth-child(1) > div > div > div > div > div > div:nth-child(2) > div > div > div > div:nth-child(2) > div > div > div > div > div > div:nth-child(2) > div:nth-child(2) > div > div > div:nth-child(2) > div > button";
        await this.mainFrame.focus(INPUT_BOX);
        await this.mainFrame.type(INPUT_BOX, "@Bing");
        await this.mainFrame.waitForSelector(AT_BING);
        await this.mainFrame.click(AT_BING); // @Bing
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 500));
        await this.mainFrame.type(INPUT_BOX, text);

        await this.mainFrame.click(SUBMIT_BTN);

        let content = await new Promise<string>(async (resolve) => {
            if (!this.page) return;
            this.onMessageArrivedCallback = (content: string) => {
                this.firstChat = false;
                resolve(content);
                this.onMessageArrivedCallback = null;
            };
        });
        return content;
    }
    async deleteChat() {}
}

export class ChatApp {
    public browser: Browser | null = null;
    public initialize: Promise<void>;
    constructor() {
        this.initialize = new Promise(async (resolve) => {
            this.browser = await puppeteer.launch({ ignoreDefaultArgs: ["--headless"] });
            let page = await this.browser.newPage();
            let mainFrame = page.mainFrame();
            await mainFrame.goto(SKYPE_URL);

            if (mainFrame.url().startsWith("https://login.live.com/login.srf")) {
                // Fill the login form
                const USER_INPUT = "#i0116";
                const PWD_INPUT = "#i0118";
                const PWD_HIDE_INPUT = "#i0118:not(.moveOffScreen)";
                const SUBMIT_BTN = "#idSIButton9";
                const SUBMIT__BTN = "#acceptButton";

                await mainFrame.waitForSelector(USER_INPUT);
                await mainFrame.type(USER_INPUT, "1922656933@qq.com");
                await mainFrame.waitForSelector(SUBMIT_BTN);
                await mainFrame.click(SUBMIT_BTN);
                await mainFrame.waitForSelector(PWD_HIDE_INPUT);
                await mainFrame.type(PWD_INPUT, "13533157897M");
                await mainFrame.waitForSelector(SUBMIT_BTN);
                await mainFrame.click(SUBMIT_BTN);
                await mainFrame.waitForNavigation();
                if (
                    mainFrame.url().startsWith("https://login.live.com/ppsecure/post.srf")
                ) {
                    await new Promise<void>((resolve) =>
                        setTimeout(() => resolve(), 1000)
                    );
                    try {
                        await mainFrame.click(SUBMIT__BTN);
                    } catch {
                        await mainFrame.click(SUBMIT_BTN);
                    }
                }

                // Wait till the Skype app is loaded
                while (true) {
                    await mainFrame.waitForNavigation();
                    if (mainFrame.url().startsWith(SKYPE_URL)) {
                        break;
                    }
                }
            }

            await page.close();
            resolve();
        });
    }
}
