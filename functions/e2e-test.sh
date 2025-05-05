#!/bin/bash

# Exit on error
set -e

# Configuration
API_KEY="xx"
PROJECT_ID="qualtirdemofromleo"
API_BASE="http://localhost:5001/$PROJECT_ID/us-central1"
TEST_FILE="test.mp3" # Update with path to a test audio file (e.g., ./test.mp3)
CHUNK_SIZE=$((25 * 1024 * 1024)) # 25MB in bytes

# Check dependencies
command -v jq >/dev/null 2>&1 || { echo "jq is required but not installed. Aborting."; exit 1; }
command -v md5sum >/dev/null 2>&1 || command -v md5 >/dev/null 2>&1 || { echo "md5sum or md5 is required but not installed. Aborting."; exit 1; }
command -v split >/dev/null 2>&1 || { echo "split is required but not installed. Aborting."; exit 1; }
command -v wc >/dev/null 2>&1 || { echo "wc is required but not installed. Aborting."; exit 1; }

# Step 5: Create a test user (specify random creds)
echo "Creating test user..."
USER_RESPONSE=$(curl -s -X POST \
  http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=$API_KEY \
  -H "Content-Type: application/json" \
  -d '{"email":"dasd@gasil.com","password":"Wishdasdas"}')
ID_TOKEN=$(echo $USER_RESPONSE | jq -r '.idToken')
if [ -z "$ID_TOKEN" ] || [ "$ID_TOKEN" = "null" ]; then
  echo "Failed to create test user: $USER_RESPONSE"
  exit 1
fi
echo "Test user created. ID Token: $ID_TOKEN"

# Step 6: Test upload endpoint with a single file
echo "Testing single file upload..."
if [ ! -f "$TEST_FILE" ]; then
  echo "Test file $TEST_FILE not found. Please provide a test audio file."
  exit 1
fi
# Verify file integrity
file "$TEST_FILE"
UPLOAD_RESPONSE=$(curl -s -X POST \
  "$API_BASE/uploadAudio" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -F "audio=@$TEST_FILE;type=audio/mpeg")
RECORDING_ID=$(echo $UPLOAD_RESPONSE | jq -r '.recordingId')
if [ -z "$RECORDING_ID" ] || [ "$RECORDING_ID" = "null" ]; then
  echo "Single file upload failed: $UPLOAD_RESPONSE"
  exit 1
fi
echo "Single file uploaded. Recording ID: $RECORDING_ID"

# Step 7: Test chunked upload
echo "Testing chunked upload..."
# Create temporary directory for chunks
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Get file size using wc -c (cross-platform)
FILE_SIZE=$(wc -c < "$TEST_FILE" | tr -d ' ')
if [ -z "$FILE_SIZE" ] || [ "$FILE_SIZE" -le 0 ]; then
  echo "Failed to get file size for $TEST_FILE"
  exit 1
fi
TOTAL_CHUNKS=$(( (FILE_SIZE + CHUNK_SIZE - 1) / CHUNK_SIZE ))
if [ "$TOTAL_CHUNKS" -le 0 ]; then
  echo "Invalid total chunks: $TOTAL_CHUNKS"
  exit 1
fi

