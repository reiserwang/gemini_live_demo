# Real-Time Voice Chat with 3D Visualization

This project is a real-time voice chat application that uses the Google Generative AI API for speech-to-text and text-to-speech. It features a 3D visualization that reacts to the input and output audio, creating an immersive and interactive experience.

## Features

- **Real-time voice conversation:** Speak with an AI assistant in real-time.
- **3D audio visualization:** A dynamic 3D sphere that reacts to your voice and the AI's responses.
- **Customizable voice:** Choose from a variety of voices and adjust the pitch.
- **Context-aware conversations:** Provide a document as context for the conversation.
- **System prompts:** Guide the AI's behavior with system-level instructions.
- **Adjustable temperature:** Control the randomness of the AI's responses.

## Implementation Details

The application is built with a modern web stack:

- **Frontend:** [Lit](https://lit.dev/) (a lightweight library for building web components) and [Three.js](https://threejs.org/) for 3D graphics.
- **AI:** [Google Generative AI API](https://ai.google.dev/) for speech-to-text, text-to-speech, and language model capabilities.
- **Build Tool:** [Vite](https://vitejs.dev/) for fast development and optimized builds.

### Gemini Live API

The core of this application's real-time conversational AI is powered by the **Gemini Live API** from the Google Generative AI SDK. This API enables fluid, bidirectional communication with a Gemini model, allowing for the simultaneous sending of input audio and receiving of output audio.

#### How it Works in this Project

1.  **Connection:** In `index.tsx`, the `initSession` function establishes a connection to the Gemini Live API using `this.client.live.connect`. This method returns a `Session` object that is used for the entire duration of the conversation.

2.  **Configuration and Native Audio Models:** The `connect` method is configured with several important parameters:
    *   `model`: The model is set to `gemini-2.5-flash-native-audio-preview-09-2025`, a **native audio model**. This means the model is specifically trained to handle audio data directly, resulting in lower latency and more natural-sounding speech-to-text and text-to-speech.
    *   `callbacks`: A set of functions to handle events from the server, such as `onopen`, `onmessage`, `onerror`, and `onclose`.
    *   `config`: An object that defines the behavior of the session, including:
        *   `responseModalities`: Specifies that the response should be in audio format.
        *   `speechConfig`: Configures the voice of the AI.
        *   `temperature`: Controls the creativity of the AI's responses.
        *   `systemInstruction`: Provides the initial prompt to the AI.

3.  **Real-time Audio Streaming:**
    *   **Sending Audio:** When the user starts recording, the application captures audio from the microphone. The `onaudioprocess` event handler in the `startRecording` function sends chunks of this audio data to the Gemini Live API in real-time using `session.sendRealtimeInput`.
    *   **Receiving Audio:** The `onmessage` callback listens for messages from the server. When a message contains audio data, the application decodes it and plays it through the browser's audio context. This allows the AI's response to be heard as it's being generated.

4.  **Voice Stream Processing and Pre-processing:**

    *   **Audio Capture:** The application uses the Web Audio API to capture audio from the user's microphone. A `ScriptProcessorNode` is used to process the audio in chunks.
    *   **Pre-processing for the AI:** Before being sent to the Gemini Live API, the raw audio data undergoes a crucial pre-processing step in the `createBlob` function (in `utils.ts`). The 32-bit floating-point audio data from the microphone is converted into 16-bit signed integers. This is the format that the Gemini Live API expects.
    *   **Sending to Backend:** The pre-processed audio data is then base64-encoded and wrapped in a `Blob` object with the appropriate MIME type (`audio/pcm;rate=16000`). This `Blob` is then sent to the Gemini Live API through the `session.sendRealtimeInput` method.

5.  **Improved Dialog Transcription and Conversation Management:** The `onmessage` callback is central to managing the conversation flow and providing a seamless user experience.
    *   **Real-time Transcription:** The `onmessage` callback receives real-time transcription of both the user's speech (`inputTranscription`) and the AI's response (`outputTranscription`). This allows the application to display the conversation as it happens.
    *   **Turn Management:** The `turnComplete` message is a critical part of the conversation flow. When this message is received, it signals that the AI has finished its turn. The application then finalizes the current turn, updates the conversation history, and prepares for the user's next input. This ensures a smooth, turn-based dialog between the user and the AI.

This real-time, streaming approach, combined with the power of native audio models, is what allows for the natural, low-latency conversation experience that this application provides.

### Fine-tuning Voice Pitch

The voice pitch can be fine-tuned by adjusting the `pitch` and `rate` properties of the `SpeechSynthesisUtterance` object in the `playSelectedVoiceSample` function in `index.tsx`. The `voiceVariations` array in this function defines the pitch and rate for each available voice.

For example, to make the 'Zephyr' voice higher-pitched and faster, you could change its entry in the `voiceVariations` array:

```typescript
const voiceVariations = [
  {pitch: 1.2, rate: 1.1}, // Zephyr: Higher pitch, faster rate
  // ... other voices
];
```

### Determining AI Response Timing

The AI's response timing is primarily controlled by the `systemInstruction` provided to the Google Generative AI API. The prompt engineering in `index.tsx` is designed to make the AI respond immediately after the user stops speaking.

The key phrase in the system prompt is: "**Your turn begins IMMEDIATELY after the user stops talking. Silence from the user is your cue to start.**"

This instruction, combined with the real-time streaming capabilities of the API, ensures a low-latency, natural-feeling conversation.

### Adding Context and System Prompts

The application allows you to add context to the conversation by uploading a text or PDF file. The content of the file is then included in the `systemInstruction` sent to the AI.

The `initSession` function in `index.tsx` constructs the system prompt. When a file is loaded, the prompt is updated to include the file's content, instructing the AI to act as an expert on the provided document.

You can further customize the AI's behavior by modifying the `systemInstruction` string in the `initSession` function. For example, you could add instructions about the AI's personality, the desired level of detail in its responses, or specific topics to focus on.

## Environment Setup

To run this project, you need to set up your Google Generative AI API key. This is done by creating a `.env` file in the root of the project.

1.  **Create a `.env` file:**

    ```bash
    touch .env
    ```

2.  **Add your API key to the `.env` file:**

    ```
    GEMINI_API_KEY=your-api-key
    ```

    Replace `your-api-key` with your actual Google Generative AI API key.

    The application uses Vite, which automatically loads environment variables from the `.env` file. The `vite.config.ts` file is configured to expose the `GEMINI_API_KEY` to the application code.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- A [Google Generative AI API key](https://makersuite.google.com/app/apikey)

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/your-repo-name.git
    cd your-repo-name
    ```

2.  **Install the dependencies:**

    ```bash
    npm install
    ```

3.  **Create a `.env` file** in the root of the project and add your Google Generative AI API key:

    ```
    GEMINI_API_KEY=your-api-key
    ```

### Running the Application

To start the development server, run:

```bash
npm run dev
```

This will start the application on `http://localhost:3000`.

### Building for Production

To build the application for production, run:

```bash
npm run build
```

This will create an optimized build in the `dist` directory. You can then preview the production build with:

```bash
npm run preview
```