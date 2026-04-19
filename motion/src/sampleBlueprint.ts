import { AnimationBlueprint } from './types';

export const sampleBlueprint: AnimationBlueprint = {
  fileTitle: "auth.ts",
  blockLabel: "refreshToken()",
  narration: "This function checks if the JWT token is expired and requests a new one from the server",
  durationPerScene: 4,
  scenes: [
    {
      type: "textpop",
      headline: "Token Refresh Flow",
      subtext: "Keeping users logged in silently",
      emoji: "🔐",
    },
    {
      type: "flow",
      title: "Step by Step",
      steps: [
        { label: "Check expiry", color: "#1e3a5f" },
        { label: "Token expired?", color: "#5f3a1e" },
        { label: "Request new token", color: "#1e5f3a" },
        { label: "Store & return", color: "#3a1e5f" },
      ],
    },
    {
      type: "arrow",
      from: "Client App",
      to: "Auth Server",
      label: "POST /refresh",
      returnLabel: "new JWT token",
    },
    {
      type: "async",
      title: "refreshToken() timeline",
      steps: [
        { label: "decode current token", duration: "~0ms", isAwait: false },
        { label: "check exp field", duration: "~0ms", isAwait: false },
        { label: "POST /auth/refresh", duration: "~180ms", isAwait: true },
        { label: "save to localStorage", duration: "~0ms", isAwait: false },
        { label: "return new token", duration: "done", isAwait: false },
      ],
    },
    {
      type: "box",
      title: "Returns: TokenResponse",
      items: [
        { label: "accessToken", value: "eyJhbGci...", highlight: true },
        { label: "expiresIn", value: "3600" },
        { label: "tokenType", value: "Bearer" },
      ],
    },
  ],
};
