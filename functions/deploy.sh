#!/bin/bash

# deploy.sh: Script to deploy Firebase Cloud Functions and configurations to production
# Usage: ./deploy.sh
# Prerequisites: Firebase CLI, Google Cloud CLI, authenticated with Firebase and GCP

# Exit on error
set -e

# Step 1: Check for required tools
echo "Checking for required tools..."
command -v firebase >/dev/null 2>&1 || { echo "Firebase CLI not found. Install with: npm install -g firebase-tools"; exit 1; }
command -v gcloud >/dev/null 2>&1 || { echo "Google Cloud CLI not found. Install from: https://cloud.google.com/sdk"; exit 1; }

# Step 2: Authenticate Firebase and GCP
echo "Authenticating..."
firebase login
gcloud auth login

# Step 3: Set project ID
PROJECT_ID="your-project-id" # Replace with your Firebase project ID
echo "Setting project to $PROJECT_ID..."
firebase use $PROJECT_ID
gcloud config set project $PROJECT_ID

# Step 4: Install dependencies
echo "Installing dependencies..."
cd functions
npm install
cd ..

# Step 5: Build TypeScript
echo "Building TypeScript..."
cd functions
npm run build
cd ..

# Step 6: Set environment variables
echo "Setting environment variables..."
firebase functions:config:set openai.key="$OPENAI_API_KEY" use_xxhash="false" # Set OPENAI_API_KEY in environment or replace here

# Step 7: Create Cloud Tasks queue
echo "Creating Cloud Tasks queue..."
gcloud tasks queues create audio-processing-queue \
  --location=us-central1 \
  --max-dispatches-per-second=10 \
  --max-concurrent-dispatches=5 \
  --max-attempts=5 \
  --min-backoff=10s \
  --max-backoff=300s || echo "Queue already exists"

# Step 8: Grant permissions to service account
echo "Granting permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$PROJECT_ID@appspot.gserviceaccount.com \
  --role=roles/cloudtasks.enqueuer
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member=serviceAccount:$PROJECT_ID@appspot.gserviceaccount.com \
  --role=roles/iam.serviceAccountTokenCreator

# Step 9: Set Storage lifecycle rule
echo "Setting Storage lifecycle rule..."
cat > lifecycle.json << EOL
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": {
        "age": 7,
        "matchesPrefix": "audio/"
      }
    }
  ]
}
EOL
gsutil lifecycle set lifecycle.json gs://$PROJECT_ID.appspot.com
rm lifecycle.json

# Step 10: Deploy Firebase Functions and rules
echo "Deploying Firebase Functions and rules..."
firebase deploy --only functions,firestore:rules,storage:rules

# Step 11: Verify deployment
echo "Verifying deployment..."
curl -s https://us-central1-$PROJECT_ID.cloudfunctions.net/api/test | grep -q "API is running" && echo "API is running" || { echo "Deployment verification failed"; exit 1; }

echo "Deployment completed successfully"