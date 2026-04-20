import { AnimationBlueprint } from './types';

export const sampleBlueprint: AnimationBlueprint = {
  fileTitle: "auth.ts",
  blockLabel: "refreshToken()",
  narration: "This function checks if the JWT token is expired and requests a new one from the server",
  audioDurationMs: 18000,
  scenes: [
    {
      type: "textpop",
      headline: "Token Refresh Flow",
      subtext: "Keeping users logged in silently",
      emoji: "🔐",
    },
    {
      type: "api-request",
      method: "POST",
      endpoint: "/auth/refresh",
      requestBody: '{"refreshToken": "eyJhb..."}',
      statusCode: 200,
      responseBody: '{"token": "eyJhbGci...", "expiresIn": 3600}',
    },
    {
      type: "error-flow",
      title: "Missing Secret Check",
      trySteps: ["Read SECRET_KEY", "Validate not empty", "Sign JWT"],
      errorType: "EnvironmentError",
      catchAction: "Throw startup error",
    },
    {
      type: "env-config",
      title: "Flask Config",
      appName: "Flask App",
      envVars: [
        { key: "SECRET_KEY", value: "abc123", secret: true },
        { key: "DATABASE_URL", value: "postgres://localhost/db" },
        { key: "DEBUG", value: "false" },
      ],
    },
    {
      type: "success",
      title: "Token Refreshed",
      returnType: "TokenResponse",
      fields: [
        { key: "accessToken", value: "eyJhbGci..." },
        { key: "expiresIn", value: "3600" },
        { key: "tokenType", value: "Bearer" },
      ],
      executionTime: "184ms",
    },
  ],
};
