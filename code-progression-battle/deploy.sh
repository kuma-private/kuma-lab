#!/bin/bash
set -euo pipefail

PROJECT_ID="kuma-lab"
REGION="asia-northeast1"
REPO="chord-battle"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:latest"

echo "=== Building Docker image ==="
docker build -f backend/Dockerfile -t "${IMAGE}" .

echo "=== Pushing to Artifact Registry ==="
docker push "${IMAGE}"

echo "=== Applying Terraform ==="
cd infra
terraform apply -auto-approve

echo "=== Done ==="
terraform output service_url
