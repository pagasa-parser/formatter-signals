declare module "scale-that-svg" {

    export function scale(
        input: string | Buffer,
        options: { scale: number, scaleY?: number, round?: number }
    ): Promise<string>;

}
