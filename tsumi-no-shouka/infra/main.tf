terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# --- Enable APIs ---

resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# --- Secret Manager (secrets never in env vars as plain text) ---

resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "anthropic-api-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "anthropic_api_key" {
  secret      = google_secret_manager_secret.anthropic_api_key.id
  secret_data = var.anthropic_api_key
}

resource "google_secret_manager_secret" "google_oauth_client_secret" {
  secret_id = "google-oauth-client-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "google_oauth_client_secret" {
  secret      = google_secret_manager_secret.google_oauth_client_secret.id
  secret_data = var.google_oauth_client_secret
}

resource "google_secret_manager_secret" "jwt_signing_key" {
  secret_id = "jwt-signing-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "jwt_signing_key" {
  secret      = google_secret_manager_secret.jwt_signing_key.id
  secret_data = var.jwt_signing_key
}

# --- Cloud Run service account (to access secrets) ---

resource "google_service_account" "app" {
  account_id   = "tsumi-no-shouka"
  display_name = "tsumi-no-shouka Cloud Run"
}

resource "google_secret_manager_secret_iam_member" "app_anthropic" {
  secret_id = google_secret_manager_secret.anthropic_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}

resource "google_secret_manager_secret_iam_member" "app_oauth" {
  secret_id = google_secret_manager_secret.google_oauth_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}

resource "google_secret_manager_secret_iam_member" "app_jwt" {
  secret_id = google_secret_manager_secret.jwt_signing_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"
}

# --- Artifact Registry ---

resource "google_artifact_registry_repository" "app" {
  location      = var.region
  repository_id = "tsumi-no-shouka"
  format        = "DOCKER"
  description   = "Docker images for tsumi-no-shouka"

  depends_on = [google_project_service.apis]
}

# --- Cloud Run Service ---

resource "google_cloud_run_v2_service" "app" {
  name     = "tsumi-no-shouka"
  location = var.region

  template {
    service_account = google_service_account.app.email

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/tsumi-no-shouka/app:latest"

      ports {
        container_port = 8080
      }

      # Non-sensitive env vars
      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_oauth_client_id
      }

      env {
        name  = "FRONTEND_URL"
        value = ""  # Same origin (SPA)
      }

      # Sensitive env vars from Secret Manager
      env {
        name = "ANTHROPIC_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.anthropic_api_key.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "GOOGLE_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.google_oauth_client_secret.secret_id
            version = "latest"
          }
        }
      }

      env {
        name = "JWT_SIGNING_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_signing_key.secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      startup_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 5
        period_seconds        = 3
      }
    }

    scaling {
      min_instance_count = 0  # Scale to zero when idle
      max_instance_count = 2
    }
  }

  depends_on = [
    google_project_service.apis,
    google_artifact_registry_repository.app,
    google_secret_manager_secret_version.anthropic_api_key,
    google_secret_manager_secret_version.google_oauth_client_secret,
    google_secret_manager_secret_version.jwt_signing_key,
  ]
}

# --- Allow unauthenticated access (Cloud Run level) ---
# App-level protection: Google OAuth login required for /api/* endpoints

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
