# DocNote Clone

A React Native (Expo) application that replicates the basic features of the DocNote app for medical professionals.

## Features

- Record audio with pause/resume functionality
- Process audio recordings for medical transcription
- Generate medical reports from audio transcripts
- Audio file chunking to handle large recordings

## Prerequisites

- Node.js (>= 14.x)
- npm or yarn
- Expo Go app on your iOS/Android device or a simulator/emulator

## Installation

1. Clone this repository
2. Install dependencies

```bash
npm install
# or
yarn install
```

3. Start the development server

```bash
npm start
# or
yarn start
```

4. Scan the QR code with the Expo Go app on your device or press 'i' to open in iOS simulator / 'a' for Android emulator

## Project Structure

```
client/
├── App.tsx          # Main app component with navigation
├── assets/          # Images and other static assets
├── components/      # Reusable UI components
├── screens/         # App screens
│   ├── HomeScreen.tsx
│   ├── RecordingScreen.tsx
│   └── ReportScreen.tsx
└── utils/           # Utility functions
    ├── audioProcessor.ts
    └── timeUtils.ts
```

## Note on Backend Integration

This is a frontend demo that simulates backend functionality. In a real application:

1. Audio would be uploaded to a backend server
2. The server would transcribe the audio using a service like Google Speech-to-Text
3. The transcript would be processed by an AI model to generate a medical report
4. The report would be returned to the app for display

## License

MIT 