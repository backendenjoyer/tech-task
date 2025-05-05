# DocNote

DocNote is a mobile application for recording, transcribing, and organizing audio notes

## Features

- Record audio with pause/resume functionality
- Process audio recordings for medical transcription
- Generate medical reports from audio transcripts
- Audio file chunking to handle large recordings

## Project Structure

- `client/`: React Native Expo mobile application
  - `App.tsx`: Main app component with navigation
  - `assets/`: Images and other static assets
  - `screens/`: App screens
  - `utils/`: Utility functions
  - `context/`: React context providers
- `functions/`: Firebase Cloud Functions backend

## Prerequisites

- Node.js (v18 recommended)
- npm or pnpm
- Firebase CLI (`npm install -g firebase-tools`)
- Expo CLI (`npm install -g expo-cli`)
- OpenAI API key (for transcription functionality)
- Expo Go app on your iOS/Android device or a simulator/emulator

## Setting Up Firebase Functions

1. Navigate to the functions directory:
   ```
   cd functions
   ```

2. Install dependencies:
   ```
   npm install
   ```
   or if using pnpm:
   ```
   pnpm install
   ```

3. Create a `.env` file in the `functions` directory with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. Build the functions:
   ```
   npm run build
   ```
   or
   ```
   pnpm run build
   ```

5. Start Firebase emulators:
   ```
   firebase emulators:start
   ```
   This will start the Firebase emulators on the following ports:
   - Functions: 9000
   - Firestore: 9080
   - Storage: 9199
   - Emulator UI: 4040

## Setting Up the Client

1. Navigate to the client directory:
   ```
   cd client
   ```

2. Install dependencies:
   ```
   npm install
   ```
   or
   ```
   yarn install
   ```

3. Start the Expo development server:
   ```
   npm start
   ```
   or
   ```
   yarn start
   ```

4. Follow the instructions in the terminal to open the app on:
   - iOS simulator (press 'i')
   - Android emulator (press 'a')
   - Web browser (press 'w')
   - Scan the QR code with the Expo Go app on your physical device

## How It Works

1. Audio is recorded on the device through the Expo AV library
2. Audio recordings are uploaded to Firebase Storage
3. Firebase Functions process the audio using OpenAI for transcription
4. Transcriptions are stored in Firestore and returned to the client
5. The app displays the transcriptions and allows further organization

## Deployment

### Deploy Firebase Functions

```
cd functions
npm run deploy
```

### Build Client for Production

Follow the Expo build instructions for the desired platform:

```
expo build:android
```
or
```
expo build:ios
```

## Troubleshooting

- If you encounter issues with Firebase emulators, check the debug logs in the `functions` directory.
- For client issues, check the Expo logs in the terminal where you started the development server.

## License

MIT