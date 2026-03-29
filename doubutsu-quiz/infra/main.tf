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

# --- Secret Manager ---

resource "google_secret_manager_secret" "anthropic_api_key" {
  secret_id = "doubutsu-quiz-anthropic-api-key"

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
  secret_id = "doubutsu-quiz-google-oauth-client-secret"

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
  secret_id = "doubutsu-quiz-jwt-signing-key"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "jwt_signing_key" {
  secret      = google_secret_manager_secret.jwt_signing_key.id
  secret_data = var.jwt_signing_key
}

# --- Cloud Run service account ---

resource "google_service_account" "app" {
  account_id   = "doubutsu-quiz"
  display_name = "doubutsu-quiz Cloud Run"
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
  repository_id = "doubutsu-quiz"
  format        = "DOCKER"
  description   = "Docker images for doubutsu-quiz"

  depends_on = [google_project_service.apis]
}

# --- Cloud Run Service ---

resource "google_cloud_run_v2_service" "app" {
  name     = "doubutsu-quiz"
  location = var.region

  template {
    service_account = google_service_account.app.email

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/doubutsu-quiz/app:latest"

      ports {
        container_port = 8080
      }

      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_oauth_client_id
      }

      env {
        name  = "FRONTEND_URL"
        value = ""
      }

      env {
        name  = "VOICEVOX_URL"
        value = google_cloud_run_v2_service.voicevox.uri
      }

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
      min_instance_count = 0
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

# --- VOICEVOX Engine (Cloud Run) ---

resource "google_cloud_run_v2_service" "voicevox" {
  name     = "doubutsu-quiz-voicevox"
  location = var.region

  template {
    containers {
      image = "voicevox/voicevox_engine:cpu-latest"

      ports {
        container_port = 50021
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "4Gi"
        }
      }

      startup_probe {
        http_get {
          path = "/version"
          port = 50021
        }
        initial_delay_seconds = 10
        period_seconds        = 5
        failure_threshold     = 10
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    timeout = "300s"
  }

  depends_on = [google_project_service.apis]
}

# VOICEVOX: internal access only (from doubutsu-quiz app)
resource "google_cloud_run_v2_service_iam_member" "voicevox_invoker" {
  name     = google_cloud_run_v2_service.voicevox.name
  location = google_cloud_run_v2_service.voicevox.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.app.email}"
}

# --- Allow unauthenticated access (Cloud Run level) ---
# App-level protection: Google OAuth login required for /api/* endpoints

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.app.name
  location = google_cloud_run_v2_service.app.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
