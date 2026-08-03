// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  const __APP_VERSION__: string;

  interface Window {
    plausible?: (eventName: string, options?: { props?: Record<string, string> }) => void;
  }

  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
