import { CSSProperties, useEffect, useRef } from "react";

// Todo: Use a better way to improve the performance.

interface ExpandedTextareaCSSProperties extends CSSProperties {
    lineHeight: string;
    resize: "none";
}

interface ExpandedTextareaProps
    extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    style: ExpandedTextareaCSSProperties;
}

export default function ExpandedTextarea(props: ExpandedTextareaProps) {
    const ref = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (ref.current) change(ref.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ref.current]);

    function unwrapUnit(str: string) {
        return parseInt(str.replace("px", ""));
    }

    function change(el: HTMLTextAreaElement) {
        let style = getComputedStyle(el);
        let height = unwrapUnit(style.height);
        let lineHeight = unwrapUnit(style.lineHeight);

        if (isNaN(lineHeight))
            throw new Error("Line height must be explicitly set in `styles.lineHeight`");

        while (true) {
            if (el.scrollHeight > unwrapUnit(style.maxHeight)) break;
            let newHeight: number;
            el.scrollTop = el.scrollHeight;
            let scrollTop = el.scrollTop || 0;

            if (scrollTop > 0) newHeight = height + lineHeight;
            else {
                el.style.height = height - lineHeight + "px";
                el.scrollTop = el.scrollHeight;
                let scrollTop = el.scrollTop || 0;
                if (scrollTop > 0) {
                    newHeight = height;
                } else {
                    newHeight = height - lineHeight;
                }
            }

            el.style.height = newHeight + "px";
            if (height == newHeight) break;
            height = newHeight;
        }
    }

    return (
        <textarea
            ref={ref}
            {...props}
            onInput={(e) => {
                change(e.target as HTMLTextAreaElement);
                if (props.onInput) props.onInput(e);
            }}
        ></textarea>
    );
}
