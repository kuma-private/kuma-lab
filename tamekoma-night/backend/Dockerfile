# Build context: tamekoma-night/ (run: docker build -f backend/Dockerfile .)

# Stage 1: Build SPA
FROM node:22-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# Stage 2: Build F# API
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS backend
WORKDIR /src
COPY backend/ .
RUN dotnet publish src/TamekomaNight.Api/TamekomaNight.Api.fsproj -c Release -o /app

# Stage 3: Runtime
FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY --from=backend /app .
COPY --from=frontend /frontend/build ./wwwroot
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "TamekomaNight.Api.dll"]
