/**
 * Web-only styles are imported by Expo Router components, but Expo's generated
 * local environment declarations are intentionally not committed. Keep the
 * CSS import contract available to TypeScript in local and CI environments.
 */
declare module '*.css' {
  const classes: Record<string, string>;
  export default classes;
}
