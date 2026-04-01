#!/bin/bash
set -euo pipefail

PROJECT_ID="kuma-lab"
REGION="asia-northeast1"
REPO="chord-battle"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:latest"

echo "=== Building with Cloud Build ==="
gcloud builds submit \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --config=cloudbuild.yaml \
  --substitutions="_IMAGE=${IMAGE}" \
  .

echo "=== Applying Terraform ==="
cd infra
terraform apply -auto-approve

echo "=== Done ==="
terraform output service_url
