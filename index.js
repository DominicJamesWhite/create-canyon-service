const functions = require("@google-cloud/functions-framework");
const { ServicesClient } = require("@google-cloud/run").v2;
const { GoogleAuth } = require("google-auth-library");

// Initialize clients
const runClient = new ServicesClient();
const auth = new GoogleAuth();

// Define the HTTP function
functions.http("createCloudRunService", async (req, res) => {
  // Set CORS headers for preflight requests and actual requests
  res.set("Access-Control-Allow-Origin", "*"); // Adjust for specific origins if needed
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    // Send response to OPTIONS requests
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  // --- Input Validation ---
  const { serviceName, HUMANITEC_TOKEN, GOOGLE_API_KEY } = req.body;
  const region = "us-central1"; // As specified earlier

  if (!serviceName || typeof serviceName !== "string") {
    res.status(400).send('Missing or invalid "serviceName" in request body.');
    return;
  }
  if (!HUMANITEC_TOKEN || typeof HUMANITEC_TOKEN !== "string") {
    res
      .status(400)
      .send('Missing or invalid "HUMANITEC_TOKEN" in request body.');
    return;
  }
  if (!GOOGLE_API_KEY || typeof GOOGLE_API_KEY !== "string") {
    res
      .status(400)
      .send('Missing or invalid "GOOGLE_API_KEY" in request body.');
    return;
  }

  let projectId;
  try {
    projectId = await auth.getProjectId();
  } catch (err) {
    console.error("Error getting project ID:", err);
    res.status(500).send("Could not determine Google Cloud Project ID.");
    return;
  }

  const parent = `projects/${projectId}/locations/${region}`;
  const serviceId = serviceName; // Use the provided name as the service ID
  const fixedContainerImage = `us-central1-docker.pkg.dev/${projectId}/github-actions-builds/canyonchat:17f96adf511309c19f9d5e640f0b8dc3fbdefc06`;

  console.log(
    `Attempting to create service "${serviceId}" in ${parent} with image "${fixedContainerImage}"`
  );

  // --- Format Environment Variables ---
  // Read the service account key JSON from the environment variable populated by Secret Manager
  const serviceAccountKeyJson = process.env.GOOGLE_ENVIRONMENT_VARIABLES;

  if (!serviceAccountKeyJson) {
    console.error(
      "GOOGLE_ENVIRONMENT_VARIABLES is not set. Ensure the secret is mounted correctly."
    );
    res
      .status(500)
      .send("Server configuration error: Missing service account key.");
    return;
  }

  const envVars = [
    { name: "ENABLE_MCP", value: "true" },
    { name: "DEFAULT_MODEL", value: "gemini-2.5-pro-preview-03-25" },
    { name: "HUMANITEC_TOKEN", value: HUMANITEC_TOKEN },
    { name: "GOOGLE_API_KEY", value: GOOGLE_API_KEY },
    // Pass the key content itself as an environment variable to the new service
    { name: "GCP_SERVICE_ACCOUNT_KEY_JSON", value: serviceAccountKeyJson },
  ];

  // --- Construct Service Definition ---
  const service = {
    template: {
      containers: [
        {
          image: fixedContainerImage,
          env: envVars,
          // You might want to add ports, resources (CPU/memory) here if needed
          // ports: [{ containerPort: 8080 }], // Example: if your container listens on 8080
        },
      ],
      // Optional: Specify scaling, VPC access, etc.
    },
    // Optional: Add labels or annotations
    // labels: { created_by: 'cloud-function' }
  };

  try {
    // --- Create Cloud Run Service ---
    console.log(`Creating service: ${serviceId}`);
    const [operation] = await runClient.createService({
      parent: parent,
      service: service,
      serviceId: serviceId,
    });

    console.log(`Waiting for service creation operation: ${operation.name}`);
    const [serviceResponse] = await operation.promise();
    const serviceFullName = serviceResponse.name; // e.g., projects/PROJECT_ID/locations/REGION/services/SERVICE_ID
    const serviceUrl = serviceResponse.uri;
    console.log(
      `Service "${serviceFullName}" created successfully at ${serviceUrl}`
    );

    // --- Make Service Public (Allow Unauthenticated) ---
    console.log(`Setting IAM policy for public access on ${serviceFullName}`);
    const [policy] = await runClient.getIamPolicy({
      resource: serviceFullName,
    });

    // Add the binding for allUsers
    policy.bindings.push({
      role: "roles/run.invoker",
      members: ["allUsers"],
    });

    await runClient.setIamPolicy({
      resource: serviceFullName,
      policy: policy,
    });
    console.log(`IAM policy updated for public access.`);

    // --- Send Success Response ---
    res.status(200).json({
      message: `Service ${serviceName} created successfully and made public.`,
      serviceUrl: serviceUrl,
      serviceName: serviceFullName,
    });
  } catch (err) {
    console.error(`Error creating/configuring service ${serviceName}:`, err);
    // Provide more specific error messages if possible
    let errorMessage = `Failed to create or configure service ${serviceName}.`;
    if (err.code === 6) {
      // ALREADY_EXISTS
      errorMessage = `Service ${serviceName} already exists in ${region}.`;
      res.status(409).send(errorMessage);
    } else if (err.code === 7) {
      // PERMISSION_DENIED
      errorMessage = `Permission denied. Ensure the function's service account has necessary roles (Cloud Run Admin, IAM Policy Admin/Setter).`;
      res.status(403).send(errorMessage);
    } else {
      res.status(500).send(`${errorMessage} Error: ${err.message}`);
    }
  }
});