# Split test file into chunks
split -b $CHUNK_SIZE "$TEST_FILE" "$TEMP_DIR/chunk_"
CHUNK_FILES=("$TEMP_DIR"/chunk_*)
if [ ${#CHUNK_FILES[@]} -ne $TOTAL_CHUNKS ]; then
  echo "Chunking failed: Expected $TOTAL_CHUNKS chunks, got ${#CHUNK_FILES[@]}"
  exit 1
fi

# Generate unique session ID
SESSION_ID=$(date +%s | sha256sum | head -c 32)
echo "Session ID: $SESSION_ID, Total Chunks: $TOTAL_CHUNKS"

# Upload each chunk
for ((i=0; i<TOTAL_CHUNKS; i++)); do
  CHUNK_FILE="${CHUNK_FILES[$i]}"
  CHUNK_NUMBER=$((i + 1))
  echo "Uploading chunk $CHUNK_NUMBER of $TOTAL_CHUNKS..."
  CHUNK_RESPONSE=$(curl -s -X POST \
    "$API_BASE/api/uploadAudioChunk" \
    -H "Authorization: Bearer $ID_TOKEN" \
    -F "sessionId=$SESSION_ID" \
    -F "chunkNumber=$CHUNK_NUMBER" \
    -F "totalChunks=$TOTAL_CHUNKS" \
    -F "filename=test.mp3" \
    -F "mimeType=audio/mpeg" \
    -F "audio=@$CHUNK_FILE;type=audio/mpeg")
  SUCCESS=$(echo $CHUNK_RESPONSE | jq -r '.success')
  if [ "$SUCCESS" != "true" ]; then
    echo "Chunk $CHUNK_NUMBER upload failed: $CHUNK_RESPONSE"
    exit 1
  fi
  echo "Chunk $CHUNK_NUMBER uploaded successfully"
done

# Step 8: Test finalize chunked upload
echo "Testing finalize chunked upload..."
FINALIZE_RESPONSE=$(curl -s -X POST \
  "$API_BASE/api/finalizeChunkedUpload" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"totalChunks\":$TOTAL_CHUNKS}")
SUCCESS=$(echo $FINALIZE_RESPONSE | jq -r '.success')
CHUNK_RECORDING_ID=$(echo $FINALIZE_RESPONSE | jq -r '.recordingId')
if [ "$SUCCESS" != "true" ] || [ -z "$CHUNK_RECORDING_ID" ] || [ "$CHUNK_RECORDING_ID" = "null" ]; then
  echo "Finalize chunked upload failed: $FINALIZE_RESPONSE"
  exit 1
fi
echo "Chunked upload finalized. Recording ID: $CHUNK_RECORDING_ID"

# Step 9: Verify chunked upload integrity
echo "Verifying chunked upload integrity..."
# Get recording details
GET_CHUNK_RESPONSE=$(curl -s -X GET \
  "$API_BASE/api/recordings/$CHUNK_RECORDING_ID" \
  -H "Authorization: Bearer $ID_TOKEN")
FILE_PATH=$(echo $GET_CHUNK_RESPONSE | jq -r '.recording.filePath')
FILE_HASH=$(echo $GET_CHUNK_RESPONSE | jq -r '.recording.fileHash')
if [ -z "$FILE_PATH" ] || [ "$FILE_PATH" = "null" ] || [ -z "$FILE_HASH" ] || [ "$FILE_HASH" = "null" ]; then
  echo "Failed to retrieve chunked recording details: $GET_CHUNK_RESPONSE"
  exit 1
fi

# Compute original file hash
if command -v md5sum >/dev/null 2>&1; then
  ORIGINAL_HASH=$(md5sum "$TEST_FILE" | cut -d' ' -f1)
else
  ORIGINAL_HASH=$(md5 -q "$TEST_FILE")
fi
if [ "$ORIGINAL_HASH" != "$FILE_HASH" ]; then
  echo "MD5 hash mismatch. Original: $ORIGINAL_HASH, Server: $FILE_HASH"
  exit 1
fi
echo "MD5 hash verified: $FILE_HASH"

# Step 10: Test API endpoints
echo "Testing API endpoints..."
LIST_RESPONSE=$(curl -s -X GET \
  "$API_BASE/api/recordings" \
  -H "Authorization: Bearer $ID_TOKEN")
if ! echo $LIST_RESPONSE | grep -q '"success":true'; then
  echo "List recordings failed: $LIST_RESPONSE"
  exit 1
fi
echo "List recordings succeeded"

GET_RESPONSE=$(curl -s -X GET \
  "$API_BASE/api/recordings/$CHUNK_RECORDING_ID" \
  -H "Authorization: Bearer $ID_TOKEN")
if ! echo $GET_RESPONSE | grep -q '"success":true'; then
  echo "Get recording failed: $GET_RESPONSE"
  exit 1
fi
echo "Get recording succeeded"

DELETE_RESPONSE=$(curl -s -X DELETE \
  "$API_BASE/api/recordings/$CHUNK_RECORDING_ID" \
  -H "Authorization: Bearer $ID_TOKEN")
if ! echo $DELETE_RESPONSE | grep -q '"success":true'; then
  echo "Delete recording failed: $DELETE_RESPONSE"
  exit 1
fi
echo "Delete recording succeeded"

# Step 11: Clean up single file upload
echo "Cleaning up single file upload..."
DELETE_SINGLE_RESPONSE=$(curl -s -X DELETE \
  "$API_BASE/api/recordings/$RECORDING_ID" \
  -H "Authorization: Bearer $ID_TOKEN")
if ! echo $DELETE_SINGLE_RESPONSE | grep -q '"success":true'; then
  echo "Delete single file recording failed: $DELETE_SINGLE_RESPONSE"
  exit 1
fi
echo "Single file recording deleted"

# Step 12: Verify Firestore data
echo "Verifying Firestore data..."
echo "Check Firestore data at http://localhost:4000/firestore"
echo "Look for 'recordings', 'chunks', 'transcriptions', and 'deduplications' collections"
echo "Ensure 'chunks' collection has no documents for sessionId: $SESSION_ID"

# Step 13: Clean up
rm -f chunk_response.json
echo "Emulation completed successfully"