/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, LiveServerMessage, Modality, Session} from '@google/genai';
import {LitElement, css, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {createRef, ref} from 'lit/directives/ref.js';
import * as pdfjsLib from 'pdfjs-dist';
import {createBlob, decode, decodeAudioData} from './utils';
import './visual-3d';

interface ConversationEntry {
  speaker: 'user' | 'model';
  text: string;
}

@customElement('gdm-live-audio')
export class GdmLiveAudio extends LitElement {
  @state() isRecording = false;
  @state() isPaused = false;
  @state() status = 'Click the record button to start.';
  @state() error = '';
  @state() selectedVoice = 'Zephyr';
  @state() selectedLanguage = 'en-US';
  @state() temperature = 0.7;
  @state() fileName = '';
  @state() fileContent = '';
  @state() conversation: ConversationEntry[] = [];
  @state() isModelThinking = false;
  @state() private browserVoices: SpeechSynthesisVoice[] = [];

  private client: GoogleGenAI;
  private session: Session;
  private sessionPromise: Promise<Session>;
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();
  private availableVoices = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'];
  private availableLanguages = [
    {name: 'English (US)', value: 'en-US'},
    {name: 'Mandarin (Taiwan)', value: 'zh-TW'},
    {name: 'Japanese (JP)', value: 'ja-JP'},
  ];
  private currentInputTranscription = '';
  private currentOutputTranscription = '';
  private conversationPanelRef = createRef<HTMLDivElement>();

  static styles = css`
    #status {
      position: absolute;
      bottom: 5vh;
      left: 0;
      right: 0;
      z-index: 10;
      text-align: center;
      color: white;
      font-family: sans-serif;
    }

    .controls {
      z-index: 10;
      position: absolute;
      bottom: 10vh;
      left: 0;
      right: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;
    }

    .buttons button {
      outline: none;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.1);
      width: 64px;
      height: 64px;
      cursor: pointer;
      font-size: 24px;
      padding: 0;
      margin: 0 5px;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover {
        background: rgba(255, 255, 255, 0.2);
      }
    }

    .buttons button[disabled] {
      display: none;
    }

    .selectors {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    .selector {
      display: flex;
      align-items: center;
      gap: 8px;
      color: white;
      background: rgba(255, 255, 255, 0.1);
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      font-family: sans-serif;
    }

    .selector select {
      background: transparent;
      color: white;
      border: none;
      outline: none;
      font-size: 1em;
      cursor: pointer;
    }

    .selector select option {
      background: #333;
      color: white;
    }

    .selector select:disabled,
    .selector input[type='range']:disabled,
    .file-label[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .selector input[type='range'] {
      cursor: pointer;
      width: 100px;
      margin-left: 8px;
    }

    .file-controls {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }

    input[type='file'] {
      display: none;
    }

    .file-label {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-family: sans-serif;
      font-size: 0.9em;
    }

    .file-label:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .file-info {
      display: flex;
      align-items: center;
      gap: 8px;
      color: white;
      font-family: sans-serif;
      font-size: 0.8em;
      background: rgba(0, 0, 0, 0.2);
      padding: 4px 8px;
      border-radius: 4px;
    }

    .clear-file {
      border: none;
      background: transparent;
      color: white;
      cursor: pointer;
      font-size: 1.2em;
      padding: 0;
      line-height: 1;
    }

    .clear-file:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    #conversation-panel {
      position: absolute;
      top: 20px;
      left: 20px;
      width: 350px;
      max-width: 40vw;
      height: calc(100vh - 40px);
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
      box-sizing: border-box;
      color: white;
      font-family: sans-serif;
      display: flex;
      flex-direction: column;
      z-index: 5;
    }

    #conversation-panel h2 {
      margin: 0 0 10px 0;
      font-size: 1.2em;
      text-align: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      padding-bottom: 10px;
      font-weight: 500;
    }

    .conversation-content {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding-right: 8px;
    }

    .conversation-content::-webkit-scrollbar {
      width: 8px;
    }

    .conversation-content::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }

    .conversation-content::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.3);
      border-radius: 4px;
    }

    .conversation-content::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.5);
    }

    .message {
      padding: 8px 12px;
      border-radius: 10px;
      max-width: 85%;
      word-wrap: break-word;
      font-size: 0.95em;
      line-height: 1.4;
    }

    .message p {
      margin: 0;
    }

    .message.user {
      background: #3b82f6;
      align-self: flex-end;
      border-bottom-right-radius: 2px;
    }

    .message.model {
      background: #4b5563;
      align-self: flex-start;
      border-bottom-left-radius: 2px;
    }

    .message.model.thinking {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 12px;
    }

    .dot {
      width: 8px;
      height: 8px;
      background-color: rgba(255, 255, 255, 0.7);
      border-radius: 50%;
      animation: pulse 1.4s infinite ease-in-out both;
    }

    .dot:nth-child(1) {
      animation-delay: -0.32s;
    }

    .dot:nth-child(2) {
      animation-delay: -0.16s;
    }

    @keyframes pulse {
      0%,
      80%,
      100% {
        transform: scale(0);
      }
      40% {
        transform: scale(1);
      }
    }

    .sample-button {
      background: none;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      cursor: pointer;
      margin-left: 8px;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    .sample-button:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .sample-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `;

  constructor() {
    super();
    // Use the esm.sh URL for the PDF worker.
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.5.136/build/pdf.worker.mjs`;
    this.initClient();
    if ('speechSynthesis' in window) {
      const loadVoices = () => {
        this.browserVoices = window.speechSynthesis.getVoices();
      };
      // Voices are loaded asynchronously. We need to handle the `voiceschanged` event.
      window.speechSynthesis.onvoiceschanged = loadVoices;
      loadVoices(); // For browsers that might load voices synchronously.
    }
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.API_KEY,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private initSession() {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    let systemInstruction = '';
    if (this.fileContent) {
      this.updateStatus('Connecting with file context...');
      systemInstruction = `You are an expert on the provided document in a real-time voice conversation. It is a simple turn-based exchange: the user asks a question about the document, and then you answer. Your turn begins IMMEDIATELY after the user stops talking. Silence from the user is your cue to start. You MUST respond based ONLY on the document. If the answer isn't in the document, say so. Keep the conversation flowing.

---DOCUMENT---
${this.fileContent}
---END DOCUMENT---`;
    } else {
      this.updateStatus('Connecting...');
      systemInstruction = `You are an AI assistant in a real-time voice conversation. It is a simple turn-based exchange: the user speaks, and then you speak. Your turn begins IMMEDIATELY after the user stops talking. Silence from the user is your cue to start. You MUST respond. Keep the conversation flowing.`;
    }

    if (this.selectedLanguage === 'zh-TW') {
      systemInstruction +=
        '\n\nPlease respond in Traditional Chinese (zh-TW) with a standard Taiwanese Mandarin accent.';
    } else if (this.selectedLanguage === 'ja-JP') {
      systemInstruction += '\n\nPlease respond in Japanese (ja-JP).';
    }

    this.sessionPromise = this.client.live.connect({
      model: model,
      callbacks: {
        onopen: () => {
          if (this.isRecording) {
            this.updateStatus('🔴 Listening...');
          } else {
            this.updateStatus(
              'Ready to talk. Click the record button to start.',
            );
          }
        },
        onmessage: async (message: LiveServerMessage) => {
          if (message.serverContent?.inputTranscription?.text?.trim()) {
            this.isModelThinking = true;
            this.updateStatus('Thinking...');
          }

          const audio =
            message.serverContent?.modelTurn?.parts[0]?.inlineData;

          if (audio) {
            if (this.isModelThinking) {
              this.updateStatus('Responding...');
            }
            this.nextStartTime = Math.max(
              this.nextStartTime,
              this.outputAudioContext.currentTime,
            );

            const audioBuffer = await decodeAudioData(
              decode(audio.data),
              this.outputAudioContext,
              24000,
              1,
            );
            const source = this.outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.outputNode);
            source.addEventListener('ended', () => {
              this.sources.delete(source);
            });

            source.start(this.nextStartTime);
            this.nextStartTime = this.nextStartTime + audioBuffer.duration;
            this.sources.add(source);
          }

          if (message.serverContent?.outputTranscription) {
            this.currentOutputTranscription +=
              message.serverContent.outputTranscription.text;
          }
          if (message.serverContent?.inputTranscription) {
            this.currentInputTranscription +=
              message.serverContent.inputTranscription.text;
          }

          if (message.serverContent?.turnComplete) {
            this.isModelThinking = false;
            const newEntries: ConversationEntry[] = [];
            if (this.currentInputTranscription.trim()) {
              newEntries.push({
                speaker: 'user',
                text: this.currentInputTranscription.trim(),
              });
            }
            if (this.currentOutputTranscription.trim()) {
              newEntries.push({
                speaker: 'model',
                text: this.currentOutputTranscription.trim(),
              });
            }
            if (newEntries.length > 0) {
              this.conversation = [...this.conversation, ...newEntries];
            }
            this.currentInputTranscription = '';
            this.currentOutputTranscription = '';

            if (this.isRecording) {
              this.updateStatus('🔴 Listening...');
            } else {
              this.updateStatus(
                'Ready to talk. Click the record button to start.',
              );
            }
          }

          const interrupted = message.serverContent?.interrupted;
          if (interrupted) {
            for (const source of this.sources.values()) {
              source.stop();
              this.sources.delete(source);
            }
            this.nextStartTime = 0;
          }
        },
        onerror: (e: ErrorEvent) => {
          this.updateError(e.message);
        },
        onclose: (e: CloseEvent) => {
          this.updateStatus('Connection closed.');
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {prebuiltVoiceConfig: {voiceName: this.selectedVoice}},
        },
        temperature: this.temperature,
        systemInstruction: systemInstruction,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    });

    this.sessionPromise
      .then((session) => {
        this.session = session;
      })
      .catch((e) => {
        console.error(e);
        this.updateError(e.message);
      });
  }

  private updateStatus(msg: string) {
    this.status = msg;
    this.error = '';
  }

  private updateError(msg: string) {
    this.error = msg;
    this.status = '';
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.isModelThinking = false;

    this.inputAudioContext.resume();

    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 4096;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        this.sessionPromise.then((session) => {
          session.sendRealtimeInput({media: createBlob(pcmData)});
        });
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.updateStatus('🔴 Listening...');
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateError(`Error: ${err.message}`);
      this.stopRecording();
    }
  }

  private stopRecording(isPausing = false) {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.isModelThinking = false;
    if (!isPausing) {
      this.updateStatus('Stopping recording...');
    }

    this.isRecording = false;

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (!isPausing) {
      this.updateStatus('Recording stopped. Click Start to begin again.');
    }
  }

  private togglePause() {
    this.isPaused = !this.isPaused;

    if (this.isPaused) {
      if (this.isRecording) {
        this.stopRecording(true); // isPausing = true
      }
      this.outputAudioContext.suspend();
      this.updateStatus('Paused. Click the resume button to continue.');
    } else {
      this.outputAudioContext.resume();
      this.updateStatus('Ready to talk. Click the record button to start.');
    }
  }

  private reset() {
    this.session?.close();
    this.initSession();
  }

  private handleVoiceChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.selectedVoice = select.value;
    this.reset();
  }

  private handleLanguageChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    this.selectedLanguage = select.value;
    this.reset();
  }

  private handleTemperatureChange(e: Event) {
    const slider = e.target as HTMLInputElement;
    this.temperature = parseFloat(slider.value);
    this.reset();
  }

  private async handleFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    this.fileName = file.name;
    this.updateStatus(`Processing ${file.name}...`);

    try {
      let text = '';
      if (file.type === 'application/pdf') {
        text = await this.extractTextFromPdf(file);
      } else if (
        file.type === 'text/plain' ||
        file.type === 'text/markdown'
      ) {
        text = await file.text();
      } else {
        this.updateError(`Unsupported file type: ${file.type}`);
        this.fileName = '';
        return;
      }

      this.fileContent = text;
      this.updateStatus(`Loaded context from ${file.name}.`);
      this.reset();
    } catch (err) {
      this.updateError(`Error processing file: ${err.message}`);
      this.fileName = '';
      this.fileContent = '';
    } finally {
      input.value = '';
    }
  }

  private async extractTextFromPdf(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((item: any) => item.str).join(' ');
      fullText += '\n';
    }

    return fullText;
  }

  private clearFile() {
    this.fileName = '';
    this.fileContent = '';
    this.reset();
  }

  private playSelectedVoiceSample() {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel(); // Stop any previous utterance

      const voicesForLanguage = this.browserVoices.filter(
        (voice) => voice.lang === this.selectedLanguage,
      );

      const greeting =
        this.selectedLanguage === 'zh-TW'
          ? `你好，這是 ${this.selectedVoice}。`
          : this.selectedLanguage === 'ja-JP'
          ? `こんにちは、こちらは${this.selectedVoice}です。`
          : `Hello, this is ${this.selectedVoice}.`;

      const utterance = new SpeechSynthesisUtterance(greeting);
      utterance.lang = this.selectedLanguage;

      const selectedVoiceIndex = this.availableVoices.indexOf(
        this.selectedVoice,
      );

      const voiceVariations =
        this.selectedLanguage === 'zh-TW'
          ? [
              {pitch: 1, rate: 1}, // Zephyr: Normal
              {pitch: 1.4, rate: 1.2}, // Puck: Higher and faster
              {pitch: 0.6, rate: 0.8}, // Charon: Lower and slower
              {pitch: 1.2, rate: 1.05}, // Kore: Slightly higher pitch, normal speed
              {pitch: 0.5, rate: 0.9}, // Fenrir: Very deep and slightly slower
            ]
          : this.selectedLanguage === 'ja-JP'
          ? [
              {pitch: 1, rate: 1}, // Zephyr
              {pitch: 1.2, rate: 1.1}, // Puck
              {pitch: 0.8, rate: 0.9}, // Charon
              {pitch: 1.1, rate: 1}, // Kore
              {pitch: 0.7, rate: 1}, // Fenrir
            ]
          : [
              {pitch: 1, rate: 1}, // Zephyr: Baseline, clear
              {pitch: 1.1, rate: 1.05}, // Puck: Higher pitch, slightly faster
              {pitch: 0.9, rate: 0.95}, // Charon: Lower pitch, slightly slower
              {pitch: 1, rate: 1.15}, // Kore: Normal pitch but noticeably faster
              {pitch: 0.8, rate: 1}, // Fenrir: Deep pitch, normal speed
            ];

      const variation =
        voiceVariations[selectedVoiceIndex % voiceVariations.length];
      utterance.pitch = variation.pitch;
      utterance.rate = variation.rate;

      if (voicesForLanguage.length > 0) {
        // Cycle through the available browser voices as well for more variety
        const browserVoiceIndex = selectedVoiceIndex % voicesForLanguage.length;
        utterance.voice = voicesForLanguage[browserVoiceIndex];
      } else if (this.browserVoices.length > 0) {
        console.warn(
          `No sample voices found for language: ${this.selectedLanguage}. Using default.`,
        );
      }

      speechSynthesis.speak(utterance);
    } else {
      this.updateError('Speech synthesis not supported by this browser.');
    }
  }

  updated(changedProperties: Map<string | symbol, unknown>) {
    if ( (changedProperties.has('conversation') || changedProperties.has('isModelThinking')) && this.conversationPanelRef.value) {
      const panel = this.conversationPanelRef.value;
      const content = panel.querySelector('.conversation-content');
      if (content) {
        content.scrollTop = content.scrollHeight;
      }
    }
  }

  render() {
    const pauseIcon = html`<svg
      xmlns="http://www.w3.org/2000/svg"
      height="32px"
      viewBox="0 -960 960 960"
      width="32px"
      fill="#ffffff">
      <path
        d="M520-200v-560h240v560H520Zm-320 0v-560h240v560H200Z" />
    </svg>`;
    const playIcon = html`<svg
      xmlns="http://www.w3.org/2000/svg"
      height="32px"
      viewBox="0 -960 960 960"
      width="32px"
      fill="#ffffff">
      <path d="M320-200v-560l440 280-440 280Z" />
    </svg>`;

    return html`
      <div>
        <div id="conversation-panel" ${ref(this.conversationPanelRef)}>
          <h2>Conversation</h2>
          <div class="conversation-content">
            ${this.conversation.map(
              (entry) => html`
                <div class="message ${entry.speaker}">
                  <p>${entry.text}</p>
                </div>
              `,
            )}
            ${this.isModelThinking
              ? html`
                  <div class="message model thinking">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                  </div>
                `
              : ''}
          </div>
        </div>

        <div class="controls">
          <div class="file-controls">
            <label
              for="file-upload"
              class="file-label"
              ?disabled=${this.isRecording || this.isPaused}
              >Upload Context File</label
            >
            <input
              id="file-upload"
              type="file"
              accept=".txt,.md,.pdf"
              @change=${this.handleFileChange}
              ?disabled=${this.isRecording || this.isPaused} />
            ${this.fileName
              ? html`
                  <div class="file-info">
                    <span>${this.fileName}</span>
                    <button
                      class="clear-file"
                      @click=${this.clearFile}
                      ?disabled=${this.isRecording || this.isPaused}
                      aria-label="Clear file">
                      &times;
                    </button>
                  </div>
                `
              : ''}
          </div>

          <div class="selectors">
            <div class="selector">
              <label for="voice-select">Voice:</label>
              <select
                id="voice-select"
                @change=${this.handleVoiceChange}
                ?disabled=${this.isRecording || this.isPaused}>
                ${this.availableVoices.map(
                  (voice) => html`
                    <option
                      value=${voice}
                      ?selected=${voice === this.selectedVoice}>
                      ${voice}
                    </option>
                  `,
                )}
              </select>
              <button
                class="sample-button"
                @click=${this.playSelectedVoiceSample}
                ?disabled=${this.isRecording || this.isPaused}
                aria-label="Play voice sample">
                ▶
              </button>
            </div>
            <div class="selector">
              <label for="language-select">Language:</label>
              <select
                id="language-select"
                @change=${this.handleLanguageChange}
                ?disabled=${this.isRecording || this.isPaused}>
                ${this.availableLanguages.map(
                  (lang) => html`
                    <option
                      value=${lang.value}
                      ?selected=${lang.value === this.selectedLanguage}>
                      ${lang.name}
                    </option>
                  `,
                )}
              </select>
            </div>
            <div class="selector">
              <label for="temperature-slider"
                >Temp: ${this.temperature.toFixed(1)}</label
              >
              <input
                id="temperature-slider"
                type="range"
                min="0"
                max="1"
                step="0.1"
                .value=${this.temperature}
                @input=${this.handleTemperatureChange}
                ?disabled=${this.isRecording || this.isPaused} />
            </div>
          </div>
          <div class="buttons">
            <button
              id="resetButton"
              @click=${this.reset}
              ?disabled=${this.isRecording || this.isPaused}
              aria-label="Reset Session">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="40px"
                viewBox="0 -960 960 960"
                width="40px"
                fill="#ffffff">
                <path
                  d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
              </svg>
            </button>
            <button
              id="pauseButton"
              @click=${this.togglePause}
              ?disabled=${!this.session}
              aria-label=${this.isPaused ? 'Resume' : 'Pause'}>
              ${this.isPaused ? playIcon : pauseIcon}
            </button>
            <button
              id="startButton"
              @click=${this.startRecording}
              ?disabled=${this.isRecording || this.isPaused}
              aria-label="Start Recording">
              <svg
                viewBox="0 0 100 100"
                width="32px"
                height="32px"
                fill="#c80000"
                xmlns="http://www.w3.org/2000/svg">
                <circle cx="50" cy="50" r="50" />
              </svg>
            </button>
            <button
              id="sendButton"
              @click=${() => this.stopRecording()}
              ?disabled=${!this.isRecording}
              aria-label="Send and end turn">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                height="32px"
                viewBox="0 -960 960 960"
                width="32px"
                fill="#ffffff">
                <path d="M120-160v-240l320-80-320-80v-240l760 320-760 320Z" />
              </svg>
            </button>
          </div>
        </div>

        <div id="status"> ${this.error || this.status} </div>
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
      </div>
    `;
  }
}