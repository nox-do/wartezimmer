/// <reference types="@sveltejs/kit" />

declare global {
  namespace App {}

  type TranslatorAvailability = 'available' | 'downloadable' | 'unavailable';

  interface TranslatorCreateOptions {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }

  interface TranslatorInstance {
    translate(input: string): Promise<string>;
    translateStreaming?(input: string): ReadableStream<string>;
    destroy(): void;
  }

  interface TranslatorConstructor {
    availability(options: {
      sourceLanguage: string;
      targetLanguage: string;
    }): Promise<TranslatorAvailability>;
    create(options: TranslatorCreateOptions): Promise<TranslatorInstance>;
  }

  var Translator: TranslatorConstructor | undefined;

  interface GlobalThis {
    Translator?: TranslatorConstructor;
  }
}

export {};
