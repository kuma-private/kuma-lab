output "service_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.app.uri
}

output "voicevox_url" {
  description = "VOICEVOX Engine Cloud Run URL"
  value       = google_cloud_run_v2_service.voicevox.uri
}

output "artifact_registry" {
  description = "Docker registry URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/doubutsu-quiz"
}
