export default function(selector: string): string {
    return selector.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
