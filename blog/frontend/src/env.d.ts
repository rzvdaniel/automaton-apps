/// <reference types="vite/client" />

declare global {
  interface Window {
    automatonApi?: {
      callController: (controller: string, action: string, inputs: Record<string, unknown>) => Promise<unknown>
    }
  }
}

export {}
