{{/*
Expand the name of the chart.
*/}}
{{- define "tarnished.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "tarnished.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "tarnished.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "tarnished.labels" -}}
helm.sh/chart: {{ include "tarnished.chart" . }}
{{ include "tarnished.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "tarnished.selectorLabels" -}}
app.kubernetes.io/name: {{ include "tarnished.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "tarnished.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "tarnished.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Determine deployment strategy based on database mode.
Recreate for SQLite (single pod), RollingUpdate for PostgreSQL.
*/}}
{{- define "tarnished.deploymentStrategy" -}}
{{- if .Values.postgresql.enabled }}
type: RollingUpdate
rollingUpdate:
  maxSurge: 25%
  maxUnavailable: 25%
{{- else }}
type: Recreate
{{- end }}
{{- end }}
