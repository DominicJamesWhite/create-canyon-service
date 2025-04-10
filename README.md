# Create Cloud Run Service Function

This Google Cloud Function is triggered via an HTTP POST request to automatically create a new, publicly accessible Google Cloud Run service.

## Functionality

- **Trigger:** HTTP POST request.
- **Region:** Creates services in `us-central1`.
- **Container Image:** Uses a fixed image: `us-central1-docker.pkg.dev/PROJECT_ID/github-actions-builds/canyonchat:17f96adf511309c19f9d5e640f0b8dc3fbdefc06`. The `PROJECT_ID` is determined automatically from the function's execution environment.
- **Inputs:** Requires a JSON payload in the request body with the following string properties:
  - `serviceName`: The desired name for the new Cloud Run service.
  - `HUMANITEC_TOKEN`: A Humanitec token.
  - `GOOGLE_API_KEY`: A Google API key.
- **Output:**
  - On success: Creates the Cloud Run service, makes it publicly accessible (allows unauthenticated invocation), and returns a `200 OK` status with a JSON response containing the `serviceUrl` and `serviceName` (full resource path, e.g., `projects/PROJECT_ID/locations/REGION/services/SERVICE_ID`).
  - On failure: Returns an appropriate HTTP error status (e.g., 400, 403, 409, 500) and a message indicating the cause of the error.
- **Environment Variables (for the _created_ service):** Sets the following environment variables on the new Cloud Run service:
  - `ENABLE_MCP=true`
  - `DEFAULT_MODEL=gemini-2.5-pro-preview-03-25`
  - `HUMANITEC_TOKEN`: Value from the input payload.
  - `GOOGLE_API_KEY`: Value from the input payload.

## Prerequisites

- Node.js version `>=18` (as specified in `package.json`).
- A Google Cloud Project.
- **Permissions:** The service account running this Cloud Function needs sufficient IAM permissions in the target Google Cloud project and region (`us-central1`) to:
  - Get the Project ID (`resourcemanager.projects.get`).
  - Create Cloud Run services (`run.services.create`).
  - Get and Set IAM policies on Cloud Run services (`run.services.getIamPolicy`, `run.services.setIamPolicy`).
  - Common roles that grant these permissions include "Cloud Run Admin" (`roles/run.admin`) and "IAM Security Admin" (`roles/iam.securityAdmin`), or a custom role with the specific permissions listed.

## Deployment

1.  Ensure you have the Google Cloud SDK (`gcloud`) installed and configured.
2.  Navigate to the project directory (`create-cloud-run-service-func`).
3.  Deploy the function using the `gcloud` command:

    ```bash
    gcloud functions deploy createCloudRunService \
      --runtime nodejs18 \
      --trigger-http \
      --allow-unauthenticated \
      --entry-point createCloudRunService \
      --region <YOUR_FUNCTION_REGION> \
      --source . \
      --service-account <YOUR_FUNCTION_SERVICE_ACCOUNT_EMAIL>
    ```

    - Replace `<YOUR_FUNCTION_REGION>` with the region where you want to deploy the _function itself_ (e.g., `us-central1`).
    - Replace `<YOUR_FUNCTION_SERVICE_ACCOUNT_EMAIL>` with the email address of the service account the function should run as. This service account needs the permissions listed in the Prerequisites section.
    - The `--allow-unauthenticated` flag here makes the _function's_ HTTP endpoint public. The function code itself handles making the _created Cloud Run service_ public.

## Usage Example

1.  After successful deployment, obtain the function's trigger URL from the `gcloud` output or the Google Cloud Console.
2.  Send a POST request to the trigger URL using `curl` or any HTTP client:

    ```bash
    curl -X POST <YOUR_FUNCTION_TRIGGER_URL> \
      -H "Content-Type: application/json" \
      -d '{
            "serviceName": "my-new-canyon-service",
            "HUMANITEC_TOKEN": "your-humanitec-token-here",
            "GOOGLE_API_KEY": "your-google-api-key-here"
          }'
    ```

    - Replace `<YOUR_FUNCTION_TRIGGER_URL>` with the actual URL.
    - Replace the placeholder values for `serviceName`, `HUMANITEC_TOKEN`, and `GOOGLE_API_KEY` with your desired values.

3.  If successful, the response will be a JSON object like:

    ```json
    {
      "message": "Service my-new-canyon-service created successfully and made public.",
      "serviceUrl": "https://my-new-canyon-service-xxxxxxxxxx-uc.a.run.app",
      "serviceName": "projects/your-gcp-project-id/locations/us-central1/services/my-new-canyon-service"
    }
    ```
