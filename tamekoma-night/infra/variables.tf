variable "project_id" {
  description = "GCP project ID"
  type        = string
  default     = "kuma-lab"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "asia-northeast1"
}

variable "anthropic_api_key" {
  description = "Anthropic API key"
  type        = string
  sensitive   = true
}

variable "google_oauth_client_id" {
  description = "Google OAuth 2.0 Client ID"
  type        = string
}

variable "google_oauth_client_secret" {
  description = "Google OAuth 2.0 Client Secret"
  type        = string
  sensitive   = true
}

variable "jwt_signing_key" {
  description = "JWT signing key for session tokens"
  type        = string
  sensitive   = true
}
