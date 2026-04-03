/**
 * Web Speech API（Chrome は webkit 接頭辞のことがある）
 * @see https://wicg.github.io/speech-api/
 */
export {};

declare global {
  interface Window {
    SpeechRecognition?: { new (): SpeechRecognition };
    webkitSpeechRecognition?: { new (): SpeechRecognition };
  }
}
