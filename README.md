# DocNote

DocNote is a mobile application for recording, transcribing, and organizing audio notes

## Features

- Record audio with pause/resume functionality
- Process audio recordings for medical transcription
- Generate medical reports from audio transcripts
- Audio file chunking to handle large recordings

### Backend E2E testing locally

There are two .sh scripts locates in functions/ directory
```
# First use firebase-cli to auth
firebase auth

# Adjust the values in e2e-test.sh and start-emulators.sh to match Firebase project config and start

chmod +x ./start-emulators.sh
./start-emulators.sh

# In another terminal window for simplicity, you can now run the e2e tests (cloud function recognition, auth, secutiry rules, CRUD, full-cycle)

chmod +x ./start-emulators.sh
./e2e-test.sh
```

### Architectural improvements overview

#### Initial Implementation and Evolution:

The backend system initially relied on a monolithic cloud function that tightly coupled all logical components—authentication, file uploads, transcription, recording management, and report generation—into a single unit. While this approach simplified early development, it quickly became a bottleneck for both performance and maintainability. The tight coupling led to increased execution times, as each request had to process all steps sequentially, and made the codebase difficult to upgrade or debug. To address these issues, the architecture was refactored into smaller, more modular cloud functions, adopting a Pub/Sub interaction model to decouple components and enhance performance in the cloud environment.

#### Modular Cloud Functions: 
By splitting the monolithic function into smaller, purpose-specific functions (e.g., uploadAudio, processAudio), each component can execute independently, reducing latency and improving scalability. For instance, the uploadAudio function now handles file uploads and triggers a separate processAudio function for transcription, as seen in the emulator logic (createProcessingTask).

#### Pub/Sub Interaction Model: 
Introducing a Pub/Sub model allows asynchronous communication between functions. After an audio file is uploaded, a Pub/Sub message is published to trigger transcription, enabling the upload function to return a response immediately (e.g., recordingId and filePath) without waiting for transcription to complete. This decoupling significantly improves response times and system throughput, especially in a cloud environment where functions are billed by execution time.

#### Maintainability and Upgradability: 
Smaller functions with well-defined responsibilities (e.g., upload, deduplication, storage) are easier to debug, test, and upgrade. For example, the manual multipart parsing solution in upload.ts can be isolated and optimized without affecting transcription logic.

#### User Authentication: 
Firebase Authentication provides a robust mechanism for managing user sessions, issuing Firebase ID tokens that are validated by middleware (admin.auth().verifyIdToken(token) in upload.ts). This ensures that only authenticated users can upload or access audio files, aligning with the project’s security requirements.

#### Security Rules: 
Firebase Storage and Firestore rules (e.g., storage.rules, firestore.rules) are configured to enforce user-specific access, such as restricting file access to audio/${user.uid}/. This granular control prevents unauthorized access and ensures data isolation between users.

#### Emulator Support: 
During development, the Firebase emulator generates test tokens (e.g., alg: "none"), allowing seamless testing of authentication workflows without live infrastructure, as seen in the test script.

#### Managed Storage: 
By offloading file storage to Firebase Storage, functions like uploadAudio avoid the overhead of managing file buffers in memory beyond the initial upload. The file is streamed directly to Storage (bucket.file(filePath).createWriteStream()), minimizing memory usage in the function runtime.

#### Scalability: 
Firebase Storage scales automatically, handling increased file volumes without requiring changes to the function logic. This is critical for a system that may need to store large numbers of audio files as the user base grows.

#### Performance Optimization with Streaming and Chunked Uploads:
The system employs streaming uploads to optimize performance for smaller files, while retaining a chunked upload mechanism for larger files.

#### Streaming for Small Files: 
For small files like test.mp3 (27606 bytes), streaming uploads (readStream.pipe(writeStream)) minimize memory usage by transferring data incrementally to Firebase Storage. This approach reduces latency and resource consumption, as seen in the upload.ts implementation.

#### Chunked Uploads for Larger Files: 
For larger files, the system retains a chunked upload mechanism (not fully implemented in the current code but planned as a fallback). This ensures that large uploads can be processed in manageable segments, preventing memory exhaustion in the function runtime and improving reliability.

#### Asynchronous Processing: 
Pub/Sub enables fully asynchronous workflows, such as queuing transcription tasks after uploads. This ensures that the uploadAudio function can complete quickly, improving user experience by returning a response (recordingId) without delay.

#### Retry Control: 
Cloud Tasks provides built-in retry mechanisms for failed tasks (e.g., transcription failures due to API rate limits). This improves system reliability by ensuring that tasks are retried automatically with configurable backoff policies.

#### Load Balancing: 
Queues distribute workloads across multiple function instances, preventing bottlenecks during high traffic. For example, if multiple users upload files simultaneously, transcription tasks can be queued and processed in parallel.


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