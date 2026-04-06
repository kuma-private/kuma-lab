#!/bin/bash
set -euo pipefail

# Cadenza.fm deployment script
# Builds the Docker image via Cloud Build and applies Terraform infrastructure.

PROJECT_ID="kuma-lab"
REGION="asia-northeast1"
REPO="tamekoma-night"
SERVICE_NAME="cadenza-fm"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:latest"

echo "=== Building Cadenza.fm with Cloud Build ==="
gcloud builds submit \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --config=cloudbuild.yaml \
  --substitutions="_IMAGE=${IMAGE}" \
  .

echo "=== Applying Terraform ==="
cd infra
terraform apply -auto-approve

echo "=== Cadenza.fm deployment complete ==="
terraform output service_url
