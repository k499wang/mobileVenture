declare const jest: unknown;

declare module '*.css' {
  const classes: Record<string, string>;
  export default classes;
}
