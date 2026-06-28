import type { ReactDoctorConfig } from "react-doctor/api";

export default {
  exclude: [
    ".claude/**",
    "ds-bundle/**",
    "pi/**",
    "dist/**",
    "release/**",
    "node_modules/**",
    ".design-sync/**",
    "**/*.d.ts"
  ],
  ignore: {
    files: [
      ".claude/**",
      "ds-bundle/**",
      "pi/**",
      "dist/**",
      "release/**",
      "node_modules/**",
      ".design-sync/**",
      "**/*.d.ts"
    ],
    rules: [
      "socket/low-supply-chain-score"
    ]
  },
  rules: {
    "socket/low-supply-chain-score": "off"
  },
  supplyChain: {
    minScore: 35,
    severity: "warning"
  }
} satisfies ReactDoctorConfig;
